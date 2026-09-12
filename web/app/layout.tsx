import type { Metadata } from 'next'
import './globals.css'
import { ShaderBackground } from '@/components/ShaderBackground'

const SITE_URL = 'https://melocil.de/cue-parser/'
const TITLE = 'cue-parser'
const OG_TITLE = 'cue-parser — rekordbox の CUE からセトリを作る'
const DESCRIPTION =
  'rekordbox の CUE シートを読み込んで、Mixcloud 用 CUE シート・YouTube タイムライン・セトリ画像・JSON に変換します。時刻オフセットと ID 表記にも対応。ブラウザの中だけで動き、ファイルはどこにも送信しません。'

// melocil.de と同じ並び。ホームへ戻る導線を先頭に置く
const LINKS = [
  { label: 'melocil.de', href: 'https://melocil.de/' },
  { label: 'GitHub', href: 'https://github.com/MaxMEllon/cue-parser' },
  { label: 'npm', href: 'https://www.npmjs.com/package/@maxmellon/cue-parser' },
] as const

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: `${TITLE} — rekordbox CUE から Mixcloud / YouTube / セトリ画像`,
  description: DESCRIPTION,
  keywords: [
    'CUE',
    'CUEシート',
    'rekordbox',
    'Mixcloud',
    'YouTube',
    'タイムライン',
    'セトリ',
    'セットリスト',
    'セトリ画像',
    'DJ',
    'DJミックス',
    'parser',
    'ジェネレーター',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'melocil.de',
    title: OG_TITLE,
    description: DESCRIPTION,
    locale: 'ja_JP',
  },
  // og:image を置いていないので、画像なしでも出るカードにしておく
  twitter: {
    card: 'summary',
    title: OG_TITLE,
    description: DESCRIPTION,
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
