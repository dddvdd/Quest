import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { PixelArrow, PixelBriefcase } from '../../components/public/pixel'
import ThemeToggle from '../../components/ThemeToggle'
import { languageService } from '../../services/languageService'
import { referenceService } from '../../services/referenceService'

const PROFICIENCY_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'elementary', label: 'Elementary' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'fluent', label: 'Fluent' },
  { value: 'native', label: 'Native' },
]

const EMPTY = {
  language_id: '',
  speaking_proficiency: '',
  reading_proficiency: '',
  writing_proficiency: '',
  is_native: false,
}

const input = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'

function proficiencyLabel(value) {
  return PROFICIENCY_OPTIONS.find(o => o.value === value)?.label || '—'
}

function LanguageSearchSelect({ languages, value, onChange, usedIds }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = languages.find(l => l.id === value)

  useEffect(() => {
    function handleClick(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const filtered = languages.filter(l => {
    if (usedIds.includes(l.id)) return false
    if (!search) return true
    return l.name.toLowerCase().includes(search.toLowerCase()) || (l.code || '').toLowerCase().includes(search.toLowerCase())
  })

  return (
    <div ref={ref} className="relative">
      <input
        className={`${input} mt-1`}
        placeholder="Search languages…"
        value={selected && !open ? selected.name : search}
        onFocus={() => { setOpen(true); setSearch('') }}
        onChange={e => { setSearch(e.target.value); setOpen(true) }}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.map(l => (
            <li key={l.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                onMouseDown={e => { e.preventDefault(); onChange(l.id); setSearch(''); setOpen(false) }}
              >
                {l.name}{l.code ? ` (${l.code})` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function LanguagesPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [canonicalLanguages, setCanonicalLanguages] = useState([])
  const [editing, setEditing] = useState(null) // null = list, 'new' = adding, {id} = editing
  const [saving, setSaving] = useState(false)
  const form = useForm({ defaultValues: EMPTY })
  const { register, handleSubmit, reset, watch, setValue, formState: { errors: _errors } } = form
  const currentLanguageId = watch('language_id')

  useEffect(() => {
    let alive = true
    languageService.listMine()
      .then((rows) => { if (alive) setItems(rows || []) })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    referenceService.listLanguages()
      .then(rows => setCanonicalLanguages(rows || []))
      .catch(() => {})
  }, [])

  const usedLanguageIds = items.filter(i => editing === 'new' || i.id !== editing?.id).map(i => i.language_id).filter(Boolean)

  function startAdd() { setEditing('new'); reset(EMPTY) }
  function startEdit(item) { setEditing(item); reset({ ...EMPTY, ...item, language_id: item.language_id || '' }) }
  function cancel() { setEditing(null) }

  async function onSubmit(values) {
    setSaving(true)
    try {
      if (!values.language_id) throw new Error('Please select a language')
      const payload = {
        language_id: values.language_id,
        speaking_proficiency: values.speaking_proficiency || null,
        reading_proficiency: values.reading_proficiency || null,
        writing_proficiency: values.writing_proficiency || null,
        is_native: !!values.is_native,
        source: 'self_reported',
      }
      if (editing === 'new') {
        const created = await languageService.create(payload)
        setItems((prev) => [created, ...prev])
        toast.success('Language added')
      } else {
        const updated = await languageService.update(editing.id, payload)
        setItems((prev) => prev.map(i => i.id === editing.id ? updated : i))
        toast.success('Language updated')
      }
      setEditing(null)
    } catch (e) {
      toast.error(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this language?')) return
    try {
      await languageService.remove(id)
      setItems((prev) => prev.filter(i => i.id !== id))
      toast.success('Deleted')
    } catch (e) {
      toast.error(e.message || 'Failed to delete')
    }
  }

  function languageName(item) {
    return item.languages?.name || item.language_name || 'Unknown language'
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Loading languages…</main>

  // --- Edit / Add form ---
  if (editing) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 px-4 py-8 sm:px-6" role="presentation">
        <div className="mx-auto flex min-h-full max-w-2xl items-center justify-center">
          <div className="w-full rounded-2xl bg-white shadow-xl ring-1 ring-slate-200" role="dialog" aria-modal="true" aria-labelledby="language-modal-title">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
              <h1 id="language-modal-title" className="text-lg font-bold text-slate-900">{editing === 'new' ? 'Add Language' : 'Edit Language'}</h1>
              <button type="button" onClick={cancel} className="rounded-lg px-2 py-1 text-2xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Close">×</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="max-h-[calc(100vh-10rem)] space-y-4 overflow-y-auto p-5 sm:p-6">
              <label className="block text-sm font-medium text-slate-700">Language
                <LanguageSearchSelect
                  languages={canonicalLanguages}
                  value={currentLanguageId}
                  onChange={(id) => setValue('language_id', id)}
                  usedIds={usedLanguageIds}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block text-sm font-medium text-slate-700">Speaking
                  <select {...register('speaking_proficiency')} className={`${input} mt-1`}>
                    <option value="">Not rated</option>
                    {PROFICIENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">Reading
                  <select {...register('reading_proficiency')} className={`${input} mt-1`}>
                    <option value="">Not rated</option>
                    {PROFICIENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700">Writing
                  <select {...register('writing_proficiency')} className={`${input} mt-1`}>
                    <option value="">Not rated</option>
                    {PROFICIENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" {...register('is_native')} className="h-4 w-4 rounded text-blue-600" />
                This is my native language
              </label>
              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button type="submit" disabled={saving} className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
                  {saving ? 'Saving…' : editing === 'new' ? 'Add Language' : 'Save Changes'}
                </button>
                <button type="button" onClick={cancel} className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // --- List view ---
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link to="/profile" className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900">
            <PixelArrow className="h-4 w-4 rotate-180" /> Profile
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Languages</h1>
            <p className="mt-1 text-sm text-slate-500">Add the languages you speak and your proficiency level for each.</p>
          </div>
          <button onClick={startAdd} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
            + Add
          </button>
        </div>

        {items.length === 0 ? (
          <div className="mt-12 rounded-2xl border-2 border-dashed border-slate-200 bg-white p-8 text-center">
            <PixelBriefcase className="mx-auto h-6 w-6 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-500">No languages recorded yet.</p>
            <p className="mt-1 text-xs text-slate-400">Add languages to strengthen your profile.</p>
            <button onClick={startAdd} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
              Add First Language
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {items.map(item => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">
                      {languageName(item)}
                      {item.is_native && <span className="ml-2 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">Native</span>}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      {item.speaking_proficiency && <span>Speaking: {proficiencyLabel(item.speaking_proficiency)}</span>}
                      {item.reading_proficiency && <span>Reading: {proficiencyLabel(item.reading_proficiency)}</span>}
                      {item.writing_proficiency && <span>Writing: {proficiencyLabel(item.writing_proficiency)}</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => startEdit(item)} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">Edit</button>
                    <button onClick={() => handleDelete(item.id)} className="rounded-md px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
