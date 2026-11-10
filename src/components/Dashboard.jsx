import { ArrowDownToLine, Check, CheckCircle2, Clock3, ClipboardList, Mic, MicOff, PackageCheck, Plus, Save, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import OrderNotificationControl from './OrderNotificationControl.jsx'
import { formatMoney, formatQuantity, formatReadyTime, orderChannelLabel } from '../data.js'
import { useVoiceRecognition } from '../lib/useVoiceRecognition.js'

const FILTERS = [
  { id: 'all', label: 'All orders' },
  { id: 'pending', label: 'Needs action' },
  { id: 'preparing', label: 'Preparing' },
  { id: 'ready', label: 'Ready' },
]

const STATUS_META = {
  pending: { label: 'New order', className: 'pending', icon: Clock3 },
  preparing: { label: 'Preparing', className: 'preparing', icon: PackageCheck },
  ready: { label: 'Ready for pickup', className: 'ready', icon: CheckCircle2 },
  collected: { label: 'Collected', className: 'collected', icon: Check },
  rejected: { label: 'Declined', className: 'rejected', icon: X },
}

function timeLabel(timestamp) {
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp))
}

function readyDeleteAvailability(order) {
  const readyAt = Date.parse(order.readyAt || '')
  if (!Number.isFinite(readyAt)) return { enabled: false, label: 'Delete available 24 hours after ready' }
  const remainingMinutes = Math.ceil((readyAt + 24 * 60 * 60 * 1000 - Date.now()) / 60000)
  if (remainingMinutes <= 0) return { enabled: true, label: 'Delete from admin list' }
  const hours = Math.floor(remainingMinutes / 60)
  const minutes = remainingMinutes % 60
  return { enabled: false, label: 'Delete available in ' + hours + 'h ' + String(minutes).padStart(2, '0') + 'm' }
}

function VoiceDictationButton({ language, onTranscript, label = 'Speak' }) {
  const { listening, message, supported, toggle } = useVoiceRecognition({ language, onTranscript })

  return (
    <div className="inventory-voice-control">
      <button className="inventory-voice-button" type="button" onClick={toggle} aria-pressed={listening} aria-label={listening ? 'Stop voice input' : label} title={listening ? 'Stop listening' : supported ? label : 'Voice recognition may not be available in this browser'}>
        {listening ? <MicOff size={15} aria-hidden="true" /> : <Mic size={15} aria-hidden="true" />}
        <span>{listening ? 'Stop' : label}</span>
      </button>
      {message && <small className="inventory-voice-message" data-listening={listening ? 'true' : 'false'} role="status" aria-live="polite" aria-atomic="true">{message}</small>}
    </div>
  )
}

function RequestedItemRate({ order, item, onSetRate }) {
  const [rate, setRate] = useState('')
  useEffect(() => setRate(item.price == null ? '' : String(item.price)), [item.price])
  if (item.priced) return null

  function submit(event) {
    event.preventDefault()
    const parsed = Number(rate)
    if (Number.isFinite(parsed) && parsed > 0) onSetRate(order.id, item.productId, parsed)
  }

  return (
    <form className="set-request-rate" onSubmit={submit}>
      <label><span>Rate per {item.unit} · ₹</span><input type="number" min="0.01" step="0.01" value={rate} onChange={(event) => setRate(event.target.value)} placeholder="Set rate" required /></label>
      <button className="btn primary" type="submit">Confirm rate</button>
    </form>
  )
}

