export const PRODUCTS = [
  { id: 'tomato', name: 'Farm tomatoes', local: 'తాజా టమాటాలు', category: 'Fresh', price: 36, unit: 'kg', step: 0.25, stock: 18, emoji: '🍅', tint: 'tomato', note: 'Ripe & juicy' },
  { id: 'potato', name: 'Potatoes', local: 'బంగాళాదుంపలు', category: 'Fresh', price: 32, unit: 'kg', step: 0.5, stock: 22, emoji: '🥔', tint: 'potato', note: 'Everyday essential' },
  { id: 'onion', name: 'Red onions', local: 'ఎర్ర ఉల్లిపాయలు', category: 'Fresh', price: 42, unit: 'kg', step: 0.5, stock: 14, emoji: '🧅', tint: 'onion', note: 'Locally sourced' },
  { id: 'banana', name: 'Robusta bananas', local: 'అరటిపండ్లు', category: 'Fresh', price: 48, unit: 'dozen', step: 1, stock: 12, emoji: '🍌', tint: 'banana', note: 'Naturally sweet' },
  { id: 'rice', name: 'Sona masoori rice', local: 'సోనా మసూరి బియ్యం', category: 'Staples', price: 68, unit: 'kg', step: 0.5, stock: 35, emoji: '🍚', tint: 'rice', note: 'Loose · polished' },
  { id: 'toor-dal', name: 'Toor dal', local: 'కందిపప్పు', category: 'Staples', price: 158, unit: 'kg', step: 0.25, stock: 11, emoji: '🫘', tint: 'dal', note: 'Loose · unpolished' },
  { id: 'atta', name: 'Whole wheat atta', local: 'గోధుమ పిండి', category: 'Staples', price: 54, unit: 'kg', step: 0.5, stock: 16, emoji: '🌾', tint: 'atta', note: 'Freshly milled' },
  { id: 'chilli', name: 'Red chilli powder', local: 'కారం పొడి', category: 'Staples', price: 32, unit: '100 g', step: 1, stock: 24, emoji: '🌶️', tint: 'chilli', note: 'Small batch ground' },
  { id: 'milk', name: 'Fresh cow milk', local: 'తాజా పాలు', category: 'Dairy', price: 34, unit: '500 ml', step: 1, stock: 20, emoji: '🥛', tint: 'milk', note: 'Today’s morning batch' },
  { id: 'curd', name: 'Thick set curd', local: 'పెరుగు', category: 'Dairy', price: 38, unit: '500 g', step: 1, stock: 14, emoji: '🥣', tint: 'curd', note: 'Made fresh today' },
  { id: 'paneer', name: 'Malai paneer', local: 'పనీర్', category: 'Dairy', price: 92, unit: '200 g', step: 1, stock: 8, emoji: '🧀', tint: 'paneer', note: 'Soft & creamy' },
  { id: 'murukku', name: 'Homestyle murukku', local: 'మురుకులు', category: 'Snacks', price: 55, unit: 'pack', step: 1, stock: 18, emoji: '🥨', tint: 'snack', note: 'A little tea-time joy' },
]

export const STORAGE_KEY = 'mana-kirana-demo-v1'
export const MINIMUM_ORDER_VALUE = 200
export const PICKUP_SLOT_MINUTES = 15

export function formatMoney(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatQuantity(quantity, unit) {
  if (unit === 'kg') {
    if (quantity < 1) return `${Math.round(quantity * 1000)} g`
    return `${Number(quantity.toFixed(2))} kg`
  }
  if (unit === 'piece') return `${quantity} ${quantity === 1 ? 'piece' : 'pieces'}`
  if (unit === 'litre') return `${quantity} ${quantity === 1 ? 'litre' : 'litres'}`
  if (unit === 'dozen') return `${quantity} ${quantity === 1 ? 'dozen' : 'dozens'}`
  if (unit === 'pack') return `${quantity} ${quantity === 1 ? 'pack' : 'packs'}`
  return `${quantity} × ${unit}`
}

export function formatReadyTime(timestamp) {
  if (!timestamp) return 'Time to be confirmed'
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(timestamp))
}

