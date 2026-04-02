'use client'

import { Badge } from '@/components/ui/Badge'
import type { PackageWithPrices } from '@/lib/supabase/types'

interface PackageSelectorProps {
  packages: PackageWithPrices[]
  value: string
  onChange: (pkg: PackageWithPrices | null) => void
}

export function PackageSelector({ packages, value, onChange }: PackageSelectorProps) {
  const daylong = packages.filter((p) => p.type === 'daylong')
  const night   = packages.filter((p) => p.type === 'night')

  const selectedPkg = packages.find((p) => p.id === value) ?? null

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value
    if (!id) {
      onChange(null)
      return
    }
    const pkg = packages.find((p) => p.id === id) ?? null
    onChange(pkg)
  }

  return (
    <div className="space-y-3">
      <div className="w-full">
        <label htmlFor="package-select" className="field-label">
          Package <span className="ml-1 text-red-500">*</span>
        </label>
        <select
          id="package-select"
          value={value}
          onChange={handleChange}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-forest-600 focus:outline-none focus:ring-2 focus:ring-forest-200"
        >
          <option value="">— Select a package —</option>

          {daylong.length > 0 && (
            <optgroup label="Daylong Packages">
              {daylong.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name}
                  {pkg.is_override ? ' ★' : ''}
                </option>
              ))}
            </optgroup>
          )}

          {night.length > 0 && (
            <optgroup label="Night Stay Packages">
              {night.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name}
                  {pkg.is_override ? ' ★' : ''}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>

      {selectedPkg && (
        <div className="rounded-lg border border-forest-200 bg-forest-50 p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-forest-900">{selectedPkg.name}</span>
            <Badge variant={selectedPkg.type === 'daylong' ? 'info' : 'success'}>
              {selectedPkg.type === 'daylong' ? 'Daylong' : 'Night Stay'}
            </Badge>
            {selectedPkg.is_override && (
              <Badge variant="warning">Override / Special</Badge>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-600">
            <span>
              <span className="font-medium">Check-in:</span> {selectedPkg.check_in}
            </span>
            <span>
              <span className="font-medium">Check-out:</span> {selectedPkg.check_out}
            </span>
          </div>
          {(selectedPkg.meals || selectedPkg.activities) && (
            <div className="text-xs text-gray-600 space-y-0.5">
              {selectedPkg.meals && (
                <p>
                  <span className="font-medium">Meals:</span> {selectedPkg.meals}
                </p>
              )}
              {selectedPkg.activities && (
                <p>
                  <span className="font-medium">Activities:</span> {selectedPkg.activities}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
