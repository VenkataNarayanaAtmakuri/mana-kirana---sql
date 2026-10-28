import { useEffect, useMemo, useState } from 'react'
import { formatQuantity } from '../data.js'

function readLists(storageKey) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) || '[]')
    if (!Array.isArray(saved)) return []
    return saved.filter((list) => list && typeof list.id === 'string' && typeof list.name === 'string' && Array.isArray(list.items)).slice(0, 20)
  } catch {
    return []
  }
}

function combineItems(basketItems, selectedItems) {
  const combined = new Map()
  for (const item of [...basketItems, ...selectedItems]) {
    const productId = item.productId || item.id
    if (!productId || Number(item.quantity) <= 0) continue
    const existing = combined.get(productId)
    combined.set(productId, {
      productId,
      name: item.name,
      local: item.local || '',
      quantity: (existing?.quantity || 0) + Number(item.quantity),
      unit: item.unit,
    })
  }
  return [...combined.values()]
}

export default function SavedShoppingLists({ storageKey, items, products, onLoadItems }) {
  const [lists, setLists] = useState(() => readLists(storageKey))
  const [name, setName] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [draftItems, setDraftItems] = useState([])
  const [storageError, setStorageError] = useState('')
  const saveableItems = useMemo(() => combineItems(items, draftItems), [items, draftItems])
  const productResults = useMemo(() => {
    const query = productSearch.trim().toLocaleLowerCase()
    if (!query) return []
    return products.filter((product) => (product.name + ' ' + (product.local || '') + ' ' + (product.category || '')).toLocaleLowerCase().includes(query)).slice(0, 6)
  }, [productSearch, products])

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(lists))
      setStorageError('')
    } catch {
      setStorageError('Saved lists could not be stored in this browser.')
    }
  }, [lists, storageKey])

  function addProduct(product) {
    setDraftItems((current) => {
      const existing = current.find((item) => item.productId === product.id)
      if (existing) return current.map((item) => item.productId === product.id ? { ...item, quantity: Number(item.quantity) + 1 } : item)
      return [...current, { productId: product.id, name: product.name, local: product.local || '', quantity: 1, unit: product.unit }]
    })
  }

  function updateQuantity(productId, quantity) {
    const parsed = Number(quantity)
    if (!Number.isFinite(parsed) || parsed <= 0) return
    setDraftItems((current) => current.map((item) => item.productId === productId ? { ...item, quantity: parsed } : item))
  }

  function saveList(event) {
    event.preventDefault()
    const cleanedName = name.trim().slice(0, 50)
    if (!cleanedName || !saveableItems.length) return
    const newList = { id: String(Date.now()), name: cleanedName, items: saveableItems }
    setLists((current) => [newList, ...current].slice(0, 20))
    setName('')
    setDraftItems([])
    setProductSearch('')
  }

  function removeList(id) {
    setLists((current) => current.filter((list) => list.id !== id))
  }

  return (
    <section className="saved-shopping-lists" aria-label="Saved shopping lists">
      <div className="saved-shopping-heading">
        <div><h2>Saved shopping lists</h2><p>Create a list from your basket or build one here. Prices refresh from today’s catalogue.</p></div>
        <span>{lists.length} saved</span>
      </div>
      <div className="saved-list-builder">
        <label htmlFor="saved-list-product-search">Add catalogue items directly</label>
        <input id="saved-list-product-search" type="search" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Search products, for example rice" autoComplete="off" />
        {productSearch.trim() && <ul className="saved-list-product-results">
          {productResults.length ? productResults.map((product) => (
            <li key={product.id}><span><strong>{product.name}</strong>{product.local && <small lang="te">{product.local}</small>}<small>{formatQuantity(product.stock, product.unit)} available</small></span><button type="button" className="saved-list-add-item" onClick={() => addProduct(product)}>Add 1 {product.unit}</button></li>
          )) : <li className="saved-list-no-match">No catalogue item matches that search.</li>}
        </ul>}
      </div>
      {items.length > 0 && <p className="saved-list-basket-note">{items.length} basket {items.length === 1 ? 'item' : 'items'} will also be included in this list.</p>}
      {draftItems.length > 0 && <ul className="saved-list-draft-items" aria-label="Items added directly to this list">
        {draftItems.map((item) => {
          const product = products.find((entry) => entry.id === item.productId)
          return <li key={item.productId}><span><strong>{item.name}</strong>{item.local && <small lang="te">{item.local}</small>}</span><label><span>Quantity ({item.unit})</span><input type="number" min={product?.step || 1} step={product?.step || 1} value={item.quantity} onChange={(event) => updateQuantity(item.productId, event.target.value)} /></label><button type="button" className="saved-list-remove-item" onClick={() => setDraftItems((current) => current.filter((entry) => entry.productId !== item.productId))} aria-label={'Remove ' + item.name + ' from this list'}>Remove</button></li>
        })}
      </ul>}
      <form className="saved-list-form" onSubmit={saveList}>
        <label htmlFor="saved-list-name">Name this list</label>
        <div><input id="saved-list-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={50} placeholder="e.g. Weekly essentials" required /><button className="btn" type="submit" disabled={!saveableItems.length}>Save list</button></div>
        <small>{saveableItems.length ? 'Your basket and selected items will be saved.' : 'Add items to your basket or search the catalogue above to start a list.'}</small>
      </form>
      {storageError && <p className="saved-list-error" role="status">{storageError}</p>}
      {lists.length ? (
        <ul className="saved-list-items">
          {lists.map((list) => (
            <li key={list.id}>
              <div><strong>{list.name}</strong><span>{list.items.map((item) => item.name + ' · ' + formatQuantity(item.quantity, item.unit)).join(', ')}</span></div>
              <div className="saved-list-actions"><button type="button" className="saved-list-load" onClick={() => onLoadItems(list.items)}>Load list</button><button type="button" className="saved-list-remove" onClick={() => removeList(list.id)} aria-label={'Delete saved list ' + list.name}>Delete</button></div>
            </li>
          ))}
        </ul>
      ) : <p className="saved-list-empty">No lists saved yet.</p>}
    </section>
  )
}
