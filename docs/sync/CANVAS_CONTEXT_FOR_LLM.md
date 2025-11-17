# Canvas Context für LLM Requests

**Version:** 1.0
**Date:** 2025-01-16
**Status:** Design Document

## Übersicht

Der Canvas-Inhalt im Frontend (mit oder ohne User-Änderungen) muss als Context für LLM-Requests verfügbar sein. Dies ermöglicht dem LLM, kontextbezogene Antworten zu geben und Änderungen auf Basis des aktuellen Graph-Zustands vorzunehmen.

## Anforderungen

1. **Vollständiger State Capture:**
   - Alle Nodes und Edges im aktuellen Graph
   - User-Änderungen (Position, Properties, etc.)
   - Viewport-State (Zoom, Center)
   - Aktive Filter und Layout

2. **Selektiver Context:**
   - Nur selektierte Nodes (für fokussierte Fragen)
   - Nur geänderte Nodes (für Diff-basierte Updates)
   - Nur sichtbare Nodes (Filter respektieren)

3. **Kompakte Serialisierung:**
   - Format E für minimalen Token-Verbrauch
   - Metadata nur wenn relevant
   - Effizientes Caching

4. **Performance:**
   - Context Capture < 10ms
   - Cache-Hit-Rate > 80%
   - Minimale Memory Footprint

## Architektur

### 1. Canvas State Structure

```typescript
interface GraphCanvasState {
  // Core Data
  nodes: GraphNode[]           // All nodes with positions
  edges: GraphEdge[]           // All edges

  // UI State
  viewport: {
    zoom: number               // Current zoom level
    centerX: number            // Viewport center X
    centerY: number            // Viewport center Y
  }

  // Filters
  filters: {
    nodeTypes: NodeType[]      // Active node type filters
    relationTypes: RelationType[]  // Active relation filters
    showFlows: boolean         // Show flow nodes?
    rollupLevel?: number       // Hierarchy depth
  }

  // Layout
  layout: 'hierarchical' | 'force' | 'radial' | 'custom'

  // Selection
  selectedNodes: UUID[]        // Selected node IDs
  selectedEdges: UUID[]        // Selected edge IDs
}
```

### 2. Context Capture Modes

```typescript
enum ContextCaptureMode {
  FULL,           // All nodes and edges
  SELECTED,       // Only selected elements
  VISIBLE,        // Only visible elements (after filters)
  CHANGED,        // Only elements changed since last sync
  MINIMAL         // Just metadata (node counts, types)
}

interface ContextCaptureOptions {
  mode: ContextCaptureMode
  includeMetadata: boolean     // Add statistics, filters, etc.
  includePositions: boolean    // Include node positions
  includeViewport: boolean     // Include zoom/pan state
  selectedOnly: boolean        // Override: only selected
  maxNodes?: number            // Limit for large graphs
}
```

### 3. CanvasContextService Implementation

**File:** `src/backend/services/canvas-context.service.ts`

