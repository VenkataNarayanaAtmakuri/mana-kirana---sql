import { Router } from 'express'
import argon2 from 'argon2'
import { rateLimit } from 'express-rate-limit'
import { pool } from './db.js'

const router = Router()
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 12, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many authentication attempts. Try again later.' } })
const passwordChangeLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many password change attempts. Try again later.' } })
const profileUpdateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many profile update attempts. Try again later.' } })
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
  try {
    const { rows } = await pool.query('INSERT INTO profiles(phone,full_name,password_hash,role,phone_verified) VALUES($1,$2,$3,\'customer\',false) RETURNING id,phone,full_name,role,phone_verified', [phone, fullName, hash])
    req.session.user = publicUser(rows[0])
    res.status(201).json({ user: req.session.user })
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'An account with this phone number already exists. Please sign in.' })
    throw error
  }
})
router.post('/auth/login', authLimiter, async (req, res) => {
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
  req.session.user = publicUser(rows[0])
  res.json({ user: req.session.user })
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
  await pool.query('UPDATE profiles SET password_hash=$1 WHERE id=$2', [passwordHash, req.session.user.id])
  res.json({ ok: true })
})
router.get('/auth/me', (req, res) => res.json({ user: req.session.user || null }))
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
router.get('/catalog', async (_req, res) => {
  const [categories, products] = await Promise.all([
    pool.query('SELECT id,name FROM categories WHERE active=true ORDER BY name'),
    pool.query('SELECT p.*, c.name AS category FROM products p JOIN categories c ON c.id=p.category_id WHERE p.active=true AND c.active=true ORDER BY p.name'),
  ])
  res.json({ categories: categories.rows, products: products.rows })
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
  if (!String(name || '').trim() || !categoryId || !Number.isFinite(Number(price)) || Number(price) <= 0 || !Number.isFinite(Number(stock)) || Number(stock) < 0) return res.status(400).json({ error: 'Valid product name, category, price, and stock are required.' })
  const category = String(req.body.category || '').toLowerCase()
  const emoji = category.includes('dairy') ? '🥛' : category.includes('fresh') ? '🥬' : category.includes('snack') ? '🥨' : '🛍️'
  const { rows } = await pool.query('INSERT INTO products(name,local,category_id,unit,price,stock,step,emoji,tint,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id', [String(name).trim(), String(local), categoryId, unit, Number(price), Number(stock), unit === 'kg' ? 0.01 : 1, emoji, 'new', 'Added by the shopkeeper'])
  res.status(201).json(rows[0])
})
router.patch('/products/:id', requireAuth, requireShopkeeper, async (req, res) => {
  const price = Number(req.body.price), stock = Number(req.body.stock)
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(stock) || stock < 0) return res.status(400).json({ error: 'Price must be positive and stock cannot be negative.' })
  const { rows } = await pool.query('UPDATE products SET price=$1,stock=$2,updated_at=now() WHERE id=$3 AND active=true RETURNING id', [price, stock, req.params.id])
  if (!rows[0]) return res.status(404).json({ error: 'Product not found.' })
  res.json(rows[0])
})
router.delete('/products/:id', requireAuth, requireShopkeeper, async (req, res) => {
  const { rows } = await pool.query('UPDATE products SET active=false,updated_at=now() WHERE id=$1 AND active=true RETURNING id', [req.params.id])
  if (!rows[0]) return res.status(404).json({ error: 'Product not found.' })
  res.json(rows[0])
})
router.get('/orders', requireAuth, async (req, res) => {
  const params = []
  const conditions = []
  if (req.session.user.role !== 'shopkeeper') {
    params.push(req.session.user.id)
    conditions.push('o.customer_id=$' + params.length)
  }
  const hiddenMarker = '__order_hidden__:' + req.session.user.role + ':' + req.session.user.id
  params.push(hiddenMarker)
  conditions.push('NOT EXISTS (SELECT 1 FROM customer_messages hidden WHERE hidden.order_id=o.id AND hidden.customer_id=o.customer_id AND hidden.body=$' + params.length + ')')
  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''
  const { rows } = await pool.query(`SELECT o.*, COALESCE(json_agg(json_build_object('id',i.id,'product_id',i.product_id,'item_name',i.item_name,'emoji',i.emoji,'quantity',i.quantity,'unit',i.unit,'price',i.price,'line_total',i.line_total,'custom_request',i.custom_request,'price_confirmed',i.price_confirmed)) FILTER (WHERE i.id IS NOT NULL),'[]') AS items FROM orders o LEFT JOIN order_items i ON i.order_id=o.id ${where} GROUP BY o.id ORDER BY o.created_at DESC`, params)
  res.json(rows)
})
router.delete('/orders/:id', requireAuth, async (req, res) => {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query('SELECT id,customer_id,status FROM orders WHERE id=$1 FOR UPDATE', [req.params.id])
    const order = rows[0]
    if (!order) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Order not found.' })
    }
    if (req.session.user.role !== 'shopkeeper' && order.customer_id !== req.session.user.id) {
      await client.query('ROLLBACK')
      return res.status(404).json({ error: 'Order not found.' })
    }
    if (order.status !== 'collected') {
      await client.query('ROLLBACK')
      return res.status(409).json({ error: 'Only collected orders can be deleted.' })
    }
    // A hidden marker keeps the order and its item details available to the other account.
    const hiddenMarker = '__order_hidden__:' + req.session.user.role + ':' + req.session.user.id
    await client.query(
      'INSERT INTO customer_messages (customer_id,order_id,body) SELECT $1,$2,$3 WHERE NOT EXISTS (SELECT 1 FROM customer_messages WHERE customer_id=$1 AND order_id=$2 AND body=$3)',
      [order.customer_id, order.id, hiddenMarker],
    )
    await client.query('COMMIT')
    res.json({ id: order.id, hidden: true, scope: req.session.user.role })
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
})
router.post('/orders', requireAuth, async (req, res) => {
  const { name, phone: rawPhone, pickupPhone: rawPickupPhone, channel, payment, items } = req.body
  const phone = phoneE164(rawPhone)
  const pickupText = String(rawPickupPhone || '').trim()
  const pickupPhone = pickupText ? phoneE164(pickupText) : null
  if (!phone || phone !== req.session.user.phone) return res.status(400).json({ error: 'Use the phone number linked to your signed-in account.' })
  if (pickupText && !pickupPhone) return res.status(400).json({ error: 'Enter a valid 10-digit alternate pickup number.' })
  if (!String(name || '').trim() || !Array.isArray(items) || !items.length || !['online','entrance'].includes(channel)) return res.status(400).json({ error: 'Order details are incomplete.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    let total = 0, hasCustom = false
    const normalized = []
    for (const item of items) {
      const qty = Number(item.quantity)
      if (!Number.isFinite(qty) || qty <= 0 || qty > 1000) throw new Error('Invalid item quantity.')
      if (item.custom) { hasCustom = true; normalized.push({ ...item, quantity: qty, price: null, line_total: null }); continue }
      const product = await client.query('SELECT id,name,price,stock,unit,emoji FROM products WHERE id=$1 AND active=true FOR UPDATE', [item.product_id])
      if (!product.rows[0]) throw new Error('A selected product is no longer available.')
      const p = product.rows[0]
      if (Number(p.stock) < qty) throw new Error(`${p.name} does not have enough stock.`)
      const line = Math.round(Number(p.price) * qty * 100) / 100
      total += line
      normalized.push({ product_id: p.id, name: p.name, emoji: p.emoji, quantity: qty, unit: p.unit, price: Number(p.price), line_total: line, custom: false })
    }
    total = Math.round(total * 100) / 100
    if (total <= 200) throw new Error('The confirmed item subtotal must be more than ₹200.')
    const queue = await client.query("SELECT COALESCE(MAX(estimated_ready_at),now()) AS latest FROM orders WHERE status IN ('pending','preparing')")
    const count = await client.query("SELECT count(*)::int AS n FROM orders WHERE status IN ('pending','preparing') AND estimated_ready_at IS NULL")
    const latest = new Date(queue.rows[0].latest).getTime()
    const ready = new Date(Math.max(Date.now() + (count.rows[0].n + 1) * 15 * 60000, latest + 15 * 60000))
    const order = await client.query('INSERT INTO orders(customer_id,customer_name,customer_phone,pickup_phone,channel,payment_method,total,estimated_ready_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,order_number,estimated_ready_at,status', [req.session.user.id, String(name).trim(), phone, pickupPhone, channel, hasCustom ? 'pickup' : payment === 'upi_demo' ? 'upi_demo' : 'pickup', total, ready.toISOString()])
    for (const item of normalized) {
      if (!item.custom) await client.query('UPDATE products SET stock=stock-$1,updated_at=now() WHERE id=$2', [item.quantity, item.product_id])
      await client.query('INSERT INTO order_items(order_id,product_id,item_name,emoji,quantity,unit,price,line_total,custom_request,price_confirmed) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [order.rows[0].id, item.product_id || null, item.name, item.emoji || '🛍️', item.quantity, item.unit || 'piece', item.price ?? null, item.line_total ?? null, Boolean(item.custom), !item.custom])
    }
    await client.query('INSERT INTO customer_messages(customer_id,order_id,body) VALUES($1,$2,$3)', [req.session.user.id, order.rows[0].id, `Order MK-${String(order.rows[0].order_number).padStart(6,'0')} received.`])
    await client.query('COMMIT')
    res.status(201).json(order.rows[0])
  } catch (error) { await client.query('ROLLBACK'); res.status(400).json({ error: error.message || 'Could not place order.' }) } finally { client.release() }
})
router.patch('/orders/:id/status', requireAuth, requireShopkeeper, async (req, res) => {
  const next = String(req.body.status || '')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const { rows } = await client.query('SELECT * FROM orders WHERE id=$1 FOR UPDATE', [req.params.id])
    const order = rows[0]
    if (!order) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found.' }) }
    const allowed = { pending: ['preparing','rejected'], preparing: ['ready'], ready: ['collected'] }
    if (!(allowed[order.status] || []).includes(next)) throw new Error('Invalid order status transition.')
    if (next === 'rejected') {
      const items = await client.query('SELECT product_id,quantity FROM order_items WHERE order_id=$1 AND custom_request=false AND product_id IS NOT NULL', [order.id])
      for (const item of items.rows) await client.query('UPDATE products SET stock=stock+$1,updated_at=now() WHERE id=$2', [item.quantity, item.product_id])
    }
    await client.query('UPDATE orders SET status=$1,updated_at=now() WHERE id=$2', [next, order.id])
    const body = next === 'preparing' ? 'Your order is being prepared.' : next === 'ready' ? 'Your order is ready for pickup.' : next === 'collected' ? 'Your order has been collected. Thank you!' : 'Your order was declined. Please contact the shop.'
    await client.query('INSERT INTO customer_messages(customer_id,order_id,body) VALUES($1,$2,$3)', [order.customer_id, order.id, body])
    await client.query('COMMIT'); res.json({ id: order.id, status: next })
  } catch (error) { await client.query('ROLLBACK'); res.status(400).json({ error: error.message }) } finally { client.release() }
})
router.patch('/order-items/:id/price', requireAuth, requireShopkeeper, async (req, res) => {
  const rate = Number(req.body.rate)
  if (!Number.isFinite(rate) || rate <= 0) return res.status(400).json({ error: 'Rate must be greater than zero.' })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const found = await client.query('SELECT i.*,o.id AS oid,o.customer_id,o.status FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.id=$1 FOR UPDATE OF i,o', [req.params.id])
    const item = found.rows[0]
    if (!item || !item.custom_request || item.price_confirmed || ['rejected','collected'].includes(item.status)) throw new Error('This requested item cannot be priced.')
    const line = Math.round(rate * Number(item.quantity) * 100) / 100
    await client.query('UPDATE order_items SET price=$1,line_total=$2,price_confirmed=true WHERE id=$3', [rate,line,item.id])
    await client.query('UPDATE orders SET total=(SELECT COALESCE(SUM(line_total),0) FROM order_items WHERE order_id=$1),updated_at=now() WHERE id=$1', [item.oid])
    await client.query('INSERT INTO customer_messages(customer_id,order_id,body) VALUES($1,$2,$3)', [item.customer_id,item.oid,`Price confirmed for ${item.item_name}: ₹${rate.toFixed(2)} per ${item.unit}.`])
    await client.query('COMMIT'); res.json({ id: item.id, price: rate, line_total: line })
  } catch (error) { await client.query('ROLLBACK'); res.status(400).json({ error: error.message }) } finally { client.release() }
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
