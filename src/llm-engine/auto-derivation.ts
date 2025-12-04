/**
 * Auto-Derivation Engine
 *
 * Implements derivation logic following SE principles:
 * - UC → FUNC: Derive logical architecture from Use Cases
 * - REQ → TEST: Generate test cases from requirements (Phase 4 verification)
 * - FUNC → FLOW: Infer I/O flows from function descriptions
 * - FUNC → MOD: Suggest module allocation based on cohesion
 *
 * All derivations produce pure Format E Diff output.
 *
 * @author andreas@siglochconsulting
 * @version 3.0.0 - CR-005 complete derivation support
 */

import { DerivationRule } from '../shared/types/llm.js';

/**
 * Architecture Derivation Request
 * Analyzes ALL UCs to derive system-wide logical architecture
 */
export interface ArchitectureDerivationRequest {
  /** All Use Cases in the system */
  useCases: Array<{
    semanticId: string;
    name: string;
    descr: string;
  }>;

  /** All Actors in the system */
  actors: Array<{
    semanticId: string;
    name: string;
    descr: string;
  }>;

  /** Existing Functions (for SE compliance check) */
  existingFunctions: Array<{
    semanticId: string;
    name: string;
    descr: string;
    parentId?: string; // Parent FCHAIN or FUNC
  }>;

  /** Existing Function Chains */
  existingFChains: Array<{
    semanticId: string;
    name: string;
    parentUC?: string;
  }>;

  /** Current canvas state (Format E) */
  canvasState: string;

  /** System semantic ID */
  systemId: string;
}

/**
 * Architecture Derivation Agent
 *
 * Derives logical architecture from ALL Use Cases following SE principles.
 * Output is pure Format E Diff.
 */
