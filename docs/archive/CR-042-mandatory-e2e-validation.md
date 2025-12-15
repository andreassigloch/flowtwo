# CR-042: Mandatory E2E Validation Before Completion

**Type:** Process / Quality
**Status:** Done
**Priority:** CRITICAL
**Created:** 2025-12-10
**Completed:** 2025-12-11
**Author:** andreas@siglochconsulting

## Problem Statement

Tasks are marked "complete" without running the application or E2E tests. This violates project rules and leads to:

1. **Broken features shipped** - Code compiles but doesn't work
2. **Integration failures** - Unit tests pass, system fails
3. **Manual verification burden** - User must always ask "did you test it?"
4. **Regression blindness** - Existing features break unnoticed

### Current E2E Test Analysis

| Test File | Approach | Problem |
|-----------|----------|---------|
| `app-e2e.test.ts` | ✅ Real processes, stdin/stdout | Output matching fragile |
| `crash-recovery.test.ts` | ✅ Real processes, crash simulation | Good coverage |
| `multi-terminal-sync.test.ts` | ⚠️ WebSocket mocks | Not real user behavior |
| `validation-commands.test.ts` | ⚠️ Direct API calls | No terminal interaction |
| `terminal-commands.test.ts` | ✅ Real processes | Incomplete workflow coverage |

**Core Issues:**
1. Tests check command responses but not **complete workflows**
2. Standard user journeys (load → modify → save → reload) not tested
3. Mix of real E2E and mock-based "E2E" tests

---

## E2E Test Definition & Convention

### What is a True E2E Test?

```
┌─────────────────────────────────────────────────────────────┐
│                    TRUE E2E TEST                            │
├─────────────────────────────────────────────────────────────┤
│ ✅ Dev Server started (npm run dev)                         │
│ ✅ Real processes spawned (WebSocket, Chat, Graph Viewer)   │
│ ✅ Real stdin/stdout interaction                            │
│ ✅ Real database (Neo4j or test SQLite)                     │
│ ✅ Real file system operations                              │
│ ✅ NO mocks for core components                             │
│ ✅ User behavior simulation (commands, waiting, verifying)  │
└─────────────────────────────────────────────────────────────┘
```

### What is NOT a True E2E Test?

```
┌─────────────────────────────────────────────────────────────┐
│                    NOT E2E (Integration/Unit)               │
├─────────────────────────────────────────────────────────────┤
│ ❌ Direct function calls (handleAnalyzeCommand(ctx))        │
│ ❌ Mocked WebSocket clients                                 │
│ ❌ In-memory database only                                  │
│ ❌ No actual process spawning                               │
│ ❌ Checking function return values directly                 │
└─────────────────────────────────────────────────────────────┘
```

### Test Directory Convention

```
tests/
├── unit/                    # 70% - Pure logic, all mocked
│   └── *.test.ts
├── integration/             # 20% - Component combinations
│   └── *.test.ts
└── e2e/                     # 10% - Real user behavior
    ├── workflows/           # Standard user journeys
    │   ├── import-modify-save.e2e.ts
    │   ├── session-lifecycle.e2e.ts
    │   └── multi-terminal.e2e.ts
    ├── commands/            # Individual command verification
    │   └── *.e2e.ts
    └── smoke/               # App startup verification
        └── app-startup.e2e.ts
```

**Naming Convention:**
- E2E tests: `*.e2e.ts` (explicit marker)
- Integration: `*.test.ts` in integration/
- Unit: `*.test.ts` in unit/

---

## E2E Test to Requirement Mapping

| E2E Test File | Requirements Covered | Status |
|---------------|---------------------|--------|
| `app-e2e.test.ts` | FR-1.1, FR-1.4, FR-1.5, FR-4.3, FR-5.2, FR-8.2, FR-8.4, FR-8.5, FR-8.6, FR-9.4 | ✅ Real E2E |
| `crash-recovery.test.ts` | FR-4.3, FR-4.4, NFR-3.1 | ✅ Real E2E |
| `multi-terminal-sync.test.ts` | FR-4.3 | ⚠️ Mock-based |
| `validation-commands.test.ts` | FR-8.2 | ⚠️ Direct API |
| `terminal-commands.test.ts` | FR-1.4, FR-8.2, FR-8.4, FR-8.6 | ✅ Real E2E |

