/**
 * Variant Pool (CR-032 Phase 4)
 *
 * Manages isolated graph variants for optimization experiments.
 * Allows comparing multiple graph states without affecting the main graph.
 *
 * Features:
 * - Create isolated variants from main graph
 * - Apply changes to variants independently
 * - Promote winning variant to main graph
 * - Hot/warm/cold tiering for memory efficiency
 *
 * @author andreas@siglochconsulting
 */

import type { Node, Edge } from '../../shared/types/ontology.js';

/**
 * Tier levels for memory management
 */
export enum VariantTier {
  HOT = 'hot',     // Full precision, frequent access
  WARM = 'warm',   // Full precision, infrequent access
  COLD = 'cold',   // Compressed, archived
}

/**
 * Graph state snapshot
 */
export interface GraphState {
  nodes: Map<string, Node>;
  edges: Map<string, Edge>;
  version: number;
}

/**
 * Variant metadata
 */
export interface VariantInfo {
  id: string;
  baseSystemId: string;
  createdAt: Date;
  tier: VariantTier;
  nodeCount: number;
  edgeCount: number;
  version: number;
  lastAccessed: Date;
}

/**
 * Diff operation for variant changes
 */
export interface GraphDiff {
  addNodes?: Node[];
  updateNodes?: Node[];
  deleteNodes?: string[];
  addEdges?: Edge[];
  updateEdges?: Edge[];
  deleteEdges?: string[];
}

/**
 * Variant Pool
 *
 * Manages multiple isolated graph variants for optimization.
 */
export class VariantPool {
  private variants: Map<string, GraphState> = new Map();
  private metadata: Map<string, VariantInfo> = new Map();
  private variantCounter = 0;

  // Tier configuration
  private readonly tierConfig = {
    warmAfterMs: 5 * 60 * 1000,   // Move to warm after 5 minutes of inactivity
    coldAfterMs: 30 * 60 * 1000,  // Move to cold after 30 minutes
    maxHotVariants: 3,            // Maximum hot variants
    maxWarmVariants: 10,          // Maximum warm variants
  };

  /**
   * Create a new variant from base graph state
   */
  createVariant(baseSystemId: string, baseState: GraphState): string {
    this.variantCounter++;
    const variantId = `variant-${baseSystemId}-${this.variantCounter}`;

    // Deep copy the graph state
    const variantState: GraphState = {
      nodes: new Map(
        Array.from(baseState.nodes.entries()).map(([k, v]) => [k, { ...v }])
      ),
      edges: new Map(
        Array.from(baseState.edges.entries()).map(([k, v]) => [k, { ...v }])
      ),
      version: baseState.version,
    };

    this.variants.set(variantId, variantState);

    const now = new Date();
    this.metadata.set(variantId, {
      id: variantId,
      baseSystemId,
      createdAt: now,
      tier: VariantTier.HOT,
      nodeCount: variantState.nodes.size,
      edgeCount: variantState.edges.size,
      version: variantState.version,
      lastAccessed: now,
    });

    // Manage tiers after creating new variant
    this.manageTiers();

    return variantId;
  }

  /**
   * Get variant state (updates last accessed time)
   */
  getVariant(variantId: string): GraphState | null {
    const state = this.variants.get(variantId);
    if (!state) return null;

    const meta = this.metadata.get(variantId);
    if (meta) {
      meta.lastAccessed = new Date();
      // Promote to hot if accessed
      if (meta.tier !== VariantTier.HOT) {
        this.promoteToHot(variantId);
      }
    }

    return state;
  }

  /**
   * Apply diff to a variant
   */
  applyToVariant(variantId: string, diff: GraphDiff): void {
    const state = this.variants.get(variantId);
    if (!state) {
      throw new Error(`Variant '${variantId}' not found`);
    }

    // Add nodes
    if (diff.addNodes) {
      for (const node of diff.addNodes) {
        state.nodes.set(node.semanticId, node);
      }
    }

    // Update nodes
    if (diff.updateNodes) {
      for (const node of diff.updateNodes) {
        if (state.nodes.has(node.semanticId)) {
          state.nodes.set(node.semanticId, node);
        }
      }
    }

    // Delete nodes
    if (diff.deleteNodes) {
      for (const semanticId of diff.deleteNodes) {
        state.nodes.delete(semanticId);
      }
    }

    // Add edges
    if (diff.addEdges) {
      for (const edge of diff.addEdges) {
        state.edges.set(edge.uuid, edge);
      }
    }

    // Update edges
    if (diff.updateEdges) {
      for (const edge of diff.updateEdges) {
        if (state.edges.has(edge.uuid)) {
          state.edges.set(edge.uuid, edge);
        }
      }
    }

    // Delete edges
    if (diff.deleteEdges) {
      for (const uuid of diff.deleteEdges) {
        state.edges.delete(uuid);
      }
    }

    // Increment version
    state.version++;

    // Update metadata
    const meta = this.metadata.get(variantId);
    if (meta) {
      meta.nodeCount = state.nodes.size;
      meta.edgeCount = state.edges.size;
      meta.version = state.version;
      meta.lastAccessed = new Date();
    }
  }

  /**
   * Promote a variant to become the main graph
   * Returns the variant state to be applied to main graph
   */
  promoteVariant(variantId: string): GraphState {
    const state = this.getVariant(variantId);
    if (!state) {
      throw new Error(`Variant '${variantId}' not found`);
    }

    // Return deep copy so caller can apply to main graph
    const promotedState: GraphState = {
      nodes: new Map(
        Array.from(state.nodes.entries()).map(([k, v]) => [k, { ...v }])
      ),
      edges: new Map(
        Array.from(state.edges.entries()).map(([k, v]) => [k, { ...v }])
      ),
      version: state.version,
    };

    // Discard the variant after promotion
    this.discardVariant(variantId);

    return promotedState;
  }

