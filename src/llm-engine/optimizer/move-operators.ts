/**
 * CR-028 Move Operators
 * Generic, node-type-agnostic mutations for architecture optimization
 *
 * Core operators:
 * - SPLIT: Split one node into two
 * - MERGE: Combine two nodes into one
 * - LINK: Add edge between nodes
 * - REALLOC: Move child from one parent to another
 * - CREATE: Create new node (parent, sibling, or standalone)
 * - DELETE: Remove node and reassign children
 *
 * @author andreas@siglochconsulting
 */

import {
  Architecture,
  Node,
  Edge,
  NodeType,
  Violation,
  MoveOperator,
  MoveOperatorType,
  MoveResult
} from './types.js';
import { generateSemanticId, generateEdgeId } from '../../shared/utils/semantic-id.js';

// ============================================================================
// Utility Functions
// ============================================================================

function cloneArchitecture(arch: Architecture): Architecture {
  return {
    id: arch.id,
    nodes: arch.nodes.map(n => ({ ...n, properties: { ...n.properties } })),
    edges: arch.edges.map(e => ({ ...e })),
    metadata: arch.metadata ? { ...arch.metadata } : undefined
  };
}

/**
 * Get set of existing node IDs for uniqueness check
 */
function getExistingIds(arch: Architecture): Set<string> {
  return new Set(arch.nodes.map(n => n.id));
}

function getNodeById(arch: Architecture, id: string): Node | undefined {
  return arch.nodes.find(n => n.id === id);
}

function getEdgesFrom(arch: Architecture, nodeId: string): Edge[] {
  return arch.edges.filter(e => e.source === nodeId);
}

function getEdgesTo(arch: Architecture, nodeId: string): Edge[] {
  return arch.edges.filter(e => e.target === nodeId);
}

// Edge type mapping: parent type → child type → edge type
const CONTAINMENT_EDGES: Record<string, Record<string, string>> = {
  'MOD': { 'FUNC': 'allocate' },
  'UC': { 'FUNC': 'compose', 'REQ': 'derive' },
  'SYS': { 'UC': 'compose', 'MOD': 'compose' },
  'REQ': { 'TEST': 'verify' }
};

// Get the containment edge type between parent and child
function getContainmentEdgeType(parentType: NodeType, childType: NodeType): string | null {
  return CONTAINMENT_EDGES[parentType]?.[childType] ?? null;
}

// Get children of a node (based on containment edges)
// Supports both edge directions: child→parent and parent→child
function getChildren(arch: Architecture, parentId: string, childType?: NodeType): string[] {
  const parent = getNodeById(arch, parentId);
  if (!parent) return [];

  const edgeTypes = CONTAINMENT_EDGES[parent.type];
  if (!edgeTypes) return [];

  const children: string[] = [];

  for (const edge of arch.edges) {
    if (!Object.values(edgeTypes).includes(edge.type)) continue;

    // Try direction 1: child → parent (e.target === parentId)
    if (edge.target === parentId) {
      const sourceNode = getNodeById(arch, edge.source);
      if (sourceNode && (!childType || sourceNode.type === childType)) {
        children.push(edge.source);
      }
    }
    // Try direction 2: parent → child (e.source === parentId)
    else if (edge.source === parentId) {
      const targetNode = getNodeById(arch, edge.target);
      if (targetNode && (!childType || targetNode.type === childType)) {
        children.push(edge.target);
      }
    }
  }

  return children;
}

// ============================================================================
// SPLIT Operator (Generic)
// Splits a node into two, distributing children between them
// ============================================================================

