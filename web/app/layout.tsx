import './globals.css'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'CUE Parser - オンライン CUE シートパーサー & バリデーター',
  description: 'CUE シートファイルをオンラインで解析、検証、フォーマットできます。CD-TEXT、MSF時間形式、複数のオーディオ形式に対応。',
  keywords: ['CUE', 'parser', 'CD-TEXT', 'audio', 'rekordbox', 'DJ', 'CUEシート', 'パーサー'],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className={inter.className}>
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
          <header className="bg-white shadow-sm border-b">
            <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-between items-center py-4">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-sm">🎵</span>
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-gray-900">CUE Parser</h1>
                    <p className="text-sm text-gray-500">オンライン CUE シートパーサー</p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <a
                    href="https://github.com/MaxMEllon/cue-parser"
                    className="text-gray-500 hover:text-gray-700"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="sr-only">GitHub</span>
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </header>
          <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}