export function getQuantityOptions(product) {
  const available = Math.min(100, Math.max(0, Number(product.stock) || 0))
  if (product.unit !== 'kg') {
    return Array.from({ length: 100 }, (_, index) => {
      const value = index + 1
      return { value, label: formatQuantity(value, product.unit), disabled: value > available + 0.000001 }
    })
  }

  const amounts = new Set()
  for (let grams = 10; grams <= 1000; grams += 10) amounts.add(grams / 1000)
  for (let grams = 1250; grams <= 10_000; grams += 250) amounts.add(grams / 1000)
  for (let kilograms = 11; kilograms <= 100; kilograms += 1) amounts.add(kilograms)
  if (available > 0 && available <= 100) amounts.add(Math.round(available * 100) / 100)

  return [...amounts]
    .sort((a, b) => a - b)
    .map((value) => ({ value, label: formatQuantity(value, 'kg'), disabled: value > available + 0.000001 }))
}

export function orderChannelLabel(channel) {
  if (channel === 'entrance') return 'Entrance QR'
  return 'Online pre-order'
}

function ago(minutes) {
  return new Date(Date.now() - minutes * 60_000).toISOString()
}

export function makeSampleOrders() {
  return [
    {
      id: 'MK-2048', name: 'Ananya Reddy', phone: '••••• 2481', channel: 'entrance',
      status: 'pending', payment: 'Pay at pickup · demo', total: 170,
      createdAt: ago(4), sample: true,
      items: [
        { productId: 'tomato', name: 'Farm tomatoes', emoji: '🍅', quantity: 1, unit: 'kg', price: 36, lineTotal: 36 },
        { productId: 'toor-dal', name: 'Toor dal', emoji: '🫘', quantity: 0.5, unit: 'kg', price: 158, lineTotal: 79 },
        { productId: 'milk', name: 'Fresh cow milk', emoji: '🥛', quantity: 1, unit: '500 ml', price: 34, lineTotal: 34 },
        { productId: 'onion', name: 'Red onions', emoji: '🧅', quantity: 0.5, unit: 'kg', price: 42, lineTotal: 21 },
      ],
    },
    {
      id: 'MK-2047', name: 'Rahul Kumar', phone: '••••• 7306', channel: 'online',
      status: 'preparing', payment: 'UPI · demo only', total: 254,
      createdAt: ago(13), sample: true,
      items: [
        { productId: 'rice', name: 'Sona masoori rice', emoji: '🍚', quantity: 2, unit: 'kg', price: 68, lineTotal: 136 },
        { productId: 'curd', name: 'Thick set curd', emoji: '🥣', quantity: 1, unit: '500 g', price: 38, lineTotal: 38 },
        { productId: 'banana', name: 'Robusta bananas', emoji: '🍌', quantity: 1, unit: 'dozen', price: 48, lineTotal: 48 },
        { productId: 'chilli', name: 'Red chilli powder', emoji: '🌶️', quantity: 1, unit: '100 g', price: 32, lineTotal: 32 },
      ],
    },
    {
      id: 'MK-2046', name: 'Sravya P.', phone: '••••• 1194', channel: 'entrance',
      status: 'ready', payment: 'Pay at pickup · demo', total: 178,
      createdAt: ago(21), sample: true,
      items: [
        { productId: 'potato', name: 'Potatoes', emoji: '🥔', quantity: 1, unit: 'kg', price: 32, lineTotal: 32 },
        { productId: 'atta', name: 'Whole wheat atta', emoji: '🌾', quantity: 1, unit: 'kg', price: 54, lineTotal: 54 },
        { productId: 'paneer', name: 'Malai paneer', emoji: '🧀', quantity: 1, unit: '200 g', price: 92, lineTotal: 92 },
      ],
    },
  ]
}

export function readOrders() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return makeSampleOrders()
    const parsed = JSON.parse(saved)
    if ((parsed?.version === 1 || parsed?.version === 2 || parsed?.version === 3) && Array.isArray(parsed.orders)) return parsed.orders
  } catch {
    // A fresh demo session is safer than blocking the ordering page on bad local data.
  }
  return makeSampleOrders()
}

export function readProducts() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return PRODUCTS
    const parsed = JSON.parse(saved)
    if ((parsed?.version === 2 || parsed?.version === 3) && Array.isArray(parsed.products)) return parsed.products
  } catch {
    // Fall back to the bundled catalogue if browser storage is unavailable or invalid.
  }
  return PRODUCTS
}

export function readCategories() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return []
    const parsed = JSON.parse(saved)
    if (parsed?.version === 3 && Array.isArray(parsed.categories)) return parsed.categories
  } catch {
    // Categories can be rebuilt from the catalogue if saved browser data is invalid.
  }
  return []
}
