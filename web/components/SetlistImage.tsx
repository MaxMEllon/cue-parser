'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CueSheet } from '@maxmellon/cue-parser';
import {
  SETLIST_HEIGHT,
  SETLIST_WIDTH,
  buildSetlistModel,
  createMeasureContext,
  planSetlistLayout,
  renderSetlistPage,
  setlistFileName,
  type RenderOptions,
} from '@/utils/setlistImage';
import { getBackgroundRenderer, type BackgroundRenderer } from '@/utils/setlistBackground';
import SetlistBackgroundControls, { type SetlistAppearance } from '@/components/SetlistBackgroundControls';

/** canvas を PNG の Blob にする */
function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
  });
}

/** CueParser の handleDownloadCue と同じ形。Blob を合成した <a> で落とす */
function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Firefox は即座に revoke するとダウンロードを取りこぼすことがある
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const canCopyImage = () =>
  typeof window !== 'undefined' &&
  typeof window.ClipboardItem !== 'undefined' &&
  typeof navigator.clipboard?.write === 'function';

export default function SetlistImage({
  cueSheet,
  appearance,
  onAppearanceChange,
}: {
  cueSheet: CueSheet;
  appearance: SetlistAppearance;
  onAppearanceChange: (next: SetlistAppearance) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [page, setPage] = useState(0);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const [copySupported, setCopySupported] = useState(true);
  const [renderer, setRenderer] = useState<BackgroundRenderer | null>(null);
  const [backgroundFrame, setBackgroundFrame] = useState<{ canvas: HTMLCanvasElement } | null>(null);

  useEffect(() => {
    setCopySupported(canCopyImage());
    // WebGL コンテキストは 1 つを使い回すので dispose はしない
    setRenderer(getBackgroundRenderer());
  }, []);

  // 画像か設定が変わったときだけ背景を焼き直す。文字の再描画とは切り離す
  useEffect(() => {
    if (!renderer || !appearance.source) {
      setBackgroundFrame(null);
      return;
    }

    const frame = requestAnimationFrame(() => {
      setBackgroundFrame(renderer.render(appearance.source!, appearance.settings));
    });
    return () => cancelAnimationFrame(frame);
  }, [renderer, appearance.source, appearance.settings]);

  const renderOptions = useMemo<RenderOptions>(
    () => ({ theme: appearance.theme, background: backgroundFrame?.canvas ?? null }),
    [appearance.theme, backgroundFrame]
  );

  const model = useMemo(() => buildSetlistModel(cueSheet), [cueSheet]);

  const layout = useMemo(() => {
    const ctx = createMeasureContext();
    return ctx ? planSetlistLayout(ctx, model, { showHeader: appearance.showHeader }) : null;
  }, [model, appearance.showHeader]);

  const pageCount = layout?.pages.length ?? 1;

  // ページ数が減ったときに範囲外のページを見たままにしない
  useEffect(() => {
    if (page >= pageCount) setPage(0);
  }, [page, pageCount]);

  // 編集のたびに再描画されるので、rAF で 1 フレームにまとめる
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout) return;

    const frame = requestAnimationFrame(() => {
      renderSetlistPage(canvas, model, layout, Math.min(page, layout.pages.length - 1), renderOptions);
    });
    return () => cancelAnimationFrame(frame);
  }, [model, layout, page, renderOptions]);

  const handleDownload = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      triggerDownload(await toPngBlob(canvas), setlistFileName(model, page, pageCount));
    } catch {
      // 保存できなかった場合は何も落とさない(ブラウザ側でエラーが出る)
    }
  }, [model, page, pageCount]);

  const handleDownloadAll = useCallback(async () => {
    if (!layout) return;

    // 画面の canvas は現在のページを映したままにしたいので、書き出しは使い捨ての canvas で行う
    const offscreen = document.createElement('canvas');
    for (let i = 0; i < layout.pages.length; i++) {
      renderSetlistPage(offscreen, model, layout, i, renderOptions);
      try {
        triggerDownload(await toPngBlob(offscreen), setlistFileName(model, i, layout.pages.length));
      } catch {
        return;
      }
      // 連続ダウンロードを弾くブラウザがあるので間を空ける
      if (i < layout.pages.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
  }, [layout, model, renderOptions]);

  const handleCopy = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !canCopyImage()) return;

    try {
      // await を挟むと Safari がユーザー操作の権限を失うので、Promise のまま渡す
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': toPngBlob(canvas) })]);
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
    setTimeout(() => setCopyStatus('idle'), 2000);
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h3 className="section-title">セトリ画像</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleCopy}
            disabled={!copySupported}
            title={copySupported ? undefined : 'お使いのブラウザは画像のコピーに未対応です'}
            className="btn"
          >
            {copyStatus === 'copied' ? 'コピー完了' : copyStatus === 'error' ? 'コピー失敗' : 'コピー'}
          </button>
          {pageCount > 1 && (
            <button onClick={handleDownloadAll} className="btn">
              全ページ保存
            </button>
          )}
          <button onClick={handleDownload} className="btn btn-primary">
            <span className="hidden sm:inline">ダウンロード</span>
            <span className="sm:hidden">保存</span>
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <label className="hint flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={appearance.showHeader}
            onChange={(e) => onAppearanceChange({ ...appearance, showHeader: e.target.checked })}
            className="accent-fg"
          />
          タイトル・アーティストを載せる
        </label>

        {pageCount > 1 && (
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="btn">
              前
            </button>
            <span className="value">
              {page + 1} / {pageCount}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              className="btn"
            >
              次
            </button>
          </div>
        )}
      </div>

      <div className="mb-4">
        <SetlistBackgroundControls
          appearance={appearance}
          onChange={onAppearanceChange}
          supportsFilters={renderer?.supportsFilters ?? true}
          supportsHalftone={renderer?.usesWebGL ?? true}
        />
      </div>

      <div className="panel-inset p-4 flex justify-center">
        <canvas
          ref={canvasRef}
          width={SETLIST_WIDTH}
          height={SETLIST_HEIGHT}
          className="setlist-canvas"
          aria-label="セトリ画像のプレビュー"
          role="img"
        />
      </div>

      <p className="hint mt-3">
        {SETLIST_WIDTH} × {SETLIST_HEIGHT} · Instagram / TikTok ストーリー向け
        {pageCount > 1 && ` · 曲数が多いため ${pageCount} 枚に分割しています`}
      </p>
    </div>
  );
}
