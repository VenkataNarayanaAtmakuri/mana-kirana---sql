import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Check, CircleHelp, Moon, Sun } from 'lucide-react'
import AuthDialog from './components/AuthDialog.jsx'
import AccountSwitcherDialog from './components/AccountSwitcherDialog.jsx'
import ChangePasswordDialog from './components/ChangePasswordDialog.jsx'
import EditProfileDialog from './components/EditProfileDialog.jsx'
import CartPanel from './components/CartPanel.jsx'
import CustomerOrderHistory from './components/CustomerOrderHistory.jsx'
import OrderNotificationControl from './components/OrderNotificationControl.jsx'
import SavedShoppingLists from './components/SavedShoppingLists.jsx'
import Dashboard from './components/Dashboard.jsx'
import ProductCard from './components/ProductCard.jsx'
import { formatMoney, formatReadyTime, makeSampleOrders, MINIMUM_ORDER_VALUE, orderChannelLabel, PICKUP_SLOT_MINUTES, readCategories, readOrders, readProducts, STORAGE_KEY } from './data.js'
import {
  archiveLiveCategory,
  archiveLiveProduct,
  createLiveCategory,
  createLiveProduct,
  createLiveOffer,
  deleteLiveOffer,
  downloadLiveReport,
  fetchRestockSuggestions,
  hideLiveOrder,
  fetchCustomerMessages,
  fetchDailySales,
  fetchLiveCatalog,
  fetchLiveOrders,
  fetchProfile,
  updateLiveProfile,
  placeLiveOrder,
  setLiveRequestRate,
  subscribeToAccount,
  subscribeToCatalog,
  updateLiveOrderStatus,
  updateLiveOffer,
  updateLiveProduct,
  updateLiveStoreSettings,
  validateLiveOffer,
} from './lib/liveData.js'
import { supabase, supabaseConfigured } from './lib/supabaseClient.js'

function getInitialView() {
  const pathname = typeof window === 'undefined' ? '/' : window.location.pathname.replace(/\/+$/, '') || '/'
  if (pathname === '/shopkeeper') return 'dashboard'
  if (pathname === '/orders' || pathname === '/my-orders') return 'orders'
  return 'shop'
}

function viewPath(view) {
  if (view === 'dashboard') return '/shopkeeper'
  if (view === 'orders') return '/orders'
  return '/'
}

function getInitialChannel() {
  const requested = new URLSearchParams(window.location.search).get('mode')
  return requested === 'entrance' ? requested : 'online'
}

const DEMO_HIDDEN_ORDER_KEY = 'mana-kirana-hidden-orders-v1'
const THEME_PREFERENCE_KEY = 'mana-kirana-theme-v1'

function readThemePreference() {
  try {
    return localStorage.getItem(THEME_PREFERENCE_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

function readDemoHiddenOrders() {
  try {
    const saved = JSON.parse(localStorage.getItem(DEMO_HIDDEN_ORDER_KEY) || '{}')
    return {
      customer: Array.isArray(saved.customer) ? saved.customer : [],
      shopkeeper: Array.isArray(saved.shopkeeper) ? saved.shopkeeper : [],
    }
  } catch {
    return { customer: [], shopkeeper: [] }
  }
}

function calculateReadyAt(currentOrders) {
  const activeOrders = currentOrders.filter((order) => !order.sample && ['pending', 'preparing'].includes(order.status))
  const now = Date.now()
  const unscheduledOrders = activeOrders.filter((order) => !order.estimatedReadyAt).length
  const latestScheduledTime = activeOrders.reduce((latest, order) => Math.max(latest, Date.parse(order.estimatedReadyAt) || 0), 0)
  const nextAfterQueue = now + (unscheduledOrders + 1) * PICKUP_SLOT_MINUTES * 60_000
  const nextAfterScheduled = latestScheduledTime ? latestScheduledTime + PICKUP_SLOT_MINUTES * 60_000 : 0
  return new Date(Math.max(nextAfterQueue, nextAfterScheduled)).toISOString()
}

function AppHeader({ view, onViewChange, itemCount, pendingCount, authUser, profileRole, theme, onToggleTheme, onCustomerSignIn, onShopkeeperSignIn, onEditProfile, onChangePassword, onAddAccount, onSwitchAccount, accountSwitchBusy, onSignOut }) {
  return (
    <header className="top">
      <div className="wrap top-inner">
        <a className="brand" href="#top" onClick={(event) => { event.preventDefault(); onViewChange('shop') }} aria-label="Mana Kirana home">
          <span className="mark" lang="te" aria-hidden="true">మ</span>
          <span className="brand-copy">
            <strong>Mana Kirana</strong>
            <small><span lang="te">మన కిరాణా</span> · Venkata Kusuma Haranth General Stores</small>
          </span>
        </a>
        <div className="tabs" role="group" aria-label="Switch view">
          <button className="tab" type="button" aria-pressed={view === 'shop'} onClick={() => onViewChange('shop')}>
            Customer{itemCount > 0 && <span className="count">{itemCount}</span>}
          </button>
          {supabaseConfigured && authUser && <button className="tab" type="button" aria-pressed={view === 'orders'} onClick={() => onViewChange('orders')}>My Orders</button>}
          <button className="tab" type="button" aria-pressed={view === 'dashboard'} onClick={() => onViewChange('dashboard')}>
            Shopkeeper{pendingCount > 0 && <span className="count">{pendingCount}</span>}
          </button>
        </div>
        <div className="account-actions">
          <button className="account-button theme-toggle" type="button" aria-pressed={theme === 'dark'} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} onClick={onToggleTheme}>
            {theme === 'dark' ? <Sun size={15} aria-hidden="true" /> : <Moon size={15} aria-hidden="true" />}
            <span>{theme === 'dark' ? 'Light theme' : 'Dark theme'}</span>
          </button>
          {supabaseConfigured && (authUser
            ? <>
                <button className="account-button account-switch-button" type="button" disabled={accountSwitchBusy} onClick={authUser.linkedAccount ? onSwitchAccount : onAddAccount}>
                  {accountSwitchBusy ? 'Switching…' : authUser.linkedAccount ? 'Switch to ' + (authUser.linkedAccount.role === 'shopkeeper' ? 'Shopkeeper' : 'Customer') : 'Link other account'}
                </button>
                <button className="account-button" type="button" onClick={onEditProfile}>Edit profile</button>
                <button className="account-button" type="button" onClick={onChangePassword}>Change password</button>
                <button className="account-button" type="button" onClick={onSignOut}>Sign out · {authUser.phone?.slice(-4)}</button>
              </>
            : <>
                <button className="account-button" type="button" onClick={onCustomerSignIn}>Customer Sign In</button>
                <button className="account-button shopkeeper-signin-button" type="button" onClick={onShopkeeperSignIn}>Shopkeeper Sign In</button>
              </>)}
        </div>
      </div>
    </header>
  )
}

function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap site-footer-inner">
        <div className="site-footer-brand">
          <strong>Mana Kirana</strong>
          <span>Venkata Kusuma Haranth General Stores</span>
        </div>
        <nav aria-label="Information and project links">
          <a href="/about/">About</a>
          <a href="/contact/">Contact</a>
          <a href="https://github.com/VenkataNarayanaAtmakuri/mana-kirana---sql" target="_blank" rel="noreferrer">GitHub source</a>
        </nav>
        <small>Pickup orders are collected and paid for at the store.</small>
      </div>
    </footer>
  )
}

function OrderMode({ channel, onChange }) {
  const modes = [
    { id: 'entrance', title: 'Scanned entrance QR', detail: "I'm at the shop door" },
    { id: 'online', title: 'Ordering online', detail: "I'm at home, will come later" },
  ]
  const notes = {
    entrance: 'You scanned the entrance QR. Choose your groceries while you walk in, then collect them from the pickup shelf when they are ready.',
    online: 'Ordering from home. Choose your groceries now, then visit the shop when your pickup is ready.',
  }

  return (
    <div>
      <div className="modes" role="group" aria-label="Choose an ordering mode">
        {modes.map((mode) => (
          <button key={mode.id} className="mode" type="button" aria-pressed={channel === mode.id} onClick={() => onChange(mode.id)}>
            <strong>{mode.title}</strong><span>{mode.detail}</span>
          </button>
        ))}
      </div>
      <p className="mode-note">{notes[channel]}</p>
    </div>
  )
}

