/**
 * Canvas Base Class - Unit Tests
 *
 * Test Category: Unit (70% of test pyramid)
 * Purpose: Validate Canvas state management logic
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CanvasBase } from '../../../src/canvas/canvas-base.js';
import { FormatEDiff, Operation } from '../../../src/shared/types/canvas.js';
import { IFormatEParser } from '../../../src/shared/types/format-e.js';
import { GraphState } from '../../../src/shared/types/ontology.js';

/**
 * Mock Canvas implementation for testing
 */
class MockCanvas extends CanvasBase {
  private items: Map<string, unknown> = new Map();

  protected async applyOperation(op: Operation): Promise<void> {
    // Mock implementation
    this.items.set(op.semanticId, op);
  }

  protected getDirtyItems(): unknown[] {
    return Array.from(this.dirty).map((id) => this.items.get(id));
  }

  protected serializeDirtyAsDiff(): string {
    return '<operations>mock diff</operations>';
  }

  protected validateDiff(diff: FormatEDiff): {
    valid: boolean;
    errors: string[];
    warnings?: string[];
  } {
    if (!diff.baseSnapshot) {
      return { valid: false, errors: ['Missing base snapshot'] };
    }
    return { valid: true, errors: [] };
  }

  protected async saveBatch(_items: unknown[]): Promise<void> {
    // Mock save
  }

  protected async createAuditLog(_log: {
    chatId: string;
    diff: string;
    action: string;
  }): Promise<void> {
    // Mock audit log
  }
}

/**
 * Mock Format E Parser
 */
class MockFormatEParser implements IFormatEParser {
  parseGraph(_formatE: string): GraphState {
    throw new Error('Not implemented');
  }

  parseDiff(_formatE: string): FormatEDiff {
    return {
      baseSnapshot: 'TestSystem.SY.001@v1',
      viewContext: 'Hierarchy',
      operations: [
        {
          type: 'add_node',
          semanticId: 'NewFunction.FN.002',
          node: {
            uuid: 'uuid-123',
            semanticId: 'NewFunction.FN.002',
            type: 'FUNC',
            name: 'NewFunction',
            workspaceId: 'test-ws',
            systemId: 'TestSystem.SY.001',
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: 'test-user',
          },
        },
      ],
    };
  }

  serializeGraph(_state: GraphState, _viewContext?: string): string {
    return 'mock format e';
  }

  serializeDiff(_diff: FormatEDiff): string {
    return '<operations>mock</operations>';
  }

  parseChatCanvas(_formatE: string): any {
    throw new Error('Not implemented');
  }

  serializeChatCanvas(_state: any): string {
    throw new Error('Not implemented');
  }
}

describe('CanvasBase', () => {
  let canvas: MockCanvas;
  let parser: MockFormatEParser;

  beforeEach(() => {
    parser = new MockFormatEParser();
    canvas = new MockCanvas('test-ws', 'TestSystem.SY.001', 'chat-001', 'user-001', parser);
  });

  describe('applyDiff', () => {
    it('should apply valid diff successfully', async () => {
      const diff: FormatEDiff = {
        baseSnapshot: 'TestSystem.SY.001@v1',
        viewContext: 'Hierarchy',
        operations: [
          {
            type: 'add_node',
            semanticId: 'NewNode.FN.002',
          },
        ],
      };

      const result = await canvas.applyDiff(diff);

      expect(result.success).toBe(true);
      expect(result.affectedIds).toContain('NewNode.FN.002');
      expect(result.errors).toBeUndefined();
    });

    it('should reject diff without base snapshot', async () => {
      const diff: FormatEDiff = {
        baseSnapshot: '', // Invalid
        operations: [],
      };

      const result = await canvas.applyDiff(diff);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toContain('base snapshot');
    });

    it('should track dirty state after applying diff', async () => {
      const diff: FormatEDiff = {
        baseSnapshot: 'TestSystem.SY.001@v1',
        operations: [
          {
            type: 'add_node',
            semanticId: 'NewNode.FN.002',
          },
        ],
      };

      await canvas.applyDiff(diff);

      expect(canvas['dirty'].size).toBeGreaterThan(0);
      expect(canvas['dirty'].has('NewNode.FN.002')).toBe(true);
    });
  });

  describe('persistToNeo4j', () => {
    it('should skip persistence when nothing is dirty', async () => {
      const result = await canvas.persistToNeo4j(false);

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
    });

    it('should persist when forced even if not dirty', async () => {
      const result = await canvas.persistToNeo4j(true);

      expect(result.success).toBe(true);
      expect(result.skipped).toBeUndefined();
    });

    it('should clear dirty state after successful persist', async () => {
      // Make something dirty
      const diff: FormatEDiff = {
        baseSnapshot: 'TestSystem.SY.001@v1',
        operations: [{ type: 'add_node', semanticId: 'NewNode.FN.002' }],
      };
      await canvas.applyDiff(diff);

      expect(canvas['dirty'].size).toBeGreaterThan(0);

      // Persist
      await canvas.persistToNeo4j(false);

      expect(canvas['dirty'].size).toBe(0);
    });
  });

  describe('decideCacheStrategy', () => {
    it('should use cache when fresh and no dirty items', () => {
      const decision = canvas.decideCacheStrategy({
        lastFetchTime: new Date(),
        staleThresholdMs: 300000,
        dirtyCount: 0,
        forceRefresh: false,
      });

      expect(decision).toBe('use_cache');
    });

    it('should fetch from Neo4j when stale', () => {
      const staleTime = new Date(Date.now() - 400000); // 400 seconds ago

      const decision = canvas.decideCacheStrategy({
        lastFetchTime: staleTime,
        staleThresholdMs: 300000, // 5 minutes
        dirtyCount: 0,
        forceRefresh: false,
      });

      expect(decision).toBe('fetch_neo4j');
    });

    it('should apply diff when dirty items exist', () => {
      const decision = canvas.decideCacheStrategy({
        lastFetchTime: new Date(),
        staleThresholdMs: 300000,
        dirtyCount: 5,
        forceRefresh: false,
      });

      expect(decision).toBe('apply_diff');
    });

    it('should fetch from Neo4j when force refresh requested', () => {
      const decision = canvas.decideCacheStrategy({
        lastFetchTime: new Date(),
        staleThresholdMs: 300000,
        dirtyCount: 0,
        forceRefresh: true,
      });

      expect(decision).toBe('fetch_neo4j');
    });
  });
});
