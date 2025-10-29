#!/usr/bin/env node

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { parseCueSheet, formatHMSTime, hmsToSeconds, serializeCueSheet, formatCueSheet, createMinimalCueSheet, serializeYouTubeTimeline } from '../dist/src/index.js';

/**
 * CUE Parser CLI
 */

function showHelp() {
  console.log(`
CUE Parser CLI

Usage:
  cue-parser <file.cue> [options]

Options:
  -h, --help       Show this help message
  -v, --version    Show version
  -j, --json       Output as JSON
  -c, --cue        Output as CUE sheet format
  --minimal        Output minimal CUE sheet (with --cue)
  -q, --quiet      Only show errors
  --validate       Only validate, don't output parsed content
  --stats          Show parsing statistics
  --youtube        Output YouTube timeline format

Examples:
  cue-parser album.cue
  cue-parser album.cue --json
  cue-parser album.cue --cue
  cue-parser album.cue --cue --minimal
  cue-parser album.cue --validate
  cue-parser album.cue --stats
  cue-parser album.cue --youtube
`);
}

function showVersion() {
  try {
    const packageJson = JSON.parse(readFileSync(resolve(new URL(import.meta.url).pathname, '../../package.json'), 'utf-8'));
    console.log(`cue-parser v${packageJson.version}`);
  } catch (error) {
    console.log('cue-parser (version unknown)');
  }
}

function formatTime(time) {
  if (!time) return 'N/A';
  const timeStr = formatHMSTime(time);
  const seconds = msfToSeconds(time);
  return `${timeStr} (${seconds.toFixed(2)}s)`;
}

