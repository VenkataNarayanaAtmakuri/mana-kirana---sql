(() => {
  const storageKey = 'mana-kirana-theme-v1'
  const root = document.documentElement
  const toggle = document.querySelector('[data-theme-toggle]')
  const themeMeta = document.querySelector('meta[name="theme-color"]')

  function applyTheme(theme) {
    root.dataset.theme = theme
    if (themeMeta) themeMeta.content = theme === 'dark' ? '#101813' : '#f2f4ec'
    if (toggle) {
      const nextTheme = theme === 'dark' ? 'light' : 'dark'
      toggle.textContent = nextTheme === 'dark' ? 'Dark theme' : 'Light theme'
      toggle.setAttribute('aria-label', 'Switch to ' + nextTheme + ' theme')
      toggle.setAttribute('aria-pressed', String(theme === 'dark'))
    }
  }

  let savedTheme = 'light'
  try { savedTheme = localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light' } catch {}
  applyTheme(savedTheme)
  toggle?.addEventListener('click', () => {
    const nextTheme = root.dataset.theme === 'dark' ? 'light' : 'dark'
    applyTheme(nextTheme)
    try { localStorage.setItem(storageKey, nextTheme) } catch {}
  })

  if (document.querySelector('[data-store-phone]')) {
    fetch('/api/catalog', { credentials: 'omit' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Could not load shop contact details.')))
      .then((data) => {
        const details = data.storeStatus || {}
        document.querySelectorAll('[data-store-name]').forEach((element) => {
          if (details.storeName) element.textContent = details.storeName
        })
        const phone = String(details.contactPhone || '+917032946299')
        const digits = phone.replace(/\D/g, '')
        const formattedPhone = digits.length === 12 && digits.startsWith('91')
          ? '+91 ' + digits.slice(2, 7) + ' ' + digits.slice(7)
          : phone
        document.querySelectorAll('[data-store-phone]').forEach((element) => {
          element.textContent = formattedPhone
          element.href = 'tel:' + phone.replace(/[^+\d]/g, '')
        })
        const address = String(details.contactAddress || '').trim()
        const addressRow = document.querySelector('[data-store-address-row]')
        if (addressRow) {
          addressRow.hidden = !address
          const text = addressRow.querySelector('[data-store-address]')
          if (text) text.textContent = address
        }
        const mapUrl = String(details.mapsUrl || 'https://maps.app.goo.gl/AaYVR9dbwqkwm7H29')
        try {
          const parsed = new URL(mapUrl)
          const host = parsed.hostname.toLowerCase()
          const validHost = ['maps.app.goo.gl', 'maps.google.com', 'google.com', 'www.google.com'].includes(host)
          const validPath = !['google.com', 'www.google.com'].includes(host) || parsed.pathname.startsWith('/maps')
          if (parsed.protocol === 'https:' && validHost && validPath && !parsed.username && !parsed.password && !parsed.port) {
            const mapLink = document.querySelector('[data-store-map]')
            if (mapLink) mapLink.href = parsed.toString()
          }
        } catch {}
      })
      .catch(() => {})
  }
})()
