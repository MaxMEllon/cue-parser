import type { CueSheet } from '@maxmellon/cue-parser';

/**
 * ID モード。まだ名前を出せない曲を █ で塗り潰す。
 *
 * 元の CueSheet は書き換えず、出力を作る直前にかぶせるだけにしてある。
 * こうしておくと解除したときに元の曲名がそのまま戻る。
 */

const BLOCK = '█';

/* 塗り潰しの長さ。元の字数に合わせると伏せ字らしく見えるが、
   短すぎると潰した意味が薄く、長すぎると 1 行を食い潰すので幅を切る */
const MIN_BLOCKS = 4;
const MAX_BLOCKS = 12;

/** 曲名とアーティストは別々に伏せられる(片方だけ ID、もよくある) */
export interface IdFlags {
  title: boolean;
  performer: boolean;
}

export const NO_ID: IdFlags = { title: false, performer: false };

/** 印が無いトラックのぶんを埋める */
export function idFlagsAt(idTracks: IdFlags[], index: number): IdFlags {
  return idTracks[index] ?? NO_ID;
}

export function hasAnyId(flags: IdFlags): boolean {
  return flags.title || flags.performer;
}

export function redactText(text: string | undefined): string {
  const length = (text ?? '').trim().length || MIN_BLOCKS;
  return BLOCK.repeat(Math.min(Math.max(length, MIN_BLOCKS), MAX_BLOCKS));
}

/** ID にした項目だけを塗り潰した CueSheet を返す */
export function applyIdMode(cueSheet: CueSheet, idTracks: IdFlags[]): CueSheet {
  // 1 つも指定が無ければ同じ参照を返す(下流の useMemo を無駄に走らせない)
  if (!idTracks.some((flags) => flags && hasAnyId(flags))) return cueSheet;

  return {
    ...cueSheet,
    tracks: cueSheet.tracks.map((track, index) => {
      const flags = idFlagsAt(idTracks, index);
      if (!hasAnyId(flags)) return track;

      return {
        ...track,
        title: flags.title ? redactText(track.title) : track.title,
        performer: flags.performer ? redactText(track.performer) : track.performer,
      };
    }),
  };
}
