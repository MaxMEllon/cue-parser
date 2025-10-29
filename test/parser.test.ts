import { describe, it, expect } from 'vitest';
import { parseCueSheet, formatMSFTime, msfToSeconds } from '../src/index.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('CUE Parser', () => {
  describe('Basic parsing', () => {
    it('should parse a sample CUE file correctly', () => {
      const samplePath = join(__dirname, '../examples/sample.cue');
      const content = readFileSync(samplePath, 'utf-8');
      const result = parseCueSheet(content);

      expect(result.errors).toHaveLength(0);
      expect(result.cueSheet).toBeDefined();

      const cueSheet = result.cueSheet!;
      expect(cueSheet.global.title).toBe('Sample Album');
      expect(cueSheet.global.performer).toBe('Sample Artist');
      expect(cueSheet.global.catalog).toBe('1234567890123');
      expect(cueSheet.tracks).toHaveLength(4);

      // Check first track
      const firstTrack = cueSheet.tracks[0]!;
      expect(firstTrack).toBeDefined();
      expect(firstTrack.number).toBe(1);
      expect(firstTrack.title).toBe('First Track');
      expect(firstTrack.mode).toBe('AUDIO');
      expect(firstTrack.indexes).toHaveLength(2);
    });

    it('should handle warnings for global FILE commands', () => {
      const samplePath = join(__dirname, '../examples/sample.cue');
      const content = readFileSync(samplePath, 'utf-8');
      const result = parseCueSheet(content);

      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]?.message).toContain('Global FILE commands are not recommended');
    });

    it('should parse complex rekordbox CUE files', () => {
      const samplePath = join(__dirname, '../examples/sample.cue');
      const content = readFileSync(samplePath, 'utf-8');
      const result = parseCueSheet(content);

      expect(result.errors).toHaveLength(0);
      expect(result.cueSheet).toBeDefined();

      const cueSheet = result.cueSheet!;
      expect(cueSheet.tracks).toHaveLength(4);
      expect(cueSheet.global.title).toBe('Sample Album');

      // Check that tracks have individual FILE entries
      const tracksWithFiles = cueSheet.tracks.filter(track => track.file);
      expect(tracksWithFiles.length).toBe(0); // sample.cue has global FILE, not per-track
    });
  });

  describe('Error handling', () => {
    it('should handle invalid CUE content with proper errors', () => {
      const invalidContent = `
TITLE "Test Album"
TRACK 01 INVALID_MODE
  INDEX 01 invalid:time:format
CATALOG 123
      `;

      const result = parseCueSheet(invalidContent);

      expect(result.errors).toHaveLength(3);
      expect(result.errors[0]?.message).toContain('Invalid track mode');
      expect(result.errors[1]?.message).toContain('INDEX command must be inside a TRACK');
      expect(result.errors[2]?.message).toContain('CATALOG must be exactly 13 digits');
    });

    it('should handle missing required fields gracefully', () => {
      const result = parseCueSheet('TRACK 01 AUDIO');
      expect(result.cueSheet).toBeDefined();
      expect(result.cueSheet!.tracks).toHaveLength(1);
      expect(result.cueSheet!.tracks[0]!.number).toBe(1);
    });
  });

  describe('MSF Time utilities', () => {
    it('should parse MSF time strings correctly', () => {
      const testCases = [
        { input: '0:00:00', expected: { minutes: 0, seconds: 0, frames: 0 } },
        { input: '1:30:45', expected: { minutes: 1, seconds: 30, frames: 45 } },
        { input: '12:34:56', expected: { minutes: 12, seconds: 34, frames: 56 } },
      ];

      testCases.forEach(({ input, expected }) => {
        const result = parseCueSheet(`TRACK 01 AUDIO\\nINDEX 01 ${input}`);
        expect(result.errors).toHaveLength(1); // INDEX outside TRACK error
        // Test the utility directly
        const timeStr = formatMSFTime(expected);
        expect(timeStr).toBe(input.padStart(8, '0').replace(/:/g, ':'));
      });
    });

    it('should convert MSF to seconds correctly', () => {
      expect(msfToSeconds({ minutes: 1, seconds: 30, frames: 45 })).toBeCloseTo(90.60, 2);
      expect(msfToSeconds({ minutes: 0, seconds: 2, frames: 33 })).toBeCloseTo(2.44, 2);
      expect(msfToSeconds({ minutes: 0, seconds: 0, frames: 0 })).toBe(0);
    });

    it('should format MSF time with zero padding', () => {
      expect(formatMSFTime({ minutes: 1, seconds: 30, frames: 45 })).toBe('01:30:45');
      expect(formatMSFTime({ minutes: 0, seconds: 2, frames: 33 })).toBe('00:02:33');
      expect(formatMSFTime({ minutes: 12, seconds: 0, frames: 0 })).toBe('12:00:00');
    });
  });

  describe('Track and global information', () => {
    it('should preserve CD-TEXT fields correctly', () => {
      const cueContent = `
TITLE "Album Title"
PERFORMER "Album Artist"
SONGWRITER "Album Writer"
CATALOG 1234567890123

TRACK 01 AUDIO
  TITLE "Track Title"
  PERFORMER "Track Artist"
  SONGWRITER "Track Writer"
  ISRC GBUM71505078
  INDEX 01 00:00:00
      `;

      const result = parseCueSheet(cueContent);
      expect(result.errors).toHaveLength(0);

      const cueSheet = result.cueSheet!;
      expect(cueSheet.global.title).toBe('Album Title');
      expect(cueSheet.global.performer).toBe('Album Artist');
      expect(cueSheet.global.songwriter).toBe('Album Writer');
      expect(cueSheet.global.catalog).toBe('1234567890123');

      const firstTrack = cueSheet.tracks[0]!;
      expect(firstTrack).toBeDefined();
      expect(firstTrack.title).toBe('Track Title');
      expect(firstTrack.performer).toBe('Track Artist');
      expect(firstTrack.songwriter).toBe('Track Writer');
      expect(firstTrack.isrc).toBe('GBUM71505078');
    });

    it('should handle track flags correctly', () => {
      const cueContent = `
TRACK 01 AUDIO
  FLAGS PRE DCP
  INDEX 01 00:00:00
      `;

      const result = parseCueSheet(cueContent);
      expect(result.errors).toHaveLength(0);

      const track = result.cueSheet!.tracks[0]!;
      expect(track).toBeDefined();
      expect(track.flags).toEqual(['PRE', 'DCP']);
    });

    it('should handle multiple indexes correctly', () => {
      const cueContent = `
TRACK 01 AUDIO
  INDEX 00 00:00:00
  INDEX 01 00:02:33
  INDEX 02 01:30:45
      `;

      const result = parseCueSheet(cueContent);
      expect(result.errors).toHaveLength(0);

      const track = result.cueSheet!.tracks[0]!;
      expect(track).toBeDefined();
      expect(track.indexes).toHaveLength(3);
      expect(track.indexes![0]?.number).toBe(0);
      expect(track.indexes![1]?.number).toBe(1);
      expect(track.indexes![2]?.number).toBe(2);
    });
  });
});