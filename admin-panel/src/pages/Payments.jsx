import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState, Loading, Notice, PageHeader, StatusBadge } from '../components/Shared'
import { formatCurrency, formatDate } from '../lib/format'
import { requireSupabase } from '../lib/supabase'

const paymentMethods = ['UPI Online', 'Pay at Counter', 'Pay After Eating']

function paymentStatus(order) {
  if (order.payment_status === 'paid' || order.payment_status === 'unpaid') return order.payment_status
  return 'not_recorded'
}

function orderStatusLabel(status) {
  if (status === 'received') return 'pending'
  if (status === 'served') return 'ready'
  return status || 'unknown'
}

function paymentMethodLabel(method) {
  if (method === 'UPI') return 'UPI Online (legacy)'
  if (method === 'Counter') return 'Pay at Counter (legacy)'
  return method || 'Not recorded'
}

function localDateKey(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function amountFor(order) {
  const amount = Number(order.total)
  return Number.isFinite(amount) && amount >= 0 ? amount : null
}

export default function Payments() {
  const [orders, setOrders] = useState([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [methodFilter, setMethodFilter] = useState('all')
  const [dateFilter, setDateFilter] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [savingId, setSavingId] = useState('')

  const load = useCallback(async () => {
    const client = requireSupabase()
    const pageSize = 500
    const allOrders = []
    let offset = 0

    while (true) {
      const { data, error: queryError } = await client
        .from('orders')
        .select('id,order_number,customer_name,table_number,total,payment_method,payment_status,status,created_at,payment_confirmed_at,payment_confirmed_by')
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1)
      if (queryError) throw queryError

      const page = data || []
      allOrders.push(...page)
      if (page.length < pageSize) break
      offset += pageSize
    }

    setOrders(allOrders)
  }, [])

  useEffect(() => {
    let active = true
    let refreshInProgress = false

    async function refresh() {
      if (refreshInProgress) return
      refreshInProgress = true
      try {
        await load()
        if (active) setError('')
      } catch (loadError) {
        console.error('Could not load or refresh Supabase payment records:', loadError)
        if (active) setError(loadError.message || 'Could not load payment records. Please try again.')
      } finally {
        refreshInProgress = false
        if (active) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    }

    refresh()
    const channel = requireSupabase().channel('admin-payment-records')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, refresh)
      .subscribe((subscriptionStatus, subscriptionError) => {
        if (subscriptionStatus === 'CHANNEL_ERROR' || subscriptionStatus === 'TIMED_OUT' || subscriptionStatus === 'CLOSED') {
          console.warn('Payment Realtime subscription unavailable; periodic refresh remains active:', subscriptionError || subscriptionStatus)
        }
      })
    const pollId = window.setInterval(refresh, 30_000)

    return () => {
      active = false
      window.clearInterval(pollId)
      requireSupabase().removeChannel(channel)
    }
  }, [load])

  const methods = useMemo(() => (
    [...new Set([...paymentMethods, ...orders.map(order => order.payment_method).filter(Boolean)])]
  ), [orders])

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase()
    return orders.filter(order => {
      const matchesSearch = !query ||
        String(order.order_number || '').toLowerCase().includes(query) ||
        String(order.customer_name || '').toLowerCase().includes(query)
      const matchesStatus = statusFilter === 'all' || paymentStatus(order) === statusFilter
      const matchesMethod = methodFilter === 'all' || order.payment_method === methodFilter
      const matchesDate = !dateFilter || localDateKey(order.payment_confirmed_at || order.created_at) === dateFilter
      return matchesSearch && matchesStatus && matchesMethod && matchesDate
    })
  }, [orders, search, statusFilter, methodFilter, dateFilter])

  const analytics = useMemo(() => orders.reduce((totals, order) => {
    const status = paymentStatus(order)
    const amount = amountFor(order)
    if (status === 'paid') {
      totals.paidCount += 1
      if (amount !== null) totals.collected += amount
    } else if (status === 'unpaid') {
      totals.unpaidCount += 1
      if (amount !== null) totals.pending += amount
    } else {
      totals.notRecordedCount += 1
    }
    return totals
  }, { collected: 0, pending: 0, paidCount: 0, unpaidCount: 0, notRecordedCount: 0 }), [orders])

  async function refreshNow() {
    setRefreshing(true)
    setSuccess('')
    try {
      await load()
      setError('')
    } catch (loadError) {
      console.error('Could not refresh Supabase payment records:', loadError)
      setError(loadError.message || 'Could not refresh payment records.')
    } finally {
      setRefreshing(false)
    }
  }

  async function confirmPayment(order) {
    if (paymentStatus(order) !== 'unpaid' || savingId) return
    const orderNumber = order.order_number || `#${order.id.slice(0, 7)}`
    if (!window.confirm(`Confirm that ${formatCurrency(amountFor(order))} has been received for order ${orderNumber}?`)) return

    setSavingId(order.id)
    setError('')
    setSuccess('')
    try {
      const { error: confirmError } = await requireSupabase()
        .rpc('confirm_order_payment', { p_order_id: order.id })
      if (confirmError) throw confirmError

      setSuccess(`Payment for order ${orderNumber} was confirmed and recorded.`)
      try {
        await load()
      } catch (loadError) {
        console.error('Payment was confirmed, but the dashboard could not refresh:', loadError)
        setError(`Payment was confirmed, but the records could not be refreshed: ${loadError.message || 'Unknown error'}`)
      }
    } catch (confirmError) {
      console.error('Could not confirm Supabase payment:', confirmError, { orderId: order.id })
      setError(confirmError.message || 'Could not confirm payment. Please refresh and try again.')
    } finally {
      setSavingId('')
    }
  }

  if (loading) return <Loading label="Loading payment records…" />

  const cards = [
    { label: 'Total collected', value: formatCurrency(analytics.collected), icon: '₹', tone: 'green', detail: 'Verified paid orders' },
    { label: 'Total pending', value: formatCurrency(analytics.pending), icon: '◷', tone: 'gold', detail: 'Unpaid orders' },
    { label: 'Paid transactions', value: analytics.paidCount, icon: '✓', tone: 'mint', detail: 'Confirmed payments' },
    { label: 'Unpaid transactions', value: analytics.unpaidCount, icon: '↗', tone: 'cream', detail: 'Awaiting confirmation' },
    { label: 'Not recorded', value: analytics.notRecordedCount, icon: '—', tone: 'peach', detail: 'Legacy / missing payment data' },
  ]

  return (
    <>
      <PageHeader
        eyebrow="REVENUE & SETTLEMENT"
        title="Payment Management"
        description="Review recorded payments and confirm receipts only after verifying them."
        action={<button className="button button-quiet" onClick={refreshNow} disabled={refreshing}>{refreshing ? 'Refreshing…' : '↻ Refresh'}</button>}
      />
      {error && <Notice tone="error">{error}</Notice>}
      {success && <Notice tone="success">{success}</Notice>}

      <section className="payment-stats-grid" aria-label="Payment analytics">
        {cards.map((card, index) => (
          <article className={`stat-card stat-${card.tone}`} key={card.label} style={{ '--delay': `${index * 45}ms` }}>
            <div className="stat-top"><span>{card.label}</span><span className="stat-icon">{card.icon}</span></div>
            <strong className="stat-value">{card.value}</strong>
            <small className="stat-detail">{card.detail}</small>
          </article>
        ))}
      </section>

      <section className="orders-toolbar payment-toolbar">
        <label className="search-field">
          <span>⌕</span>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search order or customer" aria-label="Search order or customer" />
        </label>
        <label className="filter-field">
          <span>Payment</span>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} aria-label="Filter by payment status">
            <option value="all">All statuses</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="not_recorded">Not recorded</option>
          </select>
        </label>
        <label className="filter-field">
          <span>Method</span>
          <select value={methodFilter} onChange={event => setMethodFilter(event.target.value)} aria-label="Filter by payment method">
            <option value="all">All methods</option>
            {methods.map(method => <option key={method} value={method}>{paymentMethodLabel(method)}</option>)}
          </select>
        </label>
        <label className="filter-field payment-date-filter">
          <span>Date</span>
          <input type="date" value={dateFilter} onChange={event => setDateFilter(event.target.value)} aria-label="Filter by payment date or order date when unpaid" />
        </label>
        <span className="result-count">{filteredOrders.length} records</span>
      </section>

      <section className="panel">
        {error && orders.length === 0 ? (
          <EmptyState title="Payment records unavailable" detail="Check the database connection and payment migration, then refresh." />
        ) : filteredOrders.length === 0 ? (
          <EmptyState
            title={orders.length ? 'No matching payments' : 'No payment records yet'}
            detail={orders.length ? 'Try adjusting your search or filters.' : 'Customer orders will appear here after they are placed.'}
          />
        ) : (
          <div className="table-scroll">
            <table className="data-table payment-table">
              <thead>
                <tr>
                  <th>ORDER NUMBER</th><th>CUSTOMER</th><th>TABLE</th><th>AMOUNT</th><th>PAYMENT METHOD</th>
                  <th>PAYMENT STATUS</th><th>ORDER STATUS</th><th>PAYMENT DATE</th><th>CONFIRMED BY</th><th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => {
                  const status = paymentStatus(order)
                  const orderNumber = order.order_number || `#${order.id.slice(0, 7)}`
                  const amount = amountFor(order)
                  return (
                    <tr key={order.id}>
                      <td><strong className="payment-order-number">{orderNumber}</strong></td>
                      <td><strong>{order.customer_name || 'Guest'}</strong></td>
                      <td>Table {order.table_number || '—'}</td>
                      <td><strong>{amount === null ? '—' : formatCurrency(amount)}</strong></td>
                      <td>{paymentMethodLabel(order.payment_method)}</td>
                      <td><StatusBadge status={status} /></td>
                      <td><StatusBadge status={orderStatusLabel(order.status)} /></td>
                      <td>{order.payment_confirmed_at ? formatDate(order.payment_confirmed_at) : '—'}</td>
                      <td title={order.payment_confirmed_by ? `User ID ${order.payment_confirmed_by}` : undefined}>
                        {order.payment_confirmed_by ? `Staff · ${order.payment_confirmed_by.slice(0, 8)}` : '—'}
                      </td>
                      <td>
                        {status === 'unpaid' && order.status !== 'cancelled' ? (
                          <button
                            className="button button-small button-secondary"
                            onClick={() => confirmPayment(order)}
                            disabled={Boolean(savingId)}
                          >
                            {savingId === order.id ? 'Saving…' : '✓ Confirm'}
                          </button>
                        ) : status === 'paid' ? <span className="muted-copy">Confirmed</span> : <span className="muted-copy">Unavailable</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
