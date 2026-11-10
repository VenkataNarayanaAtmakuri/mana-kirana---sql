import { useCallback, useEffect, useRef, useState } from 'react'

function getRecognitionConstructor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

function languageName(language) {
  return language === 'te-IN' ? 'Telugu' : 'English'
}

function errorMessage(code, language) {
  switch (code) {
    case 'not-allowed':
      return 'Microphone access is blocked. Allow it for this site in your browser settings, then try again.'
    case 'service-not-allowed':
      return 'This browser blocked its speech service. Try another browser or type instead.'
    case 'audio-capture':
      return 'Could not access the microphone. Check that it is connected and not in use by another app.'
    case 'network':
      return 'Speech recognition needs an internet connection. Check your connection and try again.'
    case 'language-not-supported':
    case 'language-unavailable':
      return 'This browser cannot recognize ' + languageName(language) + '. Choose another voice language or type instead.'
    case 'no-speech':
      return 'No speech detected. Listening will reconnect; speak clearly near the microphone.'
    case 'aborted':
      return 'Listening was interrupted. Reconnecting…'
    default:
      return 'Voice recognition stopped unexpectedly. Tap the mic to retry or type instead.'
  }
}

export function useVoiceRecognition({ language = 'en-IN', onTranscript }) {
  const [listening, setListening] = useState(false)
  const [message, setMessage] = useState('')
  const recognitionRef = useRef(null)
  const shouldListenRef = useRef(false)
  const restartTimerRef = useRef(null)
  const transcriptRef = useRef('')
  const callbackRef = useRef(onTranscript)
  const languageRef = useRef(language)
  const reconnectMessageRef = useRef('')
  const startSessionRef = useRef(null)
  callbackRef.current = onTranscript
  languageRef.current = language

  const supported = Boolean(getRecognitionConstructor())

  const startSession = useCallback(() => {
    if (!shouldListenRef.current) return
    const Recognition = getRecognitionConstructor()
    if (!Recognition) {
      shouldListenRef.current = false
      setListening(false)
      setMessage('Voice recognition is not supported in this browser. Try Chrome or type instead.')
      return
    }

    let recognition
    try {
      recognition = new Recognition()
    } catch {
      shouldListenRef.current = false
      setListening(false)
      setMessage('The microphone could not start. Check browser permissions, then try again.')
      return
    }

    recognition.lang = languageRef.current || 'en-IN'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognition.onstart = () => {
      if (!shouldListenRef.current) return
      reconnectMessageRef.current = ''
      setListening(true)
      setMessage('Listening… Speak now.')
    }
    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''
      const firstChangedResult = Number.isInteger(event.resultIndex)
        ? event.resultIndex
        : Math.max(0, event.results.length - 1)

      for (let index = firstChangedResult; index < event.results.length; index += 1) {
        const result = event.results[index]
        const text = String(result?.[0]?.transcript || '').trim()
        if (!text) continue
        if (result.isFinal) finalText += text + ' '
        else interimText += text + ' '
      }

      if (finalText) {
        transcriptRef.current = [transcriptRef.current, finalText]
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
        callbackRef.current?.(transcriptRef.current)
      }

      if (!shouldListenRef.current) return
      reconnectMessageRef.current = ''
      if (interimText) {
        setMessage('Hearing: ' + interimText.trim() + ' · pause briefly to confirm the words.')
      } else if (finalText) {
        setMessage('Recognized: ' + finalText.trim() + ' · check spelling before saving.')
      }
    }
    recognition.onerror = (event) => {
      const code = event?.error || 'unknown'
      const message = errorMessage(code, languageRef.current)
      if (code === 'no-speech' || code === 'aborted') {
        reconnectMessageRef.current = message
        setMessage(message)
        return
      }
      shouldListenRef.current = false
      reconnectMessageRef.current = ''
      setListening(false)
      setMessage(message)
    }
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null
      if (!shouldListenRef.current) {
        setListening(false)
        return
      }
      setListening(true)
      setMessage(reconnectMessageRef.current || 'Listening paused. Reconnecting…')
      if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current)
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null
        startSessionRef.current?.()
      }, 350)
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
      setMessage('Starting microphone…')
    } catch {
      if (recognitionRef.current === recognition) recognitionRef.current = null
      shouldListenRef.current = false
      setListening(false)
      setMessage('The microphone could not start. Check browser permissions, then try again.')
    }
  }, [])
  startSessionRef.current = startSession

  const stop = useCallback(() => {
    const recognition = recognitionRef.current
    if (!shouldListenRef.current && !recognition && restartTimerRef.current === null) return
    shouldListenRef.current = false
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current)
      restartTimerRef.current = null
    }
    setListening(false)
    setMessage(transcriptRef.current ? 'Recognized words are saved. Check spelling before adding the item.' : 'No complete words were confirmed. Speak a short phrase, pause, then stop.')
    try {
      recognition?.stop()
    } catch {
      // The recognition service may already have ended.
    }
  }, [])

  const toggle = useCallback(() => {
    if (shouldListenRef.current || recognitionRef.current || restartTimerRef.current !== null) {
      stop()
      return
    }
    const Recognition = getRecognitionConstructor()
    if (!Recognition) {
      setMessage('Voice recognition is not supported in this browser. Try Chrome or type instead.')
      return
    }
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setMessage('Voice recognition needs a secure connection (HTTPS). Type your search instead.')
      return
    }
    shouldListenRef.current = true
    transcriptRef.current = ''
    reconnectMessageRef.current = ''
    setListening(true)
    setMessage('Starting microphone…')
    startSessionRef.current?.()
  }, [stop])

  useEffect(() => {
    const recognition = recognitionRef.current
    const requestedLanguage = language || 'en-IN'
    if (!shouldListenRef.current || !recognition || recognition.lang === requestedLanguage) return
    reconnectMessageRef.current = 'Switching to ' + languageName(requestedLanguage) + '…'
    setMessage(reconnectMessageRef.current)
    try {
      recognition.stop()
    } catch {
      // The active session will use the new language when it reconnects.
    }
  }, [language])

  useEffect(() => () => {
    shouldListenRef.current = false
    if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current)
    const recognition = recognitionRef.current
    if (!recognition) return
    recognition.onend = null
    recognition.onerror = null
    recognition.onresult = null
    try {
      recognition.abort()
    } catch {
      // The browser may already have closed the microphone.
    }
  }, [])

  return { listening, message, supported, toggle }
}
