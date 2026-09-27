// Governance metadata only. This registry cannot enable metrics or grant access.
import { getMetricDefinition } from './employmentIntelligenceMetrics.js'

export const EMPLOYMENT_INTELLIGENCE_METHODOLOGY_VERSION = 'employment-methodology-v1'

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

export const METHODOLOGY_STATUSES = freeze([
  'approved', 'data_gap', 'policy_pending', 'schema_required',
  'normalization_required', 'authorization_required', 'deferred',
])

const definitions = [
  {
    methodology_id: 'active_jobseeker', metric_ids: ['active_jobseekers'], status: 'policy_pending',
    definition: 'A distinct person meeting an explicitly approved current job-search definition; none is selected.',
    required_data: ['Approved population, activity window or declaration expiry, and date basis',
      'Verified declaration or service/application events appropriate to the selected definition',
      'Withdrawal, renewal, correction and deduplication rules'],
    known_limitations: ['Profile updates, availability, attendance and login are separate concepts',
      'One application does not establish continuing job search', 'No active-search declaration lifecycle exists'],
    privacy_requirements: ['Purpose review before using service or authentication activity', 'No employer active-search filter'],
    authorization_requirements: ['Admin only today; future residence/service scopes need separate approval'],
    blockers: ['policy_pending', 'schema_required'],
    proposal_document: 'EMPLOYMENT_INTELLIGENCE_METHODOLOGY.md#active-jobseeker-candidates',
  },
  {
    methodology_id: 'salary_comparability', metric_ids: ['vacancy_salary_average', 'jobseeker_salary_median'],
    status: 'normalization_required',
    definition: 'Comparable declared salary observations within an approved unit, currency, bound and population contract.',
    required_data: ['Confirmed bounds, currency, period and gross/net/base-pay meaning',
      'Approved bound selection and equal-unit comparability rules',
      'Actual paid hours/days and approved conversion assumptions for cross-period conversion',
      'Approved exchange-rate source, effective date and revision policy if cross-currency conversion is allowed'],
    known_limitations: ['Sparse monthly PHP evidence does not approve a methodology',
      'Salary coverage is completeness, not comparability', 'No midpoint, working-time multiplier or currency rate is selected'],
    privacy_requirements: ['Disclosure review of salary cells, cohorts and exports; no individual salaries'],
    authorization_requirements: ['Admin only today; future vacancy and expectation populations require different scopes'],
    blockers: ['normalization_required', 'policy_pending', 'data_gap'],
    proposal_document: 'EMPLOYMENT_INTELLIGENCE_METHODOLOGY.md#salary-comparability-proposal',
  },
  {
    methodology_id: 'interview_completion', metric_ids: ['interviews_completed'], status: 'schema_required',
    definition: 'Distinct interview occurrences with verified completed lifecycle evidence, separate from recorded results.',
    required_data: ['Occurrence identity, application link and responsible employer/event',
      'Scheduled, started, completed, cancelled and no-show transitions with timestamps and recorder',
      'Rescheduling, correction and duplicate rules'],
    known_limitations: ['Current enum records not_qualified, qualified, near_hire and hots results',
      'Result dates do not prove a completion transition', 'Existing unlinked results cannot be retrospectively promoted'],
    privacy_requirements: ['Aggregate transitions only; no interview notes or individual schedules'],
    authorization_requirements: ['Approved employer/staff capture authority and event-scoped aggregate reads'],
    blockers: ['schema_required', 'policy_pending', 'data_gap'],
    proposal_document: 'EMPLOYMENT_INTELLIGENCE_METHODOLOGY.md#interview-completion-proposal',
  },
  {
    methodology_id: 'sensitive_disclosure', metric_ids: ['special_sector_count'], status: 'policy_pending',
    definition: 'Sensitive aggregate release under an approved audience-specific disclosure protocol; currently all withheld.',
    required_data: ['Approved purpose, audience, cells, threshold and release schedule',
      'Complementary suppression and cross-release inference testing',
      'Server-side release audit and export controls'],
    known_limitations: ['Minimum sensitive count remains null', 'A threshold alone cannot prevent differencing',
      'Administrative access does not itself approve disclosure'],
    privacy_requirements: ['Administrative/legal approval covering small cells, overlaps, time, geography, programs and exports'],
    authorization_requirements: ['Explicit approved release audience; no current numeric audience, including admin'],
    blockers: ['policy_pending'],
    proposal_document: 'SENSITIVE_AGGREGATE_DISCLOSURE_POLICY.md',
  },
  {
    methodology_id: 'canonical_geography', metric_ids: ['jobseekers_by_residence',
      'jobseekers_by_preferred_location', 'vacancies_by_work_location'], status: 'normalization_required',
    definition: 'Separate residence, preferred-work, vacancy, employer and event canonical geography dimensions.',
    required_data: ['Approved versioned government geographic reference and hierarchy',
      'Human-confirmed mapping with unresolved and conflicting values retained',
      'Effective dates, city/province relationships and source-specific foreign keys'],
    known_limitations: ['Current free text is not canonical', 'Casefold equivalence does not validate a place',
      'Employer address and event venue do not establish vacancy or residence geography'],
    privacy_requirements: ['Geographic disclosure design before counts or maps; no street/barangay release by default'],
    authorization_requirements: ['Metric-specific canonical jurisdiction scope; unknown mappings deny scoped access'],
    blockers: ['normalization_required', 'schema_required', 'policy_pending', 'authorization_required'],
    proposal_document: 'EMPLOYMENT_GEOGRAPHY_NORMALIZATION_READINESS_REPORT.md',
  },
  {
    methodology_id: 'verified_program_lifecycle', metric_ids: ['program_reach'], status: 'schema_required',
    definition: 'Distinct verified participation in a named program cycle at a specified lifecycle stage; no stage is inferred.',
    required_data: ['Program, cycle, participant and independently evidenced lifecycle transitions',
      'Stage dates, recorder/verifier, correction and deduplication rules',
      'Verified outcome link and explicit observational attribution methodology'],
    known_limitations: ['Assistance requests and training interests are not enrollment',
      'Referral services currently link medical records', 'No historical reach can be reconstructed safely'],
    privacy_requirements: ['Purpose-specific program access and intersecting-cell disclosure review'],
    authorization_requirements: ['Designated program officers and approved cycle/jurisdiction scopes'],
    blockers: ['schema_required', 'data_gap', 'policy_pending', 'authorization_required'],
    proposal_document: 'EMPLOYMENT_INTELLIGENCE_METHODOLOGY.md#verified-program-lifecycle-proposal',
  },
  {
    methodology_id: 'program_stage_metrics', metric_ids: [
      'program_referrals', 'program_applications', 'program_enrollments', 'program_starts',
      'program_completions', 'program_withdrawals', 'program_disqualifications',
      'unique_program_participants', 'program_participants_with_verified_employment',
    ], status: 'approved',
    definition: 'Operational effective event-occurrence counts including reported and verified lifecycle events; distinct-person current snapshots; only employment requires verified valid links.',
    required_data: ['Validated server-side aggregate RPC with correction-aware semantics',
      'Confirmed metric grain (transition-event count vs participation count)',
      'Service integration with employment intelligence dashboard',
      'Live role-based authorization testing'],
    known_limitations: ['Stage metrics count reported and verified transition occurrences, not unique participations; UTC half-open date ranges; dated snapshots are null/not_applicable',
      'Current snapshots are not historical cohorts',
      'Employment outcome is observational only; no causal claim'],
    privacy_requirements: ['Admin-only aggregate; no individual identifiers in aggregate responses'],
    authorization_requirements: ['Active admin only; deny all other roles'],
    blockers: [],
    proposal_document: 'EMPLOYMENT_INTELLIGENCE_METHODOLOGY.md#program-stage-metrics-proposal',
  },
  {
    methodology_id: 'supervisor_intelligence', metric_ids: [], status: 'authorization_required',
    definition: 'Future approved metric-family scopes for provincial, municipal/city or event-assigned supervisors.',
    required_data: ['Canonical approved jurisdiction grants and revocation/effective dates',
      'Metric-specific residence, work, event and application-cohort scope resolution',
      'Valid assignment evidence for any event-assigned scope'],
    known_limitations: ['Legacy free-text event matching is not residence or vacancy authorization',
      'is_provincial does not approve unrestricted analytics'],
    privacy_requirements: ['Audience and intersection disclosure review; sensitive output stays withheld'],
    authorization_requirements: ['Server-side allowlist, aggregate before output, scope-specific denominators and negative tests'],
    blockers: ['authorization_required', 'normalization_required', 'policy_pending'],
    proposal_document: 'EMPLOYMENT_INTELLIGENCE_ACCESS_MATRIX.md',
  },
  {
    methodology_id: 'staff_intelligence', metric_ids: [], status: 'authorization_required',
    definition: 'Future approved operational analytics for assigned events only, if an organizational need is approved.',
    required_data: ['Explicit event assignments and current staff role', 'Approved operational metric allowlist and expiry/revocation rules'],
    known_limitations: ['Current role alone does not establish province-wide analytics need',
      'An assignment table exists but is empty; no analytics grant is implied'],
    privacy_requirements: ['No personal rows or sensitive aggregates; export and audience review'],
    authorization_requirements: ['Deny by default; enforce assignments and metric-specific event scope on the server'],
    blockers: ['authorization_required', 'policy_pending', 'data_gap'],
    proposal_document: 'EMPLOYMENT_INTELLIGENCE_ACCESS_MATRIX.md',
  },
].map(methodology => ({
  ...methodology,
  readiness: methodology.methodology_id === 'program_stage_metrics' ? { data: true, semantics: true, privacy: true, authorization: true, tests: true } : { data: false, semantics: false, privacy: false, authorization: false, tests: false },
  approval_note: methodology.methodology_id === 'program_stage_metrics' ? 'Activation authorized after Phase 7E-B-003 deployment and live validation; active-admin operational aggregates only.' : 'PROPOSAL — REQUIRES ADMINISTRATIVE / LEGAL APPROVAL as applicable. No recorded approval; metric availability and access remain unchanged.',
  approval_reference: methodology.methodology_id === 'program_stage_metrics' ? 'PHASE_7E_B_PROGRAM_METRIC_ACTIVATION_REPORT.md' : null,
}))

export const EMPLOYMENT_INTELLIGENCE_METHODOLOGIES = freeze(Object.fromEntries(
  definitions.map(methodology => [methodology.methodology_id, methodology]),
))

export function getMethodology(id) {
  if (!Object.hasOwn(EMPLOYMENT_INTELLIGENCE_METHODOLOGIES, id)) throw new TypeError('Unknown employment intelligence methodology')
  return EMPLOYMENT_INTELLIGENCE_METHODOLOGIES[id]
}

export function getMetricMethodology(metricId) {
  getMetricDefinition(metricId)
  return Object.values(EMPLOYMENT_INTELLIGENCE_METHODOLOGIES).find(methodology => methodology.metric_ids.includes(metricId)) ?? null
}
