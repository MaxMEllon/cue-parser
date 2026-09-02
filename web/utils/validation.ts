import type { CueSheet } from 'cue-parser';

/**
 * 編集が必要な項目(タイトル・アーティストの未入力)を検出するユーティリティ
 */

/** 未入力(未定義・空文字・空白のみ)かどうか */
export function isBlank(value: string | undefined): boolean {
  return !value || value.trim() === '';
}

/** タイトル・アーティストのうち未入力になっている項目数 */
export function countMissingFields(cueSheet: CueSheet | undefined): number {
  if (!cueSheet) return 0;

  const globalMissing = [cueSheet.global.title, cueSheet.global.performer].filter(isBlank).length;
  const trackMissing = cueSheet.tracks.reduce(
    (count, track) => count + [track.title, track.performer].filter(isBlank).length,
    0
  );

  return globalMissing + trackMissing;
}
