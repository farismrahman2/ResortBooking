import { Topbar } from '@/components/layout/Topbar'
import { requirePermission } from '@/lib/auth/permissions'
import { listPaymentAccounts } from '@/lib/queries/payment-accounts'
import { PaymentAccountsClient } from '@/components/settings/PaymentAccountsClient'

export const dynamic = 'force-dynamic'

export default async function PaymentAccountsPage() {
  await requirePermission('settings', 'read')
  const accounts = await listPaymentAccounts(true)

  return (
    <div className="flex h-full flex-col">
      <Topbar
        title="Payment Accounts"
        subtitle="Where money lands — banks, wallets, card terminals, the cash drawer"
      />
      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-4xl">
          {accounts.length === 0 ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">Payment accounts aren&apos;t set up yet.</p>
              <p className="mt-1">
                Run <code className="rounded bg-amber-100 px-1">migrations/platform-audit/004_payment_accounts.sql</code>{' '}
                to create the table and four starter accounts, then rename them here with your real
                bank, wallet and terminal details.
              </p>
            </div>
          ) : (
            <PaymentAccountsClient accounts={accounts} />
          )}
        </div>
      </div>
    </div>
  )
}
