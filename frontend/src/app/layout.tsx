import type { Metadata } from "next";
import ClientLayout from "./ClientLayout";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s | Email Verification Tool",
    default: "Email Verification Tool - Validate & Clean Email Lists",
  },
  description: "Professional email verification tool to validate, clean and verify email lists. Improve deliverability and reduce bounce rates with our accurate email validator.",
  keywords: ["email verification", "email validator", "email list cleaning", "bulk email verification", "email deliverability"],
  authors: [{ name: "Your Company Name" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://your-domain.com",
    siteName: "Email Verification Tool",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Email Verification Tool",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Email Verification Tool",
    description: "Professional email verification tool to validate, clean and verify email lists.",
    images: ["/twitter-image.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
