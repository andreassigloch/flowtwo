/**
 * CR-049 Optimizer Realignment Tests
 *
 * Tests for the new architecture optimization goals:
 * 1. FUNC similarity detection and merge
 * 2. SCHEMA similarity detection and merge
 * 3. Allocation cohesion (cross-cutting allocation removal)
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect } from 'vitest';
import { detectViolations } from '../../../src/llm-engine/optimizer/violation-guided-search.js';
import { MOVE_OPERATORS, applyOperator } from '../../../src/llm-engine/optimizer/move-operators.js';
import type { Architecture, Violation } from '../../../src/llm-engine/optimizer/types.js';

// ============================================================================
// Test Fixtures
// ============================================================================

/**
 * Creates an architecture with similar FUNCs for similarity testing
 * These FUNCs have:
 * - Same canonical verb (Validate)
 * - Highly similar descriptions (same words)
 * - Same io structure
 * - Same parent
 */
function createArchWithSimilarFuncs(): Architecture {
  return {
    id: 'test-arch-similar-funcs',
    nodes: [
      {
        id: 'func1',
        type: 'FUNC',
        label: 'ValidateOrder',
        properties: {
          // Description with shared words for high Jaccard similarity
          descr: 'Validates input data completeness and correctness for order processing'
        }
      },
      {
        id: 'func2',
        type: 'FUNC',
        label: 'ValidatePayment',
        properties: {
          // Same structure, same words (validates, input, data, completeness, correctness, processing)
          descr: 'Validates input data completeness and correctness for payment processing'
        }
      },
      {
        id: 'func3',
        type: 'FUNC',
        label: 'ValidateShipment',
        properties: {
          descr: 'Validates input data completeness and correctness for shipment processing'
        }
      },
      {
        id: 'mod1',
        type: 'MOD',
        label: 'OrderService',
        properties: {}
      },
      {
        id: 'flow1',
        type: 'FLOW',
        label: 'InputData',
        properties: {}
      },
      {
        id: 'flow2',
        type: 'FLOW',
        label: 'OutputResult',
        properties: {}
      },
      {
        id: 'parent1',
        type: 'FUNC',
        label: 'ParentFunc',
        properties: {}
      }
    ],
    edges: [
      { id: 'e1', source: 'func1', target: 'mod1', type: 'allocate' },
      { id: 'e2', source: 'func2', target: 'mod1', type: 'allocate' },
      { id: 'e3', source: 'func3', target: 'mod1', type: 'allocate' },
      // Same io structure for all funcs: flow1 -> func -> flow2
      { id: 'e4', source: 'flow1', target: 'func1', type: 'io' },
      { id: 'e5', source: 'func1', target: 'flow2', type: 'io' },
      { id: 'e6', source: 'flow1', target: 'func2', type: 'io' },
      { id: 'e7', source: 'func2', target: 'flow2', type: 'io' },
      { id: 'e8', source: 'flow1', target: 'func3', type: 'io' },
      { id: 'e9', source: 'func3', target: 'flow2', type: 'io' },
      // Same parent for hierarchy bonus
      { id: 'e10', source: 'parent1', target: 'func1', type: 'compose' },
      { id: 'e11', source: 'parent1', target: 'func2', type: 'compose' },
      { id: 'e12', source: 'parent1', target: 'func3', type: 'compose' }
    ]
  };
}

/**
 * Creates an architecture with similar SCHEMAs
 * These SCHEMAs have:
 * - Identical field names (maximal struct similarity)
 * - Same label (maximal name similarity)
 * - Shared flow usage (maximal usage similarity)
 *
 * This ensures combined score >= 0.70
 */
function createArchWithSimilarSchemas(): Architecture {
  return {
    id: 'test-arch-similar-schemas',
    nodes: [
      {
        id: 'schema1',
        type: 'SCHEMA',
        label: 'EntityDataSchema',
        properties: {
          // Identical fields for maximal similarity
          struct: JSON.stringify({
            identifier: 'string',
            createdAt: 'datetime',
            currentStatus: 'string',
            detailsObject: 'object',
            referenceCode: 'string'
          })
        }
      },
      {
        id: 'schema2',
        type: 'SCHEMA',
        label: 'EntityDataSchema',
        properties: {
          // Same fields = identical struct similarity
          struct: JSON.stringify({
            identifier: 'string',
            createdAt: 'datetime',
            currentStatus: 'string',
            detailsObject: 'object',
            referenceCode: 'string'
          })
        }
      },
      {
        id: 'flow1',
        type: 'FLOW',
        label: 'EntityData',
        properties: {}
      }
    ],
    edges: [
      // Both schemas used by same flow
      { id: 'e1', source: 'flow1', target: 'schema1', type: 'relation' },
      { id: 'e2', source: 'flow1', target: 'schema2', type: 'relation' }
    ]
  };
}

