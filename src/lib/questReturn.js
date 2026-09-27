// Preserves the applicant's intended Quest destination across the
// Google OAuth redirect. localStorage survives the full-page redirect;
// sessionStorage would not reliably survive browser handoff.
//
// Shape: { eventId, returnTo, action, savedAt }

const KEY = 'quest_return'

// Stale-state guard: an unfinished quest flow older than 24h must never
// hijack an unrelated future sign-in. Expired entries simply read as null.
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export function saveQuestReturn(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...state, savedAt: Date.now() }))
  } catch {
    // storage unavailable — flow degrades to the default post-auth route
  }
}

export function readQuestReturn() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (!raw?.returnTo || !raw?.eventId || !raw?.savedAt) return null
    if (Date.now() - raw.savedAt > MAX_AGE_MS) return null
    return raw
  } catch {
    return null
  }
}

export function clearQuestReturn() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
