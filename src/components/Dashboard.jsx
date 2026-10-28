import { ArrowDownToLine, Check, CheckCircle2, Clock3, ClipboardList, PackageCheck, Plus, Save, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import OrderNotificationControl from './OrderNotificationControl.jsx'
import { formatMoney, formatQuantity, formatReadyTime, orderChannelLabel } from '../data.js'

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

function OrderCard({ order, onUpdate, onDeleteOrder, deletingOrderId, onSetRequestedItemRate }) {
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

  return (
    <article className={`order-card ${order.status === 'pending' ? 'order-card-new' : ''}`}>
      <div className="order-card-top">
        <div className="order-customer">
          <span className="customer-avatar">{order.name.split(' ').map((part) => part[0]).slice(0, 2).join('')}</span>
          <div><strong>{order.name}</strong><span>{order.phone} · {timeLabel(order.createdAt)}</span></div>
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
      <div className="order-card-bottom">
        <div><span>{order.payment}</span><strong>{formatMoney(order.total)}</strong>{unpricedCount > 0 && <small className="order-total-note">Confirmed subtotal · {unpricedCount} requested {unpricedCount === 1 ? 'item' : 'items'} awaiting rate</small>}</div>
        {(primaryAction || order.status === 'collected') && (
          <div className="order-actions">
            {primaryAction && (
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
          </div>
        )}
      </div>
    </article>
  )
}

function InventoryRow({ product, onSave, onRemove }) {
  const [price, setPrice] = useState(String(product.price))
  const [stock, setStock] = useState(String(product.stock))
  const changed = Number(price) !== product.price || Number(stock) !== product.stock

  useEffect(() => {
    setPrice(String(product.price))
    setStock(String(product.stock))
  }, [product.price, product.stock])

  function save(event) {
    event.preventDefault()
    const nextPrice = Number(price)
    const nextStock = Number(stock)
    if (!Number.isFinite(nextPrice) || nextPrice <= 0 || !Number.isFinite(nextStock) || nextStock < 0) return
    onSave(product.id, { price: nextPrice, stock: nextStock })
  }

  return (
    <form className="inventory-row" onSubmit={save}>
      <div className="inventory-product">
        <strong>{product.name}</strong>
        {product.local && <span lang="te">{product.local}</span>}
        <small>{product.category} · price per {product.unit}</small>
      </div>
      <label className="inventory-field">
        <span>Rate · ₹</span>
        <input type="number" min="1" step="1" value={price} onChange={(event) => setPrice(event.target.value)} aria-label={'Rate for ' + product.name} required />
      </label>
      <label className="inventory-field stock-field">
        <span>In stock · {product.unit}</span>
        <input type="number" min="0" step={product.unit === 'kg' ? '0.01' : 1} value={stock} onChange={(event) => setStock(event.target.value)} aria-label={'Stock quantity for ' + product.name} required />
      </label>
      <div className="inventory-actions">
        <button className="btn inventory-save" type="submit" disabled={!changed}><Save size={15} />Save</button>
        <button className="btn inventory-remove" type="button" onClick={() => onRemove(product.id)} aria-label={'Remove ' + product.name} title="Remove from customer catalogue"><Trash2 size={15} /><span>Remove</span></button>
      </div>
    </form>
  )
}

function AddProductForm({ categories, onAddProduct }) {
  const [name, setName] = useState('')
  const [local, setLocal] = useState('')
  const [category, setCategory] = useState(categories[0] || '')
  const [unit, setUnit] = useState('kg')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!categories.includes(category)) setCategory(categories[0] || '')
  }, [categories, category])

  async function submit(event) {
    event.preventDefault()
    const parsedPrice = Number(price)
    const parsedStock = Number(stock)
    if (!name.trim() || !category.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0 || !Number.isFinite(parsedStock) || parsedStock < 0) {
      setError('Enter an item name, category, positive rate, and stock quantity.')
      return
    }
    const saved = await onAddProduct({ name: name.trim(), local: local.trim(), category: category.trim(), unit, price: parsedPrice, stock: parsedStock })
    if (saved === false) return
    setName('')
    setLocal('')
    setPrice('')
    setStock('')
    setError('')
  }

  return (
    <form className="add-product-form" onSubmit={submit}>
      <div className="add-product-heading"><div><h3>Add a catalogue item</h3><p>It will appear in the customer shop as soon as you save it.</p></div><span className="add-product-icon"><Plus size={18} /></span></div>
      <div className="add-product-fields">
        <label><span>Item name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Moong dal" required /></label>
        <label><span>Telugu name <small>optional</small></span><input value={local} onChange={(event) => setLocal(event.target.value)} placeholder="స్థానిక పేరు" /></label>
        <label><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)} required><option value="" disabled>Choose a category</option>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label><span>Sold as</span><select value={unit} onChange={(event) => setUnit(event.target.value)}><option value="kg">Loose · kg</option><option value="pack">Pack</option><option value="dozen">Dozen</option><option value="500 g">500 g pack</option><option value="500 ml">500 ml pack</option><option value="200 g">200 g pack</option><option value="100 g">100 g pack</option></select></label>
        <label><span>Rate · ₹ / {unit}</span><input type="number" min="1" step="1" inputMode="decimal" value={price} onChange={(event) => setPrice(event.target.value)} placeholder="0" required /></label>
        <label><span>Opening stock · {unit}</span><input type="number" min="0" step={unit === 'kg' ? '0.01' : '1'} inputMode="decimal" value={stock} onChange={(event) => setStock(event.target.value)} placeholder="0" required /></label>
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

