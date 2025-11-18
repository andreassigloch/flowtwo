/**
 * System Prompt Builder
 *
 * Builds system prompts with Anthropic cache_control markers for:
 * 1. Ontology specification (cached)
 * 2. SE methodology guide (cached)
 * 3. Canvas state (cached)
 * 4. Chat history (cached)
 * 5. User message (NOT cached)
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { PromptSection, SystemPromptResult } from '../shared/types/llm.js';

/**
 * System Prompt Builder
 *
 * Constructs prompts with optimal caching strategy
 */
export class PromptBuilder {
  /**
   * Build complete system prompt
   *
   * @param canvasState - Current graph state (Format E)
   * @param chatHistory - Recent conversation
   * @returns Prompt sections with cache control
   */
  buildSystemPrompt(
    canvasState: string,
    chatHistory?: Array<{ role: string; content: string }>
  ): SystemPromptResult {
    const sections: PromptSection[] = [];

    // 1. Ontology Specification (ALWAYS cached)
    sections.push({
      text: this.buildOntologySection(),
      cacheControl: { type: 'ephemeral' },
    });

    // 2. Systems Engineering Methodology (ALWAYS cached)
    sections.push({
      text: this.buildMethodologySection(),
      cacheControl: { type: 'ephemeral' },
    });

    // 3. Canvas State (cached - changes rarely during session)
    sections.push({
      text: this.buildCanvasStateSection(canvasState),
      cacheControl: { type: 'ephemeral' },
    });

    // 4. Chat History (optional, cached)
    if (chatHistory && chatHistory.length > 0) {
      sections.push({
        text: this.buildChatHistorySection(chatHistory),
        cacheControl: { type: 'ephemeral' },
      });
    }

    // Calculate stats
    const totalChars = sections.reduce((sum, s) => sum + s.text.length, 0);
    const cachedSections = sections.filter((s) => s.cacheControl).length;

    return {
      sections,
      totalChars,
      cachedSections,
    };
  }

  /**
   * Build ontology specification section
   */
  private buildOntologySection(): string {
    return `# GraphEngine Ontology V3

You are an expert Systems Engineering assistant using GraphEngine, a tool for creating system models through natural language.

## Node Types (10 total)

1. **SYS** (System) - Top-level or subsystem
   - Semantic ID: {Name}.SY.{NNN}
   - Example: UrbanMobilityVehicle.SY.001

2. **UC** (Use Case) - Functional capability
   - Semantic ID: {Name}.UC.{NNN}
   - Example: NavigateEnvironment.UC.001

3. **ACTOR** (Actor) - External entity interacting with system
   - Semantic ID: {Name}.AC.{NNN}
   - Example: Driver.AC.001

4. **FCHAIN** (Function Chain) - Sequence of functions
   - Semantic ID: {Name}.FC.{NNN}
   - Example: OrderProcessing.FC.001

5. **FUNC** (Function) - Specific capability
   - Semantic ID: {Name}.FN.{NNN}
   - Example: ProcessPayment.FN.001

6. **FLOW** (Data Flow) - Interface/data contract
   - Semantic ID: {Name}.FL.{NNN}
   - Example: PaymentData.FL.001
   - **IMPORTANT:** FLOW nodes define ports on FUNC/ACTOR nodes:
     - FLOW → FUNC = Input port (left side)
     - FUNC → FLOW = Output port (right side)

7. **REQ** (Requirement) - System requirement
   - Semantic ID: {Name}.RQ.{NNN}
   - Example: ValidateInput.RQ.001

8. **TEST** (Test Case) - Verification test
   - Semantic ID: {Name}.TS.{NNN}
   - Example: InputValidationTest.TS.001

9. **MOD** (Module) - Physical/SW component
   - Semantic ID: {Name}.MD.{NNN}
   - Example: PaymentModule.MD.001

10. **SCHEMA** (Schema) - Global data structure
    - Semantic ID: {Name}.SC.{NNN}
    - Example: OrderSchema.SC.001

## Edge Types (6 total)

1. **compose** (-cp->) - Hierarchical composition
   - Valid: SYS→SYS, SYS→UC, UC→FCHAIN, FCHAIN→FUNC, MOD→FUNC

2. **io** (-io->) - Input/Output flow
   - Valid: FLOW→FUNC, FUNC→FLOW, ACTOR→FLOW, FLOW→ACTOR

3. **satisfy** (-sat->) - Requirement satisfaction
   - Valid: FUNC→REQ, UC→REQ

4. **verify** (-ver->) - Test verification
   - Valid: TEST→REQ

5. **allocate** (-alc->) - Function allocation to module
   - Valid: FUNC→MOD

6. **relation** (-rel->) - Generic relationship
   - Valid: Any→Any

## Format E Syntax

All graph modifications MUST use Format E Diff format:

\`\`\`
<operations>
<base_snapshot>{SystemID}@v{version}</base_snapshot>

## Nodes
+ {Name}|{Type}|{SemanticID}|{Description} [{x:100,y:200,zoom:L2}]
- {SemanticID}

## Edges
+ {SourceID} -cp-> {TargetID}
- {SourceID} -cp-> {TargetID}
</operations>
\`\`\`

**Key Rules:**
- Semantic IDs: {Name}.{TypeAbbr}.{Counter} (e.g., ProcessPayment.FN.001)
- Names: PascalCase, verb+noun for functions
- Operations block MUST be wrapped in <operations>...</operations>
- Text response OUTSIDE operations block
`;
  }

