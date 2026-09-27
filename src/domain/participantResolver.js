// Participant resolver — pure decoding logic that turns any QR payload
// (Pass, legacy registrant JSON, employer EMP-code, raw legacy id/token,
// raw numeric id) into a normalised shape. Kept separate from the page
// and from the scanner camera so it can be reused (and unit-tested).

import { participantService } from '../services/participantService'
import { registrantService } from '../services/registrantService'
import { checkInService } from '../services/checkInService'

export const RESOLUTION = Object.freeze({
  PASS_PARTICIPANT: 'pass_participant',
  LEGACY_PARTICIPANT: 'legacy_participant',
  EMPLOYER: 'employer',
  NOT_FOUND: 'unknown',
})

function tryParseJson(text) {
  try { return JSON.parse(text) } catch { return null }
}

// Pure string-level decode — returns the *kind* of payload and the
// extracted pieces. No DB calls.
export function decodeQrPayload(rawText) {
  const text = String(rawText || '').trim()
  if (!text) return { kind: RESOLUTION.NOT_FOUND }

  if (/^EMP-\d+$/i.test(text)) {
    return { kind: RESOLUTION.EMPLOYER, employerCode: text.toUpperCase() }
  }

  const parsed = tryParseJson(text)
  if (parsed && typeof parsed === 'object') {
    if (parsed.pass) return { kind: RESOLUTION.PASS_PARTICIPANT, passId: parsed.pass }
    if (parsed.id) return { kind: RESOLUTION.LEGACY_PARTICIPANT, legacyId: parsed.id }
    if (parsed.token) return { kind: RESOLUTION.LEGACY_PARTICIPANT, legacyToken: parsed.token }
  }

  // Numeric → treat as legacy id (or unique_id).
  if (/^\d+$/.test(text)) {
    return { kind: RESOLUTION.LEGACY_PARTICIPANT, legacyNumeric: text }
  }

  // Otherwise fall through to a string match against legacy columns.
  return { kind: RESOLUTION.LEGACY_PARTICIPANT, legacyString: text }
}

function joinName(profile) {
  if (!profile) return 'Unknown'
  return [profile.first_name, profile.middle_name, profile.last_name].filter(Boolean).join(' ')
}

// Resolve the QR into a participant record. Returns:
//   { kind, participantId, profile, passId }
// or { kind: 'unknown' }.
export async function resolveParticipant(rawText) {
  const decoded = decodeQrPayload(rawText)
  if (decoded.kind === RESOLUTION.EMPLOYER) return decoded

  if (decoded.kind === RESOLUTION.PASS_PARTICIPANT) {
    const p = await participantService.findParticipantByPass(decoded.passId)
    if (!p) return { kind: RESOLUTION.NOT_FOUND }
    const profRows = await participantService.fetchJobseekerProfileByParticipantId(p.id)
    const profile = (profRows || [])[0] || null
    return {
      kind: RESOLUTION.PASS_PARTICIPANT,
      participantId: p.id,
      passId: p.public_pass_id,
      profile,
      name: joinName(profile),
    }
  }

  // Legacy fallback path: registrants view → event_participations → participants.
  let legacy = null
  if (decoded.legacyId) legacy = await registrantService.findLegacyById(decoded.legacyId)
  else if (decoded.legacyToken) legacy = await registrantService.findLegacyByToken(decoded.legacyToken)
  else if (decoded.legacyNumeric) {
    // legacyNumeric may be either an id or a unique_id; try both via the
    // string search path (PostgREST or-filter matches either).
    legacy = await registrantService.findLegacyByString(decoded.legacyNumeric)
  } else if (decoded.legacyString) {
    legacy = await registrantService.findLegacyByString(decoded.legacyString)
  }

  if (!legacy) return { kind: RESOLUTION.NOT_FOUND }

  const ep = await registrantService.getParticipationForLegacy(legacy.id)
  const participant = ep ? await participantService.findParticipantById(ep.participant_id) : null
  if (!participant) return { kind: RESOLUTION.NOT_FOUND }

  const profile = {
    first_name: legacy.first_name,
    middle_name: legacy.middle_name,
    last_name: legacy.last_name,
  }
  return {
    kind: RESOLUTION.LEGACY_PARTICIPANT,
    participantId: participant.id,
    passId: participant.public_pass_id,
    profile,
    name: joinName(profile),
  }
}

// Find or create the event participation for the resolved participant.
export async function resolveParticipation(participantId, eventId) {
  return participantService.findEventParticipation(participantId, eventId)
}

// Wraps the employer-gate check-in.
export async function checkInEmployerGate(employerCode, eventId) {
  return checkInService.checkInEmployer(employerCode, eventId)
}

export const participantResolver = {
  decodeQrPayload,
  resolveParticipant,
  resolveParticipation,
  checkInEmployerGate,
  RESOLUTION,
}