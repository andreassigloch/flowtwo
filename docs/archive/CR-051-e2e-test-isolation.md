# CR-051: E2E Test Isolation

**Type:** Infrastructure
**Status:** Completed
**Priority:** HIGH
**Created:** 2025-01-14

## Problem / Use Case

E2E tests were using the same resources as the development instance:
- Same WebSocket port (3002) - tests interfere with manual development
- Same Neo4j database - test data pollutes dev data
- Same AgentDB file - concurrent access issues

This made it impossible to run E2E tests while working on the application.

## Requirements

- E2E tests must run independently from development instance
- No shared state between test and dev environments
- Tests can run in parallel with manual development
- Easy cleanup of test data

## Solution

**Workspace-based isolation** using environment variables:

| Resource | Development | E2E Test |
|----------|-------------|----------|
| WS_PORT | 3002 | 3099 |
| Workspace | demo-workspace | test-workspace |
| AgentDB | `./data/graphengine-agentdb.db` | `./data/test-agentdb.db` |
| Neo4j | Same DB, isolated by workspaceId | Same DB, isolated by workspaceId |

Neo4j Community doesn't support multiple databases, so data isolation is achieved via `workspaceId` filtering in all queries.

## Implementation

Modified `tests/e2e/helpers/app-helper.ts`:

```typescript
const TEST_WS_PORT = 3099;
const TEST_AGENTDB_PATH = './data/test-agentdb.db';
const TEST_WORKSPACE_ID = 'test-workspace';
const TEST_ENV = {
  ...process.env,
  WS_PORT: String(TEST_WS_PORT),
  WS_URL: `ws://localhost:${TEST_WS_PORT}`,
  NODE_ENV: 'test',
  AGENTDB_BACKEND: 'agentdb',
  AGENTDB_URL: TEST_AGENTDB_PATH,
  WORKSPACE_ID: TEST_WORKSPACE_ID,
};
```

All spawned processes (wsServer, chat-interface, graph-viewer) now use `TEST_ENV`.

## Acceptance Criteria

- [x] E2E tests use port 3099
- [x] E2E tests use separate AgentDB file
- [x] E2E tests use isolated workspace
- [x] Dev instance on port 3002 unaffected by tests

## Files Changed

- `tests/e2e/helpers/app-helper.ts` - Added TEST_ENV configuration
