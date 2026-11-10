import express, { Router } from 'express'
import argon2 from 'argon2'
import { pool } from './db.js'
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

const router = Router()
class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}
let rateLimitRequestCount = 0
function createPersistentRateLimiter({ namespace, windowMs, limit, message, keyFor = (req) => req.ip }) {
  return async (req, res, next) => {
    try {
      const subject = String(keyFor(req) || req.ip || 'unknown')
      const rateKey = namespace + ':' + subject
      const { rows } = await pool.query(
        `INSERT INTO api_rate_limits(rate_key,hits,reset_at)
         VALUES($1,1,now() + $2::bigint * interval '1 millisecond')
         ON CONFLICT(rate_key) DO UPDATE SET
           hits=CASE WHEN api_rate_limits.reset_at<=now() THEN 1 ELSE api_rate_limits.hits+1 END,
           reset_at=CASE WHEN api_rate_limits.reset_at<=now()
             THEN now() + $2::bigint * interval '1 millisecond'
             ELSE api_rate_limits.reset_at END
         RETURNING hits,reset_at`,
        [rateKey, windowMs],
      )
      rateLimitRequestCount += 1
      if (rateLimitRequestCount % 200 === 0) {
        await pool.query('DELETE FROM api_rate_limits WHERE reset_at<=now()')
      }
      const hits = Number(rows[0].hits)
      const resetSeconds = Math.max(0, Math.ceil((new Date(rows[0].reset_at).getTime() - Date.now()) / 1000))
      res.set({
        'RateLimit-Policy': String(limit) + ';w=' + Math.ceil(windowMs / 1000),
        'RateLimit-Limit': String(limit),
        'RateLimit-Remaining': String(Math.max(0, limit - hits)),
        'RateLimit-Reset': String(resetSeconds),
      })
      if (hits > limit) return res.status(429).json({ error: message })
      return next()
    } catch (error) {
      return next(error)
    }
  }
}
const authLimiter = createPersistentRateLimiter({ namespace: 'auth-ip', windowMs: 15 * 60 * 1000, limit: 12, message: 'Too many authentication attempts. Try again later.' })
const loginAccountLimiter = createPersistentRateLimiter({ namespace: 'login-phone', windowMs: 15 * 60 * 1000, limit: 8, message: 'Too many authentication attempts for this number. Try again later.', keyFor: (req) => phoneE164(req.body?.phone) || req.ip })
const passwordChangeLimiter = createPersistentRateLimiter({ namespace: 'password-change', windowMs: 15 * 60 * 1000, limit: 5, message: 'Too many password change attempts. Try again later.' })
const recoveryCodeLimiter = createPersistentRateLimiter({ namespace: 'recovery-code', windowMs: 60 * 60 * 1000, limit: 5, message: 'Too many recovery code attempts. Try again later.' })
const customerRecoveryCodeLimiter = createPersistentRateLimiter({ namespace: 'customer-recovery-code', windowMs: 60 * 60 * 1000, limit: 10, message: 'Too many customer recovery code requests. Try again later.' })
const recoveryResetLimiter = createPersistentRateLimiter({ namespace: 'recovery-reset-ip', windowMs: 15 * 60 * 1000, limit: 8, message: 'Too many password reset attempts. Try again later.' })
const recoveryResetAccountLimiter = createPersistentRateLimiter({ namespace: 'recovery-reset-phone', windowMs: 15 * 60 * 1000, limit: 5, message: 'Too many password reset attempts for this number. Try again later.', keyFor: (req) => phoneE164(req.body?.phone) || req.ip })
const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function createRecoveryCode() {
  const compact = Array.from(randomBytes(20), (byte) => RECOVERY_CODE_ALPHABET[byte & 31]).join('')
  return compact.match(/.{4}/g).join('-')
}
function normalizeRecoveryCode(value) {
  return String(value || '').toUpperCase().replace(/[\s-]/g, '')
}
function hashRecoveryCode(value) {
  return createHash('sha256').update(normalizeRecoveryCode(value)).digest('hex')
}
function matchesRecoveryCode(storedHash, code) {
  if (!/^[a-f0-9]{64}$/i.test(String(storedHash || ''))) return false
  const stored = Buffer.from(storedHash, 'hex')
  const provided = Buffer.from(hashRecoveryCode(code), 'hex')
  return stored.length === provided.length && timingSafeEqual(stored, provided)
}
const RECOVERY_CODE_PATTERN = /^[A-HJ-NP-Z2-9]{20}$/
const accountLinkLimiter = createPersistentRateLimiter({ namespace: 'account-link', windowMs: 15 * 60 * 1000, limit: 5, message: 'Too many account-link attempts. Try again later.' })
const profileUpdateLimiter = createPersistentRateLimiter({ namespace: 'profile-update', windowMs: 15 * 60 * 1000, limit: 10, message: 'Too many profile update attempts. Try again later.' })
const pickupPinLimiter = createPersistentRateLimiter({ namespace: 'pickup-pin-ip', windowMs: 15 * 60 * 1000, limit: 20, message: 'Too many pickup PIN attempts. Try again later.' })
const pickupPinOrderLimiter = createPersistentRateLimiter({ namespace: 'pickup-pin-order', windowMs: 60 * 60 * 1000, limit: 8, message: 'Too many pickup PIN attempts for this order. Try again later.', keyFor: (req) => (req.session.user?.id || 'unknown') + ':' + req.params.id })
const offerValidationLimiter = createPersistentRateLimiter({ namespace: 'offer-validation', windowMs: 15 * 60 * 1000, limit: 30, message: 'Too many offer checks. Try again later.' })
const orderIpLimiter = createPersistentRateLimiter({ namespace: 'order-ip', windowMs: 60 * 60 * 1000, limit: 30, message: 'Too many orders from this network. Try again later.' })
const orderCustomerLimiter = createPersistentRateLimiter({ namespace: 'order-customer', windowMs: 60 * 60 * 1000, limit: 10, message: 'Too many orders from this account. Try again later.', keyFor: (req) => req.session.user?.id || req.ip })
const phoneE164 = (input) => {
  const digits = String(input || '').replace(/\D/g, '')
  if (digits.length === 10 && /^[6-9]/.test(digits)) return '+91' + digits
  if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) return '+' + digits
  if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.slice(1))) return '+91' + digits.slice(1)
  return null
}
const publicUser = (row) => ({ id: row.id, phone: row.phone, full_name: row.full_name, role: row.role, phone_verified: row.phone_verified })
const requireAuth = (req, res, next) => req.session.user ? next() : res.status(401).json({ error: 'Please sign in to continue.' })
const requireShopkeeper = (req, res, next) => req.session.user?.role === 'shopkeeper' ? next() : res.status(403).json({ error: 'Shopkeeper access required.' })
const regenerateSession = (req) => new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()))
const saveSession = (req) => new Promise((resolve, reject) => req.session.save((error) => error ? reject(error) : resolve()))

