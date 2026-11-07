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
})()
