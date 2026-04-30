import { z } from 'zod'

const passwordSchema = z.string()
  .min(8,  'Password must be at least 8 characters')
  .max(72, 'Password must be 72 characters or fewer')

export const newUserSchema = z.object({
  full_name: z.string().trim().min(2, 'Full name is required').max(120),
  email:     z.string().trim().toLowerCase().email(),
  phone:     z.string().trim().max(30).nullable().optional().or(z.literal('')),
  role_id:   z.string().uuid('Pick a role'),
  password:  passwordSchema,
})
export type NewUserInput = z.infer<typeof newUserSchema>

export const updateUserSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone:     z.string().trim().max(30).nullable().optional().or(z.literal('')),
})
export type UpdateUserInput = z.infer<typeof updateUserSchema>

export const resetPasswordSchema = z.object({
  password: passwordSchema,
})
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export const changeRoleSchema = z.object({
  role_id: z.string().uuid(),
})
export type ChangeRoleInput = z.infer<typeof changeRoleSchema>