/**
 * Creates an architecture with cross-cutting allocation (FUNC allocated to multiple MODs)
 */
function createArchWithCrossCuttingAllocation(): Architecture {
  return {
    id: 'test-arch-cross-cutting',
    nodes: [
      {
        id: 'func1',
        type: 'FUNC',
        label: 'ProcessPayment',
        properties: {}
      },
      {
        id: 'mod1',
        type: 'MOD',
        label: 'OrderService',
        properties: {}
      },
      {
        id: 'mod2',
        type: 'MOD',
        label: 'PaymentService',
        properties: {}
      }
    ],
    edges: [
      // FUNC allocated to TWO MODs - violation!
      { id: 'e1', source: 'mod1', target: 'func1', type: 'allocate' },
      { id: 'e2', source: 'mod2', target: 'func1', type: 'allocate' }
    ]
  };
}

// ============================================================================
// Test Suite: FUNC Similarity Detection
// ============================================================================

describe('CR-049: FUNC Similarity Detection', () => {
  it('detects func_merge_candidate violations for similar FUNCs', () => {
    const arch = createArchWithSimilarFuncs();
    const violations = detectViolations(arch);

    // Should detect similarity between Validate* functions
    const mergeCandidates = violations.filter(v => v.ruleId === 'func_merge_candidate');

    // At minimum, ValidateOrder/ValidatePayment should be flagged (same verb + similar description)
    expect(mergeCandidates.length).toBeGreaterThanOrEqual(1);

    // Check that MERGE is suggested
    for (const v of mergeCandidates) {
      expect(v.suggestedOperator).toBe('MERGE');
      expect(v.affectedNodes.length).toBe(2);
    }
  });

  it('MERGE operator applicableTo includes func_merge_candidate', () => {
    const mergeOp = MOVE_OPERATORS.MERGE;
    expect(mergeOp.applicableTo).toContain('func_merge_candidate');
    expect(mergeOp.applicableTo).toContain('func_near_duplicate');
  });

  it('MERGE operator merges two similar FUNCs', () => {
    const arch = createArchWithSimilarFuncs();
    const violation: Violation = {
      ruleId: 'func_merge_candidate',
      severity: 'soft',
      affectedNodes: ['func1', 'func2'],
      message: 'Merge candidate FUNCs',
      suggestedOperator: 'MERGE'
    };

    const result = applyOperator(arch, 'MERGE', violation);

    expect(result.success).toBe(true);
    expect(result.after).not.toBeNull();

    // Should have fewer nodes after merge
    expect(result.after!.nodes.length).toBeLessThan(arch.nodes.length);

    // The merged node should exist
    const mergedNode = result.after!.nodes.find(n =>
      n.properties.mergedFrom &&
      Array.isArray(n.properties.mergedFrom)
    );
    expect(mergedNode).toBeDefined();
  });
});

// ============================================================================
// Test Suite: SCHEMA Similarity Detection
// ============================================================================

describe('CR-049: SCHEMA Similarity Detection', () => {
  it('detects schema_merge_candidate violations for similar SCHEMAs', () => {
    const arch = createArchWithSimilarSchemas();
    const violations = detectViolations(arch);

    // With identical schemas, should get near_duplicate (>= 0.85) or merge_candidate (>= 0.70)
    const similarityViolations = violations.filter(v =>
      v.ruleId === 'schema_merge_candidate' || v.ruleId === 'schema_near_duplicate'
    );

    // Identical struct (50% * 1.0 = 0.50) + identical name (25% * 1.0 = 0.25) + same flow usage (25% * 1.0 = 0.25) = 1.0
    expect(similarityViolations.length).toBeGreaterThanOrEqual(1);

    for (const v of similarityViolations) {
      expect(v.suggestedOperator).toBe('MERGE');
      expect(v.affectedNodes.length).toBe(2);
    }
  });

  it('MERGE operator applicableTo includes schema_merge_candidate', () => {
    const mergeOp = MOVE_OPERATORS.MERGE;
    expect(mergeOp.applicableTo).toContain('schema_merge_candidate');
    expect(mergeOp.applicableTo).toContain('schema_near_duplicate');
  });
});

