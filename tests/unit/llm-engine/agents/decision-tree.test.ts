/**
 * Decision Tree Unit Tests
 *
 * Tests for node type classification decision tree.
 *
 * CR-024: Multi-Agent Architecture System
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect } from 'vitest';
import {
  classifyNode,
  validateClassification,
  getDecisionTreePrompt,
} from '../../../../src/llm-engine/agents/decision-tree.js';

describe('Decision Tree', () => {
  describe('classifyNode', () => {
    describe('SCHEMA classification', () => {
      it('should classify data format names as SCHEMA', () => {
        const result = classifyNode('FormatESerialization', 'Serializes graph to Format E');
        expect(result.nodeType).toBe('SCHEMA');
        expect(result.confidence).toBeGreaterThan(0.8);
        expect(result.reasoning).toContain('Q1: Contains data format/schema keywords');
      });

      it('should classify protocol names as SCHEMA', () => {
        const result = classifyNode('WebSocketProtocol', 'Defines WebSocket message format');
        expect(result.nodeType).toBe('SCHEMA');
        expect(result.confidence).toBeGreaterThan(0.8);
      });

      it('should classify schema names as SCHEMA', () => {
        const result = classifyNode('OrderSchema', 'Order data structure definition');
        expect(result.nodeType).toBe('SCHEMA');
      });

      it('should classify type definitions as SCHEMA', () => {
        const result = classifyNode('OntologyTypes', 'Type definitions for ontology');
        expect(result.nodeType).toBe('SCHEMA');
      });
    });

    describe('FUNC classification', () => {
      it('should classify processing functions as FUNC', () => {
        const result = classifyNode('ProcessPayment', 'Processes customer payment');
        expect(result.nodeType).toBe('FUNC');
        expect(result.reasoning).toContain('Q3: Contains processing keywords');
      });

      it('should classify management functions as FUNC', () => {
        const result = classifyNode('ManageOrders', 'Manages order lifecycle');
        expect(result.nodeType).toBe('FUNC');
      });

      it('should classify top-level FUNC with context', () => {
        const result = classifyNode('HandleRequest', 'Handles incoming requests', {
          isTopLevel: true,
        });
        expect(result.nodeType).toBe('FUNC');
        expect(result.confidence).toBe(0.9);
        expect(result.reasoning).toContain('Is top-level processing block');
      });

      it('should classify nested FUNC under FCHAIN', () => {
        const result = classifyNode('ValidateInput', 'Validates input data', {
          parentType: 'FCHAIN',
        });
        expect(result.nodeType).toBe('FUNC');
        expect(result.reasoning).toContain('Nested under FCHAIN');
      });
    });

    describe('ACTOR classification', () => {
      it('should classify external users as ACTOR', () => {
        const result = classifyNode('User', 'External user interacting with system');
        expect(result.nodeType).toBe('ACTOR');
      });

      it('should classify external services as ACTOR', () => {
        const result = classifyNode('ExternalAPI', 'External API service');
        expect(result.nodeType).toBe('ACTOR');
      });
    });

    describe('REQ classification', () => {
      it('should classify requirements with shall keyword', () => {
        const result = classifyNode('PerformanceRequirement', 'System shall respond within 100ms');
        expect(result.nodeType).toBe('REQ');
      });

      it('should classify requirements with must keyword', () => {
        const result = classifyNode('SecurityRequirement', 'System must encrypt all data');
        expect(result.nodeType).toBe('REQ');
      });
    });

    describe('TEST classification', () => {
      it('should classify test cases', () => {
        const result = classifyNode('LoginTest', 'Test for login functionality');
        expect(result.nodeType).toBe('TEST');
      });

      it('should classify verification items', () => {
        const result = classifyNode('PerformanceVerification', 'Verify system performance');
        expect(result.nodeType).toBe('TEST');
      });
    });

    describe('FLOW classification', () => {
      it('should classify data flows', () => {
        const result = classifyNode('OrderDataFlow', 'Order data between components');
        expect(result.nodeType).toBe('FLOW');
      });

      it('should classify input/output descriptors', () => {
        const result = classifyNode('RequestInput', 'Input request data');
        expect(result.nodeType).toBe('FLOW');
      });
    });

    describe('MOD classification', () => {
      it('should classify modules', () => {
        const result = classifyNode('PaymentModule', 'Payment processing module');
        expect(result.nodeType).toBe('MOD');
      });

      it('should classify components', () => {
        const result = classifyNode('AuthComponent', 'Authentication component');
        expect(result.nodeType).toBe('MOD');
      });
    });

    describe('Unknown classification', () => {
      it('should return UNKNOWN for ambiguous entities', () => {
        const result = classifyNode('Something', 'Does something');
        expect(result.nodeType).toBe('UNKNOWN');
        expect(result.confidence).toBeLessThan(0.5);
        expect(result.alternativeTypes).toBeDefined();
      });
    });
  });

  describe('validateClassification', () => {
    it('should flag format names as FUNC', () => {
      const result = validateClassification(
        'FormatESerialization.FN.001',
        'FUNC',
        'FormatESerialization'
      );
      expect(result.valid).toBe(false);
      expect(result.suggestedType).toBe('SCHEMA');
    });

    it('should flag protocol names as FUNC', () => {
      const result = validateClassification(
        'WebSocketProtocol.FN.001',
        'FUNC',
        'WebSocketProtocol'
      );
      expect(result.valid).toBe(false);
      expect(result.suggestedType).toBe('SCHEMA');
    });

    it('should flag HTTP names as FUNC', () => {
      const result = validateClassification('HTTPHandler.FN.001', 'FUNC', 'HTTPHandler');
      expect(result.valid).toBe(false);
      expect(result.suggestedType).toBe('SCHEMA');
    });

    it('should accept valid FUNC names', () => {
      const result = validateClassification(
        'ProcessPayment.FN.001',
        'FUNC',
        'ProcessPayment'
      );
      expect(result.valid).toBe(true);
    });

    it('should accept valid SCHEMA names', () => {
      const result = validateClassification('OrderSchema.SC.001', 'SCHEMA', 'OrderSchema');
      expect(result.valid).toBe(true);
    });
  });

  describe('getDecisionTreePrompt', () => {
    it('should return a non-empty prompt', () => {
      const prompt = getDecisionTreePrompt();
      expect(prompt).toBeTruthy();
      expect(prompt.length).toBeGreaterThan(100);
    });

    it('should include Q1-Q8 questions', () => {
      const prompt = getDecisionTreePrompt();
      expect(prompt).toContain('Q1:');
      expect(prompt).toContain('Q2:');
      expect(prompt).toContain('Q3:');
      expect(prompt).toContain('Q4:');
      expect(prompt).toContain('Q5:');
      expect(prompt).toContain('Q6:');
      expect(prompt).toContain('Q7:');
      expect(prompt).toContain('Q8:');
    });

    it('should include common misclassifications table', () => {
      const prompt = getDecisionTreePrompt();
      expect(prompt).toContain('Common Misclassifications');
      expect(prompt).toContain('FormatESerialization');
    });
  });
});
