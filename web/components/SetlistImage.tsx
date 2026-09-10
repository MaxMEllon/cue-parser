'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { CueSheet } from '@maxmellon/cue-parser';
import {
  SETLIST_SIZES,
  buildSetlistModel,
  createMeasureContext,
  planSetlistLayout,
  renderSetlistPage,
  setlistFileName,
  type RenderOptions,
  type SetlistSize,
} from '@/utils/setlistImage';
import {
  ZOOM_MAX,
  ZOOM_MIN,
  clampBackgroundSettings,
  getBackgroundRenderer,
  type BackgroundRenderer,
  type BackgroundSettings,
} from '@/utils/setlistBackground';
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
      setBackgroundFrame(renderer.render(appearance.source!, appearance.settings, appearance.size));
    });
    return () => cancelAnimationFrame(frame);
  }, [renderer, appearance.source, appearance.settings, appearance.size]);

  const renderOptions = useMemo<RenderOptions>(
    () => ({ theme: appearance.theme, background: backgroundFrame?.canvas ?? null }),
    [appearance.theme, backgroundFrame]
  );

  /* --- プレビュー上での位置合わせ ---
     ドラッグで移動、ホイール(指なら 2 本でつまむ)で拡大縮小。
     ポインタが動くたびに親へ state を返すと、トラック一覧まで巻き込んで
     React が再描画されるので、rAF で 1 フレームに 1 回だけ返す */
  const appearanceRef = useRef(appearance);
  const flushRef = useRef<number | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  useEffect(() => {
    appearanceRef.current = appearance;
  }, [appearance]);

  const pushSettings = useCallback(
    (settings: BackgroundSettings) => {
      const current = appearanceRef.current;
      if (!current.source) return;

      appearanceRef.current = {
        ...current,
        settings: clampBackgroundSettings(settings, current.source, current.size),
      };

      if (flushRef.current !== null) return;
      flushRef.current = requestAnimationFrame(() => {
        flushRef.current = null;
        onAppearanceChange(appearanceRef.current);
      });
    },
    [onAppearanceChange]
  );

  /** 画面上の一点を掴んだまま拡大率だけ変える */
  const zoomAt = useCallback(
    (zoom: number, originX: number, originY: number) => {
      const { settings } = appearanceRef.current;
      const ratio = zoom / settings.zoom;

      pushSettings({
        ...settings,
        zoom,
        offsetX: originX - 0.5 - ratio * (originX - 0.5 - settings.offsetX),
        offsetY: originY - 0.5 - ratio * (originY - 0.5 - settings.offsetY),
      });
    },
    [pushSettings]
  );

  /** プレビューの表示サイズを 1 とした座標に直す */
  const toLocal = (event: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return null;
    return { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!appearance.source) return;
    try {
      // 既に離されたポインタだと投げる。掴めなくても移動自体は続けられる
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* noop */
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pinchRef.current = null;
    setIsPanning(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pointers = pointersRef.current;
    if (!appearance.source || !pointers.has(event.pointerId)) return;

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;

    const previous = pointers.get(event.pointerId)!;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size >= 2) {
      // 2 本指: 間隔の比をそのまま拡大率に、中点を軸にする
      const [a, b] = Array.from(pointers.values());
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (!pinchRef.current) {
        pinchRef.current = { distance, zoom: appearanceRef.current.settings.zoom };
        return;
      }
      if (pinchRef.current.distance <= 0) return;

      zoomAt(
        pinchRef.current.zoom * (distance / pinchRef.current.distance),
        ((a.x + b.x) / 2 - rect.left) / rect.width,
        ((a.y + b.y) / 2 - rect.top) / rect.height
      );
      return;
    }

    const { settings } = appearanceRef.current;
    pushSettings({
      ...settings,
      offsetX: settings.offsetX + (event.clientX - previous.x) / rect.width,
      offsetY: settings.offsetY + (event.clientY - previous.y) / rect.height,
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    if (pointersRef.current.size === 0) setIsPanning(false);
  };

  // ホイールは React 経由だと passive で付くので preventDefault が効かない。
  // ページごとスクロールしてしまうため、自前で non-passive に張る
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !appearance.source) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const local = toLocal(event);
      if (!local) return;

      const { zoom } = appearanceRef.current.settings;
      const next = Math.min(Math.max(zoom * Math.exp(-event.deltaY * 0.0015), ZOOM_MIN), ZOOM_MAX);
      if (next !== zoom) zoomAt(next, local.x, local.y);
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [appearance.source, zoomAt]);

  useEffect(() => () => {
    if (flushRef.current !== null) cancelAnimationFrame(flushRef.current);
  }, []);

  const model = useMemo(() => buildSetlistModel(cueSheet), [cueSheet]);

  const layout = useMemo(() => {
    const ctx = createMeasureContext();
    return ctx
      ? planSetlistLayout(ctx, model, { showHeader: appearance.showHeader, size: appearance.size })
      : null;
  }, [model, appearance.showHeader, appearance.size]);

  /** 縦横比が変わると背景のずらし量が限界を超えるので、切り替えと同時に詰め直す */
  const handleSizeChange = useCallback(
    (size: SetlistSize) => {
      const current = appearanceRef.current;
      if (size.id === current.size.id) return;

      const next: SetlistAppearance = {
        ...current,
        size,
        settings: current.source
          ? clampBackgroundSettings(current.settings, current.source, size)
          : current.settings,
      };
      appearanceRef.current = next;
      onAppearanceChange(next);
    },
    [onAppearanceChange]
  );

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
        <div className="flex items-center gap-3 flex-wrap">
          <label className="hint flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={appearance.showHeader}
              onChange={(e) => onAppearanceChange({ ...appearance, showHeader: e.target.checked })}
              className="accent-fg"
            />
            タイトル・アーティストを載せる
          </label>

          <div className="flex items-center gap-2">
            <span className="label">サイズ</span>
            {SETLIST_SIZES.map((size) => (
              <button
                key={size.id}
                onClick={() => handleSizeChange(size)}
                data-active={size.id === appearance.size.id}
                className={size.id === appearance.size.id ? 'btn btn-primary' : 'btn'}
              >
                {size.width} × {size.height}
              </button>
            ))}
          </div>
        </div>

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
          width={appearance.size.width}
          height={appearance.size.height}
          className="setlist-canvas"
          data-pan={appearance.source ? (isPanning ? 'active' : 'ready') : undefined}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          aria-label="セトリ画像のプレビュー"
          role="img"
        />
      </div>

      <p className="hint mt-3">
        {appearance.size.width} × {appearance.size.height} · {appearance.size.note}
        {pageCount > 1 && ` · 曲数が多いため ${pageCount} 枚に分割しています`}
      </p>
    </div>
  );
}
