// CUE parser types - copied from the main library
export interface MSFTime {
  minutes: number;
  seconds: number;
  frames: number;
}

export interface TrackIndex {
  number: number;
  time: MSFTime;
}

export interface FileInfo {
  filename: string;
  format?: string;
}

export interface Track {
  number: number;
  mode: string;
  title?: string;
  performer?: string;
  songwriter?: string;
  composer?: string;
  arranger?: string;
  message?: string;
  isrc?: string;
  flags?: string[];
  pregap?: MSFTime;
  postgap?: MSFTime;
  indexes?: TrackIndex[];
  file?: FileInfo;
  remarks?: string[];
}

export interface CueGlobal {
  remarks?: string[];
  catalog?: string;
  cdTextFile?: string;
  title?: string;
  performer?: string;
  songwriter?: string;
  composer?: string;
  arranger?: string;
  message?: string;
  discId?: string;
  genre?: string;
  upcEan?: string;
}

export interface CueSheet {
  global: CueGlobal;
  tracks: Track[];
}

export interface ParseResult {
  cueSheet: CueSheet | null;
  errors: Array<{ line: number; message: string }>;
  warnings: Array<{ line: number; message: string }>;
}

export interface ParseError {
  line: number;
  message: string;
}

export interface ParseWarning {
  line: number;
  message: string;
}