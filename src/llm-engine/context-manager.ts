/**
 * Context Manager - Task-specific Graph Slicing for LLM Token Optimization
 *
 * CR-038 Phase 8: Provides minimal relevant graph context (~3K tokens)
 * instead of full graph (~15K tokens) for each LLM call.
 *
 * Key Features:
 * - Task classification based on keywords
 * - Intelligent graph slicing per task type
 * - Token estimation and budget enforcement
 * - Serialization for LLM prompts
 *
 * @author andreas@siglochconsulting
 */

import { UnifiedAgentDBService } from './agentdb/unified-agentdb-service.js';
import type { Node, Edge, SemanticId } from '../shared/types/ontology.js';

// ============================================================
// Types
// ============================================================

export interface GraphSlice {
  nodes: Map<SemanticId, Node>;
  edges: Map<string, Edge>;
  focusNodeId?: SemanticId;
  depth: number;
  estimatedTokens: number;
}

export type TaskType =
  | 'derive-testcase'
  | 'detail-usecase'
  | 'allocate-functions'
  | 'validate-phase'
  | 'general';

export type PhaseId =
  | 'phase1_requirements'
  | 'phase2_logical'
  | 'phase3_physical'
  | 'phase4_integration';

// ============================================================
// Context Manager
// ============================================================

export class ContextManager {
  constructor(private agentDB: UnifiedAgentDBService) {}

  // ============================================================
  // Public API
  // ============================================================

  /**
   * Get minimal context for a task type
   *
   * Classifies the task and returns only relevant nodes/edges
   * to minimize token usage while preserving context.
   */
  getContextForTask(task: string, phase?: PhaseId): GraphSlice {
    const taskType = this.classifyTask(task);

    switch (taskType) {
      case 'derive-testcase':
        // Test derivation: REQ nodes + parent SYS
        return this.sliceByTypes(['REQ', 'SYS'], 1);

      case 'detail-usecase':
        // Use case detailing: UC + neighboring UCs + parent SYS
        return this.sliceNeighbors('UC', 2);

      case 'allocate-functions':
        // Function allocation: FUNC + MOD candidates
        return this.sliceByTypes(['FUNC', 'MOD', 'SWC'], 2);

      case 'validate-phase':
        // Validation: Full subgraph for phase
        return this.sliceByPhase(phase || 'phase2_logical');

      default:
        // General: Mentioned nodes + depth 3
        return this.sliceByMentions(task, 3);
    }
  }

  /**
   * Estimate tokens for a slice (rough: 4 chars = 1 token)
   */
  estimateTokens(slice: GraphSlice): number {
    const serialized = this.serialize(slice);
    return Math.ceil(serialized.length / 4);
  }

  /**
   * Prune slice to fit token budget
   */
  pruneToFit(slice: GraphSlice, maxTokens: number): GraphSlice {
    let currentSlice = slice;
    let depth = slice.depth;

    while (this.estimateTokens(currentSlice) > maxTokens && depth > 1) {
      depth--;
      currentSlice = this.reduceDepth(currentSlice, depth);
    }

    return currentSlice;
  }

  /**
   * Serialize slice for LLM prompt
   */
  serialize(slice: GraphSlice): string {
    const lines: string[] = [];

    lines.push('## Current Graph Context');
    lines.push(`Nodes: ${slice.nodes.size}, Edges: ${slice.edges.size}`);
    lines.push('');

    // Serialize nodes by type
    const nodesByType = new Map<string, Node[]>();
    for (const node of slice.nodes.values()) {
      const nodes = nodesByType.get(node.type) || [];
      nodes.push(node);
      nodesByType.set(node.type, nodes);
    }

    for (const [type, nodes] of nodesByType) {
      lines.push(`### ${type} Nodes`);
      for (const node of nodes) {
        lines.push(`- ${node.semanticId}: ${node.name}`);
        if (node.descr) {
          lines.push(`  Description: ${node.descr}`);
        }
      }
      lines.push('');
    }

    // Serialize edges
    if (slice.edges.size > 0) {
      lines.push('### Relationships');
      for (const edge of slice.edges.values()) {
        lines.push(`- ${edge.sourceId} -[${edge.type}]-> ${edge.targetId}`);
      }
    }

    return lines.join('\n');
  }

  // ============================================================
  // Task Classification
  // ============================================================

