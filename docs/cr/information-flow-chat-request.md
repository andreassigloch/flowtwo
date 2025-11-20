# Information Flow: Chat Request to Response

**Complete data flow from user input through Neo4j, LLM, AgentDB, and back**

---

## Overview

```
User Input → Chat Interface → Neo4j Retrieval → Format E Conversion →
Prompt Building → AgentDB Cache Check → LLM API Call → Response Parsing →
Operations Extraction → Graph Update → Neo4j Persistence → User Display
```

---

## Detailed Flow with Code References

### 1. User Input
**Location:** [chat-interface.ts:398-422](../../src/terminal-ui/chat-interface.ts#L398-L422)

```typescript
User types message
  ↓
processMessage(message)
  ↓
await chatCanvas.addUserMessage(message)  // Store in chat state
  ↓
Create LLM request object
```

**Data at this stage:**
```javascript
{
  message: "Add a payment processing function",
  chatId: "demo-chat-001",
  workspaceId: "demo-workspace",
  systemId: "PaymentSystem.SY.001",
  userId: "andreas@siglochconsulting",
  canvasState: "" // Will be populated next
}
```

---

### 2. Neo4j Graph Retrieval
**Location:** [chat-interface.ts:420](../../src/terminal-ui/chat-interface.ts#L420)

```typescript
canvasState: parser.serializeGraph(graphCanvas.getState())
```

**What happens:**
- GraphCanvas has current graph state in memory: `Map<SemanticId, Node>` and `Map<string, Edge>`
- `parser.serializeGraph()` converts to Format E string
- **NO direct Neo4j query here** - graph already loaded at startup
- Neo4j loading happens at [chat-interface.ts:524-546](../../src/terminal-ui/chat-interface.ts#L524-L546)

**Data flow:**
```
Neo4j (at startup)
  ↓ neo4jClient.loadGraph()
  ↓ [neo4j-client.ts]
  ↓
GraphCanvas.state.nodes (Map)
GraphCanvas.state.edges (Map)
  ↓ parser.serializeGraph()
  ↓
Format E string (canvasState)
```

**⚠️ LOGGING GAP:** Neo4j retrieval has no dedicated logging for LLM context

---

### 3. Format E Serialization
**Location:** [format-e-parser.ts](../../src/shared/parsers/format-e-parser.ts)

```typescript
serializeGraph(state: GraphCanvasState): string
```

**Conversion:**
```
Map<SemanticId, Node> + Map<string, Edge>
  ↓
Format E snapshot:
---
## System
PaymentSystem.SY.001

## Nodes
ProcessPayment|FUNC|ProcessPayment.FN.001|Process customer payment
PaymentData|FLOW|PaymentData.FL.001|Payment information

## Edges
OrderProcessing.FC.001 -cp-> ProcessPayment.FN.001
PaymentData.FL.001 -io-> ProcessPayment.FN.001
---
```

**Data transformation:**
- Nodes: `{ semanticId, name, type, description, position }` → `Name|Type|SemanticID|Description [position]`
- Edges: `{ sourceId, targetId, edgeType }` → `SourceID -edgeType-> TargetID`

---

### 4. Prompt Building
**Location:** [prompt-builder.ts:30-71](../../src/llm-engine/prompt-builder.ts#L30-L71)

```typescript
buildSystemPrompt(canvasState, chatHistory)
  ↓
Returns sections array with cache control
```

**Sections created:**
1. **Ontology Specification** (cached, ~2000 chars)
   - Node types (SYS, UC, FUNC, FLOW, etc.)
   - Edge types (compose, io, satisfy, etc.)
   - Format E syntax rules
   - Location: [prompt-builder.ts:76-169](../../src/llm-engine/prompt-builder.ts#L76-L169)

2. **SE Methodology** (cached, ~1500 chars)
   - Decomposition strategy
   - Best practices
   - Response format
   - Location: [prompt-builder.ts:175-234](../../src/llm-engine/prompt-builder.ts#L175-L234)

3. **Canvas State** (cached, variable size)
   - Current graph in Format E
   - Location: [prompt-builder.ts:240-254](../../src/llm-engine/prompt-builder.ts#L240-L254)

4. **Chat History** (optional, cached)
   - Last N messages
   - Location: [prompt-builder.ts:260-275](../../src/llm-engine/prompt-builder.ts#L260-L275)

**Anthropic API format:**
```javascript
{
  system: [
    { type: 'text', text: '# Ontology...', cache_control: { type: 'ephemeral' } },
    { type: 'text', text: '# Methodology...', cache_control: { type: 'ephemeral' } },
    { type: 'text', text: '# Canvas State...', cache_control: { type: 'ephemeral' } },
    { type: 'text', text: '# Chat History...', cache_control: { type: 'ephemeral' } }
  ],
  messages: [
    { role: 'user', content: 'Add payment processing' }
  ]
}
```

---

### 5. AgentDB Cache Check
**Location:** [llm-engine.ts:73-111](../../src/llm-engine/llm-engine.ts#L73-L111)

```typescript
const agentdb = await getAgentDBService()
cached = await agentdb.checkCache(request.message)
```

**What happens:**
1. **Vector similarity search** - converts message to embedding
2. **Threshold check** - similarity > 0.85
3. **If HIT:** Return cached response immediately (skip LLM call)
4. **If MISS:** Proceed to LLM API

**Backend implementation:** [agentdb-service.ts:35-64](../../src/llm-engine/agentdb/agentdb-service.ts#L35-L64)

**Cache storage:**
```javascript
{
  query: "Add payment processing",
  response: "I'll add a payment processing function...",
  operations: "<operations>...</operations>",
  timestamp: 1234567890,
  ttl: 3600000  // 1 hour
}
```

**Logging:** [llm-engine.ts:79-83](../../src/llm-engine/llm-engine.ts#L79-L83)
```
🎯 AgentDB Cache HIT - returning cached response (streaming)
OR
🔍 AgentDB Cache MISS - calling LLM (streaming)
```

---

### 6. LLM API Call (Streaming)
**Location:** [llm-engine.ts:113-181](../../src/llm-engine/llm-engine.ts#L113-L181)

```typescript
const stream = await this.client.messages.stream({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 4096,
  temperature: 0.7,
  system: systemSections,  // From step 4
  messages: [{ role: 'user', content: request.message }]
})
```

**Streaming flow:**
```
Anthropic API
  ↓ Server-Sent Events (SSE)
  ↓
event.type === 'content_block_delta'
  ↓
chunk.delta.text (incremental text)
  ↓
Emit to UI: onChunk({ type: 'text', text: '...' })
  ↓
Buffer full response
```

**Operations block handling:** [llm-engine.ts:142-180](../../src/llm-engine/llm-engine.ts#L142-L180)
- Detect `<operations>` tag
- **Suppress streaming** while inside operations block
- Only show text before/after operations

---

### 7. Response Parsing
**Location:** [llm-engine.ts:187](../../src/llm-engine/llm-engine.ts#L187)

```typescript
const parsed = this.responseParser.parseResponse(fullText)
```

**Parser logic:** [response-parser.ts](../../src/llm-engine/response-parser.ts)

**Input:**
```
I'll add a payment processing function to your system.

<operations>
<base_snapshot>PaymentSystem.SY.001</base_snapshot>

## Nodes
+ ProcessPayment|FUNC|ProcessPayment.FN.001|Process customer payment

## Edges
+ OrderProcessing.FC.001 -cp-> ProcessPayment.FN.001
</operations>

The function is now part of the OrderProcessing chain.
```

**Output:**
```javascript
{
  textResponse: "I'll add a payment processing function to your system.\n\nThe function is now part of the OrderProcessing chain.",
  operations: "<operations>\n<base_snapshot>PaymentSystem.SY.001</base_snapshot>\n\n## Nodes\n+ ProcessPayment|FUNC|...\n</operations>"
}
```

---

### 8. Usage Tracking & Logging
**Location:** [llm-engine.ts:189-205](../../src/llm-engine/llm-engine.ts#L189-L205)

```typescript
const llmResponse: LLMResponse = {
  textResponse: parsed.textResponse,
  operations: parsed.operations,
  usage: {
    inputTokens: finalMessage.usage.input_tokens,
    outputTokens: finalMessage.usage.output_tokens,
    cacheReadTokens: finalMessage.usage.cache_read_input_tokens,
    cacheWriteTokens: finalMessage.usage.cache_creation_input_tokens
  },
  cacheHit: cacheReadTokens > 0,
  model: 'claude-sonnet-4-5-20250929',
  responseId: finalMessage.id
}
```

**Logging:** [llm-engine.ts:251-271](../../src/llm-engine/llm-engine.ts#L251-L271)
```
📊 LLM Usage:
   Input tokens: 15234
   Output tokens: 523
   Cache read tokens: 12450 ✅
   Cache savings: 82%
   Cache hit: Yes ✅
```

---

### 9. AgentDB Cache Storage
**Location:** [llm-engine.ts:207-223](../../src/llm-engine/llm-engine.ts#L207-L223)

```typescript
await agentdb.cacheResponse(request.message, parsed.textResponse, parsed.operations)
await agentdb.storeEpisode('llm-engine', request.message, success, output, critique)
```

**Two storage types:**
1. **Semantic cache** - for future similar queries
2. **Episodic memory** (Reflexion) - for agent learning

---

### 10. Format E Diff Parsing
**Location:** [chat-interface.ts:449](../../src/terminal-ui/chat-interface.ts#L449)

```typescript
const diff = parser.parseDiff(response.operations, workspaceId, systemId)
```

**Conversion:**
```
Format E Diff (string)
  ↓ parseDiff()
  ↓
{
  baseSnapshot: "PaymentSystem.SY.001",
  operations: [
    {
      type: 'add_node',
      semanticId: 'ProcessPayment.FN.001',
      node: {
        semanticId: 'ProcessPayment.FN.001',
        name: 'ProcessPayment',
        type: 'FUNC',
        description: 'Process customer payment',
        workspaceId: 'demo-workspace',
        systemId: 'PaymentSystem.SY.001'
      }
    },
    {
      type: 'add_edge',
      edge: {
        sourceId: 'OrderProcessing.FC.001',
        targetId: 'ProcessPayment.FN.001',
        edgeType: 'compose'
      }
    }
  ]
}
```

---

### 11. Graph Canvas Update
**Location:** [chat-interface.ts:450](../../src/terminal-ui/chat-interface.ts#L450)

```typescript
await graphCanvas.applyDiff(diff)
```

**What happens:** [canvas-base.ts:applyDiff](../../src/canvas/canvas-base.ts)
1. Validate diff
2. Apply operations to in-memory state
   - Add/remove nodes from `Map<SemanticId, Node>`
   - Add/remove edges from `Map<string, Edge>`
3. Mark items as dirty (for persistence)
4. Increment version

**State update:**
```
graphCanvas.state.nodes.set('ProcessPayment.FN.001', node)
graphCanvas.state.edges.set('OrderProcessing.FC.001-compose->ProcessPayment.FN.001', edge)
graphCanvas.state.dirtyNodeIds.add('ProcessPayment.FN.001')
graphCanvas.state.version++
```

---

### 12. Chat Canvas Update
**Location:** [chat-interface.ts:445](../../src/terminal-ui/chat-interface.ts#L445)

```typescript
await chatCanvas.addAssistantMessage(response.textResponse, response.operations)
```

**What happens:** [chat-canvas.ts:99-120](../../src/canvas/chat-canvas.ts#L99-L120)
1. Create message object
2. Add to chat state
3. Mark as dirty
4. **Auto-forward operations to Graph Canvas** (already done in step 11)

---

### 13. WebSocket Broadcast
**Location:** [chat-interface.ts:94-125](../../src/terminal-ui/chat-interface.ts#L94-L125)

```typescript
notifyGraphUpdate()
  ↓
wsClient.broadcastUpdate('graph_update', JSON.stringify(stateData))
```

**Payload:**
```javascript
{
  nodes: [['ProcessPayment.FN.001', { name: 'ProcessPayment', type: 'FUNC', ... }]],
  edges: [['...', { sourceId: '...', targetId: '...', edgeType: 'compose' }]],
  ports: [],
  currentView: 'hierarchy',
  timestamp: 1234567890
}
```

**Broadcast to:**
- Graph Viewer (Terminal 2)
- Any connected web clients

---

### 14. Neo4j Persistence (Optional)
**Triggered by:** `/save` command or auto-save on exit

**Location:** [canvas-base.ts:persistToNeo4j](../../src/canvas/canvas-base.ts)

```typescript
await graphCanvas.persistToNeo4j()
await chatCanvas.persistToNeo4j()
```

**What gets saved:**
1. **Graph dirty items:**
   - Nodes: [neo4j-client.ts:saveNodes](../../src/neo4j-client/neo4j-client.ts)
   - Edges: [neo4j-client.ts:saveEdges](../../src/neo4j-client/neo4j-client.ts)

2. **Chat messages:**
   - Messages: [neo4j-client.ts:saveMessages](../../src/neo4j-client/neo4j-client.ts)

3. **Audit log:**
   - Diff tracking: [neo4j-client.ts:createAuditLog](../../src/neo4j-client/neo4j-client.ts)

**Cypher queries:**
```cypher
// Save node
MERGE (n:Node {semanticId: $semanticId})
SET n.name = $name, n.type = $type, n.description = $description, ...

// Save edge
MATCH (source {semanticId: $sourceId})
MATCH (target {semanticId: $targetId})
MERGE (source)-[r:EDGE {edgeType: $edgeType}]->(target)

// Save message
MERGE (m:Message {messageId: $messageId})
SET m.role = $role, m.content = $content, ...
```

---

## Summary: Complete Data Transformations

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User Input (string)                                          │
│    "Add payment processing"                                     │
└────────────────────────────────────┬────────────────────────────┘
                                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Neo4j → In-Memory Graph State                               │
│    Map<SemanticId, Node> + Map<string, Edge>                   │
└────────────────────────────────────┬────────────────────────────┘
                                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Format E Serialization (string)                             │
│    ## Nodes                                                     │
│    PaymentData|FLOW|PaymentData.FL.001|Payment info            │
│    ## Edges                                                     │
│    OrderProcessing.FC.001 -cp-> ...                             │
│    ⚠️ ENTIRE GRAPH SERIALIZED (ALL nodes, ALL edges)           │
└────────────────────────────────────┬────────────────────────────┘
                                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Prompt Building (Anthropic API format)                      │
│    { system: [...sections], messages: [...] }                  │
│    ⚠️ NO TOOLS - LLM cannot query Neo4j directly               │
└────────────────────────────────────┬────────────────────────────┘
                                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. AgentDB Vector Search (embedding → similarity)              │
│    Cache HIT: Return cached response (skip LLM)                │
│    Cache MISS: Continue to LLM                                  │
└────────────────────────────────────┬────────────────────────────┘
                                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. LLM Streaming Response (SSE events)                         │
│    Text chunks + operations block (streamed)                   │
└────────────────────────────────────┬────────────────────────────┘
                                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. Response Parsing                                             │
│    { textResponse: "...", operations: "<operations>..." }      │
└────────────────────────────────────┬────────────────────────────┘
                                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 8. AgentDB Cache Storage                                        │
│    Store response + operations for future cache hits            │
└────────────────────────────────────┬────────────────────────────┘
                                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 9. Format E Diff Parsing                                        │
│    "<operations>..." → { baseSnapshot, operations: [...] }     │
└────────────────────────────────────┬────────────────────────────┘
                                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 10. Graph State Update (in-memory)                             │
│     Map.set(semanticId, node) + dirty tracking                 │
└────────────────────────────────────┬────────────────────────────┘
                                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 11. WebSocket Broadcast (JSON)                                 │
│     { nodes: [...], edges: [...], timestamp }                  │
└────────────────────────────────────┬────────────────────────────┘
                                     ↓
┌─────────────────────────────────────────────────────────────────┐
│ 12. Neo4j Persistence (on /save or exit)                       │
│     Cypher queries for dirty items only                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Critical Findings

### 1. ❌ LLM Has NO Tools
**Finding:** LLM cannot query Neo4j directly via tool calls.

**Evidence:** [llm-engine.ts:127-138](../../src/llm-engine/llm-engine.ts#L127-L138)
```typescript
const stream = await this.client.messages.stream({
  model: this.config.model,
  system: systemSections,
  messages: [{ role: 'user', content: request.message }],
  // ❌ NO "tools" parameter!
});
```

**Implication:** LLM gets entire graph in system prompt - cannot query on demand.

---

### 2. ⚠️ Entire Graph Sent to LLM Every Time
**Finding:** Complete graph serialization on every request (ALL nodes, ALL edges).

**Evidence:**
- [chat-interface.ts:420](../../src/terminal-ui/chat-interface.ts#L420): `parser.serializeGraph(graphCanvas.getState())`
- [format-e-parser.ts:222-230](../../src/shared/parsers/format-e-parser.ts#L222-L230): Loops over ALL nodes/edges

**Example:** Graph with 107 nodes + 35 edges = ~5000+ characters in prompt

**Implication:**
- Large graphs = large prompts = high token usage
- Mitigated by Anthropic prompt caching (90% savings after first call)

---

### 3. 🔍 Token Counting is Misleading
**Finding:** Logs show "Input tokens: 12" but actual prompt is 1434+ tokens.

**Actual log example:**
```
Input tokens: 12        ← Only NEW user message
Cache read tokens: 1422 ✅ ← Entire system prompt from cache
Output tokens: 2484
```

**Real token count:** 12 (new) + 1422 (cached) = **1434 total tokens**

**Explanation:**
- System prompt (ontology + methodology + graph state) is cached with `cache_control: { type: 'ephemeral' }`
- First request: All ~6000+ tokens written to cache (expensive)
- Subsequent requests: Cached tokens "read" instead of sent (90% cheaper)
- Anthropic only logs NEW input tokens, not cached reads

**Why this matters:**
- Graph state IS sent every time (via cache)
- "Input tokens: 12" is misleading - makes it look like graph isn't sent
- Actual context size: 1400+ tokens (for 107 node graph)

---

## Logging Gaps Identified

### ❌ Missing Logs:
1. **Neo4j context retrieval for LLM**
   - No log when graph is loaded at startup
   - No log of graph size passed to LLM
   - No query execution time

2. **Format E serialization metrics**
   - No log of serialized size (characters/tokens)
   - No conversion time

3. **Total context size**
   - Current log only shows "Input tokens" (new)
   - Should show: NEW tokens + CACHED tokens = TOTAL

4. **Prompt token estimation**
   - No pre-call token count estimate
   - Only post-call actual usage

### ✅ Existing Logs:
1. AgentDB cache hits/misses
2. LLM token usage (input, output, cache) - but misleading
3. Graph update stats (node count, edge count)
4. Session save/load operations

---

## Performance Characteristics

### Bottlenecks:
1. **LLM API call:** 2-10 seconds (depends on response size)
2. **Neo4j persistence:** 100-500ms (depends on dirty items)
3. **Format E serialization:** <50ms (negligible)
4. **AgentDB vector search:** 10-100ms (depends on cache size)

### Optimization Opportunities:
1. **AgentDB cache** - 82%+ token savings on repeated queries
2. **Anthropic prompt caching** - 90%+ savings on static sections
3. **Dirty tracking** - Only persist changed items (not full graph)
4. **Streaming** - User sees text immediately (better UX)

---

## Author
andreas@siglochconsulting

**Version:** 1.0.0
**Date:** 2025-11-20
