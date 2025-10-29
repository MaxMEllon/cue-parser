import { describe, it, expect, beforeAll } from 'vitest';
import {
  parseCueSheet,
  serializeCueSheet,
  formatCueSheet,
  createMinimalCueSheet
} from '../src/index.js';
import type { CueSheet } from '../src/types.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('CUE Serializer', () => {
  let sampleCueSheet: any;

  beforeAll(() => {
    const samplePath = join(__dirname, '../examples/sample.cue');
    const content = readFileSync(samplePath, 'utf-8');
    const result = parseCueSheet(content);
    sampleCueSheet = result.cueSheet!;
  });

  describe('Basic serialization', () => {
    it('should serialize a CUE sheet back to string format', () => {
      const serialized = serializeCueSheet(sampleCueSheet);

      expect(serialized).toContain('TITLE "Sample Album"');
      expect(serialized).toContain('PERFORMER "Sample Artist"');
      expect(serialized).toContain('CATALOG 1234567890123');
      expect(serialized).toContain('TRACK 01 AUDIO');
      expect(serialized).toContain('TRACK 02 AUDIO');
      expect(serialized).toContain('TRACK 03 AUDIO');
      expect(serialized).toContain('TRACK 04 AUDIO');
    });

    it('should format CUE sheet with proper spacing', () => {
      const formatted = formatCueSheet(sampleCueSheet, { trackSpacing: true });

      expect(formatted).toContain('TITLE "Sample Album"');
      expect(formatted).toContain('\t\tTRACK 01 AUDIO');
      expect(formatted).toContain('\t\t\tTITLE "First Track"');
    });

    it('should create minimal CUE sheet', () => {
      const minimal = createMinimalCueSheet(sampleCueSheet);

      expect(minimal).toContain('TITLE "Sample Album"');
      expect(minimal).toContain('PERFORMER "Sample Artist"');
      expect(minimal).toContain('\t\tTRACK 01 AUDIO');
      expect(minimal).toContain('\t\t\tTITLE "First Track"');
      expect(minimal).toContain('\t\t\tINDEX 01');

      // Should not contain optional fields like PREGAP, POSTGAP, etc.
      expect(minimal).not.toContain('PREGAP');
      expect(minimal).not.toContain('INDEX 00');
    });
  });

  describe('FILE field positioning', () => {
    it('should place FILE inside tracks, not at global level', () => {
      // Create a test with multiple files
      const multiFileCue: CueSheet = {
        global: {
          title: 'Multi-File Album'
        },
        tracks: [
          {
            number: 1,
            mode: 'AUDIO',
            title: 'Track 1',
            file: { filename: 'track1.wav', format: 'WAVE' },
            indexes: [{ number: 1, time: { minutes: 0, seconds: 0, frames: 0 } }]
          },
          {
            number: 2,
            mode: 'AUDIO',
            title: 'Track 2',
            file: { filename: 'track2.wav', format: 'WAVE' },
            indexes: [{ number: 1, time: { minutes: 3, seconds: 30, frames: 0 } }]
          }
        ]
      };

      const serialized = serializeCueSheet(multiFileCue);

      // Check that FILE appears within track context
      const lines = serialized.split('\n');
      let trackFound = false;
      let fileAfterTrack = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]?.trim();
        if (line?.startsWith('TRACK')) {
          trackFound = true;
          // Look for FILE in the lines following this TRACK
          for (let j = i + 1; j < lines.length && !lines[j]?.trim().startsWith('TRACK'); j++) {
            if (lines[j]?.trim().startsWith('FILE')) {
              fileAfterTrack = true;
              break;
            }
          }
          if (fileAfterTrack) break;
        }
      }

      expect(trackFound).toBe(true);
      expect(fileAfterTrack).toBe(true);
    });    it('should use tab indentation for rekordbox compatibility', () => {
      const serialized = serializeCueSheet(sampleCueSheet);
      const lines = serialized.split('\n');

      const trackLines = lines.filter(line => line.includes('TRACK') && line.includes('AUDIO'));
      const titleLines = lines.filter(line => line.includes('TITLE') && line.startsWith('\t\t\t'));

      expect(trackLines.length).toBeGreaterThan(0);
      expect(titleLines.length).toBeGreaterThan(0);

      // Check that track lines use tab indentation
      trackLines.forEach(line => {
        expect(line.startsWith('\t\t')).toBe(true);
      });

      // Check that track content uses triple tab indentation
      titleLines.forEach(line => {
        expect(line.startsWith('\t\t\t')).toBe(true);
      });
    });
  });

  describe('Round-trip testing', () => {
    it('should preserve data through parse -> serialize -> parse cycle', () => {
      const originalSerialized = serializeCueSheet(sampleCueSheet);
      const reparsedResult = parseCueSheet(originalSerialized);

      expect(reparsedResult.errors).toHaveLength(0);
      expect(reparsedResult.cueSheet).toBeDefined();

      const reparsed = reparsedResult.cueSheet!;
      expect(reparsed.global.title).toBe(sampleCueSheet.global.title);
      expect(reparsed.global.performer).toBe(sampleCueSheet.global.performer);
      expect(reparsed.tracks).toHaveLength(sampleCueSheet.tracks.length);

      // Check first track details
      const reparsedFirstTrack = reparsed.tracks[0]!;
      const originalFirstTrack = sampleCueSheet.tracks[0]!;
      expect(reparsedFirstTrack).toBeDefined();
      expect(originalFirstTrack).toBeDefined();
      expect(reparsedFirstTrack.number).toBe(originalFirstTrack.number);
      expect(reparsedFirstTrack.title).toBe(originalFirstTrack.title);
      expect(reparsedFirstTrack.mode).toBe(originalFirstTrack.mode);
    });

    it('should handle complex files with many tracks', () => {
      const samplePath = join(__dirname, '../examples/sample.cue');
      const content = readFileSync(samplePath, 'utf-8');
      const parseResult = parseCueSheet(content);

      expect(parseResult.cueSheet).toBeDefined();

      const serialized = serializeCueSheet(parseResult.cueSheet!);
      const reparsedResult = parseCueSheet(serialized);

      expect(reparsedResult.errors).toHaveLength(0);
      expect(reparsedResult.cueSheet).toBeDefined();

      const original = parseResult.cueSheet!;
      const reparsed = reparsedResult.cueSheet!;

      expect(reparsed.tracks).toHaveLength(original.tracks.length);
      expect(reparsed.global.title).toBe(original.global.title);
    });
  });

  describe('Edge cases', () => {
    it('should handle tracks without FILE fields', () => {
      const cueContent = `
TITLE "No Files Album"
TRACK 01 AUDIO
  TITLE "Track Without File"
  INDEX 01 00:00:00
      `;

      const result = parseCueSheet(cueContent);
      const serialized = serializeCueSheet(result.cueSheet!);

      expect(serialized).toContain('\t\tTRACK 01 AUDIO');
      expect(serialized).toContain('\t\t\tTITLE "Track Without File"');
      expect(serialized).not.toContain('FILE');
    });

    it('should escape special characters in strings', () => {
      const cueContent = `
TITLE "Album with "quotes" and symbols"
TRACK 01 AUDIO
  TITLE "Track with "nested quotes""
  INDEX 01 00:00:00
      `;

      const result = parseCueSheet(cueContent);
      const serialized = serializeCueSheet(result.cueSheet!);

      // Should properly escape quotes
      expect(serialized).toContain('TITLE "Album with ""quotes"" and symbols"');
      expect(serialized).toContain('TITLE "Track with ""nested quotes"""');
    });

    it('should handle empty CUE sheet', () => {
      const emptyCueSheet = {
        global: {},
        tracks: []
      };

      const serialized = serializeCueSheet(emptyCueSheet);
      expect(serialized).toBe('\n');
    });
  });
});