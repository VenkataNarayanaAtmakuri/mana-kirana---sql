import { RotateCcw, Trash2 } from 'lucide-react'
import { formatMoney, formatQuantity, formatReadyTime } from '../data.js'

const ORDER_STATUS = {
  pending: { label: 'Order received', className: 'pending' },
  preparing: { label: 'Being prepared', className: 'preparing' },
  ready: { label: 'Ready for pickup', className: 'ready' },
  collected: { label: 'Collected', className: 'collected' },
  rejected: { label: 'Declined', className: 'rejected' },
}

export default function CustomerOrderHistory({ orders, onDeleteOrder, deletingOrderId, onReorderOrder }) {
  const sortedOrders = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  return (
    <section className="customer-order-history" aria-label="Your orders">
      <div className="customer-order-history-heading">
        <div><h2>Your orders</h2><span>Orders from this account</span></div>
        <span>{orders.length} {orders.length === 1 ? 'order' : 'orders'}</span>
      </div>
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
