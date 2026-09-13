import { readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * Best-effort filesystem logo load for the PDF documents.
 * Falls back to a text-only header when no logo is present.
 */
export async function loadResortLogo(): Promise<Buffer | null> {
  for (const filename of ['logo.png', 'logo.jpg', 'logo.jpeg']) {
    try {
      return await readFile(path.join(process.cwd(), 'public', filename))
    } catch { /* try next extension */ }
  }
  return null
}
