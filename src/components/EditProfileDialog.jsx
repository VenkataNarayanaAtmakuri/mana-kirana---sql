import { useState } from 'react'
import { createLiveRecoveryCode, issueCustomerRecoveryCode, updateLiveProfile } from '../lib/liveData.js'

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
  const [recoveryPassword, setRecoveryPassword] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [recoveryBusy, setRecoveryBusy] = useState(false)
  const [recoveryError, setRecoveryError] = useState('')
  const [recoveryCopied, setRecoveryCopied] = useState(false)
  const [customerPhone, setCustomerPhone] = useState('')
  const [shopkeeperPassword, setShopkeeperPassword] = useState('')
  const [customerRecoveryCode, setCustomerRecoveryCode] = useState('')
  const [customerRecoveryBusy, setCustomerRecoveryBusy] = useState(false)
  const [customerRecoveryError, setCustomerRecoveryError] = useState('')
  const [customerRecoveryCopied, setCustomerRecoveryCopied] = useState(false)

  const nextPhone = indianE164(phone)
  const phoneChanged = nextPhone !== authUser.phone
  const isShopkeeper = authUser.role === 'shopkeeper'
  const dialogBusy = busy || recoveryBusy || customerRecoveryBusy

  async function copyCode(code, setCopied) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

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

  async function handleCreateRecoveryCode(event) {
    event.preventDefault()
    setRecoveryError('')
    setRecoveryCode('')
    setRecoveryCopied(false)
    if (!recoveryPassword) {
      setRecoveryError('Enter your current password to create a recovery code.')
      return
    }
    setRecoveryBusy(true)
    try {
      const result = await createLiveRecoveryCode(recoveryPassword)
      setRecoveryCode(result.recoveryCode)
      setRecoveryPassword('')
    } catch (createError) {
      setRecoveryError(createError?.message || 'Could not create a recovery code.')
    } finally {
      setRecoveryBusy(false)
    }
  }

  async function handleIssueCustomerCode(event) {
    event.preventDefault()
    setCustomerRecoveryError('')
    setCustomerRecoveryCode('')
    setCustomerRecoveryCopied(false)
    const customerE164 = indianE164(customerPhone)
    if (!customerE164) {
      setCustomerRecoveryError('Enter a valid 10-digit customer mobile number.')
      return
    }
    if (!shopkeeperPassword) {
      setCustomerRecoveryError('Enter your current password to issue a reset code.')
      return
    }
    setCustomerRecoveryBusy(true)
    try {
      const result = await issueCustomerRecoveryCode(customerE164, shopkeeperPassword)
      setCustomerRecoveryCode(result.recoveryCode)
      setShopkeeperPassword('')
    } catch (issueError) {
      setCustomerRecoveryError(issueError?.message || 'Could not issue a customer reset code.')
    } finally {
      setCustomerRecoveryBusy(false)
    }
  }

  return (
    <div
      className="auth-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !dialogBusy) onClose()
      }}
    >
      <section className="auth-dialog profile-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-profile-title">
        <button className="auth-close" type="button" onClick={onClose} aria-label="Close edit profile dialog" disabled={dialogBusy}>×</button>
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

        <section className="recovery-code-panel" aria-labelledby="profile-recovery-title">
          <div>
            <h3 id="profile-recovery-title">Password recovery code</h3>
            <p>Create a one-time code and save it somewhere safe. Creating a new one replaces your previous code.</p>
          </div>
          <form className="recovery-code-form" onSubmit={handleCreateRecoveryCode}>
            <label htmlFor="recovery-current-password">Confirm your current password</label>
            <input
              id="recovery-current-password"
              type="password"
              autoComplete="current-password"
              maxLength={128}
              value={recoveryPassword}
              onChange={(event) => setRecoveryPassword(event.target.value)}
              required
            />
            <button className="btn" type="submit" disabled={recoveryBusy}>
              {recoveryBusy ? 'Creating code…' : recoveryCode ? 'Create a new code' : 'Create recovery code'}
            </button>
          </form>
          {recoveryCode && (
            <div className="recovery-code-result-inline" role="status">
              <strong>Save this code now. It will not be shown again.</strong>
              <code className="recovery-code-value">{recoveryCode}</code>
              <button className="btn" type="button" onClick={() => copyCode(recoveryCode, setRecoveryCopied)}>{recoveryCopied ? 'Copied' : 'Copy recovery code'}</button>
            </div>
          )}
          {recoveryError && <p className="auth-error" role="alert">{recoveryError}</p>}
        </section>

        {isShopkeeper && (
          <section className="recovery-code-panel customer-recovery-panel" aria-labelledby="customer-recovery-title">
            <div>
              <h3 id="customer-recovery-title">Help a customer reset a password</h3>
              <p>Only issue a code after checking the customer in person. It replaces any recovery code they already have.</p>
            </div>
            <form className="recovery-code-form" onSubmit={handleIssueCustomerCode}>
              <label htmlFor="recovery-customer-phone">Customer mobile number</label>
              <div className="auth-phone-input">
                <span aria-hidden="true">+91</span>
                <input
                  id="recovery-customer-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="off"
                  value={customerPhone}
                  onChange={(event) => setCustomerPhone(event.target.value)}
                  placeholder="10-digit number"
                  pattern="[6-9][0-9]{9}"
                  maxLength={10}
                  required
                />
              </div>
              <label htmlFor="recovery-shopkeeper-password">Your current password</label>
              <input
                id="recovery-shopkeeper-password"
                type="password"
                autoComplete="current-password"
                maxLength={128}
                value={shopkeeperPassword}
                onChange={(event) => setShopkeeperPassword(event.target.value)}
                required
              />
              <button className="btn" type="submit" disabled={customerRecoveryBusy}>
                {customerRecoveryBusy ? 'Issuing code…' : 'Issue customer reset code'}
              </button>
            </form>
            {customerRecoveryCode && (
              <div className="recovery-code-result-inline" role="status">
                <strong>Give this one-time code directly to the verified customer.</strong>
                <code className="recovery-code-value">{customerRecoveryCode}</code>
                <button className="btn" type="button" onClick={() => copyCode(customerRecoveryCode, setCustomerRecoveryCopied)}>{customerRecoveryCopied ? 'Copied' : 'Copy reset code'}</button>
              </div>
            )}
            {customerRecoveryError && <p className="auth-error" role="alert">{customerRecoveryError}</p>}
          </section>
        )}

        <button className="auth-resend" type="button" onClick={onClose} disabled={dialogBusy}>Close</button>
      </section>
    </div>
  )
}