export class ArchitectureDerivationAgent {
  /**
   * Build the architecture derivation prompt
   * Analyzes ALL UCs and existing FUNCs
   *
   * @param request - Full system context
   * @returns Prompt for LLM
   */
  buildArchitecturePrompt(request: ArchitectureDerivationRequest): string {
    const ucList = request.useCases.length > 0
      ? request.useCases.map(uc => `  - ${uc.name} (${uc.semanticId}): ${uc.descr}`).join('\n')
      : '  (No Use Cases defined yet)';

    const actorList = request.actors.length > 0
      ? request.actors.map(a => `  - ${a.name} (${a.semanticId}): ${a.descr}`).join('\n')
      : '  (No Actors defined)';

    const existingFuncList = request.existingFunctions.length > 0
      ? request.existingFunctions.map(f =>
          `  - ${f.name} (${f.semanticId})${f.parentId ? ` in ${f.parentId}` : ''}: ${f.descr}`
        ).join('\n')
      : '  (No existing functions)';

    const existingFChainList = request.existingFChains.length > 0
      ? request.existingFChains.map(fc =>
          `  - ${fc.name} (${fc.semanticId})${fc.parentUC ? ` under ${fc.parentUC}` : ''}`
        ).join('\n')
      : '  (No existing function chains)';

    return `# Architecture Derivation: UC → FUNC (All Use Cases)

## Systems Engineering Principle

You are a systems architect deriving the TOP-LEVEL logical architecture from ALL Use Cases.

**Critical SE Guideline:**
A systems engineer must ask whether a function is BOTH:
1. **Observable** at the interface boundary of the part it is allocated to
2. **Verifiable** at the interface boundary of the part it is allocated to

**Decision Rules:**
- Function IS observable AND verifiable at L1 → Keep at TOP level
- Function is NOT observable OR NOT verifiable at L1 → Decompose (FUNC -cp-> FUNC)
- Implementation-level functions → Move to L2/L3 via compose

**Functional-Logical Reconciliation:**
- Functional architecture (WHAT) must align with logical architecture (HOW)
- TOP-Level functions = Major system capabilities visible at system boundary
- Sub-functions = Internal decomposition, not visible at system interface

## System Context

**System:** ${request.systemId}

### All Use Cases (analyze ALL for architecture):
${ucList}

### Actors:
${actorList}

### Existing Function Chains:
${existingFChainList}

### Existing Functions (CHECK SE COMPLIANCE):
${existingFuncList}

## Current Canvas State

\`\`\`
${request.canvasState}
\`\`\`

## Your Task

1. **Analyze ALL Use Cases** to identify TOP-Level logical functions
2. **Check existing FUNCs** for SE compliance:
   - Is it observable at system interface? (has clear I/O via FLOW nodes)
   - Is it verifiable at system interface? (can be tested at boundary)
   - If NOT → Either optimize OR decompose to sub-level
3. **Derive missing TOP-Level functions** from UC coverage gaps
4. **Define data flows** (FLOW nodes) between functions and actors

## SE Compliance Check for Existing Functions

For each existing FUNC, evaluate:
- **KEEP**: Observable + Verifiable at current level → No change needed
- **OPTIMIZE**: Missing I/O or unclear interface → Add FLOW nodes
- **DECOMPOSE**: Implementation detail exposed at wrong level → Move to FUNC -cp-> FUNC

## Output: Pure Format E Diff

Generate ONLY a Format E Diff in <operations> block. NO other custom formats.

Your response format:
1. Brief analysis text explaining your architecture decisions
2. <operations> block with Format E Diff

### Format E Structure:

\`\`\`
<operations>
<base_snapshot>${request.systemId}</base_snapshot>

## Nodes
+ {Name}|{Type}|{SemanticID}|{Description}
- {SemanticID}  // Remove nodes that violate SE principles

## Edges
+ {SourceID} -cp-> {TargetID}  // compose (hierarchy)
+ {SourceID} -io-> {TargetID}  // io (data flow)
- {SourceID} -cp-> {TargetID}  // Remove incorrect edges
</operations>
\`\`\`

### Key Patterns:

**TOP-Level Function (L1):**
\`\`\`
+ {FuncName}|FUNC|{FuncName}.FN.001|{Description}
+ {InputFlow}|FLOW|{InputFlow}.FL.001|Input data contract
+ {OutputFlow}|FLOW|{OutputFlow}.FL.001|Output data contract
+ {FChain}.FC.001 -cp-> {FuncName}.FN.001
+ {InputFlow}.FL.001 -io-> {FuncName}.FN.001
+ {FuncName}.FN.001 -io-> {OutputFlow}.FL.001
\`\`\`

**Decomposed Function (L2):**
\`\`\`
+ {ParentFunc}.FN.001 -cp-> {SubFunc}.FN.002  // Parent composes child
\`\`\`

**Actor Interface:**
\`\`\`
+ {Actor}.AC.001 -io-> {InputFlow}.FL.001   // Actor sends to FLOW
+ {OutputFlow}.FL.001 -io-> {Actor}.AC.001  // FLOW sends to Actor
\`\`\`

## Guidelines

1. **3-7 TOP-Level functions per major UC** - Don't over-decompose
2. **Every FUNC needs I/O** - At least one input FLOW, one output FLOW
3. **Actors connect via FLOW** - Never ACTOR -io-> FUNC directly
4. **FCHAIN groups related FUNCs** - One FCHAIN per UC realization
5. **Naming: Verb+Noun** - ProcessPayment, ValidateInput, GenerateReport
6. **SE Principle First** - If not observable/verifiable, decompose or remove
`;
  }

