import { formatMoney } from '../data.js'
import { getQuantityOptions } from '../data.js'

export default function ProductCard({ product, quantity, onChange }) {
  const quantities = getQuantityOptions(product)
  const outOfStock = quantities.every((option) => option.disabled)

  return (
    <li className="item">
      <div className="info">
        <div className="nm">{product.name}<span lang="te">{product.local}</span></div>
        <div className="rate">{formatMoney(product.price)} / {product.unit}</div>
      </div>
      <div className="ctl">
        {outOfStock ? <span className="badge b-warn">Out of stock</span> : null}
        {!outOfStock && <label className="quantity-picker"><span>{product.unit === 'kg' ? 'Weight' : 'Quantity'}</span><select aria-label={'Quantity for ' + product.name} value={quantity > 0 ? String(quantity) : ''} onChange={(event) => onChange(Number(event.target.value) || 0)}>
          <option value="">Choose quantity</option>
          {quantities.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
        </select></label>}
        {quantity > 0 && <strong className="selected-total">{formatMoney(product.price * quantity)}</strong>}
      </div>
    </li>
  )
}