function OrderCard({ order, onUpdate, onDeleteOrder, deletingOrderId, onSetRequestedItemRate, liveMode }) {
  const [pickupPin, setPickupPin] = useState('')
  const meta = STATUS_META[order.status] || STATUS_META.pending
  const StatusIcon = meta.icon
  const primaryAction = order.status === 'pending'
    ? { label: 'Accept order', icon: Check, next: 'preparing' }
    : order.status === 'preparing'
      ? { label: 'Mark ready', icon: PackageCheck, next: 'ready' }
      : order.status === 'ready'
        ? { label: 'Mark collected', icon: ArrowDownToLine, next: 'collected' }
        : null
  const unpricedCount = order.items.filter((item) => item.custom && !item.priced).length
  const readyDelete = order.status === 'ready' && liveMode ? readyDeleteAvailability(order) : null

  return (
    <article className={`order-card ${order.status === 'pending' ? 'order-card-new' : ''}`}>
      <div className="order-card-top">
        <div className="order-customer">
          <span className="customer-avatar">{order.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
          <div><strong>{order.name}</strong><span>Account · {order.phone}</span>{order.pickupPhone && <span>Pickup · {order.pickupPhone}</span>}<span>{timeLabel(order.createdAt)}</span></div>
        </div>
        <span className={`status-pill status-${meta.className}`}><StatusIcon size={13} />{meta.label}</span>
      </div>
      <div className="order-meta-row">
        <span className="order-id">{order.id}{order.sample && <i>Sample</i>}</span>
        <span className={`channel-pill channel-${order.channel}`}>{orderChannelLabel(order.channel)}</span>
      </div>
      {order.estimatedReadyAt && order.status !== 'rejected' && <div className="order-eta"><Clock3 size={14} /><span>Expected ready by <strong>{formatReadyTime(order.estimatedReadyAt)}</strong></span><small>15-minute queue slot</small></div>}
      <div className="order-lines">
        {order.items.map((item, index) => (
          <div className={`order-line ${item.custom ? 'requested-order-line' : ''}`} key={`${item.productId}-${index}`}>
            <span className="order-line-emoji" aria-hidden="true">{item.emoji}</span>
            <span>{item.name}</span>
            <span className="order-line-quantity">{formatQuantity(item.quantity, item.unit)}{item.custom && item.priced ? ' · ' + formatMoney(item.price) + '/' + item.unit : ''}</span>
            <strong>{item.custom && !item.priced ? <em className="rate-pending">Price pending</em> : formatMoney(item.lineTotal)}</strong>
            {item.custom && !item.priced && <RequestedItemRate order={order} item={item} onSetRate={onSetRequestedItemRate} />}
          </div>
        ))}
      </div>
      {order.status === 'ready' && liveMode && (
        <form className="pickup-pin-form" onSubmit={(event) => { event.preventDefault(); if (/^\d{4}$/.test(pickupPin)) onUpdate(order.id, 'collected', pickupPin) }}>
          <label htmlFor={'pickup-pin-' + order.dbId}>Customer’s 4-digit pickup PIN</label>
          <div><input id={'pickup-pin-' + order.dbId} type="text" inputMode="numeric" autoComplete="off" pattern="[0-9]{4}" maxLength={4} value={pickupPin} onChange={(event) => setPickupPin(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="0000" aria-label={'Four-digit pickup PIN for ' + order.id} required /><button className="advance-button" type="submit" disabled={!/^\d{4}$/.test(pickupPin)}><ArrowDownToLine size={15} />Verify & collect</button></div>
        </form>
      )}
      <div className="order-card-bottom">
        <div><span>{order.payment}</span><strong>{formatMoney(order.total)}</strong>{order.discountAmount > 0 && <small className="order-total-note">Subtotal {formatMoney(order.subtotal)} · offer {order.offerCode} saved {formatMoney(order.discountAmount)}</small>}{unpricedCount > 0 && <small className="order-total-note">Confirmed subtotal · {unpricedCount} requested {unpricedCount === 1 ? 'item' : 'items'} awaiting rate</small>}</div>
        {(primaryAction || order.status === 'collected') && (
          <div className="order-actions">
            {primaryAction && (order.status !== 'ready' || !liveMode) && (
              <>
                {order.status === 'pending' && (
                  <button className="reject-button" type="button" onClick={() => onUpdate(order.id, 'rejected')}><X size={15} /> Decline</button>
                )}
                <button className="advance-button" type="button" onClick={() => onUpdate(order.id, primaryAction.next)}>
                  <primaryAction.icon size={15} />{primaryAction.label}
                </button>
              </>
            )}
            {order.status === 'collected' && (
              <button className="reject-button" type="button" onClick={() => onDeleteOrder(order.id)} disabled={deletingOrderId === order.id}>
                <Trash2 size={15} />{deletingOrderId === order.id ? 'Deleting…' : 'Remove from my history'}
              </button>
            )}
            {readyDelete && (
              <button
                className="reject-button"
                type="button"
                onClick={() => onDeleteOrder(order.id)}
                disabled={!readyDelete.enabled || deletingOrderId === order.id}
                aria-label={readyDelete.enabled ? 'Remove overdue order ' + order.id + ' from admin history' : readyDelete.label}
                title={readyDelete.enabled ? 'The customer can remove this order from their history afterward.' : 'Available 24 hours after the order was marked ready.'}
              >
                <Trash2 size={15} />{deletingOrderId === order.id ? 'Deleting…' : readyDelete.label}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

function InventoryRow({ product, onSave, onRemove, onUploadImage, onRemoveImage }) {
  const [price, setPrice] = useState(String(product.price))
  const [stock, setStock] = useState(String(product.stock))
  const [expiresOn, setExpiresOn] = useState(product.expiresOn || '')
  const [imageBusy, setImageBusy] = useState(false)
  const [imageError, setImageError] = useState('')
  const changed = Number(price) !== product.price || Number(stock) !== product.stock || expiresOn !== (product.expiresOn || '')

  useEffect(() => {
    setPrice(String(product.price))
    setStock(String(product.stock))
    setExpiresOn(product.expiresOn || '')
  }, [product.price, product.stock, product.expiresOn])

  function save(event) {
    event.preventDefault()
    const nextPrice = Number(price)
    const nextStock = Number(stock)
    if (!Number.isFinite(nextPrice) || nextPrice <= 0 || !Number.isFinite(nextStock) || nextStock < 0) return
    onSave(product.id, { price: nextPrice, stock: nextStock, expiresOn: expiresOn || null })
  }

  async function uploadImage(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImageError('')
    setImageBusy(true)
    try {
      const saved = await onUploadImage(product.id, file)
      if (saved === false) setImageError('Upload failed. Choose a JPG, PNG, or WebP image and try again.')
    } catch (error) {
      setImageError(error.message || 'Could not upload this image.')
    } finally { setImageBusy(false) }
  }

  async function removeImage() {
    setImageBusy(true)
    setImageError('')
    try {
      const removed = await onRemoveImage(product.id)
      if (removed === false) setImageError('Could not remove this photo. Try again.')
    } catch (error) {
      setImageError(error.message || 'Could not remove this photo.')
    } finally { setImageBusy(false) }
  }

  return (
    <form className="inventory-row" onSubmit={save}>
      <div className="inventory-product">
        <div className="inventory-photo-preview">
          {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <span aria-hidden="true">{product.emoji || '🛍️'}</span>}
        </div>
        <div className="inventory-product-copy">
          <strong>{product.name}</strong>
          {product.local && <span lang="te">{product.local}</span>}
          <small>{product.category} · price per {product.unit}</small>
        </div>
        <div className="inventory-photo-actions">
          <label className="inventory-image-upload">
            <span>{imageBusy ? 'Uploading…' : product.imageUrl ? 'Change photo' : 'Upload photo'}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={'Upload a product photo for ' + product.name} disabled={imageBusy} onChange={uploadImage} />
          </label>
          {product.imageUrl && <button className="inventory-image-remove" type="button" disabled={imageBusy} onClick={removeImage}>Remove photo</button>}
          {imageError && <small className="inventory-image-error" role="alert">{imageError}</small>}
        </div>
      </div>
      <label className="inventory-field">
        <span>Rate · ₹</span>
        <input type="number" min="1" step="1" value={price} onChange={(event) => setPrice(event.target.value)} aria-label={'Rate for ' + product.name} required />
      </label>
      <label className="inventory-field stock-field">
        <span>In stock · {product.unit}</span>
        <input type="number" min="0" step={product.unit === 'kg' ? '0.01' : 1} value={stock} onChange={(event) => setStock(event.target.value)} aria-label={'Stock quantity for ' + product.name} required />
      </label>
      <label className="inventory-field expiry-field">
        <span>Expires on</span>
        <input type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} aria-label={'Expiry date for ' + product.name} />
      </label>
      <div className="inventory-actions">
        <button className="btn inventory-save" type="submit" disabled={!changed}><Save size={15} />Save</button>
        <button className="btn inventory-remove" type="button" onClick={() => onRemove(product.id)} aria-label={'Remove ' + product.name} title="Remove from customer catalogue"><Trash2 size={15} /><span>Remove</span></button>
      </div>
    </form>
  )
}

const STARTER_GROCERIES = [
  { name: 'Moong Dal', local: 'పెసరపప్పు', category: 'Grains', unit: 'kg' },
  { name: 'Chana Dal', local: 'శెనగపప్పు', category: 'Grains', unit: 'kg' },
  { name: 'Chickpeas', local: 'శనగలు', category: 'Grains', unit: 'kg' },
  { name: 'Wheat Flour (Atta)', local: 'గోధుమ పిండి', aliases: ['Whole wheat atta'], category: 'Grains', unit: 'kg' },
  { name: 'Ragi Flour', local: 'రాగి పిండి', category: 'Grains', unit: 'kg' },
  { name: 'Iodized Salt (1 kg pack)', local: 'ఉప్పు', category: 'Packaged', unit: 'pack' },
  { name: 'Tea Powder (250 g pack)', local: 'టీ పొడి', category: 'Packaged', unit: 'pack' },
]

function AddProductForm({ categories, products = [], onAddProduct }) {
  const [name, setName] = useState('')
  const [local, setLocal] = useState('')
  const [category, setCategory] = useState(categories[0] || '')
  const [unit, setUnit] = useState('kg')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [expiresOn, setExpiresOn] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!categories.includes(category)) setCategory(categories[0] || '')
  }, [categories, category])

  function chooseStarter(item) {
    const matchingCategory = categories.find((candidate) => candidate.toLocaleLowerCase() === item.category.toLocaleLowerCase())
      || categories.find((candidate) => candidate.toLocaleLowerCase() === 'other')
      || categories[0] || ''
    setName(item.name)
    setLocal(item.local)
    setCategory(matchingCategory)
    setUnit(item.unit)
    setPrice('')
    setStock('')
    setExpiresOn('')
    setError('')
  }

  async function submit(event) {
    event.preventDefault()
    const parsedPrice = Number(price)
    const parsedStock = Number(stock)
    if (!name.trim() || !category.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0 || !Number.isFinite(parsedStock) || parsedStock < 0) {
      setError('Enter an item name, category, positive rate, and stock quantity.')
      return
    }
    const saved = await onAddProduct({ name: name.trim(), local: local.trim(), category: category.trim(), unit, price: parsedPrice, stock: parsedStock, expiresOn: expiresOn || null })
    if (saved === false) return
    setName('')
    setLocal('')
    setPrice('')
    setStock('')
    setExpiresOn('')
    setError('')
  }

  return (
    <form className="add-product-form" onSubmit={submit}>
      <div className="add-product-heading"><div><h3>Add a catalogue item</h3><p>Speak the item name in English and the optional local name in Telugu.</p></div><span className="add-product-icon"><Plus size={18} /></span></div>
      <div className="starter-grocery-panel">
        <strong>Quick-add common groceries</strong>
        <p>Choose a starter, then enter your current local rate and stock before saving.</p>
        <div className="starter-grocery-list">{STARTER_GROCERIES.filter((item) => !products.some((product) => {
          const existing = String(product.name || '').toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
          const candidates = [item.name, ...(item.aliases || [])].map((value) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
          return candidates.some((candidate) => candidate && existing === candidate)
        })).map((item) => <button type="button" key={item.name} onClick={() => chooseStarter(item)}>{item.name} <span lang="te">{item.local}</span></button>)}</div>
      </div>
      <div className="add-product-fields">
        <label className="catalogue-voice-field"><span>Item name <small>English</small></span><div className="inventory-voice-entry"><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Moong dal" required /><VoiceDictationButton language="en-IN" onTranscript={setName} label="Speak English" /></div></label>
        <label className="catalogue-voice-field"><span>Telugu name <small>optional</small></span><div className="inventory-voice-entry"><input value={local} onChange={(event) => setLocal(event.target.value)} placeholder="స్థానిక పేరు" /><VoiceDictationButton language="te-IN" onTranscript={setLocal} label="తెలుగులో చెప్పండి" /></div></label>
        <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)} required><option value="" disabled>Choose a category</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span>Sold as</span><select value={unit} onChange={(event) => setUnit(event.target.value)}><option value="kg">Loose · kg</option><option value="pack">Pack</option><option value="dozen">Dozen</option><option value="500 g">500 g pack</option><option value="500 ml">500 ml pack</option><option value="200 g">200 g pack</option><option value="100 g">100 g pack</option></select></label>
        <label><span>Rate · ₹ / {unit}</span><input type="number" min="1" step="1" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" required /></label>
        <label><span>Opening stock · {unit}</span><input type="number" min="0" step={unit === 'kg' ? '0.01' : '1'} inputMode="decimal" value={stock} onChange={(event) => setStock(event.target.value)} placeholder="0" required /></label>
        <label><span>Expiry date <small>optional</small></span><input type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} /></label>
      </div>
      {error && <p className="inventory-error" role="alert">{error}</p>}
      <div className="add-product-actions"><small>Loose item stock can be recorded in 10 g increments.</small><button className="btn primary" type="submit"><Plus size={16} />Add item</button></div>
    </form>
  )
}

function readLowStockThreshold() {
  try {
    const saved = Number(window.localStorage.getItem('mana-kirana-low-stock-threshold:v1'))
    return Number.isFinite(saved) && saved >= 0 && saved <= 10000 ? saved : 5
  } catch {
    return 5
  }
}

function LowStockAlerts({ products }) {
  const [threshold, setThreshold] = useState(readLowStockThreshold)
  const lowStock = useMemo(() => products.filter((product) => Number(product.stock) <= threshold).sort((a, b) => a.stock - b.stock), [products, threshold])

  useEffect(() => {
    try { window.localStorage.setItem('mana-kirana-low-stock-threshold:v1', String(threshold)) } catch { /* The alert still works for this session. */ }
  }, [threshold])

  return (
    <section className="low-stock-panel" aria-label="Low-stock alerts">
      <div className="low-stock-heading"><div><h3>Low-stock alerts <span>{lowStock.length}</span></h3><p>Items at or below their selling-unit alert level.</p></div><label>Alert at or below<input aria-label="Low stock threshold" type="number" min="0" max="10000" step="0.5" value={threshold} onChange={(event) => setThreshold(Math.max(0, Number(event.target.value) || 0))} /></label></div>
      {lowStock.length ? <ul>{lowStock.map((product) => <li key={product.id}><span><strong>{product.name}</strong>{product.local && <small lang="te">{product.local}</small>}</span><b>{formatQuantity(product.stock, product.unit)} left</b></li>)}</ul> : <p className="low-stock-clear">All catalogue items are above the alert level.</p>}
    </section>
  )
}

function indiaDate(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const part = (type) => parts.find((item) => item.type === type)?.value || ''
  return part('year') + '-' + part('month') + '-' + part('day')
}

function makeDemoSalesReport(orders, date) {
  const collected = orders.filter((order) => order.status === 'collected' && indiaDate(order.updatedAt || order.createdAt) === date)
  const itemTotals = new Map()
  for (const order of collected) {
    for (const item of order.items || []) {
      if (item.custom || item.lineTotal == null) continue
      const key = item.name + '|' + item.unit
      const current = itemTotals.get(key) || { name: item.name, unit: item.unit, quantity: 0, total: 0 }
      current.quantity += Number(item.quantity) || 0
      current.total += Number(item.lineTotal) || 0
      itemTotals.set(key, current)
    }
  }
  return { date, orderCount: collected.length, total: collected.reduce((sum, order) => sum + (Number(order.total) || 0), 0), topItems: [...itemTotals.values()].sort((a, b) => b.total - a.total).slice(0, 5) }
}

function DailySalesPanel({ orders, liveMode, onLoadDailySales, onExportReport }) {
  const [date, setDate] = useState(() => indiaDate(new Date()))
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const demoReport = useMemo(() => makeDemoSalesReport(orders, date), [orders, date])

  useEffect(() => {
    if (!liveMode) { setReport(null); setError(''); setLoading(false); return undefined }
    let active = true
    setLoading(true)
    setError('')
    onLoadDailySales(date).then((result) => { if (active) setReport(result) }).catch((loadError) => { if (active) setError(loadError.message || 'Could not load sales for this date.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [date, liveMode, onLoadDailySales])

  const visibleReport = liveMode ? report : demoReport
  return (
    <section className="daily-sales-section" aria-label="Daily sales summary">
      <div className="orders-section-heading"><div><h2>Daily sales</h2><span>Orders marked collected on the selected date · India time</span></div><label htmlFor="daily-sales-date">Report date<input id="daily-sales-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>{liveMode && <button className="btn csv-export-button" type="button" onClick={() => onExportReport('sales', date)}>Download sales CSV</button>}</div>
      {loading && <p className="daily-sales-status">Loading the sales summary…</p>}
      {error && <p className="daily-sales-error" role="alert">{error}</p>}
      {!loading && !error && visibleReport && <>
        <div className="daily-sales-stats"><article><span>Collected orders</span><strong>{visibleReport.orderCount}</strong></article><article><span>Sales total</span><strong>{formatMoney(visibleReport.total)}</strong></article></div>
        <div className="daily-sales-items"><h3>Top items</h3>{visibleReport.topItems?.length ? <ul>{visibleReport.topItems.map((item) => <li key={item.name + item.unit}><span>{item.name}</span><span>{formatQuantity(item.quantity, item.unit)} · {formatMoney(item.total)}</span></li>)}</ul> : <p>No collected item sales for this date.</p>}</div>
      </>}
      <p className="daily-sales-note">This summary uses the date an order was marked collected. Sample dashboard totals are calculated in this browser.</p>
    </section>
  )
}


function ExpiryAlerts({ products }) {
  const today = indiaDate(new Date())
  const todayTime = new Date(today + 'T00:00:00.000Z').getTime()
  const alerts = products.filter((product) => product.expiresOn).map((product) => {
    const expiryTime = new Date(product.expiresOn + 'T00:00:00.000Z').getTime()
    return { ...product, daysLeft: Math.round((expiryTime - todayTime) / 86400000) }
  }).filter((product) => product.daysLeft <= 30).sort((a, b) => a.daysLeft - b.daysLeft)
  return (
    <section className="expiry-alert-panel" aria-label="Expiry alerts">
      <div className="expiry-alert-heading"><div><h3>Expiry alerts <span>{alerts.length}</span></h3><p>Products expiring in the next 30 days or already expired.</p></div></div>
      {alerts.length ? <ul>{alerts.map((product) => <li key={product.id}><span><strong>{product.name}</strong><small>{product.daysLeft < 0 ? 'Expired ' + Math.abs(product.daysLeft) + ' days ago' : product.daysLeft === 0 ? 'Expires today' : 'Expires in ' + product.daysLeft + ' days'} · {product.expiresOn}</small></span><b className={product.daysLeft < 0 ? 'expiry-danger' : ''}>{formatQuantity(product.stock, product.unit)} in stock</b></li>)}</ul> : <p className="expiry-alert-clear">No dated products are close to expiry.</p>}
    </section>
  )
}

function RestockSuggestions({ liveMode, onLoadRestock }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!liveMode || !onLoadRestock) return undefined
    let active = true
    setLoading(true)
    onLoadRestock().then((nextRows) => { if (active) setRows(nextRows) })
      .catch((loadError) => { if (active) setError(loadError.message || 'Could not load restock suggestions.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [liveMode, onLoadRestock])
  return (
    <section className="restock-panel" aria-label="Restock suggestions">
      <div className="expiry-alert-heading"><div><h3>Restock suggestions</h3><p>Based on collected sales from the last 30 days, aiming for 14 days of stock.</p></div></div>
      {!liveMode ? <p className="expiry-alert-clear">Restock suggestions are available with live order history.</p> : loading ? <p className="daily-sales-status">Calculating recent item sales…</p> : error ? <p className="daily-sales-error" role="alert">{error}</p> : rows.length ? <ul>{rows.map((row) => <li key={row.id}><span><strong>{row.name}</strong><small>{formatQuantity(row.soldQuantity30d, row.unit)} sold in 30 days · {formatQuantity(row.stock, row.unit)} left</small></span><b>Add about {formatQuantity(row.suggestedQuantity, row.unit)}</b></li>)}</ul> : <p className="expiry-alert-clear">Current stock covers recent sales for the next 14 days.</p>}
    </section>
  )
}

const STORE_DAYS = [
  ['mon','Monday'],['tue','Tuesday'],['wed','Wednesday'],['thu','Thursday'],['fri','Friday'],['sat','Saturday'],['sun','Sunday'],
]
const DEFAULT_HOURS = Object.fromEntries(STORE_DAYS.map(([key]) => [key, { open: '08:00', close: '21:00', closed: false }]))

function StoreContactPanel({ storeStatus, onSave }) {
  const [storeName, setStoreName] = useState(storeStatus?.storeName || 'Venkata Kusuma Haranth General Stores')
  const [contactPhone, setContactPhone] = useState(storeStatus?.contactPhone || '+917032946299')
  const [contactAddress, setContactAddress] = useState(storeStatus?.contactAddress || '')
  const [mapsUrl, setMapsUrl] = useState(storeStatus?.mapsUrl || 'https://maps.app.goo.gl/AaYVR9dbwqkwm7H29')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  const contactKey = JSON.stringify([storeStatus?.storeName, storeStatus?.contactPhone, storeStatus?.contactAddress, storeStatus?.mapsUrl])
  useEffect(() => {
    if (dirty) return
    setStoreName(storeStatus?.storeName || 'Venkata Kusuma Haranth General Stores')
    setContactPhone(storeStatus?.contactPhone || '+917032946299')
    setContactAddress(storeStatus?.contactAddress || '')
    setMapsUrl(storeStatus?.mapsUrl || 'https://maps.app.goo.gl/AaYVR9dbwqkwm7H29')
  }, [contactKey, dirty])
  function update(setter, value) { setter(value); setDirty(true); setError('') }
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    const saved = await onSave({ storeName, contactPhone, contactAddress, mapsUrl })
    if (saved) setDirty(false)
    else setError('Could not save these details. Check the notice above and try again.')
    setBusy(false)
  }
  return (
    <section className="store-contact-panel" aria-label="Shop contact details">
      <div className="store-hours-heading"><div><h2>Shop contact details</h2><p>These details appear on the public Contact page and can be updated here.</p></div></div>
      <form onSubmit={submit}>
        <label><span>Shop name</span><input required maxLength={120} value={storeName} onChange={(event) => update(setStoreName, event.target.value)} /></label>
        <label><span>Phone number</span><input required type="tel" inputMode="tel" maxLength={24} value={contactPhone} onChange={(event) => update(setContactPhone, event.target.value)} /></label>
        <label><span>Address or area <small>optional</small></span><input maxLength={240} value={contactAddress} onChange={(event) => update(setContactAddress, event.target.value)} placeholder="Add a street or area customers recognize" /></label>
        <label><span>Google Maps link</span><input required type="url" maxLength={500} value={mapsUrl} onChange={(event) => update(setMapsUrl, event.target.value)} /></label>
        <div className="store-contact-actions"><small>Publicly visible to anyone who opens Contact.</small><button className="btn primary" type="submit" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save contact details'}</button></div>
      </form>
      {error && <p className="inventory-error" role="alert">{error}</p>}
    </section>
  )
}

function StoreHoursPanel({ storeStatus, onSave }) {
  const [hours, setHours] = useState(() => storeStatus?.hours || DEFAULT_HOURS)
  const [statusOverride, setStatusOverride] = useState(storeStatus?.statusOverride || 'auto')
  const [closedMessage, setClosedMessage] = useState(storeStatus?.closedMessage || 'The shop is closed right now.')
  const [busy, setBusy] = useState(false)
  const [dirty, setDirty] = useState(false)
  const storeHoursKey = JSON.stringify(storeStatus?.hours || DEFAULT_HOURS)
  useEffect(() => {
    if (dirty) return
    setHours(storeStatus?.hours || DEFAULT_HOURS)
    setStatusOverride(storeStatus?.statusOverride || 'auto')
    setClosedMessage(storeStatus?.closedMessage || 'The shop is closed right now.')
  }, [storeHoursKey, storeStatus?.statusOverride, storeStatus?.closedMessage, dirty])
  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    const saved = await onSave({ hours, statusOverride, closedMessage })
    if (saved) setDirty(false)
    setBusy(false)
  }
  function updateDay(day, changes) {
    setDirty(true)
    setHours((current) => ({ ...current, [day]: { ...current[day], ...changes } }))
  }
  return (
    <section className="store-hours-panel" aria-label="Store opening hours">
      <div className="store-hours-heading"><div><h2>Store hours and holiday status</h2><p>Customer ordering follows these hours in India time.</p></div><span className={'store-status-pill ' + (storeStatus?.acceptingOrders ? 'is-open' : 'is-closed')}>{storeStatus?.acceptingOrders ? 'Open now' : 'Closed now'}</span></div>
      <form onSubmit={submit}>
        <label className="store-override-label"><span>Order availability</span><select value={statusOverride} onChange={(event) => { setStatusOverride(event.target.value); setDirty(true) }}><option value="auto">Follow weekly hours</option><option value="open">Temporarily open all day</option><option value="closed">Closed / holiday</option></select></label>
        <label className="store-closed-message"><span>Closure message</span><input maxLength={180} value={closedMessage} onChange={(event) => { setClosedMessage(event.target.value); setDirty(true) }} placeholder="e.g. Closed for a local holiday" /></label>
        <div className="store-week-hours">{STORE_DAYS.map(([key,label]) => {
          const row = hours[key] || DEFAULT_HOURS[key]
          return <div className="store-day-row" key={key}>
            <strong>{label}</strong>
            <label className="store-day-open"><input type="checkbox" checked={!row.closed} onChange={(event) => updateDay(key, { closed: !event.target.checked })} />Open</label>
            <label><span>Opens</span><input type="time" value={row.open} disabled={row.closed} onChange={(event) => updateDay(key, { open: event.target.value })} required /></label>
            <label><span>Closes</span><input type="time" value={row.close} disabled={row.closed} onChange={(event) => updateDay(key, { close: event.target.value })} required /></label>
          </div>
        })}</div>
        <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save store hours'}</button>
      </form>
    </section>
  )
}

function OfferManager({ offers, onCreateOffer, onToggleOffer, onDeleteOffer }) {
  const [title, setTitle] = useState('')
  const [code, setCode] = useState('')
  const [discountPercent, setDiscountPercent] = useState('10')
  const [minimumOrder, setMinimumOrder] = useState('250')
  const [endsAt, setEndsAt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [deletingOfferId, setDeletingOfferId] = useState('')
  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const saved = await onCreateOffer({ title: title.trim(), code: code.trim().toUpperCase(), discountPercent: Number(discountPercent), minimumOrder: Number(minimumOrder), endsAt: endsAt ? new Date(endsAt).toISOString() : null })
      if (!saved) { setError('Could not save the offer. Review the message at the top of the page.'); return }
      setTitle('')
      setCode('')
      setDiscountPercent('10')
      setMinimumOrder('250')
      setEndsAt('')
    } catch (submitError) { setError(submitError?.message || 'Could not save this offer.') }
    finally { setBusy(false) }
  }
  async function deleteOffer(offer) {
    setError('')
    if (busy || deletingOfferId) return
    const confirmed = window.confirm(
      'Permanently delete offer ' + offer.code + '? Customers will no longer be able to use it. Past orders will remain unchanged.',
    )
    if (!confirmed) return

    setDeletingOfferId(offer.id)
    try {
      const deleted = await onDeleteOffer(offer.id, offer.code)
      if (!deleted) setError('Could not delete this offer. Review the message at the top of the page.')
    } catch (deleteError) {
      setError(deleteError?.message || 'Could not delete this offer.')
    } finally {
      setDeletingOfferId('')
    }
  }

  return (
    <section className="offer-manager" aria-label="Offers and coupons">
      <div className="store-hours-heading"><div><h2>Offers and coupons</h2><p>Create a code customers can apply to their confirmed basket.</p></div><span className="offer-count">{offers.length} saved</span></div>
      <form className="offer-create-form" onSubmit={submit}>
        <label><span>Offer title</span><input value={title} onChange={(event) => setTitle(event.target.value)} minLength={2} maxLength={100} placeholder="Weekend savings" required /></label>
        <label><span>Coupon code</span><input value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24))} pattern="[A-Z0-9-]{3,24}" placeholder="SAVE10" required /></label>
        <label><span>Discount · %</span><input type="number" min="1" max="80" step="1" value={discountPercent} onChange={(event) => setDiscountPercent(event.target.value)} required /></label>
        <label><span>Minimum basket · ₹</span><input type="number" min="201" max="100000" step="1" value={minimumOrder} onChange={(event) => setMinimumOrder(event.target.value)} required /></label>
        <label><span>Expires at <small>optional</small></span><input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></label>
        <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Create offer'}</button>
      </form>
      {error && <p className="inventory-error" role="alert">{error}</p>}
      {offers.length ? <ul className="offer-manager-list">{offers.map((offer) => {
        const expired = offer.ends_at && new Date(offer.ends_at).getTime() <= Date.now()
        return <li key={offer.id}>
          <span><strong>{offer.title}</strong><small><code>{offer.code}</code> · {offer.discountPercent}% off · minimum {formatMoney(offer.minimumOrder)}{offer.ends_at ? ' · expires ' + new Date(offer.ends_at).toLocaleString('en-IN') : ''}</small></span>
          <div className="offer-manager-actions">
            <button className="btn" type="button" disabled={Boolean(expired && !offer.active) || Boolean(deletingOfferId)} onClick={() => onToggleOffer(offer.id, !offer.active)}>{expired ? offer.active ? 'Pause expired' : 'Expired' : offer.active ? 'Pause' : 'Activate'}</button>
            <button className="btn offer-delete-button" type="button" disabled={Boolean(deletingOfferId) || busy} onClick={() => deleteOffer(offer)} aria-label={'Delete ' + offer.code + ' offer'}>{deletingOfferId === offer.id ? 'Deleting…' : 'Delete'}</button>
          </div>
        </li>
      })}</ul> : <p className="expiry-alert-clear">No offers yet.</p>}
    </section>
  )
}

function CategoryManager({ categories, onAddCategory, onRemoveCategory }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  function submit(event) {
    event.preventDefault()
    Promise.resolve(onAddCategory(name)).then((saved) => {
      if (!saved) return
      setName('')
      setOpen(false)
    })
  }

  return (
    <section className="category-manager" aria-label="Category customization">
      <div className="category-manager-heading"><div><h3>Categories</h3><p>Add categories or remove ones you no longer use.</p></div><button className="btn category-manage-button" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}><Plus size={15} />{open ? 'Close' : 'Add category'}</button></div>
      {categories.length > 0 && <div className="category-manager-list" aria-label="Current categories">{categories.map((category) => <span className="category-manager-chip" key={category}><span>{category}</span><button type="button" onClick={() => onRemoveCategory(category)} aria-label={'Remove ' + category + ' category'} title="Remove category; catalogue items move to another category"><X size={13} /></button></span>)}</div>}
      {open && <form className="category-manager-form" onSubmit={submit}><label><span>New category name</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Frozen foods" required /></label><button className="btn primary" type="submit">Save category</button></form>}
    </section>
  )
}

export default function Dashboard({ orders, products, categories, onAddCategory, onRemoveCategory, onUpdateOrder, onSetRequestedItemRate, onDeleteOrder, deletingOrderId = '', onResetSamples, onSaveProduct, onAddProduct, onRemoveProduct, liveMode = false, realtimeConnected = false, shopkeeperName = 'Ramesh', notificationEnabled = false, notificationPermission = 'unsupported', onToggleNotifications, onLoadDailySales, onLoadRestock, offers = [], storeStatus = null, onCreateOffer, onToggleOffer, onDeleteOffer, onSaveStoreSettings, onSaveStoreContact, onUploadProductImage, onRemoveProductImage, onExportReport }) {
  const [filter, setFilter] = useState('all')
  const [section, setSection] = useState('orders')
  const [inventorySearch, setInventorySearch] = useState('')
  const [voiceLanguage, setVoiceLanguage] = useState('en-IN')
  const visibleOrders = useMemo(() => {
    const sorted = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    if (filter === 'all') return sorted
    if (filter === 'pending') return sorted.filter((order) => order.status === 'pending')
    if (filter === 'preparing') return sorted.filter((order) => order.status === 'preparing')
    if (filter === 'ready') return sorted.filter((order) => order.status === 'ready')
    return sorted
  }, [orders, filter])

  const visibleProducts = useMemo(() => {
    const query = inventorySearch.trim().toLocaleLowerCase()
    if (!query) return products
    return products.filter((product) => (product.name + ' ' + product.local + ' ' + product.category).toLocaleLowerCase().includes(query))
  }, [products, inventorySearch])

  const pending = orders.filter((order) => order.status === 'pending').length
  const preparing = orders.filter((order) => order.status === 'preparing').length
  const ready = orders.filter((order) => order.status === 'ready').length
  const completed = orders.filter((order) => order.status === 'collected').length

  return (
    <section className="dashboard-page">
      <div className="dashboard-intro">
        <div>
          <p className="eyebrow">SHOPKEEPER VIEW</p>
          <h1>Good morning, {shopkeeperName} <span>☀️</span></h1>
          <p>One simple queue for online and entrance QR orders.</p>
        </div>
        {!liveMode && <button className="reset-button" type="button" onClick={onResetSamples} title="Restore the demo order examples">↻ Reset demo orders</button>}
      </div>

      <div className={`demo-banner ${liveMode ? 'live-banner' : ''}`}><span className="demo-banner-icon">✳</span><div><strong>{liveMode ? 'Live shopkeeper dashboard' : 'Demo dashboard'}</strong><span>{liveMode ? 'Orders, catalogue changes, and status messages are shared across signed-in devices.' : 'These sample orders are here to show the workflow. New customer orders appear in this same queue and stay in this browser.'}</span></div></div>
      {liveMode && <OrderNotificationControl enabled={notificationEnabled} permission={notificationPermission} onToggle={onToggleNotifications} />}

      <div className="dashboard-stats" aria-label="Order summary">
        <div className="stat-card stat-pending"><div className="stat-icon"><ClipboardList size={19} /></div><span>Needs action</span><strong>{pending}</strong><small>new orders</small></div>
        <div className="stat-card stat-preparing"><div className="stat-icon"><PackageCheck size={19} /></div><span>Preparing</span><strong>{preparing}</strong><small>being picked</small></div>
        <div className="stat-card stat-ready"><div className="stat-icon"><CheckCircle2 size={19} /></div><span>Ready</span><strong>{ready}</strong><small>awaiting pickup</small></div>
        <div className="stat-card stat-completed"><div className="stat-icon"><Check size={19} /></div><span>Collected</span><strong>{completed}</strong><small>orders complete</small></div>
      </div>

      <div className="dashboard-tabs" role="group" aria-label="Shopkeeper sections">
        <button type="button" aria-pressed={section === 'orders'} className={section === 'orders' ? 'active' : ''} onClick={() => setSection('orders')}>Orders <span>{orders.length}</span></button>
        <button type="button" aria-pressed={section === 'sales'} className={section === 'sales' ? 'active' : ''} onClick={() => setSection('sales')}>Daily sales</button>
        <button type="button" aria-pressed={section === 'inventory'} className={section === 'inventory' ? 'active' : ''} onClick={() => setSection('inventory')}>Stock and prices <span>{products.length}</span></button>
        <button type="button" aria-pressed={section === 'store'} className={section === 'store' ? 'active' : ''} onClick={() => setSection('store')}>Store & offers</button>
      </div>

      {section === 'orders' ? <section className="orders-section">
        <div className="orders-section-heading"><div><h2>Order queue</h2><span>{orders.length} orders · updated just now</span></div><span className="live-indicator"><i />{liveMode ? realtimeConnected ? 'Live across devices' : 'Cloud data · connecting' : 'Live in this browser'}</span></div>
        <div className="order-filters" role="group" aria-label="Filter orders">
          {FILTERS.map((item) => (
            <button key={item.id} className={filter === item.id ? 'active' : ''} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
              {item.label}{item.id === 'pending' && pending > 0 && <b>{pending}</b>}
            </button>
          ))}
        </div>
        <div className="order-list">
          {visibleOrders.length ? visibleOrders.map((order) => <OrderCard key={order.id} order={order} onUpdate={onUpdateOrder} onDeleteOrder={onDeleteOrder} deletingOrderId={deletingOrderId} onSetRequestedItemRate={onSetRequestedItemRate} liveMode={liveMode} />) : (
            <div className="no-orders"><span>🌱</span><strong>Nothing in this view right now</strong><p>New customer orders will appear here as soon as they’re placed.</p></div>
          )}
        </div>
      </section> : section === 'sales' ? <DailySalesPanel orders={orders} liveMode={liveMode} onLoadDailySales={onLoadDailySales} onExportReport={onExportReport} /> : section === 'inventory' ? <section className="inventory-section">
        <div className="orders-section-heading"><div><h2>Stock and prices</h2><span>Changes update the customer catalogue and new bills.</span></div><div className="inventory-header-actions"><span className="live-indicator"><i />{liveMode ? 'Shared catalogue' : 'Saved in this browser'}</span>{liveMode && <button className="btn csv-export-button" type="button" onClick={() => onExportReport('inventory')}>Download inventory CSV</button>}</div></div>
        <LowStockAlerts products={products} />
        <ExpiryAlerts products={products} />
        <RestockSuggestions liveMode={liveMode} onLoadRestock={onLoadRestock} />
        <CategoryManager categories={categories} onAddCategory={onAddCategory} onRemoveCategory={onRemoveCategory} />
        <div className="inventory-catalogue-search" role="search" aria-label="Search shopkeeper catalogue">
          <label htmlFor="inventory-catalogue-search"><span>Find an item by name or Telugu name</span><input id="inventory-catalogue-search" type="search" value={inventorySearch} onChange={(event) => setInventorySearch(event.target.value)} placeholder="Try rice or a Telugu name" /></label>
          <label><span>Voice language</span><select value={voiceLanguage} onChange={(event) => setVoiceLanguage(event.target.value)} aria-label="Voice search language"><option value="te-IN">తెలుగు</option><option value="en-IN">English</option></select></label>
          <VoiceDictationButton language={voiceLanguage} onTranscript={setInventorySearch} label="Voice search" />
        </div>
        <AddProductForm categories={categories} products={products} onAddProduct={onAddProduct} />
        <div className="inventory-list" aria-label="Catalogue stock and prices">
          <div className="inventory-list-heading"><strong>Catalogue</strong><span>{inventorySearch.trim() ? visibleProducts.length + ' of ' + products.length + ' items' : products.length + ' items'} · quantity is measured in each item’s selling unit</span></div>
          {visibleProducts.length ? visibleProducts.map((product) => <InventoryRow key={product.id} product={product} onSave={onSaveProduct} onRemove={onRemoveProduct} onUploadImage={onUploadProductImage} onRemoveImage={onRemoveProductImage} />) : <p className="inventory-no-results">{products.length ? 'No catalogue items match that search.' : 'No catalogue items yet. Add an item above.'}</p>}
        </div>
      </section> : <section className="store-tools-section">
        <StoreHoursPanel storeStatus={storeStatus} onSave={onSaveStoreSettings} />
        <StoreContactPanel storeStatus={storeStatus} onSave={onSaveStoreContact} />
        <OfferManager offers={offers} onCreateOffer={onCreateOffer} onToggleOffer={onToggleOffer} onDeleteOffer={onDeleteOffer} />
      </section>}
    </section>
  )
}
