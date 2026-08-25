/**
 * Turning an uploaded permit photo into something we can actually keep.
 *
 * The whole store is persisted to localStorage, which is a ~5 MB budget for
 * everything. A phone camera JPEG is 3-6 MB on its own, and base64 inflates it
 * by a third again, so storing the file as-is would blow the quota and take
 * the rest of the session's state down with it. Everything here exists to
 * bound that: reject what is obviously wrong up front, then re-encode to a
 * size a licence stays readable at.
 */

/** Largest file we accept from the picker, before downscaling. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

/** Longest edge kept after downscaling. Text on a licence stays legible here. */
const MAX_EDGE = 1400

/** JPEG quality for the re-encode. */
const QUALITY = 0.72

export type ImageReadError = 'type' | 'size' | 'decode'

export interface ImageReadResult {
  dataUrl: string
  fileName: string
  /** Bytes of the stored data URL, so callers can show what was kept. */
  storedBytes: number
}

/**
 * Read an image file and return a downscaled data URL.
 *
 * Rejects with an `ImageReadError` string rather than an Error object so the
 * caller can map the reason straight onto a translated message.
 */
export function readImageFile(file: File): Promise<ImageReadResult> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject('type' as ImageReadError)
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      reject('size' as ImageReadError)
      return
    }

    const url = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(url)
      const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(img.width * scale))
      canvas.height = Math.max(1, Math.round(img.height * scale))

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject('decode' as ImageReadError)
        return
      }
      // Permits are usually dark ink on white; a transparent PNG would turn
      // black once flattened into JPEG, so paint a white ground first.
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

      const dataUrl = canvas.toDataURL('image/jpeg', QUALITY)
      resolve({ dataUrl, fileName: file.name, storedBytes: dataUrl.length })
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject('decode' as ImageReadError)
    }

    img.src = url
  })
}
