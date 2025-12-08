# CR-033: Git-like Diff/Change Tracking for Graph Canvas

**Type:** Feature
**Status:** Planned
**Priority:** MEDIUM
**Created:** 2025-12-06

## Problem / Use Case

Users modifying graphs have no visual feedback about what changed since their last save. In complex graphs, it's easy to lose track of:
- Which nodes/edges were added
- Which elements were modified
- Which elements were deleted (marked for removal)

This creates uncertainty when deciding whether to save, and makes it hard to review changes before committing them.

## Requirements

### Functional Requirements
- FR-1: Visual indicators showing change status (`+` added, `-` deleted, `~` modified)
- FR-2: Change status computed by comparing current state against baseline (last saved state)
- FR-3: `/commit` command that saves AND resets all change indicators
- FR-4: Clear distinction between `/save` and `/commit` behavior

### Non-Functional Requirements
- NFR-1: Change tracking must not impact canvas rendering performance
- NFR-2: Baseline comparison must handle graphs with 1000+ elements efficiently

## Architecture / Solution Approach

### Git Model Applied to GraphEngine

| Git Concept | GraphEngine Equivalent |
|-------------|------------------------|
| Working Directory | Current canvas state (in-memory AgentDB) |
| HEAD (last commit) | Last saved state in Neo4j |
| `git diff` | Visual `+`/`-`/`~` indicators on canvas |
| `git commit` | `/commit` command |
| `git status` | Summary of pending changes |

### Change Status Derivation

```
ChangeStatus = 'unchanged' | 'added' | 'modified' | 'deleted'
```

Status is **computed on-the-fly**, not stored:
- On session start/load: Capture baseline snapshot from Neo4j
- On any change: Compare current element against baseline
- On `/commit`: Update baseline to current state, clear visual indicators

### Critical Design Decision: `/save` vs `/commit`

**The Problem:**
Currently `/save` persists to Neo4j. If we add `/commit` that also saves, we have two commands doing similar things, creating undefined states:

| Scenario | `/save` only | `/commit` only | Both exist |
|----------|--------------|----------------|------------|
| User saves | ✅ Works | N/A | ❓ Which to use? |
| Change indicators | Not reset | Reset | `/save` doesn't reset = confusing |
| Baseline | Not updated | Updated | `/save` updates Neo4j but not baseline = desync |

**Solution: Replace `/save` with `/commit`**

- `/commit` = save to Neo4j + reset change indicators + update baseline
- `/save` removed (or kept as deprecated alias temporarily)
- Single source of truth, no confusion

### Proactive Commit Prompt

**Chat canvas prompts user to commit when changes exist:**
- After any graph modification, chat shows: `"You have unsaved changes. Use /commit to save."`
- Or subtle status indicator: `[3 changes pending]`
- On `/exit` with pending changes: `"Uncommitted changes. /commit or /exit --force?"`

### Auto-Save Interaction

Current behavior (from canvas-base.ts):
> "No auto-save here. AgentDB is source of truth during session. Persist to Neo4j happens on explicit /save or graceful shutdown."

**Impact on change tracking:**
- Auto-save to Neo4j would constantly update baseline → no visible changes
- Current design (no auto-save) works well with change tracking
- Graceful shutdown should behave like `/commit` (save + reset)

### Baseline Storage

**Where to store baseline:**
- In-memory only (simplest)
- Baseline = deep clone of graph state at last commit
- Lost on page reload (acceptable - like `git checkout .`)

**Alternative (future):** Persist baseline to localStorage for crash recovery of change tracking state.

## Implementation Plan

### Phase 1: Core Change Tracking (4-6 hours)
- Add `ChangeTracker` class with baseline snapshot capability
- Implement diff algorithm comparing current vs baseline
- Derive `ChangeStatus` for each element

### Phase 2: Visual Rendering (3-4 hours)
- Extend canvas renderer to show change indicators
- `+` prefix / green highlight for added
- `-` prefix / red highlight / strikethrough for deleted
- `~` or amber highlight for modified

### Phase 3: Command Integration (2-3 hours)
- Replace `/save` with `/commit`
- On `/commit`: persist + update baseline + clear indicators
- Update help text and documentation

### Phase 4: Proactive Commit Prompt (2-3 hours)
- Chat canvas detects pending changes
- Display prompt after modifications: "You have N unsaved changes. Use /commit to save."
- On `/exit` with changes: prompt for confirmation or `/commit`

### Phase 5: Status Summary (1-2 hours)
- Add `/status` command showing change summary
- "3 added, 1 modified, 2 deleted"

## Acceptance Criteria

- [ ] Added elements show `+` indicator
- [ ] Deleted elements show `-` indicator (before actual removal)
- [ ] Modified elements show `~` indicator
- [ ] `/commit` saves to Neo4j and clears all indicators
- [ ] `/save` removed (or deprecated alias)
- [ ] Chat prompts user to `/commit` when changes exist
- [ ] `/exit` with pending changes prompts for confirmation
- [ ] `/status` shows change summary
- [ ] Reload clears change tracking (expected behavior)
- [ ] No performance regression on large graphs

## Dependencies

- Existing canvas rendering system
- Neo4j persistence layer
- AgentDB in-memory state

## Estimated Effort

Total: 12-18 hours (2-3 days)

## Open Questions

1. Should `/status` be a new command or integrate into existing `/stats`?
2. Should we show change count in status bar permanently?
3. How to handle element property changes vs structural changes?

## References

- Current save logic: [chat-interface.ts:1491](../../src/terminal-ui/chat-interface.ts#L1491)
- Canvas base: [canvas-base.ts](../../src/canvas/canvas-base.ts)