### Requirements WITHOUT E2E Coverage

| Requirement | Description | Priority |
|-------------|-------------|----------|
| FR-1.2 | LLM-Guided System Definition | HIGH |
| FR-1.3 | Entity Extraction | HIGH |
| FR-3.* | Multi-Tenancy & Access Control | MEDIUM |
| FR-5.1 | All 5 View Types (only 3/5 tested) | HIGH |
| FR-6.* | Layout Algorithms | LOW |
| FR-7.* | Format E Serialization | LOW (unit tests exist) |
| FR-8.1 | Auto-Derivation (REQ→TEST, FUNC→FLOW) | HIGH |
| FR-9.2 | Audit Logging | MEDIUM |
| FR-9.3 | Chat History Persistence | MEDIUM |
| FR-10.* | Prompt Caching | LOW |
| FR-11.* | Interactive Features | LOW |
| NFR-1.* | Performance (<2s layout) | MEDIUM |
| NFR-2.* | Scalability | LOW |

---

## E2E Test Success Criteria & Triggers

### Test Trigger Matrix

| Trigger | When to Run | Tests to Execute |
|---------|-------------|------------------|
| **Pre-commit** | Before any commit | Smoke tests only (fast) |
| **Pre-push** | Before pushing to remote | All E2E tests |
| **PR Creation** | New PR opened | Full E2E suite + performance |
| **CR Completion** | Marking CR as done | Relevant workflow tests |
| **Release** | Version bump | Full regression suite |

### Success Criteria by Test Category

#### 1. Smoke Tests (< 30 seconds)

| Test | Success Criteria | Failure Action |
|------|------------------|----------------|
| **App Startup** | All 4 processes spawn, WebSocket connects within 10s | Block commit |
| **Help Command** | `/help` returns command list within 500ms | Block commit |
| **Stats Command** | `/stats` returns valid JSON with node/edge counts | Block commit |

**Trigger:** Every commit (pre-commit hook)

#### 2. Session Lifecycle Tests (< 2 minutes)

| Test | Success Criteria | Failure Action |
|------|------------------|----------------|
| **Load System** | `/load` displays available systems OR loads default | Block push |
| **Save System** | `/save` confirms persistence, no data loss | Block push |
| **Exit Graceful** | `/exit` triggers cleanup, all processes terminate cleanly | Block push |
| **Restart Recovery** | After restart, `/stats` shows same node count as before exit | Block push |

**Trigger:** Pre-push hook, PR checks

#### 3. Import/Export Tests (< 1 minute)

| Test | Success Criteria | Failure Action |
|------|------------------|----------------|
| **Import File** | `/import <file>` creates nodes, `/stats` shows count > 0 | Block push |
| **Export File** | `/export <name>` creates file in exports/ directory | Block push |
| **Round-Trip** | Import → Export → Reimport → Stats match (±0 nodes) | Block push |

**Trigger:** Pre-push hook, any changes to parser files

#### 4. Validation Command Tests (< 3 minutes)

| Test | Success Criteria | Failure Action |
|------|------------------|----------------|
| **Analyze** | `/analyze` on loaded graph returns violations OR "clean" status | Block push |
| **Validate** | `/validate` returns phase gate status with score 0-100 | Block push |
| **Optimize** | `/optimize 1` completes without crash, shows iteration progress | Block push |
| **Score** | `/score` returns multi-objective scorecard with metrics | Block push |

**Trigger:** Pre-push hook, any changes to validation files

#### 5. View Command Tests (< 1 minute)

| Test | Success Criteria | Failure Action |
|------|------------------|----------------|
| **Hierarchy View** | `/view hierarchy` updates Graph Viewer, shows tree structure | Warn only |
| **Functional View** | `/view functional` updates Graph Viewer, shows FUNC nodes | Warn only |
| **Requirements View** | `/view requirements` updates Graph Viewer, shows REQ/TEST | Warn only |
| **Allocation View** | `/view allocation` updates Graph Viewer, shows MOD nodes | Warn only |
| **UseCase View** | `/view usecase` updates Graph Viewer, shows UC/ACTOR | Warn only |

