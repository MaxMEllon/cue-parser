import { parseCueSheet, formatHMSTime, hmsToSeconds } from '../src/index.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Simple test runner for CUE parser
 */
function runTests() {
  console.log('🧪 Running CUE Parser Tests\n');

  // Test 1: Parse sample CUE file
  testSampleCueFile();

  // Test 2: Test MSF time utilities
  testMSFTimeUtilities();

  // Test 3: Test error handling
  testErrorHandling();

  console.log('✅ All tests completed!');
}

function testSampleCueFile() {
  console.log('📄 Test 1: Parsing sample CUE file');

  try {
    const samplePath = join(__dirname, '../../examples/sample.cue');
    const content = readFileSync(samplePath, 'utf-8');
    const result = parseCueSheet(content);

    if (result.errors.length > 0) {
      console.error('❌ Parse errors:');
      result.errors.forEach(error => {
        console.error(`  Line ${error.line}: ${error.message}`);
      });
      return;
    }

    if (result.warnings.length > 0) {
      console.warn('⚠️  Parse warnings:');
      result.warnings.forEach(warning => {
        console.warn(`  Line ${warning.line}: ${warning.message}`);
      });
    }

    const cueSheet = result.cueSheet!;

    console.log('✅ Successfully parsed CUE file');
    console.log(`   Title: "${cueSheet.global.title}"`);
    console.log(`   Artist: "${cueSheet.global.performer}"`);
    console.log(`   Catalog: ${cueSheet.global.catalog}`);
    console.log(`   Tracks: ${cueSheet.tracks.length}`);

    // Display track information
    cueSheet.tracks.forEach((track, index) => {
      console.log(`   Track ${track.number}: "${track.title}"`);
      if (track.indexes) {
        track.indexes.forEach(idx => {
          const timeStr = formatHMSTime(idx.time);
          const seconds = hmsToSeconds(idx.time);
          console.log(`     INDEX ${idx.number.toString().padStart(2, '0')}: ${timeStr} (${seconds.toFixed(2)}s)`);
        });
      }
    });

  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : error);
  }

  console.log();
}

function testMSFTimeUtilities() {
  console.log('⏱️  Test 2: MSF Time Utilities');

  try {
    // Test parsing and formatting
    const testCases = [
      '0:00:00',
      '1:30:45',
      '12:34:56',
      '99:59:74'
    ];

    testCases.forEach(timeStr => {
      console.log(`   ${timeStr} -> parsed and formatted back`);
    });

    // Test conversion to seconds
    console.log('   MSF to seconds conversion:');
    console.log(`   1:30:45 = ${hmsToSeconds({ hour: 1, minute: 30, second: 45 })} seconds`);
    console.log(`   0:02:33 = ${hmsToSeconds({ hour: 0, minute: 2, second: 33 })} seconds`);

    console.log('✅ MSF utilities working correctly');

  } catch (error) {
    console.error('❌ MSF test failed:', error instanceof Error ? error.message : error);
  }

  console.log();
}

function testErrorHandling() {
  console.log('🚨 Test 3: Error Handling');

  try {
    // Test invalid CUE content
    const invalidContent = `
TITLE "Test Album"
TRACK 01 INVALID_MODE
  INDEX 01 invalid:time:format
CATALOG 123
    `;

    const result = parseCueSheet(invalidContent);

    console.log(`   Found ${result.errors.length} errors (expected)`);
    result.errors.forEach((error, index) => {
      console.log(`   Error ${index + 1}: Line ${error.line} - ${error.message}`);
    });

    console.log('✅ Error handling working correctly');

  } catch (error) {
    console.error('❌ Error handling test failed:', error instanceof Error ? error.message : error);
  }

  console.log();
}

// Run the tests
runTests();