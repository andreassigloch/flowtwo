# CR-016: Import/Export System Graphs

**Type:** Feature
**Status:** Completed ✅
**Priority:** MEDIUM
**Target Phase:** Phase 3
**Created:** 2025-11-20
**Completed:** 2025-11-20
**Author:** andreas@siglochconsulting

## Problem / Use Case

Users need to:
- Export system graphs for backup and version control
- Share system designs with team members
- Import graphs from external sources
- Migrate systems between workspaces

**Requirements from implan.md:**
- File-based export in Format E (.txt files)
- Universal editor compatibility (plain text)
- Metadata headers (timestamp, system ID, stats)
- Import with validation
- Configurable export directory

## Solution Implemented

### Export Function

**File:** [src/shared/parsers/import-export.ts](../../src/shared/parsers/import-export.ts)

```typescript
export async function exportSystem(
  graphState: GraphState,
  filename?: string
): Promise<string>
```

**Features:**
- Exports to `./exports/` directory (configurable via `IMPORT_EXPORT_DIR`)
- Auto-generates filename with timestamp if not provided
- Adds metadata header with system info
- Returns absolute path to exported file

**Header Format:**
```
# GraphEngine System Export
# Generated: 2025-11-20T13:45:23.123Z
# System ID: UrbanMobility.SY.001
# Workspace ID: demo-workspace
# Nodes: 77
# Edges: 2
#
# Format: Format E (Token-Efficient Serialization)
# File Extension: .txt (universal editor compatibility)
#

[Format E content...]
```

### Import Function

```typescript
export async function importSystem(
  filename: string
): Promise<GraphState>
```

**Features:**
- Supports relative filenames (searches in exports directory)
- Supports absolute paths
- Strips metadata header lines (starting with #)
- Uses FormatEParser for deserialization
- Returns GraphState ready for canvas loading

**Usage Example:**
```typescript
// Export
const filePath = await exportSystem(graphCanvas.getState(), 'urban-mobility.txt');
console.log(`Exported to ${filePath}`);

// Import
const graphState = await importSystem('urban-mobility.txt');
await graphCanvas.loadGraph(graphState);
console.log(`Loaded ${graphState.nodes.size} nodes`);
```

### List Exports Function

```typescript
export async function listExports(): Promise<string[]>
```

Lists all .txt files in the exports directory.

## Testing

**Unit Tests:** [tests/unit/import-export.test.ts](../../tests/unit/import-export.test.ts)

Tests cover:
- ✅ Export creates file with correct Format E content
- ✅ Import parses exported file correctly
- ✅ Round-trip (export → import) preserves graph structure
- ✅ Metadata header added correctly
- ✅ Metadata header stripped on import
- ✅ Export directory auto-created
- ✅ List exports returns .txt files only

**Test Results:**
```
✓ Export creates file with Format E content (5ms)
✓ Import parses exported file correctly (3ms)
✓ Round-trip preserves graph structure (8ms)
✓ Metadata header added (2ms)
✓ Header stripped on import (3ms)
✓ Export directory created (2ms)
✓ List exports works (4ms)

Tests: 7 passed, 7 total
```

## Configuration

**Environment Variables:**
```bash
# Export/Import directory (default: ./exports)
IMPORT_EXPORT_DIR=./exports

# Default export filename (default: system-export-{timestamp}.txt)
DEFAULT_EXPORT_FILENAME=system-export.txt
```

**Config File:** [src/shared/config.ts](../../src/shared/config.ts)
```typescript
export const IMPORT_EXPORT_DIR = process.env.IMPORT_EXPORT_DIR || './exports';
export const DEFAULT_EXPORT_FILENAME = process.env.DEFAULT_EXPORT_FILENAME || 'system-export.txt';
```

## Integration

**Import/export NOT integrated into chat commands yet.**

To use:
```typescript
import { exportSystem, importSystem, listExports } from '../shared/parsers/import-export.js';

// In chat-interface.ts, add commands:
// /export [filename] - Export current graph
// /import <filename> - Import graph from file
// /list-exports - List available export files
```

## Acceptance Criteria

- [x] Export function creates .txt files in exports directory
- [x] Import function loads .txt files and returns GraphState
- [x] Metadata header added to exports
- [x] Metadata header stripped on import
- [x] Round-trip (export → import) preserves graph structure
- [x] Export directory auto-created if missing
- [x] List exports function implemented
- [x] Unit tests cover all functions (7 tests passing)
- [x] Configuration via environment variables
- [ ] ⚠️ Not integrated into chat commands yet (manual API usage only)

## Files Changed

- `src/shared/parsers/import-export.ts` - Export/import functions
- `tests/unit/import-export.test.ts` - Unit tests
- `src/shared/config.ts` - Configuration constants
- `.env.example` - Environment variable documentation

## Usage (Manual API)

```typescript
// Export current graph
const filePath = await exportSystem(graphCanvas.getState(), 'backup.txt');

// List available exports
const files = await listExports();
console.log('Available exports:', files);

// Import a graph
const graphState = await importSystem('backup.txt');
await graphCanvas.loadGraph(graphState);
```

## Benefits

**Version Control:**
- Plain text .txt files work with git
- Easy to diff changes
- Universal editor compatibility

**Backup & Recovery:**
- Export before major changes
- Quick rollback via import
- Automated backup scripts possible

**Collaboration:**
- Share system designs via files
- Review exported graphs offline
- Merge graphs from multiple sources

**Portability:**
- Move systems between workspaces
- Migrate to new installations
- Archive completed projects

## Next Steps (Optional)

**Future Enhancements:**
1. Add `/export` and `/import` chat commands
2. Auto-export on significant changes
3. Compression for large graphs (.txt.gz)
4. Cloud storage integration (S3, GCS)
5. Version history (keep last N exports)
6. Import validation with error messages

## References

- Format E Specification: `docs/specs/format-e.md`
- FormatEParser: `src/shared/parsers/format-e-parser.ts`
- GraphState Type: `src/shared/types/ontology.ts`

## Notes

- Export files are plain text (.txt) for universal compatibility
- Format E is token-efficient (optimized for LLM context)
- Metadata is human-readable but machine-parseable
- Import strips all lines starting with # (comments/metadata)
- Supports both relative and absolute file paths
