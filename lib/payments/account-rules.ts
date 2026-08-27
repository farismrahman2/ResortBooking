/**
 * Which tenders must name WHERE the money landed.
 *
 * Cash has one home and bKash has one wallet, so those can be resolved without
 * asking. Cards and bank transfers cannot: the resort runs three POS machines
 * (EBL, UCB, City Bank) and two bank accounts (EBL, Brac), and a statement
 * covers one of them. A card payment with no terminal named is a line that can
 * never be ticked off, so the agent has to choose — with no default, because a
 * pre-selected terminal is a wrong terminal most of the time.
 *
 * Client-safe: no Supabase imports, so the checkout form can use it too.
 */

export const ACCOUNT_REQUIRED_METHODS = ['card', 'bank_transfer'] as const
export type AccountRequiredMethod = typeof ACCOUNT_REQUIRED_METHODS[number]

export function requiresAccount(method: string): boolean {
  return (ACCOUNT_REQUIRED_METHODS as readonly string[]).includes(method)
}

/** What to call the choice in the UI, per tender. */
export const ACCOUNT_LABEL: Record<string, string> = {
  card:          'Which POS machine?',
  bank_transfer: 'Which bank account?',
}

export const ACCOUNT_PLACEHOLDER: Record<string, string> = {
  card:          '— select the POS machine —',
  bank_transfer: '— select the bank account —',
}

/** The blocking message, shared by the form, the action and finalize. */
export function missingAccountError(method: string): string {
  return method === 'card'
    ? 'Choose which POS machine took this card payment — EBL, UCB or City Bank.'
    : 'Choose which bank account received this transfer — EBL or Brac.'
}
