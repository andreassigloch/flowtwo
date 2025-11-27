/**
 * Node Type Decision Tree
 *
 * Implements the decision tree for automatic node type classification.
 * Prevents misclassifications like "FormatESerialization as Top-Level FUNC".
 *
 * CR-024: Multi-Agent Architecture System
 *
 * @author andreas@siglochconsulting
 */

import { ClassificationResult } from './types.js';

/**
 * Decision tree question (reserved for future dynamic tree implementation)
 */
// interface DecisionQuestion {
//   id: string;
//   question: string;
//   yesPath: string | DecisionQuestion;
//   noPath: string | DecisionQuestion;
// }

/**
 * Classification keywords for pattern matching
 */
const CLASSIFICATION_PATTERNS = {
  DATA_FORMAT: [
    'serialization',
    'format',
    'schema',
    'json',
    'xml',
    'protocol',
    'encoding',
    'structure',
    'definition',
    'spec',
    'type',
  ],
  INFRASTRUCTURE: [
    'websocket',
    'http',
    'tcp',
    'udp',
    'socket',
    'connection',
    'transport',
    'protocol',
    'streaming',
  ],
  PROCESSING: [
    'process',
    'handle',
    'manage',
    'execute',
    'compute',
    'calculate',
    'transform',
    'convert',
    'validate',
    'parse',
    'generate',
  ],
  ACTOR_EXTERNAL: ['user', 'client', 'external', 'api', 'service', 'database', 'llm', 'neo4j'],
};

/**
 * Apply decision tree to classify a node
 *
 * @param name - Node name (PascalCase)
 * @param description - Node description
 * @param context - Additional context
 * @returns Classification result
 */
export function classifyNode(
  name: string,
  description: string,
  context?: {
    isTopLevel?: boolean;
    parentType?: string;
    existingFlows?: string[];
  }
): ClassificationResult {
  const nameLower = name.toLowerCase();
  const descLower = description.toLowerCase();
  const combined = `${nameLower} ${descLower}`;
  const reasoning: string[] = [];

  // Q1: Is it a data format or schema?
  if (matchesPattern(combined, CLASSIFICATION_PATTERNS.DATA_FORMAT)) {
    reasoning.push('Q1: Contains data format/schema keywords');

    // Name strongly suggests schema (e.g., FormatESerialization, DataSchema)
    const schemaStrongKeywords = ['serialization', 'schema', 'format', 'spec', 'type', 'definition'];
    if (schemaStrongKeywords.some((kw) => nameLower.includes(kw))) {
      reasoning.push('Name strongly indicates data format/schema');
      return {
        nodeType: 'SCHEMA',
        confidence: 0.9,
        reasoning,
        alternativeTypes: ['FLOW'],
      };
    }

    // Check if it defines structure vs processes data
    if (
      combined.includes('define') ||
      combined.includes('structure') ||
      combined.includes('type') ||
      combined.includes('spec')
    ) {
      reasoning.push('Defines data structure, not processing');
      return {
        nodeType: 'SCHEMA',
        confidence: 0.85,
        reasoning,
        alternativeTypes: ['FLOW'],
      };
    }
  }

  // Q1b: Is it a physical/SW component? (Check early - "module" is strong indicator)
  if (nameLower.includes('module') || nameLower.includes('component') || nameLower.includes('package')) {
    reasoning.push('Q1b: Name contains module/component keywords');
    return {
      nodeType: 'MOD',
      confidence: 0.85,
      reasoning,
    };
  }

  // Q2: Is it infrastructure/transport?
  if (matchesPattern(combined, CLASSIFICATION_PATTERNS.INFRASTRUCTURE)) {
    reasoning.push('Q2: Contains infrastructure/transport keywords');

    // Infrastructure should NOT be FUNC
    if (!matchesPattern(combined, CLASSIFICATION_PATTERNS.PROCESSING)) {
      reasoning.push('Defines transport behavior, not processing');
      return {
        nodeType: 'SCHEMA',
        confidence: 0.85,
        reasoning,
        alternativeTypes: ['FLOW'],
      };
    }
  }

  // Q3: Does it actively process data?
  if (matchesPattern(combined, CLASSIFICATION_PATTERNS.PROCESSING)) {
    reasoning.push('Q3: Contains processing keywords');

    // Q3a: Is it a top-level processing block?
    if (context?.isTopLevel) {
      reasoning.push('Is top-level processing block');

      // Check Miller's Law hint
      reasoning.push('Suggest: Ensure 5-9 top-level FUNCs (Miller\'s Law)');
      return {
        nodeType: 'FUNC',
        confidence: 0.9,
        reasoning,
      };
    }

    // Q3b: Nested under another FUNC
    if (context?.parentType === 'FUNC' || context?.parentType === 'FCHAIN') {
      reasoning.push(`Nested under ${context.parentType}`);
      return {
        nodeType: 'FUNC',
        confidence: 0.85,
        reasoning,
      };
    }

    // Default FUNC classification
    return {
      nodeType: 'FUNC',
      confidence: 0.75,
      reasoning,
      alternativeTypes: ['UC'],
    };
  }

  // Q4: Is it an external entity?
  if (matchesPattern(combined, CLASSIFICATION_PATTERNS.ACTOR_EXTERNAL)) {
    reasoning.push('Q4: Contains external entity keywords');

    // Distinguish ACTOR vs ClientManagement FUNC
    if (
      combined.includes('external') ||
      combined.includes('user') ||
      !combined.includes('manage')
    ) {
      reasoning.push('External to system scope');
      return {
        nodeType: 'ACTOR',
        confidence: 0.85,
        reasoning,
      };
    } else {
      reasoning.push('Internal client management');
      return {
        nodeType: 'FUNC',
        confidence: 0.8,
        reasoning,
      };
    }
  }

  // Q5: Is it a requirement?
  if (
    combined.includes('shall') ||
    combined.includes('must') ||
    combined.includes('requirement') ||
    combined.includes('need')
  ) {
    reasoning.push('Q5: Contains requirement keywords');
    return {
      nodeType: 'REQ',
      confidence: 0.9,
      reasoning,
    };
  }

  // Q6: Is it a test/verification?
  if (
    combined.includes('test') ||
    combined.includes('verify') ||
    combined.includes('validate') ||
    combined.includes('check')
  ) {
    reasoning.push('Q6: Contains test/verification keywords');
    return {
      nodeType: 'TEST',
      confidence: 0.85,
      reasoning,
    };
  }

  // Q7: Is it a data flow?
  if (combined.includes('flow') || combined.includes('data') || combined.includes('input') || combined.includes('output')) {
    reasoning.push('Q7: Contains flow/data keywords');
    return {
      nodeType: 'FLOW',
      confidence: 0.75,
      reasoning,
      alternativeTypes: ['SCHEMA'],
    };
  }

  // Q8: Is it a physical/SW component?
  if (combined.includes('module') || combined.includes('component') || combined.includes('package')) {
    reasoning.push('Q8: Contains module/component keywords');
    return {
      nodeType: 'MOD',
      confidence: 0.8,
      reasoning,
    };
  }

  // Default: Need more analysis
  reasoning.push('No clear classification - requires manual review');
  return {
    nodeType: 'UNKNOWN',
    confidence: 0.3,
    reasoning,
    alternativeTypes: ['FUNC', 'UC', 'SCHEMA'],
  };
}

