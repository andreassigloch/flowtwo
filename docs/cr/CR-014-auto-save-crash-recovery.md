# CR-014: Implement Auto-save & Crash Recovery

**Status:** Planned
**Priority:** HIGH - MVP Blocker
**Target Phase:** Phase 6 (Production Readiness)
**Created:** 2025-11-19
**MVP Acceptance Criteria:** #10 (Data protection and recovery)

## Problem

According to [implan.md:336-339](../implan.md#L336-L339) and requirements.md NFR-3.1, the system must protect user data from loss due to crashes, connection failures, or user error. Currently:

- **Status:** NOT IMPLEMENTED
- **No periodic auto-save** - Data only saved on explicit `/save` command
- **No crash recovery** - Application crash loses all unsaved work
- **No connection recovery** - Neo4j connection loss causes data loss

**Impact:** Users risk losing significant work if the application crashes or network fails. This violates NFR-3.1 data protection requirements and MVP acceptance criteria #10.

## Requirements

**From implan.md:**
- Auto-save every 5 minutes to Neo4j
- Persist current state before application exit
- Recover workspace from Neo4j on restart after crash
- Handle Neo4j connection loss gracefully

**From requirements.md NFR-3.1:**
- 99.9% data durability
- Recovery point objective (RPO): ≤5 minutes
- Recovery time objective (RTO): ≤30 seconds

## Proposed Solution

### Architecture

```typescript
// src/canvas/auto-save-manager.ts
interface AutoSaveConfig {
  intervalMs: number;        // Default: 300000 (5 min)
  onCrash: boolean;          // Save on SIGTERM/SIGINT
  onConnectionLoss: boolean; // Buffer during Neo4j downtime
}

interface SaveState {
  lastSaveTimestamp: Date;
  isDirty: boolean;
  pendingChanges: number;
  saveInProgress: boolean;
}
```

### 1. Periodic Auto-Save

```typescript
class AutoSaveManager {
  private intervalId: NodeJS.Timeout | null = null;
  private canvas: GraphCanvas;
  private neo4jClient: Neo4jClient;

  constructor(canvas: GraphCanvas, neo4jClient: Neo4jClient, config: AutoSaveConfig) {
    this.canvas = canvas;
    this.neo4jClient = neo4jClient;
    this.config = config;
  }

  start(): void {
    // Auto-save every 5 minutes
    this.intervalId = setInterval(async () => {
      if (this.canvas.isDirty()) {
        await this.performAutoSave();
      }
    }, this.config.intervalMs);

    // Register crash handlers
    if (this.config.onCrash) {
      process.on('SIGINT', () => this.handleCrash());
      process.on('SIGTERM', () => this.handleCrash());
      process.on('uncaughtException', (err) => this.handleCrash(err));
    }
  }

  private async performAutoSave(): Promise<void> {
    try {
      console.log('🔄 Auto-saving...');
      await this.canvas.save(this.neo4jClient);
      console.log('✅ Auto-save complete');
    } catch (error) {
      console.error('❌ Auto-save failed:', error);
      // Buffer changes for retry
      this.bufferChanges();
    }
  }

  private async handleCrash(error?: Error): Promise<void> {
    console.log('💾 Emergency save before crash...');
    try {
      await this.performAutoSave();
      console.log('✅ Emergency save successful');
    } catch (saveError) {
      console.error('❌ Emergency save failed:', saveError);
    }
    process.exit(error ? 1 : 0);
  }
}
```

### 2. Crash Recovery

```typescript
// src/canvas/crash-recovery.ts
class CrashRecoveryManager {
  async recoverWorkspace(workspaceId: string, systemId: string): Promise<GraphCanvas | null> {
    try {
      // Attempt to load from Neo4j
      const neo4jClient = new Neo4jClient();
      await neo4jClient.connect();

      const canvas = new GraphCanvas(workspaceId, systemId);
      await canvas.load(neo4jClient);

      console.log('✅ Workspace recovered from Neo4j');
      return canvas;
    } catch (error) {
      console.error('❌ Recovery failed:', error);

      // Fallback: Try to recover from local buffer
      return this.recoverFromLocalBuffer(workspaceId, systemId);
    }
  }

  private async recoverFromLocalBuffer(workspaceId: string, systemId: string): Promise<GraphCanvas | null> {
    // Check if local buffer exists (for connection loss scenario)
    const bufferPath = `/tmp/graphengine-buffer-${workspaceId}-${systemId}.json`;
    if (fs.existsSync(bufferPath)) {
      const formatE = fs.readFileSync(bufferPath, 'utf-8');
      const canvas = new GraphCanvas(workspaceId, systemId);
      canvas.loadFromFormatE(formatE);
      console.log('⚠️  Recovered from local buffer (Neo4j unavailable)');
      return canvas;
    }

    return null;
  }
}
```

### 3. Connection Loss Handling

```typescript
class ConnectionRecoveryManager {
  private buffer: Map<string, string> = new Map();
  private retryInterval: NodeJS.Timeout | null = null;

  async handleConnectionLoss(canvas: GraphCanvas): Promise<void> {
    // Serialize to local buffer
    const formatE = canvas.toFormatE();
    const bufferKey = `${canvas.workspaceId}-${canvas.systemId}`;
    this.buffer.set(bufferKey, formatE);

    // Write to disk for crash recovery
    const bufferPath = `/tmp/graphengine-buffer-${bufferKey}.json`;
    fs.writeFileSync(bufferPath, formatE);

    console.log('⚠️  Neo4j connection lost. Changes buffered locally.');

    // Retry connection every 30 seconds
    this.retryInterval = setInterval(async () => {
      if (await this.attemptReconnect()) {
        await this.flushBuffer(canvas);
      }
    }, 30000);
  }

  private async attemptReconnect(): Promise<boolean> {
    try {
      const neo4jClient = new Neo4jClient();
      await neo4jClient.connect();
      await neo4jClient.disconnect();
      return true;
    } catch {
      return false;
    }
  }

  private async flushBuffer(canvas: GraphCanvas): Promise<void> {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
    }

    const neo4jClient = new Neo4jClient();
    await neo4jClient.connect();
    await canvas.save(neo4jClient);

    console.log('✅ Neo4j reconnected. Buffered changes saved.');

    // Clean up buffer
    const bufferKey = `${canvas.workspaceId}-${canvas.systemId}`;
    this.buffer.delete(bufferKey);
    const bufferPath = `/tmp/graphengine-buffer-${bufferKey}.json`;
    if (fs.existsSync(bufferPath)) {
      fs.unlinkSync(bufferPath);
    }
  }
}
```

### 4. User Notification

```typescript
// Integrate with terminal UI
class AutoSaveNotifier {
  notifyAutoSave(success: boolean, lastSaveTime: Date): void {
    if (success) {
      console.log(`💾 Auto-saved at ${lastSaveTime.toLocaleTimeString()}`);
    } else {
      console.log('⚠️  Auto-save failed. Changes buffered locally.');
    }
  }

  notifyRecovery(recoverySource: 'neo4j' | 'buffer'): void {
    if (recoverySource === 'neo4j') {
      console.log('✅ Workspace recovered from database');
    } else {
      console.log('⚠️  Workspace recovered from local buffer (database unavailable)');
    }
  }
}
```

## Implementation Plan

### Phase 1: Auto-Save Infrastructure (4-6 hours)
1. Create `src/canvas/auto-save-manager.ts`
2. Implement periodic save timer
3. Add dirty tracking to GraphCanvas
4. Integrate with existing save logic

### Phase 2: Crash Handlers (3-4 hours)
1. Register process event handlers (SIGINT, SIGTERM, uncaughtException)
2. Implement emergency save on crash
3. Test crash scenarios

### Phase 3: Recovery Logic (4-6 hours)
1. Create `src/canvas/crash-recovery.ts`
2. Implement workspace recovery from Neo4j
3. Add recovery status reporting
4. Integrate with app startup

### Phase 4: Connection Loss Handling (6-8 hours)
1. Create `src/canvas/connection-recovery.ts`
2. Implement local buffer for disconnected state
3. Add reconnection retry logic
4. Implement buffer flush on reconnect

### Phase 5: UI Integration (3-4 hours)
1. Add auto-save status to terminal UI
2. Display last save time
3. Show connection status indicator
4. Add manual save confirmation

### Phase 6: Testing (6-8 hours)
1. Test auto-save timer functionality
2. Test crash recovery (kill -9 simulation)
3. Test Neo4j connection loss/recovery
4. Test data integrity after recovery
5. Performance testing (large graphs)

### Phase 7: Configuration (2-3 hours)
1. Add auto-save config to src/shared/config.ts
2. Make interval configurable via env var
3. Add enable/disable flag
4. Document configuration options

## Acceptance Criteria

- [ ] Auto-save runs every 5 minutes (configurable)
- [ ] Emergency save triggers on SIGINT/SIGTERM/crash
- [ ] Workspace recovers from Neo4j after crash
- [ ] Changes buffered locally during Neo4j downtime
- [ ] Buffer flushes automatically when connection restored
- [ ] User sees auto-save status notifications
- [ ] RPO ≤ 5 minutes (99.9% of time)
- [ ] RTO ≤ 30 seconds for recovery
- [ ] Unit tests cover all save/recovery scenarios
- [ ] Integration tests validate end-to-end recovery

## Dependencies

- GraphCanvas save/load functionality (already implemented)
- Neo4jClient connection handling (already implemented)
- Terminal UI notification system (already exists)
- File system access for local buffering

## Estimated Effort

- Auto-Save Infrastructure: 4-6 hours
- Crash Handlers: 3-4 hours
- Recovery Logic: 4-6 hours
- Connection Loss Handling: 6-8 hours
- UI Integration: 3-4 hours
- Testing: 6-8 hours
- Configuration: 2-3 hours
- **Total: 28-39 hours (4-5 days)**

## MVP Impact

**This is a HIGH priority MVP requirement:**
- MVP Acceptance Criteria #10: "Data protection and recovery"
- NFR-3.1: 99.9% data durability
- User trust depends on data safety
- Professional tools require auto-save

## References

- [implan.md:336-339](../implan.md#L336-L339) - Phase 6 Auto-save section
- requirements.md NFR-3.1 - Data protection requirements
- GraphCanvas implementation - save/load methods

## Notes

- Auto-save interval configurable (default 5min)
- Emergency save timeout: 3 seconds max
- Local buffer location: /tmp/graphengine-buffer-*.json
- Clean up old buffers on successful save
- Consider compression for large graphs in buffer
- Log all save/recovery events for debugging