const splitOperator: MoveOperator = {
  type: 'SPLIT',
  applicableTo: ['millers_law_func', 'oversized_mod', 'func_complexity', 'oversized'],

  apply(arch: Architecture, violation: Violation): Architecture | null {
    const result = cloneArchitecture(arch);
    const existingIds = getExistingIds(result);

    // Find the node to split (could be MOD, FUNC, UC, etc.)
    const nodeId = violation.affectedNodes[0];
    const node = getNodeById(result, nodeId);
    if (!node) return null;

    // Find children (e.g., FUNCs for MOD, or sub-FUNCs for FUNC)
    const children = getChildren(result, nodeId);

    // Only split if there are enough children to distribute
    if (children.length < 2) return null;

    // Create new sibling node with readable semanticId
    const newLabel = `${node.label}_B`;
    const newNode: Node = {
      id: generateSemanticId(newLabel, node.type, existingIds),
      type: node.type,
      label: newLabel,
      properties: { ...node.properties, splitFrom: nodeId }
    };
    result.nodes.push(newNode);
    existingIds.add(newNode.id);

    // Move half the children to the new node
    const childrenToMove = children.slice(Math.ceil(children.length / 2));

    for (const childId of childrenToMove) {
      const child = getNodeById(result, childId);
      if (!child) continue;

      const edgeType = getContainmentEdgeType(node.type, child.type);
      if (!edgeType) continue;

      // Remove old edge
      result.edges = result.edges.filter(e =>
        !(e.source === childId && e.target === nodeId && e.type === edgeType)
      );

      // Add new edge to new node
      result.edges.push({
        id: generateEdgeId(childId, edgeType, newNode.id),
        source: childId,
        target: newNode.id,
        type: edgeType
      });
    }

    return result;
  }
};

// ============================================================================
// MERGE Operator (Generic)
// Merges two undersized nodes into one
// ============================================================================

const mergeOperator: MoveOperator = {
  type: 'MERGE',
  applicableTo: [
    'millers_law_func', 'undersized_mod', 'undersized', 'fragmented',
    // CR-049: Similarity-based merging
    'func_merge_candidate',      // FUNC similarity >= 0.70
    'func_near_duplicate',       // FUNC similarity >= 0.85
    'schema_merge_candidate',    // SCHEMA similarity >= 0.70
    'schema_near_duplicate'      // SCHEMA similarity >= 0.85
  ],

  apply(arch: Architecture, violation: Violation): Architecture | null {
    const result = cloneArchitecture(arch);
    const existingIds = getExistingIds(result);

    // CR-049: For similarity violations, both nodes are specified in affectedNodes
    const isSimilarityViolation = [
      'func_merge_candidate', 'func_near_duplicate',
      'schema_merge_candidate', 'schema_near_duplicate'
    ].includes(violation.ruleId);

    let node1: Node | undefined;
    let node2: Node | undefined;

    if (isSimilarityViolation && violation.affectedNodes.length >= 2) {
      // Similarity violation: merge the two specified nodes
      node1 = getNodeById(result, violation.affectedNodes[0]);
      node2 = getNodeById(result, violation.affectedNodes[1]);
    } else {
      // Original behavior: find undersized containers
      node1 = getNodeById(result, violation.affectedNodes[0]);
      if (!node1) return null;

      // Find another undersized node of same type to merge with
      const candidates = result.nodes.filter(n =>
        n.type === node1!.type &&
        n.id !== node1!.id &&
        getChildren(result, n.id).length < 5 // Also undersized
      );

      if (candidates.length === 0) return null;
      node2 = candidates[0];
    }

    if (!node1 || !node2) return null;

    // Create merged node with readable semanticId
    const mergedLabel = `${node1.label}+${node2.label}`;
    const mergedNode: Node = {
      id: generateSemanticId(mergedLabel, node1.type, existingIds),
      type: node1.type,
      label: mergedLabel,
      properties: {
        mergedFrom: [node1.id, node2.id],
        ...node1.properties
      }
    };
    result.nodes.push(mergedNode);
    existingIds.add(mergedNode.id);

    // Re-route all edges from both nodes to merged node
    const edgesToRemove: string[] = [];
    const edgesToAdd: Edge[] = [];

    for (const oldNodeId of [node1.id, node2.id]) {
      // Incoming edges (children → parent)
      for (const edge of getEdgesTo(result, oldNodeId)) {
        // Skip edges between the two being merged
        if (edge.source === node1.id || edge.source === node2.id) {
          edgesToRemove.push(edge.id);
          continue;
        }
        edgesToAdd.push({ ...edge, id: generateEdgeId(edge.source, edge.type, mergedNode.id), target: mergedNode.id });
        edgesToRemove.push(edge.id);
      }

      // Outgoing edges
      for (const edge of getEdgesFrom(result, oldNodeId)) {
        if (edge.target === node1.id || edge.target === node2.id) {
          edgesToRemove.push(edge.id);
          continue;
        }
        edgesToAdd.push({ ...edge, id: generateEdgeId(mergedNode.id, edge.type, edge.target), source: mergedNode.id });
        edgesToRemove.push(edge.id);
      }
    }

    // Apply changes
    result.edges = result.edges.filter(e => !edgesToRemove.includes(e.id));
    result.edges.push(...edgesToAdd);
    result.nodes = result.nodes.filter(n => n.id !== node1.id && n.id !== node2.id);

    return result;
  }
};

