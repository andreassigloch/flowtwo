# CR-002: Define Application Startup and Initialization

**Type:** Feature
**Status:** Completed
**Priority:** High
**Target Phase:** Phase 2
**Created:** 2025-11-19
**Completed:** 2025-11-19

## Problem / Use Case

The `main()` function in src/main.ts contained only a TODO comment with no clear entry point or startup sequence for the GraphEngine application.

Users need a reliable way to start the application with:
- Configuration validation before startup
- Clear error messages if configuration is invalid
- Graceful shutdown handling
- Proper service initialization

## Questions to Resolve

1. **What should `main.ts` actually initialize?**
   - Neo4j connection pool?
   - WebSocket server?
   - Terminal UI?
   - All of the above?

2. **What are the startup modes?**
   - Interactive terminal UI (current default via `app.ts`)?
   - Headless server mode?
   - CLI tool mode?
   - Daemon mode?

3. **How should services be orchestrated?**
   - Sequential startup?
   - Parallel initialization?
   - Dependency injection container?

4. **What about configuration validation?**
   - When should `validateConfig()` be called?
   - How should startup errors be handled?
   - Should there be health checks?

## Current State

Multiple entry points exist:
- `src/terminal-ui/app.ts` - Interactive terminal UI
- `src/main.ts` - Undefined entry point
- `examples/demo*.ts` - Demo scripts
- `scripts/graphengine.sh` - Tmux launcher

## Architecture / Solution Approach

Three options were considered:

### Option A: Terminal UI Entry Point
Main.ts validates configuration and launches the interactive terminal UI directly.

**Pros:** Simple, matches current usage pattern, immediate functionality
**Cons:** Limited flexibility for other modes (headless, daemon)

### Option B: Mode-Based Startup
Support multiple startup modes via CLI flags (interactive, headless, daemon).

**Pros:** Flexible, supports multiple use cases
**Cons:** More complex, requires additional implementation and testing

### Option C: Service Orchestration
Service container pattern with dependency injection, lifecycle management, and health monitoring.

**Pros:** Clean separation, highly testable, extensible, production-ready
**Cons:** Significant implementation effort, may be over-engineering for current needs

## Decision

**Implemented Option A** (Terminal UI entry point) for immediate functionality.
Option C (Service Orchestration) deferred to CR-018.

## Current Status

- [x] Implemented config validation in main.ts
- [x] Removed obsolete tmux code (app.ts, tmux-manager.ts)
- [x] main.ts shows instructions for 3-terminal setup
- [x] Created CR-018 for future service orchestration
- [x] Actual UI already working (chat-interface.ts + graph-viewer.ts + websocket-server)

## Implementation Details

[src/main.ts:20-47](../../src/main.ts#L20-L47) now implements:
1. Configuration validation using validateConfig()
2. Display instructions to run 3 terminals:
   - Terminal 1: WebSocket server (npm run websocket-server)
   - Terminal 2: Graph viewer (tsx src/terminal-ui/graph-viewer.ts)
   - Terminal 3: Chat interface (tsx src/terminal-ui/chat-interface.ts)

Note: Initial CR-002 implementation was against obsolete tmux-based architecture.
The actual UI (Phase 1 complete) uses WebSocket-based multi-terminal setup.

## Acceptance Criteria

- [x] `main.ts` has clear, documented initialization logic
- [x] Configuration validation runs before startup
- [x] Startup errors are logged and handled properly
- [x] Clear instructions shown for running the application
- [x] Obsolete tmux code removed
- [x] README documents the actual 3-terminal setup

## Dependencies

- CR-003 may affect service initialization order
- Requires decision on application architecture

## Estimated Effort

- Option A: 2-4 hours
- Option B: 8-12 hours
- Option C: 12-16 hours

## References

- Node.js Process Events: https://nodejs.org/api/process.html#process-events
- Graceful Shutdown Patterns: https://github.com/godaddy/terminus

## Notes

- Current approach (launching via `app.ts` directly) works but bypasses `main.ts`
- Need to align with overall application architecture
- Consider how this interacts with tmux launcher (`graphengine.sh`)
