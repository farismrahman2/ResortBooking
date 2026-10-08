import { revalidatePath, revalidateTag } from 'next/cache'

/**
 * revalidatePath for actions that move money or room-nights (bookings,
 * quotes, checkout, expenses, payroll, coffee shop). It also clears the
 * cached report queries (tag 'reports', lib/queries/reports/*), which
 * otherwise kept showing figures up to a minute old after a save.
 * Clearing the tag twice in one action is harmless.
 */
export function revalidateMoneyPath(path: string, type?: 'page' | 'layout') {
  revalidatePath(path, type)
  revalidateTag('reports')
}
