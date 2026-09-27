import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { aiReviewService } from '../../services/aiReviewService.js'
import { PixelBriefcase, PixelPin, PixelStar, PixelUser } from '../public/pixel'
import ReviewModal from './ReviewModal.jsx'

const TYPE_BADGE = {
  skill: 'bg-blue-100 text-blue-800',
  certification: 'bg-emerald-100 text-emerald-800',
  occupation: 'bg-purple-100 text-purple-800',
  industry: 'bg-cyan-100 text-cyan-800',
  education_requirement: 'bg-amber-100 text-amber-800',
  experience_requirement: 'bg-orange-100 text-orange-800',
  language: 'bg-teal-100 text-teal-800',
}

const PROVENANCE_BADGE = {
  explicit: 'bg-blue-100 text-blue-800',
  inferred: 'bg-amber-100 text-amber-800',
  ambiguous: 'bg-slate-100 text-slate-700',
}

const INTENT_BADGE = {
  preference: 'bg-emerald-100 text-emerald-800',
  historical: 'bg-amber-100 text-amber-800',
  unknown: 'bg-slate-100 text-slate-700',
}

const RESOLUTION_BADGE = {
  RESOLVED: 'bg-emerald-100 text-emerald-800',
  AMBIGUOUS: 'bg-amber-100 text-amber-800',
  UNRESOLVED: 'bg-red-100 text-red-800',
}

const ENTITY_TYPE_LABEL = {
  jobseeker_profile: 'Jobseeker',
  vacancy: 'Vacancy',
}

const CONFIDENCE_LABELS = [
  { min: 0.85, label: 'High', className: 'text-emerald-700' },
  { min: 0.6, label: 'Medium', className: 'text-amber-700' },
  { min: 0, label: 'Low', className: 'text-red-700' },
]

function PixelBuilding({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 8 8" className={className} fill="currentColor" shapeRendering="crispEdges" aria-hidden>
      <rect x="1" y="0" width="6" height="8" />
      <rect x="2" y="2" width="1" height="1" fill="#ffffff" opacity=".85" />
      <rect x="5" y="2" width="1" height="1" fill="#ffffff" opacity=".85" />
      <rect x="2" y="4" width="1" height="1" fill="#ffffff" opacity=".6" />
      <rect x="5" y="4" width="1" height="1" fill="#ffffff" opacity=".6" />
      <rect x="3" y="6" width="2" height="2" fill="#ffffff" opacity=".55" />
    </svg>
  )
}

function PixelReview({ className = 'w-4 h-4' }) {
  return (
    <svg viewBox="0 0 8 8" className={className} fill="currentColor" shapeRendering="crispEdges" aria-hidden>
      <rect x="1" y="1" width="6" height="6" />
      <rect x="2" y="3" width="1" height="1" fill="#ffffff" opacity=".85" />
      <rect x="4" y="3" width="2" height="1" fill="#ffffff" opacity=".85" />
      <rect x="2" y="5" width="4" height="1" fill="#ffffff" opacity=".6" />
    </svg>
  )
}

function confidenceLabel(confidence = 0) {
  return CONFIDENCE_LABELS.find(item => confidence >= item.min) || CONFIDENCE_LABELS.at(-1)
}

function formatType(type = '') {
  return type.replaceAll('_', ' ')
}

function ensureReviewSuccess(result, fallback) {
  if (result?.error) throw new Error(result.error)
  if (result?.success === false) throw new Error(result.message || fallback)
}

