'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { Loader2 } from 'lucide-react'
import { signInAction } from './actions'

interface LoginFormProps {
  next: string
}

export function LoginForm({ next }: LoginFormProps) {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [pending,  startTransition] = useTransition()

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)

    const formData = new FormData()
    formData.set('email',    email.trim())
    formData.set('password', password)
    formData.set('next',     next)

    startTransition(async () => {
      try {
        const result = await signInAction(formData)
        // On success, the server action calls redirect() which never returns
        // normally on the client — this branch only runs on error.
        if (result && 'error' in result) {
          setError(result.error)
        }
      } catch (err) {
        // redirect() throws a NEXT_REDIRECT internally — that's expected and
        // React will handle the navigation. Only real errors get here.
        if (err instanceof Error && err.message.includes('NEXT_REDIRECT')) {
          return
        }
        setError(err instanceof Error ? err.message : String(err))
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-xs font-medium text-gray-700 mb-1">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          disabled={pending}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-forest-500 disabled:bg-gray-50"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-xs font-medium text-gray-700 mb-1">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-forest-500 disabled:bg-gray-50"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 whitespace-pre-wrap">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending || !email || !password}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-forest-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-forest-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
      >
        {pending && <Loader2 size={14} className="animate-spin" />}
        {pending ? 'Signing in...' : 'Sign In'}
      </button>
    </form>
  )
}