// ============================================================================
// LINK Operator (Generic)
// Adds missing edge between nodes
// ============================================================================

const linkOperator: MoveOperator = {
  type: 'LINK',
  applicableTo: [
    'isolation', 'orphan_func', 'missing_io_connection',
    'function_requirements', 'orphan_req', 'missing_traceability',
    'requirements_verification', 'orphan_test', 'missing_test_coverage'
  ],

  apply(arch: Architecture, violation: Violation): Architecture | null {
    const result = cloneArchitecture(arch);

    const nodeId = violation.affectedNodes[0];
    const node = getNodeById(result, nodeId);
    if (!node) return null;

    // Determine what kind of link is needed based on node type and violation
    if (violation.ruleId.includes('isolation') || violation.ruleId.includes('io')) {
      // FUNC needs io edge to another FUNC
      if (node.type !== 'FUNC') return null;

      // Find sibling FUNC in same MOD
      const allocEdge = result.edges.find(e => e.source === nodeId && e.type === 'allocate');
      if (!allocEdge) return null;

      const siblings = result.edges
        .filter(e => e.type === 'allocate' && e.target === allocEdge.target && e.source !== nodeId)
        .map(e => e.source);

      if (siblings.length === 0) {
        // No sibling, find any other FUNC
        const otherFuncs = result.nodes.filter(n => n.type === 'FUNC' && n.id !== nodeId);
        if (otherFuncs.length === 0) return null;
        siblings.push(otherFuncs[0].id);
      }

      result.edges.push({
        id: generateEdgeId(nodeId, 'io', siblings[0]),
        source: nodeId,
        target: siblings[0],
        type: 'io'
      });
    }
    else if (violation.ruleId.includes('requirement') || violation.ruleId.includes('satisfy')) {
      // REQ needs satisfy edge from FUNC
      if (node.type !== 'REQ') return null;

      const hasSatisfy = result.edges.some(e => e.target === nodeId && e.type === 'satisfy');
      if (hasSatisfy) return null;

      const funcs = result.nodes.filter(n => n.type === 'FUNC');
      if (funcs.length === 0) return null;

      result.edges.push({
        id: generateEdgeId(funcs[0].id, 'satisfy', nodeId),
        source: funcs[0].id,
        target: nodeId,
        type: 'satisfy'
      });
    }
    else if (violation.ruleId.includes('verification') || violation.ruleId.includes('test')) {
      // REQ needs verify edge to TEST
      if (node.type !== 'REQ') return null;

      const hasVerify = result.edges.some(e => e.source === nodeId && e.type === 'verify');
      if (hasVerify) return null;

      // Find or create TEST
      let test = result.nodes.find(n => n.type === 'TEST');
      if (!test) {
        const existingIds = getExistingIds(result);
        const testLabel = `Test_${node.label}`;
        test = {
          id: generateSemanticId(testLabel, 'TEST', existingIds),
          type: 'TEST',
          label: testLabel,
          properties: { synthetic: true }
        };
        result.nodes.push(test);
      }

      result.edges.push({
        id: generateEdgeId(nodeId, 'verify', test.id),
        source: nodeId,
        target: test.id,
        type: 'verify'
      });
    }

    return result;
  }
};

