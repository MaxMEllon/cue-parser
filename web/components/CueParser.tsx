'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { parseCueSheet, serializeCueSheet, serializeYouTubeTimeline, formatHMSTime } from 'cue-parser';
import type { ParseResult, CueSheet } from 'cue-parser';

const sampleCue = `REM GENRE "Electronic"
REM DATE "2023"
CATALOG 1234567890123
TITLE "Sample Mix"
PERFORMER "DJ Sample"
SONGWRITER "Various Artists"

FILE "mix.wav" WAVE
		TRACK 01 AUDIO
			TITLE "Intro Track"
			PERFORMER "Artist One"
			INDEX 00 00:00:00
			INDEX 01 00:00:33
		TRACK 02 AUDIO
			TITLE "Main Track"
			PERFORMER "Artist Two"
			PREGAP 00:02:00
			INDEX 01 03:45:12
		TRACK 03 AUDIO
			TITLE "Final Track"
			FLAGS PRE
			INDEX 01 07:23:45
			POSTGAP 00:01:30`;

export default function CueParser() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [activeTab, setActiveTab] = useState<'parsed' | 'serialized' | 'youtube' | 'json'>('serialized');
  const [isLoading, setIsLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  const handleParse = (content?: string) => {
    const cueContent = content || input;
    if (!cueContent.trim()) return;

    const parseResult = parseCueSheet(cueContent);
    setResult(parseResult);
    setActiveTab('serialized');
  };

  const handleLoadSample = () => {
    setInput(sampleCue);
    // サンプル読み込み後に自動的に解析を実行
    handleParse(sampleCue);
  };

  const handleClear = () => {
    setInput('');
    setResult(null);
  };

  const handleDownloadCue = () => {
    if (!result?.cueSheet) return;

    // serializeCueSheet automatically omits FILE fields
    const serializedCue = serializeCueSheet(result.cueSheet);
    const blob = new Blob([serializedCue], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${result.cueSheet.global.title || 'cuesheet'}.cue`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyYouTube = async () => {
    if (!result?.cueSheet) return;

    try {
      const youtubeContent = serializeYouTubeTimeline(result.cueSheet);
      await navigator.clipboard.writeText(youtubeContent);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch (error) {
      setCopyStatus('error');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }
  };

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    // Handle rejected files
    if (rejectedFiles.length > 0) {
      const rejection = rejectedFiles[0];
      if (rejection.errors.some((e: any) => e.code === 'invalid-file-type')) {
        alert('Please select a .cue file. Only CUE sheet files are supported.');
      } else {
        alert('Invalid file. Please select a valid .cue file.');
      }
      return;
    }

    const file = acceptedFiles[0];
    if (!file) return;

    // Double-check file extension
    if (!file.name.toLowerCase().endsWith('.cue')) {
      alert('.cueファイルを選択してください。');
      return;
    }

    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setInput(content);
      setIsLoading(false);
      // ファイル読み込み後に自動的に解析を実行
      handleParse(content);
    };
    reader.onerror = () => {
      alert('ファイルの読み込みエラー。有効なテキストファイルであることを確認してください。');
      setIsLoading(false);
    };
    reader.readAsText(file, 'utf-8');
  }, []);

  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.cue'],
      'application/octet-stream': ['.cue'],
      'text/x-cue': ['.cue'],
    },
    multiple: false,
    noClick: true, // We'll handle clicks separately
    validator: (file) => {
      if (!file.name.toLowerCase().endsWith('.cue')) {
        return {
          code: 'invalid-file-type',
          message: 'Only .cue files are allowed'
        };
      }
      return null;
    }
  });

  const renderTrackInfo = (cueSheet: CueSheet) => {
    return (
      <div className="space-y-6">
        {/* Global Information */}
        <div className="bg-white rounded-lg p-4 xl:p-6 shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
            グローバル情報
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {cueSheet.global.title && (
              <div>
                <dt className="text-sm font-medium text-gray-500">タイトル</dt>
                <dd className="text-gray-900">{cueSheet.global.title}</dd>
              </div>
            )}
            {cueSheet.global.performer && (
              <div>
                <dt className="text-sm font-medium text-gray-500">アーティスト</dt>
                <dd className="text-gray-900">{cueSheet.global.performer}</dd>
              </div>
            )}
            {cueSheet.global.catalog && (
              <div>
                <dt className="text-sm font-medium text-gray-500">カタログ</dt>
                <dd className="text-gray-900 font-mono">{cueSheet.global.catalog}</dd>
              </div>
            )}
            {cueSheet.global.songwriter && (
              <div>
                <dt className="text-sm font-medium text-gray-500">ソングライター</dt>
                <dd className="text-gray-900">{cueSheet.global.songwriter}</dd>
              </div>
            )}
          </div>
        </div>

        {/* Tracks */}
        <div className="bg-white rounded-lg p-4 xl:p-6 shadow-sm border">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
            <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
            トラック ({cueSheet.tracks.length})
          </h3>
          <div className="space-y-3 xl:space-y-4">
            {cueSheet.tracks.map((track, index) => (
              <div key={index} className="border rounded-lg p-4 bg-gray-50">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <span className="bg-indigo-100 text-indigo-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
                      トラック {track.number.toString().padStart(2, '0')}
                    </span>
                    <span className="text-sm text-gray-500">{track.mode}</span>
                  </div>
                  {track.flags && track.flags.length > 0 && (
                    <div className="flex space-x-1">
                      {track.flags.map((flag, i) => (
                        <span key={i} className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">
                          {flag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-3">
                  {track.title && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Title</dt>
                      <dd className="text-gray-900">{track.title}</dd>
                    </div>
                  )}
                  {track.performer && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">Performer</dt>
                      <dd className="text-gray-900">{track.performer}</dd>
                    </div>
                  )}
                  {track.isrc && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">ISRC</dt>
                      <dd className="text-gray-900 font-mono">{track.isrc}</dd>
                    </div>
                  )}
                  {track.file && (
                    <div>
                      <dt className="text-sm font-medium text-gray-500">File</dt>
                      <dd className="text-gray-900 font-mono">
                        {track.file.filename}
                        {track.file.format && <span className="text-gray-500 ml-2">({track.file.format})</span>}
                      </dd>
                    </div>
                  )}
                </div>

                {/* Timing Information */}
                <div className="border-t pt-3">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {track.pregap && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Pregap</dt>
                        <dd className="text-gray-900 font-mono">{formatHMSTime(track.pregap)}</dd>
                      </div>
                    )}

                    {track.indexes && track.indexes.length > 0 && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Indexes</dt>
                        <dd className="text-gray-900">
                          {track.indexes.map((idx, i) => (
                            <div key={i} className="font-mono text-sm">
                              {idx.number.toString().padStart(2, '0')}: {formatHMSTime(idx.time)}
                            </div>
                          ))}
                        </dd>
                      </div>
                    )}

                    {track.postgap && (
                      <div>
                        <dt className="text-sm font-medium text-gray-500">Postgap</dt>
                        <dd className="text-gray-900 font-mono">{formatHMSTime(track.postgap)}</dd>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">CUE Parser</h1>
      </div>

      {/* Main Content - Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Input Section */}
        <div className="bg-white rounded-lg shadow-sm border lg:h-fit lg:sticky lg:top-6">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-gray-900">CUE シート入力</h2>
              <div className="flex space-x-2">
                <button
                  onClick={handleLoadSample}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  サンプル読み込み
                </button>
                <button
                  onClick={handleClear}
                  className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  クリア
                </button>
              </div>
            </div>
          <div className="relative">
            <div
              {...getRootProps()}
              className={`w-full h-64 border-2 border-dashed rounded-lg transition-all duration-200 ${
                isDragActive
                  ? isDragReject
                    ? 'border-red-500 bg-red-50'
                    : 'border-indigo-500 bg-indigo-50 scale-[1.02]'
                  : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
              } relative overflow-hidden`}
            >
              <input {...getInputProps()} />
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onPaste={(e) => {
                  // ペースト後に少し遅延させて自動解析を実行
                  setTimeout(() => {
                    const pastedContent = e.currentTarget.value;
                    if (pastedContent.trim()) {
                      handleParse(pastedContent);
                    }
                  }, 100);
                }}
                className={`w-full h-full p-4 resize-none outline-none font-mono text-sm transition-opacity ${
                  isDragActive ? 'opacity-30 pointer-events-none' : 'bg-transparent'
                }`}
                placeholder="CUEシートの内容をここに貼り付けるか、.cueファイルをドラッグ&ドロップしてください..."
              />

              {/* Drag Active Overlay */}
              {isDragActive && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    {isDragReject ? (
                      <>
                        <div className="text-4xl mb-2">❌</div>
                        <div className="text-lg font-medium text-red-900">無効なファイルタイプ</div>
                        <div className="text-sm text-red-700">.cueファイルをドロップしてください</div>
                      </>
                    ) : (
                      <>
                        <div className="text-4xl mb-2 animate-bounce">📁</div>
                        <div className="text-lg font-medium text-indigo-900">.cueファイルをここにドロップ</div>
                        <div className="text-sm text-indigo-700">リリースしてファイルを読み込み</div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Loading Overlay */}
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-95">
                  <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2"></div>
                    <div className="text-sm text-gray-600">ファイル読み込み中...</div>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-center space-x-4">
              <label className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md cursor-pointer hover:bg-gray-50 focus-within:ring-2 focus-within:ring-indigo-500 transition-colors">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                .cueファイルを選択
                <input
                  type="file"
                  accept=".cue"
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files && files.length > 0) {
                      onDrop([files[0]], []);
                    }
                  }}
                  className="sr-only"
                />
              </label>
              <div className="text-xs text-gray-500 flex items-center">
                <span className="hidden sm:inline">または上に.cueファイルをドラッグ&ドロップ</span>
                <span className="sm:hidden">または上にドラッグ&ドロップ</span>
              </div>
            </div>
          </div>
        </div>
          <div className="p-6">
            <button
              onClick={() => handleParse()}
              disabled={!input.trim()}
              className="w-full bg-indigo-600 text-white py-2 px-4 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              CUEシートを解析 (ファイル/ペースト時は自動実行)
            </button>
          </div>
        </div>

        {/* Results Section */}
        {result ? (
          <div>
          {/* Errors and Warnings */}
          {(result.errors.length > 0 || result.warnings.length > 0) && (
            <div className="space-y-4">
              {result.errors.length > 0 && (
                <div className="error-message">
                  <h3 className="font-medium mb-2">エラー ({result.errors.length})</h3>
                  <ul className="space-y-1">
                    {result.errors.map((error, index) => (
                      <li key={index} className="text-sm">
                        {error.line}行: {error.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Results Tabs */}
          {result.cueSheet && (
            <div className="bg-white rounded-lg shadow-sm border">
              <div className="border-b border-gray-200">
                <nav className="flex space-x-6 lg:space-x-8 xl:space-x-12 px-4 xl:px-6 overflow-x-auto" aria-label="Tabs">
                  {[
                    { id: 'parsed', name: '解析データ', icon: '📋', shortName: 'データ' },
                    { id: 'serialized', name: 'CUE出力', icon: '📝', shortName: 'CUE' },
                    { id: 'youtube', name: 'YouTubeタイムライン', icon: '🎵', shortName: 'YouTube' },
                    { id: 'json', name: 'JSON出力', icon: '🔧', shortName: 'JSON' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`${
                        activeTab === tab.id
                          ? 'border-indigo-500 text-indigo-600'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      } whitespace-nowrap py-3 xl:py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-1 xl:space-x-2 min-w-0`}
                    >
                      <span>{tab.icon}</span>
                      <span className="hidden sm:inline">{tab.name}</span>
                      <span className="sm:hidden">{tab.shortName}</span>
                    </button>
                  ))}
                </nav>
              </div>

              <div className="p-4 xl:p-6">
                {activeTab === 'parsed' && renderTrackInfo(result.cueSheet)}

                {activeTab === 'serialized' && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium text-gray-900">Mixcloud用 CUEシート</h3>
                      <button
                        onClick={handleDownloadCue}
                        className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
                      >
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="hidden sm:inline">ダウンロード</span>
                        <span className="sm:hidden">保存</span>
                      </button>
                    </div>
                    <pre className="code-block text-xs xl:text-sm overflow-x-scroll">
                      {serializeCueSheet(result.cueSheet)}
                    </pre>
                  </div>
                )}

                {activeTab === 'youtube' && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-medium text-gray-900">YouTubeタイムライン</h3>
                      <button
                        onClick={handleCopyYouTube}
                        className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
                      >
                        {copyStatus === 'copied' ? (
                          <>
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="hidden sm:inline">コピー完了!</span>
                            <span className="sm:hidden">✓</span>
                          </>
                        ) : copyStatus === 'error' ? (
                          <>
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            <span className="hidden sm:inline">エラー</span>
                            <span className="sm:hidden">✗</span>
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span className="hidden sm:inline">コピー</span>
                            <span className="sm:hidden">コピー</span>
                          </>
                        )}
                      </button>
                    </div>
                    <pre className="code-block text-xs xl:text-sm overflow-x-auto">
                      {serializeYouTubeTimeline(result.cueSheet)}
                    </pre>
                  </div>
                )}

                {activeTab === 'json' && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">JSON表示</h3>
                    <pre className="code-block text-xs xl:text-sm overflow-x-auto">
                      {JSON.stringify(result.cueSheet, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
            <div className="text-6xl mb-4">📝</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">CUEシート生成の準備完了</h3>
            <p className="text-gray-500">CUEファイルをアップロードするか、内容を貼り付けて、フォーマットされたCUEシート出力をここで確認してください。</p>
          </div>
        )}
      </div>
    </div>
  );
}