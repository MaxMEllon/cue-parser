'use client';

import { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { parseCueSheet, serializeCueSheet, serializeYouTubeTimeline, formatHMSTime } from '@maxmellon/cue-parser';
import type { ParseResult, CueSheet } from '@maxmellon/cue-parser';
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

// タブは白黒なので、アイコンではなく字間の開いた文字だけで並べる
const TABS = [
  { id: 'parsed', name: '解析データ', shortName: 'データ' },
  { id: 'serialized', name: 'CUE 出力', shortName: 'CUE' },
  { id: 'youtube', name: 'YouTube タイムライン', shortName: 'YouTube' },
  { id: 'json', name: 'JSON 出力', shortName: 'JSON' },
] as const;

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
      <div className="space-y-8">
        {/* Global Information */}
        <section>
          <h3 className="section-title">グローバル情報</h3>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <div>
              <label className="label mb-1" htmlFor="global-title">タイトル</label>
              <input
                id="global-title"
                type="text"
                value={cueSheet.global.title ?? ''}
                onChange={(e) => handleGlobalFieldChange('title', e.target.value)}
                placeholder="未入力 - タイトルを入力してください"
                aria-label="タイトル"
                aria-invalid={isBlank(cueSheet.global.title)}
                className="field"
              />
            </div>
            <div>
              <label className="label mb-1" htmlFor="global-performer">アーティスト</label>
              <input
                id="global-performer"
                type="text"
                value={cueSheet.global.performer ?? ''}
                onChange={(e) => handleGlobalFieldChange('performer', e.target.value)}
                placeholder="未入力 - アーティストを入力してください"
                aria-label="アーティスト"
                aria-invalid={isBlank(cueSheet.global.performer)}
                className="field"
              />
            </div>
            {cueSheet.global.catalog && (
              <div>
                <dt className="label mb-1">カタログ</dt>
                <dd className="value">{cueSheet.global.catalog}</dd>
              </div>
            )}
            {cueSheet.global.songwriter && (
              <div>
                <dt className="label mb-1">ソングライター</dt>
                <dd className="value">{cueSheet.global.songwriter}</dd>
              </div>
            )}
          </div>
        </section>

        {/* Tracks */}
        <section>
          <h3 className="section-title">トラック ({cueSheet.tracks.length})</h3>
          <div className="mt-4 space-y-3">
            {cueSheet.tracks.map((track, index) => (
              <div key={index} className="panel-inset p-4">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="badge badge-solid">
                      TRACK {track.number.toString().padStart(2, '0')}
                    </span>
                    <span className="badge">{track.mode}</span>
                    {track.flags?.map((flag, i) => (
                      <span key={i} className="badge">{flag}</span>
                    ))}
                  </div>
                  <button
                    onClick={() => handleDeleteTrack(index)}
                    className="btn"
                    title="このトラックを削除"
                    aria-label={`トラック ${track.number} を削除`}
                  >
                    削除
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <div>
                    <label className="label mb-1" htmlFor={`track-${index}-title`}>Title</label>
                    <input
                      id={`track-${index}-title`}
                      type="text"
                      value={track.title ?? ''}
                      onChange={(e) => handleTrackFieldChange(index, 'title', e.target.value)}
                      placeholder="未入力 - タイトルを入力してください"
                      aria-label={`トラック ${track.number} のタイトル`}
                      aria-invalid={isBlank(track.title)}
                      className="field"
                    />
                  </div>
                  <div>
                    <label className="label mb-1" htmlFor={`track-${index}-performer`}>Performer</label>
                    <input
                      id={`track-${index}-performer`}
                      type="text"
                      value={track.performer ?? ''}
                      onChange={(e) => handleTrackFieldChange(index, 'performer', e.target.value)}
                      placeholder="未入力 - アーティストを入力してください"
                      aria-label={`トラック ${track.number} のアーティスト`}
                      aria-invalid={isBlank(track.performer)}
                      className="field"
                    />
                  </div>
                  {track.isrc && (
                    <div>
                      <dt className="label mb-1">ISRC</dt>
                      <dd className="value">{track.isrc}</dd>
                    </div>
                  )}
                  {track.file && (
                    <div>
                      <dt className="label mb-1">File</dt>
                      <dd className="value">
                        {track.file.filename}
                        {track.file.format && <span className="text-muted"> ({track.file.format})</span>}
                      </dd>
                    </div>
                  )}
                </div>

                {/* Timing Information */}
                <div className="rule-t mt-4 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {track.pregap && (
                      <div>
                        <dt className="label mb-1">Pregap</dt>
                        <dd className="value">{formatHMSTime(track.pregap)}</dd>
                      </div>
                    )}

                    {track.indexes && track.indexes.length > 0 && (
                      <div>
                        <dt className="label mb-1">Indexes</dt>
                        <dd>
                          {track.indexes.map((idx, i) => (
                            <div key={i} className="value">
                              {idx.number.toString().padStart(2, '0')} {formatHMSTime(idx.time)}
                            </div>
                          ))}
                        </dd>
                      </div>
                    )}

                    {track.postgap && (
                      <div>
                        <dt className="label mb-1">Postgap</dt>
                        <dd className="value">{formatHMSTime(track.postgap)}</dd>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 xl:gap-8">
      {/* Input Section */}
      <div className="panel lg:h-fit lg:sticky lg:top-6">
        <div className="rule-b p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
            <h2 className="section-title">rekordbox CUE 入力</h2>
            <div className="flex gap-2">
              <button onClick={handleLoadSample} className="btn">
                サンプル
              </button>
              <button onClick={handleClear} className="btn">
                クリア
              </button>
            </div>
          </div>

          <div
            {...getRootProps()}
            data-drag={isDragActive ? (isDragReject ? 'reject' : 'active') : undefined}
            className="dropzone h-64"
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
              className={isDragActive ? 'opacity-20 pointer-events-none' : ''}
              placeholder="CUEシートの内容をここに貼り付けるか、.cueファイルをドラッグ&ドロップしてください..."
            />

            {/* Drag Active Overlay */}
            {isDragActive && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center space-y-1">
                  {isDragReject ? (
                    <>
                      <div className="section-title">無効なファイル</div>
                      <div className="hint">.cue ファイルをドロップしてください</div>
                    </>
                  ) : (
                    <>
                      <div className="section-title">ドロップして読み込み</div>
                      <div className="hint">.cue ファイル</div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Loading Overlay */}
            {isLoading && (
              <div className="overlay">
                <div className="flex flex-col items-center gap-3">
                  <div className="spinner" />
                  <div className="hint">ファイル読み込み中...</div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
            <label className="btn cursor-pointer">
              .cue ファイルを選択
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
            <span className="hint">
              <span className="hidden sm:inline">または上にドラッグ &amp; ドロップ</span>
              <span className="sm:hidden">または上にドロップ</span>
            </span>
          </div>
        </div>

        <div className="p-5">
          <button
            onClick={() => handleParse()}
            disabled={!input.trim()}
            className="btn btn-primary w-full py-2.5"
          >
            CUE シートを解析
          </button>
          <p className="hint mt-2 text-center">ファイル読み込み / ペースト時は自動で実行されます</p>
        </div>
      </div>

      {/* Results Section */}
      {result ? (
        <div className="space-y-4">
          {/* Errors */}
          {result.errors.length > 0 && (
            <div className="notice notice-alert p-4">
              <h3 className="section-title">エラー ({result.errors.length})</h3>
              <ul className="mt-2 space-y-1">
                {result.errors.map((error, index) => (
                  <li key={index} className="hint">
                    {error.line}行: {error.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Results Tabs */}
          {offsetCueSheet && (
            <div className="panel">
              {/* 未入力項目の通知 */}
              {missingFieldCount > 0 && (
                <div className="alert-bar p-5">
                  <p className="section-title">
                    未入力の項目が {missingFieldCount} 件あります
                  </p>
                  <p className="hint mt-2">
                    「解析データ」タブの白い棒が付いたフォームを埋めてください。編集内容は CUE / YouTube / JSON の全ての出力に反映されます。
                  </p>
                  {/* 解析データタブ表示中は非表示にするが、レイアウトシフトを避けるため領域は確保する */}
                  <button
                    onClick={() => setActiveTab('parsed')}
                    className={`btn mt-3 ${activeTab === 'parsed' ? 'invisible' : ''}`}
                    aria-hidden={activeTab === 'parsed'}
                    tabIndex={activeTab === 'parsed' ? -1 : 0}
                  >
                    解析データを開く
                  </button>
                </div>
              )}

              {/* Time Offset - 全ての出力に反映される */}
              <div className="rule-b p-5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                  <div>
                    <div className="section-title">時刻オフセット</div>
                    <div className="hint mt-1">全ての出力に反映されます</div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => applyOffsetSeconds(offsetSeconds - 10)}
                      className="btn normal-case"
                      title="10秒戻す"
                    >
                      -10s
                    </button>
                    <button
                      onClick={() => applyOffsetSeconds(offsetSeconds - 1)}
                      className="btn normal-case"
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
                      aria-invalid={offsetError}
                      className="field field-mono w-32 text-center"
                    />
                    <button
                      onClick={() => applyOffsetSeconds(offsetSeconds + 1)}
                      className="btn normal-case"
                      title="1秒進める"
                    >
                      +1s
                    </button>
                    <button
                      onClick={() => applyOffsetSeconds(offsetSeconds + 10)}
                      className="btn normal-case"
                      title="10秒進める"
                    >
                      +10s
                    </button>
                    <button
                      onClick={() => applyOffsetSeconds(0)}
                      disabled={offsetSeconds === 0 && !offsetError}
                      className="btn"
                    >
                      リセット
                    </button>
                  </div>
                </div>
                {offsetError ? (
                  <p className="hint mt-3 text-fg">
                    形式が正しくありません。「90」「1:30」「00:01:30」のように入力してください (先頭に - で巻き戻し)。
                  </p>
                ) : (
                  <p className="hint mt-3">
                    「90」「1:30」「00:01:30」の形式で入力できます (先頭に - で巻き戻し)。
                  </p>
                )}
                {isOffsetClamped && (
                  <p className="hint mt-1 text-fg">
                    先頭より前になるトラックは 00:00:00 に丸められています。
                  </p>
                )}
              </div>

              <div className="rule-b">
                <nav className="flex gap-6 xl:gap-8 px-5 overflow-x-auto" aria-label="Tabs">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      data-active={activeTab === tab.id}
                      className="tab"
                    >
                      <span className="hidden sm:inline">{tab.name}</span>
                      <span className="sm:hidden">{tab.shortName}</span>
                      {tab.id === 'parsed' && missingFieldCount > 0 && (
                        <span
                          className="w-1.5 h-1.5 shrink-0 rounded-full bg-fg"
                          title="未入力の項目があります"
                          aria-label="未入力の項目があります"
                        />
                      )}
                    </button>
                  ))}
                </nav>
              </div>

              <div className="p-5">
                {activeTab === 'parsed' && renderTrackInfo(offsetCueSheet)}

                {activeTab === 'serialized' && (
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <h3 className="section-title">Mixcloud 用 CUE シート</h3>
                      <button onClick={handleDownloadCue} className="btn btn-primary">
                        <span className="hidden sm:inline">ダウンロード</span>
                        <span className="sm:hidden">保存</span>
                      </button>
                    </div>
                    <pre className="code-block">
                      {serializeCueSheet(offsetCueSheet)}
                    </pre>
                  </div>
                )}

                {activeTab === 'youtube' && (
                  <div>
                    <div className="flex items-center justify-between gap-3 mb-4">
                      <h3 className="section-title">YouTube タイムライン</h3>
                      <button onClick={handleCopyYouTube} className="btn btn-primary">
                        {copyStatus === 'copied'
                          ? 'コピー完了'
                          : copyStatus === 'error'
                            ? 'コピー失敗'
                            : 'コピー'}
                      </button>
                    </div>
                    <pre className="code-block">
                      {serializeYouTubeTimeline(offsetCueSheet)}
                    </pre>
                  </div>
                )}

                {activeTab === 'json' && (
                  <div>
                    <h3 className="section-title mb-4">JSON 表示</h3>
                    <pre className="code-block">
                      {JSON.stringify(offsetCueSheet, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="placeholder lg:h-fit">
          <h3 className="section-title text-fg">出力を待っています</h3>
          <p className="hint max-w-sm">
            .cue ファイルを読み込むか内容を貼り付けると、Mixcloud 用 CUE と YouTube タイムラインがここに出ます。
          </p>
        </div>
      )}
    </div>
  );
}
