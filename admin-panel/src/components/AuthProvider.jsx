import { useEffect, useMemo, useState } from 'react'
import { isSupabaseConfigured, requireSupabase } from '../lib/supabase'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [canConfirmPayments, setCanConfirmPayments] = useState(false)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined

    let active = true
    const client = requireSupabase()

    async function updateSession(nextSession) {
      if (!active) return
      setSession(nextSession)
      setIsAdmin(false)
      setCanConfirmPayments(false)
      setError('')
      if (!nextSession?.user) {
        setLoading(false)
        return
      }
      setLoading(true)

      const { data, error: roleError } = await client
        .from('admin_users')
        .select('user_id,role,can_confirm_payments')
        .eq('user_id', nextSession.user.id)
        .maybeSingle()

      if (!active) return
      if (roleError) {
        setError(`Could not verify admin access: ${roleError.message}`)
      } else {
        setIsAdmin(data?.role === 'admin')
        setCanConfirmPayments(Boolean(
          data && (data.role === 'admin' || data.role === 'manager' || data.can_confirm_payments),
        ))
      }
      setLoading(false)
    }

    client.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        if (active) {
          setError(sessionError.message)
          setLoading(false)
        }
        return
      }
      updateSession(data.session)
    })

    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      setTimeout(() => updateSession(nextSession), 0)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    isAdmin,
    canConfirmPayments,
    loading,
    error,
    signIn: async (email, password) => {
      const client = requireSupabase()
      const { data, error: signInError } = await client.auth.signInWithPassword({ email, password })
      if (signInError) throw signInError
      return data
    },
    signOut: async () => {
      const { error: signOutError } = await requireSupabase().auth.signOut()
      if (signOutError) throw signOutError
    },
  }), [session, isAdmin, canConfirmPayments, loading, error])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