  /**
   * Extract operations from LLM response
   * Returns only the Format E Diff content
   */
  extractOperations(response: string): string | null {
    const match = response.match(/<operations>([\s\S]*?)<\/operations>/);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract analysis text (everything outside operations block)
   */
  extractAnalysisText(response: string): string {
    return response
      .replace(/<operations>[\s\S]*?<\/operations>/g, '')
      .trim();
  }
}

/**
 * Get derivation rules for UC → FUNC
 */
export function getUCtoFuncDerivationRule(): DerivationRule {
  return {
    sourceType: 'UC',
    targetTypes: ['FCHAIN', 'FUNC', 'FLOW'],
    strategy: 'decompose',
    promptTemplate: 'uc-to-func-architecture',
  };
}

// Keep old interface for backward compatibility with tests
// Will be removed after test update
export interface UCtoFuncRequest {
  useCase: {
    semanticId: string;
    name: string;
    description: string;
    scenarios?: string[];
  };
  actors: Array<{
    semanticId: string;
    name: string;
    role: string;
  }>;
  canvasState: string;
  architectureLevel: 'L1' | 'L2' | 'L3';
}

// ============================================================================
// REQ → TEST Derivation (Phase 4: Verification)
// ============================================================================

/**
 * REQ to TEST Derivation Request
 */
export interface ReqToTestDerivationRequest {
  /** Requirements to derive tests from */
  requirements: Array<{
    semanticId: string;
    name: string;
    descr: string;
    type?: 'functional' | 'non-functional';
    acceptanceCriteria?: string[];
  }>;

  /** Existing test cases (to avoid duplicates) */
  existingTests: Array<{
    semanticId: string;
    name: string;
    verifies?: string; // REQ semanticId
  }>;

  /** Current canvas state (Format E) */
  canvasState: string;

  /** System semantic ID */
  systemId: string;
}

/**
 * REQ → TEST Derivation Agent
 *
 * Derives test cases from requirements following verification principles:
 * - Every REQ must have at least one TEST (verify edge)
 * - Test types: positive, negative, boundary, edge case
 * - Test descriptions include expected results
 */
export class ReqToTestDerivationAgent {
  /**
   * Build the REQ → TEST derivation prompt
   */
  buildTestDerivationPrompt(request: ReqToTestDerivationRequest): string {
    const reqList = request.requirements.length > 0
      ? request.requirements.map(req => {
          const criteria = req.acceptanceCriteria?.length
            ? `\n    Acceptance: ${req.acceptanceCriteria.join('; ')}`
            : '';
          return `  - ${req.name} (${req.semanticId}) [${req.type || 'functional'}]: ${req.descr}${criteria}`;
        }).join('\n')
      : '  (No requirements to derive tests from)';

    const existingTestList = request.existingTests.length > 0
      ? request.existingTests.map(t =>
          `  - ${t.name} (${t.semanticId})${t.verifies ? ` verifies ${t.verifies}` : ''}`
        ).join('\n')
      : '  (No existing tests)';

    return `# Test Derivation: REQ → TEST

## Systems Engineering Principle

You are a Verification Engineer deriving TEST cases from Requirements.

**INCOSE Verification Rule:**
Every requirement must be verifiable. Each REQ needs at least one TEST with:
- Clear test objective
- Expected result/outcome
- verify edge linking TEST to REQ

**Test Coverage Strategy:**
- **Positive tests**: Verify requirement is satisfied under normal conditions
- **Negative tests**: Verify system handles invalid input gracefully
- **Boundary tests**: Verify behavior at limits (min, max, edge values)
- **Edge case tests**: Verify unusual but valid scenarios

## System Context

**System:** ${request.systemId}

### Requirements to Derive Tests From:
${reqList}

### Existing Tests (avoid duplicates):
${existingTestList}

## Current Canvas State

\`\`\`
${request.canvasState}
\`\`\`

## Your Task

1. **Analyze each REQ** for testable conditions
2. **Generate TEST nodes** with clear descriptions
3. **Create verify edges** from REQ to TEST
4. **Ensure coverage**: At minimum 1 positive test per functional REQ

## Output: Pure Format E Diff

Generate ONLY a Format E Diff in <operations> block.

Your response format:
1. Brief analysis explaining test strategy per REQ
2. <operations> block with Format E Diff

### Format E Structure:

\`\`\`
<operations>
<base_snapshot>${request.systemId}</base_snapshot>

## Nodes
+ {TestName}|TEST|{TestName}.TC.{NNN}|{Test description with expected result}

## Edges
+ {ReqID} -ver-> {TestID}  // verify edge
</operations>
\`\`\`

### Test Naming Conventions:

- **Positive**: Test{Feature}Success, Verify{Behavior}Works
- **Negative**: Test{Feature}InvalidInput, Verify{Behavior}RejectsNull
- **Boundary**: Test{Feature}MinValue, Test{Feature}MaxLimit
- **Edge case**: Test{Feature}EmptyList, Test{Feature}ConcurrentAccess

### Example:

For REQ: "System shall validate user email format"

\`\`\`
+ TestEmailValid|TEST|TestEmailValid.TC.001|Verify valid email format (user@domain.com) is accepted. Expected: validation passes
+ TestEmailInvalid|TEST|TestEmailInvalid.TC.002|Verify invalid email (no @ symbol) is rejected. Expected: validation error returned
+ TestEmailEmpty|TEST|TestEmailEmpty.TC.003|Verify empty email string is rejected. Expected: validation error for empty input
+ ValidateEmail.RQ.001 -ver-> TestEmailValid.TC.001
+ ValidateEmail.RQ.001 -ver-> TestEmailInvalid.TC.002
+ ValidateEmail.RQ.001 -ver-> TestEmailEmpty.TC.003
\`\`\`

## Guidelines

1. **1-3 tests per functional REQ** - Cover positive + key negative cases
2. **1-2 tests per NFR** - Performance, security, usability as applicable
3. **Test descriptions include expected result** - "Expected: X" suffix
4. **Unique test names** - Descriptive, PascalCase
5. **No duplicate tests** - Check existing tests before creating
`;
  }

