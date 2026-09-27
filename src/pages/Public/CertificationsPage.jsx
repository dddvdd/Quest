import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { PixelArrow, PixelBriefcase } from '../../components/public/pixel'
import ThemeToggle from '../../components/ThemeToggle'
import { certificationService } from '../../services/certificationService'
import { referenceService } from '../../services/referenceService'

const EMPTY = {
  certification_id: '',
  credential_name_override: '',
  issuing_organization_override: '',
  credential_number: '',
  date_issued: '',
  expiration_date: '',
  does_not_expire: false,
  verification_url: '',
}

const input = 'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'

function formatDate(value) {
  if (!value) return ''
  const d = new Date(value + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function CertSearchSelect({ canonical, value, onChange }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const selected = canonical.find(c => c.id === value)
  const display = selected ? selected.canonical_name : query

  const filtered = query.length > 0
    ? canonical.filter(c => c.canonical_name.toLowerCase().includes(query.toLowerCase()))
    : canonical

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleSelect(cert) {
    onChange(cert.id)
    setQuery('')
    setOpen(false)
  }

  function handleClear() {
    onChange('')
    setQuery('')
  }

  return (
    <div className="relative" ref={ref}>
      <label className="block text-sm font-medium text-slate-700">Certification / License
        <input
          type="text"
          value={display}
          onChange={(e) => { setQuery(e.target.value); onChange(''); setOpen(true) }}
          onFocus={() => setOpen(true)}
          className={`${input} mt-1`}
          placeholder="Search certifications…"
        />
      </label>
      {value && (
        <button type="button" onClick={handleClear} className="absolute right-3 top-8 text-xs text-slate-400 hover:text-slate-600">Clear</button>
      )}
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.map(cert => (
            <li key={cert.id}>
              <button type="button" onClick={() => handleSelect(cert)} className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50">
                <span className="font-medium text-slate-900">{cert.canonical_name}</span>
                {cert.issuing_organization && <span className="ml-2 text-xs text-slate-400">— {cert.issuing_organization}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function CertificationsPage() {
  const [items, setItems] = useState([])
  const [canonical, setCanonical] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const form = useForm({ defaultValues: EMPTY })
  const { register, handleSubmit, reset, watch, setValue, formState: { errors: _errors } } = form
  const doesNotExpire = watch('does_not_expire')
  const certId = watch('certification_id')

  useEffect(() => {
    let alive = true
    Promise.all([
      certificationService.listMine(),
      referenceService.listCertifications(),
    ])
      .then(([mine, certs]) => { if (alive) { setItems(mine || []); setCanonical(certs || []) } })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  function startAdd() { setEditing('new'); reset(EMPTY) }
  function startEdit(item) {
    setEditing(item)
    reset({
      certification_id: item.certification_id || '',
      credential_name_override: item.credential_name_override || '',
      issuing_organization_override: item.issuing_organization_override || '',
      credential_number: item.credential_number || '',
      date_issued: item.date_issued ? item.date_issued.slice(0, 10) : '',
      expiration_date: item.expiration_date ? item.expiration_date.slice(0, 10) : '',
      does_not_expire: !!item.does_not_expire,
      verification_url: item.verification_url || '',
    })
  }
  function cancel() { setEditing(null) }

  async function onSubmit(values) {
    setSaving(true)
    try {
      const payload = {
        certification_id: values.certification_id || null,
        credential_name_override: values.credential_name_override || null,
        issuing_organization_override: values.issuing_organization_override || null,
        credential_number: values.credential_number || null,
        date_issued: values.date_issued || null,
        expiration_date: values.does_not_expire ? null : (values.expiration_date || null),
        does_not_expire: values.does_not_expire,
        verification_url: values.verification_url || null,
        verification_status: 'unverified',
        source: 'self_reported',
      }
      if (editing === 'new') {
        const created = await certificationService.create(payload)
        setItems((prev) => [created, ...prev])
        toast.success('Certification added')
      } else {
        const updated = await certificationService.update(editing.id, payload)
        setItems((prev) => prev.map(i => i.id === editing.id ? updated : i))
        toast.success('Certification updated')
      }
      setEditing(null)
    } catch (e) {
      toast.error(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this certification?')) return
    try {
      await certificationService.remove(id)
      setItems((prev) => prev.filter(i => i.id !== id))
      toast.success('Deleted')
    } catch (e) {
      toast.error(e.message || 'Failed to delete')
    }
  }

  function certDisplayName(item) {
    return item.certifications?.canonical_name || item.credential_name_override || 'Untitled certification'
  }

  function certIssuer(item) {
    return item.certifications?.issuing_organization || item.issuing_organization_override || ''
  }

  const sortedItems = [...items].sort((a, b) => (b.date_issued || '').localeCompare(a.date_issued || ''))

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm text-slate-500">Loading certifications…</main>

  if (editing) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 px-4 py-8 sm:px-6" role="presentation">
        <div className="mx-auto flex min-h-full max-w-3xl items-center justify-center">
          <div className="w-full rounded-2xl bg-white shadow-xl ring-1 ring-slate-200" role="dialog" aria-modal="true" aria-labelledby="cert-modal-title">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 sm:px-6">
              <h1 id="cert-modal-title" className="text-lg font-bold text-slate-900">{editing === 'new' ? 'Add Certification' : 'Edit Certification'}</h1>
              <button type="button" onClick={cancel} className="rounded-lg px-2 py-1 text-2xl leading-none text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Close">×</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="max-h-[calc(100vh-10rem)] space-y-4 overflow-y-auto p-5 sm:p-6">
              <CertSearchSelect
                canonical={canonical}
                value={certId}
                onChange={(id) => setValue('certification_id', id, { shouldValidate: true })}
              />

              {!certId && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">Credential name (if not in list)
                    <input {...register('credential_name_override')} className={`${input} mt-1`} placeholder="e.g. NC II in Contact Center Services" />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">Issuing organization
                    <input {...register('issuing_organization_override')} className={`${input} mt-1`} placeholder="TESDA, PRC, etc." />
                  </label>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">Credential number
                  <input {...register('credential_number')} className={`${input} mt-1`} placeholder="Certificate / license number" />
                </label>
                <label className="block text-sm font-medium text-slate-700">Verification URL
                  <input {...register('verification_url')} className={`${input} mt-1`} placeholder="https://…" />
                </label>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-slate-700">Date issued
                  <input type="date" {...register('date_issued')} className={`${input} mt-1`} />
                </label>
                <label className="block text-sm font-medium text-slate-700">Expiration date
                  <input type="date" {...register('expiration_date')} disabled={doesNotExpire} className={`${input} mt-1 ${doesNotExpire ? 'bg-slate-100' : ''}`} />
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" {...register('does_not_expire')} className="h-4 w-4 rounded text-blue-600" />
                Does not expire
              </label>

              <div className="rounded-lg bg-amber-50 px-4 py-3 ring-1 ring-amber-100">
                <p className="text-xs text-amber-700">This certification will be marked as <span className="font-semibold">unverified</span> and added as <span className="font-semibold">self-reported</span>. Verification may be required by employers.</p>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
                <button type="submit" disabled={saving} className="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-60">
                  {saving ? 'Saving…' : editing === 'new' ? 'Add Certification' : 'Save Changes'}
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
            <h1 className="text-xl font-bold text-slate-900">Certifications & Licenses</h1>
            <p className="mt-1 text-sm text-slate-500">Record your professional certifications and licenses to strengthen your profile.</p>
          </div>
          <button onClick={startAdd} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
            + Add
          </button>
        </div>

        {sortedItems.length === 0 ? (
          <div className="mt-12 rounded-2xl border-2 border-dashed border-slate-200 bg-white p-8 text-center">
            <PixelBriefcase className="mx-auto h-6 w-6 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-500">No certifications recorded yet.</p>
            <p className="mt-1 text-xs text-slate-400">Add certifications and licenses to boost your credibility.</p>
            <button onClick={startAdd} className="mt-4 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800">
              Add First Certification
            </button>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {sortedItems.map(item => (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">{certDisplayName(item)}</p>
                    {certIssuer(item) && <p className="text-sm text-slate-600">{certIssuer(item)}</p>}
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      {item.credential_number && <span># {item.credential_number}</span>}
                      {item.date_issued && <span>Issued {formatDate(item.date_issued)}</span>}
                      {item.does_not_expire ? <span>No expiration</span> : item.expiration_date && <span>Expires {formatDate(item.expiration_date)}</span>}
                    </div>
                    {item.verification_url && (
                      <a href={item.verification_url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-blue-600 hover:underline">Verify online →</a>
                    )}
                    <span className="mt-2 inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-100">
                      {item.verification_status || 'unverified'}
                    </span>
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
