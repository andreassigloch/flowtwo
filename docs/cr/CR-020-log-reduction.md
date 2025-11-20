# CR-020: Log Reduction & Deduplication

**Type:** Refactoring
**Status:** Proposed
**Priority:** MEDIUM
**Created:** 2025-11-20

## Problem

Current logging produces excessive duplicate and redundant messages:

1. **100% duplicates:** Same event logged twice (AgentDB + LLM Engine)
2. **Triple logs:** WebSocket roundtrip logs 3 times for single event
3. **Test pollution:** Unit tests spam production log with init messages
4. **Debug in production:** DEBUG-level logs mixed with INFO
5. **Misleading errors:** "Stored" logged before error occurs

**Example log spam:**
```
[13:57:16] [AgentDB:CACHE] 💾 STORED (with embedding) [agentdb] query="..."
[13:57:16] 💾 Stored response in AgentDB cache         ← DUPLICATE
[13:57:16] ⚠️ AgentDB cache store failed: Error: ...   ← After "success"!
[13:57:16] 📡 Broadcast graph update via WebSocket
[13:57:16] 📡 Received graph_update from andreas@...
[13:57:16] 📡 Received graph update via WebSocket      ← DUPLICATE
```

---

## Requirements

### FR-1: Eliminate Duplicate Logs
- Single log entry per logical event
- Remove redundant "confirmation" logs

### FR-2: Separate Production vs Test Logs
- Test logs → test log file or suppressed
- Production logs → clean, actionable

### FR-3: Respect Log Levels
- DEBUG → only in dev/test mode
- INFO → production runtime events
- ERROR → actual errors only

### FR-4: Accurate Error Logging
- Don't log "success" before error check
- Log errors ONLY when they occur

---

## Proposed Changes

### 1. Remove Duplicate AgentDB Logs in LLM Engine

