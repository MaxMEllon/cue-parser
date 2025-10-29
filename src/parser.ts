import type {
  CueSheet,
  CueGlobal,
  Track,
  TrackIndex,
  FileInfo,
  TrackFlag,
  TrackMode,
  FileFormat,
  ParseResult,
  ParseError
} from './types.js';
import { parseMSFTime } from './utils.js';

/**
 * CUE Sheet parser class
 */
export class CueParser {
  private currentTrack: Track | null = null;
  private global: CueGlobal = {};
  private tracks: Track[] = [];
  private errors: ParseError[] = [];
  private warnings: ParseError[] = [];

  /**
   * Parse a CUE sheet from string content
   * @param content - CUE file content as string
   * @returns ParseResult with parsed CueSheet and any errors/warnings
   */
  public parse(content: string): ParseResult {
    this.reset();

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;

      if (line === undefined) continue;

      try {
        this.parseLine(line, lineNumber);
      } catch (error) {
        this.errors.push({
          line: lineNumber,
          message: error instanceof Error ? error.message : String(error),
          rawLine: line
        });
      }
    }

    // Finalize the last track if it exists
    if (this.currentTrack) {
      this.tracks.push(this.currentTrack);
    }

    const result: ParseResult = {
      errors: [...this.errors],
      warnings: [...this.warnings]
    };

    if (this.errors.length === 0) {
      result.cueSheet = {
        global: this.global,
        tracks: this.tracks
      };
    }

