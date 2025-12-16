/**
 * Pre-Apply Validator Unit Tests
 *
 * CR-055: Tests for direction correction pattern
 * (delete old edge + add new direction in same batch)
 */
import { describe, it, expect } from 'vitest';
import { getPreApplyValidator, parseOperations } from '../../../src/llm-engine/validation/pre-apply-validator.js';
import type { Node, Edge } from '../../../src/shared/types/ontology.js';

describe('PreApplyValidator', () => {
  const validator = getPreApplyValidator();

  // Helper to create minimal test nodes/edges (with required fields)
  const createNode = (semanticId: string, type: string): Node => ({
    uuid: semanticId,
    semanticId,
    name: semanticId.split('.')[0],
    type: type as Node['type'],
    descr: 'Test node',
    workspaceId: 'ws1',
    systemId: 'sys1',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test',
  });

  const createEdge = (sourceId: string, targetId: string, type: string): Edge => ({
    uuid: `${sourceId}-${type}-${targetId}`,
    sourceId,
    targetId,
    type: type as Edge['type'],
    workspaceId: 'ws1',
    systemId: 'sys1',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test',
  });

  describe('Direction Correction Pattern (CR-055)', () => {
    it('should allow delete + add reverse io edge in same batch', () => {
      const existingNodes: Node[] = [
        createNode('FuncA.FN.001', 'FUNC'),
        createNode('DataFlow.FL.001', 'FLOW'),
      ];

      const existingEdges: Edge[] = [
        createEdge('DataFlow.FL.001', 'FuncA.FN.001', 'io'),
      ];

      // Pattern: Delete wrong direction, add correct direction
      const operationsBlock = `
## Edges
- DataFlow.FL.001 -io-> FuncA.FN.001
+ FuncA.FN.001 -io-> DataFlow.FL.001
`;

      const operations = parseOperations(operationsBlock);
      const result = validator.validateOperations(operations, existingNodes, existingEdges);

      // Should be valid - not a bidirectional error since we delete first
      expect(result.valid).toBe(true);
      expect(result.errors.filter(e => e.code === 'BIDIRECTIONAL_IO')).toHaveLength(0);
    });

    it('should block adding reverse edge WITHOUT deleting existing', () => {
      const existingNodes: Node[] = [
        createNode('FuncA.FN.001', 'FUNC'),
        createNode('DataFlow.FL.001', 'FLOW'),
      ];

      const existingEdges: Edge[] = [
        createEdge('DataFlow.FL.001', 'FuncA.FN.001', 'io'),
      ];

      // Only add - no delete = bidirectional
      const operationsBlock = `
## Edges
+ FuncA.FN.001 -io-> DataFlow.FL.001
`;

      const operations = parseOperations(operationsBlock);
      const result = validator.validateOperations(operations, existingNodes, existingEdges);

      // Should be invalid - bidirectional
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BIDIRECTIONAL_IO')).toBe(true);
    });

    it('should block adding both directions in same batch', () => {
      const existingNodes: Node[] = [
        createNode('FuncA.FN.001', 'FUNC'),
        createNode('DataFlow.FL.001', 'FLOW'),
      ];

      const existingEdges: Edge[] = [];

      // Add both directions = bidirectional
      const operationsBlock = `
## Edges
+ FuncA.FN.001 -io-> DataFlow.FL.001
+ DataFlow.FL.001 -io-> FuncA.FN.001
`;

      const operations = parseOperations(operationsBlock);
      const result = validator.validateOperations(operations, existingNodes, existingEdges);

      // Should be invalid - bidirectional in batch
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.code === 'BIDIRECTIONAL_IO_BATCH')).toBe(true);
    });
  });
});
