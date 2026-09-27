import { employmentIntelligenceService } from './employmentIntelligenceService.js'
import { planIntelligenceRequests } from '../domain/employmentIntelligenceDashboard.js'

// Cache lifetime is a mounted dashboard; no personal rows or persistent cache.
export function createIntelligenceDashboardLoader(service = employmentIntelligenceService) {
  const cache = new Map()
  const keyOf = request => JSON.stringify([request.quality?'quality':request.ids,request.options])
  function load(request) {
    const key=keyOf(request)
    if (!cache.has(key)) {
      const pending = Promise.resolve().then(() => request.quality
        ? service.getDataQualitySummary(request.options) : service.getMetrics(request.ids,request.options))
      cache.set(key,pending)
      pending.catch(() => { if (cache.get(key)===pending) cache.delete(key) })
    }
    return cache.get(key)
  }
  return { plan:planIntelligenceRequests,load,
    invalidate: request => cache.delete(keyOf(request)),
    clear: () => cache.clear() }
}

