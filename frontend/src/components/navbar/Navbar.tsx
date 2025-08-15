'use client'

import { Bell } from 'lucide-react'
import { UserButton } from '@clerk/nextjs'
import { useEffect, useState } from 'react'
import { useAuth } from '@clerk/nextjs'
import { fetchCreditBalance, fetchRecentCreditTransactions, type CreditTransaction } from '@/lib/payments-api'
import { CREDIT_BALANCE_REFRESH } from '@/lib/events'

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
    footer: "hidden",
    headerTitle: "text-[#295c51]",
    headerSubtitle: "text-gray-600",
    formButtonPrimary: "bg-[#295c51] hover:bg-[#1e453d] text-white",
    formFieldInput: "border-gray-300 focus:border-[#295c51] focus:ring-[#295c51]",
    dividerLine: "bg-gray-300",
    dividerText: "text-gray-500",
    socialButtonsBlockButton: "border border-gray-300 hover:bg-gray-50",
    profileSectionPrimaryButton: "bg-[#295c51] hover:bg-[#1e453d] text-white",
    accordionTriggerButton: "text-[#295c51]"
  }
}

export function Navbar() {
  const { getToken } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [hasNotifications, setHasNotifications] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [recent, setRecent] = useState<CreditTransaction[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const token = await getToken();
        const b = await fetchCreditBalance(token);
        setBalance(b);
        // Simple heads-up when running low
        setHasNotifications(b <= 100);
        const tx = await fetchRecentCreditTransactions(token, 5);
        setRecent(tx);
      } catch (e) {
        setBalance(null);
      }
    };
    load();
    const handler = () => load();
    window.addEventListener(CREDIT_BALANCE_REFRESH, handler);
    return () => window.removeEventListener(CREDIT_BALANCE_REFRESH, handler);
  }, [getToken]);

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
          {/* Notifications */}
          <div className="relative">
            <button
              className="relative p-2 rounded-full hover:bg-gray-100"
              onClick={() => setShowDropdown((v) => !v)}
            >
              {hasNotifications && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500"></span>}
              <Bell className="h-5 w-5 text-gray-600" />
            </button>
            {showDropdown && (
              <div className="absolute right-0 mt-2 w-80 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <div className="px-4 py-2 border-b text-sm font-semibold text-gray-700">Notifications</div>
                <div className="max-h-80 overflow-y-auto overflow-x-hidden">
                  {recent.length === 0 && (
                    <div className="px-4 py-3 text-sm text-gray-500">No recent credit activity.</div>
                  )}
                  {recent.map((t, idx) => (
                    <div key={idx} className="px-4 py-3 text-sm flex items-start justify-between hover:bg-gray-50">
                      <div>
                        <div className="font-medium text-gray-800">{t.type === 'purchase' ? 'Credits purchased' : t.type === 'consumption' ? 'Credits used' : t.type === 'trial' ? 'Trial credits' : 'Credit update'}</div>
                        {/* Show concise, user-friendly text for consumption events */}
                        <div className="text-gray-500 break-words">
                          {t.type === 'consumption' ? 'Email validation completed' : (t.description || '')}
                        </div>
                        {(t as any).timestamp && <div className="text-xs text-gray-400 mt-0.5">{new Date((t as any).timestamp as any).toLocaleString()}</div>}
                      </div>
                      <div className={t.type === 'consumption' ? 'text-red-600 font-semibold' : 'text-green-700 font-semibold'}>
                        {t.type === 'consumption' ? '-' : '+'}{t.amount.toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Credits */}
          <div className="px-4 py-1.5 bg-[#295c51] text-white rounded-lg text-sm font-medium flex items-center">
            Credits: {balance === null ? '—' : balance.toLocaleString()}
          </div>
          {/* Profile */}
          <UserButton 
            appearance={clerkAppearance}
            userProfileProps={{
              appearance: {
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
            }}
          />
        </div>
      </div>
    </div>
  )
}