```typescript
import { GraphSerializer } from '../ai-assistant/graph-serializer'
import { StateManager } from '../../sync/state-manager'
import {
  GraphCanvasState,
  CanvasState,
  GraphNode,
  GraphEdge
} from '../../types/canvas.types'
import { OntologyNode, OntologyRelationship } from '../types'

export interface CaptureResult {
  formatE: string              // Serialized graph
  metadata: ContextMetadata    // Additional info
  tokenEstimate: number        // Estimated tokens
  cacheKey: string             // For caching
}

export interface ContextMetadata {
  totalNodes: number
  totalEdges: number
  selectedNodes: string[]
  activeFilters: string[]
  layout: string
  zoom: number
  timestamp: number
  version: number
}

export class CanvasContextService {
  private cache = new LRUCache<string, CaptureResult>({
    max: 100,
    ttl: 5000  // 5 seconds
  })

  constructor(
    private graphSerializer: GraphSerializer,
    private stateManager: StateManager
  ) {}

  /**
   * Capture canvas context for LLM
   */
  async captureContext(
    sessionId: string,
    options: ContextCaptureOptions = {
      mode: ContextCaptureMode.FULL,
      includeMetadata: true,
      includePositions: false,
      includeViewport: false
    }
  ): Promise<CaptureResult> {
    // Check cache
    const cacheKey = this.getCacheKey(sessionId, options)
    const cached = this.cache.get(cacheKey)

    if (cached) {
      return cached
    }

    // Get canvas state
    const canvasState = await this.stateManager.getCanvasState(sessionId)
    const graphState = canvasState.graph

    // Filter nodes based on mode
    const nodes = this.filterNodes(graphState, options)

    // Filter edges (only between visible nodes)
    const edges = this.filterEdges(graphState, nodes, options)

    // Convert to Ontology format
    const graph = this.convertToOntologyGraph(
      nodes,
      edges,
      options.includePositions
    )

    // Serialize to Format E
    const formatE = await this.graphSerializer.serializeToFormatE(
      graph,
      options.mode === ContextCaptureMode.CHANGED
    )

    // Build metadata
    const metadata = this.buildMetadata(graphState, nodes, edges)

    // Estimate tokens (rough: 4 chars per token)
    const tokenEstimate = Math.ceil(formatE.length / 4)

    // Build result
    const result: CaptureResult = {
      formatE: options.includeMetadata
        ? this.addMetadataHeader(formatE, metadata)
        : formatE,
      metadata,
      tokenEstimate,
      cacheKey
    }

    // Cache result
    this.cache.set(cacheKey, result)

    return result
  }

  /**
   * Filter nodes based on capture mode
   */
  private filterNodes(
    graphState: GraphCanvasState,
    options: ContextCaptureOptions
  ): GraphNode[] {
    let nodes = graphState.nodes

    switch (options.mode) {
      case ContextCaptureMode.SELECTED:
        nodes = nodes.filter(n =>
          graphState.selectedNodes.includes(n.id)
        )
        break

      case ContextCaptureMode.VISIBLE:
        // Apply active filters
        if (graphState.filters.nodeTypes.length > 0) {
          nodes = nodes.filter(n =>
            graphState.filters.nodeTypes.includes(n.type)
          )
        }
        break

      case ContextCaptureMode.CHANGED:
        // Get nodes changed since last capture
        // (tracked by state manager)
        const changedIds = this.stateManager.getChangedNodeIds(sessionId)
        nodes = nodes.filter(n => changedIds.has(n.id))
        break

      case ContextCaptureMode.MINIMAL:
        // Return empty for minimal mode
        nodes = []
        break

      case ContextCaptureMode.FULL:
      default:
        // Return all nodes
        break
    }

    // Apply max nodes limit
    if (options.maxNodes && nodes.length > options.maxNodes) {
      nodes = nodes.slice(0, options.maxNodes)
    }

    return nodes
  }

  /**
   * Filter edges based on visible nodes
   */
  private filterEdges(
    graphState: GraphCanvasState,
    visibleNodes: GraphNode[],
    options: ContextCaptureOptions
  ): GraphEdge[] {
    const nodeIds = new Set(visibleNodes.map(n => n.id))

    let edges = graphState.edges.filter(e =>
      nodeIds.has(e.source) && nodeIds.has(e.target)
    )

    // Apply relation type filters
    if (graphState.filters.relationTypes.length > 0) {
      edges = edges.filter(e =>
        graphState.filters.relationTypes.includes(e.type)
      )
    }

    // Apply flow visibility
    if (!graphState.filters.showFlows) {
      edges = edges.filter(e => e.type !== 'io')
    }

    return edges
  }

  /**
   * Convert GraphCanvas format to Ontology format
   */
  private convertToOntologyGraph(
    nodes: GraphNode[],
    edges: GraphEdge[],
    includePositions: boolean
  ): {
    nodes: OntologyNode[]
    relationships: OntologyRelationship[]
  } {
    return {
      nodes: nodes.map(n => ({
        uuid: n.id,
        type: n.type,
        properties: {
          Name: n.label,
          Descr: n.data.Descr,
          ...(includePositions && {
            position: n.position
          }),
          ...n.data
        },
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user',
        version: 1
      })),
      relationships: edges.map(e => ({
        uuid: e.id,
        type: e.type,
        source: e.source,
        target: e.target,
        properties: {},
        createdAt: new Date(),
        updatedAt: new Date(),
        createdBy: 'user'
      }))
    }
  }

  /**
   * Build context metadata
   */
  private buildMetadata(
    graphState: GraphCanvasState,
    nodes: GraphNode[],
    edges: GraphEdge[]
  ): ContextMetadata {
    return {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      selectedNodes: graphState.selectedNodes,
      activeFilters: this.formatFilters(graphState.filters),
      layout: graphState.layout,
      zoom: Math.round(graphState.viewport.zoom * 100),
      timestamp: Date.now(),
      version: 1
    }
  }

  /**
   * Add metadata header to Format E
   */
  private addMetadataHeader(
    formatE: string,
    metadata: ContextMetadata
  ): string {
    const header = `## Current Graph Context

