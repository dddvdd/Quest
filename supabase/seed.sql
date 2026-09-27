-- Trabaho Caravan deterministic development fixtures.
--
-- All people and contact details below are synthetic. Jobseekers are modeled as
-- production-style walk-ins: participants.auth_user_id is always NULL, and no
-- auth.users or public.profiles row is required. Schema changes belong in
-- migrations; this file contains data only and runs after migrations on reset.

-- ---------------------------------------------------------------------------
-- Reference/demo entities
-- ---------------------------------------------------------------------------

INSERT INTO public.employers (
  id, company_name, industry, is_active, employer_type, registration_status,
  registered_user_id, employer_code, registration_source
)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'Cagayan Quick Service Foods (Seed)', 'Food Service', true, 'local_direct', 'approved', NULL, 'EMP-SEED001', 'admin'),
  ('10000000-0000-4000-8000-000000000002', 'Northern Valley Retail (Seed)', 'Retail', true, 'local_direct', 'approved', NULL, 'EMP-SEED002', 'admin'),
  ('10000000-0000-4000-8000-000000000003', 'Tuguegarao Contact Center (Seed)', 'Business Process Outsourcing', true, 'local_direct', 'approved', NULL, 'EMP-SEED003', 'admin'),
  ('10000000-0000-4000-8000-000000000004', 'Cagayan Foods Manufacturing (Seed)', 'Manufacturing', true, 'local_direct', 'approved', NULL, 'EMP-SEED004', 'admin'),
  ('10000000-0000-4000-8000-000000000005', 'Aparri Quality Labs (Seed)', 'Food Technology', true, 'local_direct', 'approved', NULL, 'EMP-SEED005', 'admin')
ON CONFLICT DO NOTHING;

INSERT INTO public.events (
  id, event_name, event_date, time_from, time_to, location, venue, description, status
)
VALUES
  ('20000000-0000-4000-8000-000000000001', '[SEED] Trabaho Caravan 2026 - Tuguegarao', '2026-09-15', '09:00', '16:00', 'Tuguegarao City', 'Cagayan Sports Complex', 'Synthetic PESO job fair fixture for local development.', 'upcoming'),
  ('20000000-0000-4000-8000-000000000002', '[SEED] Trabaho Caravan 2026 - Aparri', '2026-09-22', '09:00', '15:00', 'Aparri', 'Aparri Municipal Gymnasium', 'Synthetic northern Cagayan job fair fixture for local development.', 'upcoming')
ON CONFLICT DO NOTHING;

INSERT INTO public.vacancy_definitions (
  id, employer_id, company_name, position, qualifications, salary_range,
  place_of_assignment, is_active, created_by, created_source
)
VALUES
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Cagayan Quick Service Foods (Seed)', 'Service Crew', 'At least SHS graduate; willing to work shifts', 'PHP 12,000 - PHP 15,000', 'Tuguegarao City', true, NULL, 'admin'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Northern Valley Retail (Seed)', 'Sales Associate', 'College level; good communication skills', 'PHP 13,000 - PHP 16,000', 'Tuguegarao City', true, NULL, 'admin'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'Tuguegarao Contact Center (Seed)', 'Customer Service Representative', 'College graduate; good English communication skills', 'PHP 18,000 - PHP 22,000', 'Tuguegarao City', true, NULL, 'admin'),
  ('30000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', 'Cagayan Foods Manufacturing (Seed)', 'Production Operator', 'High school graduate; physically fit', 'PHP 14,000 - PHP 17,000', 'Enrile, Cagayan', true, NULL, 'admin'),
  ('30000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'Aparri Quality Labs (Seed)', 'Quality Assurance Technician', 'BS Chemistry or Food Technology graduate', 'PHP 20,000 - PHP 25,000', 'Aparri, Cagayan', true, NULL, 'admin')
ON CONFLICT DO NOTHING;

INSERT INTO public.event_vacancies (
  id, vacancy_definition_id, event_id, slots_offered, notes
)
VALUES
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 15, 'Morning shift only'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 10, NULL),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 10, NULL),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 20, NULL),
  ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 8, NULL),
  ('40000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', 5, NULL)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Person-level entities: one reusable participant and one profile per person
-- ---------------------------------------------------------------------------

