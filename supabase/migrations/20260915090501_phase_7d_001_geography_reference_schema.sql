BEGIN;
CREATE SCHEMA IF NOT EXISTS geography_internal;
REVOKE ALL ON SCHEMA geography_internal FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA geography_internal TO authenticated;

-- Bounded upload transport, never a canonical/reference version. No client ACL.
CREATE TABLE geography_internal.reference_import_chunks (
  import_id uuid NOT NULL,
  chunk_number integer NOT NULL CHECK (chunk_number >= 0),
  chunk_count integer NOT NULL CHECK (chunk_count > 0),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='array'),
  PRIMARY KEY (import_id,chunk_number)
);
ALTER TABLE geography_internal.reference_import_chunks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON geography_internal.reference_import_chunks FROM PUBLIC,anon,authenticated;

CREATE TABLE public.geography_reference_versions (
  id uuid PRIMARY KEY,
  reference_system text NOT NULL CHECK (reference_system = 'PSGC'),
  version_code text NOT NULL,
  reference_date date NOT NULL,
  publication_date date NOT NULL,
  publication_reference text NOT NULL,
  source_url text NOT NULL CHECK (source_url LIKE 'https://psa.gov.ph/%'),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  is_current boolean NOT NULL DEFAULT false,
  imported_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL,
  UNIQUE (reference_system, version_code)
);
CREATE UNIQUE INDEX geography_one_current ON public.geography_reference_versions (reference_system) WHERE is_current;

CREATE TABLE public.geography_units (
  id uuid PRIMARY KEY,
  reference_version_id uuid NOT NULL REFERENCES public.geography_reference_versions(id),
  official_code text NOT NULL CHECK (official_code ~ '^[0-9]{10}$'),
  name text NOT NULL CHECK (btrim(name) <> ''),
  normalized_name text NOT NULL CHECK (btrim(normalized_name) <> ''),
  geographic_level text CHECK (geographic_level IN ('Reg','Prov','City','Mun','SubMun','Bgy')),
  structural_kind text NOT NULL CHECK (structural_kind IN ('Reg','Prov','City','Mun','SubMun','Bgy','special_city_grouping','special_geographic_area')),
  parent_id uuid,
  coding_parent_id uuid,
  parent_code text,
  coding_parent_code text,
  correspondence_code text CHECK (correspondence_code ~ '^[0-9]{9}$'),
  city_class text CHECK (city_class IN ('HUC','ICC','CC')),
  status text CHECK (status IN ('Pob.','Capital')),
  metadata jsonb NOT NULL DEFAULT '{}',
  UNIQUE (reference_version_id, official_code),
  UNIQUE (id, reference_version_id),
  FOREIGN KEY (parent_id, reference_version_id) REFERENCES public.geography_units(id,reference_version_id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (coding_parent_id, reference_version_id) REFERENCES public.geography_units(id,reference_version_id) DEFERRABLE INITIALLY DEFERRED,
  CHECK ((geographic_level IS NOT NULL AND structural_kind = geographic_level) OR
    (geographic_level IS NULL AND structural_kind IN ('special_city_grouping','special_geographic_area')))
);
CREATE INDEX geography_exact_name ON public.geography_units (reference_version_id, normalized_name, geographic_level);
CREATE INDEX geography_parent_search ON public.geography_units (reference_version_id, parent_id, normalized_name);

CREATE TABLE public.geography_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  geography_unit_id uuid NOT NULL,
  reference_version_id uuid NOT NULL,
  alias text NOT NULL CHECK (btrim(alias) <> ''),
  normalized_alias text NOT NULL CHECK (btrim(normalized_alias) <> ''),
  alias_type text NOT NULL,
  source text NOT NULL,
  approved_by uuid NOT NULL REFERENCES public.profiles(id),
  approved_at timestamptz NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  FOREIGN KEY (geography_unit_id, reference_version_id) REFERENCES public.geography_units(id,reference_version_id),
  UNIQUE (reference_version_id, geography_unit_id, normalized_alias)
);
CREATE INDEX geography_alias_lookup ON public.geography_aliases (reference_version_id, normalized_alias) WHERE is_active;

ALTER TABLE public.geography_reference_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geography_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geography_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.geography_reference_versions, public.geography_units, public.geography_aliases FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.geography_reference_versions, public.geography_units, public.geography_aliases TO anon, authenticated;
CREATE POLICY geography_versions_public_reference ON public.geography_reference_versions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY geography_units_public_reference ON public.geography_units FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY geography_alias_public_reference ON public.geography_aliases FOR SELECT TO anon, authenticated USING (is_active);

-- Review identities on aliases are not part of the public reference API.
REVOKE SELECT ON public.geography_aliases FROM anon, authenticated;
GRANT SELECT (id,geography_unit_id,reference_version_id,alias,normalized_alias,alias_type,source,is_active)
  ON public.geography_aliases TO anon, authenticated;

CREATE FUNCTION geography_internal.normalize_label(p_value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $$
  SELECT nullif(btrim(regexp_replace(lower(translate(normalize(p_value, NFKC), '‘’“”–—', chr(39)||chr(39)||'""--')), '\s+', ' ', 'g')), '')
$$;

CREATE FUNCTION geography_internal.import_reference(p_data jsonb, p_make_current boolean DEFAULT false)
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
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA geography_internal FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.geography_units IS 'Public versioned PSA reference only; source levels preserved; structural_kind is a project model, not an invented PSGC level. Status is not activity.';
COMMENT ON FUNCTION geography_internal.import_reference(jsonb,boolean) IS 'Privileged, atomic validated import; clients have no execute grant. Future versions do not become current unless explicitly requested.';
COMMIT;
