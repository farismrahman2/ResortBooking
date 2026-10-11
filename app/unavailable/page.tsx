import { UnavailableClient } from './UnavailableClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Connection problem' }

export default function UnavailablePage({ searchParams }: { searchParams: { next?: string } }) {
  const next = searchParams.next && searchParams.next.startsWith('/') && !searchParams.next.startsWith('//') ? searchParams.next : '/'
  return <UnavailableClient next={next} />
}
