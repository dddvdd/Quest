// Application-level status enums. Each set mirrors the database enum and
// (where helpful) exposes a label + Tailwind badge class so UI code never
// rebuilds a switch table per page.

import { ROLES } from './roles'

export const EVENT_STATUS = {
  UPCOMING: 'upcoming',
  ONGOING: 'ongoing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
}

export const EVENT_STATUS_LABEL = {
  [EVENT_STATUS.UPCOMING]: 'Upcoming',
  [EVENT_STATUS.ONGOING]: 'Live',
  [EVENT_STATUS.COMPLETED]: 'Completed',
  [EVENT_STATUS.CANCELLED]: 'Cancelled',
}

export const EVENT_STATUS_BADGE = {
  [EVENT_STATUS.UPCOMING]: 'bg-blue-100 text-blue-800 border-blue-200',
  [EVENT_STATUS.ONGOING]: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  [EVENT_STATUS.COMPLETED]: 'bg-slate-100 text-slate-500 border-slate-200',
  [EVENT_STATUS.CANCELLED]: 'bg-red-50 text-red-600 border-red-200 line-through',
}

// "Active" = currently bookable for visitors and staff (upcoming + ongoing).
export function isEventActive(status) {
  return status === EVENT_STATUS.UPCOMING || status === EVENT_STATUS.ONGOING
}

export const CHECK_IN_STATUS = {
  PENDING: 'pending',
  CHECKED_IN: 'checked_in',
}

export const CHECK_IN_STATUS_LABEL = {
  [CHECK_IN_STATUS.PENDING]: 'Pending',
  [CHECK_IN_STATUS.CHECKED_IN]: 'Checked In',
}

export const CHECK_IN_STATUS_BADGE = {
  [CHECK_IN_STATUS.PENDING]: 'bg-amber-100 text-amber-800',
  [CHECK_IN_STATUS.CHECKED_IN]: 'bg-emerald-100 text-emerald-800',
}

export const REGISTRATION_TYPE = {
  PREREGISTERED: 'preregistered',
  WALKIN: 'walkin',
}

export const REGISTRATION_TYPE_LABEL = {
  [REGISTRATION_TYPE.PREREGISTERED]: 'Pre-registered',
  [REGISTRATION_TYPE.WALKIN]: 'Walk-in',
}

export const INTERVIEW_STATUS = {
  NOT_QUALIFIED: 'not_qualified',
  QUALIFIED: 'qualified',
  NEAR_HIRE: 'near_hire',
  HOTS: 'hots',
}

export const INTERVIEW_STATUS_LABEL = {
  [INTERVIEW_STATUS.NOT_QUALIFIED]: 'Not Qualified',
  [INTERVIEW_STATUS.QUALIFIED]: 'Qualified',
  [INTERVIEW_STATUS.NEAR_HIRE]: 'Near Hire',
  [INTERVIEW_STATUS.HOTS]: 'Hired On The Spot',
}

export const INTERVIEW_STATUS_BADGE = {
  [INTERVIEW_STATUS.NOT_QUALIFIED]: 'bg-red-100 text-red-800',
  [INTERVIEW_STATUS.QUALIFIED]: 'bg-emerald-100 text-emerald-800',
  [INTERVIEW_STATUS.NEAR_HIRE]: 'bg-amber-100 text-amber-800',
  [INTERVIEW_STATUS.HOTS]: 'bg-blue-100 text-blue-800',
}

// HOTS interviews are the only ones that feed the medical-referrals flow.
export function isHotsInterview(status) {
  return status === INTERVIEW_STATUS.HOTS
}

export const REFERRAL_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
}

export const REFERRAL_STATUS_LABEL = {
  [REFERRAL_STATUS.PENDING]: 'Pending',
  [REFERRAL_STATUS.COMPLETED]: 'Completed',
  [REFERRAL_STATUS.CANCELLED]: 'Cancelled',
}

export const REFERRAL_STATUS_BADGE = {
  [REFERRAL_STATUS.PENDING]: 'bg-amber-100 text-amber-800',
  [REFERRAL_STATUS.COMPLETED]: 'bg-emerald-100 text-emerald-800',
  [REFERRAL_STATUS.CANCELLED]: 'bg-red-100 text-red-800',
}

