import type { CueSheet, CueGlobal, Track, TrackIndex } from './types.js';
import { formatHMSTime } from './utils.js';

/**
 * CUE Sheet serializer - converts parsed CueSheet objects back to CUE format
 */

/**
 * Serialize a CueSheet object back to CUE sheet format string
 * @param cueSheet - The parsed CueSheet object
 * @returns CUE sheet format string
 */
export function serializeCueSheet(cueSheet: CueSheet): string {
  const lines: string[] = [];

  // Add global section
  serializeGlobal(cueSheet.global, lines);

  // Add tracks with optimized FILE handling
  serializeTracksOptimized(cueSheet.tracks, lines);

  return lines.join('\n') + '\n';
}/**
 * Serialize the global section of a CUE sheet
 * @param global - Global CUE sheet information
 * @param lines - Array to append lines to
 */
function serializeGlobal(global: CueGlobal, lines: string[]): void {
  // Add remarks first
  if (global.remarks && global.remarks.length > 0) {
    global.remarks.forEach(remark => {
      lines.push(`REM ${remark}`);
    });
  }

  // Add catalog
  if (global.catalog) {
    lines.push(`CATALOG ${global.catalog}`);
  }

  // Add CD-TEXT file
  if (global.cdTextFile) {
    lines.push(`CDTEXTFILE "${global.cdTextFile}"`);
  }

  // Add CD-TEXT fields
  if (global.title) {
    lines.push(`TITLE "${escapeString(global.title)}"`);
  }

  if (global.performer) {
    lines.push(`PERFORMER "${escapeString(global.performer)}"`);
  }

  if (global.songwriter) {
    lines.push(`SONGWRITER "${escapeString(global.songwriter)}"`);
  }

  if (global.composer) {
    lines.push(`COMPOSER "${escapeString(global.composer)}"`);
  }

  if (global.arranger) {
    lines.push(`ARRANGER "${escapeString(global.arranger)}"`);
  }

  if (global.message) {
    lines.push(`MESSAGE "${escapeString(global.message)}"`);
  }

  if (global.discId) {
    lines.push(`DISC_ID "${escapeString(global.discId)}"`);
  }

  if (global.genre) {
    lines.push(`GENRE "${escapeString(global.genre)}"`);
  }

  if (global.upcEan) {
    lines.push(`UPC_EAN "${escapeString(global.upcEan)}"`);
  }
}

/**
 * Serialize tracks with optimized FILE handling
 * @param tracks - Array of tracks
 * @param lines - Array to append lines to
 */
function serializeTracksOptimized(tracks: Track[], lines: string[]): void {
  let lastFile: string | undefined = undefined;

  tracks.forEach(track => {
    // Only output FILE if it's different from the last one
    if (track.file && track.file.filename !== lastFile) {
      const formatStr = track.file.format ? ` ${track.file.format}` : '';
      if (track.file.filename.includes(' ') || track.file.filename.includes('"')) {
        lines.push(`FILE "${escapeString(track.file.filename)}"${formatStr}`);
      } else {
        lines.push(`FILE ${track.file.filename}${formatStr}`);
      }
      lastFile = track.file.filename;
    }

    serializeTrackContent(track, lines);
  });
}

/**
 * Serialize a track's content (without FILE)
 * @param track - Track information
 * @param lines - Array to append lines to
 */
function serializeTrackContent(track: Track, lines: string[]): void {
  // Add track line
  lines.push(`\t\tTRACK ${track.number.toString().padStart(2, '0')} ${track.mode}`);

  // Add track-level CD-TEXT
  if (track.title) {
    lines.push(`\t\t\tTITLE "${escapeString(track.title)}"`);
  }

  if (track.performer) {
    lines.push(`\t\t\tPERFORMER "${escapeString(track.performer)}"`);
  }

  if (track.songwriter) {
    lines.push(`\t\t\tSONGWRITER "${escapeString(track.songwriter)}"`);
  }

  if (track.composer) {
    lines.push(`\t\t\tCOMPOSER "${escapeString(track.composer)}"`);
  }

  if (track.arranger) {
    lines.push(`\t\t\tARRANGER "${escapeString(track.arranger)}"`);
  }

  if (track.message) {
    lines.push(`\t\t\tMESSAGE "${escapeString(track.message)}"`);
  }

  // Add ISRC
  if (track.isrc) {
    lines.push(`\t\t\tISRC ${track.isrc}`);
  }

  // Add file if present (after CD-TEXT fields)
  if (track.file) {
    const formatStr = track.file.format ? ` ${track.file.format}` : '';
    if (track.file.filename.includes(' ') || track.file.filename.includes('"')) {
      lines.push(`\t\t\tFILE "${escapeString(track.file.filename)}"${formatStr}`);
    } else {
      lines.push(`\t\t\tFILE ${track.file.filename}${formatStr}`);
    }
  }

  // Add flags
  if (track.flags && track.flags.length > 0) {
    lines.push(`\t\t\tFLAGS ${track.flags.join(' ')}`);
  }

  // Add pregap
  if (track.pregap) {
    lines.push(`\t\t\tPREGAP ${formatHMSTime(track.pregap)}`);
  }

  // Add indexes
  if (track.indexes && track.indexes.length > 0) {
    // Sort indexes by number
    const sortedIndexes = [...track.indexes].sort((a, b) => a.number - b.number);
    sortedIndexes.forEach(index => {
      lines.push(`\t\t\tINDEX ${index.number.toString().padStart(2, '0')} ${formatHMSTime(index.time)}`);
    });
  }

  // Add postgap
  if (track.postgap) {
    lines.push(`\t\t\tPOSTGAP ${formatHMSTime(track.postgap)}`);
  }

  // Add track remarks
  if (track.remarks && track.remarks.length > 0) {
    track.remarks.forEach(remark => {
      lines.push(`\t\t\tREM ${remark}`);
    });
  }
}

