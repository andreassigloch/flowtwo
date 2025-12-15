/**
 * CR-052: Unit tests for semantic ID generation
 * @author andreas@siglochconsulting
 */

import { describe, it, expect } from 'vitest';
import {
  generateSemanticId,
  sanitizeName,
  generateEdgeId,
  extractFromSemanticId,
  getTypeAbbreviation,
} from '../../../src/shared/utils/semantic-id.js';

describe('semantic-id', () => {
  describe('generateSemanticId', () => {
    it('generates ID in format name.TYPE.random', () => {
      const existingIds = new Set<string>();
      const id = generateSemanticId('ValidatePayment', 'FUNC', existingIds);

      expect(id).toMatch(/^ValidatePayment\.FUNC\.[a-z0-9]{6}$/);
    });

    it('generates unique IDs on subsequent calls', () => {
      const existingIds = new Set<string>();
      const id1 = generateSemanticId('TestNode', 'FUNC', existingIds);
      existingIds.add(id1);
      const id2 = generateSemanticId('TestNode', 'FUNC', existingIds);
      existingIds.add(id2);

      expect(id1).not.toBe(id2);
    });

    it('avoids collision with existing IDs', () => {
      // Pre-populate with some IDs
      const existingIds = new Set<string>([
        'TestNode.FUNC.abc123',
        'TestNode.FUNC.def456'
      ]);

      const id = generateSemanticId('TestNode', 'FUNC', existingIds);

      expect(existingIds.has(id)).toBe(false);
      expect(id).toMatch(/^TestNode\.FUNC\.[a-z0-9]{6}$/);
    });

    it('handles merged node names with plus sign', () => {
      const existingIds = new Set<string>();
      const id = generateSemanticId('ValidatePayment+ValidateShipment', 'FUNC', existingIds);

      expect(id).toMatch(/^ValidatePayment\+ValidateShipment\.FUNC\.[a-z0-9]{6}$/);
    });

    it('handles split node names with underscore suffix', () => {
      const existingIds = new Set<string>();
      const id = generateSemanticId('ValidateOrder_B', 'FUNC', existingIds);

      expect(id).toMatch(/^ValidateOrder_B\.FUNC\.[a-z0-9]{6}$/);
    });

    it('handles different node types', () => {
      const existingIds = new Set<string>();

      const modId = generateSemanticId('OrderService', 'MOD', existingIds);
      const testId = generateSemanticId('Test_ValidateOrder', 'TEST', existingIds);
      const sysId = generateSemanticId('System', 'SYS', existingIds);

      expect(modId).toMatch(/^OrderService\.MOD\.[a-z0-9]{6}$/);
      expect(testId).toMatch(/^Test_ValidateOrder\.TEST\.[a-z0-9]{6}$/);
      expect(sysId).toMatch(/^System\.SYS\.[a-z0-9]{6}$/);
    });
  });

  describe('sanitizeName', () => {
    it('keeps alphanumeric characters', () => {
      expect(sanitizeName('ValidatePayment')).toBe('ValidatePayment');
    });

    it('keeps underscore and plus sign', () => {
      expect(sanitizeName('Node_A+Node_B')).toBe('Node_A+Node_B');
    });

    it('removes special characters', () => {
      expect(sanitizeName('Node@#$%')).toBe('Node');
      expect(sanitizeName('Node (test)')).toBe('Nodetest');
    });

    it('truncates to 50 characters', () => {
      const longName = 'A'.repeat(100);
      expect(sanitizeName(longName)).toBe('A'.repeat(50));
    });

    it('handles empty string', () => {
      expect(sanitizeName('')).toBe('');
    });
  });

  describe('generateEdgeId', () => {
    it('generates edge ID in format source-type-target', () => {
      const id = generateEdgeId('func1', 'allocate', 'mod1');
      expect(id).toBe('func1-allocate-mod1');
    });

    it('handles complex node IDs', () => {
      const id = generateEdgeId(
        'ValidatePayment.FUNC.abc123',
        'satisfy',
        'REQ-001.REQ.def456'
      );
      expect(id).toBe('ValidatePayment.FUNC.abc123-satisfy-REQ-001.REQ.def456');
    });
  });

  /**
   * CR-053: Tests for extractFromSemanticId
   * Extracts name and type from compact semanticId format
   */
  describe('extractFromSemanticId', () => {
    it('extracts name and type from SYS node', () => {
      const result = extractFromSemanticId('TestSystem.SY.001');
      expect(result.name).toBe('TestSystem');
      expect(result.type).toBe('SYS');
    });

    it('extracts name and type from UC node', () => {
      const result = extractFromSemanticId('NavigateEnvironment.UC.001');
      expect(result.name).toBe('NavigateEnvironment');
      expect(result.type).toBe('UC');
    });

    it('extracts name and type from FUNC node', () => {
      const result = extractFromSemanticId('ValidatePayment.FN.abc123');
      expect(result.name).toBe('ValidatePayment');
      expect(result.type).toBe('FUNC');
    });

    it('extracts name and type from REQ node', () => {
      const result = extractFromSemanticId('UserAuth.RQ.001');
      expect(result.name).toBe('UserAuth');
      expect(result.type).toBe('REQ');
    });

    it('extracts name and type from FCHAIN node', () => {
      const result = extractFromSemanticId('ProcessOrder.FC.001');
      expect(result.name).toBe('ProcessOrder');
      expect(result.type).toBe('FCHAIN');
    });

    it('extracts name and type from FLOW node', () => {
      const result = extractFromSemanticId('DataFlow.FL.001');
      expect(result.name).toBe('DataFlow');
      expect(result.type).toBe('FLOW');
    });

    it('extracts name and type from ACTOR node', () => {
      const result = extractFromSemanticId('User.AC.001');
      expect(result.name).toBe('User');
      expect(result.type).toBe('ACTOR');
    });

    it('extracts name and type from MOD node', () => {
      const result = extractFromSemanticId('AuthModule.MD.001');
      expect(result.name).toBe('AuthModule');
      expect(result.type).toBe('MOD');
    });

    it('extracts name and type from TEST node (TC abbreviation)', () => {
      const result = extractFromSemanticId('TestAuth.TC.001');
      expect(result.name).toBe('TestAuth');
      expect(result.type).toBe('TEST');
    });

    it('extracts name and type from TEST node (TS abbreviation)', () => {
      const result = extractFromSemanticId('TestAuth.TS.001');
      expect(result.name).toBe('TestAuth');
      expect(result.type).toBe('TEST');
    });

    it('extracts name and type from SCHEMA node', () => {
      const result = extractFromSemanticId('UserSchema.SC.001');
      expect(result.name).toBe('UserSchema');
      expect(result.type).toBe('SCHEMA');
    });

    it('handles names with underscores', () => {
      const result = extractFromSemanticId('Validate_Order.FN.001');
      expect(result.name).toBe('Validate_Order');
      expect(result.type).toBe('FUNC');
    });

    it('handles merged node names with plus sign', () => {
      const result = extractFromSemanticId('NodeA+NodeB.FN.001');
      expect(result.name).toBe('NodeA+NodeB');
      expect(result.type).toBe('FUNC');
    });

    it('throws error for invalid format (missing parts)', () => {
      expect(() => extractFromSemanticId('InvalidId')).toThrow(
        'Invalid semanticId format'
      );
      expect(() => extractFromSemanticId('TwoParts.FN')).toThrow(
        'Invalid semanticId format'
      );
    });

    it('throws error for unknown type abbreviation', () => {
      expect(() => extractFromSemanticId('Test.XX.001')).toThrow(
        'Unknown type abbreviation "XX"'
      );
    });
  });

  /**
   * CR-053: Tests for getTypeAbbreviation
   * Gets the abbreviation for a node type
   */
  describe('getTypeAbbreviation', () => {
    it('returns SY for SYS', () => {
      expect(getTypeAbbreviation('SYS')).toBe('SY');
    });

    it('returns UC for UC', () => {
      expect(getTypeAbbreviation('UC')).toBe('UC');
    });

    it('returns FN for FUNC', () => {
      expect(getTypeAbbreviation('FUNC')).toBe('FN');
    });

    it('returns RQ for REQ', () => {
      expect(getTypeAbbreviation('REQ')).toBe('RQ');
    });

    it('returns FC for FCHAIN', () => {
      expect(getTypeAbbreviation('FCHAIN')).toBe('FC');
    });

    it('returns FL for FLOW', () => {
      expect(getTypeAbbreviation('FLOW')).toBe('FL');
    });

    it('returns AC for ACTOR', () => {
      expect(getTypeAbbreviation('ACTOR')).toBe('AC');
    });

    it('returns MD for MOD', () => {
      expect(getTypeAbbreviation('MOD')).toBe('MD');
    });

    it('returns TC for TEST', () => {
      expect(getTypeAbbreviation('TEST')).toBe('TC');
    });

    it('returns SC for SCHEMA', () => {
      expect(getTypeAbbreviation('SCHEMA')).toBe('SC');
    });

    it('returns first two chars for unknown types', () => {
      // Fallback behavior for any unrecognized type
      expect(getTypeAbbreviation('UNKNOWN' as any)).toBe('UN');
    });
  });
});
