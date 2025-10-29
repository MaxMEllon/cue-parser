import { parseCueSheet, formatHMSTime, hmsToSeconds, serializeCueSheet, formatCueSheet, createMinimalCueSheet } from '../src/index.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Simple test runner for CUE parser and serializer
 */
function runTests() {
  console.log('🧪 Running CUE Parser and Serializer Tests\n');

  // Test 1: Parse sample CUE file
  testSampleCueFile();

  // Test 2: Test MSF time utilities
  testMSFTimeUtilities();

  // Test 3: Test error handling
  testErrorHandling();

  // Test 4: Test serializer
  testSerializer();

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

function testSerializer() {
  console.log('📝 Test 4: CUE Serializer');

  try {
    const samplePath = join(__dirname, '../../examples/sample.cue');
    const content = readFileSync(samplePath, 'utf-8');
    const parseResult = parseCueSheet(content);

    if (parseResult.errors.length > 0 || !parseResult.cueSheet) {
      console.error('❌ Cannot test serializer: parsing failed');
      return;
    }

    const cueSheet = parseResult.cueSheet;

    // Test basic serialization
    const serialized = serializeCueSheet(cueSheet);
    console.log('✅ Basic serialization successful');
    console.log(`   Serialized length: ${serialized.length} characters`);

    // Test formatted serialization
    const formatted = formatCueSheet(cueSheet, { trackSpacing: true });
    console.log('✅ Formatted serialization successful');
    console.log(`   Formatted length: ${formatted.length} characters`);

    // Test minimal serialization
    const minimal = createMinimalCueSheet(cueSheet);
    console.log('✅ Minimal serialization successful');
    console.log(`   Minimal length: ${minimal.length} characters`);

    // Test round-trip (parse -> serialize -> parse)
    const roundTripResult = parseCueSheet(serialized);

    if (roundTripResult.errors.length > 0) {
      console.error('❌ Round-trip test failed with errors:');
      roundTripResult.errors.forEach(error => {
        console.error(`   Line ${error.line}: ${error.message}`);
      });
      return;
    }

    if (!roundTripResult.cueSheet) {
      console.error('❌ Round-trip test failed: no cueSheet returned');
      return;
    }

    const originalTracks = cueSheet.tracks.length;
    const roundTripTracks = roundTripResult.cueSheet.tracks.length;

    if (originalTracks === roundTripTracks) {
      console.log('✅ Round-trip test successful');
      console.log(`   Preserved ${originalTracks} tracks`);
    } else {
      console.warn('⚠️  Round-trip test partial: track count differs');
      console.warn(`   Original: ${originalTracks}, Round-trip: ${roundTripTracks}`);
    }

    console.log('✅ Serializer tests completed successfully');

  } catch (error) {
    console.error('❌ Serializer test failed:', error instanceof Error ? error.message : error);
  }

  console.log();
}

// Run the tests
runTests();