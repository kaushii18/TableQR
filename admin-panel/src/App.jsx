import { useState } from 'react'
import { BrowserRouter, Link, NavLink, Navigate, Outlet, Route, Routes, useNavigate } from 'react-router-dom'
import { AuthProvider } from './components/AuthProvider'
import { useAuth } from './components/auth-context'
import { Notice, Loading } from './components/Shared'
import { isSupabaseConfigured } from './lib/supabase'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import Menu from './pages/Menu'
import Categories from './pages/Categories'
import Tables from './pages/Tables'
import ServiceRequests from './pages/ServiceRequests'
import Settings from './pages/Settings'

const navigation = [
  { to: '/', label: 'Overview', icon: '◫', end: true },
  { to: '/orders', label: 'Orders', icon: '▤' },
  { to: '/menu', label: 'Menu', icon: '◉' },
  { to: '/categories', label: 'Categories', icon: '▦' },
  { to: '/tables', label: 'Tables & QR', icon: '⌗' },
  { to: '/service-requests', label: 'Service requests', icon: '♧' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
]

function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      await signIn(email.trim(), password)
      navigate('/', { replace: true })
    } catch (signInError) {
      setError(signInError.message || 'Unable to sign in.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="login-page">
      <div className="login-decoration" aria-hidden="true" />
      <section className="login-card">
        <Link className="brand-lockup" to="/login">
          <span className="brand-mark">SP</span>
          <span><strong>STAR PLANET</strong><small>FAMILY RESTAURANT &amp; BAR</small></span>
        </Link>
        <p className="eyebrow">STAFF PORTAL</p>
        <h1>Welcome back.</h1>
        <p className="page-description">Sign in to manage restaurant operations.</p>
        {!isSupabaseConfigured && <Notice tone="warning">Add your Supabase project URL and public anon key to admin-panel/.env to enable sign-in.</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        <form className="stack-form login-form" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email address</span>
            <input autoComplete="username" type="email" value={email} onChange={event => setEmail(event.target.value)} required />
          </label>
          <label className="field">
            <span>Password</span>
            <input autoComplete="current-password" type="password" value={password} onChange={event => setPassword(event.target.value)} required />
          </label>
          <button className="button button-primary button-wide" disabled={busy || !isSupabaseConfigured}>
            {busy ? 'Signing in…' : 'Sign in securely'}
          </button>
        </form>
        <p className="login-footnote">Admin access is granted by your Supabase database role. Public registration is disabled.</p>
      </section>
    </main>
  )
}

function AccessDenied() {
  const { signOut, error: authError } = useAuth()
  const [signOutError, setSignOutError] = useState('')
  async function handleSignOut() {
    try {
      await signOut()
    } catch (signOutError) {
      setSignOutError(signOutError.message || 'Sign out failed.')
    }
  }
  return (
    <main className="access-denied">
      <div className="access-denied-card">
        <span className="empty-icon">!</span>
        <p className="eyebrow">ACCESS RESTRICTED</p>
        <h1>This account is not an administrator.</h1>
        <p>Your login succeeded, but Supabase did not grant this account the admin role.</p>
        {authError && <Notice tone="error">{authError}</Notice>}
        {signOutError && <Notice tone="error">{signOutError}</Notice>}
        <button className="button button-primary" onClick={handleSignOut}>Sign out</button>
      </div>
    </main>
  )
}

function AdminLayout() {
  const { user, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [error, setError] = useState('')

  async function handleSignOut() {
    setError('')
    try {
      await signOut()
    } catch (signOutError) {
      setError(signOutError.message || 'Sign out failed.')
    }
  }

  return (
    <div className="app-shell">
      <button className="mobile-menu-toggle" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation">
        {menuOpen ? '×' : '☰'}
      </button>
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <Link className="brand-lockup sidebar-brand" to="/">
          <span className="brand-mark">SP</span>
          <span><strong>STAR PLANET</strong><small>RESTAURANT ADMIN</small></span>
        </Link>
        <p className="nav-caption">WORKSPACE</p>
        <nav className="side-nav">
          {navigation.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
              onClick={() => setMenuOpen(false)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
              {item.to === '/orders' && <span className="nav-link-dot" />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="restaurant-card">
            <span className="restaurant-status-dot" />
            <div><strong>Star Planet</strong><small>Virar, Maharashtra</small></div>
          </div>
          <div className="profile-row">
            <span className="avatar">{user?.email?.slice(0, 1).toUpperCase() || 'A'}</span>
            <span className="profile-email" title={user?.email}>{user?.email}</span>
            <button className="icon-button logout-button" onClick={handleSignOut} title="Sign out" aria-label="Sign out">↗</button>
          </div>
        </div>
      </aside>
      {menuOpen && <button className="sidebar-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}
      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Star Planet</span><span>/</span><strong>Operations</strong></div>
          <div className="topbar-right"><span className="live-dot" /> LIVE SYSTEM <span className="topbar-divider" /> VIRAR, MH</div>
        </header>
        {error && <Notice tone="error" onDismiss={() => setError('')}>{error}</Notice>}
        <div className="page-content"><Outlet /></div>
        <footer className="app-footer"><span>TABLEQR OPERATIONS</span><span>STAR PLANET FAMILY RESTAURANT &amp; BAR</span></footer>
      </main>
    </div>
  )
}

function RouteGate({ children }) {
  const { user, isAdmin, loading, error } = useAuth()
  if (loading) return <Loading label="Verifying your session…" />
  if (!user) return <Navigate to="/login" replace />
  if (error || !isAdmin) return <AccessDenied />
  return children
}

function RouteTree() {
  const { user, isAdmin, loading } = useAuth()
  if (loading) return <Loading label="Verifying your session…" />

  return (
    <Routes>
      <Route path="/login" element={user && isAdmin ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={user ? (isAdmin ? <AdminLayout /> : <RouteGate><AdminLayout /></RouteGate>) : <Navigate to="/login" replace />}>
        <Route index element={<Dashboard />} />
        <Route path="orders" element={<Orders />} />
        <Route path="menu" element={<Menu />} />
        <Route path="categories" element={<Categories />} />
        <Route path="tables" element={<Tables />} />
        <Route path="service-requests" element={<ServiceRequests />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RouteTree />
      </AuthProvider>
    </BrowserRouter>
  )
}