// ============================================================================
// CREATE Operator (Generic)
// Creates new node to fix missing structure
// ============================================================================

const createOperator: MoveOperator = {
  type: 'CREATE',
  applicableTo: [
    'missing_parent', 'orphan_func', 'orphan_req', 'missing_test',
    'no_mod_for_func', 'no_uc_for_func', 'missing_container'
  ],

  apply(arch: Architecture, violation: Violation): Architecture | null {
    const result = cloneArchitecture(arch);
    const existingIds = getExistingIds(result);

    const nodeId = violation.affectedNodes[0];
    const node = getNodeById(result, nodeId);
    if (!node) return null;

    // Determine what to create based on node type and violation
    let newNode: Node | null = null;
    let edgeType: string | null = null;
    let edgeDirection: 'to_new' | 'from_new' = 'to_new';

    if (node.type === 'FUNC') {
      // FUNC without MOD → create MOD
      const hasParent = result.edges.some(e =>
        e.source === nodeId && e.type === 'allocate'
      );
      if (!hasParent) {
        const modLabel = `MOD_for_${node.label}`;
        newNode = {
          id: generateSemanticId(modLabel, 'MOD', existingIds),
          type: 'MOD',
          label: modLabel,
          properties: { synthetic: true }
        };
        edgeType = 'allocate';
        edgeDirection = 'to_new';
      }
    }
    else if (node.type === 'REQ') {
      // REQ without TEST → create TEST
      const hasTest = result.edges.some(e =>
        e.source === nodeId && e.type === 'verify'
      );
      if (!hasTest) {
        const testLabel = `Test_${node.label}`;
        newNode = {
          id: generateSemanticId(testLabel, 'TEST', existingIds),
          type: 'TEST',
          label: testLabel,
          properties: { synthetic: true }
        };
        edgeType = 'verify';
        edgeDirection = 'to_new';
      }
    }
    else if (node.type === 'UC') {
      // UC without SYS → create SYS (or find existing)
      const hasParent = result.edges.some(e =>
        e.source === nodeId && e.type === 'compose'
      );
      if (!hasParent) {
        // Try to find existing SYS first
        const existingSys = result.nodes.find(n => n.type === 'SYS');
        if (existingSys) {
          // Just link to existing SYS
          result.edges.push({
            id: generateEdgeId(nodeId, 'compose', existingSys.id),
            source: nodeId,
            target: existingSys.id,
            type: 'compose'
          });
          return result;
        }
        // No SYS exists, create one
        newNode = {
          id: generateSemanticId('System', 'SYS', existingIds),
          type: 'SYS',
          label: 'System',
          properties: { synthetic: true }
        };
        edgeType = 'compose';
        edgeDirection = 'to_new';
      }
    }
    else if (node.type === 'MOD') {
      // MOD without SYS → link to or create SYS
      const hasParent = result.edges.some(e =>
        e.source === nodeId && e.type === 'compose'
      );
      if (!hasParent) {
        const existingSys = result.nodes.find(n => n.type === 'SYS');
        if (existingSys) {
          result.edges.push({
            id: generateEdgeId(nodeId, 'compose', existingSys.id),
            source: nodeId,
            target: existingSys.id,
            type: 'compose'
          });
          return result;
        }
        newNode = {
          id: generateSemanticId('System', 'SYS', existingIds),
          type: 'SYS',
          label: 'System',
          properties: { synthetic: true }
        };
        edgeType = 'compose';
        edgeDirection = 'to_new';
      }
    }

    if (!newNode || !edgeType) return null;

    result.nodes.push(newNode);

    // Add edge
    if (edgeDirection === 'to_new') {
      result.edges.push({
        id: generateEdgeId(nodeId, edgeType, newNode.id),
        source: nodeId,
        target: newNode.id,
        type: edgeType
      });
    } else {
      result.edges.push({
        id: generateEdgeId(newNode.id, edgeType, nodeId),
        source: newNode.id,
        target: nodeId,
        type: edgeType
      });
    }

    return result;
  }
};

