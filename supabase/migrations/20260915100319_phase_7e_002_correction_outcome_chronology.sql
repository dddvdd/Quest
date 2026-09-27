BEGIN;
CREATE OR REPLACE FUNCTION program_internal.manage(p_operation text,p_payload jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
DECLARE actor uuid:=auth.uid(); request uuid; digest text; saved program_internal.requests; result jsonb;
 id uuid:=gen_random_uuid(); event_id uuid:=gen_random_uuid(); p public.program_participations;
 cycle public.employment_program_cycles; old_event public.program_participation_events;
 occurred timestamptz; verification text; source text; evidence_type text; evidence_reference text;
 from_stage text; stage text; allowed text[]; keys text[]; link uuid; first_occurred timestamptz; service public.program_service_types;
BEGIN
 IF NOT program_internal.is_admin() THEN RAISE EXCEPTION 'Active admin required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Object payload required'; END IF;
 CASE p_operation
 WHEN 'create_program' THEN keys:=ARRAY['request_id','code','name','description','program_type','implementing_agency','valid_from','valid_to'];
 WHEN 'create_cycle' THEN keys:=ARRAY['request_id','program_id','cycle_code','title','start_date','end_date','application_start','application_end','status','workflow','event_id','implementation_geography_id','capacity'];
 WHEN 'create_service_type' THEN keys:=ARRAY['request_id','code','name','program_id'];
 WHEN 'record_participation' THEN keys:=ARRAY['request_id','participant_id','program_cycle_id','stage','occurred_at','source','evidence_type','evidence_reference','verification_status'];
 WHEN 'record_transition','correct_transition' THEN keys:=ARRAY['request_id','program_participation_id','expected_event_id','stage','occurred_at','source','evidence_type','evidence_reference','verification_status','correction_reason'];
 WHEN 'record_outcome' THEN keys:=ARRAY['request_id','program_participation_id','outcome_type','employment_outcome_id','occurred_at','source','evidence_type','evidence_reference','verification_status'];
 WHEN 'record_service_delivery' THEN keys:=ARRAY['request_id','participant_id','service_type_id','program_participation_id','occurred_at','source','evidence_type','evidence_reference','verification_status'];
 WHEN 'history' THEN keys:=ARRAY['participant_id','program_cycle_id','limit'];
 ELSE RAISE EXCEPTION 'Unsupported program operation'; END CASE;
 IF (p_payload-keys)<>'{}'::jsonb THEN RAISE EXCEPTION 'Unsupported program payload field'; END IF;
 IF p_operation='history' THEN
  IF coalesce((p_payload->>'limit')::integer,100) NOT BETWEEN 1 AND 100
   OR coalesce(p_payload->>'participant_id',p_payload->>'program_cycle_id') IS NULL THEN RAISE EXCEPTION 'Bounded person/cycle scope required'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(h)),'[]'::jsonb) INTO result FROM (
   SELECT pp.*, (SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.revision),'[]'::jsonb) FROM public.program_participation_events e WHERE e.program_participation_id=pp.id) AS events,
    (SELECT coalesce(jsonb_agg(to_jsonb(o)||jsonb_build_object('causal_attribution',false,'linked_employment_current_verified',CASE WHEN o.employment_outcome_id IS NULL THEN NULL ELSE program_internal.link_is_verified(o.employment_outcome_id,pp.participant_id) END)),'[]'::jsonb) FROM public.program_participation_outcomes o WHERE o.program_participation_id=pp.id) AS outcomes
   FROM public.program_participations pp WHERE (p_payload->>'participant_id' IS NULL OR pp.participant_id=(p_payload->>'participant_id')::uuid)
    AND (p_payload->>'program_cycle_id' IS NULL OR pp.program_cycle_id=(p_payload->>'program_cycle_id')::uuid)
   ORDER BY pp.created_at DESC,pp.id LIMIT coalesce((p_payload->>'limit')::integer,100)
  ) h;
  RETURN result;
 END IF;
 request:=(p_payload->>'request_id')::uuid;
 IF request IS NULL THEN RAISE EXCEPTION 'Retry request identity required'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('program request '||request::text,0));
 digest:=encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
 SELECT * INTO saved FROM program_internal.requests WHERE request_id=request;
 IF FOUND THEN
  IF saved.operation<>p_operation OR saved.payload_hash<>digest THEN RAISE EXCEPTION 'Retry payload conflict' USING ERRCODE='40001'; END IF;
  RETURN saved.response;
 END IF;
 IF p_operation LIKE 'record_%' OR p_operation='correct_transition' THEN
  occurred:=(p_payload->>'occurred_at')::timestamptz;
  verification:=coalesce(p_payload->>'verification_status','reported');
  source:=btrim(p_payload->>'source');evidence_type:=btrim(p_payload->>'evidence_type');evidence_reference:=btrim(p_payload->>'evidence_reference');
  IF occurred IS NULL OR occurred>clock_timestamp() OR verification NOT IN ('reported','verified')
   OR source IS NULL OR length(source) NOT BETWEEN 1 AND 500 OR evidence_type IS NULL OR length(evidence_type) NOT BETWEEN 1 AND 500
   OR evidence_reference IS NULL OR length(evidence_reference) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Actual occurrence and evidence provenance required'; END IF;
 END IF;
 CASE p_operation
 WHEN 'create_program' THEN
  INSERT INTO public.employment_programs(id,code,name,description,program_type,implementing_agency,valid_from,valid_to,created_by)
  VALUES(id,p_payload->>'code',p_payload->>'name',p_payload->>'description',p_payload->>'program_type',p_payload->>'implementing_agency',(p_payload->>'valid_from')::date,(p_payload->>'valid_to')::date,actor);
 WHEN 'create_cycle' THEN
  PERFORM 1 FROM public.employment_programs WHERE employment_programs.id=(p_payload->>'program_id')::uuid AND is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Active program required'; END IF;
  INSERT INTO public.employment_program_cycles(id,program_id,cycle_code,title,start_date,end_date,application_start,application_end,status,workflow,event_id,implementation_geography_id,capacity,created_by)
  VALUES(id,(p_payload->>'program_id')::uuid,p_payload->>'cycle_code',p_payload->>'title',(p_payload->>'start_date')::date,(p_payload->>'end_date')::date,(p_payload->>'application_start')::date,(p_payload->>'application_end')::date,coalesce(p_payload->>'status','open'),p_payload->'workflow',(p_payload->>'event_id')::uuid,(p_payload->>'implementation_geography_id')::uuid,(p_payload->>'capacity')::integer,actor);
 WHEN 'create_service_type' THEN
  INSERT INTO public.program_service_types(id,code,name,program_id,created_by) VALUES(id,p_payload->>'code',p_payload->>'name',(p_payload->>'program_id')::uuid,actor);
 WHEN 'record_participation','record_transition','correct_transition' THEN
  stage:=p_payload->>'stage';
  IF p_operation='record_participation' THEN
   SELECT * INTO cycle FROM public.employment_program_cycles WHERE employment_program_cycles.id=(p_payload->>'program_cycle_id')::uuid FOR SHARE;
   IF NOT FOUND OR cycle.status<>'open' THEN RAISE EXCEPTION 'Open program cycle required'; END IF;
   from_stage:=NULL;
  ELSE
   SELECT * INTO p FROM public.program_participations WHERE program_participations.id=(p_payload->>'program_participation_id')::uuid FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Participation not found'; END IF;
   IF p.last_event_id IS DISTINCT FROM (p_payload->>'expected_event_id')::uuid THEN RAISE EXCEPTION 'Program state changed' USING ERRCODE='40001'; END IF;
   SELECT * INTO STRICT cycle FROM public.employment_program_cycles WHERE employment_program_cycles.id=p.program_cycle_id FOR SHARE;
   SELECT * INTO STRICT old_event FROM public.program_participation_events WHERE program_participation_events.id=p.last_event_id;
   from_stage:=CASE WHEN p_operation='correct_transition' THEN old_event.from_stage ELSE p.current_status END;
   IF p_operation='correct_transition' THEN
    IF coalesce(length(btrim(p_payload->>'correction_reason')),0) NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Correction reason required'; END IF;
    IF from_stage IS NULL AND EXISTS(SELECT 1 FROM public.program_participation_outcomes o WHERE o.program_participation_id=p.id AND o.occurred_at<occurred) THEN RAISE EXCEPTION 'Correction contradicts recorded outcome chronology'; END IF;
    SELECT program_participation_events.occurred_at INTO first_occurred FROM public.program_participation_events WHERE program_participation_events.id=old_event.previous_event_id;
    -- Replacement time may precede the erroneous latest time, but never its predecessor.
    IF old_event.event_kind='correction' THEN
     WITH RECURSIVE prior AS (SELECT * FROM public.program_participation_events WHERE program_participation_events.id=old_event.corrected_event_id
      UNION ALL SELECT e.* FROM public.program_participation_events e JOIN prior x ON e.id=x.corrected_event_id)
     SELECT e.occurred_at INTO first_occurred FROM prior x JOIN public.program_participation_events e ON e.id=x.previous_event_id WHERE x.event_kind='transition';
    END IF;
   ELSE first_occurred:=old_event.occurred_at; END IF;
   IF occurred<first_occurred THEN RAISE EXCEPTION 'Occurrence precedes valid history'; END IF;
  END IF;
  SELECT array_agg(s) INTO allowed FROM jsonb_array_elements_text(CASE WHEN from_stage IS NULL THEN cycle.workflow->'initial' ELSE cycle.workflow->'transitions'->from_stage END) s;
  IF stage IS NULL OR NOT coalesce(stage=ANY(allowed),false) THEN RAISE EXCEPTION 'Transition not permitted by cycle workflow'; END IF;
  IF p_operation='record_participation' THEN
   INSERT INTO public.program_participations(id,participant_id,program_cycle_id,current_status,last_event_id,source,created_by)
   VALUES(id,(p_payload->>'participant_id')::uuid,cycle.id,stage,event_id,source,actor);
   p.id:=id;
  END IF;
  INSERT INTO public.program_participation_events(id,program_participation_id,stage,from_stage,event_kind,revision,previous_event_id,corrected_event_id,correction_reason,occurred_at,source,evidence_type,evidence_reference,verification_status,verified_by,verified_at,recorded_by)
  VALUES(event_id,p.id,stage,from_stage,CASE WHEN p_operation='correct_transition' THEN 'correction' ELSE 'transition' END,coalesce(old_event.revision,0)+1,p.last_event_id,CASE WHEN p_operation='correct_transition' THEN old_event.id END,p_payload->>'correction_reason',occurred,source,evidence_type,evidence_reference,verification,CASE WHEN verification='verified' THEN actor END,CASE WHEN verification='verified' THEN now() END,actor);
  UPDATE public.program_participations SET current_status=stage,last_event_id=event_id,updated_at=now() WHERE program_participations.id=p.id;
  result:=jsonb_build_object('id',p.id,'event_id',event_id,'stage',stage);
 WHEN 'record_outcome' THEN
  SELECT * INTO p FROM public.program_participations WHERE program_participations.id=(p_payload->>'program_participation_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Participation not found'; END IF;
  SELECT min(e.occurred_at) INTO first_occurred FROM public.program_participation_events e WHERE e.program_participation_id=p.id
   AND NOT EXISTS(SELECT 1 FROM public.program_participation_events replacement WHERE replacement.corrected_event_id=e.id);
  IF occurred<first_occurred THEN RAISE EXCEPTION 'Outcome precedes participation'; END IF;
  link:=(p_payload->>'employment_outcome_id')::uuid;
  IF link IS NOT NULL THEN
   PERFORM 1 FROM public.employment_outcomes WHERE employment_outcomes.id=link FOR SHARE;
   IF NOT program_internal.link_is_verified(link,p.participant_id) OR verification<>'verified'
    OR (occurred AT TIME ZONE 'UTC')::date IS DISTINCT FROM (SELECT hired_at FROM public.employment_outcomes WHERE employment_outcomes.id=link) THEN RAISE EXCEPTION 'Current verified same-person employment outcome required'; END IF;
  END IF;
  INSERT INTO public.program_participation_outcomes(id,program_participation_id,outcome_type,employment_outcome_id,occurred_at,source,evidence_type,evidence_reference,verification_status,verified_by,verified_at,recorded_by)
  VALUES(id,p.id,p_payload->>'outcome_type',link,occurred,source,evidence_type,evidence_reference,verification,CASE WHEN verification='verified' THEN actor END,CASE WHEN verification='verified' THEN now() END,actor);
  result:=jsonb_build_object('id',id,'causal_attribution',false);
 WHEN 'record_service_delivery' THEN
  SELECT * INTO STRICT service FROM public.program_service_types WHERE program_service_types.id=(p_payload->>'service_type_id')::uuid FOR SHARE;
  IF p_payload->>'program_participation_id' IS NOT NULL THEN
   SELECT * INTO p FROM public.program_participations WHERE program_participations.id=(p_payload->>'program_participation_id')::uuid FOR UPDATE;
   IF NOT FOUND OR p.participant_id IS DISTINCT FROM (p_payload->>'participant_id')::uuid THEN RAISE EXCEPTION 'Same-person participation required'; END IF;
   SELECT * INTO STRICT cycle FROM public.employment_program_cycles WHERE employment_program_cycles.id=p.program_cycle_id;
   IF service.program_id IS NOT NULL AND service.program_id<>cycle.program_id THEN RAISE EXCEPTION 'Service belongs to another program'; END IF;
  END IF;
  INSERT INTO public.program_service_deliveries(id,participant_id,service_type_id,program_participation_id,occurred_at,source,evidence_type,evidence_reference,verification_status,verified_by,verified_at,recorded_by)
  VALUES(id,(p_payload->>'participant_id')::uuid,service.id,p.id,occurred,source,evidence_type,evidence_reference,verification,CASE WHEN verification='verified' THEN actor END,CASE WHEN verification='verified' THEN now() END,actor);
 END CASE;
 result:=coalesce(result,jsonb_build_object('id',id));
 INSERT INTO program_internal.requests(request_id,operation,payload_hash,response,recorded_by) VALUES(request,p_operation,digest,result,actor);
 RETURN result;
END $$;
COMMIT;
