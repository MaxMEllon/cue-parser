/**
 * CUE Sheet file format type definitions
 */

/** Time format representation (Hours:Minutes:Seconds) */
export interface HMSTime {
  hour: number;   // Hours (0-99)
  minute: number; // Minutes (0-59)
  second: number; // Seconds (0-59)
}

/** Track flags */
export type TrackFlag = 'PRE' | 'DCP' | '4CH' | 'SCMS';

/** Track modes */
export type TrackMode =
  | 'AUDIO'
  | 'CDG'
  | 'MODE1/2048'
  | 'MODE1/2352'
  | 'MODE2/2336'
  | 'MODE2/2352'
  | 'CDI/2336'
  | 'CDI/2352';

/** File formats */
export type FileFormat = 'BINARY' | 'MOTOROLA' | 'AIFF' | 'WAVE' | 'MP3';

/** CD-TEXT field types */
export interface CDText {
  TITLE?: string;
  PERFORMER?: string;
  SONGWRITER?: string;
  COMPOSER?: string;
  ARRANGER?: string;
  MESSAGE?: string;
  DISC_ID?: string;
  GENRE?: string;
  TOC_INFO?: string;
  TOC_INFO2?: string;
  UPC_EAN?: string;
  SIZE_INFO?: string;
  ISRC?: string;
}

/** Track index definition */
export interface TrackIndex {
  number: number;  // 0-99
  time: HMSTime;
}

/** File definition */
export interface FileInfo {
  filename: string;
  format?: FileFormat;
}

/** Track definition */
export interface Track {
  number: number;  // 1-99
  mode: TrackMode;
  file?: FileInfo;
  title?: string;
  performer?: string;
  songwriter?: string;
  composer?: string;
  arranger?: string;
  message?: string;
  isrc?: string;
  flags?: TrackFlag[];
  indexes?: TrackIndex[];
  pregap?: HMSTime;
  postgap?: HMSTime;
  cdtext?: CDText;
  remarks?: string[];
}

/** Global CUE Sheet information */
export interface CueGlobal {
  catalog?: string;  // 13 digits
  cdTextFile?: string;
  file?: FileInfo;   // Global FILE command
  title?: string;
  performer?: string;
  songwriter?: string;
  composer?: string;
  arranger?: string;
  message?: string;
  discId?: string;
  genre?: string;
  upcEan?: string;
  cdtext?: CDText;
  remarks?: string[];
}

/** Complete CUE Sheet representation */
export interface CueSheet {
  global: CueGlobal;
  tracks: Track[];
}

/** Parse error with line information */
export interface ParseError {
  line: number;
  message: string;
  rawLine: string;
}

/** Parse result */
export interface ParseResult {
  cueSheet?: CueSheet;
  errors: ParseError[];
  warnings: ParseError[];
}