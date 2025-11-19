# Testing Strategy - Root Cause Driven Development

**Author:** andreas@siglochconsulting
**Date:** 2025-11-14
**Principle:** Detection of any parallel path or violation of contracts leads to root cause fixing, not covering symptoms

---

## Core Philosophy

**"Fix the disease, not the symptoms"**

When a test fails:
1. ❌ Don't add a workaround
2. ❌ Don't add a fallback path
3. ❌ Don't increase timeouts
4. ✅ Find WHY it failed
5. ✅ Fix the root cause
6. ✅ Add a test that prevents regression

---

## Test Pyramid (3-Layer Validation)

```
                    E2E (10%)
                  ↗ 5-10 tests
                  Smoke tests only
                  12 minutes max

           Integration (20%)
         ↗ API + DB tests
         2-5 seconds each
         Real dependencies

    Unit (70%)
  ↗ Pure logic tests
  50-100ms each
  No dependencies
```

### Layer 1: Unit Tests (70% of coverage)
**Purpose:** Validate pure logic in isolation
**Speed:** < 100ms per test
**Dependencies:** None (all mocked)

**Example:**
```typescript
// tests/unit/response-distributor.test.ts
import { ResponseDistributor } from '@/backend/ai-assistant/response-distributor';

describe('ResponseDistributor', () => {
  let distributor: ResponseDistributor;
  let mockNeo4j: jest.Mocked<Neo4jService>;

  beforeEach(() => {
    mockNeo4j = {
      createNode: jest.fn(),
      getNodesByType: jest.fn()
    } as any;
    distributor = new ResponseDistributor(mockNeo4j, mockValidator);
  });

  test('parseLLMResponse strips operations from text', () => {
    const input = 'Hello world<operations>[{"id":"op-001"}]</operations>';
    const result = distributor.parseLLMResponse(input);

    expect(result.textResponse).toBe('Hello world');
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].id).toBe('op-001');
  });

  test('parseLLMResponse handles operations split across chunks', () => {
    // This would have caught the buffer accumulation bug
    const chunk1 = 'Text here <oper';
    const chunk2 = 'ations>[...]</operations>';
    const accumulated = chunk1 + chunk2;

    const result = distributor.parseLLMResponse(accumulated);
    expect(result.textResponse).toBe('Text here');
  });

  test('query operation filters results correctly', async () => {
    mockNeo4j.getNodesByType.mockResolvedValue([
      { uuid: '1', properties: { Name: 'A', Type: 'SYS' } },
      { uuid: '2', properties: { Name: 'B', Type: 'UC' } }
    ]);

    const op: Operation = {
      id: 'op-001',
      type: 'query',
      nodeType: 'SYS',
      filters: { Type: 'SYS' }
    };

    const result = await distributor.executeOperation(op, 'user-123');
    expect(result.data).toHaveLength(1);
    expect(result.data[0].Name).toBe('A');
  });
});
```

**Coverage Target:** 80% of business logic

---

### Layer 2: Integration Tests (20% of coverage)
**Purpose:** Validate components working together
**Speed:** 2-5 seconds per test
**Dependencies:** Real database, real API, mocked LLM

**Example:**
```typescript
// tests/integration/chat-api.test.ts
import request from 'supertest';
import { app } from '@/backend/server';
import { neo4jService } from '@/backend/services/neo4j.service';

describe('Chat API Integration', () => {
  let testSessionId: string;

  beforeEach(async () => {
    testSessionId = `test-${Date.now()}`;
    await neo4jService.run(
      'CREATE (s:ChatSession {sessionId: $id, title: "Test"})',
      { id: testSessionId }
    );
  });

  afterEach(async () => {
    await neo4jService.run(
      'MATCH (n {sessionId: $id}) DETACH DELETE n',
      { id: testSessionId }
    );
  });

  test('POST /messages saves to Neo4j and returns 201', async () => {
    const response = await request(app)
      .post(`/api/chat/sessions/${testSessionId}/messages`)
      .send({ content: 'Test message' })
      .expect(201);

    expect(response.body.message).toMatchObject({
      content: 'Test message',
      role: 'user'
    });

    // Verify database persistence
    const result = await neo4jService.run(
      'MATCH (m:ChatMessage {sessionId: $id}) RETURN m',
      { id: testSessionId }
    );
    expect(result.records.length).toBe(1);
  });

  test('GET /messages retrieves by sessionId only', async () => {
    // Create messages in two different sessions
    await neo4jService.run(`
      CREATE (m1:ChatMessage {sessionId: $id1, content: 'Msg 1'})
      CREATE (m2:ChatMessage {sessionId: $id2, content: 'Msg 2'})
    `, { id1: testSessionId, id2: 'other-session' });

    const response = await request(app)
      .get(`/api/chat/sessions/${testSessionId}/messages`)
      .expect(200);

    expect(response.body.messages).toHaveLength(1);
    expect(response.body.messages[0].content).toBe('Msg 1');
  });

  test('Operations are executed and nodes created with correct sessionId', async () => {
    // Mock LLM to return operations
    jest.spyOn(aiAssistantService, 'streamChat').mockImplementation(async function* () {
      yield {
        type: 'ai-response-chunk',
        chunk: 'Created system<operations>[{"id":"op-001","type":"create","nodeType":"SYS","data":{"Name":"TestSys","Descr":"Test"}}]</operations>'
      };
    });

    await request(app)
      .post(`/api/chat/sessions/${testSessionId}/messages`)
      .send({ content: 'Create system TestSys' })
      .expect(201);

    // Wait for async operation execution
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Verify node was created with sessionId
    const result = await neo4jService.run(
      'MATCH (n:SYS {sessionId: $id}) RETURN n',
      { id: testSessionId }
    );
    expect(result.records.length).toBe(1);
    expect(result.records[0].get('n').properties.Name).toBe('TestSys');
  });
});
```

