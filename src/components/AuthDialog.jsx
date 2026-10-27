import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

function indianE164(value) {
  const digits = String(value || '').replace(/\D/g, '')

  if (!/^[6-9]\d{9}$/.test(digits)) {
    return ''
  }

  return `+91${digits}`
}

export default function AuthDialog({ onClose, role = 'customer' }) {
  const [mode, setMode] = useState('signin')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const isCustomerSignup = mode === 'customer-signup'

  function switchMode(nextMode) {
    setMode(nextMode)
    setError('')
    setNotice('')
    setPassword('')
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

    if (password.length < 8 || password.length > 128) {
      setError('Use a password between 8 and 128 characters.')
      return
    }

    const cleanName = fullName.trim()

    if (
      isCustomerSignup &&
      (cleanName.length < 2 || cleanName.length > 100)
    ) {
      setError('Enter your name (2–100 characters).')
      return
    }

    setBusy(true)

    try {
      const result = isCustomerSignup
        ? await supabase.auth.signUp({
            phone: e164,
            password,
            options: {
              data: {
                full_name: cleanName,
              },
            },
          })
        : await supabase.auth.signInWithPassword({
            phone: e164,
            password,
            expectedRole: role,
          })

      if (result?.error) {
        setError(
          result.error.message ||
            'Authentication failed. Please try again.'
        )
        return
      }

      if (isCustomerSignup) {
        setNotice(
          'Customer account created successfully.'
        )
      }

      onClose()
    } catch (err) {
      console.error('Authentication request failed:', err)

      setError(
        'Could not connect to the server. Check your connection and try again.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="auth-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !busy
        ) {
          onClose()
        }
      }}
    >
      <section
        className="auth-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-title"
      >
        <button
          className="auth-close"
          type="button"
          onClick={onClose}
          aria-label="Close authentication dialog"
          disabled={busy}
        >
          ×
        </button>

        <p className="eyebrow">
          MANA KIRANA ACCOUNT
        </p>

        <h2 id="auth-title">
          {isCustomerSignup
            ? 'Customer signup'
            : role === 'shopkeeper'
              ? 'Shopkeeper sign in'
              : 'Customer sign in'}
        </h2>

        <p className="muted">
          {isCustomerSignup
            ? 'Create a customer account to browse groceries and place orders.'
            : role === 'shopkeeper'
              ? 'Sign in with the shopkeeper account to manage stock, prices, and orders.'
              : 'Sign in to browse groceries, place orders, and view your customer account.'}
          {' '}
          No OTP is requested by this app.
        </p>

        <form
          className="auth-form"
          onSubmit={handleSubmit}
        >
          {isCustomerSignup && (
            <>
              <label htmlFor="auth-name">
                Full name
              </label>

              <input
                id="auth-name"
                name="name"
                type="text"
                autoComplete="name"
                minLength={2}
                maxLength={100}
                value={fullName}
                onChange={(event) =>
                  setFullName(event.target.value)
                }
                required
              />
            </>
          )}

          <label htmlFor="auth-phone">
            Mobile number
          </label>

          <div className="auth-phone-input">
            <span aria-hidden="true">
              +91
            </span>

            <input
              id="auth-phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              value={phone}
              onChange={(event) =>
                setPhone(event.target.value)
              }
              placeholder="10-digit number"
              pattern="[6-9][0-9]{9}"
              maxLength={10}
              required
            />
          </div>

          <label htmlFor="auth-password">
            Password
          </label>

          <input
            id="auth-password"
            name="password"
            type="password"
            autoComplete={
              isCustomerSignup
                ? 'new-password'
                : 'current-password'
            }
            minLength={8}
            maxLength={128}
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            placeholder={
              isCustomerSignup
                ? 'At least 8 characters'
                : 'Your password'
            }
            required
          />

          <button
            className="btn primary"
            type="submit"
            disabled={busy}
          >
            {busy
              ? 'Please wait…'
              : isCustomerSignup
                ? 'Create customer account'
                : role === 'shopkeeper'
                ? 'Sign in as Shopkeeper'
                : 'Sign in as Customer'}
          </button>
        </form>

        {role === 'customer' && <button
          className="auth-resend"
          type="button"
          disabled={busy}
          onClick={() =>
            switchMode(
              isCustomerSignup
                ? 'signin'
                : 'customer-signup'
            )
          }
        >
          {isCustomerSignup
            ? 'Already have an account? Sign in'
            : 'New customer? Create a customer account'}
        </button>}

        {notice && (
          <p
            className="auth-notice"
            role="status"
          >
            {notice}
          </p>
        )}

        {error && (
          <p
            className="auth-error"
            role="alert"
          >
            {error}
          </p>
        )}

        <p className="auth-disclaimer">
          Signup uses password authentication only and
          does not verify phone ownership. Phone number
          alone should not be treated as proof of identity.
        </p>
      </section>
    </div>
  )
}