// ============================================================================
// DELETE Operator (Generic)
// Removes node and reassigns its children to siblings
// ============================================================================

const deleteOperator: MoveOperator = {
  type: 'DELETE',
  applicableTo: [
    'empty_mod', 'empty_uc', 'redundant', 'duplicate',
    'unused', 'dead_code', 'obsolete',
    // CR-049: Delete excess allocate edges for cross-cutting FUNCs
    'allocation_cohesion'
  ],

  apply(arch: Architecture, violation: Violation): Architecture | null {
    const result = cloneArchitecture(arch);

    const nodeId = violation.affectedNodes[0];
    const node = getNodeById(result, nodeId);
    if (!node) return null;

    // Get children of the node being deleted
    const children = getChildren(result, nodeId);

    // Find sibling node to adopt children (same type, different id)
    const sibling = result.nodes.find(n =>
      n.type === node.type && n.id !== nodeId
    );

    // Reassign children to sibling (if any)
    if (children.length > 0 && sibling) {
      for (const childId of children) {
        const child = getNodeById(result, childId);
        if (!child) continue;

        const edgeType = getContainmentEdgeType(node.type, child.type);
        if (!edgeType) continue;

        // Remove edge to deleted node
        result.edges = result.edges.filter(e =>
          !(e.source === childId && e.target === nodeId && e.type === edgeType)
        );

        // Add edge to sibling
        result.edges.push({
          id: generateEdgeId(childId, edgeType, sibling.id),
          source: childId,
          target: sibling.id,
          type: edgeType
        });
      }
    } else if (children.length > 0 && !sibling) {
      // No sibling to adopt children → cannot delete safely
      return null;
    }

    // Remove all edges connected to this node
    result.edges = result.edges.filter(e =>
      e.source !== nodeId && e.target !== nodeId
    );

    // Remove the node
    result.nodes = result.nodes.filter(n => n.id !== nodeId);

    return result;
  }
};

// ============================================================================
// REALLOC Operator (Generic)
// Moves a child from one parent to another
// ============================================================================

const reallocOperator: MoveOperator = {
  type: 'REALLOC',
  applicableTo: [
    'volatile_func_isolation', 'high_volatility', 'imbalanced', 'coupling',
    // CR-049: Allocation cohesion - remove cross-cutting allocations
    'allocation_cohesion'
  ],

  apply(arch: Architecture, violation: Violation): Architecture | null {
    const result = cloneArchitecture(arch);
    const existingIds = getExistingIds(result);

    const nodeId = violation.affectedNodes[0];
    const node = getNodeById(result, nodeId);
    if (!node) return null;

    // CR-049: For allocation_cohesion, remove excess allocate edges
    if (violation.ruleId === 'allocation_cohesion' && node.type === 'FUNC') {
      // affectedNodes = [funcId, modId1, modId2, ...]
      // Keep only the first MOD allocation, remove the rest
      const modIds = violation.affectedNodes.slice(1);
      if (modIds.length < 2) return null;

      // Find all allocate edges for this FUNC
      const allocateEdges = result.edges.filter(e =>
        e.type === 'allocate' &&
        (e.source === nodeId || e.target === nodeId)
      );

      if (allocateEdges.length < 2) return null;

      // Keep the first allocate edge, remove the rest
      const edgesToRemove = allocateEdges.slice(1).map(e => e.id);
      result.edges = result.edges.filter(e => !edgesToRemove.includes(e.id));

      return result;
    }

    // Original behavior for other violations
    // Find current parent (via containment edge)
    const containmentEdge = result.edges.find(e => {
      if (e.source !== nodeId) return false;
      const target = getNodeById(result, e.target);
      if (!target) return false;
      const edgeType = getContainmentEdgeType(target.type, node.type);
      return e.type === edgeType;
    });

    if (!containmentEdge) return null;

    const currentParent = getNodeById(result, containmentEdge.target);
    if (!currentParent) return null;

    // Find or create a new parent
    let newParent: Node | undefined;

    // For high-volatility FUNCs, find/create dedicated high-vol MOD
    if (node.type === 'FUNC' && ((node.properties.volatility as number) ?? 0) >= 0.7) {
      newParent = result.nodes.find(n =>
        n.type === 'MOD' && n.properties.highVolatility === true
      );

      if (!newParent) {
        const highVolLabel = 'MOD_HighVol';
        newParent = {
          id: generateSemanticId(highVolLabel, 'MOD', existingIds),
          type: 'MOD',
          label: highVolLabel,
          properties: { highVolatility: true }
        };
        result.nodes.push(newParent);
      }
    } else {
      // Find another parent of same type with fewer children
      const candidates = result.nodes.filter(n =>
        n.type === currentParent.type &&
        n.id !== currentParent.id &&
        getChildren(result, n.id, node.type).length < 7
      );

      if (candidates.length === 0) return null;
      newParent = candidates[0];
    }

    // Remove old containment edge
    result.edges = result.edges.filter(e => e.id !== containmentEdge.id);

    // Add new containment edge
    const edgeType = getContainmentEdgeType(newParent.type, node.type);
    if (!edgeType) return null;

    result.edges.push({
      id: generateEdgeId(nodeId, edgeType, newParent.id),
      source: nodeId,
      target: newParent.id,
      type: edgeType
    });

    return result;
  }
};