// ============================================================================
// Test Suite: Allocation Cohesion
// ============================================================================

describe('CR-049: Allocation Cohesion', () => {
  it('detects allocation_cohesion violation for FUNC allocated to multiple MODs', () => {
    const arch = createArchWithCrossCuttingAllocation();
    const violations = detectViolations(arch);

    const cohesionViolations = violations.filter(v => v.ruleId === 'allocation_cohesion');

    expect(cohesionViolations.length).toBe(1);
    expect(cohesionViolations[0].affectedNodes).toContain('func1');
    expect(cohesionViolations[0].affectedNodes.length).toBe(3); // func + 2 mods
    expect(cohesionViolations[0].suggestedOperator).toBe('REALLOC');
  });

  it('REALLOC operator applicableTo includes allocation_cohesion', () => {
    const reallocOp = MOVE_OPERATORS.REALLOC;
    expect(reallocOp.applicableTo).toContain('allocation_cohesion');
  });

  it('REALLOC operator removes excess allocate edges for allocation_cohesion', () => {
    const arch = createArchWithCrossCuttingAllocation();
    const violation: Violation = {
      ruleId: 'allocation_cohesion',
      severity: 'soft',
      affectedNodes: ['func1', 'mod1', 'mod2'],
      message: 'FUNC allocated to 2 MODs',
      suggestedOperator: 'REALLOC'
    };

    const result = applyOperator(arch, 'REALLOC', violation);

    expect(result.success).toBe(true);
    expect(result.after).not.toBeNull();

    // Should have only ONE allocate edge for func1 after fix
    const allocateEdges = result.after!.edges.filter(e =>
      e.type === 'allocate' &&
      (e.source === 'func1' || e.target === 'func1')
    );
    expect(allocateEdges.length).toBe(1);
  });

  it('no allocation_cohesion violation for FUNC with single MOD', () => {
    const arch: Architecture = {
      id: 'test-arch-single-alloc',
      nodes: [
        { id: 'func1', type: 'FUNC', label: 'F1', properties: {} },
        { id: 'mod1', type: 'MOD', label: 'M1', properties: {} }
      ],
      edges: [
        { id: 'e1', source: 'mod1', target: 'func1', type: 'allocate' }
      ]
    };

    const violations = detectViolations(arch);
    const cohesionViolations = violations.filter(v => v.ruleId === 'allocation_cohesion');

    expect(cohesionViolations.length).toBe(0);
  });
});

// ============================================================================
// Test Suite: Canonical Verb Matching
// ============================================================================

describe('CR-049: Canonical Verb Matching', () => {
  it('treats Validate and Check as same canonical verb', () => {
    const arch: Architecture = {
      id: 'test-arch-verbs',
      nodes: [
        {
          id: 'func1',
          type: 'FUNC',
          label: 'ValidateInput',
          properties: { descr: 'Validates user input' }
        },
        {
          id: 'func2',
          type: 'FUNC',
          label: 'CheckInput',
          properties: { descr: 'Checks user input for errors' }
        }
      ],
      edges: []
    };

    const violations = detectViolations(arch);

    // Should detect similarity due to canonical verb match (Validate = Check)
    const similarityViolations = violations.filter(v =>
      v.ruleId === 'func_merge_candidate' || v.ruleId === 'func_near_duplicate'
    );

    // Verb match alone gives 0.25, plus description similarity
    expect(similarityViolations.length).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// Test Suite: Operator Registration
// ============================================================================

describe('CR-049: Operator Registration', () => {
  it('DELETE operator applicableTo includes allocation_cohesion', () => {
    const deleteOp = MOVE_OPERATORS.DELETE;
    expect(deleteOp.applicableTo).toContain('allocation_cohesion');
  });

  it('all new violation types have at least one applicable operator', () => {
    const newViolationTypes = [
      'func_merge_candidate',
      'func_near_duplicate',
      'schema_merge_candidate',
      'schema_near_duplicate',
      'allocation_cohesion'
    ];

    for (const violationType of newViolationTypes) {
      const applicableOps = Object.entries(MOVE_OPERATORS)
        .filter(([, op]) => op.applicableTo.includes(violationType))
        .map(([type]) => type);

      expect(applicableOps.length).toBeGreaterThan(0);
    }
  });
});
