import { useState } from 'react'
import { changeLivePassword } from '../lib/liveData.js'

export default function ChangePasswordDialog({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')

    if (newPassword.length < 8 || newPassword.length > 128) {
      setError('Use a new password between 8 and 128 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('The new passwords do not match.')
      return
    }
    if (newPassword === currentPassword) {
      setError('Choose a new password different from your current one.')
      return
    }

    setBusy(true)
    try {
      await changeLivePassword(currentPassword, newPassword)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setNotice('Your password has been changed.')
    } catch (changeError) {
      setError(changeError?.message || 'Could not change your password. Please try again.')
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
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
        <button className="auth-close" type="button" onClick={onClose} aria-label="Close change password dialog" disabled={busy}>×</button>
        <p className="eyebrow">MANA KIRANA ACCOUNT</p>
        <h2 id="change-password-title">Change password</h2>
        <p className="muted">Confirm your current password, then choose a new one for this account.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="change-current-password">Current password</label>
          <input
            id="change-current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            maxLength={128}
            required
          />
          <label htmlFor="change-new-password">New password</label>
          <input
            id="change-new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
          <label htmlFor="change-confirm-password">Confirm new password</label>
          <input
            id="change-confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            maxLength={128}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
          />
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Updating…' : 'Update password'}
          </button>
        </form>
        {notice && <p className="auth-notice" role="status">{notice}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-resend" type="button" onClick={onClose} disabled={busy}>
          {notice ? 'Done' : 'Cancel'}
        </button>
      </section>
    </div>
  )
}
