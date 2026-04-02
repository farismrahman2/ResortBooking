'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Edit, Copy, Archive } from 'lucide-react'
import { togglePackageActive, duplicatePackage, archivePackage } from '@/lib/actions/packages'
import type { PackageRow } from '@/lib/supabase/types'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { formatDate } from '@/lib/formatters/dates'
import { cn } from '@/lib/utils'

interface PackageTableProps {
  packages: PackageRow[]
}

function ValidityCell({ pkg }: { pkg: PackageRow }) {
  if (pkg.all_year) return <span className="text-gray-600">All Year</span>
  if (pkg.specific_dates?.length > 0) {
    return (
      <span className="text-gray-600">
        {pkg.specific_dates.length} specific date{pkg.specific_dates.length !== 1 ? 's' : ''}
      </span>
    )
  }
  if (pkg.valid_from && pkg.valid_to) {
    return (
      <span className="text-gray-600 text-xs">
        {formatDate(pkg.valid_from)} → {formatDate(pkg.valid_to)}
      </span>
    )
  }
  return <span className="text-amber-600 text-xs">Not set</span>
}

export function PackageTable({ packages }: PackageTableProps) {
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())

  const setLoading = (id: string, loading: boolean) => {
    setLoadingIds((prev) => {
      const next = new Set(prev)
      loading ? next.add(id) : next.delete(id)
      return next
    })
  }

  const handleToggleActive = async (pkg: PackageRow) => {
    setLoading(pkg.id, true)
    try {
      await togglePackageActive(pkg.id, !pkg.is_active)
    } finally {
      setLoading(pkg.id, false)
    }
  }

  const handleDuplicate = async (id: string) => {
    setLoading(id, true)
    try {
      await duplicatePackage(id)
    } finally {
      setLoading(id, false)
    }
  }

  const handleArchive = async (id: string) => {
    if (!confirm('Archive this package? It will be set to inactive.')) return
    setLoading(id, true)
    try {
      await archivePackage(id)
    } finally {
      setLoading(id, false)
    }
  }

  if (packages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-gray-500 text-sm">No packages yet.</p>
        <p className="text-gray-400 text-xs mt-1">Create your first package using the button above.</p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-4 py-3 text-left font-medium text-gray-600">Name</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Validity</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Override</th>
            <th className="px-4 py-3 text-left font-medium text-gray-600">Status</th>
            <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {packages.map((pkg) => {
            const isLoading = loadingIds.has(pkg.id)
            return (
              <tr
                key={pkg.id}
                className={cn(
                  'transition-colors hover:bg-gray-50',
                  !pkg.is_active && 'opacity-60',
                )}
              >
                {/* Name + Priority */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/packages/${pkg.id}`}
                      className="font-medium text-gray-900 hover:text-forest-700 hover:underline"
                    >
                      {pkg.name}
                    </Link>
                    <span className="text-xs text-gray-400">#{pkg.display_order}</span>
                  </div>
                </td>

                {/* Type */}
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
                      pkg.type === 'daylong'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-indigo-50 text-indigo-700 border border-indigo-200',
                    )}
                  >
                    {pkg.type === 'daylong' ? 'Daylong' : 'Night Stay'}
                  </span>
                </td>

                {/* Validity */}
                <td className="px-4 py-3">
                  <ValidityCell pkg={pkg} />
                </td>

                {/* Override */}
                <td className="px-4 py-3">
                  {pkg.is_override && (
                    <Badge variant="warning">Override</Badge>
                  )}
                </td>

                {/* Status toggle */}
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggleActive(pkg)}
                    disabled={isLoading}
                    className={cn(
                      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border transition-colors',
                      pkg.is_active
                        ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                        : 'bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200',
                      isLoading && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    {pkg.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <Link href={`/packages/${pkg.id}`}>
                      <Button variant="ghost" size="sm" title="Edit package">
                        <Edit size={14} />
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Duplicate package"
                      disabled={isLoading}
                      onClick={() => handleDuplicate(pkg.id)}
                    >
                      <Copy size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Archive package"
                      disabled={isLoading}
                      onClick={() => handleArchive(pkg.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Archive size={14} />
                    </Button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
