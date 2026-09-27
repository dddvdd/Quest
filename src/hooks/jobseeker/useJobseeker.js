// Jobseeker hooks — combine participant/profile queries for UI use.

import { useEffect, useState } from 'react'
import { participantService } from '../../services/participantService'

export function useParticipant(enabled = true) {
  const [participant, setParticipant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!enabled) {
      setParticipant(null)
      setError(null)
      setLoading(false)
      return undefined
    }

    let alive = true
    setLoading(true)
    participantService
      .getOrCreateParticipant()
      .then((p) => { if (alive) { setParticipant(p); setLoading(false) } })
      .catch((err) => { if (alive) { setError(err); setLoading(false) } })
    return () => { alive = false }
  }, [enabled])

  return { participant, loading, error }
}

export function useJobseekerProfile(participantId) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!participantId) { setLoading(false); return }
    let alive = true
    setLoading(true)
    participantService
      .fetchJobseekerProfile(participantId)
      .then((row) => { if (alive) { setProfile(row); setLoading(false) } })
      .catch(() => { if (alive) { setProfile(null); setLoading(false) } })
    return () => { alive = false }
  }, [participantId])

  return { profile, loading }
}
