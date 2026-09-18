'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useDropzone } from 'react-dropzone';
import { parseCueSheet, serializeCueSheet, serializeYouTubeTimeline, formatHMSTime } from '@maxmellon/cue-parser';
import type { ParseResult, CueSheet, HMSTime } from '@maxmellon/cue-parser';
import { applyOffsetToCueSheet, formatOffset, hasClampedTracks, parseOffsetInput } from '@/utils/offset';
import { countMissingFields, isBlank } from '@/utils/validation';
import { applyIdMode, hasAnyId, idFlagsAt, NO_ID, type IdFlags } from '@/utils/idMode';
import {
  ZERO_TIME,
  createTrack,
  insertAt,
  moveItem,
  renumberTracks,
  reorderTracks,
  shiftTime,
  trackStartTime,
  withStartTime,
} from '@/utils/track';
import TrackTimeField from '@/components/TrackTimeField';
import SetlistImage from '@/components/SetlistImage';
import { DEFAULT_APPEARANCE, type SetlistAppearance } from '@/components/SetlistBackgroundControls';

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
  { id: 'setlist', name: 'セトリ画像', shortName: '画像' },
  { id: 'json', name: 'JSON 出力', shortName: 'JSON' },
] as const;

export default function CueParser() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ParseResult | null>(null);
  const [activeTab, setActiveTab] = useState<'parsed' | 'serialized' | 'youtube' | 'json' | 'setlist'>('serialized');
  const [isLoading, setIsLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [offsetSeconds, setOffsetSeconds] = useState(0);
  const [offsetText, setOffsetText] = useState(formatOffset(0));
  const [offsetError, setOffsetError] = useState(false);
  // セトリ画像の背景と文字の設定。タブを切り替えても消えないよう、ここで持つ
  const [appearance, setAppearance] = useState<SetlistAppearance>(DEFAULT_APPEARANCE);
  // ID モード(█ で伏せる)の印。tracks と同じ並びで、曲名とアーティストは個別に持つ
  const [idTracks, setIdTracks] = useState<IdFlags[]>([]);
  // 並び替えで掴んでいるトラックの位置。掴んでいない間は null
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  // オフセットと ID モードを適用したCUEシート。
  // 全ての出力(解析データ/CUE/YouTube/JSON/セトリ画像)はこれを参照する
  const offsetCueSheet = useMemo(
    () =>
      result?.cueSheet
        ? applyIdMode(applyOffsetToCueSheet(result.cueSheet, offsetSeconds), idTracks)
        : undefined,
    [result, offsetSeconds, idTracks]
  );

  const isOffsetClamped = useMemo(
    () => (result?.cueSheet ? hasClampedTracks(result.cueSheet, offsetSeconds) : false),
    [result, offsetSeconds]
  );

  // タイトル・アーティストの未入力数。0 より大きい場合はユーザーに編集を促す。
  // ID モードのトラックは「わざと伏せている」ので未入力には数えない
  const missingFieldCount = useMemo(
    () => countMissingFields(result?.cueSheet ? applyIdMode(result.cueSheet, idTracks) : undefined),
    [result, idTracks]
  );

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
    setIdTracks([]);
    setActiveTab('parsed');
  }, [input]);

  const handleLoadSample = () => {
    setInput(sampleCue);
    // サンプル読み込み後に自動的に解析を実行
    handleParse(sampleCue);
  };

  const handleClear = () => {
    setInput('');
    setResult(null);
    setIdTracks([]);
    applyOffsetSeconds(0);
    appearance.source?.release();
    setAppearance(DEFAULT_APPEARANCE);
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

  // ID モードの入り切り。元の値は残したまま、出力にだけ █ をかぶせる
  const toggleIdMode = (trackIndex: number, field: 'title' | 'performer') => {
    setIdTracks((prev) => {
      const next = [...prev];
      const flags = idFlagsAt(next, trackIndex);
      next[trackIndex] = { ...flags, [field]: !flags[field] };
      return next;
    });
  };

  /* 一覧に出しているのはオフセット適用後の時刻なので、入力もその見え方で受け取り、
     元データへ戻すときにオフセットを引く */
  const handleTrackTimeChange = (trackIndex: number, time: HMSTime) => {
    const source = shiftTime(time, -offsetSeconds);
    updateCueSheet((cueSheet) => ({
      ...cueSheet,
      tracks: cueSheet.tracks.map((track, index) =>
        index === trackIndex ? withStartTime(track, source) : track
      ),
    }));
  };

  /* rekordbox の CUE に入っていない曲(開始前の 1 曲や締めの 1 曲)を足す。
     時刻は当てられないので、先頭は 00:00:00、末尾は最後のトラックと同じ時刻から始めて、
     あとは開始時刻の欄で直してもらう */
  const handleAddTrack = (position: 'head' | 'tail') => {
    if (!result?.cueSheet) return;

    const tracks = result.cueSheet.tracks;
    const at = position === 'head' ? 0 : tracks.length;
    const time = position === 'head' ? ZERO_TIME : trackStartTime(tracks[tracks.length - 1]);

    updateCueSheet((cueSheet) => ({
      ...cueSheet,
      tracks: renumberTracks(insertAt(cueSheet.tracks, at, createTrack(time))),
    }));
    // ID の印もトラックと同じ並びで空けておく
    setIdTracks((prev) => insertAt(prev, at, NO_ID));
  };

  /* 並び替え。時刻は場所に残してトラックの中身だけを動かす(utils/track の reorderTracks)。
     ID の印は時刻と違ってトラックに付くものなので、一緒に動かす */
  const handleReorderTracks = useCallback((from: number, to: number) => {
    if (from === to) return;

    setResult((prev) =>
      prev?.cueSheet
        ? { ...prev, cueSheet: { ...prev.cueSheet, tracks: reorderTracks(prev.cueSheet.tracks, from, to) } }
        : prev
    );
    setIdTracks((prev) => {
      // 印が付いていないトラックのぶんは空いているので、動かす前に埋める
      const length = Math.max(prev.length, from + 1, to + 1);
      return moveItem(Array.from({ length }, (_, index) => idFlagsAt(prev, index)), from, to);
    });
  }, []);

  /* --- ドラッグでの並び替え ---
     HTML5 の drag&drop は指で掴めないので、ポインタイベントで組む。
     掴んでいる間の座標はカードの矩形と突き合わせ、跨いだ時点で入れ替える */
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const handleRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const dragRef = useRef<number | null>(null);

  /** 縦位置がどのトラックのカードに乗っているか。一覧の外に出たら端に寄せる */
  const trackIndexAt = (y: number): number | null => {
    const cards = cardRefs.current;
    let first: DOMRect | null = null;
    let firstIndex: number | null = null;
    let lastIndex: number | null = null;

    for (let index = 0; index < cards.length; index++) {
      const rect = cards[index]?.getBoundingClientRect();
      if (!rect) continue;
      if (first === null) {
        first = rect;
        firstIndex = index;
      }
      lastIndex = index;
      if (y >= rect.top && y <= rect.bottom) return index;
    }

    if (first === null) return null;
    return y < first.top ? firstIndex : lastIndex;
  };

  const startTrackDrag = (index: number, event: ReactPointerEvent<HTMLButtonElement>) => {
    // マウスは左ボタンだけ。指やペンはそのまま掴ませる
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    dragRef.current = index;
    setDragIndex(index);
  };

  // 掴んでいる間だけ window で拾う。カードは並び替えのたびに入れ替わるので、
  // 掴んだ要素に張り付けると取りこぼす
  useEffect(() => {
    if (dragIndex === null) return;

    const handleMove = (event: PointerEvent) => {
      const from = dragRef.current;
      if (from === null) return;

      const to = trackIndexAt(event.clientY);
      if (to === null || to === from) return;

      dragRef.current = to;
      setDragIndex(to);
      handleReorderTracks(from, to);
    };

    const handleEnd = () => {
      dragRef.current = null;
      setDragIndex(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleEnd);
    window.addEventListener('pointercancel', handleEnd);
    // ドラッグ中に文字が選択されると、掴んでいる感じが崩れる。
    // 掴んでいることが一覧の外からも分かるよう、ページ全体の形も変えておく
    const userSelect = document.body.style.userSelect;
    const cursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleEnd);
      window.removeEventListener('pointercancel', handleEnd);
      document.body.style.userSelect = userSelect;
      document.body.style.cursor = cursor;
    };
  }, [dragIndex, handleReorderTracks]);

  /** つまみにフォーカスしたまま ↑ ↓ でも動かせるようにする(指もマウスも無い人のため) */
  const handleDragHandleKeyDown = (
    index: number,
    trackCount: number,
    event: ReactKeyboardEvent<HTMLButtonElement>
  ) => {
    const to = event.key === 'ArrowUp' ? index - 1 : event.key === 'ArrowDown' ? index + 1 : null;
    if (to === null) return;

    event.preventDefault();
    if (to < 0 || to >= trackCount) return;

    handleReorderTracks(index, to);
    // 動かしたトラックのつまみを掴んだままにする
    requestAnimationFrame(() => handleRefs.current[to]?.focus());
  };

  const handleDeleteTrack = (trackIndex: number) => {
    if (!result?.cueSheet) return;

    const updatedTracks = result.cueSheet.tracks.filter((_, index) => index !== trackIndex);
    // ID モードの印もトラックと同じ並びで詰める
    setIdTracks((prev) => prev.filter((_, index) => index !== trackIndex));

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
    // accept は指定しない。.cue に決まった MIME が無く、OS から掴んだファイルの type は
    // 大抵空になる。ドラッグ中はファイル名も読めないので、accept を付けると
    // 正しい .cue でも「無効なファイル」と出てしまう。可否の判定は下の validator と
    // onDrop(ドロップ後、実ファイルの拡張子が読める時点)で行う
    multiple: false,
    noClick: true, // We'll handle clicks separately
    validator: (file) => {
      // ドラッグ中(dragenter/dragover)は File ではなく DataTransferItem が渡ってくるので
      // name が無い。ここで落ちると react-dropzone が isDragActive を立てられず、
      // 枠が反応しないまま「ドロップを受け付けない」ように見える
      const name = (file as Partial<File>).name;
      if (typeof name !== 'string') return null;

      if (!name.toLowerCase().endsWith('.cue')) {
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
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="section-title">トラック ({cueSheet.tracks.length})</h3>
            <button onClick={() => handleAddTrack('head')} className="btn">
              先頭に追加
            </button>
          </div>
          <p className="hint mt-2">
            {dragIndex === null
              ? 'つまみ (⠿) をドラッグすると曲順を入れ替えられます。時刻はその場に残ります。'
              : `TRACK ${(dragIndex + 1).toString().padStart(2, '0')} の位置へ移動中。離すと確定します`}
          </p>
          <div className="track-list mt-4 space-y-3" data-reordering={dragIndex === null ? undefined : ''}>
            {cueSheet.tracks.map((track, index) => (
              <div
                key={index}
                ref={(element) => {
                  cardRefs.current[index] = element;
                }}
                data-dragging={dragIndex === index ? '' : undefined}
                className="panel-inset p-4"
              >
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      ref={(element) => {
                        handleRefs.current[index] = element;
                      }}
                      onPointerDown={(event) => startTrackDrag(index, event)}
                      onKeyDown={(event) => handleDragHandleKeyDown(index, cueSheet.tracks.length, event)}
                      className="drag-handle"
                      title="ドラッグで並び替え (↑ ↓ キーでも動かせます)"
                      aria-label={`トラック ${track.number} を並び替え`}
                    >
                      ⠿
                    </button>
                    <span className="badge badge-solid">
                      TRACK {track.number.toString().padStart(2, '0')}
                    </span>
                    {dragIndex === index && <span className="badge badge-solid">移動中</span>}
                    <span className="badge">{track.mode}</span>
                    {track.flags?.map((flag, i) => (
                      <span key={i} className="badge">{flag}</span>
                    ))}
                    {hasAnyId(idFlagsAt(idTracks, index)) && (
                      <span className="badge badge-solid">ID</span>
                    )}
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
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <label className="label" htmlFor={`track-${index}-title`}>Title</label>
                      <button
                        onClick={() => toggleIdMode(index, 'title')}
                        className={idFlagsAt(idTracks, index).title ? 'btn btn-xs btn-primary' : 'btn btn-xs'}
                        aria-pressed={idFlagsAt(idTracks, index).title}
                        title="曲名を █ で伏せる (元の値は残ります)"
                        aria-label={`トラック ${track.number} のタイトルを ID にする`}
                      >
                        ID
                      </button>
                    </div>
                    <input
                      id={`track-${index}-title`}
                      type="text"
                      value={track.title ?? ''}
                      onChange={(e) => handleTrackFieldChange(index, 'title', e.target.value)}
                      placeholder="未入力 - タイトルを入力してください"
                      aria-label={`トラック ${track.number} のタイトル`}
                      // ID の間は伏せ字を表示しているだけなので、書き換えさせない
                      disabled={idFlagsAt(idTracks, index).title}
                      aria-invalid={!idFlagsAt(idTracks, index).title && isBlank(track.title)}
                      className="field"
                    />
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <label className="label" htmlFor={`track-${index}-performer`}>Performer</label>
                      <button
                        onClick={() => toggleIdMode(index, 'performer')}
                        className={idFlagsAt(idTracks, index).performer ? 'btn btn-xs btn-primary' : 'btn btn-xs'}
                        aria-pressed={idFlagsAt(idTracks, index).performer}
                        title="アーティストを █ で伏せる (元の値は残ります)"
                        aria-label={`トラック ${track.number} のアーティストを ID にする`}
                      >
                        ID
                      </button>
                    </div>
                    <input
                      id={`track-${index}-performer`}
                      type="text"
                      value={track.performer ?? ''}
                      onChange={(e) => handleTrackFieldChange(index, 'performer', e.target.value)}
                      placeholder="未入力 - アーティストを入力してください"
                      aria-label={`トラック ${track.number} のアーティスト`}
                      disabled={idFlagsAt(idTracks, index).performer}
                      aria-invalid={!idFlagsAt(idTracks, index).performer && isBlank(track.performer)}
                      className="field"
                    />
                  </div>
                  <div>
                    <label className="label mb-1 block" htmlFor={`track-${index}-time`}>
                      開始時刻
                    </label>
                    <TrackTimeField
                      id={`track-${index}-time`}
                      value={trackStartTime(track)}
                      ariaLabel={`トラック ${track.number} の開始時刻`}
                      onCommit={(time) => handleTrackTimeChange(index, time)}
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

                    {/* INDEX 01 は上の「開始時刻」で編集するので、ここには残りだけ出す */}
                    {track.indexes && track.indexes.some((idx) => idx.number !== 1) && (
                      <div>
                        <dt className="label mb-1">Indexes</dt>
                        <dd>
                          {track.indexes
                            .filter((idx) => idx.number !== 1)
                            .map((idx, i) => (
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
          <button onClick={() => handleAddTrack('tail')} className="btn btn-block mt-3">
            末尾に追加
          </button>
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
              // textarea 自身もブラウザの標準のドロップ先なので、既定の動作(ファイル名の
              // 差し込みなど)だけ止めて、イベントはそのまま親のドロップゾーンへ流す。
              // ここを pointer-events: none で逃がすと、ドラッグ中に当たり判定の相手が
              // textarea ↔ 枠の間で入れ替わり、dragenter/dragleave の数が合わなくなって
              // ドロップを取りこぼす
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => e.preventDefault()}
              // CUE は英数字と固有名詞ばかりで、赤い波線が出ても邪魔にしかならない
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              className={isDragActive ? 'opacity-20' : ''}
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
                    「解析データ」タブの赤い棒が付いたフォームを埋めてください。編集内容は CUE / YouTube / JSON の全ての出力に反映されます。
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
                  <p className="hint mt-3 text-danger">
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
                          className="w-1.5 h-1.5 shrink-0 rounded-full bg-danger"
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

                {activeTab === 'setlist' && (
                  <SetlistImage
                    cueSheet={offsetCueSheet}
                    appearance={appearance}
                    onAppearanceChange={setAppearance}
                  />
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