/**
 * Serialize a track (legacy function for backward compatibility)
 * @param track - Track information
 * @param lines - Array to append lines to
 */
function serializeTrack(track: Track, lines: string[]): void {
  // Use serializeTrackContent which now includes FILE inside the track
  serializeTrackContent(track, lines);
}

/**
 * Escape special characters in strings for CUE format
 * @param str - String to escape
 * @returns Escaped string
 */
function escapeString(str: string): string {
  // Escape double quotes by doubling them
  return str.replace(/"/g, '""');
}

/**
 * Format a CueSheet with proper indentation and spacing
 * @param cueSheet - The CueSheet to format
 * @param options - Formatting options
 * @returns Formatted CUE sheet string
 */
export function formatCueSheet(cueSheet: CueSheet, options: {
  indent?: string;
  trackSpacing?: boolean;
} = {}): string {
  const indent = options.indent || '	';
  const trackSpacing = options.trackSpacing ?? true;

  const lines: string[] = [];

  // Add global section
  serializeGlobal(cueSheet.global, lines);

  // Add empty line before tracks if there's global content
  if (lines.length > 0 && trackSpacing) {
    lines.push('');
  }

  // Add tracks with optional spacing
  cueSheet.tracks.forEach((track, index) => {
    if (index > 0 && trackSpacing) {
      lines.push('');
    }

    const trackLines: string[] = [];
    serializeTrackContent(track, trackLines);

    // Apply custom indentation (always apply to ensure consistent formatting)
    trackLines.forEach((line, lineIndex) => {
      if (line.startsWith('\t\t\t')) {
        trackLines[lineIndex] = line.replace(/^\t\t\t/, indent + indent + indent);
      } else if (line.startsWith('\t\t')) {
        trackLines[lineIndex] = line.replace(/^\t\t/, indent + indent);
      }
    });

    lines.push(...trackLines);
  });  return lines.join('\n') + '\n';
}

/**
 * Create a minimal CUE sheet with only essential information
 * @param cueSheet - The CueSheet to minimize
 * @returns Minimal CUE sheet string
 */
export function createMinimalCueSheet(cueSheet: CueSheet): string {
  const lines: string[] = [];

  // Only include essential global fields
  if (cueSheet.global.title) {
    lines.push(`TITLE "${escapeString(cueSheet.global.title)}"`);
  }

  if (cueSheet.global.performer) {
    lines.push(`PERFORMER "${escapeString(cueSheet.global.performer)}"`);
  }

  // Add tracks with minimal information
  cueSheet.tracks.forEach(track => {
    lines.push(`\t\tTRACK ${track.number.toString().padStart(2, '0')} ${track.mode}`);

    if (track.title) {
      lines.push(`\t\t\tTITLE "${escapeString(track.title)}"`);
    }

    // Add file inside track
    if (track.file) {
      const formatStr = track.file.format ? ` ${track.file.format}` : '';
      lines.push(`\t\t\tFILE "${escapeString(track.file.filename)}"${formatStr}`);
    }

    // Only include INDEX 01 (main index)
    if (track.indexes) {
      const mainIndex = track.indexes.find(idx => idx.number === 1);
      if (mainIndex) {
        lines.push(`\t\t\tINDEX 01 ${formatHMSTime(mainIndex.time)}`);
      }
    }
  });  return lines.join('\n') + '\n';
}