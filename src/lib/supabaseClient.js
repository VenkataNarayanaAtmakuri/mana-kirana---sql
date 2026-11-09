// Compatibility shim: the frontend now talks to the Mana Kirana Express API,
// not directly to Supabase. Kept at this path to minimize changes to App.jsx.
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:4000' : '')
export const supabaseConfigured = true
const listeners = new Set()
let currentUser = null

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const error = new Error(payload.error || 'Request failed')
    error.status = response.status
    error.payload = payload
    throw error
  }
  return payload
}
function emit(event, user) {
  currentUser = user ? { linkedAccount: null, ...user } : null
  for (const callback of listeners) callback(event, { user: currentUser })
}
export const supabase = {
  auth: {
    async getSession() {
      try {
        const payload = await request('/api/auth/me')
        currentUser = payload.user ? { ...payload.user, linkedAccount: payload.linkedAccount || null } : null
        return { data: { session: currentUser ? { user: currentUser } : null }, error: null }
      } catch (error) { return { data: { session: null }, error } }
    },
    onAuthStateChange(callback) {
      listeners.add(callback)
      return { data: { subscription: { unsubscribe: () => listeners.delete(callback) } } }
    },
    async signInWithPassword({ phone, password, expectedRole = 'customer' }) {
      try {
        const payload = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ phone, password, expectedRole }) })
        const user = { ...payload.user, linkedAccount: payload.linkedAccount || null }
        emit('SIGNED_IN', user)
        return { data: { user, session: { user } }, error: null }
      } catch (error) { return { data: { user: null, session: null }, error } }
    },
    async signUp({ phone, password, options }) {
      try {
        const payload = await request('/api/auth/register', { method: 'POST', body: JSON.stringify({ phone, password, fullName: options?.data?.full_name || '' }) })
        if (payload.user) emit('SIGNED_IN', payload.user)
        return { data: { user: payload.user, session: payload.user ? { user: payload.user } : null, recoveryCode: payload.recoveryCode || null }, error: null }
      } catch (error) { return { data: { user: null, session: null }, error } }
    },
    async linkAccount({ phone, password, expectedRole }) {
      try {
        const payload = await request('/api/auth/link-account', { method: 'POST', body: JSON.stringify({ phone, password, expectedRole }) })
        const user = { ...payload.user, linkedAccount: payload.linkedAccount || null }
        emit('ACCOUNT_SWITCHED', user)
        return { data: { user, session: { user } }, error: null }
      } catch (error) { return { data: { user: null, session: null }, error } }
    },
    async switchAccount() {
      try {
        const payload = await request('/api/auth/switch-account', { method: 'POST', body: '{}' })
        const user = { ...payload.user, linkedAccount: payload.linkedAccount || null }
        emit('ACCOUNT_SWITCHED', user)
        return { data: { user, session: { user } }, error: null }
      } catch (error) { return { data: { user: null, session: null }, error } }
    },
    async signOut() {
      try { await request('/api/auth/logout', { method: 'POST', body: '{}' }) } finally { emit('SIGNED_OUT', null) }
    },
  },
}
export { API_URL, request }
