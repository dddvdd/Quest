// QR camera hook. Owns the Html5Qrcode lifecycle so the page doesn't.
// Decoded text is passed back via `onDecode(text)`. Errors are surfaced
// via the `error` state.

import { useCallback, useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

function describeCameraError(err) {
  const sig = `${err?.name || ''} ${err?.message || ''}`
  if (/NotAllowed|Permission/i.test(sig)) return { fatal: false, msg: 'Camera permission was denied. Tap the lock/ⓘ icon in the address bar, allow Camera, then retry.' }
  if (/NotFound|DevicesNotFound|no cameras/i.test(sig)) return { fatal: false, msg: 'No camera was found on this device.' }
  if (/NotReadable|TrackStart|in use|Could not start/i.test(sig)) return { fatal: false, msg: 'The camera is busy or unreachable. Close other apps using the camera, then retry.' }
  if (/Security/i.test(sig)) return { fatal: true, msg: 'The browser blocked the camera on this connection. Reopen this page over HTTPS.' }
  return { fatal: false, msg: `Camera failed to start${err?.message ? `: ${err.message}` : '.'}` }
}

/**
 * React hook for the QR camera.
 * @param {object} opts
 * @param {string} opts.elementId DOM id of the viewport element.
 * @param {(text: string) => void} opts.onDecode Called with each decoded text.
 * @returns camera controls and state.
 */
export function useQrScanner({ elementId, onDecode }) {
  const scannerRef = useRef(null)
  const startingRef = useRef(false)
  const onDecodeRef = useRef(onDecode)
  onDecodeRef.current = onDecode

  const [cameraError, setCameraError] = useState(null)
  const [isScanning, setIsScanning] = useState(false)
  const [starting, setStarting] = useState(false)

  const stop = useCallback(() => {
    const scanner = scannerRef.current
    scannerRef.current = null
    if (scanner) scanner.stop().then(() => scanner.clear()).catch(() => {})
    setIsScanning(false)
  }, [])

  const start = useCallback(async () => {
    if (startingRef.current || scannerRef.current) return
    startingRef.current = true
    setStarting(true)
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setCameraError({
          fatal: true,
          msg: `This device blocks the camera on ${window.location.origin} — phones only allow camera access on HTTPS origins. Serve this app over HTTPS (e.g. vite dev with HTTPS or a deployed URL) and reopen the scanner.`,
        })
        return
      }
      setCameraError(null)
      const scanner = new Html5Qrcode(elementId)
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: (vw, vh) => {
            const s = Math.min(280, Math.floor(Math.min(vw, vh) * 0.7))
            return { width: s, height: s }
          },
        },
        (text) => onDecodeRef.current?.(text),
        () => {}
      )
      setIsScanning(true)
    } catch (err) {
      stop()
      setCameraError(describeCameraError(err))
    } finally {
      startingRef.current = false
      setStarting(false)
    }
  }, [elementId, stop])

  useEffect(() => {
    return () => stop()
  }, [stop])

  return { start, stop, cameraError, isScanning, starting }
}