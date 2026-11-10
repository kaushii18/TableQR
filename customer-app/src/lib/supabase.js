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
 * Save an order to Supabase (if configured) or localStorage
 */
export async function createOrder(orderData) {
  // Always persist locally in localStorage for offline resilience
  try {
    const existing = JSON.parse(localStorage.getItem('starplanet_all_orders') || '[]')
    localStorage.setItem('starplanet_all_orders', JSON.stringify([orderData, ...existing]))
    localStorage.setItem('starplanet_active_order', JSON.stringify(orderData))

    if (localChannel) {
      localChannel.postMessage({ type: 'NEW_ORDER', order: orderData })
    }
  } catch (err) {
    console.warn('LocalStorage save failed:', err)
  }

  // If Supabase is active, push to remote database
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.from('orders').insert([
        {
          order_number: orderData.orderId,
          table_number: String(orderData.table),
          customer_name: orderData.customerName,
          customer_phone: orderData.customerPhone,
          items: orderData.items,
          instructions: orderData.instructions || '',
          subtotal: orderData.subtotal,
          tax: orderData.tax,
          total: orderData.total,
          payment_method: orderData.paymentMethod,
          status: 'received',
        }
      ]).select()

      if (error) {
        console.error('Supabase order insert error:', error)
        return { success: false, error, localOnly: true }
      }
      return { success: true, data: data[0] }
    } catch (err) {
      console.error('Supabase request failed:', err)
      return { success: false, error: err, localOnly: true }
    }
  }

  return { success: true, localOnly: true }
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
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
      if (!error && data) {
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
      }
    } catch (err) {
      console.warn('Supabase fetch failed, falling back to local:', err)
    }
  }

  // Fallback to localStorage
  try {
    return JSON.parse(localStorage.getItem('starplanet_all_orders') || '[]')
  } catch {
    return []
  }
}

/**
 * Update order status (received -> preparing -> served -> completed)
 */
export async function updateOrderStatus(orderId, newStatus) {
  // Update locally
  try {
    const all = JSON.parse(localStorage.getItem('starplanet_all_orders') || '[]')
    const updated = all.map(o => o.orderId === orderId ? { ...o, status: newStatus } : o)
    localStorage.setItem('starplanet_all_orders', JSON.stringify(updated))

    const active = JSON.parse(localStorage.getItem('starplanet_active_order') || 'null')
    if (active && active.orderId === orderId) {
      localStorage.setItem('starplanet_active_order', JSON.stringify({ ...active, status: newStatus }))
    }

    if (localChannel) {
      localChannel.postMessage({ type: 'STATUS_UPDATE', orderId, status: newStatus })
    }
  } catch (err) {
    console.warn('Local update error:', err)
  }

  // Update in Supabase
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('order_number', orderId)
    } catch (err) {
      console.error('Supabase update status failed:', err)
    }
  }
}
