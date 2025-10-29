import { MSFTime, CueSheet, CueGlobal, Track, TrackIndex, ParseResult, FileInfo } from './types';

// MSF Time utilities
export function parseMSFTime(timeStr: string): MSFTime | null {
  const match = timeStr.match(/^(\d{1,3}):([0-5]?\d):([0-6]?\d|7[0-4])$/);
  if (!match) return null;

  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);
  const frames = parseInt(match[3], 10);

  if (seconds >= 60 || frames >= 75) return null;

  return { minutes, seconds, frames };
}

export function formatMSFTime(time: MSFTime): string {
  return `${time.minutes.toString().padStart(2, '0')}:${time.seconds
    .toString()
    .padStart(2, '0')}:${time.frames.toString().padStart(2, '0')}`;
}

// CUE Parser implementation
export function parseCueSheet(content: string): ParseResult {
  const lines = content.split('\n');
  const result: ParseResult = {
    cueSheet: {
      global: {},
      tracks: []
    },
    errors: [],
    warnings: []
  };

  let currentTrack: Track | null = null;
  let lineNumber = 0;

  for (const rawLine of lines) {
    lineNumber++;
    const line = rawLine.trim();

    if (!line || line.startsWith('REM ')) {
      if (line.startsWith('REM ')) {
        const remark = line.substring(4);
        if (currentTrack) {
          if (!currentTrack.remarks) currentTrack.remarks = [];
          currentTrack.remarks.push(remark);
        } else {
          if (!result.cueSheet!.global.remarks) result.cueSheet!.global.remarks = [];
          result.cueSheet!.global.remarks.push(remark);
        }
      }
      continue;
    }

    try {
      if (line.startsWith('CATALOG ')) {
        const catalog = line.substring(8).trim();
        if (!/^\d{13}$/.test(catalog)) {
          result.errors.push({ line: lineNumber, message: 'CATALOG must be exactly 13 digits' });
        } else {
          result.cueSheet!.global.catalog = catalog;
        }
      } else if (line.startsWith('TITLE ')) {
        const title = parseQuotedString(line.substring(6));
        if (currentTrack) {
          currentTrack.title = title;
        } else {
          result.cueSheet!.global.title = title;
        }
      } else if (line.startsWith('PERFORMER ')) {
        const performer = parseQuotedString(line.substring(10));
        if (currentTrack) {
          currentTrack.performer = performer;
        } else {
          result.cueSheet!.global.performer = performer;
        }
      } else if (line.startsWith('SONGWRITER ')) {
        const songwriter = parseQuotedString(line.substring(11));
        if (currentTrack) {
          currentTrack.songwriter = songwriter;
        } else {
          result.cueSheet!.global.songwriter = songwriter;
        }
      } else if (line.startsWith('FILE ')) {
        if (!currentTrack) {
          result.warnings.push({
            line: lineNumber,
            message: 'Global FILE commands are not recommended. Each TRACK should have its own FILE.'
          });
        }
        // Parse FILE for current track if exists
        const fileMatch = line.match(/^FILE\s+(?:"([^"]+)"|(\S+))(?:\s+(.+))?$/);
        if (fileMatch) {
          const filename = fileMatch[1] || fileMatch[2];
          const format = fileMatch[3];
          if (currentTrack) {
            currentTrack.file = { filename, format };
          }
        }
      } else if (line.startsWith('TRACK ')) {
        const trackMatch = line.match(/^TRACK\s+(\d+)\s+(.+)$/);
        if (trackMatch) {
          const number = parseInt(trackMatch[1], 10);
          const mode = trackMatch[2];

          if (!['AUDIO', 'CDG', 'MODE1/2048', 'MODE1/2352', 'MODE2/2336', 'MODE2/2352', 'CDI/2336', 'CDI/2352'].includes(mode)) {
            result.errors.push({ line: lineNumber, message: `Invalid track mode: ${mode}` });
          }

          currentTrack = { number, mode };
          result.cueSheet!.tracks.push(currentTrack);
        }
      } else if (line.startsWith('INDEX ')) {
        if (!currentTrack) {
          result.errors.push({ line: lineNumber, message: 'INDEX command must be inside a TRACK' });
          continue;
        }

        const indexMatch = line.match(/^INDEX\s+(\d+)\s+(.+)$/);
        if (indexMatch) {
          const indexNumber = parseInt(indexMatch[1], 10);
          const timeStr = indexMatch[2];
          const time = parseMSFTime(timeStr);

          if (!time) {
            result.errors.push({ line: lineNumber, message: `Invalid MSF time format: ${timeStr}` });
            continue;
          }

          if (!currentTrack.indexes) currentTrack.indexes = [];
          currentTrack.indexes.push({ number: indexNumber, time });
        }
      } else if (line.startsWith('ISRC ')) {
        if (currentTrack) {
          currentTrack.isrc = line.substring(5);
        }
      } else if (line.startsWith('FLAGS ')) {
        if (currentTrack) {
          currentTrack.flags = line.substring(6).split(/\s+/);
        }
      } else if (line.startsWith('PREGAP ')) {
        if (currentTrack) {
          const time = parseMSFTime(line.substring(7));
          if (time) {
            currentTrack.pregap = time;
          }
        }
      } else if (line.startsWith('POSTGAP ')) {
        if (currentTrack) {
          const time = parseMSFTime(line.substring(8));
          if (time) {
            currentTrack.postgap = time;
          }
        }
      }
    } catch (error) {
      result.errors.push({
        line: lineNumber,
        message: `Parse error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  }

  return result;
}

function parseQuotedString(str: string): string {
  const trimmed = str.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/""/g, '"');
  }
  return trimmed;
}

// Serializer functions
export function serializeCueSheet(cueSheet: CueSheet): string {
  const lines: string[] = [];

  // Add global section
  serializeGlobal(cueSheet.global, lines);

  // Add tracks
  cueSheet.tracks.forEach(track => {
    serializeTrack(track, lines);
  });

  return lines.join('\n') + '\n';
}

function serializeGlobal(global: CueGlobal, lines: string[]): void {
  if (global.remarks?.length) {
    global.remarks.forEach(remark => lines.push(`REM ${remark}`));
  }
  if (global.catalog) lines.push(`CATALOG ${global.catalog}`);
  if (global.title) lines.push(`TITLE "${escapeString(global.title)}"`);
  if (global.performer) lines.push(`PERFORMER "${escapeString(global.performer)}"`);
  if (global.songwriter) lines.push(`SONGWRITER "${escapeString(global.songwriter)}"`);
}

function serializeTrack(track: Track, lines: string[]): void {
  lines.push(`\t\tTRACK ${track.number.toString().padStart(2, '0')} ${track.mode}`);

  if (track.title) lines.push(`\t\t\tTITLE "${escapeString(track.title)}"`);
  if (track.performer) lines.push(`\t\t\tPERFORMER "${escapeString(track.performer)}"`);
  if (track.songwriter) lines.push(`\t\t\tSONGWRITER "${escapeString(track.songwriter)}"`);

  if (track.file) {
    const formatStr = track.file.format ? ` ${track.file.format}` : '';
    lines.push(`\t\t\tFILE "${escapeString(track.file.filename)}"${formatStr}`);
  }

  if (track.flags?.length) {
    lines.push(`\t\t\tFLAGS ${track.flags.join(' ')}`);
  }

  if (track.pregap) {
    lines.push(`\t\t\tPREGAP ${formatMSFTime(track.pregap)}`);
  }

  if (track.indexes?.length) {
    track.indexes
      .sort((a, b) => a.number - b.number)
      .forEach(index => {
        lines.push(`\t\t\tINDEX ${index.number.toString().padStart(2, '0')} ${formatMSFTime(index.time)}`);
      });
  }

  if (track.postgap) {
    lines.push(`\t\t\tPOSTGAP ${formatMSFTime(track.postgap)}`);
  }
}

function escapeString(str: string): string {
  return str.replace(/"/g, '""');
}

// YouTube Timeline serializer
export function serializeYouTubeTimeline(cueSheet: CueSheet): string {
  const lines: string[] = [];

  // Add header
  lines.push('🎵 Tracklist :');

  // Add each track
  cueSheet.tracks.forEach((track) => {
    const performer = track.performer || cueSheet.global.performer || 'Unknown Artist';
    const title = track.title || 'Untitled';

    // Get the main index time (usually INDEX 01)
    let timeStr = '00:00:00';
    if (track.indexes && track.indexes.length > 0) {
      // Find INDEX 01, or use the last index if INDEX 01 doesn't exist
      const mainIndex = track.indexes.find(idx => idx.number === 1) || track.indexes[track.indexes.length - 1];
      if (mainIndex && mainIndex.time) {
        // For YouTube timeline, treat CUE time as HH:MM:SS format
        // The MSF fields represent hours:minutes:seconds, not minutes:seconds:frames

        const hours = mainIndex.time.minutes;  // First field is hours
        const minutes = mainIndex.time.seconds; // Second field is minutes
        const seconds = mainIndex.time.frames;  // Third field is seconds

        timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      }
    }

    lines.push(`${timeStr} ${performer} - ${title}`);
  });

  return lines.join('\n');
}