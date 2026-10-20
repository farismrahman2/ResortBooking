/**
 * GUEST INFORMATION attached to confirmation PDFs — the resort's own wording
 * (guest briefings, directions, Terms & Conditions, Oct 2026).
 *
 * Edit the text here; lib/pdf/guest-info-pages.tsx lays it out. Keep to
 * characters Helvetica can draw: no emoji, no ৳ (write "Tk."), no Bangla —
 * the Bangla road directions are an image (public/pdf/routes-bn.png, made by
 * scripts/render-routes-bn.mjs) because the PDF engine can't shape Bangla.
 */

/** A run of text; `b` bold, `alert` bold red, `mark` bold on a highlight. */
export interface Seg { t: string; b?: boolean; alert?: boolean; mark?: boolean }
export type Rich = Seg[]

export interface Briefing {
  title:    string
  intro:    string
  /** Meal / activity times, shown as cards. */
  times:    Array<{ label: string; value: string }>
  timesTitle: string
  timing:   Array<{ label: string; value: string }>
  /** One highlighted line under the timing (late check-out fee). */
  timingNote?: string
  extra?:   { title: string; lines: string[] }
  notes:    string[]
  closing:  string
}

export const NIGHT_BRIEFING: Briefing = {
  title: 'Night Stay (Full Board) — Guest Briefing',
  intro: 'Thank you for choosing Garden Centre Resort. We are delighted to have you with us. To ensure a smooth and comfortable experience for you and all our guests, we kindly request you to follow the guidelines below.',
  timesTitle: 'Dining hours',
  times: [
    { label: 'Lunch',                value: '2:00 PM – 3:30 PM' },
    { label: 'Dinner',               value: '9:00 PM – 10:30 PM' },
    { label: 'Breakfast (next day)', value: '9:00 AM – 11:00 AM' },
  ],
  timing: [
    { label: 'Check-in',  value: '2:00 PM (sharp)' },
    { label: 'Check-out', value: '11:00 AM (sharp)' },
  ],
  timingNote: 'Late check-out fee: Tk. 5,000 additional.',
  notes: [
    'We sincerely request you to follow the dining schedule for the best service experience.',
    'Food is not allowed inside guest rooms.',
    'Outside food is not permitted inside the resort premises.',
    'Please keep to the check-in and check-out times so we can serve every guest smoothly.',
  ],
  closing: 'We truly appreciate your understanding and cooperation.',
}

export const DAYLONG_BRIEFING: Briefing = {
  title: 'Daylong Package — Guest Briefing',
  intro: 'Thank you for choosing Garden Centre Resort. To make your day smooth and enjoyable, please take a moment to read the guidelines below.',
  timesTitle: 'Meal times',
  times: [
    { label: 'Breakfast',      value: '9:00 AM – 11:00 AM' },
    { label: 'Lunch',          value: '2:00 PM – 3:30 PM' },
    { label: 'Evening snacks', value: '5:00 PM' },
  ],
  timing: [
    { label: 'Check-in',  value: '9:00 AM' },
    { label: 'Check-out', value: '6:00 PM' },
  ],
  timingNote: 'Late check-out fee applicable.',
  extra: {
    title: 'Swimming',
    lines: ['Swimming time: 11:00 AM – 2:00 PM', 'Please bring your own towels for swimming.'],
  },
  notes: [
    'Please follow the meal timings for the best service.',
    'Outside food is not allowed.',
  ],
  closing: 'Thank you for your cooperation.',
}

export const TAGLINE = 'Where luxury meets nature'

export const DIRECTIONS = {
  where: 'Berua, Kaliganj, Gazipur — just 40 minutes from the Purbachal Kanchan Bridge.',
  landmark: 'Beside Boktarpur Union Parishad',
  links: [
    { label: 'Google Maps route', url: 'https://goo.gl/maps/cJhjeFnTZvycU78D6' },
    { label: 'Aristocrat shortcut', url: 'https://maps.app.goo.gl/snNmahKGfTu98ftKA?g_st=ac' },
  ],
  /** Who to call for directions or on the way; shown under the map links. */
  contacts: [
    { name: 'Md. Farid Uddin',   role: 'Public Relation Manager', phone: '+880 1715-047672' },
    { name: 'Abul Basher Liton', role: 'Manager (Admin)',         phone: '+880 1790-600005' },
    { name: 'Md. Ujjal',         role: '',                        phone: '+880 1731-970000' },
  ],
}

export const TERMS_TITLE = 'Terms & Conditions'
export const TERMS_INTRO = 'This pre-calculation sheet has been prepared according to your requirements. Any additional charges will be applied based on the guest\'s actual consumption.'

