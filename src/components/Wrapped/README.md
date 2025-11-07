# Bluesky Wrapped

A Spotify Wrapped-style feature for Bluesky/AT Protocol that provides users with an overview of their activity and statistics.

## Features

- **Public View**: Basic stats visible to anyone at `/wrapped/:username`
- **Authenticated View**: Full detailed stats with year-over-year comparisons for logged-in users viewing their own profile
- **CAR File Parsing**: Uses `com.atproto.sync.getRepo` to fetch entire repository as a CAR file for efficient analysis
- **Caching**: 30-minute cache to avoid re-parsing large repositories
- **Year-over-Year Analysis**: Compare activity across different years
- **Fun Facts**: Personalized insights about posting habits and patterns

## Routes

- `/wrapped` - Redirects to authenticated user's wrapped or login page
- `/wrapped/:username` - Public wrapped view for any user (handle or DID)
- `/wrapped-test` - Test environment for CAR parsing and analysis

## Components

### Wrapped.js
Main component that handles routing logic, data fetching, and determines which view to show.

### WrappedPublic.js
Public view showing:
- Basic year stats
- Top 3 posts
- Posting patterns
- Sign-in CTA for full access

### WrappedAuthenticated.js
Full authenticated view showing:
- All-time and year-specific stats
- Year-over-year comparisons
- Detailed posting patterns
- Content breakdown
- Social activity
- Timeline of activity
- Share functionality

## Utilities

### carParser.js
Handles CAR file operations:
- Fetching CAR files from PDS
- Parsing CAR format using `@ipld/car`
- Decoding CBOR blocks using `@ipld/dag-cbor`
- Extracting and categorizing records
- Caching parsed data

### wrappedAnalyzer.js
Analyzes parsed repo data:
- Overall statistics
- Year-by-year breakdown
- Posting patterns (time of day, day of week, month)
- Top content analysis
- Social activity metrics
- Growth calculations
- Fun facts generation

## Dependencies

- `@ipld/car` - CAR file parsing
- `@ipld/dag-cbor` - CBOR decoding
- `multiformats` - CID handling

## Usage

```javascript
// Navigate to your own wrapped
navigate('/wrapped');

// Navigate to someone else's wrapped
navigate('/wrapped/dame.bsky.social');

// Clear cache for a user
import { clearRepoCache } from '../../utils/carParser';
clearRepoCache('did:plc:...');
```

## Performance

- CAR files are cached for 30 minutes
- Large accounts may take 10-30 seconds to process initially
- Subsequent loads use cached data for instant results

## Error Handling

Comprehensive error handling for:
- Invalid handles/DIDs
- Private/restricted accounts
- Missing data
- Network timeouts
- Parsing errors

