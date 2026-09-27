BEGIN;
CREATE FUNCTION geography_internal.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
 SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin' AND is_active)
$$;
REVOKE ALL ON FUNCTION geography_internal.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION geography_internal.is_admin() TO authenticated;

CREATE TABLE public.geography_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_context text NOT NULL CHECK (source_context IN ('residence_geography','preferred_work_geography','vacancy_geography','employer_geography','employer_branch_geography','event_geography')),
  source_entity_id uuid NOT NULL,
  source_field text NOT NULL CHECK (source_field IN ('region','province','municipality_city','barangay','location')),
  raw_value text,
  normalized_value text,
  source_snapshot jsonb NOT NULL,
  source_hash text NOT NULL CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  reference_version_id uuid NOT NULL REFERENCES public.geography_reference_versions(id),
  mapped_geography_unit_id uuid,
  mapping_status text NOT NULL CHECK (mapping_status IN ('suggested','ambiguous','unresolved','not_applicable','confirmed')),
  mapping_method text NOT NULL CHECK (mapping_method IN ('deterministic_exact','human_confirmed','reviewed_unresolved')),
  reviewed_by uuid NOT NULL REFERENCES public.profiles(id),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  notes text CHECK (length(notes)<=500),
  revision integer NOT NULL CHECK (revision>0),
  previous_mapping_id uuid UNIQUE REFERENCES public.geography_mappings(id),
  UNIQUE (source_context,source_entity_id,source_field,revision),
  FOREIGN KEY (mapped_geography_unit_id,reference_version_id) REFERENCES public.geography_units(id,reference_version_id),
  CHECK ((mapping_status IN ('suggested','confirmed') AND mapped_geography_unit_id IS NOT NULL) OR
    (mapping_status IN ('ambiguous','unresolved','not_applicable') AND mapped_geography_unit_id IS NULL))
);
CREATE INDEX geography_entity_lookup ON public.geography_mappings (source_context,source_entity_id,source_field,revision DESC);
ALTER TABLE public.geography_mappings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.geography_mappings FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.geography_mappings TO authenticated;
CREATE POLICY geography_mapping_admin_read ON public.geography_mappings FOR SELECT TO authenticated USING ((SELECT geography_internal.is_admin()));

-- Immutable mapping revisions preserve raw evidence and review history.
CREATE FUNCTION geography_internal.reject_mapping_rewrite() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Mapping history is immutable; append a reviewed revision'; END $$;
CREATE TRIGGER geography_mapping_immutable BEFORE UPDATE OR DELETE ON public.geography_mappings
FOR EACH ROW EXECUTE FUNCTION geography_internal.reject_mapping_rewrite();