**Trigger:** Pre-push hook, any changes to view or canvas files

#### 6. Multi-Terminal Sync Tests (< 2 minutes)

| Test | Success Criteria | Failure Action |
|------|------------------|----------------|
| **WebSocket Connect** | All 4 terminals connect to WS server within 5s | Block push |
| **Broadcast Update** | Change in Chat appears in Graph Viewer within 2s | Block push |
| **Concurrent Clients** | 2+ clients see same graph state after sync | Block push |

**Trigger:** Pre-push hook, any changes to WebSocket or sync files

#### 7. Crash Recovery Tests (< 3 minutes)

| Test | Success Criteria | Failure Action |
|------|------------------|----------------|
| **WS Crash Detection** | Chat detects WS server crash within 5s | Block release |
| **WS Reconnection** | Chat reconnects after WS restart within 10s | Block release |
| **Data Persistence** | After crash + restart, node count unchanged | Block release |
| **Mid-Op Recovery** | Crash during `/save` → no corruption on restart | Block release |

**Trigger:** Release builds, any changes to crash recovery code

### Individual Test Specifications

#### TEST-E2E-001: App Startup Smoke

```
ID:           TEST-E2E-001
Name:         App Startup Smoke
Category:     Smoke
Requirement:  FR-1.1, FR-4.3
Trigger:      Pre-commit
Timeout:      30 seconds
Priority:     CRITICAL

Preconditions:
  - npm run build succeeds
  - Neo4j available OR AgentDB fallback

Steps:
  1. Run startup.sh
  2. Wait for "Connected to WebSocket" in chat-interface
  3. Wait for "Connected to WebSocket" in graph-viewer
  4. Send "/help" to chat

Success Criteria:
  ✓ WebSocket server starts on port 3001
  ✓ Chat interface connects within 10s
  ✓ Graph viewer connects within 10s
  ✓ /help returns command list

Failure Criteria:
  ✗ Any process crashes
  ✗ WebSocket connection timeout
  ✗ /help returns error
```

#### TEST-E2E-002: Session Lifecycle

```
ID:           TEST-E2E-002
Name:         Session Lifecycle
Category:     Workflow
Requirement:  FR-4.4, NFR-3.1
Trigger:      Pre-push
Timeout:      120 seconds
Priority:     HIGH

Preconditions:
  - TEST-E2E-001 passes
  - Test data exists (eval/testdata/clean-system.txt)

Steps:
  1. Start app
  2. /import eval/testdata/clean-system.txt
  3. /stats → record initialCount
  4. /save → confirm persistence
  5. /exit → verify graceful shutdown
  6. Restart app
  7. /stats → record finalCount

Success Criteria:
  ✓ Import creates nodes (count > 10)
  ✓ Save confirms "persisted" or "saved"
  ✓ Exit terminates all processes cleanly
  ✓ finalCount == initialCount (±1 tolerance)

Failure Criteria:
  ✗ Import fails or count = 0
  ✗ Save fails or times out
  ✗ Exit leaves orphan processes
  ✗ Data loss (finalCount < initialCount - 1)
```

#### TEST-E2E-003: Import/Export Round-Trip

```
ID:           TEST-E2E-003
Name:         Import/Export Round-Trip
Category:     Workflow
Requirement:  FR-9.4
Trigger:      Pre-push, parser changes
Timeout:      60 seconds
Priority:     HIGH

Preconditions:
  - TEST-E2E-001 passes
  - Test data exists

Steps:
  1. /import eval/testdata/clean-system.txt
  2. /stats → originalNodes, originalEdges
  3. /export roundtrip-test
  4. /new (clear graph)
  5. /import exports/roundtrip-test.txt
  6. /stats → reimportNodes, reimportEdges

Success Criteria:
  ✓ Export creates file in exports/
  ✓ reimportNodes == originalNodes
  ✓ reimportEdges == originalEdges

Failure Criteria:
  ✗ Export file not created
  ✗ Node count mismatch
  ✗ Edge count mismatch
```