  /**
   * Extract operations from LLM response
   */
  extractOperations(response: string): string | null {
    const match = response.match(/<operations>([\s\S]*?)<\/operations>/);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract analysis text
   */
  extractAnalysisText(response: string): string {
    return response
      .replace(/<operations>[\s\S]*?<\/operations>/g, '')
      .trim();
  }
}

/**
 * Get derivation rule for REQ → TEST
 */
export function getReqToTestDerivationRule(): DerivationRule {
  return {
    sourceType: 'REQ',
    targetTypes: ['TEST'],
    strategy: 'verify',
    promptTemplate: 'req-to-test-verification',
  };
}

// ============================================================================
// FUNC → FLOW Derivation (Phase 2: Logical Architecture Enhancement)
// ============================================================================

/**
 * FUNC to FLOW Derivation Request
 */
export interface FuncToFlowDerivationRequest {
  /** Functions to derive flows for */
  functions: Array<{
    semanticId: string;
    name: string;
    descr: string;
    parentId?: string;
    hasInputFlow?: boolean;
    hasOutputFlow?: boolean;
  }>;

  /** Existing flows (to connect to or avoid duplicates) */
  existingFlows: Array<{
    semanticId: string;
    name: string;
    connectedTo?: string[];
  }>;

  /** Existing schemas (for FLOW→SCHEMA relations) */
  existingSchemas: Array<{
    semanticId: string;
    name: string;
    category: 'data' | 'protocol';
  }>;

  /** Current canvas state (Format E) */
  canvasState: string;

