import { Info } from 'lucide-react'

interface Props {
  reason: string
  className?: string
}

/** Inline note shown when comparison data isn't available for the selected period. */
export function InsufficientDataNote({ reason, className }: Props) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 ${className ?? ''}`}
      title={reason}
    >
      <Info size={10} /> {reason}
    </span>
  )
}
