import { Link } from 'react-router-dom'
import { Notice, PageHeader, Panel } from '../components/Shared'
import { isSupabaseConfigured } from '../lib/supabase'

export default function Settings() {
  return (
    <>
      <PageHeader eyebrow="WORKSPACE" title="Settings" description="Application setup and access information for your restaurant." />
      {!isSupabaseConfigured && <Notice tone="warning">Supabase environment variables are not configured. Copy admin-panel/.env.example to admin-panel/.env and set the project URL and public anon/publishable key.</Notice>}
      <div className="settings-grid">
        <Panel title="Application">
          <div className="settings-list">
            <div><span>Restaurant</span><strong>Star Planet Family Restaurant &amp; Bar</strong></div>
            <div><span>Location</span><strong>Virar, Maharashtra, India</strong></div>
            <div><span>Supabase client</span><strong><StatusValue active={isSupabaseConfigured} /></strong></div>
            <div><span>Public registration</span><strong>Disabled</strong></div>
            <div><span>Service-role key in browser</span><strong>No</strong></div>
          </div>
        </Panel>
        <Panel title="Administrator access">
          <p className="panel-copy">Staff access requires an authenticated Supabase user whose ID is present in <code>public.admin_users</code>. Admins manage the workspace; managers can access payments, and staff need explicit payment-confirmation permission.</p>
          <p className="panel-copy">Payment confirmation is enforced by a Supabase function and database permissions, not frontend role checks alone. Review both migrations before applying them.</p>
        </Panel>
        <Panel title="Database setup">
          <div className="setup-checklist">
            <p><span>01</span> Configure <code>admin-panel/.env</code> with the shared project URL and public key.</p>
            <p><span>02</span> Review <code>supabase/migrations/20261111_admin_panel.sql</code> and <code>supabase/migrations/20261114_payment_management.sql</code>.</p>
            <p><span>03</span> Approve and apply the SQL manually in Supabase. This app never runs migrations.</p>
            <p><span>04</span> Create users in Supabase Auth and assign each role and any payment permission in <code>public.admin_users</code>.</p>
            <p><span>05</span> Import the existing customer menu from the <Link to="/menu">Menu page</Link>.</p>
          </div>
        </Panel>
        <Panel title="QR destination">
          <p className="panel-copy">Set <code>VITE_CUSTOMER_APP_URL</code> to the deployed customer application URL before downloading table QR codes. The default destination for local development is <code>http://localhost:5173</code>.</p>
          <p className="panel-copy">The generated URL uses the customer app's current <code>?table=…</code> query parameter; it does not introduce a new ordering flow.</p>
        </Panel>
      </div>
    </>
  )
}

function StatusValue({ active }) {
  return <span className={`setup-status ${active ? 'setup-status-ok' : ''}`}><i />{active ? 'Configured' : 'Not configured'}</span>
}
