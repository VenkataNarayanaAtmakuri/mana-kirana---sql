const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_SOURCE_SIZE = 12 * 1024 * 1024
const MAX_STORED_SIZE = 1_800_000

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

export async function prepareProductImage(file) {
  if (!file || !ACCEPTED_TYPES.has(file.type)) {
    throw new Error('Choose a JPG, PNG, or WebP product image.')
  }
  if (file.size > MAX_SOURCE_SIZE) {
    throw new Error('Choose an image smaller than 12 MB.')
  }

  if (typeof createImageBitmap !== 'function') {
    if (file.size <= MAX_STORED_SIZE) return file
    throw new Error('This browser cannot resize the image. Choose one smaller than 1.8 MB.')
  }

  let bitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new Error('This file could not be opened as an image.')
  }

  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('This browser could not prepare the image.')
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  for (const type of ['image/webp', 'image/jpeg', 'image/png']) {
    for (const quality of [0.84, 0.72, 0.6]) {
      const blob = await canvasToBlob(canvas, type, quality)
      if (blob && ACCEPTED_TYPES.has(blob.type) && blob.size <= MAX_STORED_SIZE) {
        const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/jpeg' ? 'jpg' : 'webp'
        return new File([blob], 'product-image.' + extension, { type: blob.type })
      }
    }
  }
  throw new Error('This image could not be reduced enough. Try a smaller photo.')
}
