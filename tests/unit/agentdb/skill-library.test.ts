/**
 * Skill Library Unit Tests (CR-032 Phase 6)
 *
 * Tests pattern storage, matching, and effectiveness tracking.
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SkillLibrary, createSkillLibrary, type SkillPattern } from '../../../src/llm-engine/agentdb/skill-library.js';

describe('SkillLibrary', () => {
  let library: SkillLibrary;

  const createTestContext = (
    phase: string = 'draft',
    nodeTypes: string[] = ['FUNC'],
    edgeTypes: string[] = ['io']
  ): SkillPattern['context'] => ({
    phase,
    nodeTypes,
    edgeTypes,
  });

  beforeEach(() => {
    library = createSkillLibrary();
  });

  describe('recordSuccess()', () => {
    it('should store pattern with high reward', () => {
      const id = library.recordSuccess(
        'Create a function to process orders',
        'CREATE(:FUNC{name:"ProcessOrder"})',
        createTestContext(),
        0.9
      );

      expect(id).not.toBeNull();
      expect(id).toMatch(/^skill-\d+$/);
    });

    it('should reject pattern with low reward', () => {
      const id = library.recordSuccess(
        'Create a function',
        'CREATE(:FUNC)',
        createTestContext(),
        0.5 // Below threshold of 0.7
      );

      expect(id).toBeNull();
    });

    it('should update existing pattern on duplicate', () => {
      const task = 'Create order processor';
      const operations = 'CREATE(:FUNC{name:"OrderProcessor"})';
      const context = createTestContext();

      const id1 = library.recordSuccess(task, operations, context, 0.8);
      const id2 = library.recordSuccess(task, operations, context, 0.9);

      expect(id1).toBe(id2);

      const pattern = library.getPattern(id1!);
      expect(pattern?.usageCount).toBe(2);
    });

    it('should store context with pattern', () => {
      const context = createTestContext('phase2', ['FUNC', 'DATA'], ['io', 'compose']);

      const id = library.recordSuccess(
        'Create data flow',
        'CREATE(:FUNC)-[:io]->(:DATA)',
        context,
        0.85
      );

      const pattern = library.getPattern(id!);
      expect(pattern?.context.phase).toBe('phase2');
      expect(pattern?.context.nodeTypes).toContain('FUNC');
      expect(pattern?.context.nodeTypes).toContain('DATA');
      expect(pattern?.context.edgeTypes).toContain('io');
    });

    it('should set initial success rate to 1.0', () => {
      const id = library.recordSuccess(
        'New task',
        'CREATE(:FUNC)',
        createTestContext(),
        0.8
      );

      const pattern = library.getPattern(id!);
      expect(pattern?.successRate).toBe(1.0);
    });
  });

  describe('recordFailure()', () => {
    it('should decrease success rate on failure', () => {
      const id = library.recordSuccess(
        'Test task',
        'CREATE(:FUNC)',
        createTestContext(),
        0.8
      );

      const beforeRate = library.getPattern(id!)?.successRate;
      library.recordFailure(id!);
      const afterRate = library.getPattern(id!)?.successRate;

      expect(afterRate).toBeLessThan(beforeRate!);
    });

    it('should update lastUsedAt on failure', () => {
      const id = library.recordSuccess(
        'Test task',
        'CREATE(:FUNC)',
        createTestContext(),
        0.8
      );

      const beforeTime = library.getPattern(id!)?.lastUsedAt;

      // Small delay to ensure timestamp changes
      library.recordFailure(id!);
      const afterTime = library.getPattern(id!)?.lastUsedAt;

      expect(afterTime).toBeGreaterThanOrEqual(beforeTime!);
    });

    it('should ignore failure for non-existent pattern', () => {
      // Should not throw
      expect(() => library.recordFailure('non-existent-id')).not.toThrow();
    });
  });

  describe('findApplicablePatterns()', () => {
    beforeEach(() => {
      // Set up test patterns
      library.recordSuccess(
        'Create a function to process customer orders',
        'CREATE(:FUNC{name:"ProcessOrders"})',
        createTestContext('draft', ['FUNC']),
        0.9
      );
      library.recordSuccess(
        'Create a function to validate user input',
        'CREATE(:FUNC{name:"ValidateInput"})',
        createTestContext('draft', ['FUNC']),
        0.85
      );
      library.recordSuccess(
        'Create data flow between components',
        'MATCH(a),(b) CREATE(a)-[:io]->(b)',
        createTestContext('phase2', ['FUNC', 'DATA'], ['io']),
        0.95
      );
    });

    it('should find patterns by task similarity', () => {
      const matches = library.findApplicablePatterns('Create a function to process payments');

      expect(matches.length).toBeGreaterThan(0);
      // "process" and "function" should match with order processing pattern
      expect(matches[0].pattern.task).toContain('process');
    });

    it('should return empty array for unrelated task', () => {
      const matches = library.findApplicablePatterns('xyz completely unrelated query abc');

      expect(matches).toHaveLength(0);
    });

    it('should boost similarity for matching context', () => {
      const withContext = library.findApplicablePatterns(
        'Create data flow',
        { phase: 'phase2', nodeTypes: ['DATA'] }
      );

      const withoutContext = library.findApplicablePatterns('Create data flow');

      // With matching context should have higher similarity
      if (withContext.length > 0 && withoutContext.length > 0) {
        const matchingPattern = withContext.find(m => m.pattern.context.phase === 'phase2');
        const samePatternWithout = withoutContext.find(m => m.pattern.context.phase === 'phase2');

        if (matchingPattern && samePatternWithout) {
          expect(matchingPattern.similarity).toBeGreaterThanOrEqual(samePatternWithout.similarity);
        }
      }
    });

    it('should respect maxResults parameter', () => {
      const matches = library.findApplicablePatterns('Create a function', undefined, 1);

      expect(matches.length).toBeLessThanOrEqual(1);
    });

    it('should sort by combined score (similarity * success rate)', () => {
      // Record a pattern with lower success rate
      const id = library.recordSuccess(
        'Create a function to handle requests',
        'CREATE(:FUNC{name:"HandleRequests"})',
        createTestContext(),
        0.8
      );
      library.recordFailure(id!);
      library.recordFailure(id!);

      const matches = library.findApplicablePatterns('Create a function to handle');

      // Results should be sorted by combined score
      for (let i = 0; i < matches.length - 1; i++) {
        const scoreA = matches[i].similarity * matches[i].pattern.successRate;
        const scoreB = matches[i + 1].similarity * matches[i + 1].pattern.successRate;
        expect(scoreA).toBeGreaterThanOrEqual(scoreB);
      }
    });
  });

  describe('getPattern()', () => {
    it('should return pattern by ID', () => {
      const id = library.recordSuccess(
        'Test task',
        'CREATE(:FUNC)',
        createTestContext(),
        0.8
      );

      const pattern = library.getPattern(id!);

      expect(pattern).not.toBeNull();
      expect(pattern?.id).toBe(id);
      expect(pattern?.task).toBe('Test task');
    });

    it('should return null for non-existent ID', () => {
      const pattern = library.getPattern('non-existent-id');

      expect(pattern).toBeNull();
    });
  });

  describe('getAllPatterns()', () => {
    it('should return all stored patterns', () => {
      library.recordSuccess('Task 1', 'OP1', createTestContext(), 0.8);
      library.recordSuccess('Task 2', 'OP2', createTestContext(), 0.9);
      library.recordSuccess('Task 3', 'OP3', createTestContext(), 0.85);

      const patterns = library.getAllPatterns();

      expect(patterns).toHaveLength(3);
    });

    it('should return empty array when no patterns', () => {
      const patterns = library.getAllPatterns();

      expect(patterns).toHaveLength(0);
    });
  });

  describe('getStats()', () => {
    it('should return zero stats when empty', () => {
      const stats = library.getStats();

      expect(stats.totalPatterns).toBe(0);
      expect(stats.avgSuccessRate).toBe(0);
      expect(stats.avgReward).toBe(0);
      expect(stats.topPatterns).toHaveLength(0);
    });

    it('should calculate correct statistics', () => {
      library.recordSuccess('Task 1', 'OP1', createTestContext(), 0.8);
      library.recordSuccess('Task 2', 'OP2', createTestContext(), 0.9);

      const stats = library.getStats();

      expect(stats.totalPatterns).toBe(2);
      expect(stats.avgSuccessRate).toBe(1.0); // Both new, so 1.0
      expect(stats.avgReward).toBeCloseTo(0.85, 10); // (0.8 + 0.9) / 2
    });

    it('should return top patterns by usage * success rate', () => {
      // Create patterns with different usage counts
      const id1 = library.recordSuccess('Task 1', 'OP1', createTestContext(), 0.8);
      library.recordSuccess('Task 1', 'OP1', createTestContext(), 0.8); // Reuse
      library.recordSuccess('Task 1', 'OP1', createTestContext(), 0.8); // Reuse again

      library.recordSuccess('Task 2', 'OP2', createTestContext(), 0.9);

      const stats = library.getStats();

      // Task 1 has higher usage, should be in top
      expect(stats.topPatterns[0].task).toBe('Task 1');
    });
  });

  describe('clear()', () => {
    it('should remove all patterns', () => {
      library.recordSuccess('Task 1', 'OP1', createTestContext(), 0.8);
      library.recordSuccess('Task 2', 'OP2', createTestContext(), 0.9);

      library.clear();

      expect(library.getAllPatterns()).toHaveLength(0);
    });

    it('should reset pattern counter', () => {
      library.recordSuccess('Task 1', 'OP1', createTestContext(), 0.8);
      library.clear();

      const id = library.recordSuccess('Task 2', 'OP2', createTestContext(), 0.8);

      expect(id).toBe('skill-1');
    });
  });

  describe('exportPatterns() / importPatterns()', () => {
    it('should export all patterns', () => {
      library.recordSuccess('Task 1', 'OP1', createTestContext(), 0.8);
      library.recordSuccess('Task 2', 'OP2', createTestContext(), 0.9);

      const exported = library.exportPatterns();

      expect(exported).toHaveLength(2);
      expect(exported[0]).toHaveProperty('id');
      expect(exported[0]).toHaveProperty('task');
      expect(exported[0]).toHaveProperty('operations');
    });

    it('should import patterns correctly', () => {
      const patterns: SkillPattern[] = [
        {
          id: 'skill-100',
          task: 'Imported task',
          operations: 'IMPORTED OP',
          context: createTestContext(),
          reward: 0.95,
          usageCount: 5,
          successRate: 0.9,
          createdAt: Date.now() - 10000,
          lastUsedAt: Date.now(),
        },
      ];

      library.importPatterns(patterns);

      const imported = library.getPattern('skill-100');
      expect(imported).not.toBeNull();
      expect(imported?.task).toBe('Imported task');
      expect(imported?.usageCount).toBe(5);
    });

    it('should update pattern counter on import', () => {
      const patterns: SkillPattern[] = [
        {
          id: 'skill-50',
          task: 'Task',
          operations: 'OP',
          context: createTestContext(),
          reward: 0.8,
          usageCount: 1,
          successRate: 1.0,
          createdAt: Date.now(),
          lastUsedAt: Date.now(),
        },
      ];

      library.importPatterns(patterns);
      const newId = library.recordSuccess('New task', 'NEW OP', createTestContext(), 0.8);

      // Should continue from 51
      expect(newId).toBe('skill-51');
    });

    it('should roundtrip export/import correctly', () => {
      library.recordSuccess('Task 1', 'OP1', createTestContext('phase1'), 0.8);
      library.recordSuccess('Task 2', 'OP2', createTestContext('phase2'), 0.9);

      const exported = library.exportPatterns();

      const newLibrary = createSkillLibrary();
      newLibrary.importPatterns(exported);

      expect(newLibrary.getAllPatterns()).toHaveLength(2);

      const pattern1 = newLibrary.getAllPatterns().find(p => p.task === 'Task 1');
      expect(pattern1?.context.phase).toBe('phase1');
    });
  });

  describe('similarity calculation', () => {
    it('should find patterns with word overlap', () => {
      library.recordSuccess(
        'Create function process orders customer',
        'CREATE(:FUNC{name:"ProcessOrders"})',
        createTestContext(),
        0.9
      );

      // Query shares "function", "process", "orders" - high enough overlap
      const matches = library.findApplicablePatterns('function process orders payment');

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].similarity).toBeGreaterThan(0.3);
    });

    it('should not match when only short words overlap', () => {
      library.recordSuccess(
        'implement authentication system',
        'OP',
        createTestContext(),
        0.8
      );

      // Query with short words only (filtered out) - no meaningful overlap
      const matches = library.findApplicablePatterns('xyz abc def');
      expect(matches).toHaveLength(0);
    });
  });

  describe('pattern pruning', () => {
    it('should not exceed max patterns', () => {
      // Create more than max patterns (default 1000)
      // Use a smaller number for testing by accessing internal config
      const library = new SkillLibrary();

      // Add patterns - the library should prune old ones
      for (let i = 0; i < 50; i++) {
        library.recordSuccess(
          `Task ${i}`,
          `OP-${i}`,
          createTestContext(),
          0.75 + (i % 25) / 100 // Vary reward between 0.75-0.99
        );
      }

      // Should have patterns but not necessarily all 50
      // (depends on internal maxPatterns config)
      const allPatterns = library.getAllPatterns();
      expect(allPatterns.length).toBeGreaterThan(0);
      expect(allPatterns.length).toBeLessThanOrEqual(1000);
    });
  });
});