#### TEST-E2E-004: Validation Analysis

```
ID:           TEST-E2E-004
Name:         Validation Analysis
Category:     Command
Requirement:  FR-8.2, FR-8.6
Trigger:      Pre-push, validation changes
Timeout:      60 seconds
Priority:     HIGH

Preconditions:
  - TEST-E2E-001 passes
  - Test data with known violations exists

Steps:
  1. /import eval/testdata/combined-violations.txt
  2. /analyze → capture output
  3. Verify violation detection

Success Criteria:
  ✓ Analyze returns within 30s
  ✓ Output contains "violation" or "issue" or "warning"
  ✓ Output contains suggested fixes

Failure Criteria:
  ✗ Analyze times out
  ✗ "No nodes" error when graph has nodes
  ✗ No violations detected on known-bad data
```

#### TEST-E2E-005: Multi-Terminal Sync

```
ID:           TEST-E2E-005
Name:         Multi-Terminal Sync
Category:     Workflow
Requirement:  FR-4.3
Trigger:      Pre-push, WebSocket changes
Timeout:      120 seconds
Priority:     HIGH

Preconditions:
  - TEST-E2E-001 passes
  - All 4 terminal processes running

Steps:
  1. Verify all terminals connected to WebSocket
  2. /import in Chat terminal
  3. Check Graph Viewer received update
  4. /view hierarchy in Chat
  5. Check Graph Viewer shows hierarchy

Success Criteria:
  ✓ All terminals connected
  ✓ Graph Viewer receives import update within 2s
  ✓ Graph Viewer receives view change within 2s

Failure Criteria:
  ✗ Graph Viewer not connected
  ✗ Updates not received within timeout
  ✗ Graph Viewer shows stale data
```

#### TEST-E2E-006: Crash Recovery

```
ID:           TEST-E2E-006
Name:         Crash Recovery
Category:     Resilience
Requirement:  NFR-3.1
Trigger:      Release, crash recovery changes
Timeout:      180 seconds
Priority:     MEDIUM

Preconditions:
  - TEST-E2E-001 passes
  - Test data loaded

Steps:
  1. /import and record node count
  2. Kill WebSocket server (SIGKILL)
  3. Verify Chat detects disconnection
  4. Restart WebSocket server
  5. Verify Chat reconnects
  6. /stats and compare node count

Success Criteria:
  ✓ Chat detects disconnect within 5s
  ✓ Chat reconnects within 10s of server restart
  ✓ Node count unchanged after recovery

Failure Criteria:
  ✗ Chat doesn't detect crash
  ✗ Chat doesn't reconnect
  ✗ Data loss after recovery
```

---

## Standard Workflow Test Matrix

### User Journey: Session Lifecycle

| Step | Action | Verification | E2E Test |
|------|--------|--------------|----------|
| 1 | Start app | 4 terminals launch | ⚠️ Partial |
| 2 | `/load` system | System loaded, nodes visible | ⚠️ Partial |
| 3 | `/stats` | Node count matches | ✅ Exists |
| 4 | `/view hierarchy` | Graph viewer updates | ⚠️ Partial |
| 5 | Modify via chat | LLM adds nodes | ❌ Missing |
| 6 | `/save` | Neo4j persisted | ⚠️ Partial |
| 7 | `/exit` | Graceful shutdown | ❌ Missing |
| 8 | Restart app | Data still present | ✅ Exists |

### User Journey: Import → Modify → Export

| Step | Action | Verification | E2E Test |
|------|--------|--------------|----------|
| 1 | `/import file.txt` | File parsed, nodes created | ⚠️ Partial |
| 2 | `/stats` | Correct node count | ✅ Exists |
| 3 | `/analyze` | Violations detected | ✅ Exists |
| 4 | Chat: "Add REQ" | Node added via LLM | ❌ Missing |
| 5 | `/validate` | New node validated | ✅ Exists |
| 6 | `/export result` | File written | ⚠️ Partial |
| 7 | `/import result` | Same data restored | ❌ Missing |

