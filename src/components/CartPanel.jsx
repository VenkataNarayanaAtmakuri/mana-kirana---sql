import { ShoppingBasket, Trash2 } from 'lucide-react'
import { formatMoney, formatQuantity, formatReadyTime } from '../data.js'
import { getQuantityOptions } from '../data.js'

export default function CartPanel({
  items,
  customItems,
  total,
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
  payment,
  onPaymentChange,
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
          <div className="bill-summary">
            <div><span>Confirmed items subtotal</span><strong>{formatMoney(total)}</strong></div>
            <div><span>Pickup</span><strong className="free-label">Free</strong></div>
            <div className="bill-total"><span>{customItems.length ? 'Confirmed amount' : 'Estimated total'}</span><strong>{formatMoney(total)}</strong></div>
            <p>{customItems.length ? 'Unlisted item prices are not included; settle the confirmed rate at the shop desk.' : 'Final weight of loose items may vary slightly at the store.'}</p>
          </div>
          {total <= minimumOrderValue && <p className="minimum-order-warning" role="status">Add priced items to exceed ₹{minimumOrderValue}. Unpriced requests do not count toward the minimum.</p>}
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
            <fieldset className="payment-options">
              <legend className="field-label">Payment <span>demo only</span></legend>
              <label className={`payment-option ${payment === 'pickup' ? 'selected' : ''}`}>
                <input type="radio" name="payment" value="pickup" checked={payment === 'pickup'} onChange={() => onPaymentChange('pickup')} />
                <span><strong>Pay at the shop</strong><small>Cash or UPI at pickup</small></span>
              </label>
              {customItems.length === 0 && <label className={`payment-option ${payment === 'upi' ? 'selected' : ''}`}>
                <input type="radio" name="payment" value="upi" checked={payment === 'upi'} onChange={() => onPaymentChange('upi')} />
                <span><strong>UPI payment</strong><small>No money is charged</small></span>
                <span className="demo-chip">DEMO</span>
              </label>}
            </fieldset>
            <button className="place-order-button" type="submit" disabled={total <= minimumOrderValue}>
              {total <= minimumOrderValue ? <>Minimum is above ₹{minimumOrderValue}</> : customItems.length ? <>{liveMode ? 'Place order' : 'Place demo order'} <span>{formatMoney(total)} confirmed + price pending</span></> : <>{liveMode ? 'Place order' : 'Place demo order'} <span>{formatMoney(total)}</span></>}
            </button>
            <p className="payment-footnote">{customItems.length ? 'Any requested-item amount is settled at the shop desk after its rate is confirmed.' : 'Demo payment only — no real payment is processed.'}</p>
          </form>
        </>
      )}
      <div className="persistence-note"><span>ⓘ</span> {liveMode ? 'Your account number is the required order contact. Add an alternate pickup number only if needed.' : 'Demo orders stay in this browser only. They are not shared across devices.'}</div>
    </section>
  )
}
