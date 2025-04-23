'use client'

import { Search, Bell, User, CheckCircle } from 'lucide-react'

export function Navbar() {
  return (
    <div className="h-16 bg-white border-b border-gray-100">
      <div className="h-full flex items-center justify-between px-6">
        {/* System status indicator - left side */}
        <div className="flex items-center">
          <div className="flex items-center text-sm">
            <span className="flex h-2 w-2 relative mr-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-gray-600">All systems operational</span>
          </div>
        </div>
        
        {/* Right side elements */}
        <div className="flex items-center space-x-4">
          {/* Search */}
          <div className="relative max-w-xs w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search..."
              className="block w-full pl-10 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#295c51]"
            />
          </div>
          
          {/* Notifications */}
          <button className="relative p-2 rounded-full hover:bg-gray-100">
            <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500"></span>
            <Bell className="h-5 w-5 text-gray-600" />
          </button>
          
          {/* Credits */}
          <div className="px-4 py-1.5 bg-[#295c51] text-white rounded-lg text-sm font-medium flex items-center">
            Credits: 2,500
          </div>
          
          {/* Profile */}
          <button className="p-1.5 rounded-full hover:bg-gray-100">
            <User className="h-5 w-5 text-gray-600" />
          </button>
        </div>
      </div>
    </div>
  )
}