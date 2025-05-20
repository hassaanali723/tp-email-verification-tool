'use client'

import { BarChart4, Download, ArrowUp, CheckCircle } from 'lucide-react'
import Link from 'next/link'

export default function DashboardPage() {
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
            <div className="text-2xl font-bold">124,204</div>
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
            <div className="text-2xl font-bold">2,500</div>
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
            <div className="text-2xl font-bold">118,245</div>
            <div className="text-gray-500 text-sm">95.2%</div>
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
              <tr className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4 text-sm">emails-march-2023.csv</td>
                <td className="py-3 px-4 text-sm text-gray-500">Apr 15, 2023</td>
                <td className="py-3 px-4">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Completed
                  </span>
                </td>
                <td className="py-3 px-4 text-sm">1,240</td>
                <td className="py-3 px-4 text-sm text-green-600">1,182 (95.3%)</td>
              </tr>
              <tr className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-3 px-4 text-sm">newsletter-subscribers.csv</td>
                <td className="py-3 px-4 text-sm text-gray-500">Apr 12, 2023</td>
                <td className="py-3 px-4">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Completed
                  </span>
                </td>
                <td className="py-3 px-4 text-sm">3,845</td>
                <td className="py-3 px-4 text-sm text-green-600">3,541 (92.1%)</td>
              </tr>
              <tr className="hover:bg-gray-50">
                <td className="py-3 px-4 text-sm">customer-contacts.csv</td>
                <td className="py-3 px-4 text-sm text-gray-500">Apr 8, 2023</td>
                <td className="py-3 px-4">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    In Progress
                  </span>
                </td>
                <td className="py-3 px-4 text-sm">5,324</td>
                <td className="py-3 px-4 text-sm text-blue-600">2,651 (49.7%)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
} 