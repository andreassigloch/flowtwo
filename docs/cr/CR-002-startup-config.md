# CR-002: Define Application Startup and Initialization

**Status:** Blocked - Requires Architecture Decision
**Priority:** High
**Target Phase:** Phase 2
**Created:** 2025-11-19

## Problem

The `main()` function in [src/main.ts:33](../../src/main.ts#L33) contains only a TODO comment:

```typescript
async function main() {
  // TODO: Initialize application
}
```

Currently, there is no clear entry point or startup sequence for the GraphEngine application.

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

## Proposed Solutions

### Option A: Terminal UI Entry Point
Make `main.ts` launch the interactive terminal UI by default:

```typescript
async function main() {
  // Validate configuration
  const configValidation = validateConfig();
  if (!configValidation.valid) {
    console.error('Configuration errors:', configValidation.errors);
    process.exit(1);
  }

  // Start terminal UI
  const app = new TerminalApp();
  await app.start();
}
```

**Pros:** Simple, matches current usage pattern
**Cons:** Limited flexibility for other modes

### Option B: Mode-Based Startup
Support multiple startup modes via CLI flags:

```typescript
async function main() {
  const mode = process.argv[2] || 'interactive';

  switch (mode) {
    case 'interactive':
      await startTerminalUI();
      break;
    case 'server':
      await startHeadlessServer();
      break;
    case 'daemon':
      await startDaemon();
      break;
    default:
      showUsage();
  }
}
```

**Pros:** Flexible, supports multiple use cases
**Cons:** More complex, requires additional implementation

### Option C: Service Orchestration
Use a service container/orchestrator pattern:

```typescript
async function main() {
  const services = new ServiceContainer();

  // Register services
  services.register('neo4j', Neo4jClient);
  services.register('websocket', CanvasWebSocketServer);
  services.register('llm', LLMEngine);
  services.register('terminal', TerminalApp);

  // Start services
  await services.startAll();

  // Handle shutdown
  process.on('SIGINT', () => services.stopAll());
}
```

**Pros:** Clean separation, testable, extensible
**Cons:** Requires service container implementation

## Recommendation

Start with **Option A** (Terminal UI entry point) for immediate functionality, then migrate to **Option C** (Service Orchestration) in a future phase.

## Implementation Plan

1. **Immediate (Phase 2):**
   - Implement Option A: Basic terminal UI launcher
   - Add configuration validation
   - Handle startup errors gracefully
   - Add basic health checks

2. **Future (Phase 4):**
   - Refactor to Option C: Service orchestration
   - Add CLI argument parsing
   - Support multiple modes
   - Add graceful shutdown handling

## Acceptance Criteria

- [ ] `main.ts` has clear, documented initialization logic
- [ ] Configuration validation runs before startup
- [ ] Startup errors are logged and handled properly
- [ ] Application can be started via `npm start`
- [ ] Graceful shutdown on SIGINT/SIGTERM
- [ ] README documents how to start the application

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
