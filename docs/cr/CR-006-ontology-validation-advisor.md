# CR-006: Implement Ontology Validation Advisor

**Status:** Planned
**Priority:** CRITICAL - MVP Blocker
**Target Phase:** Phase 3
**Created:** 2025-11-19
**MVP Acceptance Criteria:** #4 (Quality assurance with validation)

## Problem

According to [implan.md:188-213](../implan.md#L188-L213) and requirements.md FR-8.2, the system must validate ontology compliance and provide LLM-based explanations and fixes. Currently:

- **Status:** NOT IMPLEMENTED (explicitly marked in implan.md)
- **12 validation rules** are defined but not enforced
- **No automated quality assurance** for user-created graphs
- **No natural language explanations** for violations

**Impact:** Users can create invalid ontologies that violate INCOSE/SysML principles, undermining the system's quality assurance value proposition.

## Requirements

**From implan.md - 12 Validation Rules:**

### Structural Rules
1. **No orphan nodes** - Every node must have at least one edge
2. **UC must have ≥1 scenario** - Use cases need scenarios
3. **FUNC must specify interfaces** - Functions need inputs/outputs defined
4. **TEST must reference ≥1 REQ** - Tests must trace to requirements

### Semantic Rules
5. **REQ types correct** (functional vs non-functional classification)
6. **Allocation completeness** - All functions allocated to modules
7. **Traceability chains** - REQ → FUNC → TEST chains exist
8. **No circular dependencies** - Module/function dependency graph is acyclic

### Quality Rules
9. **Naming conventions** - Follow consistent naming patterns
10. **Description completeness** - Critical nodes have descriptions
11. **Edge correctness** - Edge types match ontology_schema.json
12. **Cardinality** - Edge multiplicity rules respected

## Proposed Solution

### Architecture

```typescript
// src/llm-engine/ontology-validator.ts
interface ValidationResult {
  isValid: boolean;
  violations: Violation[];
  suggestions: ValidationFix[];
}

interface Violation {
  rule: ValidationRule;
  severity: 'error' | 'warning' | 'info';
  nodeId: string;
  message: string;
  explanation: string; // Natural language from LLM
}

interface ValidationFix {
  violation: Violation;
  autoFixAvailable: boolean;
  suggestedAction: string;
  llmRationale: string;
}
```

### Validation Rules Implementation

**Rule 1-4: Structural Validation** (Deterministic)
```typescript
function validateStructure(graph: GraphCanvas): Violation[] {
  const violations: Violation[] = [];

  // Rule 1: No orphans
  graph.nodes.forEach(node => {
    const edges = graph.getEdgesForNode(node.id);
    if (edges.length === 0) {
      violations.push({
        rule: 'no-orphan-nodes',
        severity: 'warning',
        nodeId: node.id,
        message: `Node "${node.label}" has no connections`,
        explanation: await llmExplain('orphan-node', node)
      });
    }
  });

  // Rule 2-4: Type-specific checks
  // ... similar logic for UC scenarios, FUNC interfaces, TEST requirements

  return violations;
}
```

**Rule 5-8: Semantic Validation** (Rule-based + LLM)
```typescript
async function validateSemantics(graph: GraphCanvas): Promise<Violation[]> {
  const violations: Violation[] = [];

  // Rule 7: Traceability chains
  const requirements = graph.getNodesByType('Requirement');
  for (const req of requirements) {
    const hasTraceability = await checkTraceability(req, graph);
    if (!hasTraceability) {
      const explanation = await llm.explain(
        `Why is traceability important for requirement "${req.label}"?`
      );
      violations.push({
        rule: 'traceability-chains',
        severity: 'error',
        nodeId: req.id,
        message: 'Requirement lacks complete traceability',
        explanation
      });
    }
  }

  return violations;
}
```

**Rule 9-12: Quality Validation** (LLM-assisted)
```typescript
async function validateQuality(graph: GraphCanvas): Promise<Violation[]> {
  const violations: Violation[] = [];

  // Rule 10: Description completeness
  const criticalNodes = graph.getNodesByType(['Requirement', 'Function', 'Module']);
  for (const node of criticalNodes) {
    if (!node.description || node.description.length < 20) {
      const suggestion = await llm.suggestDescription(node);
      violations.push({
        rule: 'description-completeness',
        severity: 'warning',
        nodeId: node.id,
        message: 'Critical node lacks detailed description',
        explanation: `A ${node.type} should explain its purpose and constraints. Suggestion: "${suggestion}"`
      });
    }
  }

  return violations;
}
```

### LLM-Based Explanations

```typescript
async function generateExplanation(violation: Violation): Promise<string> {
  const prompt = `
You are an INCOSE/SysML expert advisor.

Violation: ${violation.message}
Node: ${violation.nodeId} (${violation.rule})

Explain:
1. Why this violates SE best practices
2. What problems it might cause
3. How to fix it

Be concise (2-3 sentences).
`;

  const response = await llm.complete(prompt);
  return response.textResponse;
}
```

### Auto-Fix Suggestions

```typescript
async function generateFix(violation: Violation, graph: GraphCanvas): Promise<ValidationFix> {
  switch (violation.rule) {
    case 'no-orphan-nodes':
      // Suggest connections based on node type and name
      const suggestions = await llm.suggestConnections(violation.nodeId, graph);
      return {
        violation,
        autoFixAvailable: false,
        suggestedAction: `Connect to: ${suggestions.join(', ')}`,
        llmRationale: suggestions.rationale
      };

    case 'description-completeness':
      // LLM generates description
      const description = await llm.generateDescription(violation.nodeId, graph);
      return {
        violation,
        autoFixAvailable: true,
        suggestedAction: `Add description: "${description}"`,
        llmRationale: 'Generated based on node type and relationships'
      };

    // ... other rules
  }
}
```

## Implementation Plan

### Phase 1: Core Validator (6-8 hours)
1. Create `src/llm-engine/ontology-validator.ts`
2. Implement validation rule registry
3. Add violation severity classification
4. Implement validation result aggregation

### Phase 2: Structural Rules (4-6 hours)
1. Implement Rules 1-4 (deterministic checks)
2. Add graph traversal utilities
3. Test with invalid graph samples

### Phase 3: Semantic Rules (8-10 hours)
1. Implement Rules 5-8 (rule-based + LLM)
2. Add traceability chain analysis
3. Add circular dependency detection
4. Test with complex ontologies

### Phase 4: Quality Rules (6-8 hours)
1. Implement Rules 9-12 (LLM-assisted)
2. Add naming convention patterns
3. Add description quality scoring
4. Test with real-world examples

### Phase 5: LLM Integration (8-10 hours)
1. Implement explanation generation
2. Implement fix suggestion generation
3. Add prompt templates for all rule types
4. Test LLM responses for quality

### Phase 6: UI Integration (6-8 hours)
1. Add `/validate` command to chat interface
2. Display violations in terminal UI
3. Highlight violated nodes in graph view
4. Add auto-fix acceptance workflow

### Phase 7: Testing (8-10 hours)
1. Unit tests for each validation rule
2. Integration tests with LLM
3. Test with ontology_schema.json compliance
4. Performance testing (large graphs)

## Acceptance Criteria

- [ ] All 12 validation rules implemented and functional
- [ ] Natural language explanations generated by LLM
- [ ] Auto-fix suggestions provided where applicable
- [ ] User can run validation via `/validate` command
- [ ] Violations displayed with severity levels
- [ ] Unit tests cover all validation rules (90% coverage)
- [ ] Integration tests validate LLM explanations
- [ ] Performance: <2s for graphs with <1000 nodes

## Dependencies

- LLM Engine functional (already implemented)
- ontology_schema.json complete (needs verification)
- Graph traversal utilities (already exist in GraphEngine)
- Chat interface command handling (already implemented)

## Estimated Effort

- Core Validator: 6-8 hours
- Structural Rules: 4-6 hours
- Semantic Rules: 8-10 hours
- Quality Rules: 6-8 hours
- LLM Integration: 8-10 hours
- UI Integration: 6-8 hours
- Testing: 8-10 hours
- **Total: 46-60 hours (6-8 days)**

## MVP Impact

**This is a CRITICAL MVP blocker:**
- MVP Acceptance Criteria #4: "Quality assurance with validation and compliance checks"
- Without validation, users can create invalid ontologies
- Quality assurance is a key differentiator vs. generic graph tools
- INCOSE/SysML compliance requires automated validation

## References

- [implan.md:188-213](../implan.md#L188-L213) - Phase 3 Ontology Validation section
- requirements.md FR-8.2 - Validation requirements
- ontology_schema.json - Ontology definition
- INCOSE Systems Engineering Handbook v4

## Notes

- Implement rules incrementally (structural → semantic → quality)
- Start with deterministic rules (easier to test)
- LLM explanations should reference INCOSE/SysML principles
- Consider caching common violations and fixes (AgentDB in CR-007)
- Performance critical for real-time validation feedback
