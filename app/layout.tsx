import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Noto_Sans_KR } from 'next/font/google'
import localFont from 'next/font/local'
import { ScrollReveal } from '@/components/scroll-reveal'
import { HomeBackground } from '@/components/home-background'
import { NetworkTransition } from '@/components/network-transition'
import './globals.css'

const notoSansKr = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-body',
})

const heroFont = localFont({ src: './fonts/cormorant-garamond-latin-300.woff2', weight: '300', style: 'normal', variable: '--font-hero', display: 'swap' })


export const metadata: Metadata = {
  title: 'SMP | 부산대학교 금융투자학회',
  description:
    '부산대학교 금융투자학회 SMP(Stock Masters of PNU)는 기업과 산업을 분석해 투자 아이디어를 구축하고, 실제 포트폴리오 운용을 통해 그 논리를 검증합니다.',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
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
      <head><link rel="preload" as="image" href="/home-gwangan-3.png" /></head>
      <body className={`${notoSansKr.variable} ${heroFont.variable} antialiased`} style={{ fontFamily: 'var(--font-body), sans-serif' }}>
        <NetworkTransition>
        <HomeBackground />
        <ScrollReveal />
        {children}
        </NetworkTransition>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
