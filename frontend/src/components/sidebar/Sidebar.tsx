'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useClerk } from '@clerk/nextjs'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

// Icons
import {
  LayoutDashboard,
  Upload,
  CreditCard,
  User,
  LogOut,
  Receipt
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Validate', href: '/validate', icon: Upload },
  { name: 'Pricing', href: '/pricing', icon: CreditCard },
  { name: 'Subscription', href: '/subscription', icon: Receipt },
]

// Clerk appearance configuration
const clerkAppearance = {
  variables: {
    colorPrimary: "#295c51",
    colorText: "#295c51",
    colorTextSecondary: "#4B5563",
    colorBackground: "white",
    colorInputBackground: "#F9FAFB",
    colorInputText: "#295c51",
    colorSuccess: "#295c51",
    colorDanger: "#295c51",
    colorWarning: "#295c51"
  },
  elements: {
    card: "shadow-xl",
    footer: "hidden"
  }
}

export function Sidebar() {
  const pathname = usePathname()
  const { openUserProfile, signOut } = useClerk()
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const handleSignOut = () => {
    signOut()
  }

  const handleOpenUserProfile = () => {
    openUserProfile({
      appearance: clerkAppearance
    })
  }

  // Prevent hydration errors by not rendering clerk-dependent elements until client-side
  if (!isMounted) {
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
        <div className="flex-1 px-3">
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

          {/* Account Button Placeholder */}
          <div className="group flex w-full items-center px-3 py-2.5 my-1 text-sm font-medium rounded-lg transition-colors text-gray-700">
            <User className="mr-3 h-5 w-5 flex-shrink-0 text-gray-500" />
            Account
          </div>
        </div>

        {/* Bottom section */}
        <div className="px-3 py-4 border-t border-gray-100">
          <div className="group flex w-full items-center px-3 py-2.5 my-1 text-sm font-medium rounded-lg transition-colors text-gray-700">
            <LogOut className="mr-3 h-5 w-5 flex-shrink-0 text-gray-500" />
            Log out
          </div>
        </div>
      </div>
    )
  }

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
      <div className="flex-1 px-3">
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

        {/* Account Button */}
        <button
          onClick={handleOpenUserProfile}
          className="group flex w-full items-center px-3 py-2.5 my-1 text-sm font-medium rounded-lg transition-colors text-gray-700 hover:bg-gray-100"
        >
          <User className="mr-3 h-5 w-5 flex-shrink-0 text-gray-500" />
          Account
        </button>
      </div>

      {/* Bottom section */}
      <div className="px-3 py-4 border-t border-gray-100">
        <button
          onClick={handleSignOut}
          className="group flex w-full items-center px-3 py-2.5 my-1 text-sm font-medium rounded-lg transition-colors text-gray-700 hover:bg-gray-100"
        >
          <LogOut className="mr-3 h-5 w-5 flex-shrink-0 text-gray-500" />
          Log out
        </button>
      </div>
    </div>
  )
} 