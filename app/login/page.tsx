import { Leaf } from 'lucide-react'
import { LoginForm } from './LoginForm'

export const metadata = {
  title: 'Sign In',
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string }
}) {
  const next = searchParams.next ?? '/'

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-sm">
        {/* Branding */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-forest-700 shadow-sm mb-3">
            <Leaf size={22} className="text-white" />
          </div>
          <h1 className="text-lg font-bold text-gray-900">Garden Centre Resort</h1>
          <p className="text-sm text-gray-500">Internal Agent Portal</p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Sign in</h2>
          <p className="text-xs text-gray-500 mb-5">Enter your credentials to continue</p>
          <LoginForm next={next} />
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Access is restricted to authorised agents.
        </p>
      </div>
    </div>
  )
}
