'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Check, Copy, Download } from 'lucide-react'
import type { GuestNumber } from '@/lib/queries/guest-numbers'

interface Props {
  numbers: GuestNumber[]
}

export function GuestNumbersClient({ numbers }: Props) {
  const [search, setSearch] = useState('')
  const [copied, setCopied] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return numbers
    return numbers.filter((n) => n.phone.includes(q) || n.name.toLowerCase().includes(q))
  }, [numbers, search])

  async function copyAll() {
    await navigator.clipboard.writeText(filtered.map((n) => n.phone).join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function downloadCsv() {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
    const lines = ['phone,name,sources,last_seen']
    for (const n of filtered) {
      lines.push([n.phone, esc(n.name), n.sources.join('+'), n.last_seen.slice(0, 10)].join(','))
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `guest-numbers-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-64">
          <Input
            placeholder="Search name or number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="outline" size="md" onClick={copyAll}>
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied!' : `Copy ${filtered.length} numbers`}
        </Button>
        <Button variant="primary" size="md" onClick={downloadCsv}>
          <Download size={14} /> Download CSV
        </Button>
      </div>

      <p className="text-xs text-gray-500">
        {filtered.length === numbers.length
          ? `${numbers.length} unique numbers across all quotes and bookings (any status).`
          : `${filtered.length} of ${numbers.length} unique numbers match the search.`}
      </p>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2.5 font-medium">Phone</th>
              <th className="px-4 py-2.5 font-medium">Guest name</th>
              <th className="px-4 py-2.5 font-medium">Seen in</th>
              <th className="px-4 py-2.5 font-medium">Last seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-gray-400">
                  No numbers found.
                </td>
              </tr>
            ) : (
              filtered.map((n) => (
                <tr key={n.phone}>
                  <td className="px-4 py-2 font-mono tabular-nums">{n.phone}</td>
                  <td className="px-4 py-2">{n.name || <span className="text-gray-400">—</span>}</td>
                  <td className="px-4 py-2 text-xs text-gray-600">
                    {n.sources.map((s) => (
                      <span key={s} className="mr-1 inline-block rounded-full bg-gray-100 px-2 py-0.5">
                        {s}
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-2 text-xs tabular-nums text-gray-500">{n.last_seen.slice(0, 10)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
