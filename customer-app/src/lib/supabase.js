import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ''

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl !== 'https://your-project.supabase.co' &&
  !supabaseUrl.includes('your-project')
)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// Cross-tab broadcast channel for local real-time sync when Supabase is not configured yet
const localChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('starplanet_events')
  : null

/**
 * Insert an order into Supabase. Customer inserts must not request a returned row,
 * because SELECT access is restricted to administrators by the orders RLS policy.
 */
export async function createOrder(orderData) {
  if (!isSupabaseConfigured || !supabase) {
    return {
      success: false,
      message: 'Online ordering is temporarily unavailable. Please ask restaurant staff for help.',
    }
  }

  const items = orderData.items.map(({ item, quantity }) => ({
    id: item.id,
    name: item.name,
    price: Number(item.price),
    quantity: Number(quantity),
  }))
  const payload = {
    order_number: String(orderData.orderId).trim(),
    table_number: String(orderData.table).trim(),
    customer_name: String(orderData.customerName).trim(),
    customer_phone: String(orderData.customerPhone).trim(),
    items,
    instructions: orderData.instructions || '',
    subtotal: Number(orderData.subtotal),
    tax: Number(orderData.tax),
    total: Number(orderData.total),
    payment_method: orderData.paymentMethod,
    status: 'received',
  }

  const amounts = [payload.subtotal, payload.tax, payload.total]
  const validItems = Array.isArray(payload.items) && payload.items.length > 0 &&
    payload.items.every(item => item.name && Number.isFinite(item.price) && item.price >= 0 &&
      Number.isInteger(item.quantity) && item.quantity > 0)
  if (!payload.order_number || !payload.table_number || !payload.customer_name ||
      !payload.customer_phone || !payload.payment_method || !validItems ||
      amounts.some(amount => !Number.isFinite(amount) || amount < 0)) {
    const error = new Error('Order details are incomplete or invalid.')
    console.error('Order payload validation failed:', error, payload)
    return { success: false, error, message: 'Please check your order details and try again.' }
  }

  try {
    const { error } = await supabase.from('orders').insert(payload)
    if (error) {
      console.error('Supabase order insert error:', error, { orderNumber: payload.order_number })
      return {
        success: false,
        error,
        message: 'We could not save your order. Please check your connection and try again.',
      }
    }
    return { success: true }
  } catch (error) {
    console.error('Supabase order request failed:', error, { orderNumber: payload.order_number })
    return {
      success: false,
      error,
      message: 'We could not save your order. Please check your connection and try again.',
    }
  }
}

/**
 * Save a service / waiter call request
 */
export async function createServiceRequest(tableNumber, serviceType) {
  const reqObj = {
    id: 'SR' + Date.now(),
    table: tableNumber,
    requestType: serviceType,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    status: 'pending'
  }

  try {
    const existing = JSON.parse(localStorage.getItem('starplanet_service_requests') || '[]')
    localStorage.setItem('starplanet_service_requests', JSON.stringify([reqObj, ...existing]))

    if (localChannel) {
      localChannel.postMessage({ type: 'SERVICE_REQUEST', request: reqObj })
    }
  } catch (err) {
    console.warn('LocalStorage save failed:', err)
  }

  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.from('service_requests').insert([
        {
          table_number: String(tableNumber),
          request_type: serviceType,
          status: 'pending',
        }
      ])
    } catch (err) {
      console.error('Supabase service request error:', err)
    }
  }

  return reqObj
}

/**
 * Fetch all orders for kitchen / manager dashboard
 */
export async function getLiveOrders() {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured; live orders are unavailable.')
  }

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return data.map(o => ({
      orderId: o.order_number,
      table: o.table_number,
      customerName: o.customer_name,
      customerPhone: o.customer_phone,
      items: o.items,
      instructions: o.instructions,
      subtotal: o.subtotal,
      tax: o.tax,
      total: o.total,
      paymentMethod: o.payment_method,
      status: o.status,
      time: new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: new Date(o.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
    }))
  } catch (error) {
    console.error('Supabase order fetch failed:', error)
    throw error
  }
}

/**
 * Update order status (received -> preparing -> served -> completed)
 */
export async function updateOrderStatus(orderId, newStatus) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured; order status was not updated.')
  }

  try {
    const { data, error } = await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('order_number', orderId)
      .select('order_number')
      .maybeSingle()
    if (error) throw error
    if (!data) throw new Error(`Order ${orderId} was not found or could not be updated.`)
    return { success: true, data }
  } catch (error) {
    console.error('Supabase order status update failed:', error, { orderNumber: orderId, newStatus })
    throw error
  }
}
