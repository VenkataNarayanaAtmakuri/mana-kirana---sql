import { useState } from 'react'
import { updateLiveProfile } from '../lib/liveData.js'

function indianE164(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return /^[6-9]\d{9}$/.test(digits) ? '+91' + digits : ''
}

function mobileDigits(value) {
  return String(value || '').replace(/\D/g, '').slice(-10)
}

export default function EditProfileDialog({ authUser, onClose, onUpdated }) {
  const [fullName, setFullName] = useState(authUser.full_name || '')
  const [phone, setPhone] = useState(mobileDigits(authUser.phone))
  const [currentPassword, setCurrentPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const nextPhone = indianE164(phone)
  const phoneChanged = nextPhone !== authUser.phone

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    const cleanName = fullName.trim()
    if (cleanName.length < 2 || cleanName.length > 100) {
      setError('Enter a name between 2 and 100 characters.')
      return
    }
    if (!nextPhone) {
      setError('Enter a valid 10-digit Indian mobile number.')
      return
    }
    if (phoneChanged && !currentPassword) {
      setError('Enter your current password to change your mobile number.')
      return
    }

    setBusy(true)
    try {
      const updatedProfile = await updateLiveProfile(authUser.id, {
        fullName: cleanName,
        phone: nextPhone,
        currentPassword,
      })
      onUpdated(updatedProfile)
    } catch (updateError) {
      setError(updateError?.message || 'Could not update your profile. Please try again.')
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
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-profile-title">
        <button className="auth-close" type="button" onClick={onClose} aria-label="Close edit profile dialog" disabled={busy}>×</button>
        <p className="eyebrow">MANA KIRANA ACCOUNT</p>
        <h2 id="edit-profile-title">Edit profile</h2>
        <p className="muted">Update your name and the mobile number used to sign in and as your main order contact.</p>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="profile-full-name">Full name</label>
          <input
            id="profile-full-name"
            name="fullName"
            type="text"
            autoComplete="name"
            minLength={2}
            maxLength={100}
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
          />
          <label htmlFor="profile-mobile-number">Mobile number</label>
          <div className="auth-phone-input">
            <span aria-hidden="true">+91</span>
            <input
              id="profile-mobile-number"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="10-digit number"
              pattern="[6-9][0-9]{9}"
              maxLength={10}
              required
            />
          </div>
          <p className="profile-phone-hint">Use a number you control. Changing it also changes your sign-in number.</p>
          {phoneChanged && (
            <>
              <label htmlFor="profile-current-password">Current password to confirm mobile change</label>
              <input
                id="profile-current-password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                maxLength={128}
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </>
          )}
          <button className="btn primary" type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Save profile'}
          </button>
        </form>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-resend" type="button" onClick={onClose} disabled={busy}>Cancel</button>
      </section>
    </div>
  )
}
