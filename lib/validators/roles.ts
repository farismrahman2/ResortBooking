import { z } from 'zod'

export const permissionLevelSchema = z.enum(['none', 'read', 'write'])
export type PermissionLevelInput = z.infer<typeof permissionLevelSchema>

export const updateRolePermissionsSchema = z.object({
  /** Map of module_id → level */
  permissions: z.record(z.string().uuid(), permissionLevelSchema),
})
export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>
