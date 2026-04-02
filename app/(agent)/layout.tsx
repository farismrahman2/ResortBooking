import { Sidebar } from '@/components/layout/Sidebar'

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto scrollable">
        {children}
      </main>
    </div>
  )
}
