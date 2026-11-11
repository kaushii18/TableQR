import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState, Loading, Notice, PageHeader, StatusBadge } from '../components/Shared'
import { formatDate } from '../lib/format'
import { requireSupabase } from '../lib/supabase'

export default function ServiceRequests() {
  const [requests, setRequests] = useState([])
  const [status, setStatus] = useState('pending')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')

  const load = useCallback(async () => {
    const { data, error: queryError } = await requireSupabase()
      .from('service_requests').select('*').order('created_at', { ascending: false }).limit(500)
    if (queryError) throw queryError
    setRequests(data || [])
  }, [])

  useEffect(() => {
    let active = true
    // Load initial data from Supabase; the updates are asynchronous external data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(loadError => active && setError(loadError.message || 'Could not load service requests.')).finally(() => active && setLoading(false))
    const channel = requireSupabase().channel('admin-service-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_requests' }, () => {
        load().catch(loadError => active && setError(loadError.message || 'Could not refresh service requests.'))
      }).subscribe()
    return () => {
      active = false
      requireSupabase().removeChannel(channel)
    }
  }, [load])

  const filtered = useMemo(() => status === 'all' ? requests : requests.filter(request => request.status === status), [requests, status])

  async function markAttended(request) {
    setSavingId(request.id)
    setError('')
    const { error: updateError } = await requireSupabase().from('service_requests')
      .update({ status: 'attended' }).eq('id', request.id)
    if (updateError) setError(updateError.message || 'Could not update this request.')
    else setRequests(current => current.map(item => item.id === request.id ? { ...item, status: 'attended' } : item))
    setSavingId('')
  }

  if (loading) return <Loading label="Loading service requests…" />

  return (
    <>
      <PageHeader eyebrow="GUEST EXPERIENCE" title="Service requests" description="Respond to waiter calls and table requests as they arrive." action={<button className="button button-quiet" onClick={() => { setLoading(true); load().catch(loadError => setError(loadError.message)).finally(() => setLoading(false)) }}>↻ Refresh</button>} />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="request-summary">
        <div><span className="request-pulse" /><strong>{requests.filter(item => item.status === 'pending').length}</strong><small>Need attention</small></div>
        <div><strong>{requests.length}</strong><small>Total requests</small></div>
      </div>
      <section className="orders-toolbar request-toolbar">
        <span className="toolbar-label">Show requests</span>
        <div className="segmented-control">
          {['pending', 'attended', 'all'].map(item => <button key={item} className={status === item ? 'segment-active' : ''} onClick={() => setStatus(item)}>{item === 'all' ? 'All requests' : item}</button>)}
        </div>
        <span className="result-count">{filtered.length} requests</span>
      </section>
      <section className="panel">
        {filtered.length === 0 ? <EmptyState title={status === 'pending' ? 'All caught up' : 'No service requests'} detail={status === 'pending' ? 'There are no pending calls from guests.' : 'Requests will appear here when guests call for service.'} /> : (
          <div className="table-scroll"><table className="data-table">
            <thead><tr><th>TABLE</th><th>REQUEST</th><th>TIME</th><th>STATUS</th><th>ACTION</th></tr></thead>
            <tbody>{filtered.map(request => (
              <tr key={request.id}>
                <td><strong>Table {request.table_number}</strong></td>
                <td><span className="request-type">{request.request_type}</span></td>
                <td>{formatDate(request.created_at)}</td>
                <td><StatusBadge status={request.status} /></td>
                <td>{request.status === 'pending' ? <button className="button button-small button-secondary" disabled={savingId === request.id} onClick={() => markAttended(request)}>{savingId === request.id ? 'Saving…' : '✓ Mark attended'}</button> : <span className="muted-copy">Complete</span>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </>
  )
}