**Timestamp:** ${new Date(metadata.timestamp).toISOString()}
**Total Nodes:** ${metadata.totalNodes}
**Total Edges:** ${metadata.totalEdges}
**Selected Nodes:** ${metadata.selectedNodes.join(', ') || 'None'}
**Active Filters:** ${metadata.activeFilters.join(' | ') || 'None'}
**Layout:** ${metadata.layout}
**Zoom:** ${metadata.zoom}%

---

`
    return header + formatE
  }

  /**
   * Format filters for display
   */
  private formatFilters(
    filters: GraphCanvasState['filters']
  ): string[] {
    const parts: string[] = []

    if (filters.nodeTypes.length > 0) {
      parts.push(`Node Types: ${filters.nodeTypes.join(', ')}`)
    }
    if (filters.relationTypes.length > 0) {
      parts.push(`Relations: ${filters.relationTypes.join(', ')}`)
    }
    if (filters.showFlows !== undefined) {
      parts.push(`Show Flows: ${filters.showFlows ? 'Yes' : 'No'}`)
    }
    if (filters.rollupLevel !== undefined) {
      parts.push(`Rollup Level: ${filters.rollupLevel}`)
    }

    return parts
  }

  /**
   * Generate cache key
   */
  private getCacheKey(
    sessionId: string,
    options: ContextCaptureOptions
  ): string {
    return `${sessionId}:${options.mode}:${options.includeMetadata}:${options.selectedOnly}`
  }

  /**
   * Invalidate cache for session
   */
  invalidateCache(sessionId: string): void {
    // Remove all cache entries for this session
    const keysToDelete: string[] = []

    this.cache.forEach((value, key) => {
      if (key.startsWith(sessionId + ':')) {
        keysToDelete.push(key)
      }
    })

    keysToDelete.forEach(key => this.cache.delete(key))
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.cache.max,
      hitRate: this.cache.calculatedSize / (this.cache.calculatedSize + this.cache.loads || 1)
    }
  }
}
```

## Integration mit AI Assistant

### 1. System Prompt Construction

