'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import {
  DEFAULT_BACKGROUND_SETTINGS,
  ZOOM_MAX,
  ZOOM_MIN,
  clampBackgroundSettings,
  loadImageSource,
  type BackgroundSettings,
  type BackgroundSource,
} from '@/utils/setlistBackground';
import { DEFAULT_THEME, type SetlistTheme } from '@/utils/setlistImage';

/** セトリ画像の見た目の設定。タブを行き来しても消えないよう CueParser が持つ */
export interface SetlistAppearance {
  /** タイトル・アーティストのヘッダーを載せるか */
  showHeader: boolean;
  source: BackgroundSource | null;
  settings: BackgroundSettings;
  theme: SetlistTheme;
}

export const DEFAULT_APPEARANCE: SetlistAppearance = {
  showHeader: false,
  source: null,
  settings: DEFAULT_BACKGROUND_SETTINGS,
  theme: DEFAULT_THEME,
};

const percent = (value: number) => `${Math.round(value * 100)}%`;

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  /* ドラッグ中は親の再描画を待たず、自分の値でつまみを描く。
     制御コンポーネントのままだと、親の更新(背景の焼き直しを伴うので重い)が
     ポインタに追いつかず、commit のたびに古い値で DOM を上書きしてしまい、
     つまみが引き戻されて掴めないように見える */
  const [dragging, setDragging] = useState<number | null>(null);
  const shown = dragging ?? value;

  useEffect(() => {
    // 親が追いついたら手放して、ふつうの制御コンポーネントに戻す。
    // 指を離した時点で手放すと、親がまだ古い値のときに一瞬つまみが飛ぶので、
    // 追いついたかどうかだけで判断する(念のため blur でも手放す)
    if (dragging !== null && value === dragging) setDragging(null);
  }, [value, dragging]);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="label">{label}</span>
        <span className="value">{format(shown)}</span>
      </div>
      <input
        type="range"
        className="slider mt-1"
        min={min}
        max={max}
        step={step}
        value={shown}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => {
          const next = Number(e.target.value);
          setDragging(next);
          onChange(next);
        }}
        onBlur={() => setDragging(null)}
      />
    </div>
  );
}

