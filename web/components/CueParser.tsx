'use client';

import { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { parseCueSheet, serializeCueSheet, serializeYouTubeTimeline, formatHMSTime } from 'cue-parser';
import type { ParseResult, CueSheet } from 'cue-parser';
import { applyOffsetToCueSheet, formatOffset, hasClampedTracks, parseOffsetInput } from '@/utils/offset';
import { countMissingFields, isBlank } from '@/utils/validation';

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
  const [offsetSeconds, setOffsetSeconds] = useState(0);
  const [offsetText, setOffsetText] = useState(formatOffset(0));
  const [offsetError, setOffsetError] = useState(false);

  // オフセットを適用したCUEシート。全ての出力(解析データ/CUE/YouTube/JSON)はこれを参照する
  const offsetCueSheet = useMemo(
    () => (result?.cueSheet ? applyOffsetToCueSheet(result.cueSheet, offsetSeconds) : undefined),
    [result, offsetSeconds]
  );

  const isOffsetClamped = useMemo(
    () => (result?.cueSheet ? hasClampedTracks(result.cueSheet, offsetSeconds) : false),
    [result, offsetSeconds]
  );

  // タイトル・アーティストの未入力数。0 より大きい場合はユーザーに編集を促す
  const missingFieldCount = useMemo(() => countMissingFields(result?.cueSheet), [result]);

  // 編集はオフセット適用前の元データに対して行う
  const updateCueSheet = (updater: (cueSheet: CueSheet) => CueSheet) => {
    setResult((prev) => (prev?.cueSheet ? { ...prev, cueSheet: updater(prev.cueSheet) } : prev));
  };

  const handleGlobalFieldChange = (field: 'title' | 'performer', value: string) => {
    updateCueSheet((cueSheet) => ({
      ...cueSheet,
      // 空白のみの入力は未入力として扱う(CUE出力に空の項目を残さない)
      global: { ...cueSheet.global, [field]: value.trim() === '' ? '' : value },
    }));
  };

  const handleTrackFieldChange = (trackIndex: number, field: 'title' | 'performer', value: string) => {
    updateCueSheet((cueSheet) => ({
      ...cueSheet,
      tracks: cueSheet.tracks.map((track, index) =>
        index === trackIndex ? { ...track, [field]: value.trim() === '' ? '' : value } : track
      ),
    }));
  };

  // 未入力のフォームは赤枠で表示する
  const editableFieldClass = (needsEdit: boolean) =>
    `w-full px-2 py-1 text-sm border rounded-md focus:outline-none focus:ring-2 ${
      needsEdit
        ? 'border-red-500 bg-red-50 text-red-900 placeholder-red-400 focus:ring-red-500'
        : 'border-gray-300 focus:ring-indigo-500'
    }`;

  const applyOffsetSeconds = (next: number) => {
    setOffsetSeconds(next);
    setOffsetText(formatOffset(next));
    setOffsetError(false);
  };

  const handleOffsetTextChange = (value: string) => {
    setOffsetText(value);

    const parsed = parseOffsetInput(value);
    if (parsed === null) {
      setOffsetError(true);
      return;
    }

    setOffsetError(false);
    setOffsetSeconds(parsed);
  };

  // 入力途中の表記("90" など)をフォーカスアウト時に "+HH:MM:SS" へ正規化する
  const handleOffsetBlur = () => {
    setOffsetText(formatOffset(offsetSeconds));
    setOffsetError(false);
  };

  const handleParse = useCallback((content?: string) => {
    const cueContent = content || input;
    if (!cueContent.trim()) return;

    const parseResult = parseCueSheet(cueContent);
    setResult(parseResult);
    setActiveTab('serialized');
  }, [input]);

  const handleLoadSample = () => {
    setInput(sampleCue);
    // サンプル読み込み後に自動的に解析を実行
    handleParse(sampleCue);
  };

  const handleClear = () => {
    setInput('');
    setResult(null);
    applyOffsetSeconds(0);
  };

  const handleDownloadCue = () => {
    if (!offsetCueSheet) return;

    // serializeCueSheet automatically omits FILE fields
    const serializedCue = serializeCueSheet(offsetCueSheet);
    const blob = new Blob([serializedCue], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${offsetCueSheet.global.title || 'cuesheet'}.cue`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyYouTube = async () => {
    if (!offsetCueSheet) return;

    try {
      const youtubeContent = serializeYouTubeTimeline(offsetCueSheet);
      await navigator.clipboard.writeText(youtubeContent);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch (error) {
      setCopyStatus('error');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }
  };

  const handleDeleteTrack = (trackIndex: number) => {
    if (!result?.cueSheet) return;

    const updatedTracks = result.cueSheet.tracks.filter((_, index) => index !== trackIndex);

    // If no tracks remain, clear the result
    if (updatedTracks.length === 0) {
      setResult(null);
      return;
    }

    // Renumber tracks sequentially starting from 1
    const renumberedTracks = updatedTracks.map((track, index) => ({
      ...track,
      number: index + 1
    }));

    const updatedCueSheet = {
      ...result.cueSheet,
      tracks: renumberedTracks
    };

    const updatedResult = {
      ...result,
      cueSheet: updatedCueSheet
    };

    setResult(updatedResult);
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
  }, [handleParse]);

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
            <div>
              <dt className="text-sm font-medium text-gray-500 mb-1">タイトル</dt>
              <dd>
                <input
                  type="text"
                  value={cueSheet.global.title ?? ''}
                  onChange={(e) => handleGlobalFieldChange('title', e.target.value)}
                  placeholder="未入力 - タイトルを入力してください"
                  aria-label="タイトル"
                  aria-invalid={isBlank(cueSheet.global.title)}
                  className={editableFieldClass(isBlank(cueSheet.global.title))}
                />
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-500 mb-1">アーティスト</dt>
              <dd>
                <input
                  type="text"
                  value={cueSheet.global.performer ?? ''}
                  onChange={(e) => handleGlobalFieldChange('performer', e.target.value)}
                  placeholder="未入力 - アーティストを入力してください"
                  aria-label="アーティスト"
                  aria-invalid={isBlank(cueSheet.global.performer)}
                  className={editableFieldClass(isBlank(cueSheet.global.performer))}
                />
              </dd>
            </div>
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
                  <button
                    onClick={() => handleDeleteTrack(index)}
                    className="text-red-600 hover:text-red-800 hover:bg-red-50 p-1 rounded transition-colors"
                    title="このトラックを削除"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                {track.flags && track.flags.length > 0 && (
                  <div className="flex space-x-1 mb-3">
                    {track.flags.map((flag, i) => (
                      <span key={i} className="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">
                        {flag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-3">
                  <div>
                    <dt className="text-sm font-medium text-gray-500 mb-1">Title</dt>
                    <dd>
                      <input
                        type="text"
                        value={track.title ?? ''}
                        onChange={(e) => handleTrackFieldChange(index, 'title', e.target.value)}
                        placeholder="未入力 - タイトルを入力してください"
                        aria-label={`トラック ${track.number} のタイトル`}
                        aria-invalid={isBlank(track.title)}
                        className={editableFieldClass(isBlank(track.title))}
                      />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500 mb-1">Performer</dt>
                    <dd>
                      <input
                        type="text"
                        value={track.performer ?? ''}
                        onChange={(e) => handleTrackFieldChange(index, 'performer', e.target.value)}
                        placeholder="未入力 - アーティストを入力してください"
                        aria-label={`トラック ${track.number} のアーティスト`}
                        aria-invalid={isBlank(track.performer)}
                        className={editableFieldClass(isBlank(track.performer))}
                      />
                    </dd>
                  </div>
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
              <h2 className="text-lg font-medium text-gray-900">Rekordbox CUE シート入力</h2>
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
          {offsetCueSheet && (
            <div className="bg-white rounded-lg shadow-sm border">
              {/* 未入力項目の通知 */}
              {missingFieldCount > 0 && (
                <div className="border-b border-red-200 bg-red-50 rounded-t-lg p-4 xl:p-6">
                  <div className="flex items-start gap-3">
                    <span className="text-lg leading-none" aria-hidden="true">⚠️</span>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-red-800">
                        タイトル・アーティストが未入力の項目が {missingFieldCount} 件あります
                      </p>
                      <p className="mt-1 text-xs text-red-700">
                        「解析データ」タブの赤枠のフォームを編集してください。編集内容は CUE / YouTube / JSON の全ての出力に反映されます。
                      </p>
                      {/* 解析データタブ表示中は非表示にするが、レイアウトシフトを避けるため領域は確保する */}
                      <button
                        onClick={() => setActiveTab('parsed')}
                        className={`mt-2 px-3 py-1 text-xs font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-500 ${
                          activeTab === 'parsed' ? 'invisible' : ''
                        }`}
                        aria-hidden={activeTab === 'parsed'}
                        tabIndex={activeTab === 'parsed' ? -1 : 0}
                      >
                        解析データタブを開く
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Time Offset - 全ての出力に反映される */}
              <div className={`border-b border-gray-200 bg-gray-50 p-4 xl:p-6 ${missingFieldCount > 0 ? '' : 'rounded-t-lg'}`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                  <div>
                    <div className="text-sm font-medium text-gray-900">時刻オフセット</div>
                    <div className="text-xs text-gray-500">全ての出力に反映されます</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => applyOffsetSeconds(offsetSeconds - 10)}
                      className="px-2 py-1 text-sm border border-gray-300 bg-white rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      title="10秒戻す"
                    >
                      -10s
                    </button>
                    <button
                      onClick={() => applyOffsetSeconds(offsetSeconds - 1)}
                      className="px-2 py-1 text-sm border border-gray-300 bg-white rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      title="1秒戻す"
                    >
                      -1s
                    </button>
                    <input
                      type="text"
                      inputMode="text"
                      value={offsetText}
                      onChange={(e) => handleOffsetTextChange(e.target.value)}
                      onBlur={handleOffsetBlur}
                      placeholder="+00:00:00"
                      aria-label="時刻オフセット"
                      className={`w-32 px-3 py-1 text-sm font-mono text-center border rounded-md focus:outline-none focus:ring-2 ${
                        offsetError
                          ? 'border-red-400 text-red-700 focus:ring-red-500'
                          : 'border-gray-300 focus:ring-indigo-500'
                      }`}
                    />
                    <button
                      onClick={() => applyOffsetSeconds(offsetSeconds + 1)}
                      className="px-2 py-1 text-sm border border-gray-300 bg-white rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      title="1秒進める"
                    >
                      +1s
                    </button>
                    <button
                      onClick={() => applyOffsetSeconds(offsetSeconds + 10)}
                      className="px-2 py-1 text-sm border border-gray-300 bg-white rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      title="10秒進める"
                    >
                      +10s
                    </button>
                    <button
                      onClick={() => applyOffsetSeconds(0)}
                      disabled={offsetSeconds === 0 && !offsetError}
                      className="px-3 py-1 text-sm border border-gray-300 bg-white rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      リセット
                    </button>
                  </div>
                </div>
                {offsetError ? (
                  <p className="mt-2 text-xs text-red-600">
                    形式が正しくありません。「90」「1:30」「00:01:30」のように入力してください (先頭に - で巻き戻し)。
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-gray-500">
                    「90」「1:30」「00:01:30」の形式で入力できます (先頭に - で巻き戻し)。
                  </p>
                )}
                {isOffsetClamped && (
                  <p className="mt-1 text-xs text-amber-600">
                    先頭より前になるトラックは 00:00:00 に丸められています。
                  </p>
                )}
              </div>

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
                      {tab.id === 'parsed' && missingFieldCount > 0 && (
                        <span
                          className="w-2 h-2 shrink-0 bg-red-500 rounded-full"
                          title="未入力の項目があります"
                          aria-label="未入力の項目があります"
                        />
                      )}
                    </button>
                  ))}
                </nav>
              </div>

              <div className="p-4 xl:p-6">
                {activeTab === 'parsed' && renderTrackInfo(offsetCueSheet)}

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
                      {serializeCueSheet(offsetCueSheet)}
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
                      {serializeYouTubeTimeline(offsetCueSheet)}
                    </pre>
                  </div>
                )}

                {activeTab === 'json' && (
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4">JSON表示</h3>
                    <pre className="code-block text-xs xl:text-sm overflow-x-auto">
                      {JSON.stringify(offsetCueSheet, null, 2)}
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