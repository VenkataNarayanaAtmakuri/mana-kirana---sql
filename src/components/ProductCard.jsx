import { useEffect, useState } from 'react'
import { formatMoney, getQuantityOptions } from '../data.js'

export default function ProductCard({ product, quantity, onChange }) {
  const quantities = getQuantityOptions(product).filter((option) => !option.disabled)
  const [customAmount, setCustomAmount] = useState('')
  const [customUnit, setCustomUnit] = useState('g')
  const [imageFailed, setImageFailed] = useState(false)
  useEffect(() => setImageFailed(false), [product.imageUrl])
  const stockKnown = product.stock !== null && product.stock !== undefined && Number.isFinite(Number(product.stock))
  const available = stockKnown ? Math.max(0, Number(product.stock) || 0) : 100
  const selectedQuantity = Number(quantity) || 0
  const outOfStock = stockKnown ? quantities.length === 0 : product.inStock !== true
  const customValue = Number(customAmount)
  const isLooseProduct = product.unit === 'kg'
  const customQuantity = isLooseProduct ? customValue / (customUnit === 'kg' ? 1 : 1000) : customValue
  const customValid = Number.isFinite(customValue) && customValue > 0
    && (isLooseProduct
      ? customUnit === 'kg'
        ? Math.abs(customValue * 100 - Math.round(customValue * 100)) < 0.000001
        : Number.isInteger(customValue) && customValue % 10 === 0
      : Number.isInteger(customValue))
    && customQuantity <= available + 0.000001
  const tint = String(product.tint || 'default').replace(/[^a-z0-9-]/gi, '') || 'default'

  return (
    <li className={'item' + (selectedQuantity > 0 ? ' is-selected' : '')}>
      <div className={'product-art product-art-' + tint}>{product.imageUrl && !imageFailed ? <img className="product-photo" src={product.imageUrl} alt={product.name} loading="lazy" onError={() => setImageFailed(true)} /> : <span aria-hidden="true">{product.emoji || '🛍️'}</span>}</div>
      <div className="info">
        <div className="nm">
          <strong className="product-name">{product.name}</strong>
          {product.local && <span lang="te">{product.local}</span>}
        </div>
        {product.note && <span className="product-note">{product.note}</span>}
        <div className="rate">{formatMoney(product.price)} <span>/ {product.unit}</span></div>
      </div>
      <div className="ctl">
        {outOfStock ? <div className="quantity-controls quantity-unavailable"><span className="badge b-warn" role="status">Out of stock</span></div> : (
          <div className="quantity-controls">
            <div className="quantity-quick-picks" aria-label={'Common amounts of ' + product.name}>
              {quantities.map((option) => <button className="quantity-quick-pick" key={option.value} type="button" aria-pressed={Math.abs(selectedQuantity - Number(option.value)) < 0.000001} onClick={() => onChange(Number(option.value))}>{option.label}</button>)}
            </div>
            <form className="custom-quantity-form" onSubmit={(event) => {
              event.preventDefault()
              if (customValid) { onChange(customQuantity); setCustomAmount('') }
            }}>
              <div className="custom-amount-entry">
                <label className="quantity-picker">
                  <span>{isLooseProduct ? 'Custom amount' : 'Custom quantity'}</span>
                  <input aria-label={isLooseProduct ? 'Custom amount for ' + product.name : 'Custom quantity for ' + product.name} type="number" min={isLooseProduct ? customUnit === 'kg' ? '0.01' : '10' : '1'} max={isLooseProduct ? customUnit === 'kg' ? available : Math.floor(available * 1000) : Math.floor(available)} step={isLooseProduct ? customUnit === 'kg' ? '0.01' : '10' : '1'} inputMode={isLooseProduct && customUnit === 'kg' ? 'decimal' : 'numeric'} placeholder={isLooseProduct ? customUnit === 'kg' ? 'e.g. 1.5' : 'e.g. 250' : 'e.g. 4'} value={customAmount} onChange={(event) => setCustomAmount(event.target.value)} />
                </label>
                {isLooseProduct && <select className="custom-quantity-unit" aria-label={'Custom amount unit for ' + product.name} value={customUnit} onChange={(event) => setCustomUnit(event.target.value)}><option value="g">g</option><option value="kg">kg</option></select>}
              </div>
              <button className="btn quantity-set-button" type="submit" disabled={!customValid}>Set amount</button>
            </form>
            {selectedQuantity > 0 && <button className="quantity-clear-button" type="button" onClick={() => onChange(0)}>Remove</button>}
          </div>
        )}
        {selectedQuantity > 0 && <strong className="selected-total">{formatMoney(product.price * selectedQuantity)}</strong>}
      </div>
    </li>
  )
}
