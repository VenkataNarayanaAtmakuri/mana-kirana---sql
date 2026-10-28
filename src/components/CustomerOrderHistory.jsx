import { Trash2 } from 'lucide-react'
import { formatMoney, formatQuantity, formatReadyTime } from '../data.js'

const ORDER_STATUS = {
  pending: { label: 'Order received', className: 'pending' },
  preparing: { label: 'Being prepared', className: 'preparing' },
  ready: { label: 'Ready for pickup', className: 'ready' },
  collected: { label: 'Collected', className: 'collected' },
  rejected: { label: 'Declined', className: 'rejected' },
}

export default function CustomerOrderHistory({ orders, onDeleteOrder, deletingOrderId }) {
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
                <div className="customer-order-bottom">
                  <time dateTime={order.createdAt}>{formatReadyTime(order.createdAt)}</time>
                  <strong>{formatMoney(order.total)}</strong>
                </div>
                {order.status === 'collected' && (
                  <button className="customer-order-delete" type="button" onClick={() => onDeleteOrder(order.id)} disabled={deletingOrderId === order.id} aria-label={'Delete collected order ' + order.id}>
                    <Trash2 size={15} />{deletingOrderId === order.id ? 'Deleting…' : 'Delete order'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="customer-order-empty">Orders you place will appear here.</p>
      )}
      <p className="customer-order-note">Delete is available after collection. Removing an order also removes its item details and updates from both views.</p>
    </section>
  )
}
