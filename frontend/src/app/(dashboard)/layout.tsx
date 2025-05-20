import { Sidebar } from "@/components/sidebar/Sidebar";
import { Navbar } from '@/components/navbar/Navbar';
import { cn } from "@/lib/utils";
import { Inter } from "next/font/google";
import "../globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: 'Dashboard - Email Verification Tool',
  description: 'View your email verification statistics and recent validations.',
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-80">
        <Navbar />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
} 