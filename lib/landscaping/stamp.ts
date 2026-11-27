'use client'

/**
 * Stamp a bill / slip with its requisition number — a big "Req No: 53" across
 * the middle — for viewing and downloading. Done in the browser at view time;
 * the stored original is never changed. Photos via canvas, PDFs via pdf-lib.
 */

export const stampText = (reqNo: number) => `Req No: ${reqNo}`

const isPdf = (path: string) => path.toLowerCase().endsWith('.pdf')

async function stampImage(url: string, text: string): Promise<Blob> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  await img.decode()
  // Keep big phone photos manageable while staying sharp enough to read.
  const scale = Math.min(1, 3000 / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)

  // Size the stamp to about 70% of the photo's width.
  let size = Math.round(w * 0.12)
  ctx.font = `700 ${size}px Arial, Helvetica, sans-serif`
  const fit = (w * 0.7) / ctx.measureText(text).width
  size = Math.max(24, Math.round(size * Math.min(fit, 1.6)))
  ctx.font = `700 ${size}px Arial, Helvetica, sans-serif`
  const tw = ctx.measureText(text).width
  const pad = size * 0.3
  const x = (w - tw) / 2, y = h * 0.58
  ctx.fillStyle = 'rgba(255,255,255,0.68)'
  ctx.fillRect(x - pad, y - size * 0.95, tw + pad * 2, size * 1.25)
  ctx.fillStyle = '#000'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, x, y)

  return await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not draw the photo'))), 'image/jpeg', 0.9))
}

async function stampPdf(url: string, text: string): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
  const bytes = await (await fetch(url)).arrayBuffer()
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize()
    let size = width * 0.1
    const fit = (width * 0.7) / font.widthOfTextAtSize(text, size)
    size *= Math.min(fit, 1.6)
    const tw = font.widthOfTextAtSize(text, size)
    const x = (width - tw) / 2, y = height * 0.42
    page.drawRectangle({ x: x - size * 0.3, y: y - size * 0.3, width: tw + size * 0.6, height: size * 1.25, color: rgb(1, 1, 1), opacity: 0.68 })
    page.drawText(text, { x, y, size, font, color: rgb(0, 0, 0) })
  }
  const out = await doc.save()
  return new Blob([out as BlobPart], { type: 'application/pdf' })
}

/** The stamped file as a Blob, plus a sensible download name. */
export async function stampedFile(signedUrl: string, path: string, reqNo: number, kind = 'bill'): Promise<{ blob: Blob; name: string }> {
  const text = stampText(reqNo)
  const pdf = isPdf(path)
  const blob = pdf ? await stampPdf(signedUrl, text) : await stampImage(signedUrl, text)
  return { blob, name: `Req-${String(reqNo).padStart(5, '0')}-${kind}.${pdf ? 'pdf' : 'jpg'}` }
}