// ============================================================================
// Operator Registry
// ============================================================================

export const MOVE_OPERATORS: Record<MoveOperatorType, MoveOperator> = {
  // Generic operators (6 core operations)
  SPLIT: splitOperator,
  MERGE: mergeOperator,
  LINK: linkOperator,
  REALLOC: reallocOperator,
  CREATE: createOperator,
  DELETE: deleteOperator,

  // Legacy aliases (map to generic)
  FUNC_SPLIT: splitOperator,
  FUNC_MERGE: mergeOperator,
  MOD_SPLIT: splitOperator,
  FLOW_REDIRECT: linkOperator,
  FLOW_CONSOLIDATE: linkOperator,
  ALLOC_SHIFT: reallocOperator,
  ALLOC_REBALANCE: reallocOperator,
  REQ_LINK: linkOperator,
  TEST_LINK: linkOperator
};

// ============================================================================
// Operator Selection
// ============================================================================

/**
 * Get applicable operators for a set of violations
 */
export function getApplicableOperators(violations: Violation[]): MoveOperatorType[] {
  const applicable = new Set<MoveOperatorType>();

  for (const violation of violations) {
    for (const [opType, op] of Object.entries(MOVE_OPERATORS)) {
      if (op.applicableTo.includes(violation.ruleId)) {
        applicable.add(opType as MoveOperatorType);
      }
    }
  }

  return Array.from(applicable);
}

/**
 * Apply an operator and return the result
 */
export function applyOperator(
  arch: Architecture,
  operatorType: MoveOperatorType,
  violation: Violation
): MoveResult {
  const operator = MOVE_OPERATORS[operatorType];
  const after = operator.apply(arch, violation);

  return {
    operator: operatorType,
    success: after !== null,
    before: arch,
    after,
    affectedNodes: violation.affectedNodes,
    description: `Applied ${operatorType} to fix ${violation.ruleId}`
  };
}

/**
 * Try all applicable operators and return successful results
 */
export function tryAllOperators(
  arch: Architecture,
  violations: Violation[]
): MoveResult[] {
  const results: MoveResult[] = [];

  for (const violation of violations) {
    for (const [opType, op] of Object.entries(MOVE_OPERATORS)) {
      if (op.applicableTo.includes(violation.ruleId)) {
        const result = applyOperator(arch, opType as MoveOperatorType, violation);
        if (result.success) {
          results.push(result);
        }
      }
    }
  }

  return results;
}
