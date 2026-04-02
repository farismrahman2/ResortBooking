'use client'

import { Textarea } from '@/components/ui/Textarea'

interface TextBlockEditorProps {
  value: Partial<Record<string, string>>
  onChange: (field: string, val: string) => void
}

const FIELDS: { key: string; label: string; placeholder: string; rows: number }[] = [
  {
    key: 'title',
    label: 'Title',
    placeholder: 'Package title shown on the quote (e.g. "Garden Resort Daylong Experience")',
    rows: 2,
  },
  {
    key: 'intro',
    label: 'Introduction',
    placeholder: 'Opening paragraph describing the package — sets the scene for the guest',
    rows: 3,
  },
  {
    key: 'meals',
    label: 'Meals & Dining',
    placeholder: 'Describe what meals are included: breakfast, lunch, dinner, snacks, beverages…',
    rows: 3,
  },
  {
    key: 'activities',
    label: 'Activities',
    placeholder: 'List available activities: swimming pool, boat rides, nature walks, bonfire…',
    rows: 3,
  },
  {
    key: 'experience',
    label: 'The Experience',
    placeholder: 'Paint a vivid picture of the guest experience — atmosphere, environment, feelings…',
    rows: 3,
  },
  {
    key: 'why_choose_us',
    label: 'Why Choose Us',
    placeholder: 'Key selling points: location, service quality, uniqueness, awards…',
    rows: 3,
  },
  {
    key: 'cta',
    label: 'Call to Action',
    placeholder: 'Closing line encouraging the guest to book (e.g. "Book now and get 10% off!")',
    rows: 2,
  },
  {
    key: 'notes',
    label: 'Notes & Disclaimers',
    placeholder: 'Any important notes: cancellation policy, things to bring, restrictions…',
    rows: 3,
  },
]

export function TextBlockEditor({ value, onChange }: TextBlockEditorProps) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {FIELDS.map((field) => (
        <Textarea
          key={field.key}
          label={field.label}
          placeholder={field.placeholder}
          rows={field.rows}
          value={value[field.key] ?? ''}
          onChange={(e) => onChange(field.key, e.target.value)}
        />
      ))}
    </div>
  )
}