```typescript
class AIAssistantService {
  async buildSystemPrompt(
    sessionId: string,
    userRequest: string
  ): Promise<SystemPromptPart[]> {
    // 1. Base ontology rules (always cached)
    const ontologyPrompt = await this.getOntologyPrompt()

    // 2. Capture canvas context
    const contextResult = await this.canvasContext.captureContext(
      sessionId,
      {
        mode: this.determineContextMode(userRequest),
        includeMetadata: true,
        includePositions: false,
        includeViewport: false
      }
    )

    // 3. Build prompt parts with caching
    return [
      {
        type: 'text',
        text: ontologyPrompt,
        cache_control: { type: 'ephemeral' }  // Cache ontology
      },
      {
        type: 'text',
        text: contextResult.formatE,
        cache_control: { type: 'ephemeral' }  // Cache graph context
      }
    ]
  }

  /**
   * Determine appropriate context mode based on user request
   */
  private determineContextMode(userRequest: string): ContextCaptureMode {
    const lowerRequest = userRequest.toLowerCase()

    // Minimal context for general questions
    if (
      lowerRequest.includes('how to') ||
      lowerRequest.includes('what is') ||
      lowerRequest.includes('explain')
    ) {
      return ContextCaptureMode.MINIMAL
    }

    // Selected context for focused questions
    if (
      lowerRequest.includes('this') ||
      lowerRequest.includes('selected') ||
      lowerRequest.includes('these')
    ) {
      return ContextCaptureMode.SELECTED
    }

    // Full context for broad operations
    return ContextCaptureMode.FULL
  }
}
```

### 2. Prompt Caching Strategy

**Anthropic Prompt Caching:** Cache ontology + graph context for 5 minutes

```typescript
// Example LLM Request
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4',
  max_tokens: 4096,
  system: [
    {
      type: 'text',
      text: ontologyRules,
      cache_control: { type: 'ephemeral' }  // Cached for 5 min
    },
    {
      type: 'text',
      text: graphContext,
      cache_control: { type: 'ephemeral' }  // Cached for 5 min
    }
  ],
  messages: [
    { role: 'user', content: userRequest }
  ]
})

// Token savings:
// - Ontology: ~2,000 tokens cached
// - Graph Context: ~1,000-5,000 tokens cached
// - Total savings: 90% on repeated requests
```

### 3. Context Invalidation Strategy

**When to invalidate canvas context cache:**

```typescript
class CanvasContextService {
  setupInvalidationListeners(eventBus: EventBus): void {
    // Invalidate on graph changes
    eventBus.on('graph:node-created', (event) => {
      this.invalidateCache(event.sessionId)
    })

    eventBus.on('graph:node-updated', (event) => {
      this.invalidateCache(event.sessionId)
    })

    eventBus.on('graph:node-deleted', (event) => {
      this.invalidateCache(event.sessionId)
    })

    // Invalidate on filter changes
    eventBus.on('graph:filter-changed', (event) => {
      this.invalidateCache(event.sessionId)
    })

    // Invalidate on layout changes
    eventBus.on('graph:layout-changed', (event) => {
      this.invalidateCache(event.sessionId)
    })

    // Don't invalidate on:
    // - Viewport changes (zoom/pan) - unless explicitly included
    // - Selection changes - use SELECTED mode instead
    // - Presence updates - not relevant for LLM
  }
}
```

## Example Scenarios

### Scenario 1: General Question (Minimal Context)

**User:** "How do I create a new function?"

**Context Mode:** `MINIMAL`

**LLM Prompt:**
```
System:
[Ontology Rules]

Current Graph Context:
**Total Nodes:** 42
**Total Edges:** 58
**Node Types:** SYS (3), ACTOR (5), UC (8), FUNC (15), REQ (11)

User: How do I create a new function?
```

**Token Usage:** ~2,500 tokens (ontology) + ~50 tokens (minimal context)

---

### Scenario 2: Focused Operation (Selected Context)

**User:** "Add tests for the selected function"

**Context Mode:** `SELECTED`

**LLM Prompt:**
```
System:
[Ontology Rules]

Current Graph Context:
**Selected Nodes:** ParseInput (FUNC)

## Nodes
ParseInput|FUNC|ParseInput.FN.001|Parses user input data

## Edges
ParseInput.FN.001 -st-> REQ-InputValidation.RQ.003

User: Add tests for the selected function
```

**Token Usage:** ~2,500 tokens (ontology) + ~200 tokens (selected context)

---

### Scenario 3: Broad Analysis (Full Context)

