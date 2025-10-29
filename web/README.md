# CUE Parser Web UI

A modern web interface for parsing and validating CUE sheet files, built with Next.js 14 and App Router with SSG (Static Site Generation).

## Features

- 🎵 **Complete CUE Sheet Parsing** - Full support for CUE sheet specification
- 📋 **Interactive UI** - Clean, responsive interface for testing CUE files
- ✅ **Validation & Errors** - Comprehensive error checking and warning messages
- 📝 **Multiple Output Formats** - View parsed data, serialized CUE, or JSON
- 🚀 **Static Site Generation** - Fast loading with pre-generated static files
- 💎 **rekordbox Compatible** - Tab-indented output for DJ software compatibility
- ⏱️ **MSF Time Support** - Accurate MM:SS:FF time format handling
- 🎯 **CD-TEXT Support** - Full metadata support including ISRC, flags, etc.

## Technology Stack

- **Next.js 14** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **SSG (Static Site Generation)** for optimal performance
- **Client-side CUE parsing** - No server required

## Development

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production (SSG)
npm run build

# The static files will be generated in the 'out' directory
```

### Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` to see the application.

### Static Build (SSG)

```bash
npm run build
```

The static files will be generated in the `out/` directory and can be served by any static file server.

## Usage

1. **Input CUE Content**: Paste or type your CUE sheet content in the text area
2. **Load Sample**: Use the "Load Sample" button to see an example CUE file
3. **Parse**: Click "Parse CUE Sheet" to analyze the content
4. **View Results**: Switch between different output formats:
   - **Parsed Data**: Visual representation with track information
   - **Serialized CUE**: Clean CUE format output
   - **JSON Output**: Raw parsed data structure

## CUE Sheet Support

### Supported Features

- Global metadata (TITLE, PERFORMER, SONGWRITER, etc.)
- CATALOG numbers with validation
- Multiple tracks with individual metadata
- INDEX points (00, 01, 02, etc.)
- PREGAP and POSTGAP timing
- FLAGS (PRE, DCP, 4CH, SCMS)
- ISRC codes
- FILE associations per track
- REM comments and remarks
- CD-TEXT fields

### Supported Audio Formats

- WAVE
- MP3
- AIFF
- FLAC
- Binary formats (MODE1/2048, MODE2/2352, etc.)
- CDG (CD+Graphics)

### rekordbox Compatibility

The parser generates tab-indented CUE files that are fully compatible with rekordbox and other professional DJ software.

## File Structure

```
web/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout component
│   ├── page.tsx           # Home page
│   └── globals.css        # Global styles
├── components/
│   └── CueParser.tsx      # Main parser component
├── lib/
│   ├── types.ts           # TypeScript type definitions
│   └── cue-parser.ts      # CUE parser implementation
├── next.config.js         # Next.js configuration (SSG)
├── tailwind.config.js     # Tailwind CSS configuration
└── package.json           # Dependencies and scripts
```

## Deployment

The application is built as a static site and can be deployed to any static hosting service:

- **Vercel**: `vercel --prod`
- **Netlify**: Upload the `out/` directory
- **GitHub Pages**: Use the `out/` directory contents
- **S3/CloudFront**: Upload static files to S3

## License

This project is part of the CUE Parser library. Please refer to the main project for licensing information.

## Related

- [CUE Parser Library](../README.md) - The core TypeScript library
- [CUE Sheet Specification](https://wyday.com/cuesharp/specification.php) - Reference specification