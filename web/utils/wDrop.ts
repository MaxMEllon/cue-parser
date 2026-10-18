import { serializeYouTubeTimeline } from '@maxmellon/cue-parser';
import type { CueSheet } from '@maxmellon/cue-parser';

/**
 * W ドロップ (マッシュアップ) モード。前の曲に重ねて流した曲の曲名に "w/" を付ける。
 *
 * ID モードと同じく元の CueSheet は書き換えず、出力を作る直前にかぶせるだけにしてある。
 * 付けるのは YouTube タイムラインとセトリ画像だけで、Mixcloud 用の CUE と JSON には付けない。
 * (YouTube タイムラインは曲名ではなくアーティストの前に付ける。下の serializeYouTubeTimelineWithWDrop)
 */

const PREFIX = 'w/ ';

/** 1 曲目は重ねる相手が居ないので W ドロップにはできない(並び替えで先頭に来た印も無視する) */
export function canWDropAt(index: number): boolean {
  return index > 0;
}

export function isWDropAt(wDropTracks: boolean[], index: number): boolean {
  return canWDropAt(index) && (wDropTracks[index] ?? false);
}

/** W ドロップにしたトラックの曲名だけに "w/" を付けた CueSheet を返す */
export function applyWDropMode(cueSheet: CueSheet, wDropTracks: boolean[]): CueSheet {
  // 1 つも指定が無ければ同じ参照を返す(下流の useMemo を無駄に走らせない)
  if (!wDropTracks.some(Boolean)) return cueSheet;

  return {
    ...cueSheet,
    tracks: cueSheet.tracks.map((track, index) =>
      // 未入力のときは出力側のフォールバックに合わせて Untitled に付ける
      isWDropAt(wDropTracks, index)
        ? { ...track, title: `${PREFIX}${(track.title ?? '').trim() || 'Untitled'}` }
        : track
    ),
  };
}

/* YouTube タイムラインで W ドロップの行に入れる字下げ。
   時刻は行頭に残す(行頭を空けるとチャプターとして拾われなくなりかねない) */
const TIMELINE_INDENT = '   ';

/**
 * W ドロップの行だけ時刻の後ろを字下げし、"w/" を付けた YouTube タイムラインを返す。
 * こちらは曲名ではなく行の頭 (アーティストの前) に付ける: "00:12:34   w/ Artist - Title"
 */
export function serializeYouTubeTimelineWithWDrop(cueSheet: CueSheet, wDropTracks: boolean[]): string {
  const lines = serializeYouTubeTimeline(cueSheet).split('\n');
  // 先頭のヘッダー行より後ろは、トラックが 1 行ずつ同じ並びで出てくる
  const headerLines = lines.length - cueSheet.tracks.length;

  return lines
    .map((line, index) =>
      isWDropAt(wDropTracks, index - headerLines) ? line.replace(/^(\S+) /, `$1${TIMELINE_INDENT}${PREFIX}`) : line
    )
    .join('\n');
}
