import { ShoppingBasket, Trash2 } from 'lucide-react'
import { formatMoney, formatQuantity, formatReadyTime } from '../data.js'
import { getQuantityOptions } from '../data.js'

export default function CartPanel({
  items,
  customItems,
  total,
  discountAmount = 0,
  discountedTotal = total,
  coupon = null,
  couponCode = '',
  couponError = '',
  couponBusy = false,
  onCouponCodeChange,
  onApplyCoupon,
  onRemoveCoupon,
  storeStatus = null,
  storeAcceptingOrders = true,
  onChange,
  onClear,
  onRemoveCustomItem,
  customerName,
  onNameChange,
  phone,
  onPhoneChange,
  accountPhone = '',
  alternatePickupPhone = '',
  onAlternatePickupPhoneChange,
  onSubmit,
  channelLabel,
  successOrderId,
  successOrder,
  minimumOrderValue,
  liveMode = false,
  className = '',
}) {
  return (
    <section className={`cart-panel ${className}`} aria-label="Your basket">
      <div className="cart-heading">
        <div>
          <p className="eyebrow">YOUR BASKET</p>
          <h2>Good things inside <span>🧺</span></h2>
        </div>
        {(items.length > 0 || customItems.length > 0) && (
          <button className="quiet-icon-button" type="button" onClick={onClear} aria-label="Clear basket" title="Clear basket">
            <Trash2 size={17} />
          </button>
        )}
      </div>
      <div className="cart-channel"><span className="channel-dot" />{channelLabel}</div>

      {successOrderId && (
        <div className="order-success" role="status">
          <span className="success-check">✓</span>
          <div>
            <strong>{successOrder?.status === 'rejected' ? 'Order declined' : 'Order received'}</strong>
            <span>Order {successOrderId}</span>
            {successOrder?.status !== 'rejected' && <span className="order-ready-message">Expected ready by {formatReadyTime(successOrder?.estimatedReadyAt)} · queue slot every 15 minutes.</span>}
            {successOrder?.status === 'ready' && /^\d{4}$/.test(String(successOrder.pickupPin || '')) && <div className="customer-pickup-pin"><span>Your 4-digit pickup PIN</span><strong>{successOrder.pickupPin}</strong><small>Show this code to the shopkeeper when collecting.</small></div>}
            <small>{liveMode ? 'Status changes also appear in your account messages.' : 'Order updates are shown here in this browser.'}</small>
          </div>
        </div>
      )}

      {items.length === 0 && customItems.length === 0 ? (
        <div className="empty-cart">
          <div className="empty-basket"><ShoppingBasket size={27} /></div>
          <strong>Your basket is waiting</strong>
          <span>Add a few fresh picks to get started.</span>
        </div>
      ) : (
        <>
          {items.length > 0 && <div className="cart-items">
            {items.map((item) => (
              <div className="cart-item" key={item.id}>
                <span className={`cart-item-emoji product-art-${item.tint}`} aria-hidden="true">{item.emoji}</span>
                <div className="cart-item-main">
                  <strong>{item.name}</strong>
                  <span>{formatQuantity(item.quantity, item.unit)}</span>
                </div>
                <div className="cart-item-end">
                  <strong>{formatMoney(item.price * item.quantity)}</strong>
                  <select className="mini-quantity-select" aria-label={`${item.name} quantity`} value={String(item.quantity)} onChange={(event) => onChange(item.id, Number(event.target.value) || 0)}>
                    <option value="0">Remove item</option>
                    {getQuantityOptions(item).map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>}
          {customItems.length > 0 && (
            <div className="requested-items">
              <div className="requested-items-heading"><strong>Unlisted requests</strong><span>Rate pending</span></div>
              {customItems.map((item) => (
                <div className="requested-item" key={item.id}>
                  <span className="requested-item-icon" aria-hidden="true">📝</span>
                  <div><strong>{item.name}</strong><span>{formatQuantity(item.quantity, item.unit)} · price pending</span></div>
                  <button className="quiet-icon-button" type="button" onClick={() => onRemoveCustomItem(item.id)} aria-label={'Remove ' + item.name + ' request'} title="Remove request"><Trash2 size={15} /></button>
                </div>
              ))}
              <p className="requested-items-note">The shopkeeper will confirm the rate. This amount is excluded from the subtotal above and is payable at the shop desk.</p>
            </div>
          )}
          {liveMode && <form className="offer-code-form" onSubmit={(event) => { event.preventDefault(); void onApplyCoupon?.() }}>
            <label htmlFor="checkout-offer-code">Offer code</label>
            <div><input id="checkout-offer-code" value={couponCode} onChange={(event) => onCouponCodeChange?.(event.target.value.toUpperCase())} maxLength={24} autoComplete="off" placeholder="e.g. SAVE10" /><button className="btn" type="submit" disabled={couponBusy || !couponCode.trim()}>{couponBusy ? 'Checking…' : coupon ? 'Reapply' : 'Apply'}</button></div>
            {couponError && <p className="offer-code-error" role="alert">{couponError}</p>}
            {coupon && <p className="offer-code-applied" role="status">{coupon.code} · {coupon.discountPercent}% off <button type="button" onClick={onRemoveCoupon}>Remove</button></p>}
          </form>}
          <div className="bill-summary">
            <div><span>Confirmed items subtotal</span><strong>{formatMoney(total)}</strong></div>
            {discountAmount > 0 && <div className="bill-discount"><span>Offer discount {coupon?.code ? '(' + coupon.code + ')' : ''}</span><strong>−{formatMoney(discountAmount)}</strong></div>}
            <div><span>Pickup</span><strong className="free-label">Free</strong></div>
            <div className="bill-total"><span>{customItems.length ? 'Confirmed amount' : 'Estimated total'}</span><strong>{formatMoney(discountedTotal)}</strong></div>
            <p>{customItems.length ? 'Unlisted item prices are not included; settle the confirmed rate at the shop desk.' : 'Final weight of loose items may vary slightly at the store.'}</p>
          </div>
          {coupon && total < coupon.minimumOrder && <p className="minimum-order-warning" role="status">Add items to reach this offer’s ₹{formatMoney(coupon.minimumOrder)} minimum basket.</p>}
          {discountedTotal < minimumOrderValue && <p className="minimum-order-warning" role="status">Add priced items to reach the ₹{minimumOrderValue} minimum. Unpriced requests do not count.</p>}
          <form className="checkout-form" onSubmit={onSubmit}>
            <label className="field-label" htmlFor="customer-name">Name for pickup</label>
            <input id="customer-name" autoComplete="name" value={customerName} onChange={(event) => onNameChange(event.target.value)} placeholder="e.g. Ananya Reddy" required />
            {liveMode ? (
              <>
                <p className="field-label">Required account mobile number</p>
                <div className="checkout-account-phone" role="group" aria-label="Required account mobile number">
                  <strong>{accountPhone || 'Sign in to continue'}</strong>
                  <span>{accountPhone ? 'Filled from your signed-in account' : 'Your account number is required to place an order.'}</span>
                </div>
              </>
            ) : (
              <>
                <label className="field-label" htmlFor="customer-phone">Mobile number</label>
                <input id="customer-phone" type="tel" inputMode="numeric" autoComplete="tel-national" value={phone} onChange={(event) => onPhoneChange(event.target.value)} placeholder="10-digit number" pattern="[6-9][0-9]{9}" maxLength={10} required />
              </>
            )}
            <label className="field-label" htmlFor="alternate-pickup-phone">Alternate pickup number <span className="optional-label">optional</span></label>
            <div className="checkout-phone-entry">
              <span aria-hidden="true">+91</span>
              <input id="alternate-pickup-phone" type="tel" inputMode="numeric" autoComplete="off" value={alternatePickupPhone} onChange={(event) => onAlternatePickupPhoneChange(event.target.value)} placeholder="10-digit number" pattern="[6-9][0-9]{9}" maxLength={10} title="Enter a valid 10-digit Indian mobile number" aria-describedby="alternate-pickup-hint" />
            </div>
            <p className="checkout-phone-hint" id="alternate-pickup-hint">Add this if someone else may collect the order. The shopkeeper can see both numbers.</p>
            {!storeAcceptingOrders && <p className="store-closed-checkout" role="status">{storeStatus?.message || 'The shop is not accepting orders right now.'}</p>}
            <button className="place-order-button" type="submit" disabled={discountedTotal < minimumOrderValue || !storeAcceptingOrders || (coupon && total < coupon.minimumOrder)}>
              {!storeAcceptingOrders ? 'Ordering is paused' : discountedTotal < minimumOrderValue ? <>Minimum is ₹{minimumOrderValue}</> : customItems.length ? <>{liveMode ? 'Place order' : 'Place demo order'} <span>{formatMoney(discountedTotal)} confirmed + price pending</span></> : <>{liveMode ? 'Place order' : 'Place demo order'} <span>{formatMoney(discountedTotal)}</span></>}
            </button>
            <p className="payment-footnote">{customItems.length ? 'The shopkeeper will confirm requested-item prices. Pay at the shop when collecting your groceries (cash or UPI).' : liveMode ? 'Pay at the shop when collecting your groceries (cash or UPI).' : 'Demo orders do not process payments. Live orders are paid for at the shop when collected.'}</p>
          </form>
        </>
      )}
      <div className="persistence-note"><span>ⓘ</span> {liveMode ? 'Your account number is the required order contact. Add an alternate pickup number only if needed.' : 'Demo orders stay in this browser only. They are not shared across devices.'}</div>
    </section>
  )
}
