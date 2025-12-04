/**
 * CR-028 Multi-Objective Scorer Tests
 */

import { describe, it, expect } from 'vitest';
import { scoreArchitecture, compareDominance } from '../src/multi-objective-scorer.js';
import { Architecture, Violation, DEFAULT_SCORE_CONFIG } from '../src/types.js';

describe('Multi-Objective Scorer', () => {
  const emptyArch: Architecture = {
    id: 'empty',
    nodes: [],
    edges: []
  };

  const simpleArch: Architecture = {
    id: 'simple',
    nodes: [
      { id: 'FUNC_1', type: 'FUNC', label: 'F1', properties: { volatility: 0.2 } },
      { id: 'FUNC_2', type: 'FUNC', label: 'F2', properties: { volatility: 0.2 } },
      { id: 'MOD_1', type: 'MOD', label: 'M1', properties: {} },
      { id: 'REQ_1', type: 'REQ', label: 'R1', properties: {} },
      { id: 'TEST_1', type: 'TEST', label: 'T1', properties: {} }
    ],
    edges: [
      { id: 'e1', source: 'FUNC_1', target: 'MOD_1', type: 'allocate' },
      { id: 'e2', source: 'FUNC_2', target: 'MOD_1', type: 'allocate' },
      { id: 'e3', source: 'FUNC_1', target: 'FUNC_2', type: 'io' },
      { id: 'e4', source: 'FUNC_1', target: 'REQ_1', type: 'satisfy' },
      { id: 'e5', source: 'REQ_1', target: 'TEST_1', type: 'verify' }
    ]
  };

  it('should return all score components', () => {
    const result = scoreArchitecture(simpleArch, []);

    expect(result.scores).toHaveLength(5);
    expect(result.scores.map(s => s.id)).toContain('ontology_conformance');
    expect(result.scores.map(s => s.id)).toContain('cohesion');
    expect(result.scores.map(s => s.id)).toContain('coupling');
    expect(result.scores.map(s => s.id)).toContain('volatility_isolation');
    expect(result.scores.map(s => s.id)).toContain('traceability');
  });

  it('should return weighted sum', () => {
    const result = scoreArchitecture(simpleArch, []);

    expect(result.weighted).toBeGreaterThanOrEqual(0);
    expect(result.weighted).toBeLessThanOrEqual(1);
  });

  it('should penalize violations', () => {
    const noViolations = scoreArchitecture(simpleArch, []);

    const withViolations = scoreArchitecture(simpleArch, [
      { ruleId: 'test', severity: 'hard', affectedNodes: [], message: 'test' }
    ]);

    expect(withViolations.weighted).toBeLessThan(noViolations.weighted);
  });

  it('should handle empty architecture', () => {
    const result = scoreArchitecture(emptyArch, []);

    expect(result.weighted).toBeGreaterThanOrEqual(0);
  });
});

describe('Pareto Dominance', () => {
  it('should detect dominance correctly', () => {
    const scoreA = {
      scores: [{ id: 'a', value: 0.8 }, { id: 'b', value: 0.7 }],
      weighted: 0.75,
      timestamp: Date.now()
    };

    const scoreB = {
      scores: [{ id: 'a', value: 0.6 }, { id: 'b', value: 0.5 }],
      weighted: 0.55,
      timestamp: Date.now()
    };

    expect(compareDominance(scoreA, scoreB)).toBe(1); // A dominates B
    expect(compareDominance(scoreB, scoreA)).toBe(-1); // B dominated by A
  });

  it('should detect non-dominance', () => {
    const scoreA = {
      scores: [{ id: 'a', value: 0.8 }, { id: 'b', value: 0.5 }],
      weighted: 0.65,
      timestamp: Date.now()
    };

    const scoreB = {
      scores: [{ id: 'a', value: 0.6 }, { id: 'b', value: 0.7 }],
      weighted: 0.65,
      timestamp: Date.now()
    };

    expect(compareDominance(scoreA, scoreB)).toBe(0); // Neither dominates
    expect(compareDominance(scoreB, scoreA)).toBe(0);
  });
});
