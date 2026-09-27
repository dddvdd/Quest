// Application-level role identifiers. These mirror the database enum
// (see supabase/schema.sql `tc_user_role`) and the value added by the
// employer migration. Database values are NOT changed — these constants
// are an app-side abstraction so role checks never hard-code strings.

export const ROLES = {
  APPLICANT: 'applicant',
  STAFF: 'staff',
  SUPERVISOR: 'supervisor',
  MEDICAL: 'medical',
  ADMIN: 'admin',
  EMPLOYER: 'employer',
}

export const ALL_ROLES = [
  ROLES.APPLICANT,
  ROLES.STAFF,
  ROLES.SUPERVISOR,
  ROLES.MEDICAL,
  ROLES.ADMIN,
  ROLES.EMPLOYER,
]

// True when the role can act as an event-day staff member (scanner,
// check-in, manual search, medical referrals, interviews). Mirrors the
// `app.is_event_staff()` database helper. Applicant/employer are NOT
// staff-level — they have a different surface.
export function isEventStaff(role) {
  return role === ROLES.STAFF
    || role === ROLES.SUPERVISOR
    || role === ROLES.MEDICAL
    || role === ROLES.ADMIN
}

export function canManageEmployers(role) {
  return role === ROLES.ADMIN
}