import type { Metadata } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { AppTopBar } from "./app-topbar";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = "https://edwt.ca";
const siteName = "EDWT";
const siteDescription =
  "Live wait times for emergency departments and urgent care centres across the Lower Mainland, BC. Updated every minute from the edwaittimes.ca feed.";

export const metadata: Metadata = {
  title: {
    default: "EDWT · Lower Mainland ED & UPCC Wait Times",
    template: "%s · EDWT",
  },
  description: siteDescription,
  metadataBase: new URL(siteUrl),
  alternates: { canonical: "/" },
  keywords: [
    "emergency wait times",
    "ED wait times",
    "Lower Mainland",
    "BC emergency",
    "UPCC wait times",
    "urgent care",
    "Vancouver ER",
    "hospital wait times",
    "edwaittimes",
  ],
  openGraph: {
    type: "website",
    locale: "en_CA",
    url: siteUrl,
    siteName,
    title: "EDWT · Live ED & UPCC Wait Times",
    description: siteDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: "EDWT · Live ED & UPCC Wait Times",
    description: siteDescription,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AppTopBar />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
