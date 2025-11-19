# CR-004: Improve Integration Test Strategy

**Status:** Future Enhancement
**Priority:** Low
**Target Phase:** Phase 4
**Created:** 2025-11-19

## Problem

Current test suite relies heavily on `MockNeo4jClient` for integration tests. While unit tests should be fully mocked, integration tests should use real dependencies to catch integration issues.

**Current state:**
- **Unit tests:** ✅ Properly mocked (70% of test suite)
- **Integration tests:** ⚠️ Using MockNeo4jClient extensively (20% of test suite)
- **E2E tests:** ✅ Using real dependencies (10% of test suite)

**Issues with current approach:**
- Integration tests don't catch Neo4j connection issues
- Schema mismatches not detected until runtime
- Query performance issues not measured
- Mock behavior may diverge from real Neo4j

## Proposed Solution

### Test Pyramid Strategy (70% Unit / 20% Integration / 10% E2E)

```
                    E2E (10%)
                  ↗ Real everything
                  Playwright/tmux

           Integration (20%)
         ↗ Real Neo4j + Real LLM
         Testcontainers

    Unit (70%)
  ↗ All mocked
  MockNeo4jClient
```

### Integration Test Infrastructure

**Use Testcontainers for Neo4j:**

```typescript
// tests/integration/neo4j-testcontainer.ts
import { GenericContainer } from 'testcontainers';

export async function startNeo4jContainer() {
  const container = await new GenericContainer('neo4j:5.15')
    .withExposedPorts(7687, 7474)
    .withEnvironment({
      'NEO4J_AUTH': 'neo4j/test-password',
      'NEO4J_dbms_memory_pagecache_size': '512M',
      'NEO4J_dbms_memory_heap_max__size': '1G'
    })
    .start();

  return {
    uri: `bolt://localhost:${container.getMappedPort(7687)}`,
    user: 'neo4j',
    password: 'test-password',
    container
  };
}
```

**Benefits:**
- Real Neo4j database for integration tests
- Isolated test environment
- Automatic cleanup
- CI/CD friendly

## Implementation Plan

### Phase 1: Setup Infrastructure (4-6 hours)
1. Add `testcontainers` dependency
2. Create Neo4j testcontainer helper
3. Create integration test fixtures
4. Update test scripts

### Phase 2: Migrate Integration Tests (8-12 hours)
1. Identify tests using MockNeo4jClient that should use real DB
2. Migrate to testcontainers one test file at a time
3. Verify tests catch real integration issues
4. Document new testing patterns

### Phase 3: Add Performance Tests (4-6 hours)
1. Add query performance benchmarks
2. Test with larger datasets
3. Identify slow queries
4. Document performance baselines

## Test Categories

### Keep MockNeo4jClient For:
- Unit tests (all of them)
- Tests that don't interact with database
- Fast feedback loop tests

### Use Real Neo4j For:
- Canvas persistence tests
- Query builder tests
- Transaction tests
- Schema validation tests
- Migration tests

### Use Full E2E For:
- User journey tests
- WebSocket synchronization tests
- Multi-user scenarios

## Acceptance Criteria

- [ ] Testcontainers setup documented
- [ ] Integration tests use real Neo4j
- [ ] Tests run in CI/CD (Docker-in-Docker)
- [ ] Test execution time < 2 minutes for integration suite
- [ ] Performance baselines documented
- [ ] Mock usage only in unit tests

## Dependencies

- Docker must be available in CI/CD environment
- Requires testcontainers package

## Estimated Effort

- Infrastructure setup: 4-6 hours
- Test migration: 8-12 hours
- Performance testing: 4-6 hours
- Documentation: 2-3 hours
- **Total: 18-27 hours**

## Risks

- Docker not available in all environments
- Increased test execution time
- Container startup overhead
- Potential flakiness if containers don't start reliably

## Mitigation

- Use Docker detection to skip tests if unavailable
- Run integration tests in parallel
- Implement retry logic for container startup
- Cache Neo4j images in CI/CD

## Performance Considerations

**Current test suite:**
- Unit tests: ~180ms (72 tests)
- Integration tests: ~500ms (mocked)

**Expected after changes:**
- Unit tests: ~180ms (no change)
- Integration tests: ~2-3 seconds (real Neo4j)
- Total: ~3-4 seconds (still fast)

## References

- Testcontainers: https://node.testcontainers.org/
- Neo4j Docker Images: https://hub.docker.com/_/neo4j
- Test Pyramid Pattern: https://martinfowler.com/articles/practical-test-pyramid.html

## Notes

- Keep MockNeo4jClient for unit tests (it's perfect for that)
- Consider separating "integration" and "e2e" test scripts
- Document when to use mocks vs. real dependencies
- This is an enhancement, not a blocker