  /**
   * Discard a variant
   */
  discardVariant(variantId: string): void {
    this.variants.delete(variantId);
    this.metadata.delete(variantId);
  }

  /**
   * List all variants
   */
  listVariants(): VariantInfo[] {
    return Array.from(this.metadata.values());
  }

  /**
   * Get variant by base system ID
   */
  getVariantsForSystem(systemId: string): VariantInfo[] {
    return Array.from(this.metadata.values())
      .filter(v => v.baseSystemId === systemId);
  }

  /**
   * Get variant count
   */
  getVariantCount(): number {
    return this.variants.size;
  }

  /**
   * Clear all variants
   */
  clear(): void {
    this.variants.clear();
    this.metadata.clear();
  }

  /**
   * Manage tier transitions based on access patterns
   */
  private manageTiers(): void {
    const now = Date.now();
    const variants = Array.from(this.metadata.values());

    // Sort by last accessed (most recent first)
    variants.sort((a, b) => b.lastAccessed.getTime() - a.lastAccessed.getTime());

    let hotCount = 0;
    let warmCount = 0;

    for (const meta of variants) {
      const inactiveMs = now - meta.lastAccessed.getTime();

      if (meta.tier === VariantTier.HOT) {
        if (hotCount >= this.tierConfig.maxHotVariants ||
            inactiveMs > this.tierConfig.warmAfterMs) {
          this.demoteToWarm(meta.id);
          warmCount++;
        } else {
          hotCount++;
        }
      } else if (meta.tier === VariantTier.WARM) {
        if (warmCount >= this.tierConfig.maxWarmVariants ||
            inactiveMs > this.tierConfig.coldAfterMs) {
          this.demoteToCold(meta.id);
        } else {
          warmCount++;
        }
      }
    }
  }

  /**
   * Promote variant to HOT tier
   */
  private promoteToHot(variantId: string): void {
    const meta = this.metadata.get(variantId);
    if (meta && meta.tier !== VariantTier.HOT) {
      // If was COLD, need to decompress (future)
      meta.tier = VariantTier.HOT;
    }
  }

  /**
   * Demote variant to WARM tier
   */
  private demoteToWarm(variantId: string): void {
    const meta = this.metadata.get(variantId);
    if (meta) {
      meta.tier = VariantTier.WARM;
    }
  }

  /**
   * Demote variant to COLD tier (with compression)
   */
  private demoteToCold(variantId: string): void {
    const meta = this.metadata.get(variantId);
    if (meta) {
      meta.tier = VariantTier.COLD;
      // Future: Compress the variant state to save memory
      // For now, just mark as cold
    }
  }

  /**
   * Compare two variants
   */
  compareVariants(variantIdA: string, variantIdB: string): {
    nodesDiff: {
      added: string[];
      removed: string[];
      modified: string[];
    };
    edgesDiff: {
      added: string[];
      removed: string[];
      modified: string[];
    };
  } {
    const stateA = this.getVariant(variantIdA);
    const stateB = this.getVariant(variantIdB);

    if (!stateA || !stateB) {
      throw new Error('One or both variants not found');
    }

    // Compare nodes
    const nodesA = new Set(stateA.nodes.keys());
    const nodesB = new Set(stateB.nodes.keys());

    const addedNodes = Array.from(nodesB).filter(k => !nodesA.has(k));
    const removedNodes = Array.from(nodesA).filter(k => !nodesB.has(k));
    const modifiedNodes = Array.from(nodesA)
      .filter(k => nodesB.has(k))
      .filter(k => {
        const nodeA = stateA.nodes.get(k)!;
        const nodeB = stateB.nodes.get(k)!;
        return nodeA.name !== nodeB.name || nodeA.descr !== nodeB.descr;
      });

    // Compare edges
    const edgesA = new Set(stateA.edges.keys());
    const edgesB = new Set(stateB.edges.keys());

    const addedEdges = Array.from(edgesB).filter(k => !edgesA.has(k));
    const removedEdges = Array.from(edgesA).filter(k => !edgesB.has(k));
    const modifiedEdges: string[] = []; // Edges are typically not modified, just added/removed

    return {
      nodesDiff: {
        added: addedNodes,
        removed: removedNodes,
        modified: modifiedNodes,
      },
      edgesDiff: {
        added: addedEdges,
        removed: removedEdges,
        modified: modifiedEdges,
      },
    };
  }

  /**
   * Get memory usage estimate
   */
  getMemoryUsage(): {
    totalVariants: number;
    byTier: Record<VariantTier, number>;
    estimatedBytes: number;
  } {
    const byTier: Record<VariantTier, number> = {
      [VariantTier.HOT]: 0,
      [VariantTier.WARM]: 0,
      [VariantTier.COLD]: 0,
    };

    let estimatedBytes = 0;

    for (const meta of this.metadata.values()) {
      byTier[meta.tier]++;
      // Rough estimate: 500 bytes per node, 200 bytes per edge
      estimatedBytes += meta.nodeCount * 500 + meta.edgeCount * 200;
    }

    return {
      totalVariants: this.variants.size,
      byTier,
      estimatedBytes,
    };
  }
}

/**
 * Create a new VariantPool instance
 */
export function createVariantPool(): VariantPool {
  return new VariantPool();
}