export const EMPLOYER_REGISTRATION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
}

export const EMPLOYER_REGISTRATION_STATUS_LABEL = {
  [EMPLOYER_REGISTRATION_STATUS.PENDING]: 'PENDING PESO REVIEW',
  [EMPLOYER_REGISTRATION_STATUS.APPROVED]: 'ACCREDITED',
  [EMPLOYER_REGISTRATION_STATUS.REJECTED]: 'REJECTED',
}

export const EMPLOYER_REGISTRATION_STATUS_BADGE = {
  [EMPLOYER_REGISTRATION_STATUS.PENDING]: 'bg-amber-100 text-amber-800',
  [EMPLOYER_REGISTRATION_STATUS.APPROVED]: 'bg-emerald-100 text-emerald-800',
  [EMPLOYER_REGISTRATION_STATUS.REJECTED]: 'bg-red-100 text-red-800',
}

// Only accredited employers can post vacancies and participate in events
// (enforced server-side by RLS; mirrored here so the UI doesn't show
// gated actions to a pending employer).
export function isEmployerAccredited(employer) {
  return employer?.registration_status === EMPLOYER_REGISTRATION_STATUS.APPROVED
}

export const ACCREDITATION_REQUIREMENT_STATUS = {
  NOT_SUBMITTED: 'not_submitted',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  NEEDS_CORRECTION: 'needs_correction',
  REJECTED: 'rejected',
}

export const ACCREDITATION_REQUIREMENT_LABEL = {
  [ACCREDITATION_REQUIREMENT_STATUS.NOT_SUBMITTED]: 'NOT SUBMITTED',
  [ACCREDITATION_REQUIREMENT_STATUS.SUBMITTED]: 'SUBMITTED',
  [ACCREDITATION_REQUIREMENT_STATUS.APPROVED]: 'APPROVED',
  [ACCREDITATION_REQUIREMENT_STATUS.NEEDS_CORRECTION]: 'NEEDS CORRECTION',
  [ACCREDITATION_REQUIREMENT_STATUS.REJECTED]: 'REJECTED',
}

export const ACCREDITATION_REQUIREMENT_BADGE = {
  [ACCREDITATION_REQUIREMENT_STATUS.NOT_SUBMITTED]: 'bg-slate-100 text-slate-600',
  [ACCREDITATION_REQUIREMENT_STATUS.SUBMITTED]: 'bg-blue-100 text-blue-800',
  [ACCREDITATION_REQUIREMENT_STATUS.APPROVED]: 'bg-emerald-100 text-emerald-800',
  [ACCREDITATION_REQUIREMENT_STATUS.NEEDS_CORRECTION]: 'bg-amber-100 text-amber-800',
  [ACCREDITATION_REQUIREMENT_STATUS.REJECTED]: 'bg-red-100 text-red-800',
}

export const ACCREDITATION_REQUIREMENT_ICON = {
  [ACCREDITATION_REQUIREMENT_STATUS.APPROVED]: '✓',
  [ACCREDITATION_REQUIREMENT_STATUS.SUBMITTED]: '⏳',
  [ACCREDITATION_REQUIREMENT_STATUS.NEEDS_CORRECTION]: '⚠',
  [ACCREDITATION_REQUIREMENT_STATUS.REJECTED]: '✗',
  [ACCREDITATION_REQUIREMENT_STATUS.NOT_SUBMITTED]: '○',
}

// Centralised so landing-page redirects ("after login") don't repeat the
// role-to-route mapping across App.jsx, StaffLayout, SupervisorLayout, etc.
export const ROLE_HOME = {
  [ROLES.APPLICANT]: '/',
  [ROLES.EMPLOYER]: '/employer/dashboard',
  [ROLES.STAFF]: '/staff/scanner',
  [ROLES.SUPERVISOR]: '/supervisor',
  [ROLES.MEDICAL]: '/medical/dashboard',
  [ROLES.ADMIN]: '/admin/dashboard',
}