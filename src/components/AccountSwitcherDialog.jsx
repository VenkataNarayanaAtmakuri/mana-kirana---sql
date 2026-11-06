import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export default function AccountSwitcherDialog({ currentUser, onClose, onLinked }) {
  const targetRole = currentUser.role === 'customer' ? 'shopkeeper' : 'customer'
  const targetLabel = targetRole === 'shopkeeper' ? 'Shopkeeper' : 'Customer'
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const result = await supabase.auth.linkAccount({ phone, password, expectedRole: targetRole })
      if (result?.error) {
        setError(result.error.message || 'Could not link this account. Please try again.')
        return
      }
      setPassword('')
      onLinked(result.data.user)
    } catch (submitError) {
      setError(submitError?.message || 'Could not link this account. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="auth-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose()
      }}
    >
      <section className="auth-dialog account-switch-dialog" role="dialog" aria-modal="true" aria-labelledby="account-switch-title">
        <button className="auth-close" type="button" aria-label="Close account linking dialog" disabled={busy} onClick={onClose}>×</button>
        <p className="eyebrow">MANA KIRANA ACCOUNTS</p>
        <h2 id="account-switch-title">Link your {targetLabel.toLowerCase()} account</h2>
        <p className="muted">Verify the other account once. Then use the header button to switch between your customer and shopkeeper accounts without signing out.</p>
        <form className="auth-form" onSubmit={submit}>
          <label htmlFor="account-switch-phone">{targetLabel} mobile number</label>
          <div className="auth-phone-input">
            <span aria-hidden="true">+91</span>
            <input
              id="account-switch-phone"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="10-digit number"
              pattern="[6-9][0-9]{9}"
              maxLength={10}
              required
              disabled={busy}
            />
          </div>
          <label htmlFor="account-switch-password">{targetLabel} password</label>
          <input
            id="account-switch-password"
            type="password"
            autoComplete="off"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter this account’s password"
            minLength={8}
            maxLength={128}
            required
            disabled={busy}
          />
          <p className="account-switch-note">The password is checked by the server and is not saved. Only one customer and one shopkeeper account can be linked.</p>
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Verifying account…' : 'Verify and switch'}
          </button>
        </form>
        {error && <p className="auth-error" role="alert">{error}</p>}
      </section>
    </div>
  )
}