### User Journey: Multi-Terminal Sync

| Step | Action | Verification | E2E Test |
|------|--------|--------------|----------|
| 1 | Start all terminals | All connect to WS | ✅ Exists |
| 2 | `/load` in Chat | Graph Viewer updates | ⚠️ Mock-based |
| 3 | `/view functional` | Both terminals show same | ⚠️ Mock-based |
| 4 | Add node in Chat | Graph Viewer shows change | ❌ Missing |
| 5 | Graph Viewer receives diff | Change indicator +/- visible | ❌ Missing |

### Command Coverage Matrix

| Command | E2E Test | Status |
|---------|----------|--------|
| `/help` | ✅ | Works |
| `/stats` | ✅ | Works |
| `/view *` | ⚠️ | Fragile output matching |
| `/load` | ⚠️ | Lists only, no full cycle |
| `/save` | ⚠️ | No persistence verification |
| `/import` | ⚠️ | No round-trip test |
| `/export` | ⚠️ | No round-trip test |
| `/validate` | ✅ | Works |
| `/analyze` | ✅ | Works |
| `/optimize` | ✅ | Works (slow) |
| `/derive` | ⚠️ | Needs LLM, often skipped |
| `/commit` | ❌ | Missing |
| `/status` | ❌ | Missing |
| `/exit` | ❌ | Missing |

---

## Required E2E Tests (Missing)

### 1. Session Lifecycle E2E (`tests/e2e/workflows/session-lifecycle.e2e.ts`)

```typescript
describe('Session Lifecycle E2E', () => {
  it('full cycle: start → load → modify → save → exit → restart → verify', async () => {
    // 1. Start app
    const app = await startApp();
    await app.waitForReady();

    // 2. Load system
    await app.sendCommand('/load TestSystem.SY.001');
    await app.expectOutput(/Loaded.*nodes/);

    // 3. Get baseline
    await app.sendCommand('/stats');
    const initialCount = app.parseNodeCount();

    // 4. Modify via /import or direct add
    await app.sendCommand('/import eval/testdata/clean-system.txt');
    await app.expectOutput(/imported/i);

    // 5. Save
    await app.sendCommand('/save');
    await app.expectOutput(/saved|persisted/i);

    // 6. Exit gracefully
    await app.sendCommand('/exit');
    await app.waitForExit();

    // 7. Restart
    const app2 = await startApp();
    await app2.waitForReady();

    // 8. Verify data persisted
    await app2.sendCommand('/stats');
    const finalCount = app2.parseNodeCount();
    expect(finalCount).toBeGreaterThanOrEqual(initialCount);

    await app2.stop();
  });
});
```

### 2. Import-Export Round-Trip (`tests/e2e/workflows/import-export-roundtrip.e2e.ts`)

```typescript
describe('Import/Export Round-Trip E2E', () => {
  it('import → export → reimport produces identical graph', async () => {
    const app = await startApp();

    // Import
    await app.sendCommand('/import eval/testdata/clean-system.txt');
    await app.sendCommand('/stats');
    const originalStats = app.parseStats();

    // Export
    await app.sendCommand('/export roundtrip-test');
    await app.expectOutput(/exported/i);

    // Clear and reimport
    await app.sendCommand('/new');  // or start fresh
    await app.sendCommand('/import exports/roundtrip-test.json');

    // Verify identical
    await app.sendCommand('/stats');
    const reimportStats = app.parseStats();

    expect(reimportStats.nodes).toBe(originalStats.nodes);
    expect(reimportStats.edges).toBe(originalStats.edges);
  });
});
```

### 3. Multi-Terminal Real Sync (`tests/e2e/workflows/multi-terminal-sync.e2e.ts`)

