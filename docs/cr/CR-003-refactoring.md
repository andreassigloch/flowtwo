# CR-003: Refactor Oversized Modules

**Status:** Planned
**Priority:** HIGH (Updated 2025-11-26)
**Target Phase:** Phase 3
**Created:** 2025-11-19
**Updated:** 2025-11-26

## Problem

Four modules exceed the 500-line limit mandated by ESLint and code quality standards:

1. **[src/terminal-ui/chat-interface.ts](../../src/terminal-ui/chat-interface.ts)** - 1115 lines (123% over limit) 🔴 CRITICAL
2. **[src/terminal-ui/graph-viewer.ts](../../src/terminal-ui/graph-viewer.ts)** - 1127 lines (125% over limit) 🔴 CRITICAL
3. **[src/shared/parsers/format-e-parser.ts](../../src/shared/parsers/format-e-parser.ts)** - 620 lines (24% over limit) 🟡 MAJOR
4. **[src/neo4j-client/neo4j-client.ts](../../src/neo4j-client/neo4j-client.ts)** - 525 lines (5% over limit) 🟠 WARNING

**Note:** File sizes have grown significantly since initial CR creation. Priority upgraded to HIGH.

Large files are harder to maintain, test, and understand. Breaking them into focused modules improves code quality.

## Refactoring Strategy

### 1. chat-interface.ts (679 lines → <500 lines)

**Current responsibilities:**
- WebSocket connection management
- LLM interaction
- Command handling (/help, /clear, /load, /view, etc.)
- Canvas state management
- Message display
- Input handling

**Proposed split:**

```
src/terminal-ui/
├── chat-interface.ts           (300 lines) - Main interface orchestration
├── chat-commands.ts             (150 lines) - Command handlers
├── chat-llm-integration.ts      (100 lines) - LLM request/response logic
└── chat-websocket-handler.ts    ( 80 lines) - WebSocket event handling
```

**Benefits:**
- Clear separation of concerns
- Easier to test each component
- Command handlers can be added without modifying main file

### 2. format-e-parser.ts (567 lines → <500 lines)

**Current responsibilities:**
- Format E parsing
- Format E serialization
- Diff generation
- Diff application

**Proposed split:**

```
src/shared/parsers/
├── format-e-parser.ts           (200 lines) - Main parser logic
├── format-e-serializer.ts       (150 lines) - Serialization
├── format-e-diff.ts             (150 lines) - Diff generation & application
└── format-e-types.ts            ( 50 lines) - Shared types
```

**Benefits:**
- Parse and serialize logic separated
- Diff logic isolated for testing
- Types centralized

### 3. graph-viewer.ts (540 lines → <500 lines)

**Current responsibilities:**
- Graph rendering
- View switching
- Command handling
- Layout management
- Canvas updates

**Proposed split:**

```
src/terminal-ui/
├── graph-viewer.ts              (300 lines) - Main viewer orchestration
├── graph-renderer.ts            (150 lines) - ASCII rendering logic
└── graph-commands.ts            (100 lines) - Command handlers
```

**Benefits:**
- Rendering logic testable in isolation
- Command handlers decoupled
- Easier to add new renderers (e.g., HTML, SVG)

### 4. neo4j-client.ts (526 lines → <500 lines)

**Current responsibilities:**
- Neo4j connection management
- Query execution
- Graph queries
- Node/edge CRUD operations
- Canvas persistence
- Query builders

**Proposed split:**

```
src/neo4j-client/
├── neo4j-client.ts              (300 lines) - Connection & core queries
├── neo4j-graph-queries.ts       (150 lines) - Graph-specific queries
└── neo4j-canvas-persistence.ts  (100 lines) - Canvas save/load
```

**Benefits:**
- Query builders separated from client
- Canvas persistence isolated
- Easier to mock for testing

## Implementation Plan

### Phase 1: Immediate (fix critical file)
1. **Refactor chat-interface.ts**
   - Extract command handlers to chat-commands.ts
   - Extract LLM logic to chat-llm-integration.ts
   - Extract WebSocket handling to chat-websocket-handler.ts
   - Update imports in dependent files
   - Run tests to verify no regressions

### Phase 2: Major files
2. **Refactor format-e-parser.ts**
   - Split parsing, serialization, and diff logic
   - Update all imports
   - Run format-e-parser tests

3. **Refactor graph-viewer.ts**
   - Extract rendering logic
   - Extract command handlers
   - Run integration tests

### Phase 3: Minor file
4. **Refactor neo4j-client.ts**
   - Extract query builders
   - Extract canvas persistence
   - Run Neo4j integration tests

## Acceptance Criteria

- [ ] All files are ≤500 lines
- [ ] No functionality is lost
- [ ] All existing tests pass
- [ ] New modules have clear, single responsibilities
- [ ] Public APIs remain unchanged (no breaking changes)
- [ ] ESLint `max-lines` rule passes

## Testing Strategy

For each refactoring:
1. Run existing unit tests (must pass)
2. Run integration tests (must pass)
3. Verify no TypeScript compilation errors
4. Manual smoke test of affected functionality

## Dependencies

- None (can be done independently)
- Should be completed before CR-004 (reduces mock complexity)

## Estimated Effort

- chat-interface.ts: 4-6 hours
- format-e-parser.ts: 3-5 hours
- graph-viewer.ts: 3-5 hours
- neo4j-client.ts: 2-4 hours
- **Total: 12-20 hours**

## Risks

- Breaking changes if refactoring is not careful
- Import path changes throughout codebase
- Potential merge conflicts if work is in progress

## Migration Strategy

1. Refactor one file at a time
2. Commit after each successful refactoring
3. Run full test suite between refactorings
4. Update documentation as needed

## Notes

- Use git blame to understand ownership before refactoring
- Keep related functions together in new modules
- Prefer composition over inheritance
- Document new module boundaries clearly
