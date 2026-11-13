import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, Loading, Notice, PageHeader, Panel, StatusBadge } from '../components/Shared'
import { formatCurrency, formatDate, todayStart } from '../lib/format'
import { requireSupabase } from '../lib/supabase'

const statusNames = ['received', 'preparing', 'served', 'completed', 'cancelled']

function getLocalDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [tablesReady, setTablesReady] = useState(true)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setError('')
    const client = requireSupabase()
    const weekStart = new Date()
    weekStart.setHours(0, 0, 0, 0)
    weekStart.setDate(weekStart.getDate() - 6)
    const [allCount, todayOrders, recentOrders, tableCount, weekOrders] = await Promise.all([
      client.from('orders').select('id', { count: 'exact', head: true }),
      client.from('orders').select('id,total,status,created_at').gte('created_at', todayStart()),
      client.from('orders').select('id,order_number,table_number,customer_name,total,status,created_at').order('created_at', { ascending: false }).limit(8),
      client.from('restaurant_tables').select('id', { count: 'exact', head: true }).eq('status', 'active'),
      client.from('orders').select('total,created_at,status').gte('created_at', weekStart.toISOString()),
    ])
    const failure = allCount.error || todayOrders.error || recentOrders.error || weekOrders.error
    if (failure) throw failure
    setTablesReady(!tableCount.error)
    if (tableCount.error && !tableCount.error.message?.toLowerCase().includes('restaurant_tables')) throw tableCount.error
    setData({
      allCount: allCount.count || 0,
      todayOrders: todayOrders.data || [],
      recentOrders: recentOrders.data || [],
      weekOrders: weekOrders.data || [],
      activeTables: tableCount.error ? null : tableCount.count || 0,
    })
  }, [])

  useEffect(() => {
    let active = true
    let refreshInProgress = false
    async function refreshDashboard() {
      if (refreshInProgress) return
      refreshInProgress = true
      try {
        await load()
      } catch (loadError) {
        console.error('Could not load or refresh dashboard orders:', loadError)
        if (active) setError(loadError.message || 'Could not refresh dashboard data.')
      } finally {
        refreshInProgress = false
      }
    }

    // Load initial data from Supabase; the updates are asynchronous external data.
    refreshDashboard().finally(() => active && setLoading(false))
    const channel = requireSupabase().channel('admin-dashboard-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        refreshDashboard()
      })
      .subscribe((status, subscriptionError) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('Dashboard order Realtime subscription unavailable; periodic refresh remains active:', subscriptionError || status)
        }
      })
    const pollId = window.setInterval(refreshDashboard, 30_000)
    return () => {
      active = false
      window.clearInterval(pollId)
      requireSupabase().removeChannel(channel)
    }
  }, [load])

  const stats = useMemo(() => {
    if (!data) return []
    const todayOrders = data.todayOrders
    const byStatus = Object.fromEntries(statusNames.map(status => [status, todayOrders.filter(order => order.status === status).length]))
    return [
      { label: 'All orders', value: data.allCount, icon: '▤', tone: 'green', detail: 'All time' },
      { label: "Today's orders", value: todayOrders.length, icon: '◷', tone: 'gold', detail: 'Since midnight' },
      { label: "Today's revenue", value: formatCurrency(todayOrders.filter(order => order.status !== 'cancelled').reduce((sum, order) => sum + Number(order.total || 0), 0)), icon: '₹', tone: 'cream', detail: 'Excludes cancelled orders' },
      { label: 'In progress', value: byStatus.received + byStatus.preparing, icon: '↗', tone: 'peach', detail: 'Received + preparing' },
      { label: 'Served today', value: byStatus.served, icon: '✓', tone: 'lavender', detail: 'Awaiting completion' },
      { label: 'Completed today', value: byStatus.completed, icon: '✳', tone: 'mint', detail: 'Completed orders' },
      ...(data.activeTables === null ? [] : [{ label: 'Active tables', value: data.activeTables, icon: '⌗', tone: 'green', detail: 'Tables in service' }]),
    ]
  }, [data])

  const statusTotals = useMemo(() => {
    if (!data) return []
    return statusNames.map(status => ({
      status,
      count: data.todayOrders.filter(order => order.status === status).length,
    }))
  }, [data])

  const revenueSeries = useMemo(() => {
    if (!data) return []
    const now = new Date()
    const days = []
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = new Date(now)
      day.setHours(0, 0, 0, 0)
      day.setDate(day.getDate() - offset)
      const key = getLocalDateKey(day)
      const revenue = data.weekOrders
        .filter(order => order.status !== 'cancelled' && getLocalDateKey(new Date(order.created_at)) === key)
        .reduce((sum, order) => sum + Number(order.total || 0), 0)
      days.push({ key, label: new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(day), revenue })
    }
    return days
  }, [data])

  const greeting = new Date().getHours() < 12 ? 'Good morning.' : new Date().getHours() < 17 ? 'Good afternoon.' : 'Good evening.'
  const dateLabel = new Intl.DateTimeFormat('en-IN', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date()).toUpperCase()

  if (loading) return <Loading label="Loading live restaurant data…" />

  return (
    <>
      <PageHeader
        eyebrow={`${dateLabel} · RESTAURANT OVERVIEW`}
        title={greeting}
        description="Here is the latest pulse from your restaurant."
        action={<button className="button button-quiet" onClick={() => { setLoading(true); load().catch(loadError => setError(loadError.message)).finally(() => setLoading(false)) }}>↻ Refresh</button>}
      />
      {error && <Notice tone="error">{error}</Notice>}
      {!data && <EmptyState title="Dashboard data is unavailable" detail="Check your Supabase connection and admin access, then refresh." />}
      {data && (
        <>
          {!tablesReady && <Notice tone="warning">Table management is not enabled yet. Apply the approved database migration to activate table counts and QR management.</Notice>}
          <div className="stats-grid">
            {stats.map((stat, index) => (
              <article className={`stat-card stat-${stat.tone}`} key={stat.label} style={{ '--delay': `${index * 45}ms` }}>
                <div className="stat-top"><span>{stat.label}</span><span className="stat-icon">{stat.icon}</span></div>
                <strong className="stat-value">{stat.value}</strong>
                <span className="stat-detail">{stat.detail}</span>
              </article>
            ))}
          </div>
          <div className="dashboard-grid">
            <Panel title="Order activity" action={<span className="panel-caption">TODAY · LIVE</span>}>
              <div className="status-list">
                {statusTotals.map(({ status, count }) => {
                  const total = Math.max(data.todayOrders.length, 1)
                  return (
                    <div className="status-row" key={status}>
                      <div className="status-row-label"><StatusBadge status={status} /><strong>{count}</strong></div>
                      <div className="progress-track"><span className={`progress-fill progress-${status}`} style={{ width: `${(count / total) * 100}%` }} /></div>
                    </div>
                  )
                })}
              </div>
            </Panel>
            <Panel title="Quick actions">
              <div className="quick-actions">
                <Link to="/orders"><span>▤</span><strong>Review orders</strong><small>See incoming and active tickets</small><b>→</b></Link>
                <Link to="/menu"><span>◉</span><strong>Update menu</strong><small>Manage dishes and availability</small><b>→</b></Link>
                <Link to="/tables"><span>⌗</span><strong>Manage tables</strong><small>Generate table QR codes</small><b>→</b></Link>
              </div>
            </Panel>
          </div>
          <Panel title="Revenue overview" action={<span className="panel-caption">LAST 7 DAYS · INR</span>}>
            {revenueSeries.every(day => day.revenue === 0) ? (
              <EmptyState title="No revenue recorded this week" detail="Completed and active order totals will appear here as orders arrive." />
            ) : (
              <div className="revenue-chart" role="img" aria-label="Daily order revenue for the last seven days">
                {revenueSeries.map(day => {
                  const maxRevenue = Math.max(...revenueSeries.map(entry => entry.revenue), 1)
                  const height = day.revenue ? Math.max((day.revenue / maxRevenue) * 100, 4) : 0
                  return (
                    <div className="revenue-day" key={day.key}>
                      <span className="revenue-amount">{day.revenue ? formatCurrency(day.revenue) : '—'}</span>
                      <div className="revenue-bar-track"><span className="revenue-bar" style={{ height: `${height}%` }} /></div>
                      <span className="revenue-day-label">{day.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </Panel>
          <Panel title="Recent orders" action={<Link className="text-link" to="/orders">View all orders →</Link>}>
            {data.recentOrders.length === 0 ? (
              <EmptyState title="No orders yet" detail="New customer orders will appear here as soon as they arrive." />
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>ORDER</th><th>CUSTOMER</th><th>TABLE</th><th>TIME</th><th>AMOUNT</th><th>STATUS</th></tr></thead>
                  <tbody>{data.recentOrders.map(order => (
                    <tr key={order.id}>
                      <td><strong className="order-number">{order.order_number || `#${order.id.slice(0, 7)}`}</strong></td>
                      <td>{order.customer_name || 'Guest'}</td>
                      <td>Table {order.table_number}</td>
                      <td>{formatDate(order.created_at, { dateStyle: 'short' })}</td>
                      <td>{formatCurrency(order.total)}</td>
                      <td><StatusBadge status={order.status} /></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </>
  )
}