export const TERMS: Rich[] = [
  [{ t: 'Food Menu Modification: ', b: true }, { t: 'The Company reserves the right, at its sole discretion, to modify, replace, revise, or change the food menu offered for breakfast, lunch, and evening snacks from time to time. Such changes may be made based on seasonal availability, procurement considerations, operational requirements, guest preferences, or other business considerations. The Company shall not be required to provide prior notice of such changes, provided that the overall meal service remains consistent with the applicable package or agreed terms and conditions.' }],
  [{ t: 'All food and beverage prices vary depending on the selected menu options.' }],
  [{ t: 'All rates and amounts are quoted in BDT.' }],
  [{ t: 'Unlimited buffet is not available.' }],
  [{ t: 'Pets and outside food are strictly prohibited.', mark: true }],
  [{ t: 'Guests are requested to reserve rooms/packages in advance. 50% of the total amount must be paid in advance for the resort to confirm the booking. ' }, { t: 'This advance is non-refundable.', mark: true }, { t: ' Rooms/packages booked without an advance payment will be subject to availability.' }],
  [{ t: 'If the client causes excessive mess, an additional cleaning fee will be applicable.' }],
  [{ t: 'Our day-long operating hours are from 9:00 AM to 6:00 PM. If a barbecue event is included, the time will be extended by 2 hours, from 6:00 PM to 8:00 PM. Beyond this, a late fee of Tk. 5,000 per hour will be charged.' }],
  [{ t: 'If the number of guests decreases, billing will still be made according to the confirmed rate and the package price will remain the same. The number of guests may be increased separately, with additional charges.' }],
  [{ t: 'Night-stay guests cannot use the swimming pool after 11:00 AM. If they wish to use the pool, they must pay Tk. 1,000 per person for one hour.' }],
  [{ t: 'All balance dues must be paid at the time of check-out. Credit facilities are not available.' }],
  [{ t: 'Night stay: ', b: true }, { t: 'check-in time is 2:00 PM and check-out time is 11:00 AM the next day.' }],
  [{ t: 'Day-long: ', b: true }, { t: 'check-in time is 9:00 AM and check-out time is 6:00 PM.' }],
  [{ t: 'Early check-in and late check-out are subject to a full-day charge (subject to availability).' }],
  [{ t: 'The Reservation & Cancellation Policy will be followed as per the Garden Centre Resort, Gazipur policy.' }],
  [{ t: 'Garden Centre Resort authority reserves the right to cancel any booking, with at least 48 hours\' notice and a full refund, in case of unavoidable circumstances or technical issues.', alert: true }],
  [{ t: 'The booking will be confirmed based on the number of guests stated at the time of reservation. Even if any of the confirmed guests do not attend, full payment will be applicable for the total number of confirmed guests.' }],
  [{ t: 'The final number of guests must be confirmed at least 3 days before the scheduled date. If additional guests attend beyond the confirmed number, additional payment will be charged at the applicable package rate. If the final guest count is not confirmed within the specified time, full payment will remain applicable based on the number of guests confirmed at the time of booking.' }],
  [{ t: 'Once the booking is confirmed, if any guest does not attend or the booking is cancelled, the payment made will be non-refundable.' }],
  [{ t: 'Any request to change the booking date must be communicated to the resort at least 7 days before the scheduled date. Requests made within 7 days of the scheduled date will not be accepted.' }],
  [{ t: 'Friday & Saturday Bookings: ', b: true }, { t: 'A minimum of 50% advance payment is required to confirm a booking. If the required 50% advance is not paid within the specified payment deadline, the resort reserves the right to cancel the booking, refund any amount paid, and make the room/package available to another guest.' }],
  [{ t: 'Emergency Date Change: ', b: true }, { t: 'In case of an emergency, a confirmed booking may be transferred to another date, subject to availability. Date transfers are permitted only from Sunday to Wednesday. Friday and Saturday dates are not eligible for date transfer.' }],
]

export const POLICIES: Array<{ label: string; text: string }> = [
  { label: 'Guarantee Policy', text: 'All reservations are subject to immediate release for non-guarantee, in the event that the advance payment is dishonored. All guests are required to cover any incidental charges.' },
  { label: 'Early Arrival Policy', text: 'If a room is required immediately upon arrival, we recommend that the room be reserved from the arrival time.' },
  { label: 'Identification Requirement', text: 'As per government guidelines, all resident guests are requested to carry proof of identity at the time of check-in. The proof of identity for foreigners is the passport, plus a resident permit in case of residency. For Bangladeshi nationals, it can be any Bangladesh government-issued ID card showing a residence address, e.g., driving license, National ID card, or passport.' },
  { label: 'Swimming Pool Usage Policy', text: 'Guests are requested to wear proper swimming attire and to follow the pool usage rules strictly. Cotton garments are strictly prohibited in swimming pools.' },
  { label: 'Acceptance of Terms', text: 'By confirming the booking, the customer acknowledges and agrees to all of the above terms and payment policies.' },
]