/**
 * Check if text matches any pattern in the list
 */
function matchesPattern(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

/**
 * Validate classification against common misclassifications
 *
 * @param semanticId - Current semantic ID
 * @param nodeType - Current node type
 * @param name - Node name
 * @returns Validation result with potential misclassification
 */
export function validateClassification(
  _semanticId: string,
  nodeType: string,
  name: string
): { valid: boolean; issue?: string; suggestedType?: string } {
  const nameLower = name.toLowerCase();

  // Rule 1: Top-Level FUNC should not be a data format
  if (nodeType === 'FUNC') {
    const formatKeywords = ['serialization', 'format', 'protocol', 'schema', 'type', 'spec'];
    if (formatKeywords.some((kw) => nameLower.includes(kw))) {
      return {
        valid: false,
        issue: 'Data format/protocol should be SCHEMA, not FUNC',
        suggestedType: 'SCHEMA',
      };
    }
  }

  // Rule 2: Infrastructure should not be FUNC
  if (nodeType === 'FUNC') {
    const infraKeywords = ['websocket', 'http', 'tcp', 'udp', 'socket'];
    if (infraKeywords.some((kw) => nameLower.includes(kw))) {
      return {
        valid: false,
        issue: 'Infrastructure/protocol should be SCHEMA, not FUNC',
        suggestedType: 'SCHEMA',
      };
    }
  }

  // Rule 3: FLOW without data semantics
  if (nodeType === 'FLOW') {
    if (!nameLower.includes('data') && !nameLower.includes('flow') && !nameLower.includes('message')) {
      return {
        valid: false,
        issue: 'FLOW name should indicate data semantics',
        suggestedType: undefined, // Rename suggestion instead
      };
    }
  }

  return { valid: true };
}

/**
 * Get decision tree as structured prompt for LLM
 */
export function getDecisionTreePrompt(): string {
  return `## Node Type Decision Tree

When classifying entities, follow this decision tree:

Q1: Does it define a data structure or format?
├─ YES → SCHEMA (DataSchema or ProtocolSchema)
│   HINT: Serialization, Format, Protocol, Type, Spec → SCHEMA, NOT FUNC!
└─ NO → Continue to Q2

Q2: Does it define transport/infrastructure behavior?
├─ YES → SCHEMA (ProtocolSchema)
│   HINT: WebSocket, HTTP, TCP → SCHEMA, NOT FUNC!
└─ NO → Continue to Q3

Q3: Does it actively process data?
├─ YES → Q3a: Is it a top-level processing block?
│   ├─ YES → FUNC (ensure 5-9 per Miller's Law)
│   └─ NO → FUNC (nested under parent)
└─ NO → Continue to Q4

Q4: Is it an external communication partner?
├─ YES (outside system scope) → ACTOR
├─ YES (inside system scope) → FUNC (e.g., ClientManagement)
└─ NO → Continue to Q5

Q5: Describes a requirement?
├─ YES → REQ
└─ NO → Continue to Q6

Q6: Is it a test/verification?
├─ YES → TEST
└─ NO → Continue to Q7

Q7: Defines a data flow between components?
├─ YES → FLOW
│   HINT: Must have relation to SCHEMA for typing
└─ NO → Continue to Q8

Q8: Is it a physical/SW component?
├─ YES → MOD
└─ NO → Requires further analysis

## Common Misclassifications to AVOID

| WRONG | RIGHT | Example |
|-------|-------|---------|
| FormatESerialization as FUNC | SCHEMA | Data format definition |
| WebSocketProtocol as FUNC | SCHEMA | Protocol specification |
| DataTypes as FUNC | SCHEMA | Type definitions |
| HTTPEndpoint as FUNC | SCHEMA | API contract |
`;
}
