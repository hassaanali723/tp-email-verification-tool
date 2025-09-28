'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { submitSupportTicket, fetchMyTickets, SupportTicket } from '@/lib/payments-api'

export default function SupportPage() {
  const { getToken } = useAuth()
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ name: '', email: '', problem: '', imageFile: null as File | null })
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const token = await getToken()
        const list = await fetchMyTickets(token)
        if (mounted) setTickets(list)
      } catch {}
      if (mounted) setLoading(false)
    })()
    return () => { mounted = false }
  }, [getToken])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const token = await getToken()
      const created = await submitSupportTicket(token, form)
      setTickets(prev => [created, ...prev])
      setForm({ name: '', email: '', problem: '', imageFile: null })
    } catch {}
    setSubmitting(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Support</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-1 shadow-sm border-gray-100">
          <h2 className="text-base font-medium text-gray-900 mb-4">Submit a ticket</h2>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm mb-1 text-gray-700">Name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full rounded-md border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#295c51]" required />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-700">Email</label>
              <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full rounded-md border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#295c51]" required />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-700">Problem</label>
              <textarea value={form.problem} onChange={e => setForm({ ...form, problem: e.target.value })} rows={4} className="w-full rounded-md border border-gray-200 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#295c51]" required />
            </div>
            <div>
              <label className="block text-sm mb-1 text-gray-700">Screenshot / image (optional)</label>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center px-3 py-2 bg-gray-100 hover:bg-gray-200 border border-gray-200 rounded-md cursor-pointer text-sm text-gray-700">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 mr-2"><path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.409 5.409a2.25 2.25 0 003.182 0L21.75 13.5"/><path d="M3.375 19.5h17.25a.375.375 0 00.375-.375V7.125a.375.375 0 00-.375-.375H17.25l-1.5-1.5H8.25l-1.5 1.5H3.375a.375.375 0 00-.375.375v12a.375.375 0 00.375.375z"/></svg>
                  Choose image
                  <input type="file" accept="image/*" onChange={e => setForm({ ...form, imageFile: e.target.files?.[0] || null })} className="hidden" />
                </label>
                <span className="text-xs text-gray-500 truncate max-w-[160px]">{form.imageFile ? form.imageFile.name : 'No file chosen'}</span>
              </div>
            </div>
            <Button disabled={submitting} type="submit" className="bg-[#295c51] hover:bg-[#224b43]">
              {submitting ? 'Submitting…' : 'Submit Ticket'}
            </Button>
          </form>
        </Card>

        <Card className="p-6 lg:col-span-2 shadow-sm border-gray-100">
          <h2 className="text-base font-medium text-gray-900 mb-4">Your tickets</h2>
          {loading ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : tickets.length === 0 ? (
            <div className="text-sm text-gray-500">No tickets yet.</div>
          ) : (
            <div className="space-y-2">
              {tickets.map(t => (
                <div key={t._id} className="flex items-start justify-between rounded-lg border border-gray-100 p-3 bg-white">
                  <div className="pr-4">
                    <div className="text-sm font-medium text-gray-900">{t.problem.slice(0, 80)}</div>
                    <div className="text-xs text-gray-500">Submitted on {t.createdAt ? new Date(t.createdAt).toLocaleString() : ''}</div>
                    <div className="text-xs text-gray-500">By {t.name} ({t.email})</div>
                    {t.imageUrl && (
                      <a href={t.imageUrl} target="_blank" rel="noreferrer" className="text-xs text-[#295c51] hover:underline">View attachment</a>
                    )}
                  </div>
                  <div>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs ${t.status === 'open' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>{t.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}


