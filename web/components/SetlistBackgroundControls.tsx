'use client';

import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import {
  DEFAULT_BACKGROUND_SETTINGS,
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
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="label">{label}</span>
        <span className="value">{format(value)}</span>
      </div>
      <input
        type="range"
        className="slider mt-1"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
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
  const [isDragging, setIsDragging] = useState(false);

  const { source, settings, theme } = appearance;

  const patchSettings = (patch: Partial<BackgroundSettings>) =>
    onChange({ ...appearance, settings: { ...settings, ...patch } });

  const patchTheme = (patch: Partial<SetlistTheme>) =>
    onChange({ ...appearance, theme: { ...theme, ...patch } });

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
      onChange({ ...appearance, source: next });
    } catch {
      setError('画像を読み込めませんでした。');
    }
  };

  const handlePick = (event: ChangeEvent<HTMLInputElement>) => {
    void acceptFile(event.target.files?.[0]);
    // 同じファイルを選び直せるように値を捨てる
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    void acceptFile(event.dataTransfer.files?.[0]);
  };

  const handleRemove = () => {
    source?.release();
    setError('');
    onChange({ ...appearance, source: null });
  };

  const handleReset = () =>
    onChange({ ...appearance, settings: DEFAULT_BACKGROUND_SETTINGS, theme: DEFAULT_THEME });

  return (
    <div
      className="panel-inset p-4"
      data-drag={isDragging ? 'active' : undefined}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
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

      {error !== '' && <p className="hint mt-2 text-fg">{error}</p>}

      {!source ? (
        <p className="hint mt-2">
          画像をここにドロップするか選ぶと、セトリの下に敷けます。明るさや文字色はあとから調節できます。
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {!supportsFilters && (
            <p className="hint text-fg">
              この環境では WebGL も Canvas のフィルタも使えないため、明るさ以外の調節は効きません。
            </p>
          )}

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
              label="縦位置"
              value={settings.focusY}
              min={0}
              max={1}
              step={0.01}
              format={percent}
              onChange={(focusY) => patchSettings({ focusY })}
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
