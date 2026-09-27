// Event-list hooks used by Quest Board + Staff/Scanner event selector.

import { useEffect, useState } from 'react'
import { eventService } from '../../services/eventService'
import { EVENT_STATUS } from '../../domain/statuses'

export function useActiveEvents() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    eventService
      .listActive()
      .then((rows) => { if (alive) { setEvents(rows || []); setLoading(false) } })
      .catch(() => { if (alive) { setEvents([]); setLoading(false) } })
    return () => { alive = false }
  }, [])
  return { events, loading }
}

export function useStaffEvents() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    eventService
      .listForStaff()
      .then((rows) => { if (alive) { setEvents(rows || []); setLoading(false) } })
      .catch(() => { if (alive) { setEvents([]); setLoading(false) } })
    return () => { alive = false }
  }, [])
  return { events, loading }
}

export function useStaffEventsAnyStatus() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    eventService
      .listForStaffAnyStatus()
      .then((rows) => { if (alive) { setEvents(rows || []); setLoading(false) } })
      .catch(() => { if (alive) { setEvents([]); setLoading(false) } })
    return () => { alive = false }
  }, [])
  return { events, loading }
}

export function useAllEventsOrdered() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    eventService
      .listAllOrdered()
      .then((rows) => { if (alive) { setEvents(rows || []); setLoading(false) } })
      .catch(() => { if (alive) { setEvents([]); setLoading(false) } })
    return () => { alive = false }
  }, [])
  return { events, loading }
}

export { EVENT_STATUS }