/**
 * Canvas Base Class - Abstract state manager for Graph and Chat canvases
 *
 * Implements Universal Diff Protocol using Format E
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { SemanticId } from '../shared/types/ontology.js';
import {
  FormatEDiff,
  DiffResult,
  PersistResult,
  Operation,
  BroadcastUpdate,
  CacheDecision,
  CacheContext,
} from '../shared/types/canvas.js';
import { IFormatEParser } from '../shared/types/format-e.js';

/**
 * Abstract Canvas Base Class
 *
 * Provides:
 * - Diff application (Format E)
 * - Dirty tracking
 * - Persistence decision logic
 * - Broadcasting
 * - Cache strategy
 */
export abstract class CanvasBase {
  protected workspaceId: string;
  protected systemId: string;
  protected chatId: string;
  protected userId: string;

  protected parser: IFormatEParser;
  protected dirty: Set<string>;

  protected lastFetchTime: Date;
  protected staleThresholdMs: number = 300000; // 5 minutes

  constructor(
    workspaceId: string,
    systemId: string,
    chatId: string,
    userId: string,
    parser: IFormatEParser
  ) {
    this.workspaceId = workspaceId;
    this.systemId = systemId;
    this.chatId = chatId;
    this.userId = userId;
    this.parser = parser;
    this.dirty = new Set();
    this.lastFetchTime = new Date();
  }

  /**
   * Apply Format E Diff to canvas state
   *
   * SPEC: FR-4.1, FR-4.2 (Canvas state management)
   * TEST: tests/unit/canvas/canvas-base.test.ts
   */
  async applyDiff(diff: FormatEDiff): Promise<DiffResult> {
    try {
      // Validate diff
      const validation = this.validateDiff(diff);
      if (!validation.valid) {
        return {
          success: false,
          affectedIds: [],
          errors: validation.errors,
          warnings: validation.warnings,
        };
      }

      // Apply operations
      const affectedIds: SemanticId[] = [];
      for (const op of diff.operations) {
        await this.applyOperation(op);
        affectedIds.push(op.semanticId);
      }

      // Mark dirty
      this.markDirty(affectedIds);

      // Broadcast update
      await this.broadcastUpdate(diff);

      return {
        success: true,
        affectedIds,
        warnings: validation.warnings,
      };
    } catch (error) {
      return {
        success: false,
        affectedIds: [],
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Persist dirty state to Neo4j
   *
   * SPEC: FR-4.2 (Persistence strategy)
   * TEST: tests/unit/canvas/canvas-base.test.ts
   */
  async persistToNeo4j(force: boolean = false): Promise<PersistResult> {
    if (!force && this.dirty.size === 0) {
      return { success: true, skipped: true };
    }

    try {
      // Get dirty items
      const dirtyItems = this.getDirtyItems();

      // Persist to Neo4j
      await this.saveBatch(dirtyItems);

      // Create audit log
      await this.createAuditLog({
        chatId: this.chatId,
        diff: this.serializeDirtyAsDiff(),
        action: 'persist',
      });

      // Clear dirty tracking (base + subclass)
      this.dirty.clear();
      this.clearSubclassDirtyTracking();

      return {
        success: true,
        savedCount: dirtyItems.length,
      };
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Decide cache strategy based on context
   *
   * SPEC: FR-4.2 (Cache strategy)
   * TEST: tests/unit/canvas/canvas-base.test.ts
   */
  decideCacheStrategy(context: CacheContext): CacheDecision {
    // Force refresh requested
    if (context.forceRefresh) {
      return 'fetch_neo4j';
    }

    // Cache is stale
    const age = Date.now() - context.lastFetchTime.getTime();
    if (age > context.staleThresholdMs) {
      return 'fetch_neo4j';
    }

    // Has dirty items - apply diff
    if (context.dirtyCount > 0) {
      return 'apply_diff';
    }

    // Use cache
    return 'use_cache';
  }

  /**
   * Mark items as dirty
   */
  protected markDirty(ids: string[]): void {
    ids.forEach((id) => this.dirty.add(id));
  }

  /**
   * Broadcast update to connected users (WebSocket)
   */
  protected async broadcastUpdate(diff: FormatEDiff): Promise<void> {
    const update: BroadcastUpdate = {
      type: 'graph_update', // Override in subclass if needed
      diff,
      source: {
        userId: this.userId,
        sessionId: '', // TODO: Get from session context
        origin: 'user-edit', // TODO: Determine from context
      },
      timestamp: new Date(),
    };

    // TODO: Implement WebSocket broadcast
    console.log('Broadcasting update:', update);
  }

  /**
   * Clear subclass-specific dirty tracking (optional override)
   */
  protected clearSubclassDirtyTracking(): void {
    // Override in subclass if needed
  }

  // Abstract methods (implemented by subclasses)
  protected abstract applyOperation(op: Operation): Promise<void>;
  protected abstract getDirtyItems(): unknown[];
  protected abstract serializeDirtyAsDiff(): string;
  protected abstract validateDiff(diff: FormatEDiff): { valid: boolean; errors: string[]; warnings?: string[] };
  protected abstract saveBatch(items: unknown[]): Promise<void>;
  protected abstract createAuditLog(log: { chatId: string; diff: string; action: string }): Promise<void>;
}