INSERT INTO public.participants (id, auth_user_id, public_pass_id)
VALUES
  ('50000000-0000-4000-8000-000000000001', NULL, 'QST-SEEDP01'),
  ('50000000-0000-4000-8000-000000000002', NULL, 'QST-SEEDP02'),
  ('50000000-0000-4000-8000-000000000003', NULL, 'QST-SEEDP03'),
  ('50000000-0000-4000-8000-000000000004', NULL, 'QST-SEEDP04'),
  ('50000000-0000-4000-8000-000000000005', NULL, 'QST-SEEDP05'),
  ('50000000-0000-4000-8000-000000000006', NULL, 'QST-SEEDP06'),
  ('50000000-0000-4000-8000-000000000007', NULL, 'QST-SEEDP07'),
  ('50000000-0000-4000-8000-000000000008', NULL, 'QST-SEEDP08'),
  ('50000000-0000-4000-8000-000000000009', NULL, 'QST-SEEDP09'),
  ('50000000-0000-4000-8000-000000000010', NULL, 'QST-SEEDP10'),
  ('50000000-0000-4000-8000-000000000011', NULL, 'QST-SEEDP11'),
  ('50000000-0000-4000-8000-000000000012', NULL, 'QST-SEEDP12'),
  ('50000000-0000-4000-8000-000000000013', NULL, 'QST-SEEDP13'),
  ('50000000-0000-4000-8000-000000000014', NULL, 'QST-SEEDP14'),
  ('50000000-0000-4000-8000-000000000015', NULL, 'QST-SEEDP15')
ON CONFLICT DO NOTHING;

