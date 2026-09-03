'use client'

import { useState, useTransition } from 'react'
import { upsertSettings } from '@/lib/actions/settings'
import type { SettingsMap } from '@/lib/supabase/types'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { safeCall } from '@/lib/actions/safe-call'

interface SettingsFormProps {
  initialSettings: SettingsMap
}

export function SettingsForm({ initialSettings }: SettingsFormProps) {
  const [paymentInstructions, setPaymentInstructions] = useState(
    initialSettings['payment_instructions'] ?? '',
  )
  const [contactNumbers, setContactNumbers] = useState(
    initialSettings['contact_numbers'] ?? '',
  )
  const [defaultNotes, setDefaultNotes] = useState(
    initialSettings['default_notes'] ?? '',
  )
  const [whatsappFooter, setWhatsappFooter] = useState(
    initialSettings['whatsapp_footer_text'] ?? '',
  )
  const [eveningHandover, setEveningHandover] = useState(
    initialSettings['evening_handover_time'] ?? '18:00',
  )
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleSave = () => {
    setError(null)
    startTransition(async () => {
      const result = await safeCall(() => upsertSettings({
        payment_instructions: paymentInstructions,
        contact_numbers: contactNumbers,
        default_notes: defaultNotes,
        whatsapp_footer_text: whatsappFooter,
        evening_handover_time: eveningHandover,
      }))
      if (!result.success) {
        setError(result.error ?? 'Failed to save settings')
        return
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    })
  }

  return (
    <div className="space-y-5">
      <Textarea
        label="Payment Instructions"
        placeholder="e.g. Please send advance payment to bKash: 01XXX-XXXXXX (Personal)"
        rows={3}
        value={paymentInstructions}
        onChange={(e) => setPaymentInstructions(e.target.value)}
      />

      <Input
        label="Contact Numbers"
        placeholder="e.g. 01XXX-XXXXXX, 01XXX-XXXXXX"
        value={contactNumbers}
        onChange={(e) => setContactNumbers(e.target.value)}
      />

      <Textarea
        label="Default Notes"
        placeholder="Notes that appear on every quote by default (e.g. cancellation policy, what to bring…)"
        rows={3}
        value={defaultNotes}
        onChange={(e) => setDefaultNotes(e.target.value)}
      />

      <Textarea
        label="WhatsApp Footer Text"
        placeholder="Footer text added to WhatsApp messages (e.g. Thank you for choosing Garden Centre Resort!)"
        rows={2}
        value={whatsappFooter}
        onChange={(e) => setWhatsappFooter(e.target.value)}
      />

      <Input
        label="Evening room handover time"
        type="time"
        value={eveningHandover}
        onChange={(e) => setEveningHandover(e.target.value)}
        hint="When rooms marked 'evening handover' on a night booking are given to the guests — after that day's day guests leave. Shown on confirmations and the daily report."
        className="max-w-[200px]"
      />

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={handleSave}
          loading={isPending}
        >
          Save Settings
        </Button>
        {saved && (
          <span className="text-sm text-green-600 font-medium animate-in fade-in">
            Saved!
          </span>
        )}
      </div>
    </div>
  )
}
