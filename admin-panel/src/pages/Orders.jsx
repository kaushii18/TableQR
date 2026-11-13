import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState, Loading, Modal, Notice, PageHeader, StatusBadge } from '../components/Shared'
import { formatCurrency, formatDate } from '../lib/format'
import { requireSupabase } from '../lib/supabase'

const statuses = ['all', 'received', 'preparing', 'served', 'completed', 'cancelled']

function getLocalDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getItems(order) {
  if (Array.isArray(order.items)) return order.items
  if (typeof order.items === 'string') {
    try { return JSON.parse(order.items) } catch { return [] }
  }
  return []
}

export default function Orders() {
  const [orders, setOrders] = useState([])
  const [selected, setSelected] = useState(null)
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [date, setDate] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')

  const load = useCallback(async () => {
    const { data, error: queryError } = await requireSupabase()
      .from('orders').select('*').order('created_at', { ascending: false }).limit(500)
    if (queryError) throw queryError
    setOrders(data || [])
  }, [])

  useEffect(() => {
    let active = true
    let refreshInProgress = false
    async function refreshOrders() {
      if (refreshInProgress) return
      refreshInProgress = true
      try {
        await load()
        if (active) setError('')
      } catch (loadError) {
        console.error('Could not load or refresh Supabase orders:', loadError)
        if (active) setError(loadError.message || 'Could not load orders. Please try again.')
      } finally {
        refreshInProgress = false
      }
    }

    // Load initial data from Supabase; the updates are asynchronous external data.
    refreshOrders().finally(() => active && setLoading(false))
    const channel = requireSupabase().channel('admin-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        refreshOrders()
      }).subscribe((status, subscriptionError) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('Order Realtime subscription unavailable; periodic refresh remains active:', subscriptionError || status)
        }
      })
    const pollId = window.setInterval(refreshOrders, 30_000)
    return () => {
      active = false
      window.clearInterval(pollId)
      requireSupabase().removeChannel(channel)
    }
  }, [load])

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase()
    return orders.filter(order => {
      const matchesStatus = status === 'all' || order.status === status
      const matchesDate = !date || getLocalDateKey(new Date(order.created_at)) === date
      const matchesSearch = !query ||
        String(order.order_number || '').toLowerCase().includes(query) ||
        String(order.customer_name || '').toLowerCase().includes(query) ||
        String(order.customer_phone || '').toLowerCase().includes(query)
      return matchesStatus && matchesDate && matchesSearch
    })
  }, [orders, status, search, date])

  async function updateStatus(order, nextStatus) {
    if (nextStatus === order.status) return
    setSavingId(order.id)
    setError('')
    try {
      const { data, error: updateError } = await requireSupabase()
        .from('orders')
        .update({ status: nextStatus })
        .eq('id', order.id)
        .select('id')
        .maybeSingle()
      if (updateError) throw updateError
      if (!data) throw new Error('Order was not updated. It may no longer be available.')
      const updated = { ...order, status: nextStatus }
      setOrders(current => current.map(item => item.id === order.id ? updated : item))
      setSelected(current => current?.id === order.id ? updated : current)
    } catch (updateError) {
      console.error('Could not update Supabase order status:', updateError, {
        orderId: order.id,
        nextStatus,
      })
      setError(updateError.message || 'Could not update order status.')
    } finally {
      setSavingId('')
    }
  }

  if (loading) return <Loading label="Loading orders…" />

  return (
    <>
      <PageHeader eyebrow="FRONT OF HOUSE" title="Orders" description="Monitor incoming tickets and keep every table moving." action={<button className="button button-quiet" onClick={() => { setLoading(true); load().catch(loadError => { console.error('Could not refresh Supabase orders:', loadError); setError(loadError.message || 'Could not refresh orders.') }).finally(() => setLoading(false)) }}>↻ Refresh</button>} />
      {error && <Notice tone="error">{error}</Notice>}
      <section className="orders-toolbar">
        <label className="search-field"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search order, customer or phone" /></label>
        <label className="filter-field"><span>Status</span><select value={status} onChange={event => setStatus(event.target.value)}>{statuses.map(item => <option key={item} value={item}>{item === 'all' ? 'All statuses' : item}</option>)}</select></label>
        <label className="filter-field"><span>Date</span><input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
        <span className="result-count">{filteredOrders.length} orders</span>
      </section>
      <section className="panel">
        {filteredOrders.length === 0 ? <EmptyState title="No matching orders" detail={orders.length ? 'Try adjusting your search or filters.' : 'Customer orders will appear here.'} /> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>ORDER</th><th>PLACED</th><th>CUSTOMER</th><th>TABLE</th><th>ITEMS</th><th>TOTAL</th><th>STATUS</th><th>ACTION</th></tr></thead>
              <tbody>{filteredOrders.map(order => (
                <tr key={order.id}>
                  <td><button className="table-link order-number" onClick={() => setSelected(order)}>{order.order_number || `#${order.id.slice(0, 7)}`}</button></td>
                  <td>{formatDate(order.created_at)}</td>
                  <td><strong>{order.customer_name || 'Guest'}</strong><small className="table-subtext">{order.customer_phone}</small></td>
                  <td>Table {order.table_number}</td>
                  <td>{getItems(order).length} items</td>
                  <td><strong>{formatCurrency(order.total)}</strong></td>
                  <td><StatusBadge status={order.status} /></td>
                  <td><select className="status-select" aria-label={`Update status for order ${order.order_number}`} value={order.status} disabled={savingId === order.id} onChange={event => updateStatus(order, event.target.value)}>{statuses.slice(1).map(item => <option key={item} value={item}>{item}</option>)}</select></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      {selected && <OrderDetails order={selected} onClose={() => setSelected(null)} onStatusChange={updateStatus} saving={savingId === selected.id} />}
    </>
  )
}

function OrderDetails({ order, onClose, onStatusChange, saving }) {
  const items = getItems(order)
  return (
    <Modal title={`Order ${order.order_number || `#${order.id.slice(0, 7)}`}`} onClose={onClose} size="modal-large">
      <div className="order-detail-meta">
        <div><small>CUSTOMER</small><strong>{order.customer_name || 'Guest'}</strong><span>{order.customer_phone || 'No phone provided'}</span></div>
        <div><small>TABLE</small><strong>Table {order.table_number}</strong><span>{formatDate(order.created_at)}</span></div>
        <div><small>PAYMENT</small><strong>{order.payment_method || 'Not specified'}</strong><span><StatusBadge status={order.status} /></span></div>
      </div>
      <h3 className="detail-section-title">Items ordered</h3>
      {items.length ? <div className="order-items">{items.map((item, index) => {
        const name = item.name || item.title || item.item || 'Menu item'
        const quantity = Number(item.quantity ?? item.qty ?? 1)
        const price = Number(item.price || 0)
        return <div className="order-item-row" key={`${name}-${index}`}><div><strong>{name}</strong><span>Qty {quantity}</span></div><strong>{formatCurrency(price * quantity)}</strong></div>
      })}</div> : <p className="muted-copy">No item details were attached to this order.</p>}
      {order.instructions && <div className="instructions-box"><small>SPECIAL INSTRUCTIONS</small><p>{order.instructions}</p></div>}
      <div className="bill-summary">
        <div><span>Subtotal</span><strong>{formatCurrency(order.subtotal)}</strong></div>
        <div><span>Tax</span><strong>{formatCurrency(order.tax)}</strong></div>
        <div className="bill-total"><span>Total</span><strong>{formatCurrency(order.total)}</strong></div>
      </div>
      <label className="field order-status-control"><span>Update order status</span><select value={order.status} disabled={saving} onChange={event => onStatusChange(order, event.target.value)}>{statuses.slice(1).map(item => <option key={item} value={item}>{item}</option>)}</select></label>
    </Modal>
  )
}
