import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PANEL } from '../../components/intelligence/IntelligencePanels.jsx'

export default function ProgramListPage() {
  const [programs, setPrograms] = useState({ status: 'loading', rows: [] })
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    import('../../lib/supabase.js').then(({ supabase }) =>
      supabase.from('employment_programs').select('id, code, name, program_type, implementing_agency, is_active, valid_from, valid_to, created_at').order('created_at', { ascending: false })
    ).then(({ data, error: err }) => {
      if (!alive) return
      if (err) { setError(err.message); setPrograms({ status: 'error', rows: [] }) }
      else setPrograms({ status: 'ready', rows: data ?? [] })
    })
    return () => { alive = false }
  }, [])

  return (
    <div className="min-w-0 space-y-6 p-4 sm:p-6 lg:p-8">
      <header className="border-b border-slate-200 pb-5">
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-role-admin">Admin operations</p>
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">Government Programs</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">View government employment program catalog records. Program data is private administrative information.</p>
      </header>

      {error && <div className={PANEL} role="alert"><p className="text-sm text-red-700">{error}</p></div>}

      {programs.status === 'loading' && (
        <div className={PANEL + ' min-h-48 motion-safe:animate-pulse'} aria-label="Loading programs" role="status">
          <div className="h-4 w-2/3 rounded bg-slate-200" />
          <div className="mt-6 h-8 w-1/3 rounded bg-slate-200" />
        </div>
      )}

      {programs.status === 'ready' && programs.rows.length === 0 && (
        <div className={PANEL}>
          <p className="text-sm text-slate-600">No program records are available yet. Programs are created through administrative entry.</p>
        </div>
      )}

      {programs.status === 'ready' && programs.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Government program catalog</caption>
            <thead>
              <tr className="border-b text-slate-600">
                <th scope="col" className="px-3 py-3">Code</th>
                <th scope="col" className="px-3 py-3">Name</th>
                <th scope="col" className="px-3 py-3">Type</th>
                <th scope="col" className="px-3 py-3">Agency</th>
                <th scope="col" className="px-3 py-3">Status</th>
                <th scope="col" className="px-3 py-3">Valid From</th>
                <th scope="col" className="px-3 py-3">Valid To</th>
              </tr>
            </thead>
            <tbody>
              {programs.rows.map(program => (
                <tr key={program.id} className="border-b border-slate-100">
                  <td className="px-3 py-3 font-mono text-xs text-slate-700">{program.code}</td>
                  <td className="px-3 py-3">
                    <Link to={`/admin/programs/${program.id}`} className="font-medium text-blue-700 hover:underline">{program.name}</Link>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{program.program_type}</td>
                  <td className="px-3 py-3 text-slate-700">{program.implementing_agency}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${program.is_active ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'}`}>
                      {program.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{program.valid_from ?? '—'}</td>
                  <td className="px-3 py-3 text-slate-700">{program.valid_to ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
