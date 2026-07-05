import { z } from 'zod'

/**
 * Payload the public marketing site (garden-centre-resort) POSTs to
 * /api/enquiries after it persists its own copy of the lead. Field names
 * mirror the public Prisma `Enquiry` model; `sourceId` is that row's cuid so
 * a retry/edit upserts instead of duplicating.
 */
export const enquiryIngestSchema = z.object({
  sourceId:     z.string().min(1).max(64),
  type:         z.string().min(1).max(120),
  date:         z.string().max(120).nullish(),
  pax:          z.coerce.number().int().min(1).max(5000).default(1),
  organisation: z.string().max(200).nullish(),
  name:         z.string().min(1).max(200),
  phone:        z.string().min(3).max(40),
  email:        z.string().max(200).nullish(),
  note:         z.string().max(4000).nullish(),
  source:       z.record(z.string(), z.any()).nullish(),
  // ISO timestamp of when the lead was submitted on the public site.
  submittedAt:  z.string().datetime().nullish(),
})
export type EnquiryIngestInput = z.infer<typeof enquiryIngestSchema>

export const enquiryStatusSchema = z.object({
  id:     z.string().uuid(),
  status: z.enum(['new', 'contacted', 'won', 'lost']),
})
export type EnquiryStatusInput = z.infer<typeof enquiryStatusSchema>

export const enquiryNoteSchema = z.object({
  id:   z.string().uuid(),
  note: z.string().trim().min(1).max(4000),
})
export type EnquiryNoteInput = z.infer<typeof enquiryNoteSchema>