function displayYouTubeTimeline(cueSheet) {
  console.log(serializeYouTubeTimeline(cueSheet));
}function displayCueSheet(cueSheet, options = {}) {
  if (options.json) {
    console.log(JSON.stringify(cueSheet, null, 2));
    return;
  }

  if (options.youtube) {
    displayYouTubeTimeline(cueSheet);
    return;
  }

  if (options.cue) {
    if (options.minimal) {
      console.log(createMinimalCueSheet(cueSheet));
    } else {
      console.log(formatCueSheet(cueSheet, { trackSpacing: true }));
    }
    return;
  }

  // Display global information
  console.log('📀 CUE Sheet Information');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const global = cueSheet.global;
  if (global.title) console.log(`Title:     ${global.title}`);
  if (global.performer) console.log(`Artist:    ${global.performer}`);
  if (global.songwriter) console.log(`Songwriter: ${global.songwriter}`);
  if (global.composer) console.log(`Composer:  ${global.composer}`);
  if (global.arranger) console.log(`Arranger:  ${global.arranger}`);
  if (global.catalog) console.log(`Catalog:   ${global.catalog}`);
  if (global.cdTextFile) console.log(`CD-TEXT:   ${global.cdTextFile}`);
  if (global.genre) console.log(`Genre:     ${global.genre}`);
  if (global.upcEan) console.log(`UPC/EAN:   ${global.upcEan}`);
  if (global.message) console.log(`Message:   ${global.message}`);

  console.log(`\n🎵 Tracks (${cueSheet.tracks.length})`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  cueSheet.tracks.forEach((track, index) => {
    console.log(`\n[${track.number.toString().padStart(2, '0')}] ${track.title || 'Untitled'}`);
    console.log(`     Mode: ${track.mode}`);

    if (track.performer && track.performer !== global.performer) {
      console.log(`     Artist: ${track.performer}`);
    }
    if (track.songwriter) console.log(`     Songwriter: ${track.songwriter}`);
    if (track.composer) console.log(`     Composer: ${track.composer}`);
    if (track.arranger) console.log(`     Arranger: ${track.arranger}`);
    if (track.isrc) console.log(`     ISRC: ${track.isrc}`);
    if (track.message) console.log(`     Message: ${track.message}`);

    if (track.file) {
      console.log(`     File: ${track.file.filename}${track.file.format ? ` (${track.file.format})` : ''}`);
    }

    if (track.flags && track.flags.length > 0) {
      console.log(`     Flags: ${track.flags.join(', ')}`);
    }

    if (track.pregap) {
      console.log(`     Pregap: ${formatTime(track.pregap)}`);
    }

    if (track.indexes && track.indexes.length > 0) {
      console.log('     Indexes:');
      track.indexes.forEach(idx => {
        console.log(`       ${idx.number.toString().padStart(2, '0')}: ${formatTime(idx.time)}`);
      });
    }

    if (track.postgap) {
      console.log(`     Postgap: ${formatTime(track.postgap)}`);
    }
  });
}

function displayStats(result, options = {}) {
  const { cueSheet, errors, warnings } = result;

  console.log('\n📊 Parsing Statistics');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (cueSheet) {
    console.log(`✅ Successfully parsed`);
    console.log(`   Tracks: ${cueSheet.tracks.length}`);

    const totalIndexes = cueSheet.tracks.reduce((sum, track) =>
      sum + (track.indexes ? track.indexes.length : 0), 0);
    console.log(`   Indexes: ${totalIndexes}`);

    const filesUsed = new Set(cueSheet.tracks
      .map(track => track.file?.filename)
      .filter(Boolean));
    console.log(`   Files referenced: ${filesUsed.size}`);

    // Calculate total duration if possible
    const lastTrack = cueSheet.tracks[cueSheet.tracks.length - 1];
    if (lastTrack?.indexes && lastTrack.indexes.length > 0) {
      const lastIndex = lastTrack.indexes[lastTrack.indexes.length - 1];
      if (lastIndex.time) {
        console.log(`   Approximate duration: ${formatTime(lastIndex.time)}`);
      }
    }
  } else {
    console.log(`❌ Parsing failed`);
  }

  if (warnings.length > 0) {
    console.log(`⚠️  Warnings: ${warnings.length}`);
  }

  if (errors.length > 0) {
    console.log(`🚨 Errors: ${errors.length}`);
  }
}

function displayErrors(errors, warnings, options = {}) {
  if (warnings.length > 0 && !options.quiet) {
    console.log('\n⚠️  Warnings:');
    warnings.forEach(warning => {
      console.log(`   Line ${warning.line}: ${warning.message}`);
    });
  }

  if (errors.length > 0) {
    console.log('\n🚨 Errors:');
    errors.forEach(error => {
      console.log(`   Line ${error.line}: ${error.message}`);
      if (!options.quiet && error.rawLine.trim()) {
        console.log(`      → ${error.rawLine.trim()}`);
      }
    });
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help')) {
    showHelp();
    process.exit(0);
  }

  if (args.includes('-v') || args.includes('--version')) {
    showVersion();
    process.exit(0);
  }

  const options = {
    json: args.includes('-j') || args.includes('--json'),
    cue: args.includes('-c') || args.includes('--cue'),
    minimal: args.includes('--minimal'),
    quiet: args.includes('-q') || args.includes('--quiet'),
    validate: args.includes('--validate'),
    stats: args.includes('--stats'),
    youtube: args.includes('--youtube')
  };

  // Find the file path (first non-option argument)
  const filePath = args.find(arg => !arg.startsWith('-'));

  if (!filePath) {
    console.error('❌ Error: No input file specified');
    console.error('Use --help for usage information');
    process.exit(1);
  }

  const resolvedPath = resolve(filePath);

  if (!existsSync(resolvedPath)) {
    console.error(`❌ Error: File not found: ${resolvedPath}`);
    process.exit(1);
  }

  try {
    const content = readFileSync(resolvedPath, 'utf-8');
    const result = parseCueSheet(content);

    // Always show errors
    if (result.errors.length > 0 || result.warnings.length > 0) {
      displayErrors(result.errors, result.warnings, options);
    }

    // Exit with error code if parsing failed
    if (result.errors.length > 0) {
      if (options.validate) {
        console.log('\n❌ Validation failed');
      }
      process.exit(1);
    }

    if (options.validate) {
      console.log('\n✅ Validation successful');
      if (options.stats) {
        displayStats(result, options);
      }
      process.exit(0);
    }

    if (result.cueSheet) {
      if (!options.quiet) {
        displayCueSheet(result.cueSheet, options);
      }

      if (options.stats) {
        displayStats(result, options);
      }
    }

    process.exit(0);

  } catch (error) {
    console.error(`❌ Error reading file: ${error.message}`);
    process.exit(1);
  }
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});

// Run the CLI
main();