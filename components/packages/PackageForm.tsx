'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { PackageFormSchema, type PackageFormInput } from '@/lib/validators/package'
import { createPackage, updatePackage } from '@/lib/actions/packages'
import type { PackageWithPrices, RoomInventoryRow } from '@/lib/supabase/types'
import { Tabs } from '@/components/ui/Tabs'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { NumberInput } from '@/components/ui/NumberInput'
import { Textarea } from '@/components/ui/Textarea'
import { TextBlockEditor } from './TextBlockEditor'
import { RoomPriceEditor } from './RoomPriceEditor'

interface PackageFormProps {
  mode: 'create' | 'edit'
  package?: PackageWithPrices
  inventory: RoomInventoryRow[]
  onSuccess?: (packageId: string) => void
}

const TABS = [
  { id: 'basic', label: 'Basic Info' },
  { id: 'validity', label: 'Validity' },
  { id: 'pricing', label: 'Pricing' },
  { id: 'rooms', label: 'Rooms' },
  { id: 'text', label: 'Text Blocks' },
]

function buildDefaultValues(pkg?: PackageWithPrices): PackageFormInput {
  if (!pkg) {
    return PackageFormSchema.parse({
      name: '',
      type: 'daylong',
      is_active: true,
      display_order: 0,
      all_year: true,
      valid_from: '',
      valid_to: '',
      specific_dates: [],
      is_override: false,
      weekday_adult: 0,
      friday_adult: 0,
      holiday_adult: 0,
      child_meal: 1500,
      driver_price: 0,
      extra_person: 0,
      extra_bed: 0,
      check_in: '08:00',
      check_out: '18:00',
      title: '',
      intro: '',
      meals: '',
      activities: '',
      experience: '',
      why_choose_us: '',
      cta: '',
      notes: '',
      room_prices: {},
    })
  }

  const room_prices: Record<string, number> = {}
  for (const rp of pkg.room_prices) {
    room_prices[rp.room_type] = rp.price
  }

  return {
    name: pkg.name,
    type: pkg.type,
    is_active: pkg.is_active,
    display_order: pkg.display_order,
    all_year: pkg.all_year,
    valid_from: pkg.valid_from ?? '',
    valid_to: pkg.valid_to ?? '',
    specific_dates: pkg.specific_dates ?? [],
    is_override: pkg.is_override,
    weekday_adult: pkg.weekday_adult,
    friday_adult: pkg.friday_adult,
    holiday_adult: pkg.holiday_adult,
    child_meal: pkg.child_meal,
    driver_price: pkg.driver_price,
    extra_person: pkg.extra_person,
    extra_bed: pkg.extra_bed,
    check_in: pkg.check_in,
    check_out: pkg.check_out,
    includes_breakfast: pkg.includes_breakfast ?? true,
    includes_lunch:     pkg.includes_lunch ?? true,
    includes_dinner:    pkg.includes_dinner ?? true,
    includes_snacks:    pkg.includes_snacks ?? false,
    title: pkg.title ?? '',
    intro: pkg.intro ?? '',
    meals: pkg.meals ?? '',
    activities: pkg.activities ?? '',
    experience: pkg.experience ?? '',
    why_choose_us: pkg.why_choose_us ?? '',
    cta: pkg.cta ?? '',
    notes: pkg.notes ?? '',
    room_prices,
  }
}

