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

// ─── Opportunities + Activities (Phase 2) ─────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')

export const opportunityFormSchema = z.object({
  account_id:          z.string().uuid('Account required'),
  primary_contact_id:  z.string().uuid().nullable().optional(),
  owner_user_id:       z.string().uuid('Owner required'),
  opportunity_name:    z.string().trim().min(1, 'Name required'),
  event_type:          z.enum(['training', 'conference', 'retreat', 'day_use', 'agm', 'team_outing', 'other']),
  pax:                 z.number().int().positive().nullable().optional(),
  est_value:           z.number().min(0).default(0),
  expected_event_date: isoDate.nullable().optional(),
  next_action:         nullableStr,
  notes:               nullableStr,
})

export const activityFormSchema = z.object({
  account_id:       z.string().uuid('Account required'),
  opportunity_id:   z.string().uuid().nullable().optional(),
  contact_id:       z.string().uuid().nullable().optional(),
  activity_type:    z.enum(['call', 'email', 'whatsapp', 'meeting', 'site_visit', 'proposal_sent', 'field_visit', 'linkedin', 'other']),
  activity_date:    isoDate,
  duration_minutes: z.number().int().min(0).nullable().optional(),
  subject:          z.string().trim().min(1, 'Subject required'),
  notes:            nullableStr,
  outcome:          z.enum(['positive', 'neutral', 'negative']).nullable().optional(),
  next_step:        nullableStr,
  next_step_date:   isoDate.nullable().optional(),
})

export type OpportunityFormInput = z.input<typeof opportunityFormSchema>
export type ActivityFormInput    = z.input<typeof activityFormSchema>
