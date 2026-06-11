import type { Metadata } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
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

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");
  const locale = await getLocale();
  const ogLocale = locale === "fr" ? "fr_CA" : "en_CA";

  return {
    title: {
      default: t("siteTitle"),
      template: "%s · EDWT",
    },
    description: t("siteDescription"),
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
      locale: ogLocale,
      url: siteUrl,
      siteName,
      title: t("ogTitle"),
      description: t("siteDescription"),
    },
    twitter: {
      card: "summary_large_image",
      title: t("ogTitle"),
      description: t("siteDescription"),
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true },
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${manrope.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="preconnect" href="https://basemaps.cartocdn.com" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://tiles.basemaps.cartocdn.com" crossOrigin="anonymous" />
        <link
          rel="alternate"
          type="text/markdown"
          href="/llms.txt"
          title="LLM-readable site description"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          <AppTopBar />
          {children}
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
