import { useEffect, useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { formatMoney, formatQuantity, formatReadyTime } from '../data.js'
import { fetchCustomerSpendingSummary } from '../lib/liveData.js'

const ORDER_STATUS = {
  pending: { label: 'Order received', className: 'pending' },
  preparing: { label: 'Being prepared', className: 'preparing' },
  ready: { label: 'Ready for pickup', className: 'ready' },
  collected: { label: 'Collected', className: 'collected' },
  rejected: { label: 'Declined', className: 'rejected' },
}

function formatReceiptDate(value) {
  const date = new Date(value || '')
  return Number.isNaN(date.getTime())
    ? 'Collection date unavailable'
    : new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(date)
}

function receiptText(order) {
  const lines = [
    'Mana Kirana — Digital receipt',
    'Order ' + order.id,
    'Collected on ' + formatReceiptDate(order.updatedAt || order.createdAt),
    '',
    ...order.items.map((item) => {
      const amount = item.lineTotal == null ? 'Price confirmed at shop' : formatMoney(item.lineTotal)
      return item.name + ' · ' + formatQuantity(item.quantity, item.unit) + ' · ' + amount
    }),
    '',
    'Subtotal: ' + formatMoney(order.subtotal ?? order.total),
  ]
  if (order.offerCode) lines.push('Offer: ' + order.offerCode)
  if (order.discountAmount > 0) lines.push('Discount: −' + formatMoney(order.discountAmount))
  if (order.items.some((item) => item.lineTotal == null)) lines.push('Unpriced item requests are not included in this confirmed total.')
  lines.push('Confirmed total: ' + formatMoney(order.total))
  lines.push('Payment option: ' + (order.payment || 'Pay at pickup'))
  return lines.join('\n')
}

export default function CustomerOrderHistory({ orders, onDeleteOrder, deletingOrderId, onReorderOrder }) {
  const [spendPeriod, setSpendPeriod] = useState('month')
  const [spending, setSpending] = useState(null)
  const [spendingLoading, setSpendingLoading] = useState(true)
  const [spendingError, setSpendingError] = useState('')
  const [receiptMessage, setReceiptMessage] = useState('')
  const sortedOrders = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  useEffect(() => {
    let active = true
    setSpendingLoading(true)
    setSpendingError('')
    fetchCustomerSpendingSummary(spendPeriod)
      .then((summary) => { if (active) setSpending(summary) })
      .catch((error) => { if (active) setSpendingError(error.message || 'Could not load spending summary.') })
      .finally(() => { if (active) setSpendingLoading(false) })
    return () => { active = false }
  }, [spendPeriod])

  async function shareReceipt(order) {
    const text = receiptText(order)
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: 'Mana Kirana receipt ' + order.id, text })
        setReceiptMessage('Receipt shared.')
      } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        setReceiptMessage('Receipt copied. You can paste it into a message.')
      } else {
        setReceiptMessage('Receipt sharing is not available in this browser.')
      }
    } catch (error) {
      if (error.name !== 'AbortError') setReceiptMessage('Could not share the receipt. Try again.')
    }
  }

  return (
    <section className="customer-order-history" aria-label="Your orders">
      <div className="customer-order-history-heading">
        <div><h2>Your orders</h2><span>Orders from this account</span></div>
        <span>{orders.length} {orders.length === 1 ? 'order' : 'orders'}</span>
      </div>
      <section className="customer-spend-summary" aria-label="Spending summary">
        <div className="customer-spend-heading">
          <div><strong>Grocery spending</strong><span>Recorded totals for collected orders</span></div>
          <div className="spend-period-toggle" role="group" aria-label="Spending period">
            <button type="button" aria-pressed={spendPeriod === 'week'} onClick={() => setSpendPeriod('week')}>This week</button>
            <button type="button" aria-pressed={spendPeriod === 'month'} onClick={() => setSpendPeriod('month')}>This month</button>
          </div>
        </div>
        {spendingLoading ? <p className="customer-spend-note">Loading spending summary…</p> : spendingError
          ? <p className="customer-spend-note" role="status">Could not load spending summary: {spendingError}</p>
          : <>
            <div className="customer-spend-total"><strong>{formatMoney(spending?.total || 0)}</strong><span>{spending?.orderCount || 0} collected {(spending?.orderCount || 0) === 1 ? 'order' : 'orders'} {spendPeriod === 'week' ? 'this week' : 'this month'}</span></div>
            {spending?.unpricedOrderCount > 0 && <p className="customer-spend-note">{spending.unpricedOrderCount} collected {spending.unpricedOrderCount === 1 ? 'order includes' : 'orders include'} an item whose price is not recorded; that amount is not included.</p>}
          </>}
      </section>
      {sortedOrders.length ? (
        <ul className="customer-order-list">
          {sortedOrders.map((order) => {
            const status = ORDER_STATUS[order.status] || ORDER_STATUS.pending
            return (
              <li key={order.id}>
                <div className="customer-order-top">
                  <strong>{order.id}</strong>
                  <span className={'status-pill status-' + status.className}>{status.label}</span>
                </div>
                <p className="customer-order-items">{order.items.map((item) => item.name + ' · ' + formatQuantity(item.quantity, item.unit)).join(', ')}</p>
                {order.status === 'ready' && /^\d{4}$/.test(String(order.pickupPin || '')) && <div className="customer-pickup-pin customer-history-pickup-pin"><span>Show this 4-digit PIN at pickup</span><strong>{order.pickupPin}</strong></div>}
                {order.discountAmount > 0 && <p className="customer-order-discount">{order.offerCode} saved {formatMoney(order.discountAmount)} on this order.</p>}
                <div className="customer-order-bottom">
                  <time dateTime={order.createdAt}>{formatReadyTime(order.createdAt)}</time>
                  <strong>{formatMoney(order.total)}</strong>
                </div>
                {order.status === 'ready' && order.shopkeeperRemoved && <p className="customer-order-expiry-note">The shopkeeper removed this uncollected order from their active list after 24 hours. You can now remove it from your history.</p>}
                {(order.status === 'collected' || (order.status === 'ready' && order.shopkeeperRemoved)) && (
                  <div className="customer-order-actions">
                    {order.status === 'collected' && (
                      <button className="customer-order-reorder" type="button" onClick={() => onReorderOrder(order)} aria-label={'Reorder ' + order.id}>
                        <RotateCcw size={15} />Order again
                      </button>
                    )}
                    <button className="customer-order-delete" type="button" onClick={() => onDeleteOrder(order.id)} disabled={deletingOrderId === order.id} aria-label={'Remove order ' + order.id + ' from customer history'}>
                      <Trash2 size={15} />{deletingOrderId === order.id ? 'Deleting…' : 'Remove from my history'}
                    </button>
                  </div>
                )}
                {order.status === 'collected' && (
                  <details className="digital-receipt">
                    <summary>View digital receipt</summary>
                    <div className="digital-receipt-body">
                      <div className="digital-receipt-heading"><div><strong>Mana Kirana</strong><span>Receipt · {order.id}</span></div><time>{formatReceiptDate(order.updatedAt || order.createdAt)}</time></div>
                      <ul className="digital-receipt-lines">
                        {order.items.map((item) => (
                          <li key={item.id || item.name}>
                            <div><strong>{item.name}</strong><span>{formatQuantity(item.quantity, item.unit)}{item.price == null ? '' : ' × ' + formatMoney(item.price)}</span></div>
                            <strong>{item.lineTotal == null ? 'Price pending at shop' : formatMoney(item.lineTotal)}</strong>
                          </li>
                        ))}
                      </ul>
                      <div className="digital-receipt-totals">
                        <div><span>Subtotal</span><strong>{formatMoney(order.subtotal ?? order.total)}</strong></div>
                        {order.discountAmount > 0 && <div><span>Discount {order.offerCode ? '(' + order.offerCode + ')' : ''}</span><strong>−{formatMoney(order.discountAmount)}</strong></div>}
                        <div><span>Order total</span><strong>{formatMoney(order.total)}</strong></div>
                      </div>
                      {order.items.some((item) => item.lineTotal == null) && <p className="customer-spend-note">Unpriced requests are not included in this confirmed total.</p>}
                      <button className="digital-receipt-share" type="button" onClick={() => shareReceipt(order)}>Share receipt</button>
                      <p className="digital-receipt-message" role="status">{receiptMessage}</p>
                    </div>
                  </details>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="customer-order-empty">Orders you place will appear here.</p>
      )}
      <p className="customer-order-note">You can remove collected orders from your history. If a Ready order is uncollected for 24 hours and the shopkeeper removes it from their active list, you can remove it too. Removing an order from your history does not erase its stored details.</p>
    </section>
  )
}
