import { z } from 'zod'

const nullableStr = z.string().trim().min(1).nullable().optional()
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date')

export const assetFormSchema = z.object({
  asset_tag:               z.string().trim().min(1).nullable().optional(),  // auto-gen if empty
  name:                    z.string().trim().min(1, 'Name required'),
  category_id:             z.string().uuid('Category required'),
  description:             nullableStr,
  brand:                   nullableStr,
  model_number:            nullableStr,
  serial_number:           nullableStr,
  acquisition_date:        isoDate,
  acquisition_cost:        z.number().positive('Cost must be > 0'),
  vendor_id:               z.string().uuid().nullable().optional(),
  invoice_number:          nullableStr,
  warranty_until:          isoDate.nullable().optional(),
  useful_life_years:       z.number().int().positive('Useful life must be > 0'),
  salvage_value:           z.number().min(0).default(0),
  depreciation_start_date: isoDate,
  location_id:             z.string().uuid().nullable().optional(),
  location_notes:          nullableStr,
  custodian_employee_id:   z.string().uuid().nullable().optional(),
  condition:               z.enum(['excellent', 'good', 'fair', 'poor', 'needs_repair', 'out_of_service']).default('good'),
  notes:                   nullableStr,
}).refine((v) => v.salvage_value < v.acquisition_cost, {
  message: 'Salvage value must be less than acquisition cost', path: ['salvage_value'],
})

export const maintenanceFormSchema = z.object({
  asset_id:          z.string().uuid('Asset required'),
  maintenance_date:  isoDate,
  maintenance_type:  z.enum(['preventive', 'corrective', 'inspection', 'warranty', 'amc', 'installation', 'upgrade', 'other']),
  description:       z.string().trim().min(1, 'Description required'),
  vendor_id:         z.string().uuid().nullable().optional(),
  technician_name:   nullableStr,
  cost:              z.number().min(0).default(0),
  create_expense:    z.boolean().default(false),
  next_service_date: isoDate.nullable().optional(),
  outcome:           z.enum(['resolved', 'pending', 'requires_replacement', 'warranty_claim']).nullable().optional(),
  notes:             nullableStr,
})

export const disposalFormSchema = z.object({
  asset_id:          z.string().uuid(),
  disposal_date:     isoDate,
  disposal_method:   z.enum(['sold', 'scrapped', 'donated', 'traded_in', 'lost', 'written_off']),
  disposal_proceeds: z.number().min(0).nullable().optional(),
  disposal_notes:    nullableStr,
}).refine(
  (v) => !(v.disposal_method === 'sold' || v.disposal_method === 'traded_in') || (v.disposal_proceeds != null && v.disposal_proceeds >= 0),
  { message: 'Proceeds required when sold or traded in', path: ['disposal_proceeds'] },
)

export type AssetFormInput       = z.input<typeof assetFormSchema>
export type MaintenanceFormInput = z.input<typeof maintenanceFormSchema>
export type DisposalFormInput    = z.input<typeof disposalFormSchema>
