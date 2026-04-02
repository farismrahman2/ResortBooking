import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface TopbarProps {
  title:    string
  subtitle?: string
  action?: {
    label: string
    href:  string
  }
}

export function Topbar({ title, subtitle, action }: TopbarProps) {
  return (
    <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
      <div>
        <h1 className="page-header">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
      </div>
      {action && (
        <Link href={action.href}>
          <Button variant="primary" size="md">
            <Plus size={16} />
            {action.label}
          </Button>
        </Link>
      )}
    </header>
  )
}