export function PackageForm({ mode, package: pkg, inventory, onSuccess }: PackageFormProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('basic')
  const [serverError,   setServerError]   = useState<string | null>(null)
  const [saveSuccess,   setSaveSuccess]   = useState(false)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PackageFormInput>({
    resolver: zodResolver(PackageFormSchema),
    defaultValues: buildDefaultValues(pkg),
  })

  const packageType = watch('type')
  const allYear = watch('all_year')
  const specificDatesRaw = watch('specific_dates')
  const validFrom = watch('valid_from')
  const validTo = watch('valid_to')

  const onSubmit = async (data: PackageFormInput) => {
    setServerError(null)
    try {
      if (mode === 'create') {
        const result = await createPackage(data)
        if (!result.success) {
          setServerError(result.error ?? 'Failed to create package')
          return
        }
        if (onSuccess) {
          onSuccess(result.data!.packageId)
        } else {
          router.push('/packages')
        }
      } else {
        const result = await updatePackage(pkg!.id, data)
        if (!result.success) {
          setServerError(result.error ?? 'Failed to update package')
          return
        }
        if (onSuccess) {
          onSuccess(pkg!.id)
        } else {
          setSaveSuccess(true)
          setTimeout(() => setSaveSuccess(false), 3000)
          router.refresh()
        }
      }
    } catch (err: any) {
      setServerError(err?.message ?? 'An unexpected error occurred')
    }
  }

  const handleSpecificDatesChange = (raw: string) => {
    const dates = raw
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    setValue('specific_dates', dates)
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Tabs items={TABS} active={activeTab} onChange={setActiveTab} />

      {/* Tab: Basic Info */}
      {activeTab === 'basic' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Input
              label="Package Name"
              required
              placeholder='e.g. "Garden Daylong Standard"'
              error={errors.name?.message}
              {...register('name')}
            />
            <Controller
              name="type"
              control={control}
              render={({ field }) => (
                <Select
                  label="Package Type"
                  options={[
                    { value: 'daylong', label: 'Daylong' },
                    { value: 'night', label: 'Night Stay' },
                  ]}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  error={errors.type?.message}
                />
              )}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Controller
              name="display_order"
              control={control}
              render={({ field }) => (
                <NumberInput
                  label="Display Order"
                  hint="Lower numbers appear first"
                  value={field.value}
                  onChange={(v) => field.onChange(v)}
                  error={errors.display_order?.message}
                />
              )}
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-forest-700 focus:ring-forest-500"
                {...register('is_active')}
              />
              <span className="text-sm font-medium text-gray-700">Active</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-forest-700 focus:ring-forest-500"
                {...register('is_override')}
              />
              <span className="text-sm font-medium text-gray-700">Override Package</span>
              <span className="text-xs text-gray-500">(Override packages take priority on their dates)</span>
            </label>
          </div>
        </div>
      )}

      {/* Tab: Validity */}
      {activeTab === 'validity' && (
        <div className="space-y-5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-forest-700 focus:ring-forest-500"
              {...register('all_year')}
            />
            <span className="text-sm font-medium text-gray-700">Valid All Year</span>
          </label>

          {!allYear && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Input
                label="Valid From"
                type="date"
                error={errors.valid_from?.message}
                {...register('valid_from')}
              />
              <Input
                label="Valid To"
                type="date"
                error={errors.valid_to?.message}
                {...register('valid_to')}
              />
            </div>
          )}

          <div>
            <Textarea
              label="Specific Dates"
              placeholder="Enter specific dates, one per line or comma-separated&#10;e.g. 2025-12-25, 2025-12-31&#10;2026-01-01"
              rows={4}
              hint="These dates override the date range above"
              value={(specificDatesRaw ?? []).join('\n')}
              onChange={(e) => handleSpecificDatesChange(e.target.value)}
            />
          </div>

          <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm text-gray-600">
            <p className="font-medium text-gray-700 mb-1">Validity Summary</p>
            {allYear ? (
              <p>Valid all year round</p>
            ) : specificDatesRaw && specificDatesRaw.length > 0 ? (
              <p>Specific dates: {specificDatesRaw.join(', ')}</p>
            ) : validFrom && validTo ? (
              <p>Valid from {validFrom} to {validTo}</p>
            ) : (
              <p className="text-amber-600">No validity set — please configure dates or enable "All Year"</p>
            )}
          </div>
        </div>
      )}

      {/* Tab: Pricing */}
      {activeTab === 'pricing' && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Guest Pricing</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Controller
                name="weekday_adult"
                control={control}
                render={({ field }) => (
                  <NumberInput
                    label="Weekday Adult"
                    prefix="৳"
                    value={field.value}
                    onChange={(v) => field.onChange(v)}
                    error={errors.weekday_adult?.message}
                  />
                )}
              />
              <Controller
                name="friday_adult"
                control={control}
                render={({ field }) => (
                  <NumberInput
                    label="Friday Adult"
                    prefix="৳"
                    value={field.value}
                    onChange={(v) => field.onChange(v)}
                    error={errors.friday_adult?.message}
                  />
                )}
              />
              <Controller
                name="holiday_adult"
                control={control}
                render={({ field }) => (
                  <NumberInput
                    label="Holiday Adult"
                    prefix="৳"
                    value={field.value}
                    onChange={(v) => field.onChange(v)}
                    error={errors.holiday_adult?.message}
                  />
                )}
              />
              <Controller
                name="child_meal"
                control={control}
                render={({ field }) => (
                  <NumberInput
                    label="Child Meal Price"
                    prefix="৳"
                    value={field.value}
                    onChange={(v) => field.onChange(v)}
                    error={errors.child_meal?.message}
                  />
                )}
              />
              <Controller
                name="driver_price"
                control={control}
                render={({ field }) => (
                  <NumberInput
                    label="Driver Price"
                    prefix="৳"
                    value={field.value}
                    onChange={(v) => field.onChange(v)}
                    error={errors.driver_price?.message}
                  />
                )}
              />
            </div>
          </div>

          {packageType === 'night' && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Night Stay Extras</h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Controller
                  name="extra_person"
                  control={control}
                  render={({ field }) => (
                    <NumberInput
                      label="Extra Person"
                      prefix="৳"
                      hint="Per person per night"
                      value={field.value}
                      onChange={(v) => field.onChange(v)}
                      error={errors.extra_person?.message}
                    />
                  )}
                />
                <Controller
                  name="extra_bed"
                  control={control}
                  render={({ field }) => (
                    <NumberInput
                      label="Extra Bed"
                      prefix="৳"
                      hint="Per bed per night"
                      value={field.value}
                      onChange={(v) => field.onChange(v)}
                      error={errors.extra_bed?.message}
                    />
                  )}
                />
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Timing</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Check-in Time"
                type="time"
                error={errors.check_in?.message}
                {...register('check_in')}
              />
              <Input
                label="Check-out Time"
                type="time"
                error={errors.check_out?.message}
                {...register('check_out')}
              />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Meal Inclusions</h3>
            <p className="text-xs text-gray-500 mb-3">
              Controls which meals are counted in the daily room allocation report.
            </p>
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 flex flex-wrap gap-x-6 gap-y-3">
              {(
                [
                  { name: 'includes_breakfast', label: 'Breakfast' },
                  { name: 'includes_lunch',     label: 'Lunch' },
                  { name: 'includes_dinner',    label: 'Dinner' },
                  { name: 'includes_snacks',    label: 'Evening Snacks' },
                ] as const
              ).map(({ name, label }) => (
                <label key={name} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-forest-700 focus:ring-forest-500"
                    {...register(name)}
                  />
                  <span className="text-sm font-medium text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: Rooms */}
      {activeTab === 'rooms' && (
        <Controller
          name="room_prices"
          control={control}
          render={({ field }) => (
            <RoomPriceEditor
              inventory={inventory}
              value={field.value}
              onChange={(roomType, price) =>
                field.onChange({ ...field.value, [roomType]: price })
              }
              packageType={packageType}
            />
          )}
        />
      )}

      {/* Tab: Text Blocks */}
      {activeTab === 'text' && (
        <Controller
          name="title"
          control={control}
          render={() => {
            const textFields = ['title', 'intro', 'meals', 'activities', 'experience', 'why_choose_us', 'cta', 'notes'] as const
            const currentValues: Partial<Record<string, string>> = {}
            for (const f of textFields) {
              currentValues[f] = watch(f) ?? ''
            }
            return (
              <TextBlockEditor
                value={currentValues}
                onChange={(field, val) => {
                  setValue(field as typeof textFields[number], val)
                }}
              />
            )
          }}
        />
      )}

      {serverError && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {serverError}
        </div>
      )}
      {saveSuccess && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700 font-medium">
          Package saved successfully.
        </div>
      )}

      <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/packages')}
        >
          Cancel
        </Button>
        <Button type="submit" loading={isSubmitting}>
          {mode === 'create' ? 'Create Package' : 'Save Package'}
        </Button>
      </div>
    </form>
  )
}