**Coverage Target:** 60% of API endpoints and database operations

---

### Layer 3: E2E Tests (10% of coverage)
**Purpose:** Validate critical user journeys
**Speed:** 30-60 seconds per test
**Scope:** Smoke tests only - core flows must work

**Example:**
```typescript
// tests/e2e/smoke.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Smoke Tests - Critical Paths', () => {
  test('App starts without errors', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-testid="app-container"]')).toBeVisible();

    // No console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.waitForTimeout(2000);
    expect(errors).toHaveLength(0);
  });

  test('Backend connects to Neo4j', async ({ page }) => {
    const response = await page.request.get('http://localhost:3001/health');
    expect(response.ok()).toBe(true);
    const health = await response.json();
    expect(health.neo4j).toBe('connected');
  });

  test('LLM generates operations for node creation', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-testid="message-input"]').fill('Create system TestSystem');
    await page.locator('[data-testid="message-input"]').press('Enter');

    // Wait for AI response
    await page.waitForSelector('[data-testid="ai-message"]', { timeout: 30000 });
    const response = await page.locator('[data-testid="ai-message"]').first().textContent();

    // Should NOT contain operations JSON (stripped correctly)
    expect(response).not.toContain('<operations>');
    expect(response).toMatch(/created|system|testsystem/i);
  });

  test('Messages persist after page reload', async ({ page }) => {
    await page.goto('/');

    // Send message
    await page.locator('[data-testid="message-input"]').fill('Persistence test');
    await page.locator('[data-testid="message-input"]').press('Enter');
    await page.waitForSelector('[data-testid="ai-message"]', { timeout: 30000 });

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Messages should still be there
    const messages = page.locator('[data-testid="user-message"]');
    await expect(messages).not.toHaveCount(0);
    await expect(messages.first()).toContainText('Persistence test');
  });

  test('Canvas updates display after node creation', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-testid="message-input"]').fill('Create system CanvasTest');
    await page.locator('[data-testid="message-input"]').press('Enter');

    await page.waitForTimeout(3000); // Allow operation execution

    // Check if graph canvas updated
    const graphNodes = page.locator('[data-testid="graph-node"]');
    await expect(graphNodes).not.toHaveCount(0);
  });
});
```

**Coverage Target:** 5-10 critical user journeys

---

## Contract Testing

**Principle:** API and WebSocket contracts are enforced. Any violation = root cause fix required.

### Contract Definitions

```typescript
// src/types/contracts/api.contract.ts
export const APIContracts = {
  'POST /sessions/:sessionId/messages': {
    request: {
      body: {
        content: 'string',
        metadata: 'object?'
      },
      headers: {
        'x-user-id': 'string?'
      }
    },
    response: {
      201: {
        message: {
          id: 'string',
          content: 'string',
          role: '"user" | "assistant"',
          timestamp: 'Date'
        }
      },
      400: { error: 'string' },
      500: { error: 'string' }
    }
  }
};

// src/types/contracts/websocket.contract.ts
export const WebSocketContracts = {
  'ai-chunk': {
    type: '"ai-chunk"',
    payload: {
      sessionId: 'string',
      messageId: 'string',
      chunk: 'string',
      isComplete: 'boolean'
    },
    timestamp: 'number'
  },
  'message': {
    type: '"message"',
    payload: {
      sessionId: 'string',
      message: 'ChatMessage'
    },
    timestamp: 'number'
  }
};
```

### Contract Validation Tests

