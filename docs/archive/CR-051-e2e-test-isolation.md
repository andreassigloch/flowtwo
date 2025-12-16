# CR-051: E2E Test Isolation

**Type:** Infrastructure
**Status:** Completed
**Priority:** HIGH
**Created:** 2025-01-14
**Updated:** 2025-12-16

## Problem / Use Case

E2E tests were using the same resources as the development instance:
- Same WebSocket port (3002) - tests interfere with manual development
- Same Neo4j database - test data pollutes dev data
- Same AgentDB file - concurrent access issues

This made it impossible to run E2E tests while working on the application.

**Update 2025-12-16:** Additional issue discovered - multiple E2E test files were still using `process.env` directly without port overrides, causing EADDRINUSE errors when tests ran in parallel.

## Requirements

- E2E tests must run independently from development instance
- No shared state between test and dev environments
- Tests can run in parallel with manual development
- Easy cleanup of test data
- **Each E2E test suite must use a unique port** to allow parallel execution

## Solution

**Workspace-based isolation** using environment variables with **unique ports per test suite**:

| Test File | Port | Notes |
|-----------|------|-------|
| Development | 3002 | Production default |
| `app-helper.ts` | 3099 | Shared helper for workflow tests |
| `app-e2e.test.ts` | 3101 | App startup tests |
| `app-startup.e2e.ts` | 3102 | Alternative startup tests |
| `crash-recovery.test.ts` | 3103 | Crash recovery tests |
| `terminal-commands.test.ts` | 3104 | Terminal command tests |
| `crash-recovery.e2e.ts` | 3105 | Alternative crash tests |
| `websocket-sync.spec.ts` | 3003 | WebSocket sync tests |
| `multi-terminal-sync.test.ts` | 3300-3400 | Random port range |
| `websocket-server.test.ts` | 3050-3150 | Random port range |

Neo4j Community doesn't support multiple databases, so data isolation is achieved via `workspaceId` filtering in all queries.

## Implementation

### Pattern for all E2E tests

Each E2E test file must define its own port:

```typescript
// Unique port for this test suite to avoid conflicts with parallel tests
const TEST_WS_PORT = 31XX;  // Unique per test file
const TEST_ENV = {
  ...process.env,
  WS_PORT: String(TEST_WS_PORT),
  WS_URL: `ws://localhost:${TEST_WS_PORT}`,
};

// All spawn() calls must use TEST_ENV
spawn('npx', ['tsx', 'src/websocket-server.ts'], {
  env: TEST_ENV,  // NOT process.env!
  ...
});
```

### Files Updated (2025-12-16)

- `tests/e2e/app-e2e.test.ts` - Port 3101
- `tests/e2e/app-startup.e2e.ts` - Port 3102
- `tests/e2e/crash-recovery.test.ts` - Port 3103
- `tests/e2e/terminal-commands.test.ts` - Port 3104
- `tests/e2e/crash-recovery.e2e.ts` - Port 3105

## Acceptance Criteria

- [x] E2E tests use isolated ports (3099-3105 range)
- [x] E2E tests use separate AgentDB file
- [x] E2E tests use isolated workspace
- [x] Dev instance on port 3002 unaffected by tests
- [x] No EADDRINUSE errors when tests run in parallel

## Files Changed

- `tests/e2e/helpers/app-helper.ts` - TEST_ENV with port 3099
- `tests/e2e/app-e2e.test.ts` - TEST_ENV with port 3101
- `tests/e2e/app-startup.e2e.ts` - TEST_ENV with port 3102
- `tests/e2e/crash-recovery.test.ts` - TEST_ENV with port 3103
- `tests/e2e/terminal-commands.test.ts` - TEST_ENV with port 3104
- `tests/e2e/crash-recovery.e2e.ts` - TEST_ENV with port 3105
