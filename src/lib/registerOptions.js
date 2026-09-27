// Shared option lists reused across applicant + employer registration forms.

export const INDUSTRY_OPTIONS = [
  'Agriculture, Forestry & Fishing',
  'Mining & Quarrying',
  'Manufacturing',
  'Electricity, Gas, Steam & Air Conditioning',
  'Water Supply & Waste Management',
  'Construction',
  'Wholesale & Retail Trade',
  'Transportation & Storage',
  'Accommodation & Food Service',
  'Information & Communication (BPO / IT)',
  'Financial & Insurance Activities',
  'Real Estate Activities',
  'Professional, Scientific & Technical',
  'Administrative & Support Services',
  'Public Administration & Defense',
  'Education',
  'Human Health & Social Work',
  'Arts, Entertainment & Recreation',
  'Other Service Activities',
  'Households as Employers',
  'Overseas Employment'
].sort()

// Contact-number input handler matching the applicant form:
// strips non-digits and caps length by format (09 → 11 digits, 9 → 10).
export function normalizeContactInput(value) {
  let val = String(value ?? '').replace(/\D/g, '')
  const limit = val.startsWith('9') && !val.startsWith('09') ? 10 : 11
  if (val.length > limit) val = val.slice(0, limit)
  return val
}

export function contactMaxLen(clean) {
  return clean.startsWith('9') && !clean.startsWith('09') ? 10 : 11
}
