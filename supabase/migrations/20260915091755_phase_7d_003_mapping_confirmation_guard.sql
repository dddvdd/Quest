BEGIN;
CREATE OR REPLACE FUNCTION geography_internal.save_mapping(p_context text,p_entity uuid,p_field text,p_status text,p_target uuid,p_hash text,p_previous uuid,p_note text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public AS $$
DECLARE s jsonb; v uuid; hash text; candidates jsonb; old public.geography_mappings; result public.geography_mappings; latest public.geography_mappings;
BEGIN
 IF NOT geography_internal.is_admin() THEN RAISE EXCEPTION 'Active admin required' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_context||':'||p_entity::text||':'||p_field,0));
 SELECT id INTO v FROM public.geography_reference_versions WHERE is_current FOR SHARE;
 IF v IS NULL THEN RAISE EXCEPTION 'Current reference unavailable'; END IF;
 s := geography_internal.source_snapshot(p_context,p_entity);
 hash := encode(sha256(convert_to(s::text,'UTF8')),'hex');
 IF hash IS DISTINCT FROM p_hash THEN RAISE EXCEPTION 'Source changed; reload candidates' USING ERRCODE='40001'; END IF;
 candidates := geography_internal.exact_candidates(s,p_field,v);
 IF p_status IS NULL OR p_status NOT IN ('suggested','ambiguous','unresolved','not_applicable','confirmed') OR length(p_note)>500 THEN RAISE EXCEPTION 'Invalid review state'; END IF;
 IF p_status IN ('suggested','confirmed') THEN
  IF p_target IS NULL OR NOT (candidates->'candidate_ids' @> jsonb_build_array(p_target))
    OR (p_status IN ('suggested','confirmed') AND candidates->>'status'<>'suggested') THEN RAISE EXCEPTION 'Target or parent context invalid'; END IF;
 ELSE
  IF p_target IS NOT NULL OR (p_status='not_applicable' AND candidates->>'status'<>'not_applicable')
    OR (p_status='ambiguous' AND candidates->>'status'<>'ambiguous') THEN RAISE EXCEPTION 'State incompatible with candidates'; END IF;
 END IF;
 SELECT * INTO latest FROM public.geography_mappings WHERE source_context=p_context AND source_entity_id=p_entity AND source_field=p_field ORDER BY revision DESC LIMIT 1 FOR UPDATE;
 IF p_previous IS NULL THEN
  IF p_status='confirmed' THEN RAISE EXCEPTION 'Confirmation requires an existing mapping'; END IF;
  IF latest.id IS NOT NULL THEN
   IF latest.source_hash=hash AND latest.reference_version_id=v AND latest.mapping_status=p_status AND latest.mapped_geography_unit_id IS NOT DISTINCT FROM p_target THEN RETURN to_jsonb(latest); END IF;
   RAISE EXCEPTION 'Existing mapping requires previous revision';
  END IF;
 ELSE
  SELECT * INTO old FROM public.geography_mappings WHERE id=p_previous FOR UPDATE;
  IF old.id IS NULL OR latest.id IS DISTINCT FROM old.id OR old.source_context<>p_context OR old.source_entity_id<>p_entity OR old.source_field<>p_field THEN
   RAISE EXCEPTION 'Mapping revision missing or superseded' USING ERRCODE='40001';
  END IF;
  IF old.mapping_status='confirmed' AND (old.source_hash=hash AND old.reference_version_id=v) THEN
   RAISE EXCEPTION 'Confirmed mapping requires changed source or reference before review';
  END IF;
  IF (old.source_hash<>hash OR old.reference_version_id<>v) AND p_status='confirmed' THEN RAISE EXCEPTION 'Changed evidence requires a new candidate review'; END IF;
 END IF;
 INSERT INTO public.geography_mappings(source_context,source_entity_id,source_field,raw_value,normalized_value,source_snapshot,source_hash,reference_version_id,mapped_geography_unit_id,mapping_status,mapping_method,reviewed_by,notes,revision,previous_mapping_id)
 VALUES(p_context,p_entity,p_field,s->>p_field,geography_internal.normalize_label(s->>p_field),s,hash,v,p_target,p_status,
   CASE WHEN p_status='confirmed' THEN 'human_confirmed' WHEN p_status='suggested' THEN 'deterministic_exact' ELSE 'reviewed_unresolved' END,
   auth.uid(),p_note,coalesce(latest.revision,0)+1,p_previous) RETURNING * INTO result;
 RETURN to_jsonb(result);
END $$;
COMMIT;
