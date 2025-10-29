# CUE Parser Web UI

A modern web interface for parsing and validating CUE sheet files, built with Next.js 14 and App Router with SSG (Static Site Generation).

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

### rekordbox Compatibility

The parser generates tab-indented CUE files that are fully compatible with rekordbox and other professional DJ software.

## License

This project is part of the CUE Parser library. Please refer to the main project for licensing information.

## Related

- [CUE Parser Library](../README.md) - The core TypeScript library
- [CUE Sheet Specification](https://wyday.com/cuesharp/specification.php) - Reference specification