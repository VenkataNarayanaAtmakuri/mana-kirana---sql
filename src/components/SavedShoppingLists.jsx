import { useEffect, useState } from 'react'
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

export default function SavedShoppingLists({ storageKey, items, onLoadItems }) {
  const [lists, setLists] = useState(() => readLists(storageKey))
  const [name, setName] = useState('')
  const [storageError, setStorageError] = useState('')

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(lists))
      setStorageError('')
    } catch {
      setStorageError('Saved lists could not be stored in this browser.')
    }
  }, [lists, storageKey])

  function saveList(event) {
    event.preventDefault()
    const cleanedName = name.trim().slice(0, 50)
    const savedItems = items.map((item) => ({
      productId: item.id,
      name: item.name,
      local: item.local || '',
      quantity: Number(item.quantity),
      unit: item.unit,
    })).filter((item) => item.productId && item.quantity > 0)
    if (!cleanedName || !savedItems.length) return
    const newList = { id: String(Date.now()), name: cleanedName, items: savedItems }
    setLists((current) => [newList, ...current].slice(0, 20))
    setName('')
  }

  function removeList(id) {
    setLists((current) => current.filter((list) => list.id !== id))
  }

  return (
    <section className="saved-shopping-lists" aria-label="Saved shopping lists">
      <div className="saved-shopping-heading">
        <div><h2>Saved shopping lists</h2><p>Keep a regular basket for next time. Prices refresh from today’s catalogue.</p></div>
        <span>{lists.length} saved</span>
      </div>
      <form className="saved-list-form" onSubmit={saveList}>
        <label htmlFor="saved-list-name">Save your current catalogue items</label>
        <div><input id="saved-list-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={50} placeholder="e.g. Weekly essentials" required /><button className="btn" type="submit" disabled={!items.length}>Save list</button></div>
        <small>Only catalogue items in your basket are saved. Requested items are not included.</small>
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
