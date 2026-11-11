import { useCallback, useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { EmptyState, Field, FormActions, Loading, Modal, Notice, PageHeader, StatusBadge } from '../components/Shared'
import { requireSupabase } from '../lib/supabase'

const customerAppUrl = import.meta.env.VITE_CUSTOMER_APP_URL || 'http://localhost:5173'
const emptyTable = { table_number: '', capacity: 2, status: 'active' }

function getCustomerUrl(tableNumber) {
  const url = new URL(customerAppUrl)
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('VITE_CUSTOMER_APP_URL must use HTTP or HTTPS.')
  }
  url.searchParams.set('table', tableNumber)
  return url.toString()
}

export default function Tables() {
  const [tables, setTables] = useState([])
  const [editing, setEditing] = useState(null)
  const [selected, setSelected] = useState(null)
  const [qr, setQr] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data, error: queryError } = await requireSupabase()
      .from('restaurant_tables').select('*').order('table_number')
    if (queryError) throw queryError
    setTables(data || [])
  }, [])

  useEffect(() => {
    let active = true
    // Load initial data from Supabase; the updates are asynchronous external data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(loadError => active && setError(loadError.message || 'Could not load tables.')).finally(() => active && setLoading(false))
    return () => { active = false }
  }, [load])

  async function saveTable(event) {
    event.preventDefault()
    setError('')
    setSaving(true)
    try {
      const { id, ...values } = editing
      const payload = { ...values, table_number: String(values.table_number).trim(), capacity: Number(values.capacity) }
      const query = id
        ? requireSupabase().from('restaurant_tables').update(payload).eq('id', id)
        : requireSupabase().from('restaurant_tables').insert(payload)
      const { error: saveError } = await query
      if (saveError) throw saveError
      setEditing(null)
      await load()
      setNotice(id ? 'Table updated.' : 'Table added.')
    } catch (saveError) {
      setError(saveError.message || 'Could not save this table.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteTable(table) {
    if (!window.confirm(`Delete Table ${table.table_number}? Past order records will remain unchanged.`)) return
    const { error: deleteError } = await requireSupabase().from('restaurant_tables').delete().eq('id', table.id)
    if (deleteError) setError(deleteError.message || 'Could not delete this table.')
    else {
      setTables(current => current.filter(item => item.id !== table.id))
      setNotice(`Table ${table.table_number} deleted.`)
    }
  }

  async function showQr(table) {
    setError('')
    try {
      const customerUrl = getCustomerUrl(table.table_number)
      const dataUrl = await QRCode.toDataURL(customerUrl, {
        width: 720,
        margin: 2,
        errorCorrectionLevel: 'H',
        color: { dark: '#173b2e', light: '#ffffff' },
      })
      setSelected({ ...table, customerUrl })
      setQr(dataUrl)
    } catch (qrError) {
      setError(`Could not generate the table QR. Check VITE_CUSTOMER_APP_URL: ${qrError.message}`)
    }
  }

  if (loading) return <Loading label="Loading tables…" />

  return (
    <>
      <PageHeader eyebrow="DINING ROOM" title="Tables & QR" description={`Manage seating and generate QR codes that open the customer menu with the correct table preselected.`} action={<button className="button button-primary" onClick={() => setEditing({ ...emptyTable })}>＋ Add table</button>} />
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>}
      <div className="qr-origin-note"><span>↗</span><div><strong>Customer app destination</strong><small>{customerAppUrl} · QR codes use the existing <code>?table=…</code> flow.</small></div></div>
      <section className="panel">
        {tables.length === 0 ? <EmptyState title="No tables configured" detail="Add your dining tables to create a QR code for each one." /> : (
          <div className="table-card-grid">
            {tables.map(table => (
              <article className={`table-card ${table.status === 'inactive' ? 'table-card-inactive' : ''}`} key={table.id}>
                <div className="table-card-top"><span className="table-card-icon">⌗</span><StatusBadge status={table.status} /></div>
                <strong className="table-card-number">Table {table.table_number}</strong>
                <span className="table-card-capacity">♧ &nbsp; Seats {table.capacity}</span>
                <div className="table-card-actions"><button className="button button-secondary" onClick={() => showQr(table)}>▦ View QR</button><button className="icon-button" onClick={() => setEditing({ ...table })} aria-label={`Edit table ${table.table_number}`}>✎</button><button className="icon-button danger-icon" onClick={() => deleteTable(table)} aria-label={`Delete table ${table.table_number}`}>×</button></div>
              </article>
            ))}
          </div>
        )}
      </section>
      {editing && <Modal title={editing.id ? `Edit Table ${editing.table_number}` : 'Add table'} onClose={() => setEditing(null)}>
        <form className="stack-form" onSubmit={saveTable}>
          <Field label="Table number"><input value={editing.table_number} onChange={event => setEditing({ ...editing, table_number: event.target.value })} required maxLength="20" /></Field>
          <div className="form-grid">
            <Field label="Seating capacity"><input type="number" min="1" max="100" step="1" value={editing.capacity} onChange={event => setEditing({ ...editing, capacity: event.target.value })} required /></Field>
            <Field label="Table status"><select value={editing.status} onChange={event => setEditing({ ...editing, status: event.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></Field>
          </div>
          <FormActions onCancel={() => setEditing(null)} saving={saving} submitLabel={editing.id ? 'Save table' : 'Add table'} />
        </form>
      </Modal>}
      {selected && <Modal title={`Table ${selected.table_number} QR code`} onClose={() => { setSelected(null); setQr('') }} size="qr-modal">
        <div className="qr-preview"><img src={qr} alt={`QR code for Table ${selected.table_number}`} /></div>
        <p className="qr-link">{selected.customerUrl}</p>
        <div className="button-row qr-actions">
          <a className="button button-primary" href={qr} download={`table-${selected.table_number}-qr.png`}>↓ Download PNG</a>
          <button className="button button-quiet" onClick={async () => {
            try { await navigator.clipboard.writeText(selected.customerUrl); setNotice('Customer link copied.') }
            catch { setError('Could not access the clipboard. Copy the link above manually.') }
          }}>Copy customer link</button>
        </div>
      </Modal>}
    </>
  )
}