function DailySalesPanel({ orders, liveMode, onLoadDailySales }) {
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
      <div className="orders-section-heading"><div><h2>Daily sales</h2><span>Orders marked collected on the selected date · India time</span></div><label htmlFor="daily-sales-date">Report date<input id="daily-sales-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div>
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

export default function Dashboard({ orders, products, categories, onAddCategory, onRemoveCategory, onUpdateOrder, onSetRequestedItemRate, onDeleteOrder, deletingOrderId = '', onResetSamples, onSaveProduct, onAddProduct, onRemoveProduct, liveMode = false, realtimeConnected = false, shopkeeperName = 'Ramesh', notificationEnabled = false, notificationPermission = 'unsupported', onToggleNotifications, onLoadDailySales }) {
  const [filter, setFilter] = useState('all')
  const [section, setSection] = useState('orders')
  const visibleOrders = useMemo(() => {
    const sorted = [...orders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    if (filter === 'all') return sorted
    if (filter === 'pending') return sorted.filter((order) => order.status === 'pending')
    if (filter === 'preparing') return sorted.filter((order) => order.status === 'preparing')
    if (filter === 'ready') return sorted.filter((order) => order.status === 'ready')
    return sorted
  }, [orders, filter])

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
          {visibleOrders.length ? visibleOrders.map((order) => <OrderCard key={order.id} order={order} onUpdate={onUpdateOrder} onDeleteOrder={onDeleteOrder} deletingOrderId={deletingOrderId} onSetRequestedItemRate={onSetRequestedItemRate} />) : (
            <div className="no-orders"><span>🌱</span><strong>Nothing in this view right now</strong><p>New customer orders will appear here as soon as they’re placed.</p></div>
          )}
        </div>
      </section> : section === 'sales' ? <DailySalesPanel orders={orders} liveMode={liveMode} onLoadDailySales={onLoadDailySales} /> : <section className="inventory-section">
        <div className="orders-section-heading"><div><h2>Stock and prices</h2><span>Changes update the customer catalogue and new bills.</span></div><span className="live-indicator"><i />{liveMode ? 'Shared catalogue' : 'Saved in this browser'}</span></div>
        <LowStockAlerts products={products} />
        <CategoryManager categories={categories} onAddCategory={onAddCategory} onRemoveCategory={onRemoveCategory} />
        <AddProductForm categories={categories} onAddProduct={onAddProduct} />
        <div className="inventory-list" aria-label="Catalogue stock and prices">
          <div className="inventory-list-heading"><strong>Catalogue</strong><span>{products.length} items · quantity is measured in each item’s selling unit</span></div>
          {products.map((product) => <InventoryRow key={product.id} product={product} onSave={onSaveProduct} onRemove={onRemoveProduct} />)}
        </div>
      </section>}
    </section>
  )
}
