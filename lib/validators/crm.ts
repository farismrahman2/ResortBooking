import { z } from 'zod'

const nullableStr = z.string().trim().min(1).nullable().optional()
// BD mobile: 01XXXXXXXXX, with optional hyphen after the 5th digit (01XXX-XXXXXX)
const bdPhone = z.string().trim().regex(/^01\d{3}-?\d{6}$/, 'Use BD format 01XXX-XXXXXX').nullable().optional()

export const accountFormSchema = z.object({
  account_code:      z.string().trim().min(1).nullable().optional(),  // auto-generated if empty
  company_name:      z.string().trim().min(1, 'Company name required'),
  parent_account_id: z.string().uuid().nullable().optional(),
  sector_id:         z.string().uuid().nullable().optional(),
  tier_id:           z.string().uuid().nullable().optional(),
  hq_location:       nullableStr,
  branch_presence:   nullableStr,
  approx_employees:  z.number().int().min(0).nullable().optional(),
  status:            z.enum(['target', 'contacted', 'existing', 'lapsed', 'won_client', 'lost']).default('target'),
  owner_user_id:     z.string().uuid('Owner required'),
  next_action:       nullableStr,
  notes:             nullableStr,
})

export const contactFormSchema = z.object({
  account_id:      z.string().uuid('Account required'),
  full_name:       z.string().trim().min(1, 'Name required'),
  designation:     nullableStr,
  department:      z.enum(['hr', 'l_and_d', 'admin', 'procurement', 'csr', 'marketing', 'operations', 'finance', 'other']).nullable().optional(),
  email:           z.string().trim().email('Invalid email').nullable().optional(),
  phone:           bdPhone,
  whatsapp:        bdPhone,
  office_location: nullableStr,
  is_primary:      z.boolean().default(false),
  linkedin_url:    z.string().trim().url('Invalid URL').nullable().optional(),
  notes:           nullableStr,
})

export type AccountFormInput = z.input<typeof accountFormSchema>
export type ContactFormInput = z.input<typeof contactFormSchema>
