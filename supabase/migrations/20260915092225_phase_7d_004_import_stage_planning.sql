BEGIN;
CREATE OR REPLACE FUNCTION geography_internal.import_reference(p_data jsonb, p_make_current boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE v jsonb := p_data->'version'; v_id uuid := (v->>'id')::uuid; n integer; previous public.geography_reference_versions;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('PSGC reference import',0));
  IF jsonb_typeof(p_data->'units') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'units') = 0 THEN
    RAISE EXCEPTION 'Reference units required';
  END IF;
  DROP TABLE IF EXISTS pg_temp.psgc_stage;
  CREATE TEMP TABLE psgc_stage (LIKE public.geography_units INCLUDING DEFAULTS) ON COMMIT DROP;
  INSERT INTO pg_temp.psgc_stage SELECT * FROM jsonb_populate_recordset(NULL::public.geography_units,p_data->'units');
  SELECT count(*) INTO n FROM pg_temp.psgc_stage;
  IF EXISTS (SELECT 1 FROM pg_temp.psgc_stage GROUP BY official_code HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM pg_temp.psgc_stage GROUP BY id HAVING count(*) > 1)
    OR EXISTS (SELECT 1 FROM pg_temp.psgc_stage WHERE reference_version_id IS DISTINCT FROM v_id
      OR official_code IS NULL OR official_code !~ '^[0-9]{10}$' OR name IS NULL OR btrim(name) = ''
      OR normalized_name IS DISTINCT FROM geography_internal.normalize_label(name)) THEN
    RAISE EXCEPTION 'Invalid or duplicate reference unit';
  END IF;
  -- EXISTS has a row goal; measured full-source validation needs indexed parents.
  CREATE UNIQUE INDEX psgc_stage_identity ON pg_temp.psgc_stage(id);
  ANALYZE pg_temp.psgc_stage;
  -- Strict source-supported edges imply acyclicity in both hierarchies.
  IF EXISTS (
    SELECT 1 FROM pg_temp.psgc_stage u LEFT JOIN pg_temp.psgc_stage p ON p.id=u.parent_id
    LEFT JOIN pg_temp.psgc_stage c ON c.id=u.coding_parent_id
    WHERE (u.parent_id IS NULL AND u.structural_kind <> 'Reg')
      OR (u.parent_id IS NOT NULL AND (p.id IS NULL OR p.official_code IS DISTINCT FROM u.parent_code))
      OR (u.coding_parent_id IS NOT NULL AND (c.id IS NULL OR c.official_code IS DISTINCT FROM u.coding_parent_code))
      OR (u.parent_id IS NULL AND u.parent_code IS NOT NULL)
      OR (u.coding_parent_id IS NULL AND u.coding_parent_code IS NOT NULL)
      OR (u.parent_id IS NOT NULL AND NOT (
        (p.structural_kind='Reg' AND u.structural_kind IN ('Prov','City','Mun','special_city_grouping','special_geographic_area')) OR
        (p.structural_kind='Prov' AND u.structural_kind IN ('City','Mun')) OR
        (p.structural_kind='special_city_grouping' AND u.structural_kind='City') OR
        (p.structural_kind='special_geographic_area' AND u.structural_kind='Mun') OR
        (p.structural_kind='City' AND u.structural_kind IN ('SubMun','Bgy')) OR
        (p.structural_kind IN ('Mun','SubMun') AND u.structural_kind='Bgy')))
      OR (u.coding_parent_id IS NOT NULL AND NOT (
        (c.structural_kind='Reg' AND u.structural_kind IN ('Prov','City','Mun','special_city_grouping','special_geographic_area')) OR
        (c.structural_kind='Prov' AND u.structural_kind IN ('City','Mun')) OR
        (c.structural_kind='special_city_grouping' AND u.structural_kind='City') OR
        (c.structural_kind='special_geographic_area' AND u.structural_kind='Mun') OR
        (c.structural_kind='City' AND u.structural_kind IN ('SubMun','Bgy')) OR
        (c.structural_kind IN ('Mun','SubMun') AND u.structural_kind='Bgy')))
      OR (u.city_class IN ('HUC','ICC') AND p.structural_kind IS DISTINCT FROM 'Reg')
  ) THEN RAISE EXCEPTION 'Invalid parent hierarchy'; END IF;
  SELECT * INTO previous FROM public.geography_reference_versions WHERE reference_system=v->>'reference_system' AND version_code=v->>'version_code' FOR UPDATE;
  IF FOUND THEN
    IF previous.id <> v_id OR previous.source_sha256 IS DISTINCT FROM v->>'source_sha256'
      OR previous.reference_date IS DISTINCT FROM (v->>'reference_date')::date
      OR previous.publication_date IS DISTINCT FROM (v->>'publication_date')::date
      OR previous.publication_reference IS DISTINCT FROM v->>'publication_reference'
      OR previous.source_url IS DISTINCT FROM v->>'source_url' OR previous.metadata IS DISTINCT FROM v->'metadata'
      OR (SELECT count(*) FROM public.geography_units WHERE reference_version_id=v_id) <> n
      OR EXISTS (SELECT 1 FROM pg_temp.psgc_stage s LEFT JOIN public.geography_units u ON u.id=s.id WHERE to_jsonb(s) IS DISTINCT FROM to_jsonb(u)) THEN
      RAISE EXCEPTION 'Existing version differs; immutable import conflict';
    END IF;
  ELSE
    INSERT INTO public.geography_reference_versions(id,reference_system,version_code,reference_date,publication_date,publication_reference,source_url,source_sha256,metadata)
    VALUES(v_id,v->>'reference_system',v->>'version_code',(v->>'reference_date')::date,(v->>'publication_date')::date,v->>'publication_reference',v->>'source_url',v->>'source_sha256',v->'metadata');
    INSERT INTO public.geography_units SELECT * FROM pg_temp.psgc_stage;
  END IF;
  IF p_make_current THEN
    UPDATE public.geography_reference_versions SET is_current=false WHERE reference_system='PSGC' AND is_current AND id<>v_id;
    UPDATE public.geography_reference_versions SET is_current=true WHERE id=v_id AND NOT is_current;
  END IF;
  RETURN jsonb_build_object('version_code',v->>'version_code','units',n,'replayed',previous.id IS NOT NULL);
END $$;
COMMIT;