export default function SetlistBackgroundControls({
  appearance,
  onChange,
  supportsFilters,
  supportsHalftone,
}: {
  appearance: SetlistAppearance;
  onChange: (next: SetlistAppearance) => void;
  supportsFilters: boolean;
  /** 網点は WebGL 経路でしか作れない */
  supportsHalftone: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  const { source, settings, theme } = appearance;

  const patchSettings = (patch: Partial<BackgroundSettings>) =>
    onChange({ ...appearance, settings: { ...settings, ...patch } });

  const patchTheme = (patch: Partial<SetlistTheme>) =>
    onChange({ ...appearance, theme: { ...theme, ...patch } });

  // つまみでの拡大は画面の中央を軸にする。ずらし量も同じ比で伸ばすと中央が動かない
  const handleZoom = (zoom: number) => {
    if (!source) return;
    const ratio = settings.zoom === 0 ? 1 : zoom / settings.zoom;
    onChange({
      ...appearance,
      settings: clampBackgroundSettings(
        { ...settings, zoom, offsetX: settings.offsetX * ratio, offsetY: settings.offsetY * ratio },
        source
      ),
    });
  };

  const acceptFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('画像ファイルを選んでください。');
      return;
    }

    try {
      const next = await loadImageSource(file);
      // 差し替え前の画像は必ず手放す(オブジェクト URL / ImageBitmap の解放)
      source?.release();
      setError('');
      // 縦横比が変わると前の画像のずらし量が限界を超えることがあるので、ここで詰め直す
      onChange({
        ...appearance,
        source: next,
        settings: clampBackgroundSettings(settings, next),
      });
    } catch {
      setError('画像を読み込めませんでした。');
    }
  };

  const handlePick = (event: ChangeEvent<HTMLInputElement>) => {
    void acceptFile(event.target.files?.[0]);
    // 同じファイルを選び直せるように値を捨てる
    event.target.value = '';
  };

  const handleRemove = () => {
    source?.release();
    setError('');
    onChange({ ...appearance, source: null });
  };

  const handleReset = () =>
    onChange({ ...appearance, settings: DEFAULT_BACKGROUND_SETTINGS, theme: DEFAULT_THEME });

  // 背景画像はドラッグ&ドロップに対応しない。この中にスライダーがあり、
  // つまみを掴む操作とドロップ判定がぶつかるので、選択はボタンだけにしてある
  return (
    <div className="panel-inset p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="label">背景画像</span>
        <div className="flex items-center gap-2">
          <label className="btn cursor-pointer">
            {source ? '画像を差し替え' : '画像を選ぶ'}
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handlePick}
            />
          </label>
          {source && (
            <button onClick={handleRemove} className="btn">
              外す
            </button>
          )}
        </div>
      </div>

      {error !== '' && <p className="hint mt-2 text-danger">{error}</p>}

      {!source ? (
        <p className="hint mt-2">
          「画像を選ぶ」から読み込むと、セトリの下に敷けます。明るさ・位置・文字色はあとから調節できます。
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {!supportsFilters && (
            <p className="hint text-fg">
              この環境では WebGL も Canvas のフィルタも使えないため、明るさ以外の調節は効きません。
            </p>
          )}

          <p className="hint">
            下のプレビューを直接ドラッグすると位置、ホイール(指なら 2 本でつまむ)で拡大率が変わります。
            1.00x は画面ぴったりで動かせる幅がないので、動かしたい方向には拡大してください。
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Slider
              label="明るさ"
              value={settings.brightness}
              min={0.2}
              max={1.6}
              step={0.01}
              format={percent}
              onChange={(brightness) => patchSettings({ brightness })}
            />
            <Slider
              label="コントラスト"
              value={settings.contrast}
              min={0.6}
              max={1.8}
              step={0.01}
              format={percent}
              disabled={!supportsFilters}
              onChange={(contrast) => patchSettings({ contrast })}
            />
            <Slider
              label="彩度"
              value={settings.saturation}
              min={0}
              max={1}
              step={0.01}
              format={percent}
              disabled={!supportsFilters}
              onChange={(saturation) => patchSettings({ saturation })}
            />
            <Slider
              label="ぼかし"
              value={settings.blur}
              min={0}
              max={24}
              step={1}
              format={(value) => `${value}px`}
              disabled={!supportsFilters}
              onChange={(blur) => patchSettings({ blur })}
            />
            <Slider
              label="拡大率"
              value={settings.zoom}
              min={ZOOM_MIN}
              max={ZOOM_MAX}
              step={0.01}
              format={(value) => `${value.toFixed(2)}x`}
              onChange={handleZoom}
            />
            <Slider
              label="黒の覆い"
              value={theme.scrim}
              min={0}
              max={0.85}
              step={0.01}
              format={percent}
              onChange={(scrim) => patchTheme({ scrim })}
            />
          </div>

          <div className="rule-t pt-4 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="label">文字色</span>
              <button
                onClick={() => patchTheme({ textColor: 'light' })}
                data-active={theme.textColor === 'light'}
                className={theme.textColor === 'light' ? 'btn btn-primary' : 'btn'}
              >
                白
              </button>
              <button
                onClick={() => patchTheme({ textColor: 'dark' })}
                data-active={theme.textColor === 'dark'}
                className={theme.textColor === 'dark' ? 'btn btn-primary' : 'btn'}
              >
                黒
              </button>
            </div>

            <label className="hint flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={theme.textShadow}
                onChange={(e) => patchTheme({ textShadow: e.target.checked })}
                className="accent-fg"
              />
              文字に影を付ける
            </label>

            <label className="hint flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.halftone}
                disabled={!supportsHalftone}
                onChange={(e) => patchSettings({ halftone: e.target.checked })}
                className="accent-fg"
              />
              網点にする
            </label>

            <button onClick={handleReset} className="btn">
              初期値に戻す
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
