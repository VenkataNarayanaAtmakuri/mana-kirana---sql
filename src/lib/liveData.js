import { request } from './supabaseClient.js'

function orderLabel(orderNumber) { return 'MK-' + String(orderNumber).padStart(6, '0') }
export async function fetchLiveCatalog() {
  const data = await request('/api/catalog')
  return { categories: data.categories, products: data.products.map((row) => ({
    id: row.id, name: row.name, local: row.local || '', category: row.category || 'Other', categoryId: row.category_id,
    price: Number(row.price), unit: row.unit, step: Number(row.step) || 1, stock: Number(row.stock), emoji: row.emoji || '🛍️', tint: row.tint || 'new', note: row.note || '',
  })) }
}
export async function fetchLiveOrders() {
  const rows = await request('/api/orders')
  return rows.map((row) => ({
    id: orderLabel(row.order_number), dbId: row.id, name: row.customer_name,
    phone: row.customer_phone ? '••••• ' + row.customer_phone.replace(/\D/g, '').slice(-4) : '', channel: row.channel, status: row.status,
    payment: row.payment_method === 'upi_demo' ? 'UPI · demo only' : 'Pay at pickup', total: Number(row.total), createdAt: row.created_at,
    estimatedReadyAt: row.estimated_ready_at, sample: false, stockDeducted: true,
    items: (row.items || []).map((item) => ({ id: item.id, productId: item.product_id || item.id, name: item.item_name, emoji: item.emoji || (item.custom_request ? '📝' : '🛍️'), quantity: Number(item.quantity), unit: item.unit, price: item.price == null ? null : Number(item.price), lineTotal: item.line_total == null ? null : Number(item.line_total), custom: item.custom_request, priced: item.price_confirmed })),
  }))
}
export async function fetchCustomerMessages() { return request('/api/messages') }
export async function fetchProfile(userId) { return request('/api/profile/' + encodeURIComponent(userId)) }
export async function createLiveCategory(name) { return request('/api/categories', { method: 'POST', body: JSON.stringify({ name }) }) }
export async function archiveLiveCategory(categoryId) { return request('/api/categories/' + categoryId, { method: 'DELETE' }) }
export async function createLiveProduct(details, categoryId) { return request('/api/products', { method: 'POST', body: JSON.stringify({ ...details, categoryId }) }) }
export async function updateLiveProduct(productId, changes) { return request('/api/products/' + productId, { method: 'PATCH', body: JSON.stringify(changes) }) }
export async function archiveLiveProduct(productId) { return request('/api/products/' + productId, { method: 'DELETE' }) }
export async function placeLiveOrder(details) { return request('/api/orders', { method: 'POST', body: JSON.stringify(details) }) }
export async function updateLiveOrderStatus(orderId, nextStatus) { return request('/api/orders/' + orderId + '/status', { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) }) }
export async function hideLiveOrder(orderId) { return request('/api/orders/' + encodeURIComponent(orderId), { method: 'DELETE' }) }
export async function setLiveRequestRate(orderItemId, rate) { return request('/api/order-items/' + orderItemId + '/price', { method: 'PATCH', body: JSON.stringify({ rate }) }) }
function poll(onChange, onStatus, account = false) {
  let active = true
  const check = async () => { try { if (account) await request('/api/auth/me'); if (active) { onChange(); onStatus?.('SUBSCRIBED') } } catch (error) { onStatus?.('ERROR', error) } }
  const timer = window.setInterval(check, 5000)
  return () => { active = false; window.clearInterval(timer) }
}
export function subscribeToCatalog(onChange, onStatus) { return poll(onChange, onStatus) }
export function subscribeToAccount(onChange, onStatus) { return poll(onChange, onStatus, true) }