**User:** "Validate the entire system architecture"

**Context Mode:** `FULL`

**LLM Prompt:**
```
System:
[Ontology Rules]

Current Graph Context:
**Total Nodes:** 42
**Total Edges:** 58

## Nodes
CargoManagement|SYS|CargoManagement.SY.001|Central cargo management system
ManageFleet|UC|ManageFleet.UC.001|Manage fleet operations
...
[All 42 nodes]

## Edges
CargoManagement.SY.001 -cp-> ManageFleet.UC.001
...
[All 58 edges]

User: Validate the entire system architecture
```

**Token Usage:** ~2,500 tokens (ontology) + ~3,000 tokens (full context)

---

### Scenario 4: Incremental Update (Changed Context)

**User:** "Update the system after adding new requirements"

**Context Mode:** `CHANGED`

**LLM Prompt:**
```
System:
[Ontology Rules]

Current Graph Context (Changed Elements Only):
**Total Nodes:** 3 (changed)
**Total Edges:** 4 (changed)

## Nodes
NewRequirement1|REQ|NewRequirement1.RQ.023|New safety requirement
NewRequirement2|REQ|NewRequirement2.RQ.024|New performance requirement
ValidateRequirements|FUNC|ValidateRequirements.FN.012|Validates new requirements

## Edges
NewRequirement1.RQ.023 -vf-> TestSafety.TS.005
NewRequirement2.RQ.024 -vf-> TestPerformance.TS.006
ValidateRequirements.FN.012 -st-> NewRequirement1.RQ.023
ValidateRequirements.FN.012 -st-> NewRequirement2.RQ.024

User: Update the system after adding new requirements
```

**Token Usage:** ~2,500 tokens (ontology) + ~300 tokens (changed context)

## Performance Metrics

### Target Performance:

| Operation | Target | Notes |
|-----------|--------|-------|
| Context Capture (MINIMAL) | < 5ms | Metadata only |
| Context Capture (SELECTED) | < 10ms | Few nodes |
| Context Capture (FULL) | < 50ms | ~100 nodes |
| Cache Hit Rate | > 80% | With 5s TTL |
| Format E Compression | 73-85% | vs JSON |
| Token Reduction | 60-90% | With caching |

### Actual Benchmarks:

```typescript
describe('CanvasContextService Performance', () => {
  it('captures minimal context in <5ms', async () => {
    const start = performance.now()

    await canvasContext.captureContext(sessionId, {
      mode: ContextCaptureMode.MINIMAL
    })

    const duration = performance.now() - start
    expect(duration).toBeLessThan(5)
  })

  it('captures full context (100 nodes) in <50ms', async () => {
    // Setup graph with 100 nodes
    const graphState = createGraphWith100Nodes()

    const start = performance.now()

    await canvasContext.captureContext(sessionId, {
      mode: ContextCaptureMode.FULL
    })

    const duration = performance.now() - start
    expect(duration).toBeLessThan(50)
  })

  it('achieves >80% cache hit rate', async () => {
    // Make 10 requests
    for (let i = 0; i < 10; i++) {
      await canvasContext.captureContext(sessionId, {
        mode: ContextCaptureMode.FULL
      })
    }

    const stats = canvasContext.getCacheStats()
    expect(stats.hitRate).toBeGreaterThan(0.8)
  })
})
```

## Monitoring Dashboard

### Metrics to Track:

```typescript
interface ContextServiceMetrics {
  // Performance
  averageCaptureTime: number  // ms
  p95CaptureTime: number      // ms
  p99CaptureTime: number      // ms

  // Cache
  cacheHits: number
  cacheMisses: number
  cacheHitRate: number        // percentage
  cacheSize: number           // entries

  // Usage
  totalCaptures: number
  capturesByMode: Record<ContextCaptureMode, number>
  averageTokens: number
  tokensSaved: number         // via caching

  // Errors
  captureErrors: number
  serializationErrors: number
}
```

