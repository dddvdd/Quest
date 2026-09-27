// Event taxonomy. Mirrors the DB enums in
// supabase/migration_event_type.sql (`event_type` and `recruitment_type`).
// Display labels, badges, and the Quest Board tag live alongside the
// canonical values so all UI renders go through one source.

export const EVENT_TYPE = {
  JOB_FAIR: 'job_fair',
  RECRUITMENT_ACTIVITY: 'recruitment_activity',
  ONLINE: 'online',
}

export const EVENT_TYPE_LABEL = {
  [EVENT_TYPE.JOB_FAIR]: 'Job Fair',
  [EVENT_TYPE.RECRUITMENT_ACTIVITY]: 'Recruitment Activity',
  [EVENT_TYPE.ONLINE]: 'Online / In the Platform',
}

export const EVENT_TYPE_BADGE = {
  [EVENT_TYPE.JOB_FAIR]: 'bg-blue-100 text-blue-800',
  [EVENT_TYPE.RECRUITMENT_ACTIVITY]: 'bg-purple-100 text-purple-800',
  [EVENT_TYPE.ONLINE]: 'bg-teal-100 text-teal-800',
}

export function eventTypeLabel(type) {
  return EVENT_TYPE_LABEL[type] || type || EVENT_TYPE_LABEL[EVENT_TYPE.JOB_FAIR]
}

export function eventTypeBadgeClass(type) {
  return EVENT_TYPE_BADGE[type] || 'bg-slate-100 text-slate-700'
}

export const RECRUITMENT_TYPE = {
  LOCAL: 'local',
  SPECIAL: 'special',
}

export const RECRUITMENT_TYPE_LABEL = {
  [RECRUITMENT_TYPE.LOCAL]: 'Local',
  [RECRUITMENT_TYPE.SPECIAL]: 'Special (Overseas)',
}

// Compact single-line label for dropdowns/tables.
export function eventTypeDisplay(event) {
  const base = eventTypeLabel(event?.event_type)
  if (event?.event_type === EVENT_TYPE.RECRUITMENT_ACTIVITY && event?.recruitment_type) {
    return `${base} — ${RECRUITMENT_TYPE_LABEL[event.recruitment_type] || event.recruitment_type}`
  }
  return base
}

export const EVENT_TYPE_OPTIONS = [
  { value: EVENT_TYPE.JOB_FAIR, label: EVENT_TYPE_LABEL[EVENT_TYPE.JOB_FAIR] },
  { value: EVENT_TYPE.RECRUITMENT_ACTIVITY, label: EVENT_TYPE_LABEL[EVENT_TYPE.RECRUITMENT_ACTIVITY] },
  { value: EVENT_TYPE.ONLINE, label: EVENT_TYPE_LABEL[EVENT_TYPE.ONLINE] },
]

export const RECRUITMENT_TYPE_OPTIONS = [
  { value: RECRUITMENT_TYPE.LOCAL, label: RECRUITMENT_TYPE_LABEL[RECRUITMENT_TYPE.LOCAL] },
  { value: RECRUITMENT_TYPE.SPECIAL, label: RECRUITMENT_TYPE_LABEL[RECRUITMENT_TYPE.SPECIAL] },
]

// Quest Board card tag, derived from the same canonical labels.
export function questTag(event) {
  if (event?.event_type === EVENT_TYPE.RECRUITMENT_ACTIVITY) {
    return event?.recruitment_type === RECRUITMENT_TYPE.SPECIAL
      ? '◈ SPECIAL RECRUITMENT'
      : '◈ RECRUITMENT ACTIVITY'
  }
  if (event?.event_type === EVENT_TYPE.ONLINE) return '◈ ONLINE'
  return '◈ JOB FAIR'
}