  /** System semantic ID */
  systemId: string;
}

/**
 * FUNC → FLOW Derivation Agent
 *
 * Infers data flows from function descriptions:
 * - Every FUNC needs input and output FLOW (function_io rule)
 * - FLOWs should have SCHEMA relations (3-layer interface model)
 * - Actor interfaces go through FLOW, not direct to FUNC
 */
export class FuncToFlowDerivationAgent {
  /**
   * Build the FUNC → FLOW derivation prompt
   */
  buildFlowDerivationPrompt(request: FuncToFlowDerivationRequest): string {
    const funcList = request.functions.map(f => {
      const ioStatus = [];
      if (!f.hasInputFlow) ioStatus.push('MISSING INPUT');
      if (!f.hasOutputFlow) ioStatus.push('MISSING OUTPUT');
      const status = ioStatus.length ? ` [${ioStatus.join(', ')}]` : ' [OK]';
      return `  - ${f.name} (${f.semanticId})${f.parentId ? ` in ${f.parentId}` : ''}${status}: ${f.descr}`;
    }).join('\n');

    const flowList = request.existingFlows.length > 0
      ? request.existingFlows.map(fl =>
          `  - ${fl.name} (${fl.semanticId})${fl.connectedTo?.length ? ` → ${fl.connectedTo.join(', ')}` : ''}`
        ).join('\n')
      : '  (No existing flows)';

    const schemaList = request.existingSchemas.length > 0
      ? request.existingSchemas.map(s =>
          `  - ${s.name} (${s.semanticId}) [${s.category}]`
        ).join('\n')
      : '  (No existing schemas)';

    return `# Flow Derivation: FUNC → FLOW

## Systems Engineering Principle

You are a System Architect ensuring every function has proper I/O interfaces.

**3-Layer Interface Model:**
| Layer | Element | Purpose |
|-------|---------|---------|
| Layer 1 | FLOW.Descr | Semantic: What is transferred |
| Layer 2 | FLOW→SCHEMA (Data) | Structural: Data format |
| Layer 3 | FLOW→SCHEMA (Protocol) | Technical: How it's transferred |

**Validation Rules:**
- \`function_io\`: Every FUNC must have io input AND output via FLOW
- \`flow_connectivity\`: Every FLOW must have io incoming AND outgoing
- \`flow_data_schema\`: Every FLOW should have relation→SCHEMA

## System Context

**System:** ${request.systemId}

### Functions (check I/O completeness):
${funcList}

### Existing Flows:
${flowList}

### Existing Schemas (for relation edges):
${schemaList}

## Current Canvas State

\`\`\`
${request.canvasState}
\`\`\`

## Your Task

1. **For each FUNC missing I/O**:
   - Derive input FLOW based on function description
   - Derive output FLOW based on function description
   - Add io edges: FLOW -io-> FUNC (input), FUNC -io-> FLOW (output)

2. **Add SCHEMA relations** where applicable:
   - Link FLOWs to existing SCHEMAs if data format matches
   - Suggest new SCHEMA if no match exists

3. **Connect inter-function FLOWs**:
   - If FUNC A output feeds FUNC B input, use single FLOW between them

## Output: Pure Format E Diff

\`\`\`
<operations>
<base_snapshot>${request.systemId}</base_snapshot>

## Nodes
+ {FlowName}|FLOW|{FlowName}.FL.{NNN}|{Semantic description of data transferred}
+ {SchemaName}|SCHEMA|{SchemaName}.SC.{NNN}|{Data structure}|{"fields": [...]}

## Edges
+ {FlowID} -io-> {FuncID}     // Input to function
+ {FuncID} -io-> {FlowID}     // Output from function
+ {FlowID} -rel-> {SchemaID}  // Data format relation
</operations>
\`\`\`

### Flow Naming Conventions:

- **Input flows**: {Source}To{Func}Data, {DataType}Request, Input{DataType}
- **Output flows**: {Func}Result, {DataType}Response, Output{DataType}
- **Inter-function**: {DataType}Flow, {Purpose}Data

### Example:

For FUNC "ValidateOrder" missing I/O:

\`\`\`
+ OrderData|FLOW|OrderData.FL.001|Order details for validation
+ ValidationResult|FLOW|ValidationResult.FL.002|Validation outcome with errors if any
+ OrderData.FL.001 -io-> ValidateOrder.FN.001
+ ValidateOrder.FN.001 -io-> ValidationResult.FL.002
+ OrderData.FL.001 -rel-> OrderSchema.SC.001
\`\`\`

## Guidelines

1. **Descriptive flow names** - Describe the data, not the action
2. **Reuse existing FLOWs** - Don't create duplicates
3. **Link to SCHEMAs** - Prefer existing schemas over new ones
4. **Semantic descriptions** - FLOW.Descr is Layer 1 (what, not how)
`;
  }

