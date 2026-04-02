/**
 * Converts a phone number to a WhatsApp deep-link URL.
 * Handles Bangladesh local format (01xxxxxxxxx → 8801xxxxxxxxx).
 */
export function toWhatsAppUrl(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  // Bangladesh local number starts with 0 → swap for country code 880
  const intl = digits.startsWith('0') ? '880' + digits.slice(1) : digits
  return `https://wa.me/${intl}`
}