```typescript
// tests/contracts/websocket.contract.test.ts
import { WebSocketContracts } from '@/types/contracts/websocket.contract';
import { validateContract } from '@/tests/helpers/contract-validator';

describe('WebSocket Contract Compliance', () => {
  test('ai-chunk broadcasts match contract', async () => {
    const mockBroadcast = jest.fn();
    wsServer.broadcast = mockBroadcast;

    // Trigger AI response
    await chatService.sendMessage('test-session', 'Hello');

    const broadcasts = mockBroadcast.mock.calls.map(call => call[0]);
    const aiChunks = broadcasts.filter(b => b.type === 'ai-chunk');

    // Every ai-chunk must match contract
    aiChunks.forEach(chunk => {
      const validation = validateContract(chunk, WebSocketContracts['ai-chunk']);
      expect(validation.valid).toBe(true);
      if (!validation.valid) {
        console.error('Contract violation:', validation.errors);
      }
    });
  });
});
```

---

## Test Isolation & Cleanup

**Principle:** Tests MUST be independent. Pollution = root cause fix required.

```typescript
// tests/helpers/test-isolation.ts
export class TestIsolation {
  private testSessions: Set<string> = new Set();

  async createIsolatedSession(): Promise<string> {
    const sessionId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.testSessions.add(sessionId);

    await neo4jService.run(
      'CREATE (s:ChatSession {sessionId: $id, title: "Test Session", createdAt: datetime()})',
      { id: sessionId }
    );

    return sessionId;
  }

  async cleanupSession(sessionId: string): Promise<void> {
    await neo4jService.run(
      'MATCH (n {sessionId: $id}) DETACH DELETE n',
      { id: sessionId }
    );
    this.testSessions.delete(sessionId);
  }

  async cleanupAll(): Promise<void> {
    for (const sessionId of this.testSessions) {
      await this.cleanupSession(sessionId);
    }
  }
}

// Usage in tests
let isolation: TestIsolation;
let testSessionId: string;

beforeEach(async () => {
  isolation = new TestIsolation();
  testSessionId = await isolation.createIsolatedSession();
});

afterEach(async () => {
  await isolation.cleanupAll();
});
```

---

## Feature Flags for Incomplete Features

**Principle:** Don't test incomplete features. Flag them until ready.

```typescript
// src/config/features.ts
export const features = {
  messageEditing: process.env.FEATURE_MESSAGE_EDITING === 'true',
  multiUser: process.env.FEATURE_MULTI_USER === 'true',
  canvasSync: process.env.FEATURE_CANVAS_SYNC === 'true'
};

// tests/e2e/message-editing.spec.ts
import { features } from '@/config/features';

test.describe('Message Editing', () => {
  test.skip(!features.messageEditing, 'Feature not yet implemented');

  test('should save edited message', async ({ page }) => {
    // Test implementation
  });
});
```

**Environment:**
```bash
# .env.test
FEATURE_MESSAGE_EDITING=false  # Skip these tests
FEATURE_MULTI_USER=false       # Skip these tests
FEATURE_CANVAS_SYNC=true       # Test these
```

---

## Logging Strategy for Root Cause Analysis

**Principle:** Logs must pinpoint the exact failure point.

```typescript
// src/utils/logger.ts
import winston from 'winston';

export const logger = {
  llm: winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    ),
    defaultMeta: { service: 'llm' },
    transports: [
      new winston.transports.File({ filename: 'logs/llm.log' }),
      new winston.transports.Console({ format: winston.format.simple() })
    ]
  }),

  websocket: winston.createLogger({
    defaultMeta: { service: 'websocket' },
    // ... same config
  }),

  persistence: winston.createLogger({
    defaultMeta: { service: 'persistence' },
    // ... same config
  })
};

// Usage with structured context
logger.llm.info('Streaming chunk processed', {
  sessionId,
  chunkIndex: i,
  bufferLength: accumulatedBuffer.length,
  hitOperationsTag,
  action: 'buffer_accumulation'
});
```

**Enable debug mode in tests:**
```bash
DEBUG=llm,websocket npm run test:e2e
```

---

## CI/CD Pipeline with Test Stages

```yaml
# .github/workflows/ci.yml
name: CI Pipeline - Root Cause Driven

on: [push, pull_request]

jobs:
  unit-tests:
    name: Unit Tests (70%)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:unit
      - name: Check coverage
        run: |
          COVERAGE=$(npm run test:unit:coverage | grep "All files" | awk '{print $10}' | sed 's/%//')
          if [ "$COVERAGE" -lt 80 ]; then
            echo "❌ Unit test coverage below 80%: $COVERAGE%"
            exit 1
          fi

  integration-tests:
    name: Integration Tests (20%)
    needs: unit-tests
    runs-on: ubuntu-latest
    services:
      neo4j:
        image: neo4j:5
        env:
          NEO4J_AUTH: neo4j/testpassword
        ports:
          - 7687:7687
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:integration
        env:
          NEO4J_URI: bolt://localhost:7687
          NEO4J_USER: neo4j
          NEO4J_PASSWORD: testpassword

  smoke-tests:
    name: E2E Smoke Tests (10%)
    needs: integration-tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npx playwright install
      - run: npm run test:smoke
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/

  full-e2e:
    name: Full E2E Suite (Optional)
    needs: smoke-tests
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npx playwright install
      - run: npm run test:e2e
```

