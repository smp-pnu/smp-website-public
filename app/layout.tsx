import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { ScrollReveal } from '@/components/scroll-reveal'
import { HomeBackground } from '@/components/home-background'
import { NetworkTransition } from '@/components/network-transition'
import './globals.css'
import './fonts/body-font'

const heroFont = localFont({ src: './fonts/cormorant-garamond-latin-300.woff2', weight: '300', style: 'normal', variable: '--font-hero', display: 'swap' })


// A fresh CSP nonce must be rendered with each document, never cached in HTML.
// Explicit unstable_cache catalog/block caches remain shared across requests.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'SMP | 부산대학교 금융투자학회',
  description:
    '부산대학교 금융투자학회 SMP(Stock Masters of PNU)는 기업과 산업을 분석해 투자 아이디어를 구축하고, 실제 포트폴리오 운용을 통해 그 논리를 검증합니다.',
  icons: {
    icon: [
      { url: '/smp-favicon-32.png?v=4', type: 'image/png', sizes: '32x32' },
      { url: '/smp-favicon.svg?v=4', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png?v=4',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: 'white' },
    { media: '(prefers-color-scheme: dark)', color: 'black' },
  ],
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
