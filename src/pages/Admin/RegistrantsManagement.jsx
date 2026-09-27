import { useEffect, useMemo, useState } from 'react'
import { useLegacyTable, legacyCreateColumnHelper, getCoreRowModel, getSortedRowModel, getPaginationRowModel } from '@tanstack/react-table/legacy'
import { flexRender } from '@tanstack/react-table'
import Papa from 'papaparse'
import { toast } from 'sonner'
import { useAuth } from '../../contexts/AuthContext'
import { registrantService } from '../../services/registrantService'
import { eventService } from '../../services/eventService'
import { eventTypeDisplay } from '../../domain/eventTypes'
import { format } from 'date-fns'

const columnHelper = legacyCreateColumnHelper()

export default function RegistrantsManagement() {
  const { user } = useAuth()
  const [registrants, setRegistrants] = useState([])
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState(null)

  // Filters
  const [search, setSearch] = useState('')
  const [eventFilter, setEventFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [barangayFilter, setBarangayFilter] = useState('all')
  const [municipalityFilter, setMunicipalityFilter] = useState('all')
  const [provinceFilter, setProvinceFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Modals
  const [viewRegistrant, setViewRegistrant] = useState(null)
  const [editRegistrant, setEditRegistrant] = useState(null)
  const [deleteRegistrant, setDeleteRegistrant] = useState(null)

  // Edit form state
  const [editForm, setEditForm] = useState({})
  const [savingEdit, setSavingEdit] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([
      registrantService.listAllForAdmin(),
      eventService.listForVacancyFilter(),
    ]).then(([regs, evs]) => {
      if (!alive) return
      setRegistrants(regs || [])
      setEvents(evs || [])
    }).catch((err) => { if (alive) toast.error(`Failed to load registrants: ${err.message}`) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  // Build filter options
  const barangays = useMemo(() => [...new Set(registrants.map(r => r.barangay).filter(Boolean))].sort(), [registrants])
  const municipalities = useMemo(() => [...new Set(registrants.map(r => r.municipality_city).filter(Boolean))].sort(), [registrants])
  const provinces = useMemo(() => [...new Set(registrants.map(r => r.province).filter(Boolean))].sort(), [registrants])

  // Apply filters
  const filteredData = useMemo(() => {
    let data = registrants

    if (eventFilter !== 'all') data = data.filter(r => r.event_id === eventFilter)
    if (statusFilter !== 'all') data = data.filter(r => r.check_in_status === statusFilter)
    if (typeFilter !== 'all') data = data.filter(r => r.registration_type === typeFilter)
    if (barangayFilter !== 'all') data = data.filter(r => r.barangay === barangayFilter)
    if (municipalityFilter !== 'all') data = data.filter(r => r.municipality_city === municipalityFilter)
    if (provinceFilter !== 'all') data = data.filter(r => r.province === provinceFilter)

    if (dateFrom) data = data.filter(r => r.created_at && r.created_at >= new Date(dateFrom).toISOString())
    if (dateTo) data = data.filter(r => r.created_at && r.created_at <= new Date(dateTo + 'T23:59:59').toISOString())

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      data = data.filter(r =>
        [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q) ||
        (r.unique_id || '').toLowerCase().includes(q) ||
        (r.contact_no || '').toLowerCase().includes(q)
      )
    }

    return data
  }, [registrants, search, eventFilter, statusFilter, typeFilter, barangayFilter, municipalityFilter, provinceFilter, dateFrom, dateTo])

  const columns = useMemo(() => [
    columnHelper.accessor('unique_id', {
      header: 'Unique ID',
      cell: info => <span className="font-mono text-xs text-blue-700">{info.getValue()}</span>,
    }),
    columnHelper.accessor(row => [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' '), {
      id: 'name',
      header: 'Name',
      cell: info => <span className="font-medium text-slate-900">{info.getValue()}</span>,
    }),
    columnHelper.accessor(row => row.events?.event_name || '—', {
      id: 'event',
      header: 'Event',
      cell: info => <span className="text-slate-600">{info.getValue()}</span>,
    }),
    columnHelper.accessor('registration_type', {
      header: 'Type',
      cell: info => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold capitalize ${info.getValue() === 'walkin' ? 'bg-orange-100 text-orange-800' : 'bg-blue-100 text-blue-800'}`}>
          {info.getValue() === 'walkin' ? 'Walk-in' : 'Pre-reg'}
        </span>
      ),
    }),
    columnHelper.accessor('check_in_status', {
      header: 'Status',
      cell: info => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold capitalize ${info.getValue() === 'checked_in' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
          {info.getValue().replace('_', ' ')}
        </span>
      ),
    }),
    columnHelper.accessor('check_in_time', {
      header: 'Check-in Time',
      cell: info => <span className="text-xs text-slate-500">{info.getValue() ? format(new Date(info.getValue()), 'MMM d, h:mm a') : '—'}</span>,
    }),
    columnHelper.accessor('id', {
      header: 'Actions',
      cell: info => (
        <div className="flex gap-1.5">
          <button onClick={() => setViewRegistrant(info.row.original)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">View</button>
          <button onClick={() => openEdit(info.row.original)} className="rounded-lg bg-blue-700 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-800">Edit</button>
          <button onClick={() => setDeleteRegistrant(info.row.original)} className="rounded-lg bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700">Delete</button>
        </div>
      ),
    }),
  ], [])

  const table = useLegacyTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 10 } },
  })

  function resetFilters() {
    setSearch('')
    setEventFilter('all')
    setStatusFilter('all')
    setTypeFilter('all')
    setBarangayFilter('all')
    setMunicipalityFilter('all')
    setProvinceFilter('all')
    setDateFrom('')
    setDateTo('')
  }

  function openEdit(reg) {
    setEditRegistrant(reg)
    setEditForm({
      first_name: reg.first_name || '',
      middle_name: reg.middle_name || '',
      last_name: reg.last_name || '',
      email: reg.email || '',
      contact_no: reg.contact_no || '',
      sex: reg.sex || '',
      civil_status: reg.civil_status || '',
      barangay: reg.barangay || '',
      municipality_city: reg.municipality_city || '',
      province: reg.province || '',
      birthdate: reg.birthdate || '',
    })
  }

  async function saveEdit() {
    setSavingEdit(true)
    try {
      await registrantService.updateRegistrant(editRegistrant.id, {
        first_name: editForm.first_name,
        middle_name: editForm.middle_name || null,
        last_name: editForm.last_name,
        email: editForm.email,
        contact_no: editForm.contact_no || null,
        sex: editForm.sex || null,
        civil_status: editForm.civil_status || null,
        barangay: editForm.barangay || null,
        municipality_city: editForm.municipality_city || null,
        province: editForm.province || null,
        birthdate: editForm.birthdate || null,
      })
      toast.success('Registrant updated successfully!')
      setRegistrants(prev => prev.map(r => r.id === editRegistrant.id ? { ...r, ...editForm } : r))
      setEditRegistrant(null)
    } catch (err) {
      toast.error(`Update failed: ${err.message}`)
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete() {
    if (!deleteRegistrant) return
    try {
      await registrantService.removeRegistrant(deleteRegistrant.id)
      toast.success('Registrant deleted.')
      setRegistrants(prev => prev.filter(r => r.id !== deleteRegistrant.id))
      setDeleteRegistrant(null)
    } catch (err) {
      toast.error(`Delete failed: ${err.message}`)
    }
  }

  async function handleManualCheckin(reg) {
    setActionId(reg.id)
    try {
      await registrantService.markCheckedIn(reg.id, user?.id)
      toast.success('Successfully checked in!')
      setRegistrants(prev => prev.map(r => r.id === reg.id ? { ...r, check_in_status: 'checked_in', check_in_time: new Date().toISOString() } : r))
    } catch (err) {
      toast.error(`Check-in failed: ${err.message}`)
    } finally {
      setActionId(null)
    }
  }

  function exportCSV() {
    const rows = filteredData.map(r => ({
      unique_id: r.unique_id,
      name: [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' '),
      email: r.email,
      contact_no: r.contact_no,
      event: r.events?.event_name || '',
      registration_type: r.registration_type,
      status: r.check_in_status,
      check_in_time: r.check_in_time ? format(new Date(r.check_in_time), 'yyyy-MM-dd HH:mm:ss') : '',
      barangay: r.barangay,
      municipality_city: r.municipality_city,
      province: r.province,
      created_at: r.created_at ? format(new Date(r.created_at), 'yyyy-MM-dd HH:mm:ss') : '',
    }))
    const csv = Papa.unparse(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `registrants-${format(new Date(), 'yyyy-MM-dd')}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const inputCls = 'rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white focus:border-blue-500 focus:outline-none'

  if (loading) return <div className="grid min-h-[300px] place-items-center text-slate-500">Loading registrants...</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Registrants Management</h1>
          <p className="text-sm text-slate-600">{filteredData.length} registrant(s)</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
            Export CSV
          </button>
          <button onClick={resetFilters} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Reset Filters
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <div className="mb-3">
          <input
            type="text"
            placeholder="Search by name, email, unique ID, or contact number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputCls} w-full`}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value)} className={inputCls}>
            <option value="all">All Events</option>
            {events.map(ev => <option key={ev.id} value={ev.id}>{ev.event_name} — {eventTypeDisplay(ev)}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputCls}>
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="checked_in">Checked In</option>
          </select>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={inputCls}>
            <option value="all">All Types</option>
            <option value="preregistered">Pre-registered</option>
            <option value="walkin">Walk-in</option>
          </select>
          <select value={provinceFilter} onChange={(e) => setProvinceFilter(e.target.value)} className={inputCls}>
            <option value="all">All Provinces</option>
            {provinces.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={municipalityFilter} onChange={(e) => setMunicipalityFilter(e.target.value)} className={inputCls}>
            <option value="all">All Municipalities</option>
            {municipalities.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select value={barangayFilter} onChange={(e) => setBarangayFilter(e.target.value)} className={inputCls}>
            <option value="all">All Barangays</option>
            {barangays.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inputCls} title="From date" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputCls} title="To date" />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id} className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {headerGroup.headers.map(header => (
                    <th key={header.id} className="px-4 py-3">
                      {header.isPlaceholder ? null : (
                        <button
                          className="flex items-center gap-1 hover:text-slate-700"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          {flexRender(header.column.columnDef.header, header.getContext())}
                          <span className="text-slate-400">
                            {header.column.getIsSorted() === 'asc' ? '↑' : header.column.getIsSorted() === 'desc' ? '↓' : ''}
                          </span>
                        </button>
                      )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {table.getRowModel().rows.map(row => (
                <tr key={row.id} className="hover:bg-slate-50">
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>Rows per page:</span>
            <select
              value={table.getState().pagination.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
              className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
            >
              {[10, 25, 50, 100].map(size => <option key={size} value={size}>{size}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            Page {table.getState().pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)}
            <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold disabled:opacity-40 hover:bg-slate-50">Prev</button>
            <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold disabled:opacity-40 hover:bg-slate-50">Next</button>
          </div>
        </div>
      </div>

      {/* View Modal */}
      {viewRegistrant && (
        <Modal onClose={() => setViewRegistrant(null)} title="Registrant Details">
          <div className="space-y-3 text-sm">
            <Detail label="Name" value={[viewRegistrant.first_name, viewRegistrant.middle_name, viewRegistrant.last_name].filter(Boolean).join(' ')} />
            <Detail label="Unique ID" value={viewRegistrant.unique_id} />
            <Detail label="Event" value={viewRegistrant.events?.event_name || '—'} />
            <Detail label="Email" value={viewRegistrant.email} />
            <Detail label="Contact" value={viewRegistrant.contact_no || '—'} />
            <Detail label="Status" value={viewRegistrant.check_in_status.replace('_', ' ')} />
            <Detail label="Check-in Time" value={viewRegistrant.check_in_time ? format(new Date(viewRegistrant.check_in_time), 'MMM d, yyyy h:mm a') : '—'} />
            <Detail label="Address" value={[viewRegistrant.barangay, viewRegistrant.municipality_city, viewRegistrant.province].filter(Boolean).join(', ') || '—'} />
            <Detail label="Education" value={[viewRegistrant.highest_educational_attainment, viewRegistrant.course_program].filter(Boolean).join(' — ') || '—'} />
            <Detail label="Employment Preference" value={viewRegistrant.employment_preference || '—'} />
            {viewRegistrant.registrant_vacancies?.length > 0 && (
              <Detail label="Applied Positions" value={viewRegistrant.registrant_vacancies.map(v => `${v.event_vacancies?.vacancy_definitions?.position || '—'} (${v.event_vacancies?.vacancy_definitions?.company_name || '—'})`).join(', ')} />
            )}
            <div className="pt-2">
              {viewRegistrant.check_in_status !== 'checked_in' ? (
                <button
                  onClick={() => { handleManualCheckin(viewRegistrant); setViewRegistrant(null) }}
                  disabled={actionId === viewRegistrant.id}
                  className="w-full rounded-lg bg-emerald-600 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {actionId === viewRegistrant.id ? 'Checking in...' : 'Check In'}
                </button>
              ) : (
                <p className="rounded-lg bg-emerald-50 p-3 text-center font-semibold text-emerald-700">✓ Already checked in</p>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Modal */}
      {editRegistrant && (
        <Modal onClose={() => setEditRegistrant(null)} title="Edit Registrant">
          <div className="grid gap-3 sm:grid-cols-2 text-sm">
            <Field label="First name"><input className={`${inputCls} w-full`} value={editForm.first_name} onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })} /></Field>
            <Field label="Last name"><input className={`${inputCls} w-full`} value={editForm.last_name} onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })} /></Field>
            <Field label="Middle name"><input className={`${inputCls} w-full`} value={editForm.middle_name} onChange={(e) => setEditForm({ ...editForm, middle_name: e.target.value })} /></Field>
            <Field label="Email"><input className={`${inputCls} w-full`} value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></Field>
            <Field label="Contact number"><input className={`${inputCls} w-full`} value={editForm.contact_no} onChange={(e) => setEditForm({ ...editForm, contact_no: e.target.value })} /></Field>
            <Field label="Birthdate"><input type="date" className={`${inputCls} w-full`} value={editForm.birthdate} onChange={(e) => setEditForm({ ...editForm, birthdate: e.target.value })} /></Field>
            <Field label="Sex">
              <select className={`${inputCls} w-full`} value={editForm.sex} onChange={(e) => setEditForm({ ...editForm, sex: e.target.value })}>
                <option value="">Select</option>
                <option>Male</option>
                <option>Female</option>
                <option>Other</option>
                <option>Prefer not to say</option>
              </select>
            </Field>
            <Field label="Civil status">
              <select className={`${inputCls} w-full`} value={editForm.civil_status} onChange={(e) => setEditForm({ ...editForm, civil_status: e.target.value })}>
                <option value="">Select</option>
                <option>Single</option>
                <option>Married</option>
                <option>Widowed</option>
              </select>
            </Field>
            <Field label="Province"><input className={`${inputCls} w-full`} value={editForm.province} onChange={(e) => setEditForm({ ...editForm, province: e.target.value })} /></Field>
            <Field label="Municipality / City"><input className={`${inputCls} w-full`} value={editForm.municipality_city} onChange={(e) => setEditForm({ ...editForm, municipality_city: e.target.value })} /></Field>
            <Field label="Barangay"><input className={`${inputCls} w-full`} value={editForm.barangay} onChange={(e) => setEditForm({ ...editForm, barangay: e.target.value })} /></Field>
          </div>
          <button
            onClick={saveEdit}
            disabled={savingEdit}
            className="mt-4 w-full rounded-lg bg-blue-700 py-2.5 font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {savingEdit ? 'Saving...' : 'Save Changes'}
          </button>
        </Modal>
      )}

      {/* Delete Modal */}
      {deleteRegistrant && (
        <Modal onClose={() => setDeleteRegistrant(null)} title="Confirm Delete">
          <p className="text-sm text-slate-600">
            Are you sure you want to delete <strong>{[deleteRegistrant.first_name, deleteRegistrant.middle_name, deleteRegistrant.last_name].filter(Boolean).join(' ')}</strong> ({deleteRegistrant.unique_id})? This action cannot be undone.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button onClick={() => setDeleteRegistrant(null)} className="rounded-lg border border-slate-300 py-2.5 font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
            <button onClick={handleDelete} className="rounded-lg bg-red-600 py-2.5 font-semibold text-white hover:bg-red-700">Delete</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-800">{value}</dd>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  )
}