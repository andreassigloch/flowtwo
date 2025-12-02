# CR-018: Service Orchestration Container

**Type:** Architecture
**Status:** Planned
**Priority:** MEDIUM
**Target Phase:** Phase 4
**Created:** 2025-11-19

## Problem / Use Case

The current startup sequence in main.ts and app.ts directly instantiates and manages services (Neo4j, WebSocket, LLM, Terminal UI). This creates tight coupling and makes it difficult to:
- Test components in isolation
- Support multiple startup modes (interactive, headless, daemon)
- Manage service dependencies and lifecycle
- Implement graceful shutdown with proper cleanup order

As the application grows, we need a cleaner way to orchestrate service initialization, dependency injection, and lifecycle management.

## Requirements

**Functional requirements:**
- FR-1: Register services with dependency declarations
- FR-2: Initialize services in correct dependency order
- FR-3: Support lazy initialization (services start only when needed)
- FR-4: Graceful shutdown in reverse dependency order
- FR-5: Health check system for all registered services

**Non-functional requirements:**
- NFR-1: Testability - services can be mocked/replaced
- NFR-2: Flexibility - support multiple startup modes
- NFR-3: Maintainability - clear separation of concerns
- NFR-4: Performance - parallel initialization where possible

## Architecture / Solution Approach

Implement a Service Container pattern that:

1. **Service Registry**: Central registry of all available services with metadata
2. **Dependency Graph**: Track dependencies between services
3. **Lifecycle Management**: Start, stop, restart services
4. **Health Monitoring**: Periodic health checks for critical services

**Service Interface:**
All services implement a common interface with:
- `start()`: Initialize service
- `stop()`: Cleanup and shutdown
- `health()`: Return health status
- `dependencies`: List of required services

**Container Responsibilities:**
- Validate dependency graph (detect cycles)
- Initialize services in topological order
- Handle startup failures (partial rollback)
- Coordinate graceful shutdown
- Provide service lookup by name

**Benefits:**
- Decouples service creation from business logic
- Enables dependency injection for testing
- Supports multiple deployment modes
- Centralizes lifecycle management

## Implementation Plan

### Phase 1: Service Interface (3-4 hours)
Define common service interface and base implementation.
Services: Neo4jClient, LLMEngine, WebSocketServer, TerminalApp

### Phase 2: Service Container (4-6 hours)
Implement service registry, dependency resolution, and lifecycle management.

### Phase 3: Startup Modes (3-4 hours)
Implement mode-based initialization:
- Interactive mode (current default)
- Headless server mode
- Daemon mode (background process)

### Phase 4: Health Monitoring (2-3 hours)
Add health check system with periodic monitoring and alerts.

### Phase 5: Testing Infrastructure (3-4 hours)
Create test utilities for mocking services and testing container.

### Phase 6: Migration (3-4 hours)
Migrate main.ts and app.ts to use service container.

## Current Status

**Phase 1 (Initial State Sync) - COMPLETED:**
- [x] WebSocket server caches broadcasts per workspace+system
- [x] Chat interface includes systemId in broadcasts
- [x] Graph viewer receives initial state on connect
- [x] main.ts converted to startup orchestrator
- [x] Unit tests for broadcast caching
- [x] Integration tests for startup orchestration
- [x] E2E tests for multi-terminal sync

**Remaining (Full Service Container):**
- [ ] Service interface defined
- [ ] Service container implemented
- [ ] Startup modes supported
- [ ] Health monitoring active
- [ ] Production deployment

## Acceptance Criteria

- [ ] All services implement common Service interface
- [ ] Service container manages lifecycle of all services
- [ ] Dependency graph validated at startup (no cycles)
- [ ] Services initialize in correct dependency order
- [ ] Graceful shutdown stops services in reverse order
- [ ] Health checks run for all critical services
- [ ] Multiple startup modes supported (interactive, headless, daemon)
- [ ] Unit tests for container logic (90% coverage)
- [ ] Integration tests for service lifecycle

## Dependencies

- CR-002 must be completed (startup configuration)
- Requires refactoring of existing services to implement Service interface
- May require updates to Neo4jClient, LLMEngine, WebSocketServer

## Estimated Effort

Total: 18-25 hours (3-4 days)

## MVP Impact

Not critical for MVP, but important for:
- Production deployment
- Horizontal scaling
- Service isolation and testing
- Multi-tenancy support

## References

- CR-002: Define Application Startup (completed with Option A)
- Dependency Injection patterns
- Service lifecycle management best practices
- Node.js graceful shutdown: https://github.com/godaddy/terminus

## Notes

- This implements CR-002 Option C (deferred to Phase 4)
- Start with simple container, avoid over-engineering
- Consider using existing DI libraries (InversifyJS, Awilix) if complexity grows
- Health checks should be lightweight (<50ms per service)
- Container should support hot-reload during development
