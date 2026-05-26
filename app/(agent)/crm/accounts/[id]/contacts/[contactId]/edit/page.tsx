import { notFound } from 'next/navigation'
import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { getContactById } from '@/lib/queries/crm'
import { ContactForm } from '@/components/crm/ContactForm'

export const dynamic = 'force-dynamic'

export default async function EditContactPage({ params }: { params: { id: string; contactId: string } }) {
  await requirePermission('crm', 'write')
  const contact = await getContactById(params.contactId)
  if (!contact) notFound()

  return (
    <div className="flex h-full flex-col">
      <Topbar title="Edit contact" subtitle={contact.full_name} />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <ContactForm accountId={params.id} contact={contact} />
        </div>
      </div>
    </div>
  )
}