  /**
   * Extract operations from LLM response
   */
  extractOperations(response: string): string | null {
    const match = response.match(/<operations>([\s\S]*?)<\/operations>/);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract analysis text
   */
  extractAnalysisText(response: string): string {
    return response
      .replace(/<operations>[\s\S]*?<\/operations>/g, '')
      .trim();
  }
}

/**
 * Get derivation rule for FUNC → FLOW
 */
export function getFuncToFlowDerivationRule(): DerivationRule {
  return {
    sourceType: 'FUNC',
    targetTypes: ['FLOW', 'SCHEMA'],
    strategy: 'decompose',
    promptTemplate: 'func-to-flow-interface',
  };
}

// ============================================================================
// FUNC → MOD Derivation (Phase 3: Physical Architecture)
// ============================================================================

/**
 * FUNC to MOD Derivation Request
 */
export interface FuncToModDerivationRequest {
  /** Functions to allocate */
  functions: Array<{
    semanticId: string;
    name: string;
    descr: string;
    volatility?: 'low' | 'medium' | 'high';
    connectedFuncs?: string[]; // Functions this one communicates with
    allocatedTo?: string; // Existing allocation if any
  }>;

  /** Existing modules */
  existingModules: Array<{
    semanticId: string;
    name: string;
    descr: string;
    allocatedFuncs?: string[];
  }>;

  /** Current canvas state (Format E) */
  canvasState: string;

  /** System semantic ID */
  systemId: string;
}

/**
 * FUNC → MOD Derivation Agent
 *
 * Suggests module allocation based on:
 * - Functional cohesion (related functions together)
 * - Coupling minimization (fewer cross-module connections)
 * - Volatility isolation (high-volatility isolated)
 * - Miller's Law (5-9 modules)
 */
export class FuncToModDerivationAgent {
  /**
   * Build the FUNC → MOD derivation prompt
   */
  buildAllocationPrompt(request: FuncToModDerivationRequest): string {
    const funcList = request.functions.map(f => {
      const vol = f.volatility ? ` [volatility: ${f.volatility}]` : '';
      const alloc = f.allocatedTo ? ` → ${f.allocatedTo}` : ' [UNALLOCATED]';
      const conn = f.connectedFuncs?.length ? ` connects: ${f.connectedFuncs.join(', ')}` : '';
      return `  - ${f.name} (${f.semanticId})${vol}${alloc}${conn}: ${f.descr}`;
    }).join('\n');

    const modList = request.existingModules.length > 0
      ? request.existingModules.map(m => {
          const funcs = m.allocatedFuncs?.length ? ` contains: ${m.allocatedFuncs.join(', ')}` : '';
          return `  - ${m.name} (${m.semanticId})${funcs}: ${m.descr}`;
        }).join('\n')
      : '  (No existing modules)';

    const unallocatedCount = request.functions.filter(f => !f.allocatedTo).length;
    const highVolCount = request.functions.filter(f => f.volatility === 'high').length;

    return `# Allocation Derivation: FUNC → MOD

## Systems Engineering Principle

You are a System Architect allocating functions to physical modules.

**Allocation Principles:**
1. **Cohesion**: Group related functions (same domain, shared data)
2. **Coupling**: Minimize cross-module communication
3. **Volatility Isolation**: High-volatility functions in separate modules
4. **Miller's Law**: 5-9 top-level modules per system

**Validation Rules:**
- \`function_allocation\`: Every FUNC must be allocated to exactly one MOD
- \`millers_law_mod\`: 5-9 top-level MOD nodes under SYS
- \`volatile_func_isolation\`: High-volatility FUNC should have ≤2 dependents

## System Context

**System:** ${request.systemId}
**Unallocated functions:** ${unallocatedCount}
**High-volatility functions:** ${highVolCount}

### Functions to Allocate:
${funcList}

### Existing Modules:
${modList}

## Current Canvas State

\`\`\`
${request.canvasState}
\`\`\`

## Your Task

1. **Group unallocated FUNCs** by cohesion:
   - Same domain (e.g., all Order-related functions)
   - Shared data dependencies (communicate frequently)
   - Similar volatility level

2. **Create or select MOD** for each group:
   - Reuse existing MOD if function fits
   - Create new MOD if no suitable match

3. **Isolate high-volatility** functions:
   - High-volatility FUNCs should be in adapter/facade modules
   - Keep core stable logic separate from integrations

4. **Verify Miller's Law**:
   - Target 5-9 top-level modules
   - Use MOD -cp-> MOD for sub-modules if needed

## Output: Pure Format E Diff

\`\`\`
<operations>
<base_snapshot>${request.systemId}</base_snapshot>

## Nodes
+ {ModName}|MOD|{ModName}.MD.{NNN}|{Module responsibility description}

## Edges
+ ${request.systemId} -cp-> {ModID}    // SYS composes MOD
+ {ModID} -all-> {FuncID}              // MOD allocates FUNC
+ {ParentModID} -cp-> {ChildModID}     // MOD hierarchy
</operations>
\`\`\`

### Module Naming Conventions:

- **Domain modules**: {Domain}Module (OrderModule, UserModule)
- **Integration modules**: {External}Adapter (PaymentAdapter, EmailAdapter)
- **Utility modules**: {Purpose}Services (LoggingServices, CacheServices)

### Example:

For unallocated functions ProcessOrder, ValidateOrder, CalculateTotal:

\`\`\`
+ OrderModule|MOD|OrderModule.MD.001|Handles order processing and validation
+ GraphEngine.SY.001 -cp-> OrderModule.MD.001
+ OrderModule.MD.001 -all-> ProcessOrder.FN.001
+ OrderModule.MD.001 -all-> ValidateOrder.FN.002
+ OrderModule.MD.001 -all-> CalculateTotal.FN.003
\`\`\`

For high-volatility LLMIntegration function:

\`\`\`
+ LLMAdapter|MOD|LLMAdapter.MD.002|Isolates LLM API changes from core logic
+ GraphEngine.SY.001 -cp-> LLMAdapter.MD.002
+ LLMAdapter.MD.002 -all-> LLMIntegration.FN.010
\`\`\`

## Guidelines

1. **Cohesion over convenience** - Related functions belong together
2. **Isolate volatility** - External APIs, AI models in adapter modules
3. **Descriptive module names** - Clear responsibility in name
4. **Flat when possible** - Avoid deep MOD hierarchies unless necessary
5. **No orphan modules** - Every MOD should have allocated FUNCs
`;
  }

