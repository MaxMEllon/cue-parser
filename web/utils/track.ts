import { hmsToSeconds, secondsToHMS } from '@maxmellon/cue-parser';
import type { HMSTime, Track } from '@maxmellon/cue-parser';

/**
 * トラックの編集(追加・並び替え・開始時刻の書き換え)のユーティリティ
 *
 * rekordbox の CUE には入っていない曲(最初の挨拶や最後の 1 曲)を足したり、
 * 実際に流した順に直したりするための道具。
 */

export const ZERO_TIME: HMSTime = { hour: 0, minute: 0, second: 0 };

/** 開始時刻。INDEX 01 を優先する(youtube-serializer と同じ選び方) */
export function trackStartTime(track: Track): HMSTime {
  const indexes = track.indexes ?? [];
  const main = indexes.find((index) => index.number === 1) ?? indexes[indexes.length - 1];
  return main?.time ?? ZERO_TIME;
}

/** 開始時刻を差し替えたトラックを返す。INDEX 01 が無ければ足す */
export function withStartTime(track: Track, time: HMSTime): Track {
  const indexes = track.indexes ?? [];
  if (!indexes.some((index) => index.number === 1)) {
    return { ...track, indexes: [...indexes, { number: 1, time }] };
  }

  return {
    ...track,
    indexes: indexes.map((index) => (index.number === 1 ? { ...index, time } : index)),
  };
}

/**
 * 入力文字列を時刻に変換する
 * 受け付ける形式はオフセット欄と同じ: "90" / "1:30" / "1:02:03"
 * @returns 解釈できない場合は null
 */
export function parseTimeInput(raw: string): HMSTime | null {
  const match = /^(\d{1,3})(?::(\d{1,2}))?(?::(\d{1,2}))?$/.exec(raw.trim());
  if (!match) return null;

  const parts = [match[1], match[2], match[3]]
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

  return secondsToHMS(total);
}

/** TRACK 番号を 1 から振り直す */
export function renumberTracks(tracks: Track[]): Track[] {
  return tracks.map((track, index) => ({ ...track, number: index + 1 }));
}

/** 中身が空のトラックを 1 つ作る。曲名とアーティストは未入力のままにして編集を促す */
export function createTrack(time: HMSTime): Track {
  return { number: 1, mode: 'AUDIO', title: '', performer: '', indexes: [{ number: 1, time }] };
}

export function insertAt<T>(items: T[], at: number, item: T): T[] {
  const next = [...items];
  next.splice(at, 0, item);
  return next;
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to) return items;

  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * トラックを並び替える。
 * 時刻は場所に残したまま、曲の中身だけを動かす
 * (曲順を直したいだけなのに、タイムラインまで飛び飛びになると困るため)。
 * PREGAP / POSTGAP は絶対時刻ではなくトラック固有の長さなので、曲と一緒に動く。
 */
export function reorderTracks(tracks: Track[], from: number, to: number): Track[] {
  if (from === to) return tracks;

  const times = tracks.map((track) => track.indexes);
  return renumberTracks(
    moveItem(tracks, from, to).map((track, index) => ({ ...track, indexes: times[index] }))
  );
}

/** 00:00:00 を下限に、秒数のぶんだけずらした時刻を返す */
export function shiftTime(time: HMSTime, seconds: number): HMSTime {
  return secondsToHMS(Math.max(0, hmsToSeconds(time) + seconds));
}
