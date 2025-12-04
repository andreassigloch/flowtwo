/**
 * Rule Evaluator Unit Tests
 *
 * Tests for evaluating ontology rules against graph data.
 *
 * CR-030: Evaluation Criteria Implementation
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RuleEvaluator, createRuleEvaluator } from '../../../../src/llm-engine/validation/rule-evaluator.js';

// Mock the EmbeddingService
vi.mock('../../../../src/llm-engine/agentdb/embedding-service.js', () => ({
  EmbeddingService: class MockEmbeddingService {
    async embedText(text: string): Promise<number[]> {
      const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
      return Array.from({ length: 10 }, (_, i) => Math.sin(hash + i));
    }

    cosineSimilarity(a: number[], b: number[]): number {
      if (a.length !== b.length) return 0;
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;
      for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }
      return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
  },
}));

describe('RuleEvaluator', () => {
  let evaluator: RuleEvaluator;

  beforeEach(() => {
    evaluator = createRuleEvaluator();
  });

  describe('evaluate without Neo4j', () => {
    it('should return empty result without Neo4j client', async () => {
      const result = await evaluator.evaluate(
        'phase2_logical',
        'test-workspace',
        'test-system'
      );

      expect(result).toBeDefined();
      expect(result.phase).toBe('phase2_logical');
      expect(result.violations).toEqual([]);
      expect(result.similarityMatches).toEqual([]);
    });

    it('should calculate reward score', async () => {
      const result = await evaluator.evaluate(
        'phase2_logical',
        'test-workspace',
        'test-system'
      );

      expect(result.rewardScore).toBeGreaterThanOrEqual(0);
      expect(result.rewardScore).toBeLessThanOrEqual(1);
    });
  });

  describe('evaluateRule without Neo4j', () => {
    it('should return empty for Cypher rules without client', async () => {
      const violations = await evaluator.evaluateRule(
        'no_duplicate_nodes',
        'test-workspace',
        'test-system'
      );

      expect(violations).toEqual([]);
    });

    it('should throw for unknown rule', async () => {
      await expect(
        evaluator.evaluateRule('unknown_rule', 'test-workspace', 'test-system')
      ).rejects.toThrow('Unknown rule: unknown_rule');
    });
  });

  describe('checkPhaseGate without Neo4j', () => {
    it('should return gate status', async () => {
      const status = await evaluator.checkPhaseGate(
        'phase2_logical',
        'test-workspace',
        'test-system'
      );

      expect(status).toBeDefined();
      expect(typeof status.ready).toBe('boolean');
      expect(Array.isArray(status.blockers)).toBe(true);
      expect(typeof status.score).toBe('number');
    });
  });

  describe('ValidationResult structure', () => {
    it('should have correct structure', async () => {
      const result = await evaluator.evaluate(
        'phase1_requirements',
        'test-workspace',
        'test-system'
      );

      expect(result).toHaveProperty('phase');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('hardRulesPassed');
      expect(result).toHaveProperty('totalViolations');
      expect(result).toHaveProperty('errorCount');
      expect(result).toHaveProperty('warningCount');
      expect(result).toHaveProperty('infoCount');
      expect(result).toHaveProperty('violations');
      expect(result).toHaveProperty('similarityMatches');
      expect(result).toHaveProperty('rewardScore');
      expect(result).toHaveProperty('phaseGateReady');
    });

    it('should have timestamp', async () => {
      const before = Date.now();
      const result = await evaluator.evaluate(
        'phase1_requirements',
        'test-workspace',
        'test-system'
      );
      const after = Date.now();

      expect(result.timestamp).toBeGreaterThanOrEqual(before);
      expect(result.timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('reward calculation', () => {
    it('should return 1.0 with no violations', async () => {
      const result = await evaluator.evaluate(
        'phase1_requirements',
        'test-workspace',
        'test-system'
      );

      // Without Neo4j, no violations are found
      expect(result.violations.length).toBe(0);
      expect(result.rewardScore).toBe(1.0);
    });

    it('should mark phase gate ready with high score', async () => {
      const result = await evaluator.evaluate(
        'phase1_requirements',
        'test-workspace',
        'test-system'
      );

      // Without violations, score is 1.0 which is > 0.7 threshold
      expect(result.phaseGateReady).toBe(true);
    });
  });
});

describe('RuleEvaluator with mock Neo4j', () => {
  let evaluator: RuleEvaluator;
  let mockNeo4jClient: any;

  beforeEach(() => {
    mockNeo4jClient = {
      query: vi.fn().mockResolvedValue([]),
    };
    evaluator = createRuleEvaluator(mockNeo4jClient);
  });

  describe('evaluate with Neo4j', () => {
    it('should run Cypher queries', async () => {
      await evaluator.evaluate('phase2_logical', 'test-workspace', 'test-system');

      expect(mockNeo4jClient.query).toHaveBeenCalled();
    });

    it('should handle violations returned from Neo4j', async () => {
      // Mock returns violations for all queries to ensure at least one rule matches
      mockNeo4jClient.query.mockResolvedValue([
        { violation: 'bad_name.FN.001', reason: 'Invalid name format' },
      ]);

      const result = await evaluator.evaluate(
        'phase2_logical',
        'test-workspace',
        'test-system'
      );

      // Should have violations from the mock
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });

  describe('similarity rule evaluation', () => {
    it('should load nodes for similarity check', async () => {
      mockNeo4jClient.query.mockImplementation((cypher: string) => {
        if (cypher.includes('FUNC') && cypher.includes('SCHEMA')) {
          return Promise.resolve([
            {
              uuid: '1',
              semanticId: 'ValidateOrder.FN.001',
              type: 'FUNC',
              name: 'ValidateOrder',
              description: 'Validates orders',
            },
            {
              uuid: '2',
              semanticId: 'ValidateOrder.FN.002',
              type: 'FUNC',
              name: 'ValidateOrder',
              description: 'Validates orders too',
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await evaluator.evaluate(
        'phase2_logical',
        'test-workspace',
        'test-system'
      );

      // Should find the duplicate
      expect(result.similarityMatches.length).toBeGreaterThan(0);
    });
  });

  describe('evaluateRule with Neo4j', () => {
    it('should run specific rule', async () => {
      mockNeo4jClient.query.mockResolvedValue([
        { violation: 'Test.FN.001', reason: 'Test violation' },
      ]);

      const violations = await evaluator.evaluateRule(
        'naming',
        'test-workspace',
        'test-system'
      );

      expect(violations.length).toBe(1);
      expect(violations[0].ruleId).toBe('naming');
    });
  });

  describe('checkPhaseGate with violations', () => {
    it('should block on hard rule failures', async () => {
      // Mock returns violations for all integrity rules (which are hard rules)
      mockNeo4jClient.query.mockResolvedValue([
        { violation: 'bad.FN.001', reason: 'Invalid name' },
      ]);

      const status = await evaluator.checkPhaseGate(
        'phase2_logical',
        'test-workspace',
        'test-system'
      );

      // Hard rules fail -> not ready, has blockers
      expect(status.ready).toBe(false);
      expect(status.blockers.length).toBeGreaterThan(0);
    });
  });
});