  /**
   * Extract operations from LLM response
   */
  extractOperations(response: string): string | null {
    const match = response.match(/<operations>([\s\S]*?)<\/operations>/);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract analysis text
   */
  extractAnalysisText(response: string): string {
    return response
      .replace(/<operations>[\s\S]*?<\/operations>/g, '')
      .trim();
  }
}

/**
 * Get derivation rule for FUNC → MOD
 */
export function getFuncToModDerivationRule(): DerivationRule {
  return {
    sourceType: 'FUNC',
    targetTypes: ['MOD'],
    strategy: 'allocate',
    promptTemplate: 'func-to-mod-allocation',
  };
}

// ============================================================================
// Unified Derivation Controller
// ============================================================================

/**
 * Derivation type enum
 */
export type DerivationType = 'uc-to-func' | 'req-to-test' | 'func-to-flow' | 'func-to-mod';

/**
 * Get all derivation rules
 */
export function getAllDerivationRules(): DerivationRule[] {
  return [
    getUCtoFuncDerivationRule(),
    getReqToTestDerivationRule(),
    getFuncToFlowDerivationRule(),
    getFuncToModDerivationRule(),
  ];
}

/**
 * Get derivation rule by type
 */
export function getDerivationRule(type: DerivationType): DerivationRule {
  switch (type) {
    case 'uc-to-func':
      return getUCtoFuncDerivationRule();
    case 'req-to-test':
      return getReqToTestDerivationRule();
    case 'func-to-flow':
      return getFuncToFlowDerivationRule();
    case 'func-to-mod':
      return getFuncToModDerivationRule();
  }
}
