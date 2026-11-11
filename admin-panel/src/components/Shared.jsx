import { useEffect } from 'react'

export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="page-header">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {action && <div className="header-action">{action}</div>}
    </div>
  )
}

export function Notice({ children, tone = 'info', onDismiss }) {
  return (
    <div className={`notice notice-${tone}`} role="status">
      <span>{children}</span>
      {onDismiss && <button className="icon-button" onClick={onDismiss} aria-label="Dismiss">×</button>}
    </div>
  )
}

export function Panel({ title, action, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <div className="panel-heading">
          {title && <h2>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function EmptyState({ title, detail, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">✳</span>
      <h3>{title}</h3>
      {detail && <p>{detail}</p>}
      {action}
    </div>
  )
}

export function Loading({ label = 'Loading data…' }) {
  return <div className="loading-state"><span className="spinner" />{label}</div>
}

export function Modal({ title, onClose, children, size = '' }) {
  useEffect(() => {
    function onKeyDown(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className={`modal ${size}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">×</button>
        </div>
        {children}
      </section>
    </div>
  )
}

export function StatusBadge({ status }) {
  const normalized = String(status || '').toLowerCase().replaceAll('_', '-')
  return <span className={`status-badge status-${normalized}`}>{String(status || 'unknown').replaceAll('_', ' ')}</span>
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  )
}

export function FormActions({ onCancel, saving, submitLabel = 'Save changes' }) {
  return (
    <div className="form-actions">
      <button className="button button-quiet" type="button" onClick={onCancel} disabled={saving}>Cancel</button>
      <button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : submitLabel}</button>
    </div>
  )
}
