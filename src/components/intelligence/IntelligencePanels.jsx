import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts'
import { metricView, breakdownRows } from '../../domain/employmentIntelligenceDashboard.js'

export const PANEL = 'rounded-xl border border-slate-200 bg-white p-5 shadow-sm'
export const BUTTON = 'min-h-[44px] rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-300'

export function MetricState({ view }) {
  return <span data-metric-state={view.state} className="break-words text-2xl font-bold tabular-nums text-slate-900">{view.display}</span>
}
export function MetricCard({ id, cell }) {
  const view=metricView(id,cell)
  return <article className={PANEL} aria-label={view.name}>
    <h3 className="text-sm font-semibold text-slate-700">{view.name}</h3>
    <div className="my-3"><MetricState view={view} /></div>
    <p className="text-xs font-semibold text-blue-700">{view.dateBasis}</p>
    <p className="mt-2 text-sm leading-relaxed text-slate-600">{view.help}</p>
    {view.measure==='rate' && view.state==='numeric' && <p className="mt-2 text-sm text-slate-700">{view.numerator} / {view.denominator} applications. Denominator: {view.denominatorContext}.</p>}
    {view.measure==='percent' && view.state==='numeric' && <p className="mt-2 text-sm text-slate-700">{view.numerator} / {view.denominator} structured records</p>}
    {view.state==='unknown' && <p className="mt-2 text-sm text-slate-600">No evaluable denominator is available.</p>}
    <details className="mt-3 text-sm text-slate-600">
      <summary className="min-h-[44px] cursor-pointer py-2 font-medium focus-visible:ring-4 focus-visible:ring-blue-300">Metric definition</summary>
      <p className="mt-2">Counted unit: {view.grain}.</p>
      {view.limitations.map(text=><p className="mt-2" key={text}>{text}</p>)}
    </details>
  </article>
}
export function MetricGrid({ ids, response }) {
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {ids.map(id=><MetricCard key={id} id={id} cell={response.cells.find(cell=>cell.metric_id===id)} />)}
  </div>
}
export function DashboardSkeleton() {
  return <div aria-label="Loading section" role="status" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    {[1,2,3].map(key=><div key={key} className={PANEL+' min-h-48 motion-safe:animate-pulse'} aria-hidden="true">
      <div className="h-4 w-2/3 rounded bg-slate-200" /><div className="mt-6 h-8 w-1/3 rounded bg-slate-200" />
      <div className="mt-6 h-4 rounded bg-slate-100" /><div className="mt-3 h-4 rounded bg-slate-100" />
    </div>)}<span className="sr-only">Loading aggregate metrics</span>
  </div>
}
export function DashboardError({ retry }) {
  return <div className={PANEL} role="alert">
    <h3 className="font-semibold text-slate-900">This section is unavailable</h3>
    <p className="my-3 text-sm text-slate-600">Metrics could not be loaded. Please try again.</p>
    <button type="button" className={BUTTON} onClick={retry}>Retry section</button>
  </div>
}
export function BreakdownChart({ id, response }) {
  const view=metricView(id)
  const all=breakdownRows(id,response)
  const rows=all.slice(0,10)
  return <article className={PANEL+' min-w-0'}>
    <h3 className="font-semibold text-slate-900">{view.name}</h3>
    <p className="mt-1 text-sm text-slate-600">Current snapshot · {view.grain}. Categories may overlap; totals are not additive.</p>
    {!rows.length ? <p className="mt-6 text-sm text-slate-600">No structured category data is available.</p> : <>
      <div aria-hidden="true" className="mt-4 min-w-0" style={{height:Math.max(180,rows.length*45)}}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{left:8,right:25}}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="label" width={125} tick={{fontSize:11}} />
            <Tooltip /><Bar dataKey="value" name="Distinct count" fill="#0b6efd" radius={[0,3,3,0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-3 text-xs text-slate-600">Showing {rows.length} of {all.length} categories by recorded count.</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm"><caption className="sr-only">{view.name}: chart data</caption>
          <thead><tr className="border-b text-slate-600"><th scope="col" className="py-2">Category</th><th scope="col" className="py-2 text-right">Distinct count</th></tr></thead>
          <tbody>{rows.map(row=><tr key={row.key} className="border-b border-slate-100">
            <th scope="row" className="max-w-48 break-words py-2 font-medium text-slate-800">{row.label}</th>
            <td className="py-2 text-right tabular-nums text-slate-800">{row.display}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </>}
  </article>
}
export function SkillsTable({ response }) {
  const rows=breakdownRows('skill_gap',response)
  return <article className={PANEL}>
    <h3 className="font-semibold text-slate-900">Observed skill supply-to-demand ratio</h3>
    <p className="mt-2 text-sm leading-relaxed text-slate-600">This compares recorded jobseeker skill declarations with active vacancy skill demand in the current system. It does not estimate the entire labor market. Required demand is the denominator; preferred demand is shown separately.</p>
    {!rows.length ? <p className="mt-5 text-sm text-slate-600">No structured skill comparison data is available.</p> : <div className="mt-4 overflow-x-auto">
      <table className="w-full text-left text-sm"><caption className="sr-only">Current skill declarations compared with required vacancy definitions</caption>
        <thead><tr className="border-b text-slate-600">{['Skill','Persons declaring skill','Job definitions requiring skill','Supply-to-demand ratio'].map(name=><th key={name} scope="col" className="px-2 py-3">{name}</th>)}</tr></thead>
        <tbody>{rows.map(row=><tr key={row.key} className="border-b border-slate-100 text-slate-800">
          <th scope="row" className="px-2 py-3 font-medium">{row.label}</th>
          <td className="px-2 py-3">{row.state==='numeric'||row.state==='unknown' ? row.numerator : 'Withheld'}</td>
          <td className="px-2 py-3">{row.state==='numeric'||row.state==='unknown' ? row.denominator : 'Withheld'}</td>
          <td className="px-2 py-3">{row.display}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </article>
}
export function ApplicationSeries({ response }) {
  const rows=response.cells.filter(cell=>cell.metric_id==='applications_submitted').map(cell=>({period:cell.period,value:cell.value}))
  return <article className={PANEL}>
    <h3 className="font-semibold text-slate-900">Formal applications over time</h3>
    <p className="mt-2 text-sm text-slate-600">Submission-date grouping. Only recorded periods are shown.</p>
    {!rows.length ? <p className="mt-4 text-sm text-slate-600">No applications are recorded in this date range.</p> : <>
      <div className="mt-4 h-64 min-w-0" aria-hidden="true"><ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" tick={{fontSize:11}} /><YAxis allowDecimals={false} /><Tooltip />
          <Line type="linear" dataKey="value" name="Formal applications" stroke="#0b6efd" strokeWidth={2} isAnimationActive={false} /></LineChart>
      </ResponsiveContainer></div>
      <div className="mt-3 max-h-72 overflow-auto"><table className="w-full text-left text-sm">
        <caption className="sr-only">Formal application time-series data</caption><thead><tr className="border-b"><th scope="col" className="py-2">Period starting</th><th scope="col">Formal applications</th></tr></thead>
        <tbody>{rows.map(row=><tr key={row.period} className="border-b border-slate-100"><th scope="row" className="py-2 font-medium">{row.period}</th><td>{row.value}</td></tr>)}</tbody>
      </table></div>
    </>}
  </article>
}