```typescript
describe('Multi-Terminal Sync E2E', () => {
  it('change in Chat appears in Graph Viewer', async () => {
    // Start all 4 terminals as real processes
    const { wsServer, chat, graphViewer, stdout } = await startAllTerminals();

    // Verify all connected
    await chat.expectOutput(/Connected/);
    await graphViewer.expectOutput(/Connected/);

    // Load system in Chat
    await chat.sendCommand('/load TestSystem.SY.001');

    // Graph Viewer should receive update
    await graphViewer.expectOutput(/SYS|hierarchy|nodes/);

    // Import additional nodes
    await chat.sendCommand('/import eval/testdata/orphan-nodes.txt');

    // Graph Viewer should show change
    await graphViewer.expectOutput(/update|changed|\+/);
  });
});
```

---

## Future: Web Frontend E2E

When web frontend is added, E2E tests will use Playwright:

```typescript
// tests/e2e/web/session-lifecycle.e2e.ts
import { test, expect } from '@playwright/test';

test('full session lifecycle via web UI', async ({ page }) => {
  await page.goto('/');

  // Load system
  await page.click('[data-testid="load-system-btn"]');
  await page.click('[data-testid="system-TestSystem"]');

  // Verify nodes displayed
  await expect(page.locator('[data-testid="node-count"]')).toContainText(/\d+ nodes/);

  // Add node via UI
  await page.click('[data-testid="add-node-btn"]');
  await page.fill('[data-testid="node-name-input"]', 'NewFunc');
  await page.click('[data-testid="save-node-btn"]');

  // Verify node appears
  await expect(page.locator('[data-testid="graph-canvas"]')).toContainText('NewFunc');

  // Save and reload
  await page.click('[data-testid="save-btn"]');
  await page.reload();

  // Verify persisted
  await expect(page.locator('[data-testid="graph-canvas"]')).toContainText('NewFunc');
});
```

---

## Implementation Plan

### Phase 1: E2E Helper Class (2h)
Create reusable `AppTestHelper` for process management:

```typescript
// tests/e2e/helpers/app-helper.ts
export class AppTestHelper {
  async startApp(): Promise<void>;
  async sendCommand(cmd: string): Promise<void>;
  async expectOutput(pattern: RegExp, timeout?: number): Promise<string>;
  async waitForReady(): Promise<void>;
  async stop(): Promise<void>;
  parseNodeCount(): number;
  parseStats(): { nodes: number; edges: number };
}
```

### Phase 2: Workflow Tests (4h)
- `session-lifecycle.e2e.ts`
- `import-export-roundtrip.e2e.ts`
- `multi-terminal-sync.e2e.ts`

### Phase 3: Missing Command Tests (2h)
- `/commit`, `/status`, `/exit` commands
- Change tracking verification (+/-/~)

### Phase 4: CI Integration (1h)
- Add E2E step to GitHub Actions
- Run on every PR

---

## Acceptance Criteria

- [x] `AppTestHelper` class created
- [x] Session lifecycle E2E passes
- [x] Import/Export round-trip E2E passes
- [x] Multi-terminal sync E2E passes (real processes)
- [x] All commands have E2E coverage
- [ ] CI runs E2E on every PR (future)
- [x] E2E tests follow `*.e2e.ts` naming convention

---

## Test Execution Commands

```bash
# Run all E2E tests
npm run test:e2e

# Run specific workflow
npx vitest run tests/e2e/workflows/session-lifecycle.e2e.ts

# Run with dev server (full stack)
npm run dev & sleep 10 && npm run test:e2e

# Future: Web E2E with Playwright
npx playwright test tests/e2e/web/
```

---

## Summary: What Changes

| Before | After |
|--------|-------|
| Mix of mock and real E2E | Clear separation: `*.e2e.ts` = real only |
| Command-by-command testing | Workflow-based testing |
| No round-trip verification | Import → Export → Reimport |
| Mock WebSocket sync | Real multi-terminal process |
| Manual "did you test it?" | Automated E2E in CI |

---

## Estimated Effort

| Phase | Hours |
|-------|-------|
| E2E Helper Class | 2 |
| Workflow Tests | 4 |
| Missing Commands | 2 |
| CI Integration | 1 |
| **Total** | **9 hours** |

---

## References

- [CR-041 SPARC Integration](CR-041-sparc-swarm-integration.md)
- [tests/e2e/](../../tests/e2e/) - Current E2E tests
- [CLAUDE.md](../../CLAUDE.md) - Project instructions