  /**
   * Classify task based on keywords
   */
  classifyTask(task: string): TaskType {
    const lower = task.toLowerCase();

    // Test derivation keywords
    if (
      lower.includes('test') ||
      lower.includes('verify') ||
      lower.includes('coverage') ||
      lower.includes('testcase') ||
      lower.includes('testfall')
    ) {
      return 'derive-testcase';
    }

    // Use case detailing keywords
    if (
      lower.includes('detail') ||
      lower.includes('refine') ||
      lower.includes('elaborate') ||
      lower.includes('beschreib') ||
      lower.includes('use case') ||
      lower.includes('anwendungsfall')
    ) {
      return 'detail-usecase';
    }

    // Function allocation keywords
    if (
      lower.includes('allocate') ||
      lower.includes('assign') ||
      lower.includes('module') ||
      lower.includes('zuweisen') ||
      lower.includes('allokier')
    ) {
      return 'allocate-functions';
    }

    // Validation keywords
    if (
      lower.includes('validate') ||
      lower.includes('phase') ||
      lower.includes('check') ||
      lower.includes('prüf') ||
      lower.includes('validier')
    ) {
      return 'validate-phase';
    }

    return 'general';
  }

  // ============================================================
  // Slicing Strategies
  // ============================================================

  /**
   * Slice by node types with depth expansion
   */
  private sliceByTypes(types: string[], depth: number): GraphSlice {
    const nodes = new Map<SemanticId, Node>();
    const edges = new Map<string, Edge>();

    const allNodes = this.agentDB.getNodes();
    const allEdges = this.agentDB.getEdges();

    // Get nodes of specified types
    const seedNodes = new Set<SemanticId>();
    for (const node of allNodes) {
      if (types.includes(node.type)) {
        nodes.set(node.semanticId, node);
        seedNodes.add(node.semanticId);
      }
    }

    // Expand to connected nodes up to depth
    this.expandByDepth(nodes, edges, seedNodes, allNodes, allEdges, depth);

    return {
      nodes,
      edges,
      depth,
      estimatedTokens: this.estimateTokensFromMaps(nodes, edges),
    };
  }

  /**
   * Slice neighbors of nodes with specific type
   */
  private sliceNeighbors(nodeType: string, depth: number): GraphSlice {
    const nodes = new Map<SemanticId, Node>();
    const edges = new Map<string, Edge>();

    const allNodes = this.agentDB.getNodes();
    const allEdges = this.agentDB.getEdges();

    // Get nodes of specified type
    const seedNodes = new Set<SemanticId>();
    for (const node of allNodes) {
      if (node.type === nodeType) {
        nodes.set(node.semanticId, node);
        seedNodes.add(node.semanticId);
      }
    }

    // Expand to neighbors
    this.expandByDepth(nodes, edges, seedNodes, allNodes, allEdges, depth);

    return {
      nodes,
      edges,
      depth,
      estimatedTokens: this.estimateTokensFromMaps(nodes, edges),
    };
  }

  /**
   * Slice by phase attribute
   */
  private sliceByPhase(phase: PhaseId): GraphSlice {
    const nodes = new Map<SemanticId, Node>();
    const edges = new Map<string, Edge>();

    const allNodes = this.agentDB.getNodes();
    const allEdges = this.agentDB.getEdges();

    // Map phase to numeric value
    const phaseNum = this.phaseToNumber(phase);

    // Get nodes for this phase (use attributes.phase if available)
    for (const node of allNodes) {
      const nodePhase = (node.attributes?.phase as number) ?? 2;
      if (nodePhase <= phaseNum) {
        nodes.set(node.semanticId, node);
      }
    }

    // Get edges between included nodes
    for (const edge of allEdges) {
      if (nodes.has(edge.sourceId) && nodes.has(edge.targetId)) {
        edges.set(edge.uuid, edge);
      }
    }

    return {
      nodes,
      edges,
      depth: 0, // Full phase, no depth limit
      estimatedTokens: this.estimateTokensFromMaps(nodes, edges),
    };
  }

