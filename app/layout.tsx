import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { ScrollReveal } from '@/components/scroll-reveal'
import { HomeBackground } from '@/components/home-background'
import { NetworkTransition } from '@/components/network-transition'
import { SITE_DESCRIPTION, SITE_HOME_TITLE } from '@/lib/site-config'
import './globals.css'
import './fonts/body-font'

const heroFont = localFont({ src: './fonts/cormorant-garamond-latin-300.woff2', weight: '300', style: 'normal', variable: '--font-hero', display: 'swap' })


// A fresh CSP nonce must be rendered with each document, never cached in HTML.
// Explicit unstable_cache catalog/block caches remain shared across requests.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: SITE_HOME_TITLE,
  description: SITE_DESCRIPTION,
  icons: {
    icon: [
      { url: '/smp-search-icon.png', type: 'image/png', sizes: '192x192' },
      { url: '/smp-favicon-32.png?v=13', type: 'image/png', sizes: '32x32' },
      { url: '/smp-favicon.svg?v=13', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png?v=13',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#080a0c',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ko">
      <body className={`${heroFont.variable} antialiased`} style={{ fontFamily: 'var(--font-body), sans-serif' }}>
        <NetworkTransition>
        <HomeBackground />
        <ScrollReveal />
        {children}
        </NetworkTransition>
        {process.env.VERCEL === '1' && <Analytics />}
      </body>
    </html>
  )
}