---

## Root Cause Analysis Checklist

When a test fails, follow this process:

### Step 1: Identify the Symptom
- [ ] What assertion failed?
- [ ] What was expected vs actual?
- [ ] Can you reproduce it locally?

### Step 2: Find the Root Cause
- [ ] Read the full error stack trace
- [ ] Check logs for the exact failure point
- [ ] Is this a timing issue? (If yes, why?)
- [ ] Is this a data isolation issue? (If yes, why?)
- [ ] Is this a contract violation? (If yes, why?)

### Step 3: Validate the Root Cause
- [ ] Write a unit test that reproduces the root cause
- [ ] Verify the unit test fails
- [ ] Fix the root cause
- [ ] Verify the unit test passes
- [ ] Verify the original test passes

### Step 4: Prevent Regression
- [ ] Add the unit test to the test suite
- [ ] Update contracts if needed
- [ ] Document the fix in CR-XXX.md

**Example:**
```
Symptom: E2E test "messages persist after reload" fails with 0 messages
Root Cause Investigation:
  ❌ Not a timeout issue - waited 10 seconds
  ❌ Not a UI issue - messages array is empty
  ✅ Database issue - getMessages() not filtering by sessionId

Unit Test Created: tests/unit/chat-service.test.ts::getMessages filters by sessionId
Fix Applied: src/backend/services/chat.service.ts:142 - Added WHERE sessionId = $id
Validation: ✅ Unit test passes, ✅ Integration test passes, ✅ E2E test passes
```

---

## Quality Gates

**No PR merges until ALL gates pass:**

```typescript
// scripts/quality-gates.ts
const gates = {
  unitTestCoverage: 80,        // % of code covered
  unitTestSpeed: 100,          // Max milliseconds per test
  integrationCoverage: 60,     // % of API endpoints covered
  integrationTestSpeed: 5000,  // Max milliseconds per test
  e2ePassRate: 100,            // % of smoke tests passing
  e2eTestSpeed: 60000,         // Max milliseconds per test
  contractViolations: 0,       // Zero tolerance
  testIsolationFailures: 0     // Zero tolerance
};

async function checkQualityGates() {
  const results = await runAllTests();

  for (const [gate, threshold] of Object.entries(gates)) {
    if (results[gate] < threshold) {
      console.error(`❌ Quality gate failed: ${gate}`);
      console.error(`   Expected: >= ${threshold}`);
      console.error(`   Actual: ${results[gate]}`);
      process.exit(1);
    }
  }

  console.log('✅ All quality gates passed');
}
```

---

## Implementation Plan

### Phase 1: Foundation (Week 1)
- [ ] Set up unit test infrastructure (Jest)
- [ ] Set up integration test infrastructure (Supertest + Neo4j)
- [ ] Define API contracts
- [ ] Define WebSocket contracts
- [ ] Implement contract validators
- [ ] Set up test isolation helpers
- [ ] Configure CI/CD pipeline

### Phase 2: Core Features (Week 2-3)
For each feature, implement in this order:
1. Unit tests (write first)
2. Integration tests (write first)
3. Implementation
4. Smoke test

**Feature: Message Persistence**
- [ ] Unit: ChatService.saveMessage() stores message
- [ ] Unit: ChatService.getMessages() filters by sessionId
- [ ] Integration: POST /messages saves to Neo4j
- [ ] Integration: GET /messages retrieves by sessionId
- [ ] Smoke: Messages visible after page reload
- [ ] Implementation complete ✅

**Feature: Operations Generation**
- [ ] Unit: parseLLMResponse() strips operations
- [ ] Unit: parseLLMResponse() handles split tags
- [ ] Integration: Operations execute and create nodes
- [ ] Smoke: LLM generates operations for "Create system X"
- [ ] Implementation complete ✅

### Phase 3: Advanced Features (Week 4+)
- [ ] Message editing (behind feature flag)
- [ ] Multi-user collaboration (behind feature flag)
- [ ] Canvas rendering (behind feature flag)

---

## Success Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Unit test coverage | 80% | 0% | 🔴 |
| Integration coverage | 60% | 0% | 🔴 |
| E2E pass rate | 100% | 50.7% | 🔴 |
| Contract violations | 0 | Unknown | 🔴 |
| Test isolation failures | 0 | High | 🔴 |
| CI/CD pipeline | Automated | Manual | 🔴 |

**Goal:** All metrics green before greenfield restart.
