'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { cancelSubscription, cancelSubscriptionNow, resumeSubscription, fetchBillingHistory, fetchSubscription, fetchInvoices, BillingItem, SubscriptionStatus, InvoiceItem } from '@/lib/payments-api'
import { CheckCircle2, CircleAlert, Clock3, CreditCard, XCircle, ExternalLink, FileDown } from 'lucide-react'

export default function SubscriptionPage() {
  const { getToken } = useAuth()
  const [loading, setLoading] = useState(true)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [status, setStatus] = useState<SubscriptionStatus | null>(null)
  const [history, setHistory] = useState<BillingItem[]>([])
  const [invoices, setInvoices] = useState<InvoiceItem[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const token = await getToken()
        const [sub, hist, inv] = await Promise.all([
          fetchSubscription(token),
          fetchBillingHistory(token, 100),
          fetchInvoices(token)
        ])
        if (!mounted) return
        setStatus(sub)
        setHistory(hist)
        setInvoices(inv)
      } catch (e: any) {
        if (!mounted) return
        setError(e?.message || 'Failed to load subscription info')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [getToken])

  const isActiveSub = status?.planType === 'subscription' && (status?.status === 'active' || status?.status === 'trialing' || status?.status === 'past_due')

  const handleCancel = async () => {
    setCancelLoading(true)
    try {
      const token = await getToken()
      await cancelSubscription(token)
      // Refresh after cancellation
      const sub = await fetchSubscription(token)
      setStatus(sub)
    } catch (e) {
      // no-op, keep errors quiet here, we can surface a toast in future
    } finally {
      setCancelLoading(false)
    }
  }

  const [cancelNowLoading, setCancelNowLoading] = useState(false)
  const handleCancelNow = async () => {
    setCancelNowLoading(true)
    try {
      const token = await getToken()
      await cancelSubscriptionNow(token)
      const sub = await fetchSubscription(token)
      setStatus(sub)
    } catch (e) {
    } finally {
      setCancelNowLoading(false)
    }
  }

  const [resumeLoading, setResumeLoading] = useState(false)
  const handleResume = async () => {
    setResumeLoading(true)
    try {
      const token = await getToken()
      await resumeSubscription(token)
      // Optimistic update so UI reflects change immediately
      setStatus(prev => prev ? { ...prev, cancelAtPeriodEnd: false } as SubscriptionStatus : prev)
      const sub = await fetchSubscription(token)
      setStatus(sub)
    } catch (e) {
    } finally {
      setResumeLoading(false)
    }
  }

  const currentPeriod = useMemo(() => {
    if (!status?.currentPeriodStart && !status?.currentPeriodEnd) return null
    const fmt = (d: Date | null) => d ? d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : ''
    const start = status?.currentPeriodStart ? new Date(status.currentPeriodStart) : null
    const end = status?.currentPeriodEnd ? new Date(status.currentPeriodEnd) : null
    return `${fmt(start)} - ${fmt(end)}`
  }, [status])

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-gray-900">Subscription</h1>
        <p className="text-sm text-gray-500">Manage your plan and see your billing history.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Current Subscription */}
        <Card className="p-6 lg:col-span-2 shadow-sm border-gray-100">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500"><Clock3 className="h-4 w-4" /> Loading…</div>
          ) : error ? (
            <div className="flex items-center gap-2 text-sm text-red-600"><CircleAlert className="h-4 w-4" /> {error}</div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="text-xs uppercase tracking-wide text-gray-500">Plan</div>
                  <div className="text-lg font-medium text-gray-900">
                    {status?.planType === 'subscription' ? 'Pro Monthly' : status?.planType === 'trial' ? 'Trial' : 'Pay as you go'}
                  </div>
                </div>
                <Badge className={cn('px-2.5 py-1 text-xs', isActiveSub ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700')}>
                  {isActiveSub ? (
                    <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Active</span>
                  ) : (
                    <span className="inline-flex items-center gap-1"><XCircle className="h-3.5 w-3.5" /> Inactive</span>
                  )}
                </Badge>
              </div>

              {status?.planType === 'subscription' ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="rounded-lg border border-gray-100 p-4 bg-white">
                    <div className="text-xs text-gray-500">Current Period</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">{currentPeriod || '—'}</div>
                  </div>
                  <div className="rounded-lg border border-gray-100 p-4 bg-white">
                    <div className="text-xs text-gray-500">Credits / month</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">{status?.creditsPerMonth?.toLocaleString?.() ?? '—'}</div>
                  </div>
                  <div className="rounded-lg border border-gray-100 p-4 bg-white">
                    <div className="text-xs text-gray-500">Next Billing</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">{status?.currentPeriodEnd ? new Date(status.currentPeriodEnd).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-gray-100 p-4 bg-white">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <CreditCard className="h-4 w-4 text-gray-500" />
                    {status?.planType === 'trial' ? 'You are on a trial. Purchase credits or start a subscription from Pricing.' : 'You are on pay‑as‑you‑go. You can start a subscription from Pricing.'}
                  </div>
                </div>
              )}

              {isActiveSub && (
                <div className="flex flex-wrap gap-3">
                  {status?.cancelAtPeriodEnd ? (
                    <>
                      <Button disabled className="bg-gray-100 text-gray-600">
                        Cancellation Scheduled
                      </Button>
                      <Button disabled={resumeLoading} onClick={handleResume} className="bg-emerald-600 hover:bg-emerald-700">
                        {resumeLoading ? 'Resuming…' : 'Resume'}
                      </Button>
                    </>
                  ) : (
                    <Button disabled={cancelLoading} onClick={handleCancel} className="bg-amber-500 hover:bg-amber-600 text-white">
                      {cancelLoading ? 'Cancel at Period End…' : 'Cancel at Period End'}
                    </Button>
                  )}
                  <Button disabled={cancelNowLoading} onClick={handleCancelNow} className="bg-red-700 hover:bg-red-800">
                    {cancelNowLoading ? 'Cancel Now…' : 'Cancel Now'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Billing History */}
        <Card className="p-6 shadow-sm border-gray-100">
          <h2 className="text-base font-medium text-gray-900 mb-4">Billing History</h2>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500"><Clock3 className="h-4 w-4" /> Loading…</div>
          ) : (
            <div className="space-y-2 max-h-[180px] overflow-auto pr-2">
              {history.length === 0 && (
                <div className="text-sm text-gray-500">No billing history yet.</div>
              )}
              {history.map((item, idx) => {
                const isPurchase = item.type === 'purchase'
                const isRefund = item.type === 'refund'
                const label = isPurchase ? 'Purchase' : isRefund ? 'Refund' : 'Trial'
                const chipClass = isPurchase
                  ? 'bg-green-100 text-green-800'
                  : isRefund
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-purple-100 text-purple-800'
                return (
                  <div key={idx} className="flex items-center justify-between rounded-lg border border-gray-100 p-3 bg-white">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge className={cn('px-2.5 py-0.5 text-xs', chipClass)}>{label}</Badge>
                        <div className="truncate text-sm text-gray-700">{item.description || item.reference}</div>
                      </div>
                    </div>
                    <div className="ml-3 text-sm font-medium text-gray-900 whitespace-nowrap">{item.amount.toLocaleString()} credits</div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Invoices */}
        <Card className="p-6 shadow-sm border-gray-100 lg:col-span-3">
          <h2 className="text-base font-medium text-gray-900 mb-4">Invoices</h2>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500"><Clock3 className="h-4 w-4" /> Loading…</div>
          ) : (
            <div className="overflow-auto">
              {invoices.length === 0 ? (
                <div className="text-sm text-gray-500">No invoices yet.</div>
              ) : (
                <div className="min-w-[760px]">
                  <div className="grid grid-cols-6 gap-3 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 bg-gray-50 rounded-md border border-gray-100">
                    <div>Number</div>
                    <div>Status</div>
                    <div className="text-right">Amount</div>
                    <div>Date</div>
                    <div className="col-span-2">Links</div>
                  </div>
                  <div className="divide-y divide-gray-100 border-x border-b border-gray-100 rounded-b-md">
                    {invoices.map((inv, idx) => {
                      const status = (inv.status || '').toLowerCase();
                      const statusClass = status === 'paid'
                        ? 'bg-green-100 text-green-800'
                        : status === 'open' || status === 'draft'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-gray-100 text-gray-700';
                      return (
                        <div key={inv.id} className="grid grid-cols-6 gap-3 items-center px-3 py-3 text-sm hover:bg-gray-50">
                          <div className="truncate font-medium text-gray-900">{inv.number || inv.id}</div>
                          <div>
                            <Badge className={`px-2.5 py-0.5 text-xs ${statusClass}`}>{inv.status || '-'}</Badge>
                          </div>
                          <div className="text-right tabular-nums">
                            {typeof inv.amountDue === 'number' ? (inv.amountDue / 100).toLocaleString(undefined, { style: 'currency', currency: (inv.currency || 'usd').toUpperCase() }) : '-'}
                          </div>
                          <div>{inv.created ? new Date(inv.created).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}</div>
                          <div className="col-span-2 flex gap-3">
                            {inv.hostedInvoiceUrl && (
                              <a href={inv.hostedInvoiceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#295c51] hover:underline">
                                <ExternalLink className="h-4 w-4" /> View
                              </a>
                            )}
                            {inv.invoicePdf && (
                              <a href={inv.invoicePdf} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#295c51] hover:underline">
                                <FileDown className="h-4 w-4" /> Download PDF
                              </a>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}


