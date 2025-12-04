# Settings Directory

Runtime configuration files for GraphEngine. These define system behavior and are loaded at startup.

## Files

### ontology-rules.json
Single source of truth for the GraphEngine ontology and validation rules:
- **10 Node Types**: SYS, UC, ACTOR, FCHAIN, FUNC, FLOW, REQ, TEST, MOD, SCHEMA
- **6 Edge Types**: compose, io, satisfy, verify, allocate, relation
- **Nesting Rules**: Which edges create hierarchy (compose, satisfy, allocate)
- **Valid Connections**: Which node types can connect via which edge types
- **Visual Styles**: Colors (hex, ANSI) and rendering hints
- **Validation Rules**: Integrity rules, heuristic rules, similarity detection
- **Decision Trees**: Automated decision support for agent workflows

Used by:
- TypeScript types (`src/shared/types/ontology.ts`) - imports from this file
- LLM prompts - ontology context for AI
- Validation - edge connection rules and architecture validation
- Terminal UI - node colors (ANSI codes)
- Architecture optimizer - rule weights and thresholds

## Usage

```typescript
import ontology from '../../settings/ontology-rules.json' assert { type: 'json' };

// Get node type color
const color = ontology.nodeTypes.FUNC.ansiColor; // "32" (green)

// Check if edge creates nesting
const isNesting = ontology.edgeTypes.compose.isNesting; // true

// Validate connection
const validConnections = ontology.edgeTypes.io.validConnections;
```

## Adding New Settings

Future configuration files for this directory:
- `views.json` - View configurations (currently in `docs/specs/views/`)
- `llm.json` - LLM model settings, temperature, prompts
