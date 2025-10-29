# CUE Parser

A TypeScript library for parsing CUE sheet files according to the [CUE Sheet specification](https://wyday.com/cuesharp/specification.php).

## Features

- 🎵 Complete CUE sheet parsing support
- 📝 TypeScript type definitions
- ⏱️ MSF (Minutes:Seconds:Frames) time format utilities
- 🚨 Comprehensive error handling and validation
- 📊 Detailed parse results with errors and warnings
- 🎯 Support for all standard CUE sheet commands

## Installation

```bash
npm install cue-parser
```

## CLI Usage

After installation, you can use the `cue-parser` command directly:

```bash
# Parse and display a CUE file
cue-parser album.cue

# Output as JSON
cue-parser album.cue --json

# Output as CUE sheet format
cue-parser album.cue --cue

# Output minimal CUE sheet
cue-parser album.cue --cue --minimal

# Validate only (no output)
cue-parser album.cue --validate

# Show parsing statistics
cue-parser album.cue --stats

# Quiet mode (errors only)
cue-parser album.cue --quiet

# Show help
cue-parser --help

# Show version
cue-parser --version
```

### CLI Options

- `-h, --help` - Show help message
- `-v, --version` - Show version
- `-j, --json` - Output as JSON
- `-c, --cue` - Output as CUE sheet format
- `--minimal` - Output minimal CUE sheet (use with --cue)
- `-q, --quiet` - Only show errors
- `--validate` - Only validate, don't output parsed content
- `--stats` - Show parsing statistics

### CLI Examples

**Basic parsing:**
```bash
$ cue-parser album.cue

📀 CUE Sheet Information
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Title:     My Album
Artist:    My Artist
Catalog:   1234567890123

🎵 Tracks (3)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[01] Track One
     Mode: AUDIO
     File: audio.wav (WAVE)
     Indexes:
       01: 00:00:00 (0.00s)
```

**JSON output:**
```bash
$ cue-parser album.cue --json
{
  "global": {
    "title": "My Album",
    "performer": "My Artist"
  },
  "tracks": [...]
}
```

**CUE format output:**
```bash
$ cue-parser album.cue --cue
TITLE "My Album"
PERFORMER "My Artist"

FILE "audio.wav" WAVE
  TRACK 01 AUDIO
    TITLE "Track One"
    INDEX 01 00:00:00
```

**Minimal CUE format:**
```bash
$ cue-parser album.cue --cue --minimal
TITLE "My Album"
PERFORMER "My Artist"
FILE "audio.wav" WAVE
  TRACK 01 AUDIO
    TITLE "Track One"
    INDEX 01 00:00:00
```

**Validation with statistics:**
```bash
$ cue-parser album.cue --validate --stats

✅ Validation successful

📊 Parsing Statistics
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Successfully parsed
   Tracks: 3
   Indexes: 5
   Files referenced: 2
```

## Library Usage

### Basic Parsing

```typescript
import { parseCueSheet } from 'cue-parser';

const cueContent = `
TITLE "Example Album"
PERFORMER "Example Artist"
FILE "audio.wav" WAVE
  TRACK 01 AUDIO
    TITLE "Track 1"
    INDEX 01 00:00:00
`;

const result = parseCueSheet(cueContent);

if (result.cueSheet) {
  console.log(result.cueSheet.global.title); // "Example Album"
  console.log(result.cueSheet.tracks[0].title); // "Track 1"
} else {
  console.error('Parse errors:', result.errors);
}
```

### Using the Parser Class

```typescript
import { CueParser } from 'cue-parser';

const parser = new CueParser();
const result = parser.parse(cueContent);

// Check for errors and warnings
if (result.errors.length > 0) {
  result.errors.forEach(error => {
    console.error(`Line ${error.line}: ${error.message}`);
  });
}

if (result.warnings.length > 0) {
  result.warnings.forEach(warning => {
    console.warn(`Line ${warning.line}: ${warning.message}`);
  });
}
```

### Working with MSF Time Format

```typescript
import { parseMSFTime, formatMSFTime, msfToSeconds } from 'cue-parser';

// Parse MSF time string
const time = parseMSFTime('1:30:45'); // { minutes: 1, seconds: 30, frames: 45 }

// Format MSF time back to string
const timeStr = formatMSFTime(time); // "01:30:45"

// Convert to seconds
const totalSeconds = msfToSeconds(time); // 90.6 seconds
```

### Serializing CUE Sheets

```typescript
import { parseCueSheet, serializeCueSheet, formatCueSheet, createMinimalCueSheet } from 'cue-parser';

const result = parseCueSheet(cueContent);

if (result.cueSheet) {
  // Basic serialization
  const cueString = serializeCueSheet(result.cueSheet);

  // Formatted with spacing
  const formatted = formatCueSheet(result.cueSheet, { trackSpacing: true });

  // Minimal version (essential fields only)
  const minimal = createMinimalCueSheet(result.cueSheet);

  console.log(cueString);
}
```

## Supported CUE Sheet Commands

### Global Commands
- `CATALOG` - Sets the catalog number of the CD
- `CDTEXTFILE` - Sets an external file for CD-TEXT data
- `TITLE` - Title of the album
- `PERFORMER` - Name(s) of the performer(s)
- `SONGWRITER` - Name(s) of the songwriter(s)
- `COMPOSER` - Name(s) of the composer(s)
- `ARRANGER` - Name(s) of the arranger(s)
- `MESSAGE` - Message from the content provider and/or artist
- `DISC_ID` - Disc identification information
- `GENRE` - Genre identification
- `UPC_EAN` - UPC/EAN code of the album
- `REM` - Comment lines

### Track Commands
- `FILE` - Sets a new input file
- `TRACK` - Starts a new track
- `INDEX` - Sets a track index
- `PREGAP` - Sets track pregap
- `POSTGAP` - Sets track postgap
- `FLAGS` - Sets track flags (PRE, DCP, 4CH, SCMS)
- `ISRC` - Sets track ISRC number
- `TITLE` - Track title
- `PERFORMER` - Track performer
- `SONGWRITER` - Track songwriter
- `COMPOSER` - Track composer
- `ARRANGER` - Track arranger
- `MESSAGE` - Track message

## Supported File Formats

- `BINARY`
- `MOTOROLA`
- `AIFF`
- `WAVE`
- `MP3`

## Supported Track Modes

- `AUDIO`
- `CDG`
- `MODE1/2048`
- `MODE1/2352`
- `MODE2/2336`
- `MODE2/2352`
- `CDI/2336`
- `CDI/2352`

## API Reference

### Types

#### `CueSheet`
The main interface representing a parsed CUE sheet.

```typescript
interface CueSheet {
  global: CueGlobal;
  tracks: Track[];
}
```

#### `ParseResult`
The result of parsing a CUE sheet.

```typescript
interface ParseResult {
  cueSheet?: CueSheet;
  errors: ParseError[];
  warnings: ParseError[];
}
```

#### `MSFTime`
Represents time in Minutes:Seconds:Frames format.

```typescript
interface MSFTime {
  minutes: number;
  seconds: number;
  frames: number; // 0-74 (1/75 of a second)
}
```

### Functions

#### `parseCueSheet(content: string): ParseResult`
Parses a CUE sheet from string content.

#### `parseMSFTime(timeString: string): MSFTime`
Parses an MSF time string (e.g., "1:30:45") into an MSFTime object.

#### `formatMSFTime(time: MSFTime, zeroPad?: boolean): string`
Formats an MSFTime object back to string format.

#### `msfToSeconds(time: MSFTime): number`
Converts MSF time to total seconds.

#### `secondsToMSF(seconds: number): MSFTime`
Converts seconds to MSF time format.

#### `serializeCueSheet(cueSheet: CueSheet): string`
Serializes a CueSheet object back to CUE sheet format string.

#### `formatCueSheet(cueSheet: CueSheet, options?: object): string`
Formats a CueSheet with proper indentation and spacing options.

#### `createMinimalCueSheet(cueSheet: CueSheet): string`
Creates a minimal CUE sheet with only essential information.

## Error Handling

The parser provides detailed error information including line numbers and descriptions:

```typescript
const result = parseCueSheet(invalidContent);

if (result.errors.length > 0) {
  result.errors.forEach(error => {
    console.error(`Parse error on line ${error.line}: ${error.message}`);
    console.error(`Raw line: ${error.rawLine}`);
  });
}
```

## Examples

See the `examples/` directory for sample CUE files and usage examples.

## Development

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test

# Watch mode for development
npm run dev
```

## License

ISC

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.