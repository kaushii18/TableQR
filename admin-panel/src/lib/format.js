export function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(value) || 0)
}

export function formatDate(value, options = {}) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...options,
  }).format(new Date(value))
}

export function todayStart() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}

export function getErrorMessage(error) {
  return error?.message || 'Something went wrong. Please try again.'
}
