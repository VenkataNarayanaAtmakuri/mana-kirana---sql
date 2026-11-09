import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { createLiveRecoveryCode, resetLivePasswordWithRecoveryCode } from '../lib/liveData.js'

function indianE164(value) {
  const digits = String(value || '').replace(/\D/g, '')
  return /^[6-9]\d{9}$/.test(digits) ? '+91' + digits : ''
}

export default function AuthDialog({ onClose, role = 'customer' }) {
  const [mode, setMode] = useState('signin')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [recoveryCode, setRecoveryCode] = useState('')
  const [generatedRecoveryCode, setGeneratedRecoveryCode] = useState('')
  const [recoveryCodeCopied, setRecoveryCodeCopied] = useState(false)
  const [fullName, setFullName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const isCustomerSignup = mode === 'customer-signup'
  const isPasswordReset = mode === 'forgot-password'
  const isRecoveryCodeDisplay = mode === 'recovery-code'

  function switchMode(nextMode) {
    setMode(nextMode)
    setError('')
    setNotice('')
    setPassword('')
    setConfirmPassword('')
    setRecoveryCode('')
    setGeneratedRecoveryCode('')
    setRecoveryCodeCopied(false)
  }

  async function copyRecoveryCode() {
    try {
      await navigator.clipboard.writeText(generatedRecoveryCode)
      setRecoveryCodeCopied(true)
    } catch {
      setRecoveryCodeCopied(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setNotice('')

    const e164 = indianE164(phone)
    if (!e164) {
      setError('Enter a valid 10-digit Indian mobile number.')
      return
    }

    if (isPasswordReset) {
      const normalizedCode = recoveryCode.toUpperCase().replace(/[\s-]/g, '')
      if (!/^[A-HJ-NP-Z2-9]{20}$/.test(normalizedCode)) {
        setError('Enter the 20-character recovery code you saved.')
        return
      }
      if (password.length < 8 || password.length > 128) {
        setError('Use a new password between 8 and 128 characters.')
        return
      }
      if (password !== confirmPassword) {
        setError('The new passwords do not match.')
        return
      }

      setBusy(true)
      try {
        await resetLivePasswordWithRecoveryCode(e164, recoveryCode, password)
        setPassword('')
        setConfirmPassword('')
        setRecoveryCode('')
        setMode('signin')
        setNotice('Password reset. Sign in with your new password.')
      } catch (resetError) {
        setError(resetError?.message || 'Could not reset the password. Check your phone number and recovery code.')
      } finally {
        setBusy(false)
      }
      return
    }

    if (password.length < 8 || password.length > 128) {
      setError('Use a password between 8 and 128 characters.')
      return
    }

    const cleanName = fullName.trim()
    if (isCustomerSignup && (cleanName.length < 2 || cleanName.length > 100)) {
      setError('Enter your name (2–100 characters).')
      return
    }

    setBusy(true)
    try {
      const result = isCustomerSignup
        ? await supabase.auth.signUp({
            phone: e164,
            password,
            options: { data: { full_name: cleanName } },
          })
        : await supabase.auth.signInWithPassword({ phone: e164, password, expectedRole: role })

      if (result?.error) {
        setError(result.error.message || 'Authentication failed. Please try again.')
        return
      }

      if (isCustomerSignup) {
        let nextCode = result?.data?.recoveryCode
        if (!nextCode) {
          try {
            const generated = await createLiveRecoveryCode(password)
            nextCode = generated.recoveryCode
          } catch {
            setNotice('Account created. While signed in, create a recovery code from Edit profile.')
            setMode('signin')
            return
          }
        }
        setGeneratedRecoveryCode(nextCode)
        setRecoveryCodeCopied(false)
        setPassword('')
        setMode('recovery-code')
        return
      }

      onClose()
    } catch (authError) {
      console.error('Authentication request failed:', authError)
      setError('Could not connect to the server. Check your connection and try again.')
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
      <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="auth-close" type="button" onClick={onClose} aria-label="Close authentication dialog" disabled={busy}>×</button>
        <p className="eyebrow">MANA KIRANA ACCOUNT</p>
        <h2 id="auth-title">
          {isRecoveryCodeDisplay
            ? 'Save your recovery code'
            : isPasswordReset
              ? 'Reset password'
              : isCustomerSignup
                ? 'Customer signup'
                : role === 'shopkeeper'
                  ? 'Shopkeeper sign in'
                  : 'Customer sign in'}
        </h2>
        <p className="muted">
          {isRecoveryCodeDisplay
            ? 'Keep this one-time code somewhere safe. It is the free way to reset your password if you forget it.'
            : isPasswordReset
              ? 'Enter your registered phone number, the recovery code you saved, and a new password. This free recovery option does not send an SMS or email.'
              : isCustomerSignup
                ? 'Create a customer account to browse groceries and place orders.'
                : role === 'shopkeeper'
                  ? 'Sign in with the shopkeeper account to manage stock, prices, and orders.'
                  : 'Sign in to browse groceries, place orders, and view your customer account.'}
        </p>

        {isRecoveryCodeDisplay ? (
          <div className="recovery-code-result">
            <p><strong>This code is shown only once.</strong> Anyone with it can reset this account’s password.</p>
            <code className="recovery-code-value" aria-label="Your recovery code">{generatedRecoveryCode}</code>
            <button className="btn" type="button" onClick={copyRecoveryCode}>{recoveryCodeCopied ? 'Copied' : 'Copy recovery code'}</button>
            <button className="btn primary" type="button" onClick={onClose}>I’ve saved my code</button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            {isCustomerSignup && (
              <>
                <label htmlFor="auth-name">Full name</label>
                <input
                  id="auth-name"
                  name="name"
                  type="text"
                  autoComplete="name"
                  minLength={2}
                  maxLength={100}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                />
              </>
            )}

            <label htmlFor="auth-phone">Mobile number</label>
            <div className="auth-phone-input">
              <span aria-hidden="true">+91</span>
              <input
                id="auth-phone"
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

            {isPasswordReset && (
              <>
                <label htmlFor="auth-recovery-code">Recovery code</label>
                <input
                  id="auth-recovery-code"
                  name="recoveryCode"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={24}
                  value={recoveryCode}
                  onChange={(event) => setRecoveryCode(event.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
                  required
                />
              </>
            )}

            <label htmlFor="auth-password">{isPasswordReset ? 'New password' : 'Password'}</label>
            <input
              id="auth-password"
              name={isPasswordReset ? 'newPassword' : 'password'}
              type="password"
              autoComplete={isCustomerSignup || isPasswordReset ? 'new-password' : 'current-password'}
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={isCustomerSignup || isPasswordReset ? 'At least 8 characters' : 'Your password'}
              required
            />

            {isPasswordReset && (
              <>
                <label htmlFor="auth-confirm-password">Confirm new password</label>
                <input
                  id="auth-confirm-password"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  maxLength={128}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </>
            )}

            <button className="btn primary" type="submit" disabled={busy}>
              {busy
                ? 'Please wait…'
                : isPasswordReset
                  ? 'Reset password'
                  : isCustomerSignup
                    ? 'Create customer account'
                    : role === 'shopkeeper'
                      ? 'Sign in as Shopkeeper'
                      : 'Sign in as Customer'}
            </button>
          </form>
        )}

        {mode === 'signin' && (
          <>
            <button className="auth-resend" type="button" disabled={busy} onClick={() => switchMode('forgot-password')}>Forgot password?</button>
            {role === 'customer' && <button className="auth-resend" type="button" disabled={busy} onClick={() => switchMode('customer-signup')}>New customer? Create a customer account</button>}
          </>
        )}
        {isCustomerSignup && <button className="auth-resend" type="button" disabled={busy} onClick={() => switchMode('signin')}>Already have an account? Sign in</button>}
        {isPasswordReset && <button className="auth-resend" type="button" disabled={busy} onClick={() => switchMode('signin')}>Back to sign in</button>}

        {notice && <p className="auth-notice" role="status">{notice}</p>}
        {error && <p className="auth-error" role="alert">{error}</p>}

        {isCustomerSignup && <p className="auth-disclaimer">Signup does not verify phone ownership. A phone number alone is not proof of identity. Save your private recovery code somewhere safe.</p>}
      </section>
    </div>
  )
}