### Prometheus Metrics:

```typescript
// Capture duration histogram
const captureDuration = new Histogram({
  name: 'canvas_context_capture_duration_ms',
  help: 'Duration of canvas context capture',
  labelNames: ['mode']
})

// Cache hit rate gauge
const cacheHitRate = new Gauge({
  name: 'canvas_context_cache_hit_rate',
  help: 'Cache hit rate percentage'
})

// Token count histogram
const tokenCount = new Histogram({
  name: 'canvas_context_tokens',
  help: 'Estimated tokens in captured context',
  labelNames: ['mode']
})
```

## Security Considerations

### 1. Access Control

```typescript
class CanvasContextService {
  async captureContext(
    sessionId: string,
    userId: string,  // Add user validation
    options: ContextCaptureOptions
  ): Promise<CaptureResult> {
    // Verify user has access to session
    const hasAccess = await this.authService.verifySessionAccess(
      userId,
      sessionId
    )

    if (!hasAccess) {
      throw new UnauthorizedError('User does not have access to session')
    }

    // Continue with context capture...
  }
}
```

### 2. Data Sanitization

```typescript
private convertToOntologyGraph(
  nodes: GraphNode[],
  edges: GraphEdge[]
): Graph {
  return {
    nodes: nodes.map(n => ({
      uuid: n.id,
      type: n.type,
      properties: {
        // Only include allowed properties
        Name: this.sanitize(n.label),
        Descr: this.sanitize(n.data.Descr),
        // Filter out sensitive data
        ...this.filterSensitiveData(n.data)
      }
    }))
  }
}

private sanitize(text: string): string {
  // Remove potential injection attacks
  return text
    .replace(/<script>/gi, '')
    .replace(/javascript:/gi, '')
    .trim()
}

private filterSensitiveData(data: any): any {
  const SENSITIVE_FIELDS = ['password', 'token', 'secret', 'apiKey']

  return Object.keys(data)
    .filter(key => !SENSITIVE_FIELDS.includes(key))
    .reduce((obj, key) => {
      obj[key] = data[key]
      return obj
    }, {})
}
```

## Future Enhancements

### 1. Intelligent Context Selection

Use LLM to determine optimal context mode:

```typescript
async determineOptimalContext(
  userRequest: string,
  graphState: GraphCanvasState
): Promise<ContextCaptureOptions> {
  const analysis = await this.llm.analyze({
    prompt: `
      User Request: "${userRequest}"
      Graph Size: ${graphState.nodes.length} nodes

      Determine optimal context mode:
      - MINIMAL: For general questions
      - SELECTED: For focused operations
      - FULL: For broad analysis
      - CHANGED: For incremental updates

      Respond with: { mode: "...", reasoning: "..." }
    `
  })

  return {
    mode: analysis.mode,
    includeMetadata: analysis.mode !== ContextCaptureMode.MINIMAL
  }
}
```

### 2. Differential Context

Only send changes since last request:

```typescript
async captureDifferentialContext(
  sessionId: string,
  lastCaptureTimestamp: number
): Promise<CaptureResult> {
  const changes = await this.stateManager.getChangesSince(
    sessionId,
    lastCaptureTimestamp
  )

  return this.captureContext(sessionId, {
    mode: ContextCaptureMode.CHANGED,
    changedNodeIds: changes.nodeIds
  })
}
```

### 3. Multi-Canvas Context

Combine context from all three canvases:

```typescript
async captureMultiCanvasContext(
  sessionId: string
): Promise<{
  chat: string
  text: string
  graph: string
}> {
  return {
    chat: await this.captureChatContext(sessionId),
    text: await this.captureTextContext(sessionId),
    graph: await this.captureGraphContext(sessionId)
  }
}
```

---

**Status:** Ready for Implementation
**Dependencies:** GraphSerializer, StateManager
**Next Steps:** Implement CanvasContextService with comprehensive tests