    return result;
  }

  private reset(): void {
    this.currentTrack = null;
    this.global = {};
    this.tracks = [];
    this.errors = [];
    this.warnings = [];
  }

  private parseLine(line: string, lineNumber: number): void {
    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed === '') {
      return;
    }

    // Parse the line into command and arguments
    const { command, args } = this.parseCommand(trimmed);

    if (!command) {
      return; // Empty or comment-only line
    }

    switch (command.toUpperCase()) {
      case 'REM':
        this.handleRemark(args, lineNumber);
        break;
      case 'CATALOG':
        this.handleCatalog(args, lineNumber);
        break;
      case 'CDTEXTFILE':
        this.handleCdTextFile(args, lineNumber);
        break;
      case 'FILE':
        this.handleFile(args, lineNumber);
        break;
      case 'TRACK':
        this.handleTrack(args, lineNumber);
        break;
      case 'INDEX':
        this.handleIndex(args, lineNumber);
        break;
      case 'PREGAP':
        this.handlePregap(args, lineNumber);
        break;
      case 'POSTGAP':
        this.handlePostgap(args, lineNumber);
        break;
      case 'FLAGS':
        this.handleFlags(args, lineNumber);
        break;
      case 'ISRC':
        this.handleIsrc(args, lineNumber);
        break;
      case 'TITLE':
        this.handleTitle(args, lineNumber);
        break;
      case 'PERFORMER':
        this.handlePerformer(args, lineNumber);
        break;
      case 'SONGWRITER':
        this.handleSongwriter(args, lineNumber);
        break;
      case 'COMPOSER':
        this.handleComposer(args, lineNumber);
        break;
      case 'ARRANGER':
        this.handleArranger(args, lineNumber);
        break;
      case 'MESSAGE':
        this.handleMessage(args, lineNumber);
        break;
      case 'DISC_ID':
        this.handleDiscId(args, lineNumber);
        break;
      case 'GENRE':
        this.handleGenre(args, lineNumber);
        break;
      case 'UPC_EAN':
        this.handleUpcEan(args, lineNumber);
        break;
      default:
        this.warnings.push({
          line: lineNumber,
          message: `Unknown command: ${command}`,
          rawLine: line
        });
    }
  }

  private parseCommand(line: string): { command: string; args: string } {
    const trimmed = line.trim();

    const spaceIndex = trimmed.indexOf(' ');
    if (spaceIndex === -1) {
      return { command: trimmed, args: '' };
    }

    const command = trimmed.substring(0, spaceIndex);
    const args = trimmed.substring(spaceIndex + 1).trim();

    return { command, args };
  }

  private parseQuotedString(input: string): string {
    const trimmed = input.trim();

    if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
      return trimmed.slice(1, -1);
    }

    return trimmed;
  }

  private handleRemark(args: string, lineNumber: number): void {
    const remark = args || '';

    if (this.currentTrack) {
      this.currentTrack.remarks = this.currentTrack.remarks || [];
      this.currentTrack.remarks.push(remark);
    } else {
      this.global.remarks = this.global.remarks || [];
      this.global.remarks.push(remark);
    }
  }

  private handleCatalog(args: string, lineNumber: number): void {
    const catalog = args.trim();

    if (!/^\d{13}$/.test(catalog)) {
      throw new Error(`CATALOG must be exactly 13 digits, got: ${catalog}`);
    }

    this.global.catalog = catalog;
  }

  private handleCdTextFile(args: string, lineNumber: number): void {
    const filename = this.parseQuotedString(args);
    this.global.cdTextFile = filename;
  }

  private handleFile(args: string, lineNumber: number): void {
    const parts = this.parseFileArgs(args);

    const splited = parts.filename.split("/")
    const name = splited[splited.length - 1] ?? "[EMPTY FILE NAME]"

    const fileInfo: FileInfo = {
      filename: name,
      ...(parts.format ? { format: parts.format } : {})
    };

    // Only set file if we're inside a track
    if (this.currentTrack) {
      this.currentTrack.file = fileInfo;
    } else {
      // Global FILE commands are ignored - each track must have its own FILE
      this.warnings.push({
        line: lineNumber,
        message: 'Global FILE commands are not recommended. Each TRACK should have its own FILE.',
        rawLine: `FILE ${args}`
      });
    }
  }

  private parseFileArgs(args: string): { filename: string; format?: FileFormat } {
    // Handle quoted filenames
    let filename: string;
    let format: FileFormat | undefined = undefined;

    const trimmed = args.trim();

    if (trimmed.startsWith('"')) {
      const endQuoteIndex = trimmed.indexOf('"', 1);
      if (endQuoteIndex === -1) {
        throw new Error('Unterminated quoted filename');
      }

      filename = trimmed.slice(1, endQuoteIndex);
      const remaining = trimmed.slice(endQuoteIndex + 1).trim();

      if (remaining) {
        format = this.parseFileFormat(remaining);
      }
    } else {
      const parts = trimmed.split(/\s+/);
      filename = parts[0]!;

      if (parts.length > 1 && parts[1]) {
        format = this.parseFileFormat(parts[1]);
      }
    }

    return { filename, ...(format ? { format } : {}) };
  }

  private parseFileFormat(formatStr: string): FileFormat {
    const format = formatStr.toUpperCase() as FileFormat;
    const validFormats: FileFormat[] = ['BINARY', 'MOTOROLA', 'AIFF', 'WAVE', 'MP3'];

    if (!validFormats.includes(format)) {
      throw new Error(`Invalid file format: ${formatStr}`);
    }

    return format;
  }

  private handleTrack(args: string, lineNumber: number): void {
    // Save the previous track
    if (this.currentTrack) {
      this.tracks.push(this.currentTrack);
    }

    const parts = args.trim().split(/\s+/);

    if (parts.length < 2) {
      throw new Error('TRACK command requires track number and mode');
    }

    const trackNumber = parseInt(parts[0]!, 10);
    const trackMode = parts[1]!.toUpperCase() as TrackMode;

    if (isNaN(trackNumber) || trackNumber < 1 || trackNumber > 99) {
      throw new Error(`Invalid track number: ${parts[0]!}. Must be between 1 and 99.`);
    }

    const validModes: TrackMode[] = [
      'AUDIO', 'CDG', 'MODE1/2048', 'MODE1/2352',
      'MODE2/2336', 'MODE2/2352', 'CDI/2336', 'CDI/2352'
    ];

    if (!validModes.includes(trackMode)) {
      throw new Error(`Invalid track mode: ${parts[1]!}`);
    }

    this.currentTrack = {
      number: trackNumber,
      mode: trackMode
    };
  }

  private handleIndex(args: string, lineNumber: number): void {
    if (!this.currentTrack) {
      throw new Error('INDEX command must be inside a TRACK');
    }

    const parts = args.trim().split(/\s+/);

    if (parts.length < 2) {
      throw new Error('INDEX command requires index number and time');
    }

    const indexNumber = parseInt(parts[0]!, 10);

    if (isNaN(indexNumber) || indexNumber < 0 || indexNumber > 99) {
      throw new Error(`Invalid index number: ${parts[0]!}. Must be between 0 and 99.`);
    }

    const time = parseMSFTime(parts[1]!);    this.currentTrack.indexes = this.currentTrack.indexes || [];
    this.currentTrack.indexes.push({
      number: indexNumber,
      time
    });
  }

  private handlePregap(args: string, lineNumber: number): void {
    if (!this.currentTrack) {
      throw new Error('PREGAP command must be inside a TRACK');
    }

    const time = parseMSFTime(args.trim());
    this.currentTrack.pregap = time;
  }

  private handlePostgap(args: string, lineNumber: number): void {
    if (!this.currentTrack) {
      throw new Error('POSTGAP command must be inside a TRACK');
    }

    const time = parseMSFTime(args.trim());
    this.currentTrack.postgap = time;
  }

  private handleFlags(args: string, lineNumber: number): void {
    if (!this.currentTrack) {
      throw new Error('FLAGS command must be inside a TRACK');
    }

    const flagStrings = args.trim().split(/\s+/);
    const validFlags: TrackFlag[] = ['PRE', 'DCP', '4CH', 'SCMS'];
    const flags: TrackFlag[] = [];

    for (const flagStr of flagStrings) {
      const flag = flagStr.toUpperCase() as TrackFlag;
      if (!validFlags.includes(flag)) {
        throw new Error(`Invalid flag: ${flagStr}`);
      }
      flags.push(flag);
    }

    this.currentTrack.flags = flags;
  }

  private handleIsrc(args: string, lineNumber: number): void {
    if (!this.currentTrack) {
      throw new Error('ISRC command must be inside a TRACK');
    }

    const isrc = args.trim();

    // ISRC format: CCOOOOYYSSSSS (2 country + 3 owner + 2 year + 5 designation)
    if (!/^[A-Z0-9]{12}$/.test(isrc)) {
      this.warnings.push({
        line: lineNumber,
        message: `ISRC format may be invalid: ${isrc}. Expected format: CCOOOOYYSSSSS`,
        rawLine: `ISRC ${args}`
      });
    }

    this.currentTrack.isrc = isrc;
  }

  private handleTitle(args: string, lineNumber: number): void {
    const title = this.parseQuotedString(args);

    if (this.currentTrack) {
      this.currentTrack.title = title;
    } else {
      this.global.title = title;
    }
  }

  private handlePerformer(args: string, lineNumber: number): void {
    const performer = this.parseQuotedString(args);

    if (this.currentTrack) {
      this.currentTrack.performer = performer;
    } else {
      this.global.performer = performer;
    }
  }

  private handleSongwriter(args: string, lineNumber: number): void {
    const songwriter = this.parseQuotedString(args);

    if (this.currentTrack) {
      this.currentTrack.songwriter = songwriter;
    } else {
      this.global.songwriter = songwriter;
    }
  }

  private handleComposer(args: string, lineNumber: number): void {
    const composer = this.parseQuotedString(args);

    if (this.currentTrack) {
      this.currentTrack.composer = composer;
    } else {
      this.global.composer = composer;
    }
  }

  private handleArranger(args: string, lineNumber: number): void {
    const arranger = this.parseQuotedString(args);

    if (this.currentTrack) {
      this.currentTrack.arranger = arranger;
    } else {
      this.global.arranger = arranger;
    }
  }

  private handleMessage(args: string, lineNumber: number): void {
    const message = this.parseQuotedString(args);

    if (this.currentTrack) {
      this.currentTrack.message = message;
    } else {
      this.global.message = message;
    }
  }

  private handleDiscId(args: string, lineNumber: number): void {
    const discId = this.parseQuotedString(args);
    this.global.discId = discId;
  }

  private handleGenre(args: string, lineNumber: number): void {
    const genre = this.parseQuotedString(args);
    this.global.genre = genre;
  }

  private handleUpcEan(args: string, lineNumber: number): void {
    const upcEan = this.parseQuotedString(args);
    this.global.upcEan = upcEan;
  }
}

/**
 * Convenience function to parse a CUE sheet from string
 * @param content - CUE file content
 * @returns ParseResult
 */
export function parseCueSheet(content: string): ParseResult {
  const parser = new CueParser();
  return parser.parse(content);
}