INSERT INTO public.jobseeker_profiles (
  participant_id, first_name, middle_name, last_name, birthdate, sex, civil_status,
  province, municipality_city, barangay, contact_no, email, first_time_jobseeker,
  returning_ofw, returning_worker, interested_in_skills_training,
  preferred_training_program, has_disability, disability_type,
  peso_assistance_programs, highest_educational_attainment, course_program,
  employment_preference, data_subject_rights_agreed
)
VALUES
  ('50000000-0000-4000-8000-000000000001', 'Maria', 'Santos', 'Dela Cruz', '1999-03-15', 'Female', 'Single', 'Cagayan', 'Tuguegarao City', 'Ugac Sur', '09000000001', 'maria.delacruz@example.test', true, false, false, false, NULL, false, NULL, '{}', 'Bachelor''s Degree Graduate', 'Bachelor of Science in Information Technology (BS IT)', 'Local', true),
  ('50000000-0000-4000-8000-000000000002', 'Juan', 'Garcia', 'Reyes', '1995-07-22', 'Male', 'Married', 'Cagayan', 'Tuguegarao City', 'Centro 1', '09000000002', 'juan.reyes@example.test', false, false, true, false, NULL, false, NULL, '{}', 'College Level', 'Bachelor of Science in Business Administration (BSBA)', 'Local', true),
  ('50000000-0000-4000-8000-000000000003', 'Ana', NULL, 'Martinez', '2002-11-08', 'Female', 'Single', 'Cagayan', 'Tuguegarao City', 'Carig Sur', '09000000003', 'ana.martinez@example.test', true, false, false, true, 'Bread and Pastry Production NC II', false, NULL, '{}', 'Senior High School Graduate', NULL, 'Local', true),
  ('50000000-0000-4000-8000-000000000004', 'Carlo', 'Mendoza', 'Santos', '1998-01-30', 'Male', 'Single', 'Cagayan', 'Tuguegarao City', 'Caggay', '09000000004', 'carlo.santos@example.test', true, false, false, false, NULL, false, NULL, '{}', 'TESDA National Certificate II', 'Computer Systems Servicing NC II', 'Local', true),
  ('50000000-0000-4000-8000-000000000005', 'Liza', 'Ramos', 'Bautista', '1990-05-12', 'Female', 'Married', 'Cagayan', 'Tuguegarao City', 'Linao East', '09000000005', 'liza.bautista@example.test', false, true, false, false, NULL, false, NULL, '{}', 'Bachelor''s Degree Graduate', 'Bachelor of Science in Nursing (BSN)', 'Overseas', true),
  ('50000000-0000-4000-8000-000000000006', 'Pedro', NULL, 'Aquino', '1997-09-25', 'Male', 'Single', 'Cagayan', 'Tuguegarao City', 'San Gabriel', '09000000006', 'pedro.aquino@example.test', true, false, false, false, NULL, true, 'Hearing impairment', '{}', 'Junior High School Graduate', NULL, 'Local', true),
  ('50000000-0000-4000-8000-000000000007', 'Rose', 'Villanueva', 'Gonzales', '2001-04-18', 'Female', 'Single', 'Cagayan', 'Tuguegarao City', 'Riverside', '09000000007', 'rose.gonzales@example.test', true, false, false, false, NULL, false, NULL, '{}', 'Bachelor''s Degree Graduate', 'Bachelor of Science in Accountancy (BSA)', 'Local', true),
  ('50000000-0000-4000-8000-000000000008', 'Mark', NULL, 'Tolentino', '1993-12-01', 'Male', 'Married', 'Cagayan', 'Tuguegarao City', 'Balzain West', '09000000008', 'mark.tolentino@example.test', false, false, true, false, NULL, false, NULL, '{}', 'TESDA National Certificate II', 'Shielded Metal Arc Welding (SMAW) NC II', 'Both', true),
  ('50000000-0000-4000-8000-000000000009', 'Jenny', 'Castillo', 'Navarro', '2000-08-14', 'Female', 'Single', 'Cagayan', 'Tuguegarao City', 'Pengue-Ruyu', '09000000009', 'jenny.navarro@example.test', true, false, false, true, 'Cookery NC II', false, NULL, '{}', 'Senior High School Graduate', NULL, 'Local', true),
  ('50000000-0000-4000-8000-000000000010', 'Roberto', NULL, 'Espiritu', '1996-06-20', 'Male', 'Single', 'Cagayan', 'Tuguegarao City', 'Hussay', '09000000010', 'roberto.espiritu@example.test', true, false, false, false, NULL, false, NULL, ARRAY['Career Coaching', 'Employment Facilitation'], 'Bachelor''s Degree Graduate', 'Bachelor of Science in Criminology (BS Criminology)', 'Local', true),
  ('50000000-0000-4000-8000-000000000011', 'Angela', 'Cruz', 'Dimaculangan', '2003-02-28', 'Female', 'Single', 'Cagayan', 'Aparri', 'Sanja', '09000000011', 'angela.dimaculangan@example.test', true, false, false, false, NULL, false, NULL, '{}', 'College Level', 'Bachelor of Science in Computer Science (BS CS)', 'Local', true),
  ('50000000-0000-4000-8000-000000000012', 'Dennis', NULL, 'Ilagan', '1991-10-05', 'Male', 'Married', 'Cagayan', 'Aparri', 'Minanga', '09000000012', 'dennis.ilagan@example.test', false, false, true, false, NULL, false, NULL, '{}', 'Bachelor''s Degree Graduate', 'Bachelor of Science in Mechanical Engineering (BSME)', 'Both', true),
  ('50000000-0000-4000-8000-000000000013', 'Cristina', 'Lopez', 'Manalo', '2004-07-11', 'Female', 'Single', 'Cagayan', 'Tuguegarao City', 'Tanza', '09000000013', 'cristina.manalo@example.test', true, false, false, false, NULL, false, NULL, '{}', 'Senior High School Graduate', NULL, 'Local', true),
  ('50000000-0000-4000-8000-000000000014', 'Ricardo', NULL, 'Hernandez', '1988-03-02', 'Male', 'Married', 'Cagayan', 'Tuguegarao City', 'Annafunan East', '09000000014', 'ricardo.hernandez@example.test', false, true, false, false, NULL, false, NULL, '{}', 'Bachelor''s Degree Graduate', 'Bachelor of Science in Electrical Engineering (BSEE)', 'Overseas', true),
  ('50000000-0000-4000-8000-000000000015', 'Maricel', 'Flores', 'De Leon', '1999-11-19', 'Female', 'Single', 'Cagayan', 'Tuguegarao City', 'Bagay', '09000000015', 'maricel.deleon@example.test', true, false, false, false, NULL, false, NULL, '{}', 'TESDA National Certificate II', 'Caregiving NC II', 'Both', true)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Participation-level entities: attendance belongs to an event, not a person
-- ---------------------------------------------------------------------------

