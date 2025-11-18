# Ontology V3 Validation Rules Documentation

## Overview

This document provides detailed documentation for all 12 validation rules implemented in the AiSE Reloaded Ontology Validator. These rules ensure compliance with Systems Engineering and Requirements Engineering best practices as defined in the Ontology V3 specification.

## Table of Contents

1. [Naming Convention](#rule-1-naming-convention)
2. [No Isolated Elements](#rule-2-no-isolated-elements)
3. [Function Requirements](#rule-3-function-requirements)
4. [Function Input/Output](#rule-4-function-inputoutput)
5. [Flow Node Connectivity](#rule-5-flow-node-connectivity)
6. [Functional Flow](#rule-6-functional-flow)
7. [Function Chain Connectivity](#rule-7-function-chain-connectivity)
8. [Flow Cycles](#rule-8-flow-cycles)
9. [Function Allocation](#rule-9-function-allocation)
10. [Requirements Verification](#rule-10-requirements-verification)
11. [Leaf Use Case Actor](#rule-11-leaf-use-case-actor)
12. [Scheme Usage](#rule-12-scheme-usage)

---

## Rule 1: Naming Convention

**Rule ID:** `naming`

**Description:** All names must start with an uppercase letter (PascalCase) and not exceed 25 characters.

### Purpose

Enforces consistent naming conventions across the ontology, improving readability and maintainability. PascalCase is a standard convention in software engineering that makes names clear and professional.

### Requirements

- Names must start with an uppercase letter (A-Z)
- Names must not exceed 25 characters in length
- Names should follow PascalCase convention (alphanumeric only, no spaces or special characters)

### Examples

#### Valid Names ✓
```
TestSystem
UserAuthentication
DataProcessor
ApiGateway
OrderManagement
```

#### Invalid Names ✗
```
testSystem              // starts with lowercase
user_authentication     // contains underscore
DataProcessorForComplexSystemAnalysis  // exceeds 25 characters
API-Gateway            // contains hyphen
Order Management       // contains space
```

### Violation Detection

The rule checks each node in the graph and flags violations when:
- Name is missing or empty
- Name starts with a lowercase letter
- Name exceeds 25 characters
- Name contains non-alphanumeric characters

### Suggested Fixes

The validator automatically suggests corrected names by:
- Converting to PascalCase
- Removing special characters and spaces
- Truncating to 25 characters if necessary

Example suggestion:
```
Original: "user_authentication_service"
Suggested: "UserAuthenticationService"
```

---

## Rule 2: No Isolated Elements

**Rule ID:** `isolation`

**Description:** All elements must have at least one link to another element. No isolated nodes are allowed.

### Purpose

Ensures that all nodes in the ontology are part of the system structure. Isolated nodes indicate incomplete modeling or orphaned elements that serve no purpose in the system architecture.

### Requirements

- Every node must have at least one relationship (incoming or outgoing)
- Valid relationships include: compose, io, satisfy, verify, allocate, relation

### Examples

#### Valid Graph ✓
```
[SYS] --compose--> [UC]
[UC] --compose--> [ACTOR]
[FUNC] --satisfy--> [REQ]
```
All nodes have connections.

#### Invalid Graph ✗
```
[SYS] --compose--> [UC]
[ACTOR]  // isolated - no connections
[FUNC]   // isolated - no connections
```

### Violation Detection

The rule:
1. Builds a set of all nodes referenced in relationships
2. Checks each node to see if it appears in the set
3. Flags nodes that have no incoming or outgoing relationships

### Suggested Fixes

- Add appropriate relationships to connect isolated nodes
- Consider if the isolated node should be removed
- Link to parent containers using 'compose' relationships
- Link to related elements using appropriate relationship types

---

## Rule 3: Function Requirements

**Rule ID:** `function_requirements`

**Description:** A Function must have at least one requirement.

### Purpose

Ensures traceability from functions to requirements. Every function must fulfill at least one requirement to justify its existence in the system. This is fundamental to Requirements Engineering.

### Requirements

- Every FUNC node must have at least one outgoing 'satisfy' relationship to a REQ node

### Examples

#### Valid ✓
```
[FUNC: ProcessOrder] --satisfy--> [REQ: OrderProcessingReq]
[FUNC: ValidateUser] --satisfy--> [REQ: UserValidationReq]
```

#### Invalid ✗
```
[FUNC: ProcessOrder]  // no requirements
```

### Relationship Pattern

```
FUNC --[satisfy]--> REQ
```

### Violation Detection

For each FUNC node, the rule:
1. Searches for 'satisfy' relationships where the FUNC is the source
2. Verifies the target is a REQ node
3. Flags functions with zero requirement relationships

### Suggested Fixes

- Add a 'satisfy' relationship from the function to an appropriate requirement
- Create a new requirement if none exists that describes what the function fulfills
- Review if the function is necessary if it doesn't satisfy any requirements

---

## Rule 4: Function Input/Output

**Rule ID:** `function_io`

**Description:** A Function must have at least one input and one output via io relationships to FLOW nodes.

### Purpose

Ensures proper data flow modeling. Every function must receive input data and produce output data. This is essential for understanding system behavior and data dependencies.

### Requirements

- Every FUNC node must have at least one incoming 'io' relationship from a FLOW node (input)
- Every FUNC node must have at least one outgoing 'io' relationship to a FLOW node (output)

### Examples

#### Valid ✓
```
[FLOW: UserData] --io--> [FUNC: ValidateUser] --io--> [FLOW: ValidationResult]
```

#### Invalid ✗
```
[FUNC: ProcessOrder] --io--> [FLOW: OrderResult]  // no input
[FLOW: UserInput] --io--> [FUNC: ValidateUser]    // no output
```

### Relationship Pattern

```
FLOW --[io]--> FUNC --[io]--> FLOW
```

### Violation Detection

For each FUNC node, the rule:
1. Counts incoming 'io' relationships from FLOW nodes
2. Counts outgoing 'io' relationships to FLOW nodes
3. Flags functions missing input (count = 0) or output (count = 0)

### Suggested Fixes

**Missing Input:**
- Add an incoming 'io' relationship from a FLOW node that provides the necessary input data

**Missing Output:**
- Add an outgoing 'io' relationship to a FLOW node that captures the function's output

**Note:** Functions may have multiple inputs or outputs, but must have at least one of each.

---

## Rule 5: Flow Node Connectivity

**Rule ID:** `flow_node_connectivity`

**Description:** A FLOW node must have at least one incoming io relationship and one outgoing io relationship.

### Purpose

Ensures FLOW nodes serve as proper data connectors. A FLOW node represents data in transit and must have both a source and a destination. Dead-end flows indicate incomplete modeling.

### Requirements

- Every FLOW node must have at least one incoming 'io' relationship
- Every FLOW node must have at least one outgoing 'io' relationship
- Source/target can be FUNC or ACTOR nodes

### Examples

#### Valid ✓
```
[ACTOR: User] --io--> [FLOW: Request] --io--> [FUNC: Process]
[FUNC: Process] --io--> [FLOW: Response] --io--> [ACTOR: User]
```

#### Invalid ✗
```
[FLOW: DeadEnd]  // no incoming or outgoing relationships
[FUNC: Process] --io--> [FLOW: NoOutput]  // no outgoing
[FLOW: NoInput] --io--> [FUNC: Process]   // no incoming
```

### Relationship Pattern

```
(FUNC|ACTOR) --[io]--> FLOW --[io]--> (FUNC|ACTOR)
```

### Violation Detection

For each FLOW node, the rule:
1. Counts all incoming 'io' relationships (where FLOW is the target)
2. Counts all outgoing 'io' relationships (where FLOW is the source)
3. Flags FLOW nodes with zero incoming or zero outgoing relationships

### Suggested Fixes

**Missing Incoming:**
- Add an 'io' relationship from a FUNC or ACTOR node that produces this data flow

**Missing Outgoing:**
- Add an 'io' relationship to a FUNC or ACTOR node that consumes this data flow

---

## Rule 6: Functional Flow

**Rule ID:** `functional_flow`

**Description:** A functional flow must have an Actor as input, an Actor as output, connected through FLOW nodes, and include at least one Function.

### Purpose

Ensures complete end-to-end flows in the system. Every function should be part of a complete flow from an actor (user or external system) through the function and back to an actor. This validates that all functionality is accessible and produces results.

### Requirements

- Complete flow pattern: ACTOR → FLOW → FUNC → FLOW → ACTOR
- At least one FUNC node must be in the path
- May include multiple functions in the chain
- Input and output actors may be the same or different

### Examples

#### Valid ✓
```
[ACTOR: User] --io--> [FLOW: LoginRequest] --io-->
[FUNC: Authenticate] --io--> [FLOW: LoginResponse] --io--> [ACTOR: User]
```

#### Valid (Multi-Function) ✓
```
[ACTOR: User] --io--> [FLOW: OrderData] --io-->
[FUNC: ValidateOrder] --io--> [FLOW: ValidatedOrder] --io-->
[FUNC: ProcessPayment] --io--> [FLOW: Receipt] --io--> [ACTOR: User]
```

#### Invalid ✗
```
[FUNC: ProcessData] --io--> [FLOW: Result]  // no actor input or output
[ACTOR: User] --io--> [FLOW: Data] --io--> [ACTOR: System]  // no function
```

### Flow Pattern

```
ACTOR --[io]--> FLOW --[io]--> FUNC --[io]--> FLOW --[io]--> ACTOR
                                 ↓
                            (may have more FUNCs)
```

### Violation Detection

The rule:
1. Builds a graph of all 'io' relationships
2. Performs depth-first search from each ACTOR node
3. Tracks paths that include functions
4. Validates paths terminate at an ACTOR
5. Flags functions not part of any complete flow

### Suggested Fixes

- Ensure the function has an input path from an ACTOR via FLOW nodes
- Ensure the function has an output path to an ACTOR via FLOW nodes
- Check that FLOW nodes properly connect the function to actors
- Verify the complete chain: ACTOR → FLOW → FUNC → FLOW → ACTOR

---

## Rule 7: Function Chain Connectivity

**Rule ID:** `fchain_connectivity`

**Description:** All elements within a function chain (FCHAIN) must be connected through io relationships via FLOW nodes, with no isolated elements.

### Purpose

Ensures that function chains represent cohesive sequences of operations. All elements composed within a FCHAIN must be interconnected to form a meaningful execution path.

### Requirements

- All elements within a FCHAIN must be connected via 'io' relationships
- Connections are through FLOW nodes
- No isolated elements within the chain
- Elements typically include FUNC, FLOW, and ACTOR nodes

### Examples

#### Valid ✓
```
[FCHAIN: OrderProcessing] composes:
  - [ACTOR: Customer]
  - [FUNC: ValidateOrder]
  - [FLOW: ValidationResult]
  - [FUNC: ProcessPayment]
  - [FLOW: PaymentConfirmation]

With connections:
[ACTOR] --io--> [FLOW] --io--> [FUNC: ValidateOrder] --io-->
[FLOW: ValidationResult] --io--> [FUNC: ProcessPayment] --io--> [FLOW]
```

#### Invalid ✗
```
[FCHAIN: OrderProcessing] composes:
  - [FUNC: ValidateOrder]
  - [FUNC: ProcessPayment]  // isolated - no io connections
  - [FLOW: Result]
```

### Violation Detection

For each FCHAIN node, the rule:
1. Finds all elements composed by the FCHAIN
2. Builds a connectivity graph using 'io' relationships
3. Performs breadth-first search from the first element
4. Flags elements not reachable in the connectivity graph

### Suggested Fixes

- Add 'io' relationships through FLOW nodes to connect isolated elements
- Ensure all functions in the chain have proper input/output flows
- Verify the chain forms a connected sequence
- Consider if isolated elements should be removed from the chain

---

## Rule 8: Flow Cycles

**Rule ID:** `flow_cycles`

**Description:** io relationships may form cycles, but each cycle must have at least one exit path to ensure the flow can progress to completion.

### Purpose

Allows for iterative or recursive flows while preventing infinite loops. Cycles are valid in system design (e.g., retry logic, iterative processing) but must have exit conditions.

### Requirements

- Cycles in 'io' relationships are permitted
- Each cycle must have at least one exit path (edge to a node outside the cycle)
- Cycles terminating at an ACTOR are considered to have an exit

### Examples

#### Valid ✓
```
[FUNC: Process] --io--> [FLOW: Data] --io--> [FUNC: Validate] --io--> [FLOW: Result]
       ↑                                                                      ↓
       └─────────────────── io (retry path) ───────────────────────────────┘

[FUNC: Validate] --io--> [FLOW: Success] --io--> [ACTOR: User]  // exit path
```

#### Invalid ✗
```
[FUNC: A] --io--> [FLOW: Data] --io--> [FUNC: B] --io--> [FLOW: Result] --io--> [FUNC: A]
(no exit path - infinite loop)
```

### Cycle Detection

The rule:
1. Builds a directed graph of 'io' relationships
2. Performs depth-first search to detect cycles
3. For each cycle found, checks for edges leaving the cycle
4. Checks if cycle contains an ACTOR (implicit exit)
5. Flags cycles with no exit paths

### Suggested Fixes

- Add an 'io' relationship from a node in the cycle to a node outside the cycle
- Add a conditional branch that can exit the cycle
- Ensure the cycle terminates at an ACTOR node
- Document the exit condition in the FLOW or FUNC description

---

## Rule 9: Function Allocation

**Rule ID:** `function_allocation`

**Description:** Each function must be allocated to exactly one MOD element.

### Purpose

Ensures clear architectural responsibility. Every function must be implemented in exactly one module, preventing ambiguity about where functionality resides and avoiding duplicate implementations.

### Requirements

- Every FUNC node must have exactly one incoming 'allocate' relationship from a MOD node
- Functions cannot be unallocated (0 modules)
- Functions cannot be multi-allocated (>1 modules)

### Examples

#### Valid ✓
```
[MOD: UserModule] --allocate--> [FUNC: ValidateUser]
[MOD: OrderModule] --allocate--> [FUNC: ProcessOrder]
```

#### Invalid ✗
```
[FUNC: OrphanFunction]  // not allocated to any module

[MOD: Module1] --allocate--> [FUNC: AmbiguousFunction]
[MOD: Module2] --allocate--> [FUNC: AmbiguousFunction]  // allocated to 2 modules
```

### Relationship Pattern

```
MOD --[allocate]--> FUNC  (exactly once per function)
```

### Violation Detection

For each FUNC node, the rule:
1. Counts 'allocate' relationships where FUNC is the target and MOD is the source
2. Flags functions with count ≠ 1

### Suggested Fixes

**Unallocated Function:**
- Add an 'allocate' relationship from the appropriate MOD node
- Create a new module if necessary
- Review if the function should be removed

**Multi-Allocated Function:**
- Remove all but one 'allocate' relationship
- Determine the primary module responsible for the function
- Consider splitting into separate functions if truly needed in multiple modules

---

## Rule 10: Requirements Verification

**Rule ID:** `requirements_verification`

**Description:** Each Requirement must have at least one Test.

### Purpose

Ensures requirements are testable and verifiable. Every requirement must have a corresponding test to validate its implementation. This is fundamental to verification and validation processes.

### Requirements

- Every REQ node must have at least one outgoing 'verify' relationship to a TEST node

### Examples

#### Valid ✓
```
[REQ: UserAuthRequired] --verify--> [TEST: TestUserAuth]
[REQ: DataValidation] --verify--> [TEST: TestDataFormat]
[REQ: DataValidation] --verify--> [TEST: TestDataRange]  // multiple tests OK
```

#### Invalid ✗
```
[REQ: UntestableRequirement]  // no test
```

### Relationship Pattern

```
REQ --[verify]--> TEST  (at least once)
```

### Violation Detection

For each REQ node, the rule:
1. Searches for 'verify' relationships where REQ is the source
2. Verifies the target is a TEST node
3. Flags requirements with zero test relationships

### Suggested Fixes

- Add a 'verify' relationship to an appropriate TEST node
- Create a new test case if none exists
- Refine the requirement if it cannot be tested
- Consider if the requirement is necessary if it cannot be verified

---

## Rule 11: Leaf Use Case Actor

**Rule ID:** `leaf_usecase_actor`

**Description:** A leaf use case (one without child use cases) must have at least one composed actor.

### Purpose

Ensures that all concrete use cases (leaves in the use case hierarchy) specify who interacts with them. Leaf use cases represent actual system functionality and must identify their users.

### Requirements

- Leaf UC nodes (use cases with no child use cases) must have at least one outgoing 'compose' relationship to an ACTOR node
- Parent use cases (with child use cases) are exempt from this rule

### Examples

#### Valid ✓
```
[UC: ParentUseCase] --compose--> [UC: ChildUseCase]  // not a leaf
[UC: ChildUseCase] --compose--> [ACTOR: User]        // leaf with actor
```

#### Invalid ✗
```
[UC: LeafUseCase]  // leaf (no child UCs) but no actor
```

### Identifying Leaf Use Cases

A use case is a "leaf" if:
- It has no outgoing 'compose' relationships to other UC nodes
- It may have other compose relationships (to ACTOR, FCHAIN, etc.)

### Violation Detection

For each UC node, the rule:
1. Checks if it has any 'compose' relationships to other UC nodes
2. If no child use cases exist (leaf), checks for 'compose' relationships to ACTOR nodes
3. Flags leaf use cases without actors

### Suggested Fixes

- Add a 'compose' relationship from the use case to an ACTOR node
- Identify who uses this use case (users, external systems, etc.)
- If no specific actor exists, consider if the use case is correctly structured
- Break down parent use cases into leaf use cases with specific actors

---

## Rule 12: Scheme Usage

**Rule ID:** `scheme_usage`

**Description:** Every data structure, state, or definition outside of a module needs to be defined by a SCHEMA node.

### Purpose

Ensures proper documentation of shared data structures. Complex data structures used across multiple components should be formally defined in SCHEMA nodes for consistency and reusability.

### Requirements

- FLOW nodes describing complex data structures should have 'relation' relationships to SCHEMA nodes
- FUNC nodes referencing external data structures should have 'relation' relationships to SCHEMA nodes
- SCHEMA nodes define the structure using the 'Struct' property

### Heuristics for Detection

A FLOW node likely needs a SCHEMA reference if:
- Description contains keywords: "structure", "object", "data", "state", "definition", "schema"
- Has Type or Pattern properties (indicating structured data)
- Connected to multiple functions (shared/external data)

### Examples

#### Valid ✓
```
[FLOW: UserData] --relation--> [SCHEMA: UserDataStructure]
[SCHEMA: UserDataStructure] {
  Name: "UserDataStructure",
  Struct: "{ id: string, name: string, email: string }"
}
```

#### Invalid ✗
```
[FLOW: ComplexUserData]  // complex structure but no SCHEMA reference
Description: "User data structure with profile and settings"
```

### Relationship Pattern

```
FLOW --[relation]--> SCHEMA
FUNC --[relation]--> SCHEMA
```

### Violation Detection

For FLOW nodes, the rule:
1. Analyzes the description for schema-related keywords
2. Checks for Type or Pattern properties
3. Counts connected functions (>2 suggests shared data)
4. Flags FLOW nodes likely describing structures without SCHEMA references

### Suggested Fixes

- Create a SCHEMA node defining the data structure
- Add a 'relation' relationship from the FLOW/FUNC to the SCHEMA
- Document the structure in the SCHEMA's 'Struct' property using JSON-like syntax
- For module-internal data, ensure it's properly encapsulated

---

## Using the Validator

### Basic Usage

```typescript
import { OntologyValidator } from './validation/ontology-validator';
import { OntologyGraph } from './validation/types';

const validator = new OntologyValidator();
const graph: OntologyGraph = {
  nodes: [...],
  relationships: [...]
};

const result = validator.validate(graph);

if (result.overallStatus === 'fail') {
  console.log('Validation failed with', result.failedRules, 'rule failures');
  result.results.forEach(ruleResult => {
    if (ruleResult.status === 'fail') {
      console.log(`\n${ruleResult.ruleName}:`);
      ruleResult.violations.forEach(violation => {
        console.log(`  - ${violation.message}`);
        console.log(`    Fix: ${violation.suggestedFix}`);
      });
    }
  });
}
```

### Validating Specific Rules

```typescript
// Validate only naming and isolation rules
const result = validator.validate(graph, {
  rules: ['naming', 'isolation']
});
```

### Stopping on First Error

```typescript
const result = validator.validate(graph, {
  stopOnFirstError: true
});
```

### Generating Reports

```typescript
// JSON format
const jsonReport = validator.formatAsJSON(result);

// Markdown format
const markdownReport = validator.formatAsReport(result);
```

### Validating a Single Rule

```typescript
const namingResult = validator.validateRule('naming', graph);
if (namingResult && namingResult.status === 'fail') {
  console.log('Naming violations:', namingResult.violations);
}
```

---

## Validation Result Structure

### ValidationResult

```typescript
interface ValidationResult {
  overallStatus: 'pass' | 'fail' | 'warning';
  timestamp: Date;
  totalRules: number;
  passedRules: number;
  failedRules: number;
  warningRules: number;
  results: ValidationRuleResult[];
  summary: {
    totalViolations: number;
    criticalViolations: number;
    warnings: number;
  };
}
```

### ValidationRuleResult

```typescript
interface ValidationRuleResult {
  ruleId: string;
  ruleName: string;
  status: 'pass' | 'fail' | 'warning';
  description: string;
  violations: ValidationViolation[];
  affectedNodes: string[];
  affectedRelationships: string[];
  metadata?: {
    executionTimeMs?: number;
    checkedCount?: number;
    [key: string]: any;
  };
}
```

### ValidationViolation

```typescript
interface ValidationViolation {
  nodeId?: string;
  nodeName?: string;
  nodeType?: NodeType;
  relationshipId?: string;
  message: string;
  lineNumber?: number;
  suggestedFix: string;
}
```

---

## Best Practices

### 1. Run Validation Early and Often

- Validate after each significant change to the ontology
- Integrate validation into your CI/CD pipeline
- Use validation during interactive editing to provide immediate feedback

### 2. Address Violations Systematically

- Start with isolation violations (disconnected nodes often indicate incomplete modeling)
- Fix structural issues (I/O, connectivity) before refinement issues (naming)
- Prioritize critical violations (failed rules) over warnings

### 3. Use Suggested Fixes as Guidelines

- Validator suggestions are starting points, not requirements
- Consider the semantic meaning when applying fixes
- Document why you chose a particular fix

### 4. Maintain Traceability

- Ensure functions → requirements → tests chains are complete
- Use validation to verify traceability is maintained during changes
- Review requirements verification regularly

### 5. Validate Complete Flows

- Check that all functions are part of actor-to-actor flows
- Verify data flows are complete and meaningful
- Ensure cycles have proper exit conditions

---

## Troubleshooting Common Issues

### High Violation Counts

**Symptom:** Many violations across multiple rules

**Causes:**
- Incomplete ontology (early stage of development)
- Bulk import without validation
- Structural changes breaking existing relationships

**Solutions:**
- Focus on isolation rule first (connect disconnected nodes)
- Validate incrementally as you build
- Use partial validation (specific rules) during development

### Functions Without Requirements

**Symptom:** Many function_requirements violations

**Causes:**
- Bottom-up development (implementing functions before defining requirements)
- Missing requirements specification

**Solutions:**
- Define requirements first (top-down approach)
- Create placeholder requirements for existing functions
- Review if all functions are necessary

### Incomplete Flows

**Symptom:** functional_flow violations

**Causes:**
- Functions not connected to actors
- Missing FLOW nodes between elements
- Incomplete data flow chains

**Solutions:**
- Trace flow from actor through all functions back to actor
- Add missing FLOW nodes
- Ensure all I/O connections use FLOW nodes

### Cycle Warnings

**Symptom:** flow_cycles violations

**Causes:**
- Retry logic without exit paths
- Circular dependencies without termination

**Solutions:**
- Add conditional branches that exit the cycle
- Ensure cycles terminate at actors
- Document exit conditions clearly

---

## Integration with AiSE Reloaded

The validation system integrates with AiSE Reloaded at multiple points:

### Real-Time Validation
- Validate changes as users edit in the triple canvas interface
- Show validation errors inline in the graph canvas
- Provide suggestions in the chat canvas

### Backend Validation
- Validate before persisting changes to Neo4j
- Prevent invalid states from being saved
- Maintain validation history for audit trail

### Batch Validation
- Validate entire projects on load
- Generate compliance reports
- Export validation results for documentation

### Multi-Agent Integration
- Validation Agent monitors graph changes
- Canvas Sync Agent coordinates validation across views
- Ontology Agent ensures schema compliance

---

## Extending the Validator

### Adding Custom Rules

Create a new rule by implementing the `ValidationRule` interface:

```typescript
import { ValidationRule, ValidationRuleResult, OntologyGraph } from './types';

export class CustomRule implements ValidationRule {
  id = 'custom_rule';
  name = 'Custom Validation Rule';
  description = 'Description of what this rule validates';

  validate(graph: OntologyGraph): ValidationRuleResult {
    const violations = [];

    // Your validation logic here

    return {
      ruleId: this.id,
      ruleName: this.name,
      status: violations.length > 0 ? 'fail' : 'pass',
      description: this.description,
      violations,
      affectedNodes: [],
      affectedRelationships: [],
    };
  }
}
```

Register the rule in `ontology-validator.ts`:

```typescript
private initializeRules(): void {
  const ruleInstances: ValidationRule[] = [
    // ... existing rules
    new CustomRule(),
  ];
  // ...
}
```

---

## Performance Considerations

### Optimization Strategies

1. **Incremental Validation:** Validate only changed nodes and their neighbors
2. **Caching:** Cache validation results for unchanged graph regions
3. **Parallel Execution:** Run independent rules in parallel
4. **Early Termination:** Use `stopOnFirstError` for quick checks

### Complexity Analysis

| Rule | Time Complexity | Space Complexity |
|------|----------------|------------------|
| naming | O(n) | O(1) |
| isolation | O(n + r) | O(n) |
| function_requirements | O(r) | O(n) |
| function_io | O(r) | O(n) |
| flow_node_connectivity | O(r) | O(n) |
| functional_flow | O(n × r) | O(n + r) |
| fchain_connectivity | O(n × r) | O(n + r) |
| flow_cycles | O(n + r) | O(n) |
| function_allocation | O(r) | O(n) |
| requirements_verification | O(r) | O(n) |
| leaf_usecase_actor | O(r) | O(n) |
| scheme_usage | O(n + r) | O(n) |

Where:
- n = number of nodes
- r = number of relationships

---

## Conclusion

The Ontology V3 Validator provides comprehensive validation of system models against best practices in Systems Engineering and Requirements Engineering. By following these validation rules, you ensure:

- **Traceability:** Complete chains from requirements to tests
- **Completeness:** All elements properly connected and documented
- **Consistency:** Standardized naming and structure
- **Verifiability:** All requirements have corresponding tests
- **Maintainability:** Clear architecture with proper allocation

Regular validation helps maintain high-quality system models that accurately represent complex systems and support effective engineering processes.
