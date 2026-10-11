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
  title: '부산대 SMP 공식 홈페이지 | 부산대학교 금융투자학회',
  description:
    '부산대학교 금융투자학회 SMP(Stock Masters of PNU)의 공식 홈페이지입니다. 학회 소개, 기업분석 리포트, 커리큘럼, 모집 및 공지사항을 확인할 수 있습니다.',
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
