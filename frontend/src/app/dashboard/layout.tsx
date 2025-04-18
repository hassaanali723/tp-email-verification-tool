import React from 'react'

export const metadata = {
  title: 'Dashboard - Email Verification Tool',
  description: 'View your email verification statistics and recent validations.',
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
} 