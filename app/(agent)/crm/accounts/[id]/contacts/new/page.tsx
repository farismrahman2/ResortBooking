import { notFound } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { getAccountById } from '@/lib/queries/crm'
import { ContactForm } from '@/components/crm/ContactForm'

export const dynamic = 'force-dynamic'

export default async function NewContactPage({ params }: { params: { id: string } }) {
  await requirePermission('crm', 'write')
  const account = await getAccountById(params.id)
  if (!account) notFound()

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Add contact" subtitle={account.company_name} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <ContactForm accountId={account.id} />
        </div>
      </div>
    </div>
  )
}
