import { useCallback, useEffect, useMemo, useState } from 'react'
import { categories as sourceCategories, categoryMeta, menuItems as sourceMenuItems } from '../../../customer-app/src/data/menuData.js'
import { EmptyState, Field, FormActions, Loading, Modal, Notice, PageHeader, StatusBadge } from '../components/Shared'
import { formatCurrency } from '../lib/format'
import { requireSupabase } from '../lib/supabase'

const emptyItem = { name: '', category_id: '', price: '', description: '', type: 'Veg', image: '', is_available: true, display_order: 0 }

export default function Menu() {
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [isPublished, setIsPublished] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [availabilityFilter, setAvailabilityFilter] = useState('all')
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const client = requireSupabase()
    const [menuResult, categoryResult, settingsResult] = await Promise.all([
      client.from('menu_items').select('*, menu_categories(id,name)').order('display_order').order('name'),
      client.from('menu_categories').select('*').order('display_order').order('name'),
      client.from('menu_settings').select('is_published').eq('singleton', true).single(),
    ])
    if (menuResult.error) throw menuResult.error
    if (categoryResult.error) throw categoryResult.error
    if (settingsResult.error) throw settingsResult.error
    setItems(menuResult.data || [])
    setCategories(categoryResult.data || [])
    setIsPublished(Boolean(settingsResult.data.is_published))
  }, [])

  useEffect(() => {
    let active = true
    // Load initial data from Supabase; the updates are asynchronous external data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(loadError => active && setError(loadError.message || 'Could not load the menu.')).finally(() => active && setLoading(false))
    return () => { active = false }
  }, [load])

  const filtered = useMemo(() => items.filter(item => {
    const query = search.trim().toLowerCase()
    return (!query || `${item.name} ${item.description || ''}`.toLowerCase().includes(query)) &&
      (!categoryFilter || item.category_id === categoryFilter) &&
      (availabilityFilter === 'all' || String(item.is_available) === availabilityFilter)
  }), [items, search, categoryFilter, availabilityFilter])

  async function saveItem(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const { id, ...formValues } = editing
      delete formValues.menu_categories
      const payload = {
        ...formValues,
        price: Number(formValues.price),
        display_order: Number(formValues.display_order || 0),
        description: formValues.description.trim(),
        image: formValues.image.trim(),
      }
      const query = id
        ? requireSupabase().from('menu_items').update(payload).eq('id', id)
        : requireSupabase().from('menu_items').insert(payload)
      const { error: saveError } = await query
      if (saveError) throw saveError
      setEditing(null)
      await load()
      setNotice(id ? 'Menu item updated.' : 'Menu item added.')
    } catch (saveError) {
      setError(saveError.message || 'Could not save this menu item.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteItem(item) {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return
    setError('')
    const { error: deleteError } = await requireSupabase().from('menu_items').delete().eq('id', item.id)
    if (deleteError) setError(deleteError.message || 'Could not delete the menu item.')
    else {
      setItems(current => current.filter(entry => entry.id !== item.id))
      setNotice('Menu item deleted.')
    }
  }

  async function toggleAvailability(item) {
    setError('')
    const { error: updateError } = await requireSupabase().from('menu_items').update({ is_available: !item.is_available }).eq('id', item.id)
    if (updateError) setError(updateError.message || 'Could not update availability.')
    else setItems(current => current.map(entry => entry.id === item.id ? { ...entry, is_available: !entry.is_available } : entry))
  }

  async function importExistingMenu() {
    const confirmed = window.confirm('Import all 380 checked-in customer menu items and 10 categories? Matching legacy menu items will have their details updated from the local source; their current availability setting will be preserved.')
    if (!confirmed) return
    setError('')
    setNotice('')
    setSaving(true)
    try {
      const client = requireSupabase()
      const rows = sourceCategories.slice(1).map((name, index) => ({
        name,
        icon: categoryMeta[name]?.icon || '🍽️',
        description: categoryMeta[name]?.desc || '',
        display_order: index + 1,
      }))
      const { data: savedCategories, error: categoriesError } = await client
        .from('menu_categories').upsert(rows, { onConflict: 'name' }).select('id,name')
      if (categoriesError) throw categoriesError
      const categoryIdByName = new Map(savedCategories.map(category => [category.name, category.id]))
      const { data: existingItems, error: existingError } = await client
        .from('menu_items').select('legacy_id,is_available').not('legacy_id', 'is', null)
      if (existingError) throw existingError
      const availabilityByLegacyId = new Map((existingItems || []).map(item => [item.legacy_id, item.is_available]))
      const rowsToSave = sourceMenuItems.map((item, index) => ({
        legacy_id: item.id,
        name: item.name,
        category_id: categoryIdByName.get(item.category),
        price: item.price,
        description: item.description || '',
        type: item.type || 'Veg',
        image: item.image || '',
        is_available: availabilityByLegacyId.get(item.id) ?? true,
        is_popular: Boolean(item.isPopular),
        is_chef_special: Boolean(item.isChefSpecial),
        display_order: index + 1,
      }))
      const { error: itemsError } = await client.from('menu_items').upsert(rowsToSave, { onConflict: 'legacy_id' })
      if (itemsError) throw itemsError
      await load()
      setNotice(`Imported ${rowsToSave.length} menu items and ${rows.length} categories. Existing records with matching legacy IDs were updated.`)
    } catch (importError) {
      setError(importError.message || 'Could not import the existing customer menu.')
    } finally {
      setSaving(false)
    }
  }

  async function togglePublished() {
    setSaving(true)
    setError('')
    try {
      const nextState = !isPublished
      const { error: updateError } = await requireSupabase().from('menu_settings')
        .update({ is_published: nextState }).eq('singleton', true)
      if (updateError) throw updateError
      setIsPublished(nextState)
      setNotice(nextState ? 'Menu published to the customer app.' : 'Customer ordering has returned to the built-in menu.')
    } catch (updateError) {
      setError(updateError.message || 'Could not change menu publication.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Loading label="Loading menu…" />

  return (
    <>
      <PageHeader eyebrow="CATALOGUE" title="Menu" description={`${items.length} dishes · manage pricing, details and availability.`} action={
        <div className="button-row">
          <button className="button button-quiet" onClick={importExistingMenu} disabled={saving}>⇧ Import customer menu</button>
          <button className={`button ${isPublished ? 'button-secondary' : 'button-quiet'}`} onClick={togglePublished} disabled={saving || (!isPublished && items.length === 0)}>{isPublished ? '● Published' : 'Publish menu'}</button>
          <button className="button button-primary" onClick={() => setEditing({ ...emptyItem, category_id: categories[0]?.id || '' })} disabled={categories.length === 0}>＋ Add dish</button>
        </div>
      } />
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>}
      <Notice tone={isPublished ? 'success' : 'info'}>Customer menu: {isPublished ? 'published database menu' : 'built-in menu'}{!isPublished && ' · Publish when you are ready to switch ordering to database items.'}</Notice>
      {categories.length === 0 && <Notice tone="warning">No menu categories exist yet. Add categories before creating menu items.</Notice>}
      <section className="orders-toolbar">
        <label className="search-field"><span>⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search menu items" /></label>
        <label className="filter-field"><span>Category</span><select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="">All categories</option>{categories.map(category => <option value={category.id} key={category.id}>{category.name}</option>)}</select></label>
        <label className="filter-field"><span>Availability</span><select value={availabilityFilter} onChange={event => setAvailabilityFilter(event.target.value)}><option value="all">All dishes</option><option value="true">Available</option><option value="false">Unavailable</option></select></label>
        <span className="result-count">{filtered.length} dishes</span>
      </section>
      <section className="panel">
        {filtered.length === 0 ? <EmptyState title={items.length ? 'No matching dishes' : 'Your menu is ready to build'} detail={items.length ? 'Try another search or filter.' : 'Import the existing 380-dish customer menu to get started, or add a new dish.'} action={!items.length && <button className="button button-secondary" onClick={importExistingMenu} disabled={saving}>Import existing customer menu</button>} /> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>DISH</th><th>CATEGORY</th><th>TYPE</th><th>PRICE</th><th>AVAILABILITY</th><th>ACTIONS</th></tr></thead>
              <tbody>{filtered.map(item => (
                <tr key={item.id}>
                  <td><div className="menu-cell">{item.image ? <img src={item.image} alt="" loading="lazy" /> : <span className="menu-image-placeholder">✳</span>}<div><strong>{item.name}</strong><small className="table-subtext">{item.description || 'No description'}</small></div></div></td>
                  <td>{item.menu_categories?.name || '—'}</td>
                  <td><span className={`food-type food-${(item.type || '').toLowerCase().replaceAll('-', '')}`}><i />{item.type || '—'}</span></td>
                  <td><strong>{formatCurrency(item.price)}</strong></td>
                  <td><button className="availability-toggle" onClick={() => toggleAvailability(item)} aria-pressed={item.is_available}><StatusBadge status={item.is_available ? 'available' : 'unavailable'} /></button></td>
                  <td><div className="row-actions"><button className="text-button" onClick={() => setEditing({ ...emptyItem, ...item })}>Edit</button><button className="text-button danger-text" onClick={() => deleteItem(item)}>Delete</button></div></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      {editing && <Modal title={editing.id ? 'Edit menu item' : 'Add menu item'} onClose={() => setEditing(null)}>
        <form className="stack-form" onSubmit={saveItem}>
          <Field label="Dish name"><input value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} required maxLength={100} /></Field>
          <div className="form-grid">
            <Field label="Category"><select value={editing.category_id} onChange={event => setEditing({ ...editing, category_id: event.target.value })} required><option value="" disabled>Select a category</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>
            <Field label="Price (INR)"><input type="number" min="0" step="0.01" value={editing.price} onChange={event => setEditing({ ...editing, price: event.target.value })} required /></Field>
          </div>
          <div className="form-grid">
            <Field label="Food type"><select value={editing.type || 'Veg'} onChange={event => setEditing({ ...editing, type: event.target.value })}><option>Veg</option><option>Non-Veg</option><option>Egg</option></select></Field>
            <Field label="Display order"><input type="number" min="0" step="1" value={editing.display_order ?? 0} onChange={event => setEditing({ ...editing, display_order: event.target.value })} /></Field>
          </div>
          <Field label="Description"><textarea rows="3" maxLength="500" value={editing.description || ''} onChange={event => setEditing({ ...editing, description: event.target.value })} /></Field>
          <Field label="Image URL"><input type="url" value={editing.image || ''} onChange={event => setEditing({ ...editing, image: event.target.value })} placeholder="https://…" /></Field>
          <label className="checkbox-field"><input type="checkbox" checked={Boolean(editing.is_available)} onChange={event => setEditing({ ...editing, is_available: event.target.checked })} /><span>Available to order</span></label>
          <label className="checkbox-field"><input type="checkbox" checked={Boolean(editing.is_popular)} onChange={event => setEditing({ ...editing, is_popular: event.target.checked })} /><span>Mark as popular</span></label>
          <label className="checkbox-field"><input type="checkbox" checked={Boolean(editing.is_chef_special)} onChange={event => setEditing({ ...editing, is_chef_special: event.target.checked })} /><span>Mark as chef special</span></label>
          <FormActions onCancel={() => setEditing(null)} saving={saving} submitLabel={editing.id ? 'Save dish' : 'Add dish'} />
        </form>
      </Modal>}
    </>
  )
}
