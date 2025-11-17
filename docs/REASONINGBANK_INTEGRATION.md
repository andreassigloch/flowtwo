# ReasoningBank Integration for AiSE Reloaded

## Overview

ReasoningBank provides **persistent pattern memory** for the AI Assistant, enabling it to learn from successful derivations, validation corrections, and architecture decisions.

**Performance Impact**: 34% task effectiveness improvement through pattern reuse.

## Key Capabilities

### 1. Derivation Pattern Learning

The AI Assistant learns successful derivation strategies:

```typescript
// After successful UC → FUNC derivation
await reasoningbank.storeDerivationPattern(
  'uc-to-func',
  { type: 'UC', Name: 'PlaceOrder', Descr: 'Customer places an order...' },
  [
    { type: 'FUNC', Name: 'ValidateOrder', Descr: 'Validate customer order data' },
    { type: 'FUNC', Name: 'CheckInventory', Descr: 'Check product availability' },
    { type: 'FUNC', Name: 'ProcessPayment', Descr: 'Process customer payment' }
  ],
  true,  // userApproved
  0.95   // confidence
);

// Later, retrieve for similar derivation
const patterns = await reasoningbank.getDerivationPatterns(
  'uc-to-func',
  'order processing use case',
  3
);

// Enrich LLM prompt
const enrichedPrompt = await reasoningbank.enrichPromptWithPatterns(
  'derive functions from PlaceOrder use case',
  'aise-derivation',
  3
);
```

**Result**: AI produces more consistent, higher-quality derivations by learning from past successes.

---

### 2. Validation Anti-Pattern Detection

Learn from common mistakes to prevent future violations:

```typescript
// Store anti-pattern after user correction
await reasoningbank.storeValidationPattern(
  'FUNC without I/O relationships',
  'Users often forget to add FLOW nodes for function I/O',
  [
    'Detect: FUNC created without -io-> relationships',
    'Suggest: "Add input FLOW and output FLOW for this function"',
    'Auto-derive: Common I/O patterns based on function name'
  ],
  {
    violations_prevented: 47,
    avg_fix_time_reduction: '3.2min'
  }
);

// Later, proactively check for anti-patterns
const antiPatterns = await reasoningbank.getValidationPatterns(
  'function without input output'
);

if (antiPatterns.length > 0) {
  // AI can proactively suggest:
  // "I notice you created a function. Based on past patterns,
  //  let me suggest input and output FLOW nodes..."
}
```

---

### 3. Architecture Best Practices

Store and reuse successful architecture patterns:

```typescript
// Store successful architecture pattern
await reasoningbank.storeArchitecturePattern(
  'Layered Architecture: UC → FCHAIN → FUNC',
  'Well-structured systems use function chains to organize functions',
  [
    'Create UC for user-facing feature',
    'Create FCHAIN for internal flow',
    'Compose FUNC nodes in FCHAIN',
    'Link UC -cp-> FCHAIN -cp-> FUNC'
  ],
  'Organize complex use cases with FCHAIN nodes for better structure',
  0.92  // quality
);

// Retrieve during architecture analysis
const bestPractices = await reasoningbank.getArchitecturePatterns(
  'organize functions hierarchically'
);

// AI gives recommendations based on learned patterns
```

---

## Integration with AI Assistant

### Enrich Prompts with Patterns

```typescript
// In AIAssistantService.buildSystemPromptWithCaching()

// Add patterns to system prompt
const patterns = await reasoningbank.enrichPromptWithPatterns(
  context.currentTask,
  'aise-derivation',
  3
);

const systemPrompt = [
  {
    type: "text",
    text: basePrompt + patterns  // ← Add learned patterns
  },
  // ... cached parts
];
```

### Store Patterns After Successful Operations

```typescript
// In ResponseDistributor.processLLMResponse()

async processOperations(operations: Operation[]) {
  const results = await this.executeOperations(operations);

  if (results.success && userApproved) {
    // Store successful derivation pattern
    const derivationType = this.detectDerivationType(operations);
    if (derivationType) {
      await reasoningbank.storeDerivationPattern(
        derivationType,
        sourceNode,
        derivedNodes,
        true,
        results.confidence
      );
    }
  }
}
```

---

## Performance Metrics (From Research)

| Metric | Improvement |
|--------|------------|
| Task Effectiveness | **+34%** |
| Success Rate | **+8.3%** |
| Interaction Steps | **-16%** (fewer iterations needed) |
| Retrieval Latency | **2-3ms** (at 100k patterns) |

---

## Data Storage

Patterns are stored in claude-flow memory with the `--reasoningbank` flag:

```bash
npx claude-flow@alpha memory store \
  "pattern-title" \
  '{"namespace": "aise-derivation", ...}' \
  --namespace aise-derivation-uc-to-func \
  --reasoningbank
```

**Namespaces**:
- `aise-derivation` - Successful derivation patterns
- `aise-validation` - Validation rules and corrections
- `aise-anti-pattern` - Common mistakes to avoid
- `aise-architecture` - Architecture best practices

---

## Usage Examples

### Example 1: Improve REQ → TEST Derivation

```typescript
// 1. User requests test derivation
const requirement = {
  type: 'REQ',
  Name: 'PaymentSecurity',
  Descr: 'All payments must use encrypted channels and comply with PCI DSS'
};

// 2. Retrieve learned patterns
const patterns = await reasoningbank.getDerivationPatterns(
  'req-to-test',
  'security payment encryption compliance',
  3
);

// 3. Enrich LLM prompt with patterns
const prompt = `
Derive test cases for requirement:
${requirement.Name}: ${requirement.Descr}

Based on successful patterns from past sessions:
${patterns.map(p => `
Pattern: ${p.title}
Steps: ${p.steps.join(', ')}
Examples: ${p.examples?.join(', ')}
`).join('\n')}

Now create comprehensive test cases...
`;

// 4. After successful derivation, store new pattern
await reasoningbank.storeDerivationPattern(
  'req-to-test',
  requirement,
  derivedTests,
  true,  // user approved
  0.92
);
```

**Result**: Next time a security requirement needs tests, AI knows to check for encryption, compliance, and PCI DSS tests.

---

### Example 2: Prevent Common Validation Errors

```typescript
// After user corrects validation error 5 times
await reasoningbank.storeValidationPattern(
  'Missing Actor connections',
  'Users often create ACTOR nodes without connecting them to FLOW',
  [
    'Detect: ACTOR created without -io-> FLOW relationships',
    'Validate: Every ACTOR should have at least one FLOW connection',
    'Suggest: "Connect this ACTOR to a FLOW node to show data exchange"'
  ],
  {
    violations_prevented: 23,
    avg_fix_time_reduction: '1.5min'
  }
);

// Now AI proactively suggests fixes
const antiPatterns = await reasoningbank.getValidationPatterns(
  'actor without flow connection'
);

if (antiPatterns.length > 0) {
  // Include in validation response:
  // "⚠️ Missing FLOW connection. Based on past corrections,
  //  actors typically need FLOW nodes to represent data exchange."
}
```

---

## Future Enhancements

1. **Automatic Quality Tracking**: Update pattern quality based on usage frequency
2. **Pattern Versioning**: Track pattern evolution over time
3. **Cross-Project Learning**: Share patterns across different SE projects
4. **Pattern Visualization**: UI to browse and manage learned patterns

---

## Summary

ReasoningBank enables the AI Assistant to **learn from experience**:

✅ **Remember** successful derivation strategies
✅ **Avoid** common validation mistakes
✅ **Apply** architecture best practices
✅ **Improve** over time with each user interaction

**Impact**: 34% better task effectiveness, fewer iterations, more consistent results.
