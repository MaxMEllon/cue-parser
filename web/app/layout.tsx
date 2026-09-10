import type { Metadata } from 'next'
import './globals.css'
import { ShaderBackground } from '@/components/ShaderBackground'

const SITE_URL = 'https://melocil.de/cue-parser/'
const TITLE = 'cue-parser'
const DESCRIPTION = 'CUE シートファイルをオンラインで解析、検証、フォーマットできます。'

// melocil.de と同じ並び。ホームへ戻る導線を先頭に置く
const LINKS = [
  { label: 'melocil.de', href: 'https://melocil.de/' },
  { label: 'GitHub', href: 'https://github.com/MaxMEllon/cue-parser' },
  { label: 'npm', href: 'https://www.npmjs.com/package/@maxmellon/cue-parser' },
] as const

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${TITLE} — オンライン CUE シートパーサー & バリデーター`,
  description: DESCRIPTION,
  keywords: ['CUE', 'parser', 'CD-TEXT', 'audio', 'rekordbox', 'DJ', 'CUEシート', 'パーサー'],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'melocil.de',
    title: TITLE,
    description: DESCRIPTION,
    locale: 'ja_JP',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body>
        {/* 背景の 2 枚。ベイルはシェーダーの輝度上限とは別に、本文の下を必ず暗く保つ保険 */}
        <ShaderBackground />
        <div className="bg-veil" aria-hidden="true" />

        <div className="page">
          <header className="page-header mb-12">
            <h1>cue-parser</h1>
            <p className="tagline">rekordbox CUE → Mixcloud / YouTube</p>
            <ul className="profile-links">
              {LINKS.map((link) => (
                <li key={link.label}>
                  <a href={link.href} target="_blank" rel="noreferrer">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </header>

          {children}
        </div>
      </body>
    </html>
  )
}
