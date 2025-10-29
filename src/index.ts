/**
 * CUE Sheet Parser
 *
 * A TypeScript library for parsing CUE sheet files according to the specification.
 *
 * @example
 * ```typescript
 * import { parseCueSheet, CueParser } from 'cue-parser';
 *
 * const cueContent = `
 * TITLE "Example Album"
 * PERFORMER "Example Artist"
 * FILE "audio.wav" WAVE
 *   TRACK 01 AUDIO
 *     TITLE "Track 1"
 *     INDEX 01 00:00:00
 * `;
 *
 * const result = parseCueSheet(cueContent);
 * if (result.cueSheet) {
 *   console.log(result.cueSheet.global.title); // "Example Album"
 *   console.log(result.cueSheet.tracks[0].title); // "Track 1"
 * }
 * ```
 */

// Export all types
export type {
  MSFTime,
  TrackFlag,
  TrackMode,
  FileFormat,
  CDText,
  TrackIndex,
  FileInfo,
  Track,
  CueGlobal,
  CueSheet,
  ParseError,
  ParseResult
} from './types.js';

// Export utilities
export {
  parseMSFTime,
  formatMSFTime,
  msfToSeconds,
  secondsToMSF,
  msfToFrames,
  framesToMSF,
  addMSFTime,
  subtractMSFTime,
  compareMSFTime
} from './utils.js';

// Export parser
export { CueParser, parseCueSheet } from './parser.js';

// Export serializer
export {
  serializeCueSheet,
  formatCueSheet,
  createMinimalCueSheet
} from './serializer.js';