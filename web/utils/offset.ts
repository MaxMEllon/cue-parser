import { hmsToSeconds, secondsToHMS } from 'cue-parser';
import type { CueSheet, HMSTime } from 'cue-parser';

/**
 * 時刻オフセット関連のユーティリティ
 *
 * オフセットは秒単位の整数(負値も可)で保持し、
 * トラックの INDEX 時刻に対して加算する。
 */

/** オフセット適用後に 0 未満になる時刻は 00:00:00 に丸める */
export function shiftHMSTime(time: HMSTime, offsetSeconds: number): HMSTime {
  return secondsToHMS(Math.max(0, hmsToSeconds(time) + offsetSeconds));
}

/**
 * CUEシート全体の INDEX 時刻にオフセットを適用した新しいシートを返す
 * PREGAP / POSTGAP は絶対時刻ではなく長さなので対象外
 */
export function applyOffsetToCueSheet(cueSheet: CueSheet, offsetSeconds: number): CueSheet {
  if (!offsetSeconds) return cueSheet;

  return {
    ...cueSheet,
    tracks: cueSheet.tracks.map((track) => ({
      ...track,
      indexes: track.indexes?.map((index) => ({
        ...index,
        time: shiftHMSTime(index.time, offsetSeconds),
      })),
    })),
  };
}

/** マイナスオフセットで 00:00:00 に丸められるトラックが存在するか */
export function hasClampedTracks(cueSheet: CueSheet, offsetSeconds: number): boolean {
  if (offsetSeconds >= 0) return false;

  return cueSheet.tracks.some((track) =>
    (track.indexes ?? []).some((index) => hmsToSeconds(index.time) + offsetSeconds < 0)
  );
}

/** 秒数を "±HH:MM:SS" 形式に整形する */
export function formatOffset(offsetSeconds: number): string {
  const sign = offsetSeconds < 0 ? '-' : '+';
  const abs = Math.abs(offsetSeconds);
  const hour = Math.floor(abs / 3600);
  const minute = Math.floor((abs % 3600) / 60);
  const second = abs % 60;
  const pad = (value: number) => value.toString().padStart(2, '0');

  return `${sign}${pad(hour)}:${pad(minute)}:${pad(second)}`;
}

/**
 * 入力文字列を秒数に変換する
 * 受け付ける形式: "90" / "1:30" / "1:02:03" (先頭に + / - を付与可)
 * @returns 秒数。解釈できない場合は null
 */
export function parseOffsetInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return 0;

  const match = /^([+-])?(\d{1,3})(?::(\d{1,2}))?(?::(\d{1,2}))?$/.exec(trimmed);
  if (!match) return null;

  const sign = match[1] === '-' ? -1 : 1;
  const parts = [match[2], match[3], match[4]]
    .filter((part): part is string => part !== undefined)
    .map((part) => parseInt(part, 10));

  // 先頭以外(分・秒)は 60 未満であること
  if (parts.slice(1).some((part) => part >= 60)) return null;

  const total =
    parts.length === 1
      ? parts[0]
      : parts.length === 2
        ? parts[0] * 60 + parts[1]
        : parts[0] * 3600 + parts[1] * 60 + parts[2];

  return sign * total;
}
