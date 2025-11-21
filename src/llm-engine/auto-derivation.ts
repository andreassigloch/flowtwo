/**
 * Auto-Derivation Engine
 *
 * Implements UC → FUNC derivation following SE principles:
 * - Analyzes ALL Use Cases to derive TOP-Level logical architecture
 * - Functions must be observable and verifiable at interface boundaries
 * - Existing FUNCs are checked for SE compliance and optimized/decomposed if needed
 * - Output is pure Format E Diff (no custom formats)
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
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
    description: string;
  }>;

  /** All Actors in the system */
  actors: Array<{
    semanticId: string;
    name: string;
    description: string;
  }>;

  /** Existing Functions (for SE compliance check) */
  existingFunctions: Array<{
    semanticId: string;
    name: string;
    description: string;
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
      ? request.useCases.map(uc => `  - ${uc.name} (${uc.semanticId}): ${uc.description}`).join('\n')
      : '  (No Use Cases defined yet)';

    const actorList = request.actors.length > 0
      ? request.actors.map(a => `  - ${a.name} (${a.semanticId}): ${a.description}`).join('\n')
      : '  (No Actors defined)';

    const existingFuncList = request.existingFunctions.length > 0
      ? request.existingFunctions.map(f =>
          `  - ${f.name} (${f.semanticId})${f.parentId ? ` in ${f.parentId}` : ''}: ${f.description}`
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