**Current:** [llm-engine.ts:73-111](../../src/llm-engine/llm-engine.ts#L73-L111)
```typescript
// AgentDBLogger already logs this
cached = await agentdb.checkCache(request.message);
if (cached) {
  log('🎯 AgentDB Cache HIT - returning cached response (streaming)');  // ❌ REMOVE
}
log('🔍 AgentDB Cache MISS - calling LLM (streaming)');  // ❌ REMOVE
```

**Proposed:**
```typescript
// Remove all AgentDB logs from llm-engine.ts - AgentDBLogger handles it
cached = await agentdb.checkCache(request.message);
// No additional logging needed
```

**Files to modify:**
- [llm-engine.ts:79-83](../../src/llm-engine/llm-engine.ts#L79-L83) - Remove cache HIT log
- [llm-engine.ts:111](../../src/llm-engine/llm-engine.ts#L111) - Remove cache MISS log
- [llm-engine.ts:211](../../src/llm-engine/llm-engine.ts#L211) - Remove "Stored response" log

---

### 2. Fix Misleading "Stored" Log

**Current:** [llm-engine.ts:208-223](../../src/llm-engine/llm-engine.ts#L208-L223)
```typescript
await agentdb.cacheResponse(...);
log('💾 Stored response in AgentDB cache');  // ❌ Logged before error check!

await agentdb.storeEpisode(...);  // ← Can fail here
```

**Proposed:**
```typescript
try {
  await agentdb.cacheResponse(...);
  await agentdb.storeEpisode(...);
  // AgentDBLogger already logged cache store - no additional log needed
} catch (error) {
  log(`⚠️ AgentDB storage failed: ${error}`);
}
```

---

### 3. Reduce WebSocket Broadcast Logs

**Current:** 3 logs for one event
- [chat-interface.ts:124](../../src/terminal-ui/chat-interface.ts#L124) - Broadcast
- Graph Viewer - 2x received logs (event type + generic)

**Proposed:** Keep only 1 log per side
```typescript
// chat-interface.ts
log('📡 Broadcast graph update via WebSocket');  // ✅ KEEP

// graph-viewer.ts
log(`📡 Received graph_update from ${source.userId}`);  // ✅ KEEP
// Remove generic "Received graph update via WebSocket"  // ❌ REMOVE
```

**Files to modify:**
- [graph-viewer.ts:614](../../src/terminal-ui/graph-viewer.ts#L614) - Remove generic log

---

### 4. Suppress Test Logs

**Problem:** Unit tests initialize AgentDB repeatedly, polluting log

**Solution:** Environment-based log suppression

**Add to config.ts:**
```typescript
export const LOG_LEVEL = process.env.LOG_LEVEL || (NODE_ENV === 'test' ? 'ERROR' : 'INFO');
export const SUPPRESS_TEST_LOGS = process.env.NODE_ENV === 'test';
```

**Modify AgentDBLogger:**
```typescript
static backendInitialized(backend: string, withEmbeddings: boolean): void {
  if (SUPPRESS_TEST_LOGS) return;  // ← Skip in test mode
  const embInfo = withEmbeddings ? 'WITH OpenAI embeddings' : 'word-based matching';
  this.log(AgentDBLogLevel.INFO, `✅ Backend initialized: ${backend} (${embInfo})`);
}
```

**Files to modify:**
- [config.ts](../../src/shared/config.ts) - Add LOG_LEVEL and SUPPRESS_TEST_LOGS
- [agentdb-logger.ts](../../src/llm-engine/agentdb/agentdb-logger.ts) - Check SUPPRESS_TEST_LOGS

---

### 5. Move DEBUG Logs Behind Flag

**Current:** DEBUG logs always shown

**Proposed:**
```typescript
static embeddingGenerated(text: string, dimension: number): void {
  if (LOG_LEVEL !== 'DEBUG') return;  // ← Only in debug mode
  this.log(
    AgentDBLogLevel.DEBUG,
    `🔢 Embedding generated: dim=${dimension} text="${text.substring(0, 40)}..."`
  );
}
```

**Files to modify:**
- [agentdb-logger.ts:151-156](../../src/llm-engine/agentdb/agentdb-logger.ts#L151-L156)

---

## Summary of Changes

| File | Change | Reason |
|------|--------|--------|
| llm-engine.ts:79-83 | ❌ Remove cache HIT log | Duplicate of AgentDBLogger |
| llm-engine.ts:111 | ❌ Remove cache MISS log | Duplicate of AgentDBLogger |
| llm-engine.ts:211 | ❌ Remove "Stored response" log | Duplicate + misleading |
| graph-viewer.ts:614 | ❌ Remove generic WebSocket log | Duplicate (event-specific log exists) |
| config.ts | ✅ Add LOG_LEVEL, SUPPRESS_TEST_LOGS | Enable log filtering |
| agentdb-logger.ts | ✅ Check SUPPRESS_TEST_LOGS | Prevent test spam |
| agentdb-logger.ts:151-156 | ✅ Guard DEBUG logs | Respect log level |

---

## Expected Result

**Before:**
```
[13:59:19] [AgentDB:CACHE] ❌ CACHE MISS [agentdb] query="define the use case for server management..."
[13:59:19] 🔍 AgentDB Cache MISS - calling LLM (streaming)
[13:59:50] 📊 LLM Usage:
[13:59:50]    Input: 12, Output: 2484, Cache read: 1422, Cache write: 3575
[13:59:51] [AgentDB:DEBUG] 🔢 Embedding generated: dim=1536 text="define the use case for server managemen..."
[13:59:51] [AgentDB:CACHE] 💾 STORED (with embedding) [agentdb] query="define the use case for server management..."
[13:59:51] 💾 Stored response in AgentDB cache
[13:59:51] ⚠️ AgentDB cache store failed: Error: no such table: episodes
[13:59:51] 📊 Graph updated (107 nodes, 35 edges)
[13:59:51] 📡 Broadcast graph update via WebSocket
[13:59:51] 📡 Received graph_update from andreas@siglochconsulting
[13:59:51] 📡 Received graph update via WebSocket
[13:59:51] ✅ Rendered 107 nodes, 35 edges
```

**After:**
```
[13:59:19] [AgentDB:CACHE] ❌ CACHE MISS [agentdb] query="define the use case for server management..."
[13:59:50] 📊 LLM Usage:
[13:59:50]    Input: 12, Output: 2484, Cache read: 1422, Cache write: 3575
[13:59:51] [AgentDB:CACHE] 💾 STORED (with embedding) [agentdb] query="define the use case for server management..."
[13:59:51] ⚠️ AgentDB episode store failed: Error: no such table: episodes
[13:59:51] 📊 Graph updated (107 nodes, 35 edges)
[13:59:51] 📡 Broadcast graph update via WebSocket
[13:59:51] 📡 Received graph_update from andreas@siglochconsulting
[13:59:51] ✅ Rendered 107 nodes, 35 edges
```

**Reduction:** 12 lines → 8 lines (33% fewer logs)

---

## Estimated Effort

**Total:** 1-2 hours

- Remove duplicate logs: 30 min
- Add log level config: 15 min
- Implement guards: 30 min
- Test: 30 min

---

## Author
andreas@siglochconsulting

**Version:** 1.0.0
