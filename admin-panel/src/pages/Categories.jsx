import { useCallback, useEffect, useState } from 'react'
import { EmptyState, Field, FormActions, Loading, Modal, Notice, PageHeader } from '../components/Shared'
import { requireSupabase } from '../lib/supabase'

const emptyCategory = { name: '', icon: '🍽️', description: '', display_order: 0 }

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data, error: queryError } = await requireSupabase()
      .from('menu_categories').select('*').order('display_order').order('name')
    if (queryError) throw queryError
    setCategories(data || [])
  }, [])

  useEffect(() => {
    let active = true
    // Load initial data from Supabase; the updates are asynchronous external data.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(loadError => active && setError(loadError.message || 'Could not load categories.')).finally(() => active && setLoading(false))
    return () => { active = false }
  }, [load])

  async function saveCategory(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      const { id, ...values } = editing
      const payload = { ...values, name: values.name.trim(), description: values.description.trim(), display_order: Number(values.display_order || 0) }
      const query = id
        ? requireSupabase().from('menu_categories').update(payload).eq('id', id)
        : requireSupabase().from('menu_categories').insert(payload)
      const { error: saveError } = await query
      if (saveError) throw saveError
      setEditing(null)
      await load()
      setNotice(id ? 'Category updated.' : 'Category added.')
    } catch (saveError) {
      setError(saveError.message || 'Could not save this category.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteCategory(category) {
    const { count, error: countError } = await requireSupabase().from('menu_items')
      .select('id', { count: 'exact', head: true }).eq('category_id', category.id)
    if (countError) {
      setError(countError.message || 'Could not check category usage.')
      return
    }
    if (count > 0) {
      setError(`"${category.name}" contains ${count} menu item${count === 1 ? '' : 's'}. Reassign or delete those items before removing the category.`)
      return
    }
    if (!window.confirm(`Delete category "${category.name}"?`)) return
    const { error: deleteError } = await requireSupabase().from('menu_categories').delete().eq('id', category.id)
    if (deleteError) setError(deleteError.message || 'Could not delete this category.')
    else {
      setCategories(current => current.filter(item => item.id !== category.id))
      setNotice('Category deleted.')
    }
  }

  async function moveCategory(category, direction) {
    const index = categories.findIndex(item => item.id === category.id)
    const other = categories[index + direction]
    if (!other) return
    setError('')
    const reordered = [...categories]
    reordered.splice(index, 1)
    reordered.splice(index + direction, 0, category)
    for (const [position, row] of reordered.entries()) {
      const { error: updateError } = await requireSupabase().from('menu_categories')
        .update({ display_order: position + 1 }).eq('id', row.id)
      if (updateError) {
        setError(updateError.message || 'Could not change category order.')
        await load()
        return
      }
    }
    await load()
  }

  if (loading) return <Loading label="Loading categories…" />

  return (
    <>
      <PageHeader eyebrow="MENU STRUCTURE" title="Categories" description="Organize the menu and choose the order customers see." action={<button className="button button-primary" onClick={() => setEditing({ ...emptyCategory, display_order: categories.length + 1 })}>＋ Add category</button>} />
      {error && <Notice tone="error">{error}</Notice>}
      {notice && <Notice tone="success" onDismiss={() => setNotice('')}>{notice}</Notice>}
      <section className="panel">
        {categories.length === 0 ? <EmptyState title="No categories yet" detail="Add menu categories here or import the existing customer menu from the Menu page." /> : (
          <div className="category-list">
            {categories.map((category, index) => (
              <article className="category-row" key={category.id}>
                <span className="category-order">{String(index + 1).padStart(2, '0')}</span>
                <span className="category-icon">{category.icon || '🍽️'}</span>
                <div className="category-copy"><strong>{category.name}</strong><small>{category.description || 'No description'}</small></div>
                <div className="category-actions">
                  <button className="icon-button" disabled={index === 0} onClick={() => moveCategory(category, -1)} aria-label={`Move ${category.name} up`}>↑</button>
                  <button className="icon-button" disabled={index === categories.length - 1} onClick={() => moveCategory(category, 1)} aria-label={`Move ${category.name} down`}>↓</button>
                  <button className="text-button" onClick={() => setEditing({ ...category })}>Edit</button>
                  <button className="text-button danger-text" onClick={() => deleteCategory(category)}>Delete</button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {editing && <Modal title={editing.id ? 'Edit category' : 'Add category'} onClose={() => setEditing(null)}>
        <form className="stack-form" onSubmit={saveCategory}>
          <Field label="Category name"><input value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })} required maxLength="80" /></Field>
          <div className="form-grid">
            <Field label="Icon (emoji)"><input value={editing.icon} onChange={event => setEditing({ ...editing, icon: event.target.value })} maxLength="8" /></Field>
            <Field label="Display order"><input type="number" min="0" step="1" value={editing.display_order} onChange={event => setEditing({ ...editing, display_order: event.target.value })} /></Field>
          </div>
          <Field label="Short description"><textarea rows="3" maxLength="200" value={editing.description} onChange={event => setEditing({ ...editing, description: event.target.value })} /></Field>
          <FormActions onCancel={() => setEditing(null)} saving={saving} submitLabel={editing.id ? 'Save category' : 'Add category'} />
        </form>
      </Modal>}
    </>
  )
}