const WEEKDAYS = ['mon','tue','wed','thu','fri','sat','sun']
const DEFAULT_STORE_HOURS = Object.fromEntries(WEEKDAYS.map((day) => [day, { open: '08:00', close: '21:00', closed: false }]))
const validTime = (value) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
function normalizeStoreHours(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const result = {}
  for (const day of WEEKDAYS) {
    const row = value[day]
    if (!row || typeof row.closed !== 'boolean' || !validTime(row.open) || !validTime(row.close) || row.close <= row.open) return null
    result[day] = { open: row.open, close: row.close, closed: row.closed }
  }
  return result
}
function normalizeDateOnly(value) {
  if (value == null || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined
  const parsed = new Date(value + 'T00:00:00.000Z')
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? undefined : value
}
const DEFAULT_STORE_CONTACT = {
  store_name: 'Venkata Kusuma Haranth General Stores',
  contact_phone: '+917032946299',
  contact_address: '',
  maps_url: 'https://maps.app.goo.gl/AaYVR9dbwqkwm7H29',
}
function normalizeStoreMapUrl(value) {
  try {
    const url = new URL(String(value || '').trim())
    const host = url.hostname.toLowerCase()
    const approvedHost = host === 'maps.app.goo.gl' || host === 'maps.google.com'
      || host === 'google.com' || host === 'www.google.com'
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !approvedHost) return null
    if ((host === 'google.com' || host === 'www.google.com') && !url.pathname.startsWith('/maps')) return null
    return url.toString()
  } catch { return null }
}
async function readStoreStatus(queryable = pool, { includeContact = true } = {}) {
  const { rows } = await queryable.query('SELECT hours,status_override,closed_message FROM store_settings WHERE id=1')
  const setting = rows[0] || { hours: DEFAULT_STORE_HOURS, status_override: 'auto', closed_message: 'The shop is closed right now.' }
  let contact = DEFAULT_STORE_CONTACT
  if (includeContact) {
    try {
      const result = await queryable.query('SELECT store_name,contact_phone,contact_address,maps_url FROM store_settings WHERE id=1')
      contact = { ...DEFAULT_STORE_CONTACT, ...(result.rows[0] || {}) }
    } catch (error) {
      if (error.code !== '42703') throw error
    }
  }
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
  const value = (type) => parts.find((part) => part.type === type)?.value || ''
  const day = ({ Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun' })[value('weekday')] || 'mon'
  const today = setting.hours?.[day] || DEFAULT_STORE_HOURS[day]
  const now = value('hour') + ':' + value('minute')
  const inHours = !today.closed && now >= today.open && now < today.close
  const acceptingOrders = setting.status_override === 'open' || (setting.status_override === 'auto' && inHours)
  const message = setting.status_override === 'closed'
    ? setting.closed_message || 'The shop is closed today.'
    : acceptingOrders
      ? setting.status_override === 'open' ? 'Open now · temporary override' : 'Open now · closes at ' + today.close + ' IST'
      : today.closed
        ? 'Closed today · check the opening hours'
        : 'Closed now · opens at ' + today.open + ' IST'
  return {
    acceptingOrders, message, hours: setting.hours || DEFAULT_STORE_HOURS,
    statusOverride: setting.status_override || 'auto', closedMessage: setting.closed_message || '',
    storeName: contact.store_name, contactPhone: contact.contact_phone,
    contactAddress: contact.contact_address, mapsUrl: contact.maps_url,
  }
}
const PRODUCT_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const PRODUCT_IMAGE_MAX_BYTES = 2 * 1024 * 1024
const PRODUCT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function hasValidImageSignature(contentType, data) {
  if (!Buffer.isBuffer(data)) return false
  if (contentType === 'image/jpeg') return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
  if (contentType === 'image/png') return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  if (contentType === 'image/webp') return data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP'
  return false
}
async function readCatalogProducts(expiryFilter) {
  const select = 'SELECT p.*, c.name AS category, photo.updated_at AS image_updated_at FROM products p JOIN categories c ON c.id=p.category_id LEFT JOIN product_images photo ON photo.product_id=p.id WHERE p.active=true AND c.active=true' + expiryFilter + ' ORDER BY p.name'
  try {
    return await pool.query(select)
  } catch (error) {
    if (error.code !== '42P01') throw error
    return pool.query('SELECT p.*, c.name AS category, NULL::timestamptz AS image_updated_at FROM products p JOIN categories c ON c.id=p.category_id WHERE p.active=true AND c.active=true' + expiryFilter + ' ORDER BY p.name')
  }
}
function roundMoney(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100 }
async function findActiveOffer(queryable, code) {
  const { rows } = await queryable.query(
    'SELECT id,title,code,discount_percent,minimum_order FROM offers WHERE code=$1 AND active=true AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now()) FOR SHARE',
    [code],
  )
  return rows[0] || null
}

router.get('/health', async (_req, res) => {
  await pool.query('SELECT 1')
  res.json({ ok: true, service: 'mana-kirana-api' })
})
router.post('/auth/register', authLimiter, async (req, res) => {
  const phone = phoneE164(req.body.phone)
  const fullName = String(req.body.fullName || '').trim()
  const password = String(req.body.password || '')
  if (!phone) return res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number.' })
  if (fullName.length < 2 || fullName.length > 100) return res.status(400).json({ error: 'Enter a name between 2 and 100 characters.' })
  if (password.length < 8 || password.length > 128) return res.status(400).json({ error: 'Password must be between 8 and 128 characters.' })
  const hash = await argon2.hash(password, { type: argon2.argon2id })
  const recoveryCode = createRecoveryCode()
  try {
    const { rows } = await pool.query('INSERT INTO profiles(phone,full_name,password_hash,role,phone_verified,recovery_code_hash) VALUES($1,$2,$3,\'customer\',false,$4) RETURNING id,phone,full_name,role,phone_verified', [phone, fullName, hash, hashRecoveryCode(recoveryCode)])
    delete req.session.linkedAccount
    req.session.user = publicUser(rows[0])
    res.status(201).json({ user: req.session.user, recoveryCode })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An account with this phone number already exists. Please sign in.' })
    throw error
  }
})
router.post('/auth/login', authLimiter, loginAccountLimiter, async (req, res) => {
  const phone = phoneE164(req.body.phone)
  const password = String(req.body.password || '')
  const expectedRole = String(req.body.expectedRole || 'customer')
  if (!['customer', 'shopkeeper'].includes(expectedRole)) return res.status(400).json({ error: 'Choose a valid account type.' })
  if (!phone || !password) return res.status(400).json({ error: 'Enter your valid phone number and password.' })
  const { rows } = await pool.query('SELECT id,phone,full_name,role,phone_verified,password_hash FROM profiles WHERE phone=$1', [phone])
  const valid = rows[0] && await argon2.verify(rows[0].password_hash, password).catch(() => false)
  if (!valid) return res.status(401).json({ error: 'Phone number or password is incorrect.' })
  if (rows[0].role !== expectedRole) {
    return res.status(403).json({ error: expectedRole === 'shopkeeper'
      ? 'This account is not registered as a shopkeeper. Use Customer Sign In or contact the project owner for shopkeeper access.'
      : 'This is a shopkeeper account. Please use Shopkeeper Sign In.' })
  }
  delete req.session.linkedAccount
  req.session.user = publicUser(rows[0])
  res.json({ user: req.session.user, linkedAccount: null })
})
router.post('/auth/recovery-code', recoveryCodeLimiter, requireAuth, async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '')
  if (!currentPassword) return res.status(400).json({ error: 'Enter your current password to create a recovery code.' })
  const { rows } = await pool.query('SELECT password_hash FROM profiles WHERE id=$1', [req.session.user.id])
  const valid = rows[0] && await argon2.verify(rows[0].password_hash, currentPassword).catch(() => false)
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' })

  const recoveryCode = createRecoveryCode()
  await pool.query('UPDATE profiles SET recovery_code_hash=$1 WHERE id=$2', [hashRecoveryCode(recoveryCode), req.session.user.id])
  res.json({ recoveryCode })
})
router.post('/auth/recovery-code/customer', customerRecoveryCodeLimiter, requireAuth, requireShopkeeper, async (req, res) => {
  const phone = phoneE164(req.body.phone)
  const currentPassword = String(req.body.currentPassword || '')
  if (!phone) return res.status(400).json({ error: 'Enter a valid 10-digit Indian customer mobile number.' })
  if (phone === req.session.user.phone) return res.status(400).json({ error: 'Use your own recovery code section for this account.' })
  if (!currentPassword) return res.status(400).json({ error: 'Enter your current password to issue a reset code.' })

  const { rows: shopkeeperRows } = await pool.query('SELECT password_hash FROM profiles WHERE id=$1', [req.session.user.id])
  const valid = shopkeeperRows[0] && await argon2.verify(shopkeeperRows[0].password_hash, currentPassword).catch(() => false)
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' })

  const { rows: customerRows } = await pool.query("SELECT id FROM profiles WHERE phone=$1 AND role='customer'", [phone])
  if (!customerRows[0]) return res.status(404).json({ error: 'No customer account was found for that number.' })
  const recoveryCode = createRecoveryCode()
  await pool.query('UPDATE profiles SET recovery_code_hash=$1 WHERE id=$2', [hashRecoveryCode(recoveryCode), customerRows[0].id])
  res.json({ recoveryCode })
})
router.post('/auth/reset-password', recoveryResetLimiter, recoveryResetAccountLimiter, async (req, res) => {
  const phone = phoneE164(req.body.phone)
  const recoveryCode = normalizeRecoveryCode(req.body.recoveryCode)
  const newPassword = String(req.body.newPassword || '')
  if (!phone || !RECOVERY_CODE_PATTERN.test(recoveryCode)) return res.status(400).json({ error: 'Phone number or recovery code is incorrect.' })
  if (newPassword.length < 8 || newPassword.length > 128) return res.status(400).json({ error: 'New password must be between 8 and 128 characters.' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query('SELECT id,recovery_code_hash FROM profiles WHERE phone=$1 FOR UPDATE', [phone])
    const profile = rows[0]
    if (!profile || !matchesRecoveryCode(profile.recovery_code_hash, recoveryCode)) {
      await client.query('ROLLBACK')
      return res.status(400).json({ error: 'Phone number or recovery code is incorrect.' })
    }

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id })
    await client.query('UPDATE profiles SET password_hash=$1,recovery_code_hash=NULL WHERE id=$2', [passwordHash, profile.id])
    await client.query("DELETE FROM user_sessions WHERE sess->'user'->>'id'=$1 OR sess->'linkedAccount'->>'id'=$1", [profile.id])
    await client.query('COMMIT')
    res.json({ ok: true })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
})
router.post('/auth/link-account', accountLinkLimiter, requireAuth, async (req, res) => {
  const activeUser = req.session.user
  const phone = phoneE164(req.body.phone)
  const password = String(req.body.password || '')
  const expectedRole = String(req.body.expectedRole || '')
  if (!['customer', 'shopkeeper'].includes(expectedRole)) return res.status(400).json({ error: 'Choose a valid account type.' })
  if (!phone || !password) return res.status(400).json({ error: 'Enter the other account’s valid mobile number and password.' })
  if (req.session.linkedAccount) return res.status(409).json({ error: 'Another account is already linked. Switch to it or sign out to connect a different account.' })

  const { rows } = await pool.query('SELECT id,phone,full_name,role,phone_verified,password_hash FROM profiles WHERE phone=$1', [phone])
  const target = rows[0]
  const valid = target && await argon2.verify(target.password_hash, password).catch(() => false)
  if (!valid) return res.status(401).json({ error: 'Phone number or password is incorrect.' })
  if (target.id === activeUser.id) return res.status(400).json({ error: 'Enter a different account to link.' })
  if (target.role !== expectedRole) return res.status(403).json({ error: 'These credentials do not match the selected account type.' })
  if (!['customer', 'shopkeeper'].includes(activeUser.role) || activeUser.role === target.role) {
    return res.status(400).json({ error: 'Link one customer account and one shopkeeper account.' })
  }
  const { rows: activeRows } = await pool.query('SELECT id,phone,full_name,role,phone_verified FROM profiles WHERE id=$1', [activeUser.id])
  const activeProfile = activeRows[0]
  if (!activeProfile || activeProfile.role !== activeUser.role) return res.status(401).json({ error: 'Your current account changed. Sign in again to continue.' })

  await regenerateSession(req)
  req.session.user = publicUser(target)
  req.session.linkedAccount = publicUser(activeProfile)
  await saveSession(req)
  res.json({ user: req.session.user, linkedAccount: req.session.linkedAccount })
})
router.post('/auth/switch-account', requireAuth, async (req, res) => {
  const activeUser = req.session.user
  const linkedAccount = req.session.linkedAccount
  if (!linkedAccount) return res.status(409).json({ error: 'Link your other account before switching.' })

  const { rows } = await pool.query('SELECT id,phone,full_name,role,phone_verified FROM profiles WHERE id = ANY($1::uuid[])', [[activeUser.id, linkedAccount.id]])
  const profiles = new Map(rows.map((profile) => [profile.id, profile]))
  const currentProfile = profiles.get(activeUser.id)
  const targetProfile = profiles.get(linkedAccount.id)
  if (!currentProfile || !targetProfile || currentProfile.role !== activeUser.role || targetProfile.role !== linkedAccount.role || currentProfile.role === targetProfile.role) {
    delete req.session.linkedAccount
    await saveSession(req)
    return res.status(403).json({ error: 'The linked account permissions changed. Sign in again to connect the accounts.' })
  }

  req.session.user = publicUser(targetProfile)
  req.session.linkedAccount = publicUser(currentProfile)
  await saveSession(req)
  res.json({ user: req.session.user, linkedAccount: req.session.linkedAccount })
})
router.post('/auth/change-password', passwordChangeLimiter, requireAuth, async (req, res) => {
  const currentPassword = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : ''
  const newPassword = typeof req.body.newPassword === 'string' ? req.body.newPassword : ''
  if (!currentPassword) return res.status(400).json({ error: 'Enter your current password.' })
  if (newPassword.length < 8 || newPassword.length > 128) return res.status(400).json({ error: 'New password must be between 8 and 128 characters.' })

  const { rows } = await pool.query('SELECT password_hash FROM profiles WHERE id=$1', [req.session.user.id])
  if (!rows[0]) return res.status(401).json({ error: 'Please sign in again to continue.' })
  const currentMatches = await argon2.verify(rows[0].password_hash, currentPassword).catch(() => false)
  if (!currentMatches) return res.status(401).json({ error: 'Current password is incorrect.' })
  const reusesCurrentPassword = await argon2.verify(rows[0].password_hash, newPassword).catch(() => false)
  if (reusesCurrentPassword) return res.status(400).json({ error: 'Choose a new password different from your current one.' })

  const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id })
  const signedInUser = req.session.user
  const linkedAccount = req.session.linkedAccount || null
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('UPDATE profiles SET password_hash=$1 WHERE id=$2', [passwordHash, signedInUser.id])
    await client.query(
      "DELETE FROM user_sessions WHERE sess->'user'->>'id'=$1 OR sess->'linkedAccount'->>'id'=$1",
      [signedInUser.id],
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
  await regenerateSession(req)
  req.session.user = signedInUser
  if (linkedAccount) req.session.linkedAccount = linkedAccount
  await saveSession(req)
  res.json({ ok: true })
})
router.get('/auth/me', (req, res) => res.json({ user: req.session.user || null, linkedAccount: req.session.user ? req.session.linkedAccount || null : null }))
router.post('/auth/logout', (req, res) => req.session.destroy((error) => {
  if (error) return res.status(500).json({ error: 'Could not sign out.' })
  res.clearCookie('mk.sid', { path: '/' })
  res.json({ ok: true })
}))
router.get('/profile/:id', requireAuth, async (req, res) => {
  if (req.params.id !== req.session.user.id && req.session.user.role !== 'shopkeeper') return res.status(403).json({ error: 'Not allowed.' })
  const { rows } = await pool.query('SELECT id,role,full_name,phone FROM profiles WHERE id=$1', [req.params.id])
  if (!rows[0]) return res.status(404).json({ error: 'Profile not found.' })
  res.json({ id: rows[0].id, role: rows[0].role, full_name: rows[0].full_name, phone: rows[0].phone })
})
router.patch('/profile/:id', profileUpdateLimiter, requireAuth, async (req, res) => {
  if (req.params.id !== req.session.user.id) return res.status(403).json({ error: 'You can only edit your own profile.' })
  const fullName = String(req.body.fullName || '').trim()
  const phone = phoneE164(req.body.phone)
  if (fullName.length < 2 || fullName.length > 100) return res.status(400).json({ error: 'Enter a name between 2 and 100 characters.' })
  if (!phone) return res.status(400).json({ error: 'Enter a valid 10-digit Indian mobile number.' })

  if (phone !== req.session.user.phone) {
    const currentPassword = String(req.body.currentPassword || '')
    if (!currentPassword) return res.status(400).json({ error: 'Enter your current password to change your mobile number.' })
    const { rows: accountRows } = await pool.query('SELECT password_hash FROM profiles WHERE id=$1', [req.session.user.id])
    const valid = accountRows[0] && await argon2.verify(accountRows[0].password_hash, currentPassword).catch(() => false)
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' })
  }

  try {
    const { rows } = await pool.query(
      'UPDATE profiles SET full_name=$1,phone=$2,phone_verified=CASE WHEN phone<>$2 THEN false ELSE phone_verified END WHERE id=$3 RETURNING id,phone,full_name,role,phone_verified',
      [fullName, phone, req.session.user.id],
    )
    if (!rows[0]) return res.status(404).json({ error: 'Profile not found.' })
    req.session.user = publicUser(rows[0])
    res.json(publicUser(rows[0]))
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'That mobile number is already linked to another account.' })
    throw error
  }
})
router.get('/catalog', async (req, res) => {
  const shopkeeperView = req.session.user?.role === 'shopkeeper'
  const expiryFilter = shopkeeperView ? '' : " AND (p.expires_on IS NULL OR p.expires_on >= (now() AT TIME ZONE 'Asia/Kolkata')::date)"
  const offerFilter = shopkeeperView ? '' : 'WHERE active=true AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now())'
  const [categories, products, offers, storeStatus] = await Promise.all([
    pool.query('SELECT id,name FROM categories WHERE active=true ORDER BY name'),
    readCatalogProducts(expiryFilter),
    pool.query('SELECT id,title,code,discount_percent,minimum_order,active,starts_at,ends_at FROM offers ' + offerFilter + ' ORDER BY created_at DESC'),
    readStoreStatus(),
  ])
  const publicProducts = shopkeeperView
    ? products.rows
    : products.rows.map(({ stock, ...product }) => ({ ...product, in_stock: Number(stock) > 0 }))
  res.json({ categories: categories.rows, products: publicProducts, offers: offers.rows, storeStatus })
})
router.get('/products/:id/image', async (req, res) => {
  if (!PRODUCT_ID_PATTERN.test(req.params.id)) return res.status(404).json({ error: 'Product image not found.' })
  try {
    const { rows } = await pool.query(
      'SELECT photo.content_type,photo.image_data FROM product_images photo JOIN products p ON p.id=photo.product_id WHERE p.id=$1 AND p.active=true',
      [req.params.id],
    )
    if (!rows[0]) return res.status(404).json({ error: 'Product image not found.' })
    const image = rows[0]
    const etag = '"' + createHash('sha256').update(image.image_data).digest('hex') + '"'
    if (req.headers['if-none-match'] === etag) return res.status(304).end()
    res.set({
      'Content-Type': image.content_type,
      'Content-Disposition': 'inline',
      'Cache-Control': 'public, max-age=300',
      'ETag': etag,
      'X-Content-Type-Options': 'nosniff',
    })
    return res.send(image.image_data)
  } catch (error) {
    if (error.code === '42P01') return res.status(503).json({ error: 'Apply server/sql/migrations/20261109_product_images.sql before using catalogue image uploads.' })
    throw error
  }
})
router.patch('/store-settings', requireAuth, requireShopkeeper, async (req, res) => {
  const hours = normalizeStoreHours(req.body.hours)
  const statusOverride = String(req.body.statusOverride || '')
  const closedMessage = String(req.body.closedMessage || '').trim()
  if (!hours) return res.status(400).json({ error: 'Set valid opening and closing times for all seven days.' })
  if (!['auto','open','closed'].includes(statusOverride)) return res.status(400).json({ error: 'Choose automatic hours, temporarily open, or closed.' })
  if (closedMessage.length > 180) return res.status(400).json({ error: 'The closure message must be 180 characters or fewer.' })
  await pool.query(
    'INSERT INTO store_settings(id,hours,status_override,closed_message) VALUES(1,$1::jsonb,$2,$3) ON CONFLICT(id) DO UPDATE SET hours=EXCLUDED.hours,status_override=EXCLUDED.status_override,closed_message=EXCLUDED.closed_message,updated_at=now()',
    [JSON.stringify(hours), statusOverride, closedMessage || 'The shop is closed right now.'],
  )
  res.json(await readStoreStatus())
})
router.patch('/store-contact', requireAuth, requireShopkeeper, async (req, res) => {
  const storeName = String(req.body.storeName || '').trim()
  const contactPhone = phoneE164(req.body.contactPhone)
  const contactAddress = String(req.body.contactAddress || '').trim()
  const mapsUrl = normalizeStoreMapUrl(req.body.mapsUrl)
  if (!storeName || storeName.length > 120) return res.status(400).json({ error: 'Enter a shop name of 1 to 120 characters.' })
  if (!contactPhone) return res.status(400).json({ error: 'Enter a valid Indian mobile number.' })
  if (contactAddress.length > 240) return res.status(400).json({ error: 'The address must be 240 characters or fewer.' })
  if (!mapsUrl || mapsUrl.length > 500) return res.status(400).json({ error: 'Use a Google Maps link from maps.app.goo.gl or google.com/maps.' })
  try {
    await pool.query(
      'INSERT INTO store_settings(id,store_name,contact_phone,contact_address,maps_url) VALUES(1,$1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET store_name=EXCLUDED.store_name,contact_phone=EXCLUDED.contact_phone,contact_address=EXCLUDED.contact_address,maps_url=EXCLUDED.maps_url,updated_at=now()',
      [storeName, contactPhone, contactAddress, mapsUrl],
    )
    res.json(await readStoreStatus())
  } catch (error) {
    if (error.code === '42703') return res.status(503).json({ error: 'Apply server/sql/migrations/20261109_store_contact_details.sql to the database before saving shop contact details.' })
    throw error
  }
})
router.post('/offers/validate', offerValidationLimiter, async (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase()
  const subtotal = Number(req.body.subtotal)
  if (!/^[A-Z0-9-]{3,24}$/.test(code)) return res.status(400).json({ error: 'Enter a valid offer code.' })
  if (!Number.isFinite(subtotal) || subtotal < 100) return res.status(400).json({ error: 'Add priced items worth at least ₹100 before applying an offer.' })
  const offer = await findActiveOffer(pool, code)
  if (!offer) return res.status(404).json({ error: 'This offer code is invalid, expired, or inactive.' })
  if (subtotal < Number(offer.minimum_order)) return res.status(400).json({ error: 'This offer requires a confirmed subtotal of at least ₹' + Number(offer.minimum_order).toFixed(0) + '.' })
  const discountAmount = roundMoney(subtotal * Number(offer.discount_percent) / 100)
  if (roundMoney(subtotal - discountAmount) < 100) return res.status(400).json({ error: 'The discount would bring the order below the ₹100 minimum. Add more items to use this code.' })
  res.json({ id: offer.id, title: offer.title, code: offer.code, discountPercent: Number(offer.discount_percent), minimumOrder: Number(offer.minimum_order), discountAmount, discountedTotal: roundMoney(subtotal - discountAmount) })
})
router.post('/offers', requireAuth, requireShopkeeper, async (req, res) => {
  const title = String(req.body.title || '').trim()
  const code = String(req.body.code || '').trim().toUpperCase()
  const discountPercent = Number(req.body.discountPercent)
  const minimumOrder = Number(req.body.minimumOrder)
  const endsAt = req.body.endsAt ? new Date(req.body.endsAt) : null
  if (title.length < 2 || title.length > 100) return res.status(400).json({ error: 'Offer title must be between 2 and 100 characters.' })
  if (!/^[A-Z0-9-]{3,24}$/.test(code)) return res.status(400).json({ error: 'Use 3–24 letters, numbers, or hyphens for the offer code.' })
  if (!Number.isFinite(discountPercent) || discountPercent < 1 || discountPercent > 80) return res.status(400).json({ error: 'Discount must be between 1% and 80%.' })
  if (!Number.isFinite(minimumOrder) || minimumOrder <= 200 || minimumOrder > 100000) return res.status(400).json({ error: 'Minimum order must be greater than ₹200.' })
  if (req.body.endsAt && (Number.isNaN(endsAt.getTime()) || endsAt <= new Date())) return res.status(400).json({ error: 'Offer expiry must be a future date and time.' })
  const { rows } = await pool.query(
    'INSERT INTO offers(title,code,discount_percent,minimum_order,ends_at) VALUES($1,$2,$3,$4,$5) RETURNING id,title,code,discount_percent,minimum_order,active,starts_at,ends_at',
    [title, code, discountPercent, minimumOrder, endsAt?.toISOString() || null],
  )
  res.status(201).json(rows[0])
})
router.patch('/offers/:id', requireAuth, requireShopkeeper, async (req, res) => {
  if (typeof req.body.active !== 'boolean') return res.status(400).json({ error: 'Choose whether this offer is active.' })
  const { rows } = await pool.query('UPDATE offers SET active=$1 WHERE id=$2 RETURNING id,title,code,discount_percent,minimum_order,active,starts_at,ends_at', [req.body.active, req.params.id])
  if (!rows[0]) return res.status(404).json({ error: 'Offer not found.' })
  res.json(rows[0])
})
router.delete('/offers/:id', requireAuth, requireShopkeeper, async (req, res) => {
  const { rows } = await pool.query('DELETE FROM offers WHERE id=$1 RETURNING id,code', [req.params.id])
  if (!rows[0]) return res.status(404).json({ error: 'Offer not found.' })
  res.json({ id: rows[0].id, code: rows[0].code, deleted: true })
})
router.post('/categories', requireAuth, requireShopkeeper, async (req, res) => {
  const name = String(req.body.name || '').trim()
  if (!name || name.length > 60) return res.status(400).json({ error: 'Category name is required (max 60 characters).' })
  const { rows } = await pool.query('INSERT INTO categories(name) VALUES($1) RETURNING id,name', [name])
  res.status(201).json(rows[0])
})
router.delete('/categories/:id', requireAuth, requireShopkeeper, async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const cat = await client.query('SELECT id,name FROM categories WHERE id=$1 AND active=true FOR UPDATE', [req.params.id])
    if (!cat.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Category not found.' }) }
    const moved = await client.query('SELECT count(*)::int AS n FROM products WHERE category_id=$1 AND active=true', [req.params.id])
    let fallback = null
    if (moved.rows[0].n) {
      fallback = cat.rows[0].name.toLowerCase() === 'other' ? 'Uncategorized' : 'Other'
      let result = await client.query('SELECT id FROM categories WHERE lower(name)=lower($1) AND active=true LIMIT 1', [fallback])
      if (!result.rows[0]) result = await client.query('INSERT INTO categories(name) VALUES($1) RETURNING id', [fallback])
      await client.query('UPDATE products SET category_id=$1 WHERE category_id=$2 AND active=true', [result.rows[0].id, req.params.id])
    }
    await client.query('UPDATE categories SET active=false WHERE id=$1', [req.params.id])
    await client.query('COMMIT')
    res.json({ name: cat.rows[0].name, moved_products: moved.rows[0].n, fallback })
  } catch (error) { await client.query('ROLLBACK'); throw error } finally { client.release() }
})
router.post('/products', requireAuth, requireShopkeeper, async (req, res) => {
  const { name, local = '', categoryId, unit = 'piece', price, stock = 0 } = req.body
  const expiresOn = normalizeDateOnly(req.body.expiresOn)
  if (!String(name || '').trim() || !categoryId || !Number.isFinite(Number(price)) || Number(price) <= 0 || !Number.isFinite(Number(stock)) || Number(stock) < 0 || expiresOn === undefined) return res.status(400).json({ error: 'Valid product name, category, price, stock, and expiry date are required.' })
  const category = String(req.body.category || '').toLowerCase()
  const emoji = category.includes('dairy') ? '🥛' : category.includes('fresh') ? '🥬' : category.includes('snack') ? '🥨' : '🛍️'
  const { rows } = await pool.query('INSERT INTO products(name,local,category_id,unit,price,stock,step,emoji,tint,note,expires_on) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id', [String(name).trim(), String(local), categoryId, unit, Number(price), Number(stock), unit === 'kg' ? 0.01 : 1, emoji, 'new', 'Added by the shopkeeper', expiresOn])
  res.status(201).json(rows[0])
})
router.put('/products/:id/image', requireAuth, requireShopkeeper, express.raw({ type: PRODUCT_IMAGE_MIME_TYPES, limit: '2mb' }), async (req, res) => {
  const contentType = String(req.headers['content-type'] || '').split(';')[0].toLowerCase()
  const imageData = req.body
  if (!PRODUCT_ID_PATTERN.test(req.params.id)) return res.status(404).json({ error: 'Product not found.' })
  if (!PRODUCT_IMAGE_MIME_TYPES.includes(contentType) || !hasValidImageSignature(contentType, imageData)) {
    return res.status(400).json({ error: 'Upload a valid JPG, PNG, or WebP image.' })
  }
  if (imageData.length > PRODUCT_IMAGE_MAX_BYTES) return res.status(413).json({ error: 'Product images must be 2 MB or smaller after resizing.' })
  const product = await pool.query('SELECT id FROM products WHERE id=$1 AND active=true', [req.params.id])
  if (!product.rows[0]) return res.status(404).json({ error: 'Product not found.' })
  try {
    const { rows } = await pool.query(
      'INSERT INTO product_images(product_id,content_type,image_data) VALUES($1,$2,$3) ON CONFLICT(product_id) DO UPDATE SET content_type=EXCLUDED.content_type,image_data=EXCLUDED.image_data,updated_at=now() RETURNING updated_at',
      [req.params.id, contentType, imageData],
    )
    res.json({ imageUpdatedAt: rows[0].updated_at })
  } catch (error) {
    if (error.code === '42P01') return res.status(503).json({ error: 'Apply server/sql/migrations/20261109_product_images.sql before using catalogue image uploads.' })
    throw error
  }
})
router.patch('/products/:id', requireAuth, requireShopkeeper, async (req, res) => {
  const price = Number(req.body.price), stock = Number(req.body.stock)
  const hasExpiry = Object.prototype.hasOwnProperty.call(req.body, 'expiresOn')
  const expiresOn = hasExpiry ? normalizeDateOnly(req.body.expiresOn) : null
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(stock) || stock < 0 || (hasExpiry && expiresOn === undefined)) return res.status(400).json({ error: 'Price, stock, and expiry date are invalid.' })
  const { rows } = await pool.query('UPDATE products SET price=$1,stock=$2,expires_on=CASE WHEN $3::boolean THEN $4::date ELSE expires_on END,updated_at=now() WHERE id=$5 AND active=true RETURNING id', [price, stock, hasExpiry, expiresOn, req.params.id])
  if (!rows[0]) return res.status(404).json({ error: 'Product not found.' })
  res.json(rows[0])
})
router.delete('/products/:id/image', requireAuth, requireShopkeeper, async (req, res) => {
  if (!PRODUCT_ID_PATTERN.test(req.params.id)) return res.status(404).json({ error: 'Product image not found.' })
  try {
    await pool.query('DELETE FROM product_images WHERE product_id=$1', [req.params.id])
    res.json({ removed: true })
  } catch (error) {
    if (error.code === '42P01') return res.status(503).json({ error: 'Apply server/sql/migrations/20261109_product_images.sql before using catalogue image uploads.' })
    throw error
  }
})
router.delete('/products/:id', requireAuth, requireShopkeeper, async (req, res) => {
  const { rows } = await pool.query('UPDATE products SET active=false,updated_at=now() WHERE id=$1 AND active=true RETURNING id', [req.params.id])
  if (!rows[0]) return res.status(404).json({ error: 'Product not found.' })
  res.json(rows[0])
})
router.get('/orders', requireAuth, async (req, res) => {
  const role = req.session.user.role
  const requestedScope = String(req.query.scope || '')
  const scope = requestedScope || (role === 'shopkeeper' ? 'shopkeeper' : 'customer')
  if (!['customer', 'shopkeeper'].includes(scope)) return res.status(400).json({ error: 'Choose a valid order history.' })
  if (scope === 'shopkeeper' && role !== 'shopkeeper') return res.status(403).json({ error: 'Shopkeeper access required.' })

  const params = []
  const conditions = []
  if (scope === 'customer') {
    params.push(req.session.user.id)
    conditions.push('o.customer_id=$' + params.length)
  }
  // Keep each account's two history views independent, including a shopkeeper's own purchases.
  const hiddenMarker = '__order_hidden__:' + scope + ':' + req.session.user.id
  params.push(hiddenMarker)
  conditions.push('NOT EXISTS (SELECT 1 FROM customer_messages hidden WHERE hidden.order_id=o.id AND hidden.customer_id=o.customer_id AND hidden.body=$' + params.length + ')')
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
  const { rows } = await pool.query(`SELECT o.*,
    COALESCE(
      (SELECT MAX(ready_message.created_at)
       FROM customer_messages ready_message
       WHERE ready_message.order_id=o.id
         AND ready_message.customer_id=o.customer_id
         AND ready_message.body LIKE 'Your order is ready for pickup. Your 4-digit pickup PIN is %'),
      CASE WHEN o.status='ready' THEN o.updated_at ELSE NULL END
    ) AS ready_at,
    EXISTS (
      SELECT 1 FROM customer_messages shopkeeper_hidden
      WHERE shopkeeper_hidden.order_id=o.id
        AND shopkeeper_hidden.customer_id=o.customer_id
        AND left(shopkeeper_hidden.body,length('__order_hidden__:shopkeeper:'))='__order_hidden__:shopkeeper:'
    ) AS shopkeeper_removed,
    COALESCE(json_agg(json_build_object('id',i.id,'product_id',i.product_id,'item_name',i.item_name,'emoji',i.emoji,'quantity',i.quantity,'unit',i.unit,'price',i.price,'line_total',i.line_total,'custom_request',i.custom_request,'price_confirmed',i.price_confirmed)) FILTER (WHERE i.id IS NOT NULL),'[]') AS items
    FROM orders o LEFT JOIN order_items i ON i.order_id=o.id ${where}
    GROUP BY o.id ORDER BY o.created_at DESC`, params)
  res.json(rows.map((row) => scope === 'shopkeeper' ? { ...row, pickup_pin: null } : row))
})
router.get('/customer/spending-summary', requireAuth, async (req, res) => {
  const period = String(req.query.period || 'month')
  if (!['week', 'month'].includes(period)) return res.status(400).json({ error: 'Choose a valid spending period.' })
  const unit = period === 'week' ? 'week' : 'month'
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS order_count, COALESCE(SUM(total), 0)::numeric AS total,
       COUNT(*) FILTER (WHERE EXISTS (
         SELECT 1 FROM order_items item
         WHERE item.order_id=orders.id AND item.custom_request=true AND item.price_confirmed=false
       ))::int AS unpriced_order_count
     FROM orders
     WHERE customer_id=$1 AND status='collected'
       AND updated_at >= (date_trunc('${unit}', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')
       AND updated_at < ((date_trunc('${unit}', now() AT TIME ZONE 'Asia/Kolkata') + interval '1 ${unit}') AT TIME ZONE 'Asia/Kolkata')`,
    [req.session.user.id],
  )
  res.json({ period, orderCount: Number(rows[0]?.order_count || 0), total: Number(rows[0]?.total || 0), unpricedOrderCount: Number(rows[0]?.unpriced_order_count || 0) })
})
router.delete('/orders/:id', requireAuth, async (req, res) => {
  const role = req.session.user.role
  const requestedScope = String(req.query.scope || '')
  const scope = requestedScope || (role === 'shopkeeper' ? 'shopkeeper' : 'customer')
  if (!['customer', 'shopkeeper'].includes(scope)) return res.status(400).json({ error: 'Choose a valid order history.' })
  if (scope === 'shopkeeper' && role !== 'shopkeeper') return res.status(403).json({ error: 'Shopkeeper access required.' })

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query('SELECT id,customer_id,status,updated_at FROM orders WHERE id=$1 FOR UPDATE', [req.params.id])
    const order = rows[0]
    if (!order) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Order not found.' })
    }
    if (scope === 'customer' && order.customer_id !== req.session.user.id) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Order not found.' })
    }

    let canHideFromHistory = order.status === 'collected' || order.status === 'rejected'
    if (scope === 'shopkeeper' && order.status === 'ready') {
      const readyMessages = await client.query(
        `SELECT MAX(created_at) AS ready_at
         FROM customer_messages
         WHERE order_id=$1 AND customer_id=$2
           AND body LIKE 'Your order is ready for pickup. Your 4-digit pickup PIN is %'`,
        [order.id, order.customer_id],
      )
      const readyAt = readyMessages.rows[0]?.ready_at || order.updated_at
      const readyAtMs = readyAt ? new Date(readyAt).getTime() : Number.NaN
      canHideFromHistory = Number.isFinite(readyAtMs) && Date.now() - readyAtMs >= 24 * 60 * 60 * 1000
    } else if (scope === 'customer' && order.status === 'ready') {
      const shopkeeperMarker = await client.query(
        `SELECT 1 FROM customer_messages
         WHERE order_id=$1 AND customer_id=$2
           AND left(body,length('__order_hidden__:shopkeeper:'))='__order_hidden__:shopkeeper:'
         LIMIT 1`,
        [order.id, order.customer_id],
      )
      canHideFromHistory = Boolean(shopkeeperMarker.rows[0])
    }

    if (!canHideFromHistory) {
      await client.query('ROLLBACK')
      const error = scope === 'shopkeeper'
        ? 'Declined and collected orders can be removed from the admin list. Ready orders can be removed after 24 hours.'
        : 'Declined and collected orders can be removed from your history. Ready orders can be removed after the shopkeeper removes them from their active list.'
      return res.status(409).json({ error })
    }

    // Hiding one side's history keeps the order and its item details available to the other side.
    const hiddenMarker = '__order_hidden__:' + scope + ':' + req.session.user.id
    await client.query(
      'INSERT INTO customer_messages (customer_id,order_id,body) SELECT $1,$2,$3 WHERE NOT EXISTS (SELECT 1 FROM customer_messages WHERE customer_id=$1 AND order_id=$2 AND body=$3)',
      [order.customer_id, order.id, hiddenMarker],
    )
    await client.query('COMMIT')
    res.json({ id: order.id, hidden: true, scope, customerCanHide: scope === 'shopkeeper' && order.status === 'ready' })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
})
router.post('/orders', requireAuth, orderIpLimiter, orderCustomerLimiter, async (req, res) => {
  const { name, phone: rawPhone, pickupPhone: rawPickupPhone, channel, items } = req.body
  const offerCode = String(req.body.offerCode || '').trim().toUpperCase()
  const acceptedPriceChanges = new Map()
  for (const change of Array.isArray(req.body.acceptedPriceChanges) ? req.body.acceptedPriceChanges : []) {
    if (change && change.product_id != null && Number.isFinite(Number(change.price))) {
      acceptedPriceChanges.set(String(change.product_id), roundMoney(Number(change.price)))
    }
  }
  if (offerCode && !/^[A-Z0-9-]{3,24}$/.test(offerCode)) return res.status(400).json({ error: 'Enter a valid offer code.' })
  const phone = phoneE164(rawPhone)
  const pickupText = String(rawPickupPhone || '').trim()
  const pickupPhone = pickupText ? phoneE164(pickupText) : null
  if (!phone || phone !== req.session.user.phone) return res.status(400).json({ error: 'Use the phone number linked to your signed-in account.' })
  if (pickupText && !pickupPhone) return res.status(400).json({ error: 'Enter a valid 10-digit alternate pickup number.' })
  if (!String(name || '').trim() || !Array.isArray(items) || !items.length || !['online','entrance'].includes(channel)) return res.status(400).json({ error: 'Order details are incomplete.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT id FROM profiles WHERE id=$1 FOR UPDATE', [req.session.user.id])
    const activeOrders = await client.query("SELECT COUNT(*)::int AS count FROM orders WHERE customer_id=$1 AND status IN ('pending','preparing','ready')", [req.session.user.id])
    if (Number(activeOrders.rows[0]?.count || 0) >= 3) throw new ApiError(409, 'You already have 3 active orders. Wait until one is collected or declined before placing another.')
    // Checkout only needs opening hours; contact fields are optional and may not exist on older databases.
    const storeStatus = await readStoreStatus(client, { includeContact: false })
    if (!storeStatus.acceptingOrders) throw new ApiError(409, storeStatus.message || 'The shop is closed right now.')
    let subtotal = 0, hasCustom = false
    const normalized = []
    const priceChanges = []
    for (const item of items) {
      const qty = Number(item.quantity)
      if (!Number.isFinite(qty) || qty <= 0 || qty > 1000) throw new ApiError(400, 'Invalid item quantity.')
      if (item.custom) { hasCustom = true; normalized.push({ ...item, quantity: qty, price: null, line_total: null }); continue }
      const product = await client.query("SELECT id,name,price,stock,unit,emoji FROM products WHERE id=$1 AND active=true AND (expires_on IS NULL OR expires_on >= (now() AT TIME ZONE 'Asia/Kolkata')::date) FOR UPDATE", [item.product_id])
      if (!product.rows[0]) throw new ApiError(409, 'A selected product is no longer available.')
      const p = product.rows[0]
      if (Number(p.stock) < qty) throw new ApiError(409, p.name + ' isn’t available in that quantity. Reduce the amount and try again.')
      const currentPrice = roundMoney(Number(p.price))
      const submittedPrice = Number(item.price)
      if ((!Number.isFinite(submittedPrice) || roundMoney(submittedPrice) !== currentPrice)
        && acceptedPriceChanges.get(String(p.id)) !== currentPrice) {
        priceChanges.push({
          product_id: p.id,
          name: p.name,
          unit: p.unit,
          old_price: Number.isFinite(submittedPrice) ? roundMoney(submittedPrice) : null,
          new_price: currentPrice,
        })
      }
      const line = Math.round(currentPrice * qty * 100) / 100
      subtotal += line
      normalized.push({ product_id: p.id, name: p.name, emoji: p.emoji, quantity: qty, unit: p.unit, price: currentPrice, line_total: line, custom: false })
    }
    if (priceChanges.length) {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Catalogue prices changed. Review the current prices before placing the order.', priceChanges })
    }
    subtotal = roundMoney(subtotal)
    if (subtotal < 100) throw new ApiError(400, 'The confirmed item subtotal must be at least ₹100.')
    let discountAmount = 0
    let appliedOffer = null
    if (offerCode) {
      appliedOffer = await findActiveOffer(client, offerCode)
      if (!appliedOffer) throw new ApiError(400, 'This offer code is invalid, expired, or inactive.')
      if (subtotal < Number(appliedOffer.minimum_order)) throw new ApiError(400, 'This offer requires a confirmed subtotal of at least ₹' + Number(appliedOffer.minimum_order).toFixed(0) + '.')
      discountAmount = roundMoney(subtotal * Number(appliedOffer.discount_percent) / 100)
    }
    const total = roundMoney(subtotal - discountAmount)
    if (total < 100) throw new ApiError(400, 'The order total after discount must be at least ₹100.')
    // Serialize queue-slot allocation so concurrent orders cannot receive the same 15-minute slot.
    await client.query('SELECT pg_advisory_xact_lock(773041, 1)')
    const queue = await client.query("SELECT COALESCE(MAX(estimated_ready_at),now()) AS latest FROM orders WHERE status IN ('pending','preparing')")
    const count = await client.query("SELECT count(*)::int AS n FROM orders WHERE status IN ('pending','preparing') AND estimated_ready_at IS NULL")
    const latest = new Date(queue.rows[0].latest).getTime()
    const ready = new Date(Math.max(Date.now() + (count.rows[0].n + 1) * 15 * 60000, latest + 15 * 60000))
    const pickupPin = String(randomInt(0, 10000)).padStart(4, '0')
    const order = await client.query('INSERT INTO orders(customer_id,customer_name,customer_phone,pickup_phone,channel,payment_method,subtotal,discount_amount,offer_code,total,pickup_pin,estimated_ready_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,order_number,estimated_ready_at,status,subtotal,discount_amount,offer_code,total,pickup_pin', [req.session.user.id, String(name).trim(), phone, pickupPhone, channel, 'pickup', subtotal, discountAmount, appliedOffer?.code || null, total, pickupPin, ready.toISOString()])
    for (const item of normalized) {
      await client.query('INSERT INTO order_items(order_id,product_id,item_name,emoji,quantity,unit,price,line_total,custom_request,price_confirmed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [order.rows[0].id, item.product_id || null, item.name, item.emoji || '🛍️', item.quantity, item.unit || 'piece', item.price ?? null, item.line_total ?? null, Boolean(item.custom), !item.custom])
    }
    await client.query('INSERT INTO customer_messages(customer_id,order_id,body) VALUES($1,$2,$3)', [req.session.user.id, order.rows[0].id, `Order MK-${String(order.rows[0].order_number).padStart(6,'0')} received.`])
    await client.query('COMMIT')
    res.status(201).json(order.rows[0])
  } catch (error) {
    await client.query('ROLLBACK')
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message })
    throw error
  } finally { client.release() }
})
router.post('/orders/:id/collect', requireAuth, pickupPinLimiter, pickupPinOrderLimiter, requireShopkeeper, async (req, res) => {
  const pickupPin = String(req.body.pickupPin || '')
  if (!/^\d{4}$/.test(pickupPin)) return res.status(400).json({ error: 'Enter the customer’s 4-digit pickup PIN.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [req.params.id])
    const order = rows[0]
    if (!order) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found.' }) }
    if (order.status !== 'ready') throw new ApiError(409, 'Only ready orders can be collected.')
    if (order.pickup_pin !== pickupPin) throw new ApiError(400, 'That 4-digit pickup PIN does not match.')
    await client.query("UPDATE orders SET status='collected',updated_at=now() WHERE id=$1", [order.id])
    await client.query('INSERT INTO customer_messages(customer_id,order_id,body) VALUES($1,$2,$3)', [order.customer_id, order.id, 'Your order has been collected. Thank you!'])
    await client.query('COMMIT')
    res.json({ id: order.id, status: 'collected' })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message })
    throw error
  } finally { client.release() }
})
router.patch('/orders/:id/status', requireAuth, requireShopkeeper, async (req, res) => {
  const next = String(req.body.status || '')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [req.params.id])
    const order = rows[0]
    if (!order) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found.' }) }
    const allowed = { pending: ['preparing','rejected'], preparing: ['ready'], ready: [] }
    if (next === 'collected') throw new ApiError(400, 'Verify the customer’s 4-digit pickup PIN to complete collection.')
    if (!(allowed[order.status] || []).includes(next)) throw new ApiError(400, 'Invalid order status transition.')
    if (next === 'preparing') {
      const items = await client.query(
        'SELECT product_id,SUM(quantity)::numeric AS quantity FROM order_items WHERE order_id=$1 AND custom_request=false AND product_id IS NOT NULL GROUP BY product_id ORDER BY product_id',
        [order.id],
      )
      for (const item of items.rows) {
        const reserved = await client.query(
          "UPDATE products SET stock=stock-$1,updated_at=now() WHERE id=$2 AND active=true AND stock >= $1 AND (expires_on IS NULL OR expires_on >= (now() AT TIME ZONE 'Asia/Kolkata')::date) RETURNING id",
          [item.quantity, item.product_id],
        )
        if (!reserved.rows[0]) throw new ApiError(409, 'An item in this order no longer has enough stock. Review the order and decline it if needed.')
      }
      await client.query('UPDATE orders SET stock_deducted=true WHERE id=$1', [order.id])
    }
    if (next === 'rejected' && order.stock_deducted) {
      const items = await client.query(
        'SELECT product_id,SUM(quantity)::numeric AS quantity FROM order_items WHERE order_id=$1 AND custom_request=false AND product_id IS NOT NULL GROUP BY product_id',
        [order.id],
      )
      for (const item of items.rows) await client.query('UPDATE products SET stock=stock+$1,updated_at=now() WHERE id=$2', [item.quantity, item.product_id])
    }
    await client.query(
      "UPDATE orders SET status=$1,updated_at=now(),stock_deducted=CASE WHEN $1='rejected' THEN false ELSE stock_deducted END WHERE id=$2",
      [next, order.id],
    )
    const body = next === 'preparing' ? 'Your order is being prepared.' : next === 'ready' ? 'Your order is ready for pickup. Your 4-digit pickup PIN is ' + order.pickup_pin + '. Show it to the shopkeeper when collecting.' : next === 'collected' ? 'Your order has been collected. Thank you!' : 'Your order was declined. Please contact the shop.'
    await client.query('INSERT INTO customer_messages(customer_id,order_id,body) VALUES($1,$2,$3)', [order.customer_id, order.id, body])
    await client.query('COMMIT'); res.json({ id: order.id, status: next })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message })
    throw error
  } finally { client.release() }
})
router.patch('/order-items/:id/price', requireAuth, requireShopkeeper, async (req, res) => {
  const rate = Number(req.body.rate)
  if (!Number.isFinite(rate) || rate <= 0) return res.status(400).json({ error: 'Rate must be greater than zero.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const found = await client.query('SELECT i.*,o.id AS oid,o.customer_id,o.status FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.id=$1 FOR UPDATE OF i,o', [req.params.id])
    const item = found.rows[0]
    if (!item || !item.custom_request || item.price_confirmed || ['rejected','collected'].includes(item.status)) throw new ApiError(409, 'This requested item cannot be priced.')
    const line = Math.round(rate * Number(item.quantity) * 100) / 100
    await client.query('UPDATE order_items SET price=$1,line_total=$2,price_confirmed=true WHERE id=$3', [rate,line,item.id])
    await client.query('UPDATE orders SET subtotal=(SELECT COALESCE(SUM(line_total),0) FROM order_items WHERE order_id=$1),total=(SELECT COALESCE(SUM(line_total),0) FROM order_items WHERE order_id=$1)-discount_amount,updated_at=now() WHERE id=$1', [item.oid])
    await client.query('INSERT INTO customer_messages(customer_id,order_id,body) VALUES($1,$2,$3)', [item.customer_id,item.oid,`Price confirmed for ${item.item_name}: ₹${rate.toFixed(2)} per ${item.unit}.`])
    await client.query('COMMIT'); res.json({ id: item.id, price: rate, line_total: line })
  } catch (error) {
    await client.query('ROLLBACK')
    if (error instanceof ApiError) return res.status(error.status).json({ error: error.message })
    throw error
  } finally { client.release() }
})
router.get('/messages', requireAuth, async (req, res) => {
  const { rows } = await pool.query(`
    SELECT message.id,message.body,message.created_at,message.order_id
    FROM customer_messages message
    WHERE message.customer_id=$1
      AND left(message.body,length('__order_hidden__:')) <> '__order_hidden__:'
      AND NOT EXISTS (
        SELECT 1 FROM customer_messages hidden
        WHERE hidden.customer_id=message.customer_id
          AND hidden.order_id=message.order_id
          AND hidden.body='__order_hidden__:customer:' || message.customer_id::text
      )
    ORDER BY message.created_at DESC
    LIMIT 25
  `, [req.session.user.id])
  res.json(rows)
})
router.get('/reports/restock', requireAuth, requireShopkeeper, async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT p.id,p.name,p.local,p.unit,p.stock,p.step,
      COALESCE(SUM(item.quantity) FILTER (WHERE order_row.id IS NOT NULL),0)::numeric AS sold_quantity_30d
    FROM products p
    LEFT JOIN order_items item ON item.product_id=p.id
    LEFT JOIN orders order_row ON order_row.id=item.order_id AND order_row.status='collected' AND order_row.updated_at>=now()-interval '30 days'
    WHERE p.active=true
    GROUP BY p.id
    ORDER BY p.name
  `)
  const suggestions = rows.map((row) => {
    const soldQuantity30d = Number(row.sold_quantity_30d) || 0
    const stock = Number(row.stock) || 0
    const step = Number(row.step) || 1
    const targetStock = soldQuantity30d * 14 / 30
    const suggestedQuantity = soldQuantity30d > 0 && stock < targetStock
      ? Math.ceil((targetStock - stock) / step) * step
      : 0
    return { id: row.id, name: row.name, local: row.local, unit: row.unit, stock, soldQuantity30d, targetStock: roundMoney(targetStock), suggestedQuantity: roundMoney(suggestedQuantity) }
  }).filter((row) => row.suggestedQuantity > 0)
  res.json(suggestions)
})
router.get('/reports/export.csv', requireAuth, requireShopkeeper, async (req, res) => {
  const csvCell = (value) => {
    let text = String(value ?? '')
    if (/^[\s\uFEFF]*[=+\-@]/.test(text)) text = "'" + text
    return '"' + text.replace(/"/g, '""') + '"'
  }
  const sendCsv = (filename, rows) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"')
    res.send('\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n'))
  }
  const type = String(req.query.type || '')
  if (type === 'inventory') {
    const { rows } = await pool.query(`
      SELECT p.name,p.local,c.name AS category,p.stock,p.unit,p.price,p.expires_on
      FROM products p JOIN categories c ON c.id=p.category_id
      WHERE p.active=true ORDER BY c.name,p.name
    `)
    return sendCsv('mana-kirana-inventory.csv', [
      ['Item','Telugu name','Category','Stock','Unit','Rate (INR)','Expiry date'],
      ...rows.map((row) => [row.name,row.local,row.category,row.stock,row.unit,row.price,row.expires_on]),
    ])
  }
  if (type !== 'sales') return res.status(400).json({ error: 'Choose a sales or inventory export.' })
  const date = normalizeDateOnly(String(req.query.date || ''))
  if (!date) return res.status(400).json({ error: 'Choose a valid report date.' })
  const { rows } = await pool.query(`
    SELECT o.order_number,to_char(o.updated_at AT TIME ZONE 'Asia/Kolkata','YYYY-MM-DD HH24:MI') AS collected_at,
      o.customer_name,o.customer_phone,o.pickup_phone,
      COALESCE(string_agg(item.item_name || ' x' || item.quantity || ' ' || item.unit,'; ' ORDER BY item.created_at),'') AS items,
      o.subtotal,o.discount_amount,o.offer_code,o.total
    FROM orders o LEFT JOIN order_items item ON item.order_id=o.id
    WHERE o.status='collected'
      AND o.updated_at >= (($1::date)::timestamp AT TIME ZONE 'Asia/Kolkata')
      AND o.updated_at < ((($1::date)+1)::timestamp AT TIME ZONE 'Asia/Kolkata')
    GROUP BY o.id ORDER BY o.updated_at
  `, [date])
  return sendCsv('mana-kirana-sales-' + date + '.csv', [
    ['Order','Collected at (IST)','Customer','Account phone','Pickup phone','Items','Subtotal (INR)','Offer code','Discount (INR)','Total (INR)'],
    ...rows.map((row) => ['MK-' + String(row.order_number).padStart(6,'0'),row.collected_at,row.customer_name,row.customer_phone,row.pickup_phone,row.items,row.subtotal,row.offer_code,row.discount_amount,row.total]),
  ])
})
router.get('/reports/daily-sales', requireAuth, requireShopkeeper, async (req, res) => {
  const date = String(req.query.date || '')
  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00.000Z') : null
  if (!parsedDate || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    return res.status(400).json({ error: 'Choose a valid report date.' })
  }
  const dateWindow = `updated_at >= (($1::date)::timestamp AT TIME ZONE 'Asia/Kolkata') AND updated_at < ((($1::date) + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')`
  const [summary, items] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS order_count, COALESCE(SUM(total), 0)::numeric AS total FROM orders WHERE status='collected' AND ${dateWindow}`, [date]),
    pool.query(`SELECT item.item_name AS name, item.unit, SUM(item.quantity)::numeric AS quantity, SUM(item.line_total)::numeric AS total FROM orders order_row JOIN order_items item ON item.order_id=order_row.id WHERE order_row.status='collected' AND ${dateWindow.replaceAll('updated_at', 'order_row.updated_at')} AND item.custom_request=false AND item.price_confirmed=true GROUP BY item.item_name,item.unit ORDER BY SUM(item.line_total) DESC NULLS LAST LIMIT 5`, [date]),
  ])
  res.json({ date, orderCount: Number(summary.rows[0]?.order_count || 0), total: Number(summary.rows[0]?.total || 0), topItems: items.rows.map((item) => ({ ...item, quantity: Number(item.quantity), total: Number(item.total) })) })
})
export default router
