import { useEffect, useState } from 'react'
import { Download } from 'lucide-react'

function inStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

export default function InstallAppButton() {
  const [installPrompt, setInstallPrompt] = useState(null)
  const [installed, setInstalled] = useState(false)
  const [mobilePlatform, setMobilePlatform] = useState('')
  const [showHelp, setShowHelp] = useState(false)

  useEffect(() => {
    const userAgent = navigator.userAgent || ''
    const isIOS = /iPhone|iPad|iPod/i.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const isAndroid = /Android/i.test(userAgent)
    setMobilePlatform(isIOS ? 'ios' : isAndroid ? 'android' : '')
    setInstalled(inStandaloneMode())

    function captureInstallPrompt(event) {
      event.preventDefault()
      setInstallPrompt(event)
    }
    function markInstalled() {
      setInstalled(true)
      setInstallPrompt(null)
      setShowHelp(false)
    }

    window.addEventListener('beforeinstallprompt', captureInstallPrompt)
    window.addEventListener('appinstalled', markInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', captureInstallPrompt)
      window.removeEventListener('appinstalled', markInstalled)
    }
  }, [])

  if (installed || (!installPrompt && !mobilePlatform)) return null

  async function installOrShowInstructions() {
    if (!installPrompt) {
      setShowHelp((current) => !current)
      return
    }
    try {
      await installPrompt.prompt()
      const choice = await installPrompt.userChoice
      setInstallPrompt(null)
      if (choice?.outcome === 'accepted') {
        setInstalled(true)
        setShowHelp(false)
      }
    } catch {
      setInstallPrompt(null)
      setShowHelp(true)
    }
  }

  const instructions = mobilePlatform === 'ios'
    ? 'In Safari, tap Share, then Add to Home Screen, and confirm.'
    : mobilePlatform === 'android'
      ? 'Open your browser menu (⋮) and choose Install app or Add to Home screen.'
      : 'Use your browser’s install icon or choose Install Mana Kirana from its menu.'

  return (
    <div className="install-app-control">
      <button className="account-button install-app-button" type="button" onClick={installOrShowInstructions} aria-expanded={showHelp} aria-label="Install Mana Kirana app">
        <Download size={15} aria-hidden="true" />
        <span>Install app</span>
      </button>
      {showHelp && (
        <div className="install-app-help" role="status">
          <p>{instructions}</p>
          <button type="button" onClick={() => setShowHelp(false)}>Got it</button>
        </div>
      )}
    </div>
  )
}
