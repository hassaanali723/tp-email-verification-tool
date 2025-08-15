'use client'

import { BarChart4, Download, ArrowUp, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { fetchFilesWithLimit, fetchUserAggregateStats } from '@/lib/file-api'
import { fetchCreditBalance } from '@/lib/payments-api'

interface RecentFileRow {
  id: string
  filename: string
  uploadedAt: string
  status: string
  totalEmails: number
  stats?: {
    deliverable?: { count: number }
    undeliverable?: { count: number }
    risky?: { count: number }
    unknown?: { count: number }
  }
}

export default function DashboardPage() {
  const { getToken } = useAuth()
  const [balance, setBalance] = useState<number | null>(null)
  const [recentFiles, setRecentFiles] = useState<RecentFileRow[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const token = await getToken()
        const authToken = token || ''
        const [balanceVal, filesRes, aggRes] = await Promise.all([
          fetchCreditBalance(authToken),
          fetchFilesWithLimit(3, authToken),
          fetchUserAggregateStats(authToken)
        ])
        setBalance(balanceVal)
        const files = filesRes?.data?.files || []
        setRecentFiles(files)
        const agg = aggRes?.data || {}
        setTotals({
          processed: agg.totalProcessed || 0,
          deliverable: agg.deliverable || 0,
        })
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [getToken])

  const [totals, setTotals] = useState<{ processed: number; deliverable: number }>({ processed: 0, deliverable: 0 })
  const totalValid = totals.deliverable
  const totalProcessed = totals.processed

  const validPercent = totalProcessed > 0 ? Math.round((totalValid / totalProcessed) * 1000) / 10 : 0

  if (isLoading) {
    return <div className="text-sm text-gray-500">Loading dashboard...</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Welcome Back!</h1>
        <p className="text-gray-500 mt-1">
          Monitor your email verification progress and statistics.
        </p>
      </div>

      {/* Stats cards row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Total emails card */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 relative overflow-hidden">
          <div className="flex items-center mb-4">
            <div className="p-2 bg-[#295c51] rounded-lg text-white">
              <BarChart4 className="h-5 w-5" />
            </div>
          </div>
          <h3 className="text-gray-500 text-sm mb-1">Total emails processed</h3>
          <div className="flex items-end justify-between">
            <div className="text-2xl font-bold">{totalProcessed.toLocaleString()}</div>
            <div className="text-green-600 text-sm flex items-center">
              <ArrowUp className="h-4 w-4 mr-1" />
              24%
            </div>
          </div>
        </div>

        {/* Credits balance card */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 relative overflow-hidden">
          <div className="flex items-center mb-4">
            <div className="p-2 bg-[#295c51] rounded-lg text-white">
              <Download className="h-5 w-5" />
            </div>
          </div>
          <h3 className="text-gray-500 text-sm mb-1">Your balance</h3>
          <div className="flex items-end justify-between">
            <div className="text-2xl font-bold">{balance === null ? '—' : balance.toLocaleString()}</div>
            <div className="text-sm text-gray-500">credits</div>
          </div>

          {/* Download button */}
          <Link href="/dashboard/download" className="mt-4 inline-flex items-center px-4 py-2 rounded-lg bg-gray-100 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors">
            <Download className="h-4 w-4 mr-2" />
            Download report
          </Link>
        </div>

        {/* Verified emails card */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 relative overflow-hidden">
          <div className="flex items-center mb-4">
            <div className="p-2 bg-[#295c51] rounded-lg text-white">
              <CheckCircle className="h-5 w-5" />
            </div>
          </div>
          <h3 className="text-gray-500 text-sm mb-1">Valid emails</h3>
          <div className="flex items-end justify-between">
            <div className="text-2xl font-bold">{totalValid.toLocaleString()}</div>
            <div className="text-gray-500 text-sm">{validPercent}%</div>
          </div>
        </div>
      </div>

      {/* Recent files table */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Recent Files</h2>
          <Link href="/validate" className="text-sm text-[#295c51] hover:underline">
            Verify more
          </Link>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Filename</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Date</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Status</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Emails</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Valid</th>
              </tr>
            </thead>
            <tbody>
              {recentFiles.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 px-4 text-center text-sm text-gray-500">
                    No files have been verified yet. 
                    <Link href="/validate" className="ml-1 text-[#295c51] hover:underline">
                      Upload a file to start verification
                    </Link>
                    .
                  </td>
                </tr>
              )}
              {recentFiles.map((f) => {
                const deliverable = f.stats?.deliverable?.count || 0
                const pct = f.totalEmails > 0 ? Math.round((deliverable / f.totalEmails) * 1000) / 10 : 0
                const isCompleted = (f.status === 'completed' || f.status === 'verified')
                return (
                  <tr key={f.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4 text-sm">{f.filename}</td>
                    <td className="py-3 px-4 text-sm text-gray-500">{new Date(f.uploadedAt).toLocaleDateString()}</td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${isCompleted ? 'bg-green-100 text-green-800' : f.status === 'processing' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'}`}>
                        {isCompleted ? 'Completed' : f.status === 'processing' ? 'In Progress' : 'Unverified'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm">{f.totalEmails.toLocaleString()}</td>
                    <td className={`py-3 px-4 text-sm ${isCompleted ? 'text-green-600' : 'text-blue-600'}`}>{deliverable.toLocaleString()} ({pct}%)</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
} 