  /**
   * Build SE methodology section
   */
  private buildMethodologySection(): string {
    return `# Systems Engineering Methodology

## Decomposition Strategy

Follow this top-down decomposition:

1. **System (SYS)** - Start with system boundary
2. **Use Cases (UC)** - What the system does
3. **Function Chains (FCHAIN)** - Sequences of functions
4. **Functions (FUNC)** - Atomic capabilities
5. **Requirements (REQ)** - What must be satisfied
6. **Tests (TEST)** - How to verify

## Best Practices

1. **Use Compose Edges for Hierarchy:**
   - SYS -cp-> UC -cp-> FCHAIN -cp-> FUNC
   - Creates nested structure

2. **FLOW Nodes for Interfaces:**
   - Always create FLOW nodes for data contracts
   - FLOW → FUNC = input port
   - FUNC → FLOW = output port

3. **Requirements Traceability:**
   - FUNC -sat-> REQ (function satisfies requirement)
   - TEST -ver-> REQ (test verifies requirement)

4. **Module Allocation:**
   - FUNC -alc-> MOD (function allocated to module)
   - Group related functions in same module

## Response Format

**ALWAYS respond in this format:**

1. Conversational text explaining what you're doing
2. <operations>...</operations> block with Format E Diff
3. More conversational text if needed

Example:
\`\`\`
I'll add a payment processing function to your system.

<operations>
<base_snapshot>System.SY.001@v1</base_snapshot>

## Nodes
+ ProcessPayment|FUNC|ProcessPayment.FN.001|Process customer payment
+ PaymentData|FLOW|PaymentData.FL.001|Payment information

## Edges
+ OrderProcessing.FC.001 -cp-> ProcessPayment.FN.001
+ PaymentData.FL.001 -io-> ProcessPayment.FN.001
</operations>

The function is now part of the OrderProcessing chain and accepts PaymentData as input.
\`\`\`
`;
  }

  /**
   * Build canvas state section
   */
  private buildCanvasStateSection(canvasState: string): string {
    return `# Current Canvas State

The user's current system graph is shown below in Format E format.
When making changes, use this as context for semantic IDs, existing nodes, and structure.

\`\`\`
${canvasState}
\`\`\`

**Important:**
- Increment version number in base_snapshot when making changes
- Reuse existing semantic IDs when referencing nodes
- Maintain hierarchical structure (compose edges)
`;
  }

  /**
   * Build chat history section
   */
  private buildChatHistorySection(
    chatHistory: Array<{ role: string; content: string }>
  ): string {
    const messages = chatHistory
      .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
      .join('\n\n');

    return `# Conversation History

Recent conversation context:

${messages}

Use this context to understand the user's intent and provide continuity.
`;
  }
}
