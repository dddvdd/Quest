import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  LineChart, Line, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { useAuth } from '../../contexts/AuthContext'
import { dashboardService } from '../../services/dashboardService'
import { format, subDays } from 'date-fns'

const COLORS = ['#0b6efd', '#2ea44f', '#d4820a', '#c0392b', '#8e44ad', '#16a085']

export default function AdminDashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState({
    totalRegistrants: 0,
    todayCheckIns: 0,
    totalEvents: 0,
    totalStaff: 0,
    pwdCount: 0,
    ofwCount: 0,
    firstTimeJobseekers: 0,
    hotsCount: 0,
    hiredCount: 0,
    appliedCount: 0,
    interviewedCount: 0,
  })
  const [registrationsByDay, setRegistrationsByDay] = useState([])
  const [statusDistribution, setStatusDistribution] = useState([])
  const [registrantsByEvent, setRegistrantsByEvent] = useState([])
  const [hotsByEvent, setHotsByEvent] = useState([])
  const [demographicBreakdown, setDemographicBreakdown] = useState([])
  const [topPositions, setTopPositions] = useState([])
  const [recentRegistrants, setRecentRegistrants] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    dashboardService.fetchDashboard()
      .then((d) => {
        if (!alive) return
        const { registrants, events, staff, interviewLogs, outcomes, applications } = d
        if (!registrants) { setLoading(false); return }

        const today = format(new Date(), 'yyyy-MM-dd')

        const totalRegistrants = registrants.length
        const todayCheckIns = registrants.filter(r => r.check_in_time?.startsWith(today)).length
        const totalEvents = events.length || 0
        const totalStaff = staff.length || 0
        const pwdCount = registrants.filter(r => r.has_disability).length
        const ofwCount = registrants.filter(r => r.returning_ofw).length
        const firstTimeJobseekers = registrants.filter(r => r.first_time_jobseeker).length
        const hotsCount = (interviewLogs || []).filter(i => i.interview_status === 'hots').length
        const hiredCount = (outcomes || []).filter(o => o.outcome === 'hired').length
        const appliedCount = (applications || []).length
        const interviewedCount = (interviewLogs || []).length

        setStats({
          totalRegistrants,
          todayCheckIns,
          totalEvents,
          totalStaff,
          pwdCount,
          ofwCount,
          firstTimeJobseekers,
          hotsCount,
          hiredCount,
          appliedCount,
          interviewedCount,
        })

        const registrationsByDayData = []
        for (let i = 6; i >= 0; i--) {
          const date = format(subDays(new Date(), i), 'yyyy-MM-dd')
          const count = registrants.filter(r => r.created_at?.startsWith(date)).length
          registrationsByDayData.push({ date, count })
        }
        setRegistrationsByDay(registrationsByDayData)

        const statusCounts = { pending: 0, checked_in: 0 }
        registrants.forEach(r => {
          if (r.check_in_status === 'checked_in') statusCounts.checked_in++
          else statusCounts.pending++
        })
        setStatusDistribution([
          { name: 'Pending', value: statusCounts.pending },
          { name: 'Checked In', value: statusCounts.checked_in }
        ])

        const eventCounts = {}
        registrants.forEach(r => {
          const eventName = r.events?.event_name || 'Unknown'
          eventCounts[eventName] = (eventCounts[eventName] || 0) + 1
        })
        setRegistrantsByEvent(Object.entries(eventCounts).map(([name, count]) => ({ name, count })))

        const eventHotsData = {}
        ;(interviewLogs || []).forEach(i => {
          const eventName = i.events?.event_name || 'Unknown'
          if (!eventHotsData[eventName]) eventHotsData[eventName] = { total: 0, hots: 0 }
          eventHotsData[eventName].total++
          if (i.interview_status === 'hots') eventHotsData[eventName].hots++
        })
        setHotsByEvent(Object.entries(eventHotsData).map(([name, data]) => ({
          name,
          total: data.total,
          hots: data.hots,
          rate: data.total > 0 ? Math.round((data.hots / data.total) * 100) : 0
        })))

        setDemographicBreakdown([
          { name: 'PWD', value: pwdCount },
          { name: 'OFW', value: ofwCount },
          { name: 'First-time Jobseekers', value: firstTimeJobseekers }
        ])

        const positionCounts = {}
        registrants.forEach(r => {
          r.registrant_vacancies?.forEach(v => {
            const pos = v.event_vacancies?.vacancy_definitions?.position || 'Unknown'
            positionCounts[pos] = (positionCounts[pos] || 0) + 1
          })
        })
        setTopPositions(
          Object.entries(positionCounts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10)
        )

        setRecentRegistrants(registrants.slice(0, 10))
      })
      .catch((err) => { console.error('Failed to load dashboard data:', err) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-slate-600">Loading dashboard...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
          <p className="text-sm text-slate-600">Welcome back, {profile?.full_name || 'Admin'}</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard title="Total Registrants" value={stats.totalRegistrants} color="blue" />
        <StatCard title="Today's Check-ins" value={stats.todayCheckIns} color="emerald" />
        <StatCard title="Applied" value={stats.appliedCount} color="purple" />
        <StatCard title="Interviewed" value={stats.interviewedCount} color="indigo" />
        <StatCard title="Hired (Verified)" value={stats.hiredCount} color="green" />
        <StatCard title="Events" value={stats.totalEvents} color="purple" />
        <StatCard title="Staff" value={stats.totalStaff} color="amber" />
        <StatCard title="PWD" value={stats.pwdCount} color="cyan" />
        <StatCard title="OFW" value={stats.ofwCount} color="orange" />
        <StatCard title="First-time Jobseekers" value={stats.firstTimeJobseekers} color="teal" />
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Registrations (Last 7 Days)">
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={registrationsByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tickFormatter={(v) => format(new Date(v), 'MMM d')} stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#0b6efd" strokeWidth={2} dot={{ fill: '#0b6efd' }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Status Distribution">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={statusDistribution}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {statusDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Registrants by Event">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={registrantsByEvent}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip />
              <Bar dataKey="count" fill="#0b6efd" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="HOTS/Placement Rate By Event">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={hotsByEvent}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip />
              <Legend />
              <Bar dataKey="total" name="Total Interviews" fill="#0b6efd" radius={[4, 4, 0, 0]} />
              <Bar dataKey="hots" name="HOTS" fill="#2ea44f" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts Row 3 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Demographic Breakdown">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={demographicBreakdown}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
              >
                {demographicBreakdown.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top 10 Positions Applied">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={topPositions} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" stroke="#64748b" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={100} stroke="#64748b" />
              <Tooltip />
              <Bar dataKey="count" fill="#8e44ad" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Recent Registrants */}
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900">Recent Registrants</h2>
          <Link to="/staff/search" className="text-sm font-semibold text-blue-700 hover:underline">
            View All
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Unique ID</th>
                <th className="py-2 pr-4">Event</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentRegistrants.map((reg) => (
                <tr key={reg.id} className="hover:bg-slate-50">
                  <td className="py-3 pr-4 font-medium text-slate-900">
                    {[reg.first_name, reg.middle_name, reg.last_name].filter(Boolean).join(' ')}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-blue-700">{reg.unique_id}</td>
                  <td className="py-3 pr-4 text-slate-600">{reg.events?.event_name || 'N/A'}</td>
                  <td className="py-3 pr-4">
                    <span className={`rounded-full px-2 py-1 text-xs font-bold capitalize ${
                      reg.check_in_status === 'checked_in' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                    }`}>
                      {reg.check_in_status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 text-xs text-slate-500">
                    {reg.created_at ? format(new Date(reg.created_at), 'MMM d, h:mm a') : 'N/A'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, color }) {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200 text-blue-900',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    purple: 'bg-purple-50 border-purple-200 text-purple-900',
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    cyan: 'bg-cyan-50 border-cyan-200 text-cyan-900',
    orange: 'bg-orange-50 border-orange-200 text-orange-900',
    teal: 'bg-teal-50 border-teal-200 text-teal-900',
    red: 'bg-red-50 border-red-200 text-red-900'
  }

  return (
    <div className={`rounded-xl border p-4 ${colorClasses[color]}`}>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-75">{title}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  )
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      {children}
    </div>
  )
}