function UnlistedItemForm({ onAdd }) {
  const [name, setName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('piece')

  function submit(event) {
    event.preventDefault()
    const parsedQuantity = Number(quantity)
    if (!name.trim() || !Number.isFinite(parsedQuantity) || parsedQuantity <= 0) return
    onAdd({ name: name.trim(), quantity: parsedQuantity, unit })
    setName('')
    setQuantity('1')
    setUnit('piece')
  }

  return (
    <form className="unlisted-form" onSubmit={submit}>
      <div className="unlisted-heading"><div><h2>Request an unlisted item</h2><p>Tell the shopkeeper what you need. No price is added until they confirm it.</p></div><span aria-hidden="true">✎</span></div>
      <div className="unlisted-fields">
        <label><span>Item name</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Jaggery" required /></label>
        <label><span>Quantity</span><input type="number" min="0.25" step={unit === 'kg' ? '0.25' : '1'} value={quantity} onChange={(event) => setQuantity(event.target.value)} required /></label>
        <label><span>Unit</span><select value={unit} onChange={(event) => { setUnit(event.target.value); setQuantity('1') }}><option value="piece">Piece</option><option value="kg">kg</option><option value="pack">Pack</option><option value="litre">Litre</option></select></label>
        <button className="btn" type="submit">Add request</button>
      </div>
    </form>
  )
}

function App() {
  const [view, setView] = useState(getInitialView)
  const [theme, setTheme] = useState(readThemePreference)
  const [channel, setChannel] = useState(getInitialChannel)
  const [category, setCategory] = useState('All items')
  const [search, setSearch] = useState('')
  const [voiceSearchLanguage, setVoiceSearchLanguage] = useState('te-IN')
  const [voiceSearchActive, setVoiceSearchActive] = useState(false)
  const [voiceSearchMessage, setVoiceSearchMessage] = useState('')
  const voiceRecognitionRef = useRef(null)
  const [cart, setCart] = useState({})
  const [customItems, setCustomItems] = useState([])
  const [orders, setOrders] = useState(() => supabaseConfigured ? [] : readOrders())
  const [customerOrders, setCustomerOrders] = useState([])
  const [products, setProducts] = useState(() => supabaseConfigured ? [] : readProducts())
  const [customCategories, setCustomCategories] = useState(() => supabaseConfigured ? [] : readCategories())
  const [remoteCategories, setRemoteCategories] = useState([])
  const [offers, setOffers] = useState([])
  const [storeStatus, setStoreStatus] = useState(null)
  const [couponCode, setCouponCode] = useState('')
  const [coupon, setCoupon] = useState(null)
  const [couponError, setCouponError] = useState('')
  const [couponBusy, setCouponBusy] = useState(false)
  const [customerMessages, setCustomerMessages] = useState([])
  const [authUser, setAuthUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [showAuthDialog, setShowAuthDialog] = useState(false)
  const [authDialogRole, setAuthDialogRole] = useState('customer')
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false)
  const [showEditProfileDialog, setShowEditProfileDialog] = useState(false)
  const [showSignOutDialog, setShowSignOutDialog] = useState(false)
  const [showAccountSwitcherDialog, setShowAccountSwitcherDialog] = useState(false)
  const [accountSwitchBusy, setAccountSwitchBusy] = useState(false)
  const [signOutBusy, setSignOutBusy] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const [liveLoading, setLiveLoading] = useState(supabaseConfigured)
  const [liveError, setLiveError] = useState('')
  const [realtimeConnected, setRealtimeConnected] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [phone, setPhone] = useState('')
  const [alternatePickupPhone, setAlternatePickupPhone] = useState('')
  const [payment, setPayment] = useState('pickup')
  const [successOrderId, setSuccessOrderId] = useState('')
  const [successOrderSnapshot, setSuccessOrderSnapshot] = useState(null)
  const [mobileCartOpen, setMobileCartOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [customerWelcome, setCustomerWelcome] = useState('')
  const [deletingOrderId, setDeletingOrderId] = useState('')
  const [demoHiddenOrders, setDemoHiddenOrders] = useState(readDemoHiddenOrders)
  const [notificationsEnabled, setNotificationsEnabled] = useState(false)
  const [notificationPermission, setNotificationPermission] = useState(() => typeof window !== 'undefined' && 'Notification' in window ? window.Notification.permission : 'unsupported')
  const notificationEnabledRef = useRef(false)
  const savedShoppingListsKey = 'mana-kirana-saved-lists:v1:' + (authUser?.id || 'guest')

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme
    try { localStorage.setItem(THEME_PREFERENCE_KEY, theme) } catch { /* Theme still applies for this session. */ }
  }, [theme])

  function selectView(nextView) {
    setView(nextView)
    const nextPath = viewPath(nextView)
    if (window.location.pathname !== nextPath) {
      const nextUrl = new URL(window.location.href)
      nextUrl.pathname = nextPath
      window.history.pushState({ manaKiranaView: nextView }, '', nextUrl.pathname + nextUrl.search + nextUrl.hash)
    }
  }

  useEffect(() => {
    const handlePopState = () => setView(getInitialView())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    if (supabaseConfigured) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 3, orders, products, categories: customCategories }))
      localStorage.setItem(DEMO_HIDDEN_ORDER_KEY, JSON.stringify(demoHiddenOrders))
    } catch {
      // The app remains usable if browser storage is unavailable.
    }
  }, [orders, products, customCategories, demoHiddenOrders])

  useEffect(() => {
    if (!supabaseConfigured) return undefined
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const nextUser = session?.user || null
      setAuthUser(nextUser)
      if (!nextUser) {
        setProfile(null)
        setOrders([])
        setCustomerOrders([])
        setCustomerMessages([])
      }
      if (event === 'SIGNED_IN' || event === 'ACCOUNT_SWITCHED') {
        const name = String(nextUser?.full_name || '').trim()
        setProfile(null)
        setProfileLoading(true)
        setOrders([])
        setCustomerOrders([])
        setCustomerMessages([])
        setCustomerWelcome(event === 'SIGNED_IN' && nextUser?.role === 'customer' ? name || 'there' : '')
        setCustomerName(nextUser?.full_name || '')
        setPhone(nextUser?.phone || '')
        setAlternatePickupPhone('')
      }
      if (event === 'SIGNED_OUT') {
        setCustomerWelcome('')
        setCustomerName('')
        setPhone('')
        setAlternatePickupPhone('')
        setNotice('You are signed out.')
      }
    })
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setLiveError(error.message)
      const restoredUser = data.session?.user || null
      setAuthUser(restoredUser)
      if (restoredUser) {
        setCustomerName(restoredUser.full_name || '')
        setPhone(restoredUser.phone || '')
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabaseConfigured || !authUser) {
      setProfile(null)
      setProfileLoading(false)
      return undefined
    }
    let active = true
    setProfileLoading(true)
    fetchProfile(authUser.id).then((nextProfile) => {
      if (active) setProfile(nextProfile)
    }).catch((error) => {
      if (active) setLiveError('Could not load account permissions: ' + error.message)
    }).finally(() => { if (active) setProfileLoading(false) })
    return () => { active = false }
  }, [authUser])

  function handleProfileUpdated(updatedProfile) {
    setAuthUser((current) => current ? { ...current, ...updatedProfile } : current)
    setProfile(updatedProfile)
    setCustomerName(updatedProfile.full_name || '')
    setPhone(updatedProfile.phone || '')
    if (updatedProfile.role === 'customer') setCustomerWelcome(updatedProfile.full_name || 'there')
    setShowEditProfileDialog(false)
    setNotice('Profile information updated.')
  }

  function handleAccountLinked(user) {
    setShowAccountSwitcherDialog(false)
    selectView(user?.role === 'shopkeeper' ? 'dashboard' : 'shop')
    setNotice('Linked your ' + (user?.role === 'shopkeeper' ? 'shopkeeper' : 'customer') + ' account. Use the header button to switch back.')
  }

  async function handleAccountSwitch() {
    if (!authUser?.linkedAccount || accountSwitchBusy) return
    setAccountSwitchBusy(true)
    setLiveError('')
    try {
      const result = await supabase.auth.switchAccount()
      if (result?.error) {
        setLiveError('Could not switch accounts: ' + result.error.message)
        return
      }
      const nextUser = result?.data?.user
      if (!nextUser) {
        setLiveError('Could not switch accounts. Please sign in again.')
        return
      }
      selectView(nextUser.role === 'shopkeeper' ? 'dashboard' : 'shop')
      setNotice('Switched to your ' + (nextUser.role === 'shopkeeper' ? 'shopkeeper' : 'customer') + ' account.')
    } catch (error) {
      setLiveError('Could not switch accounts: ' + (error?.message || 'Please try again.'))
    } finally {
      setAccountSwitchBusy(false)
    }
  }

  async function handleConfirmedSignOut() {
    if (!authUser || signOutBusy) return

    setSignOutBusy(true)
    setSignOutError('')

    try {
      // Verify the active account before ending this session.
      const verifiedProfile = await fetchProfile(authUser.id)
      if (!verifiedProfile || !['customer', 'shopkeeper'].includes(verifiedProfile.role)) {
        setSignOutError('Could not verify this account. Please try again.')
        return
      }

      const result = await supabase.auth.signOut()
      if (result?.error) {
        setSignOutError(result.error.message || 'Could not sign out. Please try again.')
        return
      }

      setShowSignOutDialog(false)
      selectView('shop')
      setProfile(null)
      setOrders([])
      setCustomerOrders([])
      setCustomerMessages([])
      setCart({})
      setCustomItems([])
      removeCoupon()
      setNotice('You are signed out.')
    } catch (error) {
      setSignOutError(error?.message || 'Could not verify the account or sign out. Please try again.')
    } finally {
      setSignOutBusy(false)
    }
  }

  const refreshLiveCatalog = useCallback(async () => {
    const result = await fetchLiveCatalog()
    setRemoteCategories(result.categories)
    setProducts(result.products)
    setOffers(result.offers || [])
    setStoreStatus(result.storeStatus || null)
    setLiveError('')
    return result
  }, [])

  const refreshLiveAccount = useCallback(async () => {
    if (!authUser) return
    const isShopkeeper = profile?.role === 'shopkeeper'
    const [nextOrders, nextCustomerOrders, nextMessages] = await Promise.all([
      fetchLiveOrders(isShopkeeper ? 'shopkeeper' : 'customer'),
      isShopkeeper ? fetchLiveOrders('customer') : Promise.resolve(null),
      fetchCustomerMessages(),
    ])
    setOrders(nextOrders)
    setCustomerOrders(isShopkeeper ? nextCustomerOrders : nextOrders)
    setCustomerMessages(nextMessages)
  }, [authUser, profile?.role])

  useEffect(() => {
    if (!supabaseConfigured) return undefined
    let active = true
    const loadCatalog = async () => {
      setLiveLoading(true)
      try {
        const result = await fetchLiveCatalog()
        if (active) {
          setRemoteCategories(result.categories)
          setProducts(result.products)
          setOffers(result.offers || [])
          setStoreStatus(result.storeStatus || null)
          setLiveError('')
        }
      } catch (error) {
        if (active) setLiveError('Could not load the live catalogue. Check the API URL, database connection, and schema. ' + error.message)
      } finally {
        if (active) setLiveLoading(false)
      }
    }
    void loadCatalog()
    const unsubscribe = subscribeToCatalog(() => {
      void refreshLiveCatalog().catch((error) => setLiveError('Catalogue update failed: ' + error.message))
    }, (status, error) => {
      if (status === 'SUBSCRIBED') {
        setRealtimeConnected(true)
        setLiveError((current) => current.startsWith('Realtime connection') ? '' : current)
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setRealtimeConnected(false)
        setLiveError('Realtime connection failed. Check the API server and database connection.' + (error?.message ? ' ' + error.message : ''))
      }
    })
    return () => { active = false; unsubscribe() }
  }, [refreshLiveCatalog])

  useEffect(() => {
    notificationEnabledRef.current = notificationsEnabled
  }, [notificationsEnabled])

  useEffect(() => {
    if (!authUser || !profile?.role) {
      setNotificationsEnabled(false)
      notificationEnabledRef.current = false
      return
    }
    const key = 'mana-kirana-order-alerts:v1:' + authUser.id + ':' + profile.role
    let enabled = false
    try { enabled = localStorage.getItem(key) === 'enabled' } catch { enabled = false }
    const granted = typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted'
    setNotificationsEnabled(enabled && granted)
    notificationEnabledRef.current = enabled && granted
  }, [authUser?.id, profile?.role])

  useEffect(() => {
    if (!supabaseConfigured || !authUser || !profile?.role) return undefined
    let active = true
    let baseline = null
    const loadAccount = async () => {
      try {
        const isShopkeeper = profile.role === 'shopkeeper'
        const [nextOrders, nextCustomerOrders, nextMessages] = await Promise.all([
          fetchLiveOrders(isShopkeeper ? 'shopkeeper' : 'customer'),
          isShopkeeper ? fetchLiveOrders('customer') : Promise.resolve(null),
          fetchCustomerMessages(),
        ])
        if (!active) return
        if (baseline && notificationEnabledRef.current && typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
          const previousOrderIds = new Set(baseline.orders)
          const newOrder = isShopkeeper ? nextOrders.find((order) => order.status === 'pending' && !previousOrderIds.has(order.dbId || order.id)) : null
          const previousMessageIds = new Set(baseline.messages)
          const newMessage = nextMessages.find((message) => !previousMessageIds.has(message.id))
          if (newOrder) showOrderNotification('New customer order', newOrder.id + ' from ' + newOrder.name)
          else if (newMessage) showOrderNotification('Order update', newMessage.body)
        }
        baseline = {
          orders: nextOrders.map((order) => order.dbId || order.id),
          messages: nextMessages.map((message) => message.id),
        }
        setOrders(nextOrders)
        setCustomerOrders(isShopkeeper ? nextCustomerOrders : nextOrders)
        setCustomerMessages(nextMessages)
      } catch (error) {
        if (active) setLiveError('Could not load account updates: ' + error.message)
      }
    }
    void loadAccount()
    const unsubscribe = subscribeToAccount(() => { void loadAccount() }, (status, error) => {
      if (status === 'SUBSCRIBED') setRealtimeConnected(true)
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setRealtimeConnected(false)
        setLiveError('Realtime account updates failed. Check the API server and database connection.' + (error?.message ? ' ' + error.message : ''))
      }
    })
    return () => { active = false; unsubscribe() }
  }, [authUser, profile?.role])

  useEffect(() => {
    if (!notice) return undefined
    const timeout = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timeout)
  }, [notice])

  function showOrderNotification(title, body) {
    if (!notificationEnabledRef.current || typeof window === 'undefined' || !('Notification' in window) || window.Notification.permission !== 'granted') return
    try {
      const notification = new window.Notification(title, { body, tag: 'mana-kirana-order-update' })
      notification.onclick = () => window.focus()
    } catch {
      // Browser notifications are optional; the in-app order history remains available.
    }
  }

  async function toggleOrderNotifications() {
    if (!authUser || !profile?.role || typeof window === 'undefined' || !('Notification' in window)) {
      setNotice('Browser notifications are not available in this browser.')
      return
    }
    const key = 'mana-kirana-order-alerts:v1:' + authUser.id + ':' + profile.role
    if (notificationsEnabled) {
      try { localStorage.removeItem(key) } catch { /* Keep the in-app experience available if storage is blocked. */ }
      notificationEnabledRef.current = false
      setNotificationsEnabled(false)
      setNotice('Browser order alerts disabled.')
      return
    }
    let permission = window.Notification.permission
    if (permission === 'default') permission = await window.Notification.requestPermission()
    setNotificationPermission(permission)
    if (permission !== 'granted') {
      setNotice(permission === 'denied' ? 'Allow notifications for this site in your browser settings to enable alerts.' : 'Notification permission was not granted.')
      return
    }
    try { localStorage.setItem(key, 'enabled') } catch { /* The setting applies for this open session. */ }
    notificationEnabledRef.current = true
    setNotificationsEnabled(true)
    setNotice('Browser order alerts enabled while Mana Kirana is open.')
  }

  const catalogCategories = useMemo(() => [...new Set(products.map((product) => product.category))], [products])
  const voiceSearchSupported = typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  const categories = useMemo(() => supabaseConfigured
    ? remoteCategories.map((item) => item.name)
    : [...new Set([...catalogCategories, ...customCategories])], [catalogCategories, customCategories, remoteCategories])
  const cartItems = useMemo(() => products.filter((product) => cart[product.id] > 0).map((product) => ({ ...product, quantity: cart[product.id] })), [cart, products])
  const itemCount = cartItems.length + customItems.length
  const orderViewRole = supabaseConfigured ? profile?.role : (view === 'dashboard' ? 'shopkeeper' : 'customer')
  const visibleOrders = useMemo(() => {
    if (supabaseConfigured) {
      return view === 'orders' && profile?.role === 'shopkeeper' ? customerOrders : orders
    }
    const hiddenIds = new Set(demoHiddenOrders[orderViewRole] || [])
    return orders.filter((order) => !hiddenIds.has(order.id))
  }, [orders, customerOrders, demoHiddenOrders, orderViewRole, view, profile?.role])
  const pendingCountOrders = supabaseConfigured && profile?.role === 'shopkeeper' ? orders : visibleOrders
  const pendingCount = pendingCountOrders.filter((order) => order.status === 'pending').length
  const cartTotal = Math.round(cartItems.reduce((total, item) => total + item.price * item.quantity, 0) * 100) / 100
  const couponDiscount = coupon && cartTotal >= coupon.minimumOrder ? Math.round(cartTotal * coupon.discountPercent) / 100 : 0
  const discountedTotal = Math.round((cartTotal - couponDiscount) * 100) / 100
  const successOrderSource = supabaseConfigured && profile?.role === 'shopkeeper' && view !== 'dashboard' ? customerOrders : orders
  const successOrder = successOrderId ? successOrderSource.find((order) => order.id === successOrderId) || (successOrderSnapshot?.id === successOrderId ? successOrderSnapshot : null) : null
  const visibleProducts = useMemo(() => products.filter((product) => {
    const matchesCategory = category === 'All items' || product.category === category
    const searchText = (product.name + ' ' + product.local + ' ' + product.category).toLowerCase()
    return matchesCategory && searchText.includes(search.trim().toLowerCase())
  }), [category, search, products])
  const availableOffers = useMemo(() => offers.filter((offer) =>
    offer.active && new Date(offer.starts_at).getTime() <= Date.now() && (!offer.ends_at || new Date(offer.ends_at).getTime() > Date.now())
  ), [offers])

  async function applyCoupon() {
    if (!couponCode.trim()) { setCouponError('Enter an offer code first.'); return false }
    setCouponBusy(true)
    setCouponError('')
    try {
      const result = await validateLiveOffer(couponCode.trim(), cartTotal)
      setCoupon(result)
      setCouponCode(result.code)
      setNotice(result.code + ' applied. You save ₹' + Number(result.discountAmount).toFixed(2) + '.')
      return true
    } catch (error) {
      setCoupon(null)
      setCouponError(error.message || 'Could not apply this offer code.')
      return false
    } finally { setCouponBusy(false) }
  }

  function removeCoupon() {
    setCoupon(null)
    setCouponCode('')
    setCouponError('')
  }

  async function createOffer(details) {
    try {
      await createLiveOffer(details)
      await refreshLiveCatalog()
      setNotice('Offer ' + details.code.toUpperCase() + ' created.')
      return true
    } catch (error) { setLiveError(error.message); setNotice('Could not create offer: ' + error.message); return false }
  }

  async function toggleOffer(offerId, active) {
    try {
      await updateLiveOffer(offerId, active)
      await refreshLiveCatalog()
      setNotice(active ? 'Offer activated.' : 'Offer paused.')
    } catch (error) { setLiveError(error.message); setNotice('Could not update offer: ' + error.message) }
  }

  async function deleteOffer(offerId, offerCode) {
    try {
      await deleteLiveOffer(offerId)
      await refreshLiveCatalog()
      setNotice('Offer ' + offerCode.toUpperCase() + ' deleted. Past orders are unchanged.')
      return true
    } catch (error) {
      setLiveError(error.message)
      setNotice('Could not delete offer: ' + error.message)
      return false
    }
  }

  async function saveStoreSettings(details) {
    try {
      await updateLiveStoreSettings(details)
      await refreshLiveCatalog()
      setNotice('Store hours and status saved.')
      return true
    } catch (error) { setLiveError(error.message); setNotice('Could not save store hours: ' + error.message); return false }
  }

  async function exportReport(type, date) {
    try {
      await downloadLiveReport(type, date)
      setNotice(type === 'inventory' ? 'Inventory CSV downloaded.' : 'Sales CSV downloaded.')
    } catch (error) { setLiveError(error.message); setNotice('Could not download CSV: ' + error.message) }
  }

  function changeQuantity(productId, quantity) {
    const product = products.find((item) => item.id === productId)
    if (!product) return
    if (quantity > product.stock + 0.001) {
      setNotice('Only ' + product.stock + ' ' + product.unit + ' of ' + product.name + ' are available.')
      const precision = product.unit === 'kg' ? 100 : 1
      quantity = Math.floor((product.stock + 0.000001) * precision) / precision
    }
    setCart((current) => {
      const next = { ...current }
      if (quantity <= 0.001) delete next[productId]
      else next[productId] = Math.round(quantity * 100) / 100
      return next
    })
    setSuccessOrderId('')
  }

  function addSavedItemsToCart(savedItems) {
    const nextCart = { ...cart }
    let added = 0
    let skipped = 0
    for (const savedItem of savedItems) {
      const product = products.find((item) => item.id === savedItem.productId)
      if (!product) { skipped += 1; continue }
      const requested = Number(savedItem.quantity) || 0
      const alreadyInCart = Number(nextCart[product.id]) || 0
      const available = Math.max(0, product.stock - alreadyInCart)
      const precision = product.unit === 'kg' ? 100 : 1
      const quantity = Math.floor((Math.min(requested, available) + 0.000001) * precision) / precision
      if (quantity <= 0) { skipped += 1; continue }
      nextCart[product.id] = Math.round((alreadyInCart + quantity) * 100) / 100
      added += 1
      if (quantity + 0.001 < requested) skipped += 1
    }
    setCart(nextCart)
    selectView('shop')
    setSuccessOrderId('')
    setNotice(added ? added + ' saved item' + (added === 1 ? '' : 's') + ' added at today’s prices.' + (skipped ? ' Some unavailable quantities were skipped.' : '') : 'Those saved items are no longer available.')
  }

  function reorderCollectedOrder(order) {
    if (order.status !== 'collected') return
    const nextCart = { ...cart }
    let added = 0
    let skipped = 0
    for (const item of order.items || []) {
      if (item.custom || !item.productId) { skipped += 1; continue }
      const product = products.find((entry) => entry.id === item.productId)
      if (!product) { skipped += 1; continue }
      const requested = Number(item.quantity) || 0
      const inCart = Number(nextCart[product.id]) || 0
      const available = Math.max(0, product.stock - inCart)
      const precision = product.unit === 'kg' ? 100 : 1
      const quantity = Math.floor((Math.min(requested, available) + 0.000001) * precision) / precision
      if (quantity <= 0) { skipped += 1; continue }
      nextCart[product.id] = Math.round((inCart + quantity) * 100) / 100
      added += 1
      if (quantity + 0.001 < requested) skipped += 1
    }
    setCart(nextCart)
    selectView('shop')
    setSuccessOrderId('')
    setNotice(added ? 'Previous order added to your basket at current prices.' + (skipped ? ' Some items or quantities were unavailable.' : '') : 'No items from this order are currently available.')
  }

  function changeFromCart(productId, quantity) {
    const product = products.find((item) => item.id === productId)
    if (product) changeQuantity(productId, quantity)
  }

  async function saveProduct(productId, changes) {
    const product = products.find((item) => item.id === productId)
    if (!product) return
    if (supabaseConfigured) {
      try {
        await updateLiveProduct(productId, changes)
        await refreshLiveCatalog()
        setNotice(product.name + ' rate and stock updated for everyone.')
      } catch (error) { setLiveError(error.message); setNotice('Could not save item: ' + error.message) }
      return
    }
    setProducts((current) => current.map((item) => item.id === productId ? { ...item, ...changes } : item))
    if (changes.stock < (cart[productId] || 0)) {
      const precision = product.unit === 'kg' ? 100 : 1
      const safeQuantity = Math.floor((changes.stock + 0.000001) * precision) / precision
      setCart((current) => {
        const next = { ...current }
        if (safeQuantity <= 0) delete next[productId]
        else next[productId] = safeQuantity
        return next
      })
      setNotice('Stock updated. The basket was adjusted to the available quantity.')
    } else {
      setNotice(product.name + ' rate and stock updated.')
    }
  }

  async function addProduct(details) {
    if (supabaseConfigured) {
      try {
        const categoryRow = remoteCategories.find((item) => item.name === details.category)
        if (!categoryRow) throw new Error('Choose an active category.')
        await createLiveProduct(details, categoryRow.id)
        await refreshLiveCatalog()
        setCategory('All items')
        setSearch('')
        setNotice(details.name + ' added to the shared catalogue.')
        return true
      } catch (error) { setLiveError(error.message); setNotice('Could not add item: ' + error.message); return false }
    }
    const baseId = details.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'
    const id = baseId + '-' + Date.now().toString().slice(-5)
    const emoji = details.category.toLowerCase().includes('dairy') ? '🥛' : details.category.toLowerCase().includes('fresh') ? '🥬' : details.category.toLowerCase().includes('snack') ? '🥨' : '🛍️'
    const product = { ...details, id, step: details.unit === 'kg' ? 0.25 : 1, emoji, tint: 'new', note: 'Added by the shopkeeper' }
    setProducts((current) => [...current, product])
    setCategory('All items')
    setSearch('')
    setNotice(product.name + ' added to the customer catalogue.')
    return true
  }

  async function addCategory(value) {
    const name = value.trim()
    if (!name) return false
    if (categories.some((categoryName) => categoryName.toLowerCase() === name.toLowerCase())) {
      setNotice(name + ' category already exists.')
      return false
    }
    if (supabaseConfigured) {
      try {
        await createLiveCategory(name)
        await refreshLiveCatalog()
      } catch (error) { setLiveError(error.message); setNotice('Could not add category: ' + error.message); return false }
    } else setCustomCategories((current) => [...current, name])
    setNotice(name + ' category added. It is ready to use for products.')
    return true
  }

  async function removeCategory(name) {
    if (supabaseConfigured) {
      try {
        const categoryRow = remoteCategories.find((item) => item.name === name)
        if (!categoryRow) return
        const result = await archiveLiveCategory(categoryRow.id)
        await refreshLiveCatalog()
        setCategory((current) => current === name ? 'All items' : current)
        setNotice(result.moved_products
          ? `${name} removed. ${result.moved_products} catalogue item${result.moved_products === 1 ? '' : 's'} moved to ${result.fallback}.`
          : `${name} category removed.`)
      } catch (error) { setLiveError(error.message); setNotice('Could not remove category: ' + error.message) }
      return
    }
    const matchingProducts = products.filter((product) => product.category === name)
    const replacement = name.toLowerCase() === 'other' ? 'Uncategorized' : 'Other'
    const fallback = categories.find((categoryName) => categoryName.toLowerCase() === replacement.toLowerCase()) || replacement
    setProducts((current) => current.map((product) => product.category === name ? { ...product, category: fallback } : product))
    setCustomCategories((current) => {
      const withoutRemoved = current.filter((categoryName) => categoryName.toLowerCase() !== name.toLowerCase())
      if (matchingProducts.length && !categories.some((categoryName) => categoryName.toLowerCase() === fallback.toLowerCase())) return [...withoutRemoved, fallback]
      return withoutRemoved
    })
    setCategory((current) => current === name ? 'All items' : current)
    setNotice(matchingProducts.length
      ? `${name} removed. ${matchingProducts.length} catalogue ${matchingProducts.length === 1 ? 'item was' : 'items were'} moved to ${fallback}.`
      : `${name} category removed.`)
  }

  function addCustomItem(item) {
    setCustomItems((current) => [...current, { ...item, id: 'request-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) }])
    setPayment('pickup')
    setSuccessOrderId('')
    setNotice('Request added. The shopkeeper will set its rate at the shop.')
  }

  function removeCustomItem(id) {
    setCustomItems((current) => current.filter((item) => item.id !== id))
  }

  async function removeProduct(productId) {
    const product = products.find((item) => item.id === productId)
    if (!product) return
    if (supabaseConfigured) {
      try {
        await archiveLiveProduct(productId)
        await refreshLiveCatalog()
        setCart((current) => { const next = { ...current }; delete next[productId]; return next })
        setNotice(product.name + ' removed from the shared catalogue.')
      } catch (error) { setLiveError(error.message); setNotice('Could not remove item: ' + error.message) }
      return
    }
    setProducts((current) => current.filter((item) => item.id !== productId))
    setCart((current) => {
      const next = { ...current }
      delete next[productId]
      return next
    })
    setNotice(product.name + ' removed from the customer catalogue.')
  }

  function selectChannel(next) {
    setChannel(next)
    setSuccessOrderId('')
    const url = new URL(window.location.href)
    if (next === 'online') url.searchParams.delete('mode')
    else url.searchParams.set('mode', next)
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  }

  function toggleVoiceSearch() {
    if (voiceRecognitionRef.current) {
      voiceRecognitionRef.current.stop()
      return
    }
    const Recognition = typeof window === 'undefined' ? null : window.SpeechRecognition || window.webkitSpeechRecognition
    if (!Recognition) {
      setVoiceSearchMessage('Voice search is not supported in this browser. You can type your search instead.')
      return
    }
    const recognition = new Recognition()
    recognition.lang = voiceSearchLanguage
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event) => {
      const transcript = String(event.results?.[0]?.[0]?.transcript || '').trim()
      if (transcript) {
        setSearch(transcript)
        setVoiceSearchMessage('Searching for “' + transcript + '”.')
      } else {
        setVoiceSearchMessage('I could not hear a product name. Try again or type it.')
      }
    }
    recognition.onerror = (event) => {
      setVoiceSearchMessage(event.error === 'not-allowed'
        ? 'Allow microphone access in your browser to use voice search.'
        : event.error === 'no-speech'
          ? 'No speech was detected. Try again or type your search.'
          : 'Voice search could not start. Try again or type your search.')
    }
    recognition.onend = () => {
      voiceRecognitionRef.current = null
      setVoiceSearchActive(false)
    }
    voiceRecognitionRef.current = recognition
    setVoiceSearchActive(true)
    setVoiceSearchMessage('Listening…')
    try {
      recognition.start()
    } catch {
      voiceRecognitionRef.current = null
      setVoiceSearchActive(false)
      setVoiceSearchMessage('Voice search could not start. Try again or type your search.')
    }
  }

  async function submitOrder(event) {
    event.preventDefault()
    if (!cartItems.length && !customItems.length) return
    if (supabaseConfigured && storeStatus && !storeStatus.acceptingOrders) {
      setNotice(storeStatus.message || 'The shop is closed right now.')
      return
    }
    if (cartTotal <= MINIMUM_ORDER_VALUE) {
      setNotice('The confirmed item subtotal must be more than ₹200. Unpriced requests do not count toward the minimum.')
      return
    }
    if (coupon && discountedTotal <= MINIMUM_ORDER_VALUE) {
      setNotice('Add more items so the order remains above ₹200 after the offer.')
      return
    }
    if (supabaseConfigured && !authUser) {
      setAuthDialogRole('customer')
      setShowAuthDialog(true)
      setNotice('Sign in with your mobile number to confirm and submit this order.')
      return
    }

    const primaryPhone = supabaseConfigured ? authUser?.phone : phone
    const digits = String(primaryPhone || '').replace(/\D/g, '').slice(-10)
    if (!/^[6-9]\d{9}$/.test(digits)) {
      setNotice(supabaseConfigured
        ? 'Your account mobile number is missing or invalid. Update it in Edit profile before ordering.'
        : 'Enter a valid 10-digit Indian mobile number.')
      return
    }
    const pickupDigits = String(alternatePickupPhone || '').replace(/\D/g, '')
    if (alternatePickupPhone.trim() && !/^[6-9]\d{9}$/.test(pickupDigits)) {
      setNotice('Enter a valid 10-digit alternate pickup number or clear the optional field.')
      return
    }

    if (supabaseConfigured) {
      const accountDigits = String(authUser.phone || '').replace(/\D/g, '').slice(-10)
      if (accountDigits !== digits) {
        setNotice('Your account number changed. Refresh the page and try again.')
        return
      }
      try {
        const orderDetails = {
          name: customerName.trim(),
          phone: digits,
          pickupPhone: pickupDigits ? '+91' + pickupDigits : null,
          channel,
          payment: customItems.length ? 'pickup' : payment === 'upi' ? 'upi_demo' : 'pickup',
          offerCode: coupon?.code || '',
          items: [
            ...cartItems.map((item) => ({ product_id: item.id, name: item.name, emoji: item.emoji, quantity: item.quantity, unit: item.unit, price: item.price, line_total: Math.round(item.price * item.quantity * 100) / 100, custom: false, price_confirmed: true })),
            ...customItems.map((item) => ({ product_id: null, name: item.name, emoji: '📝', quantity: item.quantity, unit: item.unit, price: null, line_total: null, custom: true, price_confirmed: false })),
          ],
        }
        const acceptedPriceChanges = new Map()
        let result
        while (!result) {
          try {
            result = await placeLiveOrder({
              ...orderDetails,
              acceptedPriceChanges: Array.from(acceptedPriceChanges, ([product_id, price]) => ({ product_id, price })),
            })
          } catch (error) {
            const changes = error.payload?.priceChanges
            if (error.status !== 409 || !Array.isArray(changes) || !changes.length) throw error
            const details = changes.map((change) => {
              const previous = change.old_price == null ? 'price unavailable' : formatMoney(change.old_price)
              return '• ' + change.name + ': ' + previous + ' → ' + formatMoney(change.new_price) + ' per ' + change.unit
            }).join('\n')
            const confirmed = window.confirm('Some catalogue prices changed since you added these items:\n\n' + details + '\n\nPlace the order using these current prices?')
            if (!confirmed) {
              await refreshLiveCatalog().catch(() => {})
              setNotice('Price changes were not accepted. Review the refreshed basket before ordering.')
              return
            }
            for (const change of changes) acceptedPriceChanges.set(String(change.product_id), Number(change.new_price))
          }
        }
        const id = 'MK-' + String(result.order_number).padStart(6, '0')
        setSuccessOrderSnapshot({ id, estimatedReadyAt: result.estimated_ready_at, status: 'pending', pickupPin: result.pickup_pin, total: Number(result.total), subtotal: Number(result.subtotal), discountAmount: Number(result.discount_amount || 0) })
        setCart({})
        setCustomItems([])
        setAlternatePickupPhone('')
        removeCoupon()
        setSuccessOrderId(id)
        setMobileCartOpen(false)
        await Promise.all([refreshLiveCatalog(), refreshLiveAccount()])
        setNotice('Order ' + id + ' placed. Your account will show preparation updates.')
      } catch (error) {
        setLiveError(error.message)
        setNotice('Order not placed: ' + error.message)
      }
      return
    }

    const id = 'MK-' + String(Date.now()).slice(-6)
    const order = {
      id,
      name: customerName.trim(),
      phone: digits.slice(0, 5) + ' ' + digits.slice(5),
      pickupPhone: pickupDigits ? '+91 ' + pickupDigits : '',
      channel,
      status: 'pending',
      payment: customItems.length ? 'Pay at pickup · requested prices pending' : payment === 'upi' ? 'UPI · demo only' : 'Pay at pickup · demo',
      total: cartTotal,
      estimatedReadyAt: calculateReadyAt(orders),
      createdAt: new Date().toISOString(),
      sample: false,
      stockDeducted: cartItems.length > 0,
      items: [...cartItems.map((item) => ({
        productId: item.id,
        name: item.name,
        emoji: item.emoji,
        quantity: item.quantity,
        unit: item.unit,
        price: item.price,
        lineTotal: Math.round(item.price * item.quantity * 100) / 100,
        custom: false,
      })), ...customItems.map((item) => ({
        productId: item.id,
        name: item.name,
        emoji: '📝',
        quantity: item.quantity,
        unit: item.unit,
        price: null,
        lineTotal: null,
        custom: true,
        priced: false,
      }))],
    }
    setProducts((current) => current.map((product) => {
      const orderedItem = order.items.find((item) => item.productId === product.id)
      return orderedItem ? { ...product, stock: Math.max(0, Math.round((product.stock - orderedItem.quantity) * 100) / 100) } : product
    }))
    setOrders((current) => [order, ...current])
    setCart({})
    setCustomItems([])
    setAlternatePickupPhone('')
    setSuccessOrderId(id)
    setMobileCartOpen(false)
    setNotice('Order ' + id + ' sent to ' + orderChannelLabel(channel).toLowerCase() + '.')
  }

  async function updateOrder(id, status, pickupPin) {
    if (supabaseConfigured) {
      const existingOrder = orders.find((order) => order.id === id)
      try {
        await updateLiveOrderStatus(existingOrder?.dbId, status, pickupPin)
        await Promise.all([refreshLiveAccount(), status === 'rejected' ? refreshLiveCatalog() : Promise.resolve()])
        setNotice(status === 'rejected' ? 'Order declined.' : 'Order updated to ' + (status === 'preparing' ? 'Preparing' : status === 'ready' ? 'Ready for pickup' : 'Collected') + '.')
      } catch (error) { setLiveError(error.message); setNotice('Could not update order: ' + error.message) }
      return
    }
    const existingOrder = orders.find((order) => order.id === id)
    if (status === 'rejected' && existingOrder?.stockDeducted && !existingOrder.stockRestored) {
      setProducts((current) => current.map((product) => {
        const returnedItem = existingOrder.items.find((item) => item.productId === product.id)
        return returnedItem ? { ...product, stock: Math.round((product.stock + returnedItem.quantity) * 100) / 100 } : product
      }))
    }
    setOrders((current) => current.map((order) => order.id === id ? { ...order, status, updatedAt: new Date().toISOString() } : order))
    setNotice(status === 'rejected' ? 'Order declined.' : 'Order updated to ' + (status === 'preparing' ? 'Preparing' : status === 'ready' ? 'Ready for pickup' : 'Collected') + '.')
  }

  async function deleteOrder(id) {
    const historyScope = supabaseConfigured
      ? profile?.role === 'shopkeeper' && view === 'dashboard' ? 'shopkeeper' : 'customer'
      : view === 'dashboard' ? 'shopkeeper' : 'customer'
    const historyOrders = supabaseConfigured && historyScope === 'customer' && profile?.role === 'shopkeeper' ? customerOrders : orders
    const existingOrder = historyOrders.find((order) => order.id === id)
    const actorRole = historyScope
    const readyAtMs = Date.parse(existingOrder?.readyAt || '')
    const shopkeeperReadyExpired = actorRole === 'shopkeeper'
      && existingOrder?.status === 'ready'
      && Number.isFinite(readyAtMs)
      && Date.now() - readyAtMs >= 24 * 60 * 60 * 1000
    const customerReleasedOrder = actorRole === 'customer'
      && existingOrder?.status === 'ready'
      && existingOrder?.shopkeeperRemoved
    const canDelete = existingOrder?.status === 'collected' || shopkeeperReadyExpired || customerReleasedOrder
    if (!existingOrder || !canDelete || deletingOrderId || !['customer', 'shopkeeper'].includes(actorRole)) return

    const otherSide = actorRole === 'customer' ? 'shopkeeper' : 'customer'
    const confirmation = shopkeeperReadyExpired
      ? 'Remove uncollected order ' + id + ' from the shopkeeper admin list? It has been ready for over 24 hours. The customer can then remove it from their own history. The order record and item details remain stored.'
      : customerReleasedOrder
        ? 'Remove order ' + id + ' from your customer history? The shopkeeper has already removed it from their active list. The order record remains stored.'
        : 'Remove collected order ' + id + ' from your ' + actorRole + ' history? It will remain visible in the ' + otherSide + ' history. The order and its item details will not be deleted.'
    if (!window.confirm(confirmation)) return

    setDeletingOrderId(id)
    try {
      if (supabaseConfigured) {
        if (!existingOrder.dbId) throw new Error('Could not identify this order.')
        await hideLiveOrder(existingOrder.dbId, actorRole)
        if (actorRole === 'customer') {
          setCustomerOrders((current) => current.filter((order) => order.id !== id))
          if (profile?.role !== 'shopkeeper') setOrders((current) => current.filter((order) => order.id !== id))
          setCustomerMessages((current) => current.filter((message) => message.order_id !== existingOrder.dbId))
        } else {
          setOrders((current) => current.filter((order) => order.id !== id))
        }
        if (successOrderId === id) {
          setSuccessOrderId('')
          setSuccessOrderSnapshot(null)
        }
        const noticeMessage = shopkeeperReadyExpired
          ? 'Order ' + id + ' removed from the admin list. The customer can now remove it from their history.'
          : customerReleasedOrder
            ? 'Order ' + id + ' removed from your customer history.'
            : 'Order ' + id + ' removed from your ' + actorRole + ' history. It remains in the ' + otherSide + ' history.'
        setNotice(noticeMessage)
        void refreshLiveAccount().catch((error) => setLiveError('History updated, but account data could not refresh: ' + error.message))
        return
      }
      setDemoHiddenOrders((current) => ({
        ...current,
        [actorRole]: [...new Set([...(current[actorRole] || []), existingOrder.id])],
      }))
      if (successOrderId === id) {
        setSuccessOrderId('')
        setSuccessOrderSnapshot(null)
      }
      setNotice('Order ' + id + ' removed from your ' + actorRole + ' history. It remains in the ' + otherSide + ' history.')
    } catch (error) {
      setLiveError(error.message)
      setNotice('Could not update your order history: ' + error.message)
    } finally {
      setDeletingOrderId('')
    }
  }

  async function setRequestedItemRate(orderId, itemId, rate) {
    const parsedRate = Number(rate)
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) return
    if (supabaseConfigured) {
      try {
        await setLiveRequestRate(itemId, parsedRate)
        await refreshLiveAccount()
        setNotice('Requested item rate added. The customer account shows the updated total.')
      } catch (error) { setLiveError(error.message); setNotice('Could not set rate: ' + error.message) }
      return
    }
    setOrders((current) => current.map((order) => {
      if (order.id !== orderId) return order
      const items = order.items.map((item) => {
        if (item.productId !== itemId || !item.custom || item.priced) return item
        return { ...item, price: parsedRate, lineTotal: Math.round(parsedRate * item.quantity * 100) / 100, priced: true }
      })
      const total = items.reduce((sum, item) => sum + (Number(item.lineTotal) || 0), 0)
      return { ...order, items, total }
    }))
    setNotice('Requested item rate added to the order total.')
  }

  function resetSamples() {
    if (supabaseConfigured) return
    setOrders(makeSampleOrders())
    setNotice('Demo orders restored.')
  }

  function cartPanelProps() {
    return {
      items: cartItems,
      customItems,
      total: cartTotal,
      discountAmount: couponDiscount,
      discountedTotal,
      coupon,
      couponCode,
      couponError,
      couponBusy,
      onCouponCodeChange: (value) => { setCouponCode(value); setCoupon(null); setCouponError('') },
      onApplyCoupon: applyCoupon,
      onRemoveCoupon: removeCoupon,
      storeStatus,
      storeAcceptingOrders: !supabaseConfigured || storeStatus?.acceptingOrders === true,
      onChange: changeFromCart,
      onClear: () => { setCart({}); setCustomItems([]); setSuccessOrderId(''); removeCoupon() },
      onRemoveCustomItem: removeCustomItem,
      customerName,
      onNameChange: setCustomerName,
      phone,
      onPhoneChange: setPhone,
      accountPhone: authUser?.phone || '',
      alternatePickupPhone,
      onAlternatePickupPhoneChange: setAlternatePickupPhone,
      payment,
      onPaymentChange: setPayment,
      onSubmit: submitOrder,
      channelLabel: orderChannelLabel(channel),
      successOrderId,
      successOrder,
      minimumOrderValue: MINIMUM_ORDER_VALUE,
      liveMode: supabaseConfigured,
    }
  }

  return (
    <div className="app-shell min-h-screen" id="top">
      <AppHeader view={view} onViewChange={selectView} itemCount={itemCount} pendingCount={pendingCount} authUser={authUser} profileRole={profile?.role} theme={theme} onToggleTheme={() => setTheme((currentTheme) => currentTheme === 'dark' ? 'light' : 'dark')} onCustomerSignIn={() => { setAuthDialogRole('customer'); setShowAuthDialog(true) }} onShopkeeperSignIn={() => { setAuthDialogRole('shopkeeper'); setShowAuthDialog(true) }} onEditProfile={() => setShowEditProfileDialog(true)} onChangePassword={() => setShowChangePasswordDialog(true)} onAddAccount={() => setShowAccountSwitcherDialog(true)} onSwitchAccount={handleAccountSwitch} accountSwitchBusy={accountSwitchBusy} onSignOut={() => { setSignOutError(''); setShowSignOutDialog(true) }} />
      {notice && <div className="toast" role="status"><Check size={16} />{notice}<button type="button" onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}
      <main className="wrap">
        {supabaseConfigured ? <p className="note live-note"><span className={"store-status-dot" + (realtimeConnected ? "" : " is-connecting")} aria-hidden="true" /><strong>Venkata Kusuma Haranth General Stores</strong><span>{realtimeConnected ? 'Live prices and availability' : 'Connecting to live prices'}</span></p> : <p className="note"><strong>Sample catalogue.</strong> Orders and changes stay in this browser only.</p>}
        {liveError && <p className="live-error" role="alert">{liveError}</p>}
        {authUser && view === 'shop' && (customerWelcome || profile?.role === 'shopkeeper') && (
          <section className="customer-welcome" role="status" aria-live="polite">
            <div className="customer-welcome-icon" aria-hidden="true">👋</div>
            <div className="customer-welcome-copy">
              <p className="customer-welcome-kicker">Glad you’re here</p>
              <h2>Welcome, {customerWelcome || profile?.full_name || authUser.full_name || 'there'}!</h2>
              <p>Your neighbourhood groceries are ready when you are.</p>
            </div>
            <button className="customer-welcome-dismiss" type="button" onClick={() => setCustomerWelcome('')} aria-label="Dismiss welcome message">×</button>
          </section>
        )}
        {view === 'dashboard' ? (
          profileLoading
            ? <section className="access-gate"><h2>Checking account access…</h2><p>Please wait while the selected profile loads.</p></section>
            : !supabaseConfigured || profile?.role === 'shopkeeper'
              ? <Dashboard orders={visibleOrders} products={products} categories={categories} onAddCategory={addCategory} onRemoveCategory={removeCategory} onUpdateOrder={updateOrder} onDeleteOrder={deleteOrder} deletingOrderId={deletingOrderId} onSetRequestedItemRate={setRequestedItemRate} onResetSamples={resetSamples} onSaveProduct={saveProduct} onAddProduct={addProduct} onRemoveProduct={removeProduct} liveMode={supabaseConfigured} realtimeConnected={realtimeConnected} shopkeeperName={profile?.full_name || (supabaseConfigured ? 'Shopkeeper' : 'Ramesh')} notificationEnabled={notificationsEnabled} notificationPermission={notificationPermission} onToggleNotifications={toggleOrderNotifications} onLoadDailySales={fetchDailySales} onLoadRestock={fetchRestockSuggestions} offers={offers} storeStatus={storeStatus} onCreateOffer={createOffer} onToggleOffer={toggleOffer} onDeleteOffer={deleteOffer} onSaveStoreSettings={saveStoreSettings} onExportReport={exportReport} />
             : <section className="access-gate">
               <h1>Shopkeeper access</h1>
               <p>{!authUser
                 ? 'Sign in with your shopkeeper account to manage orders, stock, rates, and categories.'
                 : authUser.role === 'customer'
                   ? authUser.linkedAccount?.role === 'shopkeeper'
                     ? 'Your customer account is active. Switch to your linked shopkeeper account to manage orders and stock.'
                     : 'Your customer account is active. Link your shopkeeper account once to manage store orders and stock.'
                   : 'Shopkeeper access could not be confirmed. Refresh the page or contact support.'}</p>
               {!authUser
                 ? <button className="btn primary" type="button" onClick={() => { setAuthDialogRole('shopkeeper'); setShowAuthDialog(true) }}>Sign in as Shopkeeper</button>
                 : authUser.role === 'customer'
                   ? authUser.linkedAccount?.role === 'shopkeeper'
                     ? <button className="btn primary" type="button" disabled={accountSwitchBusy} onClick={handleAccountSwitch}>Switch to Shopkeeper</button>
                     : <button className="btn primary" type="button" onClick={() => setShowAccountSwitcherDialog(true)}>Link Shopkeeper Account</button>
                   : null}
             </section>
        ) : view === 'orders' ? (
          <section className="view customer-page customer-order-page" aria-label="Previous orders">
            <div className="page-heading">
              <h1>Previous orders</h1>
              <p className="muted">Review orders placed from this account. Delete buttons are available for collected orders.</p>
            </div>
            {profileLoading ? <div className="empty-results"><strong>Loading your orders…</strong></div> : (profile?.role === 'customer' || profile?.role === 'shopkeeper')
              ? <CustomerOrderHistory orders={visibleOrders} onDeleteOrder={deleteOrder} deletingOrderId={deletingOrderId} onReorderOrder={reorderCollectedOrder} />
              : <section className="access-gate"><h2>Sign in to view order history</h2><p>Sign in to see orders placed from this account.</p><button className="btn primary" type="button" onClick={() => { setAuthDialogRole('customer'); setShowAuthDialog(true) }}>Sign in as Customer</button></section>}
          </section>
        ) : (
          <section className="view customer-page" aria-label="Customer ordering">
            <div className="page-heading store-hero">
              <div className="store-hero-copy">
                <span className="store-hero-kicker">YOUR NEIGHBOURHOOD KIRANA</span>
                <h1>Everyday groceries, made easier.</h1>
                <p>Shop trusted essentials from Venkata Kusuma Haranth General Stores, then pick them up at a time that works for you.</p>
                <a className="store-hero-cta" href="#shop-products">Browse groceries <ArrowRight size={17} /></a>
              </div>
              <div className="store-hero-art" aria-hidden="true"><span className="store-hero-orbit" /><span className="store-hero-bag">🛍️</span><span className="store-hero-tag">LOCAL<br />PICKUP</span></div>
            </div>
            {storeStatus && <section className={'store-status-banner ' + (storeStatus.acceptingOrders ? 'is-open' : 'is-closed')} aria-live="polite">
              <span className="store-status-indicator">{storeStatus.acceptingOrders ? 'OPEN' : 'CLOSED'}</span>
              <div><strong>{storeStatus.acceptingOrders ? 'Taking orders now' : 'Orders are paused'}</strong><p>{storeStatus.message}</p></div>
            </section>}
            {availableOffers.length > 0 && <section className="public-offers" aria-label="Available offers">
              <div><p className="eyebrow">SAVE ON YOUR BASKET</p><h2>Offers at this store</h2></div>
              <ul>{availableOffers.map((offer) => <li key={offer.id}><strong>{offer.discountPercent}% off</strong><span>{offer.title}</span><code>{offer.code}</code><small>On orders above {formatMoney(offer.minimumOrder)}</small></li>)}</ul>
            </section>}
            {supabaseConfigured && authUser && customerMessages.length > 0 && <section className="account-messages" aria-label="Order updates"><div><h2>Your order updates</h2><span>Live messages for this account</span></div><ul>{customerMessages.slice(0, 4).map((message) => <li key={message.id}><span>{message.body}</span><time>{new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' }).format(new Date(message.created_at))}</time></li>)}</ul></section>}
            <div className="shopping-info-bar" aria-label="Pickup and ordering information">
              <div><span className="shopping-info-icon">₹</span><span><strong>Order above ₹200</strong><small>Pending-price requests don’t count</small></span></div>
              <div><span className="shopping-info-icon">15m</span><span><strong>Quick store pickup</strong><small>Slots are scheduled every 15 minutes</small></span></div>
              <div><span className="shopping-info-icon">+</span><span><strong>Need another item?</strong><small>Request it below; the shop confirms the price</small></span></div>
            </div>
            <OrderMode channel={channel} onChange={selectChannel} />
            {supabaseConfigured && !authUser && <p className="account-prompt"><strong>Ready to order?</strong> Sign in once to check out with your account mobile number. <button type="button" onClick={() => { setAuthDialogRole('customer'); setShowAuthDialog(true) }}>Sign in</button></p>}
            {liveLoading && products.length === 0 ? <div className="empty-results"><strong>Loading the shared catalogue…</strong></div> : <div className="shop-layout" id="shop-products">
              <section className="catalog-section" aria-label="Products">
                <div className="catalog-toolbar">
                  <div className="search-control">
                    <label htmlFor="product-search">Search the shop</label>
                    <div className="search-entry">
                      <input id="product-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try rice, dal or పాలు" />
                      <select className="voice-language-select" value={voiceSearchLanguage} onChange={(event) => setVoiceSearchLanguage(event.target.value)} aria-label="Voice search language">
                        <option value="te-IN">తెలుగు</option>
                        <option value="en-IN">English</option>
                      </select>
                      <button className="voice-search-button" type="button" onClick={toggleVoiceSearch} aria-label={voiceSearchActive ? 'Stop voice search' : 'Start voice search'} aria-pressed={voiceSearchActive} title={voiceSearchSupported ? 'Speak a product name in Telugu or English' : 'Voice search is not supported in this browser'}>
                        {voiceSearchActive ? 'Stop listening' : '🎙 Speak'}
                      </button>
                    </div>
                    {voiceSearchMessage && <p className="voice-search-message" role="status">{voiceSearchMessage}</p>}
                  </div>
                  <div className="category-list" role="group" aria-label="Product categories">
                    {['All items', ...catalogCategories].map((item) => (
                      <button key={item} type="button" className="chip" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>
                    ))}
                  </div>
                </div>
                <p className="results-label">{category === 'All items' ? 'Everyday essentials' : category}<span> · {visibleProducts.length} items</span></p>
                {visibleProducts.length ? (
                  <ul className="product-list">{visibleProducts.map((product) => (
                    <ProductCard key={product.id} product={product} quantity={cart[product.id] || 0} onChange={(quantity) => changeQuantity(product.id, quantity)} />
                  ))}</ul>
                ) : (
                  <div className="empty-results"><strong>Nothing matches that search.</strong><span>Try another word or pick a category.</span></div>
                )}
                <UnlistedItemForm onAdd={addCustomItem} />
              </section>
              <aside className="desktop-cart"><CartPanel {...cartPanelProps()} /></aside>
            </div>}
            <div className="customer-secondary-tools">
              <details className="saved-list-disclosure">
                <summary><span>Your regular shopping lists</span><small>Save a basket for a quick repeat order</small></summary>
                <div className="saved-list-disclosure-body"><SavedShoppingLists key={savedShoppingListsKey} storageKey={savedShoppingListsKey} items={cartItems} products={products} onLoadItems={addSavedItemsToCart} /></div>
              </details>
              {supabaseConfigured && authUser && <OrderNotificationControl enabled={notificationsEnabled} permission={notificationPermission} onToggle={toggleOrderNotifications} />}
            </div>
          </section>
        )}
      </main>

      <SiteFooter />

      {view === 'shop' && itemCount > 0 && (
        <button className="mobile-cart-bar" type="button" onClick={() => setMobileCartOpen(true)}>
          <span>{itemCount} {itemCount === 1 ? 'item' : 'items'} · {customItems.length ? formatMoney(discountedTotal) + ' confirmed + price pending' : formatMoney(discountedTotal)}</span><strong>View bill <ArrowRight size={16} /></strong>
        </button>
      )}
      {mobileCartOpen && (
        <div className="mobile-cart-overlay" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) setMobileCartOpen(false) }}>
          <div className="mobile-cart-drawer">
            <div className="drawer-handle" /><button className="drawer-close" type="button" onClick={() => setMobileCartOpen(false)} aria-label="Close bill">×</button>
            <CartPanel {...cartPanelProps()} />
          </div>
        </div>
      )}
      <button className="help-button" type="button" onClick={() => setNotice('For this prototype, all orders are for pickup at Venkata Kusuma Haranth General Stores.')}><CircleHelp size={16} /><span>Need help?</span></button>
      {showSignOutDialog && (
        <div
          className="auth-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !signOutBusy) {
              setShowSignOutDialog(false)
              setSignOutError('')
            }
          }}
        >
          <section
            className="auth-dialog signout-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="signout-title"
          >
            <button
              className="auth-close"
              type="button"
              aria-label="Close sign-out dialog"
              disabled={signOutBusy}
              onClick={() => {
                setShowSignOutDialog(false)
                setSignOutError('')
              }}
            >
              ×
            </button>
            <p className="eyebrow">MANA KIRANA ACCOUNT</p>
            <h2 id="signout-title">Sign out of Mana Kirana?</h2>
            <p className="muted">This will end your current session on this device. You can sign in again anytime.</p>
            <div className="auth-form">
              <button
                className="btn primary"
                type="button"
                disabled={signOutBusy || !authUser}
                onClick={() => { void handleConfirmedSignOut() }}
              >
                {signOutBusy ? 'Signing out…' : 'Sign out'}
              </button>
              <button
                className="btn"
                type="button"
                disabled={signOutBusy}
                onClick={() => {
                  setShowSignOutDialog(false)
                  setSignOutError('')
                }}
              >
                Cancel
              </button>
            </div>
            {signOutError && <p className="auth-error" role="alert">{signOutError}</p>}
          </section>
        </div>
      )}
      {showAuthDialog && <AuthDialog role={authDialogRole} onClose={() => setShowAuthDialog(false)} />}
      {showAccountSwitcherDialog && authUser && <AccountSwitcherDialog currentUser={authUser} onClose={() => setShowAccountSwitcherDialog(false)} onLinked={handleAccountLinked} />}
      {showChangePasswordDialog && <ChangePasswordDialog onClose={() => setShowChangePasswordDialog(false)} />}
      {showEditProfileDialog && authUser && <EditProfileDialog authUser={authUser} onClose={() => setShowEditProfileDialog(false)} onUpdated={handleProfileUpdated} />}
    </div>
  )
}

export default App