CREATE FUNCTION geography_internal.source_snapshot(p_context text,p_entity uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog,public AS $$
DECLARE s jsonb;
BEGIN
 CASE p_context
 WHEN 'residence_geography' THEN
  SELECT jsonb_build_object('province',province,'municipality_city',municipality_city,'barangay',barangay) INTO s FROM public.jobseeker_profiles WHERE participant_id=p_entity FOR SHARE;
 WHEN 'preferred_work_geography' THEN
  SELECT jsonb_build_object('region',region,'province',province,'municipality_city',municipality_city) INTO s FROM public.jobseeker_location_preferences WHERE id=p_entity FOR SHARE;
 WHEN 'vacancy_geography' THEN
  SELECT jsonb_build_object('province',province,'municipality_city',municipality_city) INTO s FROM public.vacancy_definitions WHERE id=p_entity FOR SHARE;
 WHEN 'employer_geography' THEN
  SELECT jsonb_build_object('province',province,'municipality_city',municipality_city,'barangay',barangay) INTO s FROM public.employers WHERE id=p_entity FOR SHARE;
 WHEN 'employer_branch_geography' THEN
  SELECT jsonb_build_object('province',branch_province,'municipality_city',branch_municipality_city,'barangay',branch_barangay) INTO s FROM public.employers WHERE id=p_entity AND has_cagayan_branch FOR SHARE;
 WHEN 'event_geography' THEN
  SELECT jsonb_build_object('location',location) INTO s FROM public.events WHERE id=p_entity FOR SHARE;
 ELSE RAISE EXCEPTION 'Unsupported geography context';
 END CASE;
 IF s IS NULL THEN RAISE EXCEPTION 'Source not found'; END IF;
 RETURN s;
END $$;

CREATE FUNCTION geography_internal.exact_candidates(p_snapshot jsonb,p_field text,p_version uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = pg_catalog,public AS $$
DECLARE label text; all_ids uuid[]; valid_ids uuid[]; missing_parent boolean; parent_fields text[];
BEGIN
 IF NOT (p_snapshot ? p_field) THEN RAISE EXCEPTION 'Unsupported source field'; END IF;
 label := geography_internal.normalize_label(p_snapshot->>p_field);
 IF label IS NULL THEN RETURN jsonb_build_object('status','not_applicable','reason','missing_value','candidate_ids','[]'::jsonb); END IF;
 parent_fields := CASE p_field WHEN 'barangay' THEN ARRAY['region','province','municipality_city'] WHEN 'municipality_city' THEN ARRAY['region','province'] WHEN 'province' THEN ARRAY['region'] ELSE ARRAY[]::text[] END;
 missing_parent := p_field='barangay' AND geography_internal.normalize_label(p_snapshot->>'municipality_city') IS NULL;
 WITH RECURSIVE hits AS (
  SELECT u.* FROM public.geography_units u WHERE u.reference_version_id=p_version
   AND (u.normalized_name=label OR EXISTS (SELECT 1 FROM public.geography_aliases a WHERE a.reference_version_id=p_version AND a.geography_unit_id=u.id AND a.is_active AND a.normalized_alias=label))
   AND (CASE p_field WHEN 'region' THEN u.geographic_level='Reg' WHEN 'province' THEN u.geographic_level='Prov'
    WHEN 'municipality_city' THEN u.geographic_level IN ('City','Mun') WHEN 'barangay' THEN u.geographic_level='Bgy'
    WHEN 'location' THEN u.geographic_level IN ('Reg','Prov','City','Mun') ELSE false END)
 ), ancestors AS (
  SELECT h.id AS candidate_id,u.id,u.parent_id,u.geographic_level,u.normalized_name FROM hits h JOIN public.geography_units u ON u.id=h.parent_id
  UNION ALL SELECT a.candidate_id,u.id,u.parent_id,u.geographic_level,u.normalized_name FROM ancestors a JOIN public.geography_units u ON u.id=a.parent_id
 ), valid AS (
  SELECT h.id FROM hits h WHERE NOT missing_parent AND NOT EXISTS (
   SELECT 1 FROM unnest(parent_fields) f WHERE geography_internal.normalize_label(p_snapshot->>f) IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM ancestors a WHERE a.candidate_id=h.id
    AND a.geographic_level=CASE f WHEN 'province' THEN 'Prov' WHEN 'region' THEN 'Reg' ELSE 'City' END
    AND (a.normalized_name=geography_internal.normalize_label(p_snapshot->>f) OR EXISTS (
     SELECT 1 FROM public.geography_aliases ga WHERE ga.geography_unit_id=a.id AND ga.is_active AND ga.normalized_alias=geography_internal.normalize_label(p_snapshot->>f))))
   AND NOT (f='municipality_city' AND EXISTS (SELECT 1 FROM ancestors a WHERE a.candidate_id=h.id AND a.geographic_level='Mun' AND
    (a.normalized_name=geography_internal.normalize_label(p_snapshot->>f) OR EXISTS (SELECT 1 FROM public.geography_aliases ga WHERE ga.geography_unit_id=a.id AND ga.is_active AND ga.normalized_alias=geography_internal.normalize_label(p_snapshot->>f)))))
  )
 ) SELECT ARRAY(SELECT id FROM hits ORDER BY official_code),ARRAY(SELECT id FROM valid ORDER BY id) INTO all_ids,valid_ids;
 RETURN jsonb_build_object('status',CASE WHEN cardinality(valid_ids)=1 THEN 'suggested' WHEN cardinality(valid_ids)>1 THEN 'ambiguous' ELSE 'unresolved' END,
  'reason',CASE WHEN missing_parent THEN 'missing_parent' WHEN cardinality(all_ids)>0 AND cardinality(valid_ids)=0 THEN 'parent_conflict' WHEN cardinality(all_ids)=0 THEN 'no_exact_match' WHEN cardinality(valid_ids)>1 THEN 'duplicate_name' ELSE 'deterministic_exact' END,
  'candidate_ids',to_jsonb(valid_ids));
END $$;

CREATE FUNCTION geography_internal.mapping_candidates(p_context text,p_entity uuid,p_field text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog,public AS $$
DECLARE s jsonb; v uuid;
BEGIN
 IF NOT geography_internal.is_admin() THEN RAISE EXCEPTION 'Active admin required' USING ERRCODE='42501'; END IF;
 SELECT id INTO v FROM public.geography_reference_versions WHERE is_current;
 IF v IS NULL THEN RAISE EXCEPTION 'Current reference unavailable'; END IF;
 s := geography_internal.source_snapshot(p_context,p_entity);
 RETURN geography_internal.exact_candidates(s,p_field,v) || jsonb_build_object('source_hash',encode(sha256(convert_to(s::text,'UTF8')),'hex'),'reference_version_id',v);
END $$;

CREATE FUNCTION geography_internal.save_mapping(p_context text,p_entity uuid,p_field text,p_status text,p_target uuid,p_hash text,p_previous uuid,p_note text) RETURNS jsonb
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
    OR (p_status='suggested' AND candidates->>'status'<>'suggested') THEN RAISE EXCEPTION 'Target or parent context invalid'; END IF;
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

CREATE FUNCTION public.get_geography_mapping_candidates(p_context text,p_entity uuid,p_field text) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog,public AS $$ SELECT geography_internal.mapping_candidates(p_context,p_entity,p_field) $$;
CREATE FUNCTION public.save_geography_mapping(p_context text,p_entity uuid,p_field text,p_status text,p_target uuid,p_hash text,p_previous uuid DEFAULT NULL,p_note text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path = pg_catalog,public AS $$ SELECT geography_internal.save_mapping(p_context,p_entity,p_field,p_status,p_target,p_hash,p_previous,p_note) $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA geography_internal FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION geography_internal.is_admin(), geography_internal.mapping_candidates(text,uuid,text), geography_internal.save_mapping(text,uuid,text,text,uuid,text,uuid,text) TO authenticated;
REVOKE ALL ON FUNCTION public.get_geography_mapping_candidates(text,uuid,text), public.save_geography_mapping(text,uuid,text,text,uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_geography_mapping_candidates(text,uuid,text), public.save_geography_mapping(text,uuid,text,text,uuid,text,uuid,text) TO authenticated;
COMMENT ON TABLE public.geography_mappings IS 'Private source-specific immutable review revisions; raw evidence retained; canonical analytics and jurisdiction access are not enabled.';
COMMIT;
