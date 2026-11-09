import { useState } from 'react'
import { formatMoney, formatQuantity, getQuantityOptions } from '../data.js'

export default function ProductCard({ product, quantity, onChange }) {
  const quantities = getQuantityOptions(product).filter((option) => !option.disabled)
  const [customAmount, setCustomAmount] = useState('')
  const available = Math.max(0, Number(product.stock) || 0)
  const selectedQuantity = Number(quantity) || 0
  const outOfStock = quantities.length === 0
  const customValue = Number(customAmount)
  const customQuantity = product.unit === 'kg' ? customValue / 1000 : customValue
  const customValid = Number.isFinite(customValue) && customValue > 0
    && (product.unit === 'kg' ? Number.isInteger(customValue) && customValue % 10 === 0 : Number.isInteger(customValue))
    && customQuantity <= available + 0.000001
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
          <div className="quantity-controls">
            <div className="quantity-quick-picks" aria-label={'Common amounts of ' + product.name}>
              {quantities.map((option) => <button className="quantity-quick-pick" key={option.value} type="button" aria-pressed={Math.abs(selectedQuantity - Number(option.value)) < 0.000001} onClick={() => onChange(Number(option.value))}>{option.label}</button>)}
            </div>
            <form className="custom-quantity-form" onSubmit={(event) => {
              event.preventDefault()
              if (customValid) { onChange(customQuantity); setCustomAmount('') }
            }}>
              <label className="quantity-picker">
                <span>{product.unit === 'kg' ? 'Or enter grams' : 'Or enter quantity'}</span>
                <input aria-label={product.unit === 'kg' ? 'Custom amount in grams for ' + product.name : 'Custom quantity for ' + product.name} type="number" min={product.unit === 'kg' ? '10' : '1'} max={product.unit === 'kg' ? Math.floor(available * 1000) : Math.floor(available)} step={product.unit === 'kg' ? '10' : '1'} inputMode="numeric" placeholder={product.unit === 'kg' ? 'e.g. 250 g' : 'e.g. 4'} value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} />
              </label>
              <button className="btn quantity-set-button" type="submit" disabled={!customValid}>Set amount</button>
            </form>
            <p className="quantity-stock-note">Available: {formatQuantity(available, product.unit)}</p>
            {selectedQuantity > 0 && <button className="quantity-clear-button" type="button" onClick={() => onChange(0)}>Remove</button>}
          </div>
        )}
        {selectedQuantity > 0 && <strong className="selected-total">{formatMoney(product.price * selectedQuantity)}</strong>}
      </div>
    </li>
  )
}