INSERT INTO public.event_participations (
  id, participant_id, event_id, registration_type, registered_by,
  check_in_status, check_in_time, check_in_by, ticket_code, qr_token
)
VALUES
  ('60000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'walkin', NULL, 'pending', NULL, NULL, 'SEED-TUG-001', '70000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'walkin', NULL, 'checked_in', '2026-09-15 09:10:00+08', NULL, 'SEED-TUG-002', '70000000-0000-4000-8000-000000000002'),
  ('60000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'walkin', NULL, 'pending', NULL, NULL, 'SEED-TUG-003', '70000000-0000-4000-8000-000000000003'),
  ('60000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'walkin', NULL, 'checked_in', '2026-09-15 09:30:00+08', NULL, 'SEED-TUG-004', '70000000-0000-4000-8000-000000000004'),
  ('60000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', 'walkin', NULL, 'checked_in', '2026-09-15 09:45:00+08', NULL, 'SEED-TUG-005', '70000000-0000-4000-8000-000000000005'),
  ('60000000-0000-4000-8000-000000000006', '50000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001', 'walkin', NULL, 'checked_in', '2026-09-15 10:00:00+08', NULL, 'SEED-TUG-006', '70000000-0000-4000-8000-000000000006'),
  ('60000000-0000-4000-8000-000000000007', '50000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001', 'walkin', NULL, 'pending', NULL, NULL, 'SEED-TUG-007', '70000000-0000-4000-8000-000000000007'),
  ('60000000-0000-4000-8000-000000000008', '50000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000001', 'walkin', NULL, 'checked_in', '2026-09-15 10:20:00+08', NULL, 'SEED-TUG-008', '70000000-0000-4000-8000-000000000008'),
  ('60000000-0000-4000-8000-000000000009', '50000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000001', 'walkin', NULL, 'checked_in', '2026-09-15 10:35:00+08', NULL, 'SEED-TUG-009', '70000000-0000-4000-8000-000000000009'),
  ('60000000-0000-4000-8000-000000000010', '50000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000001', 'walkin', NULL, 'pending', NULL, NULL, 'SEED-TUG-010', '70000000-0000-4000-8000-000000000010'),
  ('60000000-0000-4000-8000-000000000011', '50000000-0000-4000-8000-000000000011', '20000000-0000-4000-8000-000000000002', 'walkin', NULL, 'pending', NULL, NULL, 'SEED-APA-011', '70000000-0000-4000-8000-000000000011'),
  ('60000000-0000-4000-8000-000000000012', '50000000-0000-4000-8000-000000000012', '20000000-0000-4000-8000-000000000002', 'walkin', NULL, 'checked_in', '2026-09-22 09:20:00+08', NULL, 'SEED-APA-012', '70000000-0000-4000-8000-000000000012'),
  ('60000000-0000-4000-8000-000000000013', '50000000-0000-4000-8000-000000000013', '20000000-0000-4000-8000-000000000001', 'walkin', NULL, 'pending', NULL, NULL, 'SEED-TUG-013', '70000000-0000-4000-8000-000000000013'),
  ('60000000-0000-4000-8000-000000000014', '50000000-0000-4000-8000-000000000014', '20000000-0000-4000-8000-000000000001', 'walkin', NULL, 'checked_in', '2026-09-15 11:00:00+08', NULL, 'SEED-TUG-014', '70000000-0000-4000-8000-000000000014'),
  ('60000000-0000-4000-8000-000000000015', '50000000-0000-4000-8000-000000000015', '20000000-0000-4000-8000-000000000001', 'walkin', NULL, 'checked_in', '2026-09-15 11:15:00+08', NULL, 'SEED-TUG-015', '70000000-0000-4000-8000-000000000015'),
  -- Maria reuses the same participant/profile identity at a second event.
  ('60000000-0000-4000-8000-000000000016', '50000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', 'walkin', NULL, 'checked_in', '2026-09-22 09:35:00+08', NULL, 'SEED-APA-016', '70000000-0000-4000-8000-000000000016')
ON CONFLICT DO NOTHING;

INSERT INTO public.participation_vacancies (
  participation_id, event_vacancy_id, preference_type
)
VALUES
  ('60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'local'),
  ('60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000004', 'local'),
  ('60000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003', 'local'),
  ('60000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000005', 'local'),
  ('60000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000004', 'local'),
  ('60000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000003', 'local'),
  ('60000000-0000-4000-8000-000000000011', '40000000-0000-4000-8000-000000000006', 'local'),
  ('60000000-0000-4000-8000-000000000012', '40000000-0000-4000-8000-000000000002', 'local'),
  ('60000000-0000-4000-8000-000000000016', '40000000-0000-4000-8000-000000000006', 'local')
ON CONFLICT DO NOTHING;

-- No applications are seeded: the legacy fixture did not contain recruitment
-- records. When added later, event applications must use participant_id plus the
-- checked-in event_participation id (applications.registrant_id) and the matching
-- vacancy_definition/event_vacancy pair required by the canonical trigger.
