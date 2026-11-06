import { formatMoney, formatQuantity, getQuantityOptions } from '../data.js'

export default function ProductCard({ product, quantity, onChange }) {
  const quantities = getQuantityOptions(product)
  const availableQuantities = quantities.filter((option) => !option.disabled)
  const outOfStock = availableQuantities.length === 0
  const step = Number(product.step) > 0 ? Number(product.step) : product.unit === 'kg' ? 0.5 : 1
  const selectedQuantity = Number(quantity) || 0
  const firstPick = availableQuantities.find((option) => Number(option.value) >= step - 0.000001)
    || availableQuantities[availableQuantities.length - 1]
  const nextPick = selectedQuantity > 0
    ? availableQuantities.find((option) => Number(option.value) >= selectedQuantity + step - 0.000001)
    : firstPick
  const tint = String(product.tint || 'default').replace(/[^a-z0-9-]/gi, '') || 'default'

  return (
    <li className={'item' + (selectedQuantity > 0 ? ' is-selected' : '')}>
      <div className={'product-art product-art-' + tint} aria-hidden="true">{product.emoji || '🛍️'}</div>
      <div className="info">
        <div className="nm">
          <strong className="product-name">{product.name}</strong>
          {product.local && <span lang="te">{product.local}</span>}
        </div>
        {product.note && <span className="product-note">{product.note}</span>}
        <div className="rate">{formatMoney(product.price)} <span>/ {product.unit}</span></div>
      </div>
      <div className="ctl">
        {outOfStock ? <span className="badge b-warn">Out of stock</span> : (
          <>
            <label className="quantity-picker">
              <span>{product.unit === 'kg' ? 'Weight' : 'Quantity'}</span>
              <select aria-label={'Quantity for ' + product.name} value={selectedQuantity > 0 ? String(selectedQuantity) : ''} onChange={(event) => onChange(Number(event.target.value) || 0)}>
                <option value="">Choose quantity</option>
                {quantities.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
              </select>
            </label>
            <button
              className="add-to-basket-button"
              type="button"
              disabled={!nextPick}
              onClick={() => { if (nextPick) onChange(Number(nextPick.value)) }}
              aria-label={nextPick ? 'Add ' + formatQuantity(nextPick.value, product.unit) + ' of ' + product.name + ' to basket' : 'No more ' + product.name + ' available'}
            >
              <span aria-hidden="true">+</span>{selectedQuantity > 0 ? 'Add more' : 'Add to basket'}
            </button>
          </>
        )}
        {selectedQuantity > 0 && <strong className="selected-total">{formatMoney(product.price * selectedQuantity)}</strong>}
      </div>
    </li>
  )
}
