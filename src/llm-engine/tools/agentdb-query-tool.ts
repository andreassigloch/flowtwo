/**
 * AgentDB Query Tool - Graph Query Tool for LLM Agents
 *
 * CR-048: Provides LLM agents with ability to query graph structure
 * before making changes. Enables checking for existing edges, understanding
 * io-flow-io chains, and avoiding duplicate/circular connections.
 *
 * @author andreas@siglochconsulting
 */

import { UnifiedAgentDBService } from '../agentdb/unified-agentdb-service.js';
import type { Edge } from '../../shared/types/ontology.js';
import type { Tool, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages.js';

// ============================================================
// Types
// ============================================================

export type QueryType = 'edges' | 'nodes' | 'check_edge' | 'io_chain';

export interface QueryFilters {
  sourceType?: string;
  targetType?: string;
  edgeType?: string;
  nodeType?: string;
  semanticId?: string;
  sourceId?: string;
  targetId?: string;
  fchainId?: string;
}

export interface QueryInput {
  queryType: QueryType;
  filters?: QueryFilters;
}

export interface EdgeResult {
  uuid: string;
  sourceId: string;
  targetId: string;
  type: string;
  sourceType?: string;
  targetType?: string;
}

export interface NodeResult {
  semanticId: string;
  name: string;
  type: string;
  descr?: string;
}

export interface IoChainStep {
  step: number;
  from: { id: string; type: string; name: string };
  flow?: { id: string; name: string };
  to: { id: string; type: string; name: string };
}

export interface IoChainIssue {
  type: 'bidirectional' | 'circular' | 'duplicate';
  flow?: string;
  nodes: string[];
  description: string;
}

export interface QueryResult {
  success: boolean;
  queryType: QueryType;
  count?: number;
  edges?: EdgeResult[];
  nodes?: NodeResult[];
  exists?: boolean;
  edge?: EdgeResult;
  chain?: IoChainStep[];
  issues?: IoChainIssue[];
  error?: string;
}

// ============================================================
// Tool Definition for Anthropic API
// ============================================================

export const GRAPH_QUERY_TOOL: Tool = {
  name: 'graph_query',
  description:
    'Query the current graph structure to understand existing nodes and edges before making changes. ' +
    'Use this to check for existing connections, understand io-flow-io chains, and avoid creating ' +
    'duplicate or circular edges. ALWAYS use this tool before creating io edges to verify the ' +
    'current state and avoid violations.',
  input_schema: {
    type: 'object' as const,
    properties: {
      queryType: {
        type: 'string',
        enum: ['edges', 'nodes', 'check_edge', 'io_chain'],
        description:
          "Query type: 'edges' to find edges by type/source/target, 'nodes' to find nodes by type, " +
          "'check_edge' to verify if specific edge exists, 'io_chain' to analyze io-flow-io patterns in FCHAIN",
      },
      filters: {
        type: 'object',
        properties: {
          sourceType: {
            type: 'string',
            description: 'Node type of edge source (SYS, FUNC, FLOW, ACTOR, etc.)',
          },
          targetType: {
            type: 'string',
            description: 'Node type of edge target',
          },
          edgeType: {
            type: 'string',
            description: 'Edge type: compose, io, satisfy, verify, allocate, relation',
          },
          nodeType: {
            type: 'string',
            description: 'Filter nodes by type',
          },
          semanticId: {
            type: 'string',
            description: 'Specific node semantic ID to query edges for',
          },
          sourceId: {
            type: 'string',
            description: 'Source node ID for check_edge',
          },
          targetId: {
            type: 'string',
            description: 'Target node ID for check_edge',
          },
          fchainId: {
            type: 'string',
            description: 'FCHAIN semantic ID for io_chain query',
          },
        },
      },
    },
    required: ['queryType'],
  },
};

// ============================================================
// Query Handler
// ============================================================

export class AgentDBQueryTool {
  constructor(private agentDB: UnifiedAgentDBService) {}

  /**
   * Execute a query against AgentDB
   */
  async execute(input: QueryInput): Promise<QueryResult> {
    const { queryType, filters = {} } = input;

    try {
      switch (queryType) {
        case 'edges':
          return this.queryEdges(filters);
        case 'nodes':
          return this.queryNodes(filters);
        case 'check_edge':
          return this.checkEdge(filters);
        case 'io_chain':
          return this.queryIoChain(filters);
        default:
          return {
            success: false,
            queryType,
            error: `Unknown query type: ${queryType}`,
          };
      }
    } catch (error) {
      return {
        success: false,
        queryType,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Convert result to tool_result format for Anthropic API
   */
  toToolResult(toolUseId: string, result: QueryResult): ToolResultBlockParam {
    return {
      type: 'tool_result',
      tool_use_id: toolUseId,
      content: JSON.stringify(result, null, 2),
    };
  }

  // ============================================================
  // Query Implementations
  // ============================================================

  /**
   * Query edges with filters
   */
  private queryEdges(filters: QueryFilters): QueryResult {
    const allEdges = this.agentDB.getEdges();
    const allNodes = this.agentDB.getNodes();
    const nodeMap = new Map(allNodes.map((n) => [n.semanticId, n]));

    let filteredEdges = allEdges;

    // Filter by edge type
    if (filters.edgeType) {
      filteredEdges = filteredEdges.filter((e) => e.type === filters.edgeType);
    }

    // Filter by source type
    if (filters.sourceType) {
      filteredEdges = filteredEdges.filter((e) => {
        const sourceNode = nodeMap.get(e.sourceId);
        return sourceNode?.type === filters.sourceType;
      });
    }

    // Filter by target type
    if (filters.targetType) {
      filteredEdges = filteredEdges.filter((e) => {
        const targetNode = nodeMap.get(e.targetId);
        return targetNode?.type === filters.targetType;
      });
    }

    // Filter by specific node (source or target)
    if (filters.semanticId) {
      filteredEdges = filteredEdges.filter(
        (e) => e.sourceId === filters.semanticId || e.targetId === filters.semanticId
      );
    }

    const edges: EdgeResult[] = filteredEdges.map((e) => ({
      uuid: e.uuid,
      sourceId: e.sourceId,
      targetId: e.targetId,
      type: e.type,
      sourceType: nodeMap.get(e.sourceId)?.type,
      targetType: nodeMap.get(e.targetId)?.type,
    }));

    return {
      success: true,
      queryType: 'edges',
      count: edges.length,
      edges,
    };
  }

  /**
   * Query nodes with filters
   */
  private queryNodes(filters: QueryFilters): QueryResult {
    const allNodes = this.agentDB.getNodes();

    let filteredNodes = allNodes;

    // Filter by node type
    if (filters.nodeType) {
      filteredNodes = filteredNodes.filter((n) => n.type === filters.nodeType);
    }

    // Filter by specific semantic ID
    if (filters.semanticId) {
      filteredNodes = filteredNodes.filter((n) => n.semanticId === filters.semanticId);
    }

    const nodes: NodeResult[] = filteredNodes.map((n) => ({
      semanticId: n.semanticId,
      name: n.name,
      type: n.type,
      descr: n.descr,
    }));

    return {
      success: true,
      queryType: 'nodes',
      count: nodes.length,
      nodes,
    };
  }

  /**
   * Check if a specific edge exists
   */
  private checkEdge(filters: QueryFilters): QueryResult {
    const { sourceId, targetId, edgeType } = filters;

    if (!sourceId || !targetId) {
      return {
        success: false,
        queryType: 'check_edge',
        error: 'check_edge requires both sourceId and targetId in filters',
      };
    }

    const allEdges = this.agentDB.getEdges();

    const existingEdge = allEdges.find((e) => {
      const matchSource = e.sourceId === sourceId;
      const matchTarget = e.targetId === targetId;
      const matchType = edgeType ? e.type === edgeType : true;
      return matchSource && matchTarget && matchType;
    });

    if (existingEdge) {
      return {
        success: true,
        queryType: 'check_edge',
        exists: true,
        edge: {
          uuid: existingEdge.uuid,
          sourceId: existingEdge.sourceId,
          targetId: existingEdge.targetId,
          type: existingEdge.type,
        },
      };
    }

    return {
      success: true,
      queryType: 'check_edge',
      exists: false,
    };
  }

  /**
   * Analyze io-flow-io chain within an FCHAIN
   * Detects bidirectional, circular, and duplicate io edges
   */
  private queryIoChain(filters: QueryFilters): QueryResult {
    const { fchainId } = filters;

    if (!fchainId) {
      return {
        success: false,
        queryType: 'io_chain',
        error: 'io_chain requires fchainId in filters',
      };
    }

    const allNodes = this.agentDB.getNodes();
    const allEdges = this.agentDB.getEdges();
    const nodeMap = new Map(allNodes.map((n) => [n.semanticId, n]));

    // Find FCHAIN node
    const fchainNode = nodeMap.get(fchainId);
    if (!fchainNode || fchainNode.type !== 'FCHAIN') {
      return {
        success: false,
        queryType: 'io_chain',
        error: `FCHAIN not found: ${fchainId}`,
      };
    }

    // Get children of FCHAIN (via compose edges)
    const composeEdges = allEdges.filter((e) => e.sourceId === fchainId && e.type === 'compose');
    const childIds = new Set(composeEdges.map((e) => e.targetId));

    // Get io edges within FCHAIN scope
    const ioEdges = allEdges.filter(
      (e) => e.type === 'io' && (childIds.has(e.sourceId) || childIds.has(e.targetId))
    );

    // Build chain steps
    const chain: IoChainStep[] = [];
    const issues: IoChainIssue[] = [];

    // Detect bidirectional edges (A->FLOW->A)
    const flowNodes = allNodes.filter((n) => n.type === 'FLOW' && childIds.has(n.semanticId));
    for (const flow of flowNodes) {
      const incomingToFlow = ioEdges.filter((e) => e.targetId === flow.semanticId);
      const outgoingFromFlow = ioEdges.filter((e) => e.sourceId === flow.semanticId);

      // Check for bidirectional: same node writes and reads same FLOW
      for (const incoming of incomingToFlow) {
        for (const outgoing of outgoingFromFlow) {
          if (incoming.sourceId === outgoing.targetId) {
            issues.push({
              type: 'bidirectional',
              flow: flow.semanticId,
              nodes: [incoming.sourceId],
              description: `${incoming.sourceId} both writes to and reads from ${flow.semanticId}`,
            });
          }
        }
      }

      // Build chain steps from this FLOW
      for (const incoming of incomingToFlow) {
        for (const outgoing of outgoingFromFlow) {
          if (incoming.sourceId !== outgoing.targetId) {
            const sourceNode = nodeMap.get(incoming.sourceId);
            const targetNode = nodeMap.get(outgoing.targetId);
            if (sourceNode && targetNode) {
              chain.push({
                step: chain.length + 1,
                from: { id: sourceNode.semanticId, type: sourceNode.type, name: sourceNode.name },
                flow: { id: flow.semanticId, name: flow.name },
                to: { id: targetNode.semanticId, type: targetNode.type, name: targetNode.name },
              });
            }
          }
        }
      }
    }

    // Detect duplicates (same edge added multiple times)
    const edgeKeys = new Map<string, Edge[]>();
    for (const edge of ioEdges) {
      const key = `${edge.sourceId}->${edge.targetId}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.set(key, []);
      }
      edgeKeys.get(key)!.push(edge);
    }
    for (const [key, edges] of edgeKeys) {
      if (edges.length > 1) {
        issues.push({
          type: 'duplicate',
          nodes: [edges[0].sourceId, edges[0].targetId],
          description: `Duplicate io edge: ${key} (${edges.length} times)`,
        });
      }
    }

    return {
      success: true,
      queryType: 'io_chain',
      chain,
      issues,
      count: chain.length,
    };
  }
}

// ============================================================
// Factory Function
// ============================================================

/**
 * Create AgentDB Query Tool instance
 */
export function createAgentDBQueryTool(agentDB: UnifiedAgentDBService): AgentDBQueryTool {
  return new AgentDBQueryTool(agentDB);
}