export default function ExtractionQueue({ title = 'AI Extraction Review', description, entityType, entityId }) {
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('all')
  const [filterEntityType, setFilterEntityType] = useState(entityType || 'all')
  const [filterResolution, setFilterResolution] = useState('all')
  const [selectedSuggestion, setSelectedSuggestion] = useState(null)

  const loadSuggestions = useCallback(async () => {
    setLoading(true)
    try {
      const data = await aiReviewService.listPendingSuggestions({
        entityType: filterEntityType === 'all' ? undefined : filterEntityType,
        entityId,
        resolutionStatus: filterResolution === 'all' ? undefined : filterResolution,
      })
      setSuggestions(data || [])
    } catch (err) {
      toast.error(`Failed to load suggestions: ${err.message}`)
      setSuggestions([])
    } finally {
      setLoading(false)
    }
  }, [filterEntityType, filterResolution, entityId])

  useEffect(() => {
    loadSuggestions()
  }, [loadSuggestions])

  const handleAccept = async (suggestionId, editedCanonicalId) => {
    try {
      const result = await aiReviewService.acceptSuggestion(suggestionId, editedCanonicalId)
      ensureReviewSuccess(result, 'Accept failed')
      toast.success('Suggestion accepted')
      await loadSuggestions()
    } catch (err) {
      toast.error(`Accept failed: ${err.message}`)
      throw err
    }
  }

  const handleReject = async (suggestionId, reviewNote) => {
    try {
      const result = await aiReviewService.rejectSuggestion(suggestionId, reviewNote)
      ensureReviewSuccess(result, 'Reject failed')
      toast.success('Suggestion rejected')
      await loadSuggestions()
    } catch (err) {
      toast.error(`Reject failed: ${err.message}`)
      throw err
    }
  }

  const handleEdit = async (suggestionId, editedTerm, editedCanonicalId) => {
    try {
      const result = await aiReviewService.editSuggestion(suggestionId, editedTerm, editedCanonicalId)
      ensureReviewSuccess(result, 'Edit failed')
      toast.success('Suggestion edited and accepted')
      await loadSuggestions()
    } catch (err) {
      toast.error(`Edit failed: ${err.message}`)
      throw err
    }
  }

  const getTypeIcon = (type) => {
    switch (type) {
      case 'skill': return <PixelBriefcase className="h-3 w-3" />
      case 'certification': return <PixelStar className="h-3 w-3" />
      case 'occupation': return <PixelUser className="h-3 w-3" />
      case 'industry': return <PixelBuilding className="h-3 w-3" />
      default: return <PixelStar className="h-3 w-3" />
    }
  }

  const filteredSuggestions = suggestions.filter((s) => filterType === 'all' || s.suggestion_type === filterType)

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-slate-500">
        Loading extraction queue...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-black text-slate-900">{title}</h1>
        {description && <p className="max-w-3xl text-sm text-slate-600">{description}</p>}
      </header>

      <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-3">
        {!entityType && (
          <select
            value={filterEntityType}
            onChange={(e) => setFilterEntityType(e.target.value)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Entity Types</option>
            <option value="jobseeker_profile">Jobseeker Profiles</option>
            <option value="vacancy">Vacancies</option>
          </select>
        )}
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Types</option>
          <option value="skill">Skill</option>
          <option value="certification">Certification</option>
          <option value="occupation">Occupation</option>
          <option value="industry">Industry</option>
          <option value="education_requirement">Education Requirement</option>
          <option value="experience_requirement">Experience Requirement</option>
          <option value="language">Language</option>
        </select>
        <select
          value={filterResolution}
          onChange={(e) => setFilterResolution(e.target.value)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Resolution States</option>
          <option value="RESOLVED">Resolved</option>
          <option value="AMBIGUOUS">Ambiguous</option>
          <option value="UNRESOLVED">Unresolved</option>
        </select>
        <button
          type="button"
          onClick={loadSuggestions}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {filteredSuggestions.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white py-12 text-center">
          <PixelPin className="mx-auto h-10 w-10 text-slate-300" />
          <h3 className="mt-4 text-lg font-semibold text-slate-900">No pending suggestions</h3>
          <p className="mt-1 text-sm text-slate-500">All matching AI extraction suggestions have been reviewed.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Raw Term</th>
                <th className="px-4 py-3">Canonical</th>
                <th className="px-4 py-3">Provenance</th>
                <th className="px-4 py-3">Intent</th>
                <th className="px-4 py-3">Resolution</th>
                <th className="px-4 py-3">Confidence</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSuggestions.map((s) => {
                const confidence = confidenceLabel(Number(s.confidence || 0))
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {s.entity_type === 'jobseeker_profile' ? (
                          <PixelUser className="h-4 w-4 text-blue-600" />
                        ) : (
                          <PixelBuilding className="h-4 w-4 text-purple-600" />
                        )}
                        <span className="font-medium text-slate-900">
                          {ENTITY_TYPE_LABEL[s.entity_type] || s.entity_type}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${TYPE_BADGE[s.suggestion_type] || 'bg-slate-100 text-slate-700'}`}>
                        {getTypeIcon(s.suggestion_type)}
                        {formatType(s.suggestion_type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700">{s.raw_term}</td>
                    <td className="px-4 py-3 text-slate-600">{s.canonical_name || 'No match'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${PROVENANCE_BADGE[s.provenance] || 'bg-slate-100 text-slate-700'}`}>
                        {s.provenance}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${INTENT_BADGE[s.source_intent] || 'bg-slate-100 text-slate-700'}`}>
                        {s.source_intent}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${RESOLUTION_BADGE[s.resolution_status] || 'bg-slate-100 text-slate-700'}`}>
                        {s.resolution_status || 'UNRESOLVED'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <span className={`font-semibold ${confidence.className}`}>{confidence.label}</span>
                      <span className="ml-1 text-xs text-slate-500">({(Number(s.confidence || 0) * 100).toFixed(0)}%)</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedSuggestion(s)}
                        className="inline-flex items-center gap-1 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <PixelReview className="h-3 w-3" /> Review
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedSuggestion && (
        <ReviewModal
          suggestion={selectedSuggestion}
          onClose={() => setSelectedSuggestion(null)}
          onAccept={handleAccept}
          onReject={handleReject}
          onEdit={handleEdit}
        />
      )}
    </div>
  )
}
