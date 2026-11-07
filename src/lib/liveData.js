import { API_URL, request } from './supabaseClient.js'

function orderLabel(orderNumber) { return 'MK-' + String(orderNumber).padStart(6, '0') }
export async function fetchLiveCatalog() {
  const data = await request('/api/catalog')
  return {
    categories: data.categories,
    products: data.products.map((row) => ({
      id: row.id, name: row.name, local: row.local || '', category: row.category || 'Other', categoryId: row.category_id,
      price: Number(row.price), unit: row.unit, step: Number(row.step) || 1, stock: Number(row.stock), emoji: row.emoji || '🛍️', tint: row.tint || 'new', note: row.note || '',
      expiresOn: row.expires_on || '',
    })),
    offers: (data.offers || []).map((row) => ({ ...row, discountPercent: Number(row.discount_percent), minimumOrder: Number(row.minimum_order) })),
    storeStatus: data.storeStatus || null,
  }
}
export async function fetchLiveOrders(scope = 'customer') {
  if (!['customer', 'shopkeeper'].includes(scope)) throw new Error('Choose a valid order history.')
  const rows = await request('/api/orders?scope=' + encodeURIComponent(scope))
  return rows.map((row) => {
    const readyAt = row.ready_at || (row.status === 'ready' ? row.updated_at : '')
    return {
      id: orderLabel(row.order_number), dbId: row.id, name: row.customer_name,
      phone: row.customer_phone || '', pickupPhone: row.pickup_phone || '', channel: row.channel, status: row.status,
      payment: row.payment_method === 'upi_demo' ? 'UPI · demo only' : 'Pay at pickup', total: Number(row.total), subtotal: Number(row.subtotal ?? row.total), discountAmount: Number(row.discount_amount || 0), offerCode: row.offer_code || '', pickupPin: row.pickup_pin || '', createdAt: row.created_at,
      estimatedReadyAt: row.estimated_ready_at, readyAt, shopkeeperRemoved: Boolean(row.shopkeeper_removed), updatedAt: row.updated_at, sample: false, stockDeducted: true,
      items: (row.items || []).map((item) => ({ id: item.id, productId: item.product_id || item.id, name: item.item_name, emoji: item.emoji || (item.custom_request ? '📝' : '🛍️'), quantity: Number(item.quantity), unit: item.unit, price: item.price == null ? null : Number(item.price), lineTotal: item.line_total == null ? null : Number(item.line_total), custom: item.custom_request, priced: item.price_confirmed })),
    }
  })
}
export async function fetchCustomerMessages() { return request('/api/messages') }
export async function fetchDailySales(date) { return request('/api/reports/daily-sales?date=' + encodeURIComponent(date)) }
export async function fetchRestockSuggestions() { return request('/api/reports/restock') }
export async function createLiveOffer(details) { return request('/api/offers', { method: 'POST', body: JSON.stringify(details) }) }
export async function updateLiveOffer(offerId, active) { return request('/api/offers/' + encodeURIComponent(offerId), { method: 'PATCH', body: JSON.stringify({ active }) }) }
export async function deleteLiveOffer(offerId) { return request('/api/offers/' + encodeURIComponent(offerId), { method: 'DELETE' }) }
export async function updateLiveStoreSettings(details) { return request('/api/store-settings', { method: 'PATCH', body: JSON.stringify(details) }) }
export async function validateLiveOffer(code, subtotal) { return request('/api/offers/validate', { method: 'POST', body: JSON.stringify({ code, subtotal }) }) }
export async function downloadLiveReport(type, date) {
  const query = new URLSearchParams({ type })
  if (date) query.set('date', date)
  const response = await fetch(`${API_URL}/api/reports/export.csv?${query}`, { credentials: 'include' })
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || 'Could not download the report.')
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = type === 'inventory' ? 'mana-kirana-inventory.csv' : 'mana-kirana-sales-' + date + '.csv'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export async function fetchProfile(userId) { return request('/api/profile/' + encodeURIComponent(userId)) }
export async function updateLiveProfile(userId, details) { return request('/api/profile/' + encodeURIComponent(userId), { method: 'PATCH', body: JSON.stringify(details) }) }
export async function createLiveCategory(name) { return request('/api/categories', { method: 'POST', body: JSON.stringify({ name }) }) }
export async function archiveLiveCategory(categoryId) { return request('/api/categories/' + categoryId, { method: 'DELETE' }) }
export async function createLiveProduct(details, categoryId) { return request('/api/products', { method: 'POST', body: JSON.stringify({ ...details, categoryId }) }) }
export async function updateLiveProduct(productId, changes) { return request('/api/products/' + productId, { method: 'PATCH', body: JSON.stringify(changes) }) }
export async function archiveLiveProduct(productId) { return request('/api/products/' + productId, { method: 'DELETE' }) }
export async function placeLiveOrder(details) { return request('/api/orders', { method: 'POST', body: JSON.stringify(details) }) }
export async function updateLiveOrderStatus(orderId, nextStatus, pickupPin) {
  if (nextStatus === 'collected') return request('/api/orders/' + encodeURIComponent(orderId) + '/collect', { method: 'POST', body: JSON.stringify({ pickupPin }) })
  return request('/api/orders/' + encodeURIComponent(orderId) + '/status', { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) })
}
export async function hideLiveOrder(orderId, scope = 'customer') {
  if (!['customer', 'shopkeeper'].includes(scope)) throw new Error('Choose a valid order history.')
  return request('/api/orders/' + encodeURIComponent(orderId) + '?scope=' + encodeURIComponent(scope), { method: 'DELETE' })
}
export async function setLiveRequestRate(orderItemId, rate) { return request('/api/order-items/' + orderItemId + '/price', { method: 'PATCH', body: JSON.stringify({ rate }) }) }
export async function changeLivePassword(currentPassword, newPassword) { return request('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }) }
function poll(onChange, onStatus, account = false) {
  let active = true
  const check = async () => { try { if (account) await request('/api/auth/me'); if (active) { onChange(); onStatus?.('SUBSCRIBED') } } catch (error) { onStatus?.('ERROR', error) } }
  const timer = window.setInterval(check, 5000)
  return () => { active = false; window.clearInterval(timer) }
}
export function subscribeToCatalog(onChange, onStatus) { return poll(onChange, onStatus) }
export function subscribeToAccount(onChange, onStatus) { return poll(onChange, onStatus, true) }
