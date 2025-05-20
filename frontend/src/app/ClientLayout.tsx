"use client";
import { ClerkProvider, SignInButton, SignUpButton, SignedOut } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { Inter } from "next/font/google";
import { usePathname } from "next/navigation";

const inter = Inter({ subsets: ["latin"] });

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const hideHeader = pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");

  return (
    <ClerkProvider afterSignOutUrl="/sign-in">
      <div className={cn("w-full h-full min-h-screen bg-background antialiased", inter.className)}>
        {!hideHeader && (
          <header>
            <SignedOut>
              <SignInButton mode="redirect" />
              <SignUpButton mode="redirect" />
            </SignedOut>
          </header>
        )}
        {children}
      </div>
    </ClerkProvider>
  );
}