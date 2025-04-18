'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

// Icons
import {
  LayoutDashboard,
  Upload,
  CreditCard,
  User,
  Settings,
  Bell,
  LogOut
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Validate', href: '/validate', icon: Upload },
  { name: 'Pricing', href: '/pricing', icon: CreditCard },
  { name: 'Account', href: '/account', icon: User },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="flex h-screen w-80 flex-col fixed left-0 top-0 bg-white border-r border-gray-100">
      {/* Logo */}
      <div className="flex h-24 items-center justify-center px-4">
        <Link href="/dashboard" className="flex items-center">
          <Image 
            src="/logo.png" 
            alt="Company Logo" 
            width={180} 
            height={54}
            className="object-contain"
            priority
          />
        </Link>
      </div>

      {/* Main navigation */}
      <div className="px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'group flex items-center px-3 py-2.5 my-1 text-sm font-medium rounded-lg transition-colors',
                isActive
                  ? 'bg-[#295c51] text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              )}
            >
              <item.icon
                className={cn(
                  'mr-3 h-5 w-5 flex-shrink-0',
                  isActive
                    ? 'text-white'
                    : 'text-gray-500'
                )}
                aria-hidden="true"
              />
              {item.name}
            </Link>
          )
        })}
      </div>

      {/* Notifications Section */}
      <div className="mt-auto px-3 pt-4 border-t border-gray-100">
        <Link
          href="/notifications"
          className="group flex items-center px-3 py-2.5 my-1 text-sm font-medium rounded-lg transition-colors text-gray-700 hover:bg-gray-100"
        >
          <Bell className="mr-3 h-5 w-5 flex-shrink-0 text-gray-500" />
          Notifications
        </Link>
      </div>

      {/* Bottom section */}
      <div className="px-3 py-4 border-t border-gray-100">
        <Link
          href="/settings"
          className="group flex items-center px-3 py-2.5 my-1 text-sm font-medium rounded-lg transition-colors text-gray-700 hover:bg-gray-100"
        >
          <Settings className="mr-3 h-5 w-5 flex-shrink-0 text-gray-500" />
          Settings
        </Link>
        <button
          className="group flex w-full items-center px-3 py-2.5 my-1 text-sm font-medium rounded-lg transition-colors text-gray-700 hover:bg-gray-100"
        >
          <LogOut className="mr-3 h-5 w-5 flex-shrink-0 text-gray-500" />
          Log out
        </button>
      </div>
    </div>
  )
} 