# CR-048: AgentDB Query Tool for LLM Engine

**Type:** Feature
**Status:** In Progress
**Priority:** HIGH
**Target Phase:** Phase 2
**Created:** 2025-12-13
**MVP Acceptance Criteria:** N/A

## Problem / Use Case

The LLM Engine creates incorrect io edges (circular, bidirectional, duplicates) because it cannot query the existing graph structure before generating changes. Currently the LLM only receives a serialized text dump of the graph via Format E, which doesn't allow it to:

1. Query specific edge patterns (e.g., "what edges exist for this FLOW?")
2. Check if an edge already exists before creating it
3. Understand io-flow-io chains structurally

**Root Cause Example:**
- User: "Fix io edges in PRDReviewChain"
- LLM receives: text dump with edges listed as `SourceID -io-> TargetID`
- LLM cannot: query "which FUNCs already write to ReviewFeedback.FL.001?"
- Result: Creates duplicate edges, circular connections, bidirectional flows

**Comparison:** Claude Code (this assistant) can query Neo4j directly via cypher-shell to understand graph structure. The LLM Engine needs equivalent capability via AgentDB.

## Requirements

### Functional Requirements
- FR-1: LLM agents MUST be able to query edges by type, source, and/or target
- FR-2: LLM agents MUST be able to check for existing connections before creating edges
- FR-3: LLM agents MUST be able to query nodes by type and pattern
- FR-4: Tool responses MUST be structured JSON for reliable parsing

### Non-Functional Requirements
- NFR-1: Queries MUST complete within 100ms for typical graph sizes (<500 nodes)
- NFR-2: Tool definitions MUST be self-documenting in prompts
- NFR-3: Implementation MUST use existing AgentDB methods (no new data layer)

## Architecture / Solution Approach

### Option 1: Claude Tool Use (Recommended)
Use Anthropic's native tool use (function calling) to give LLM structured query capabilities.

**Advantages:**
- Native Claude support with structured input/output
- Automatic schema validation
- Clear separation of concerns
- Can be iterative (LLM calls tool, sees result, makes decision)

**Implementation:**
1. Define tool schema for `graph_query`
2. Add tool definitions to Anthropic API request
3. Handle tool_use response blocks
4. Execute queries against AgentDB
5. Return results as tool_result
6. Continue LLM completion with context

### Option 2: Pre-Query in System Prompt
Analyze user request, pre-query relevant data, include in system prompt.

**Disadvantages:**
- Requires anticipating all query needs
- Increases prompt size
- No iterative querying

**Decision:** Option 1 (Claude Tool Use) provides flexibility and matches user's request ("analog zu deiner skill neo4j zu lesen").

## Implementation Plan

### Phase 1: Tool Definition (~2 hours)
1. Add `graph_query` tool to `settings/agent-config.json`
2. Define query parameters: queryType, filters, nodeTypes, edgeTypes
3. Document in toolDefinitions section

### Phase 2: Query Handler (~3 hours)
1. Create `src/llm-engine/tools/agentdb-query-tool.ts`
2. Implement query methods:
   - `queryEdges(sourceType?, edgeType?, targetType?)`
   - `queryNodes(nodeType?, namePattern?)`
   - `checkEdgeExists(sourceId, edgeType, targetId)`
   - `getIoChain(fchainId)` - specialized for io-flow-io analysis

### Phase 3: LLM Engine Integration (~3 hours)
1. Modify `llm-engine.ts` to include tools in API request
2. Handle `tool_use` content blocks in streaming response
3. Execute tool and return `tool_result`
4. Continue streaming until completion

### Phase 4: Testing (~2 hours)
1. Test io-edge query scenario
2. Verify duplicate detection works
3. Test bidirectional edge detection

## Tool Schema

```json
{
  "name": "graph_query",
  "description": "Query the current graph structure to understand existing nodes and edges before making changes",
  "input_schema": {
    "type": "object",
    "properties": {
      "queryType": {
        "type": "string",
        "enum": ["edges", "nodes", "check_edge", "io_chain"],
        "description": "Type of query to execute"
      },
      "filters": {
        "type": "object",
        "properties": {
          "sourceType": { "type": "string", "description": "Node type of edge source" },
          "targetType": { "type": "string", "description": "Node type of edge target" },
          "edgeType": { "type": "string", "description": "Edge type (compose, io, satisfy, etc.)" },
          "nodeType": { "type": "string", "description": "Filter nodes by type" },
          "semanticId": { "type": "string", "description": "Specific node semantic ID" },
          "fchainId": { "type": "string", "description": "FCHAIN ID for io_chain query" }
        }
      }
    },
    "required": ["queryType"]
  }
}
```

## Query Examples

### Example 1: Check io edges for a FLOW
```json
{
  "queryType": "edges",
  "filters": {
    "edgeType": "io",
    "sourceType": "FLOW"
  }
}
```
Response:
```json
{
  "count": 5,
  "edges": [
    { "source": "ReviewFeedback.FL.001", "target": "SubmitPRD.FN.001", "type": "io" },
    ...
  ]
}
```

### Example 2: Check if edge exists before creating
```json
{
  "queryType": "check_edge",
  "filters": {
    "semanticId": "ReviewFeedback.FL.001",
    "edgeType": "io",
    "targetId": "SubmitPRD.FN.001"
  }
}
```
Response:
```json
{
  "exists": true,
  "edge": { "uuid": "...", "source": "ReviewFeedback.FL.001", "target": "SubmitPRD.FN.001" }
}
```

### Example 3: Get io-flow-io chain for FCHAIN
```json
{
  "queryType": "io_chain",
  "filters": {
    "fchainId": "PRDReviewChain.FC.001"
  }
}
```
Response:
```json
{
  "chain": [
    { "step": 1, "actor": "PMUser.AC.001", "flow": "PRDContent.FL.001", "func": "SubmitPRD.FN.001" },
    { "step": 2, "func": "SubmitPRD.FN.001", "flow": "ReviewFeedback.FL.001", "func": "ReviewPRD.FN.001" },
    ...
  ],
  "issues": [
    { "type": "bidirectional", "flow": "ReviewFeedback.FL.001", "nodes": ["SubmitPRD.FN.001"] }
  ]
}
```

## Current Status
- [x] CR document created
- [x] Tool definition added to agent-config.json
- [x] Query handler implemented (`src/llm-engine/tools/agentdb-query-tool.ts`)
- [x] LLM Engine modified for tool use (streaming with tool loop)
- [x] Prompt builder updated with mandatory tool use guidance
- [ ] Integration tested in production scenario

## Acceptance Criteria
- [ ] LLM can query edges before creating new ones
- [ ] LLM can detect and avoid duplicate edges
- [ ] LLM can understand io-flow-io chains
- [ ] Tool responses are properly parsed by LLM

## Dependencies
- Requires AgentDB methods: `getNodes()`, `getEdges()`
- Requires Anthropic SDK tool use support

## Estimated Effort
Total: 10-12 hours (1.5-2 days)

## References
- CR-032: Unified Data Layer (AgentDB as source of truth)
- CR-038: Clean Architecture Refactor
- Anthropic Tool Use: https://docs.anthropic.com/claude/docs/tool-use