  /**
   * Slice by mentioned node IDs in task text
   */
  private sliceByMentions(task: string, depth: number): GraphSlice {
    const nodes = new Map<SemanticId, Node>();
    const edges = new Map<string, Edge>();

    const allNodes = this.agentDB.getNodes();
    const allEdges = this.agentDB.getEdges();

    // Find mentioned semantic IDs
    const seedNodes = new Set<SemanticId>();
    for (const node of allNodes) {
      // Check if semantic ID or name is mentioned
      if (
        task.includes(node.semanticId) ||
        task.toLowerCase().includes(node.name?.toLowerCase() || '')
      ) {
        nodes.set(node.semanticId, node);
        seedNodes.add(node.semanticId);
      }
    }

    // If no mentions found, include system roots
    if (seedNodes.size === 0) {
      for (const node of allNodes) {
        if (node.type === 'SYS') {
          nodes.set(node.semanticId, node);
          seedNodes.add(node.semanticId);
        }
      }
    }

    // Expand to connected nodes
    this.expandByDepth(nodes, edges, seedNodes, allNodes, allEdges, depth);

    return {
      nodes,
      edges,
      depth,
      estimatedTokens: this.estimateTokensFromMaps(nodes, edges),
    };
  }

  // ============================================================
  // Helper Methods
  // ============================================================

  /**
   * Expand nodes by depth following edges
   */
  private expandByDepth(
    nodes: Map<SemanticId, Node>,
    edges: Map<string, Edge>,
    seedNodes: Set<SemanticId>,
    allNodes: Node[],
    allEdges: Edge[],
    maxDepth: number
  ): void {
    const nodeMap = new Map<SemanticId, Node>();
    for (const node of allNodes) {
      nodeMap.set(node.semanticId, node);
    }

    let frontier = new Set(seedNodes);
    let currentDepth = 0;

    while (currentDepth < maxDepth && frontier.size > 0) {
      const nextFrontier = new Set<SemanticId>();

      for (const edge of allEdges) {
        // Outgoing edges from frontier
        if (frontier.has(edge.sourceId) && !nodes.has(edge.targetId)) {
          const targetNode = nodeMap.get(edge.targetId);
          if (targetNode) {
            nodes.set(edge.targetId, targetNode);
            edges.set(edge.uuid, edge);
            nextFrontier.add(edge.targetId);
          }
        }

        // Incoming edges to frontier
        if (frontier.has(edge.targetId) && !nodes.has(edge.sourceId)) {
          const sourceNode = nodeMap.get(edge.sourceId);
          if (sourceNode) {
            nodes.set(edge.sourceId, sourceNode);
            edges.set(edge.uuid, edge);
            nextFrontier.add(edge.sourceId);
          }
        }

        // Edges between existing nodes
        if (nodes.has(edge.sourceId) && nodes.has(edge.targetId)) {
          edges.set(edge.uuid, edge);
        }
      }

      frontier = nextFrontier;
      currentDepth++;
    }
  }

  /**
   * Reduce slice depth by removing outer nodes
   */
  private reduceDepth(slice: GraphSlice, newDepth: number): GraphSlice {
    const nodes = new Map<SemanticId, Node>();
    const edges = new Map<string, Edge>();

    // Keep only nodes up to new depth (simplified: keep first N nodes)
    const maxNodes = Math.max(10, slice.nodes.size * (newDepth / slice.depth));
    let count = 0;

    for (const [id, node] of slice.nodes) {
      if (count >= maxNodes) break;
      nodes.set(id, node);
      count++;
    }

    // Keep edges between remaining nodes
    for (const [id, edge] of slice.edges) {
      if (nodes.has(edge.sourceId) && nodes.has(edge.targetId)) {
        edges.set(id, edge);
      }
    }

    return {
      nodes,
      edges,
      depth: newDepth,
      estimatedTokens: this.estimateTokensFromMaps(nodes, edges),
    };
  }

  /**
   * Estimate tokens from node/edge maps
   */
  private estimateTokensFromMaps(
    nodes: Map<SemanticId, Node>,
    edges: Map<string, Edge>
  ): number {
    let chars = 0;

    for (const node of nodes.values()) {
      chars += node.semanticId.length + (node.name?.length || 0) + 50;
      if (node.descr) {
        chars += node.descr.length;
      }
    }

    for (const edge of edges.values()) {
      chars += edge.sourceId.length + edge.targetId.length + edge.type.length + 20;
    }

    return Math.ceil(chars / 4);
  }

  /**
   * Convert phase ID to numeric value
   */
  private phaseToNumber(phase: PhaseId): number {
    switch (phase) {
      case 'phase1_requirements':
        return 1;
      case 'phase2_logical':
        return 2;
      case 'phase3_physical':
        return 3;
      case 'phase4_integration':
        return 4;
      default:
        return 2;
    }
  }
}

// ============================================================
// Factory Function
// ============================================================

/**
 * Create a Context Manager for an AgentDB instance
 */
export function createContextManager(agentDB: UnifiedAgentDBService): ContextManager {
  return new ContextManager(agentDB);
}
