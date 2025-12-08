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
import { isOpenAIProvider } from './engine-factory.js';

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

1. **SYS** (System) - Top-level system boundary ONLY
   - Semantic ID: {Name}.SY.{NNN}
   - Example: UrbanMobilityVehicle.SY.001
   - **IMPORTANT:** Use SYS only for the top-level system. For logical decomposition, use FUNC nodes (not nested SYS).

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
   - Valid: SYS→SYS, SYS→UC, SYS→FUNC, UC→FCHAIN, FCHAIN→FUNC, FUNC→FUNC, MOD→FUNC
   - **DEFAULT to FUNC→FUNC** for logical decomposition
   - SYS→SYS ONLY when: purchased/third-party, different team, black-box integration

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
<base_snapshot>{SystemID}</base_snapshot>

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

1. **System (SYS)** - Start with ONE top-level system boundary
2. **Use Cases (UC)** - What the system does
3. **Function Chains (FCHAIN)** - Sequences of functions
4. **Functions (FUNC)** - System capabilities (5-9 top-level per Miller's Law)
5. **Requirements (REQ)** - What must be satisfied
6. **Tests (TEST)** - How to verify

**CRITICAL - System Decomposition Rules:**

**Grundprinzip:** Ein System als Wurzelknoten – alles darunter sind Funktionen, Module oder Actors.

**Strukturhierarchie:**
- Funktionale Sicht: System → Function → Function (nested)
- Physische Sicht: System → Module → Module
- Wirkkette: Actor → Function(s) → Actor

**Logical Architecture = FUNC nodes by DEFAULT:**
- When asked to create a "logical architecture", create **FUNC** nodes
- Use FUNC for: Detection, Tracking, Processing, Control, etc.
- Use FLOW for interfaces between FUNCs
- Top-level FUNCs should be 5-9 per Miller's Law (cognitive limit)
- **Default to FUNC→FUNC** for internal decomposition

**When to use SYS→SYS (Subsystem) - ALL must apply:**
1. Eigenständig spezifizierbar/testbar (independently specifiable)
2. Anderer Lieferant/Team (different supplier/team)
3. Black-box: keine Gestaltungshoheit über Interna (no control over internals)
4. Schnittstelle einfacher als die Interna (interface simpler than internals)

**Nested Functions vs Subsystem Decision:**
| Situation | Use | Type |
|-----------|-----|------|
| You specify the internals | Nested Functions | FUNC→FUNC |
| You define internal data flows | Nested Functions | FUNC→FUNC |
| Purchased/third-party, no internal control | Subsystem | SYS→SYS |
| Different team/lifecycle, black-box | Subsystem | SYS→SYS |

**Faustregel:** Default FUNC. Subsystem (SYS→SYS) nur bei expliziter Anforderung ODER wenn alle 4 Kriterien erfüllt sind.

## Best Practices

1. **Use Compose Edges for Hierarchy:**
   - SYS -cp-> FUNC (top-level functions)
   - FUNC -cp-> FUNC (nested functions for internal decomposition)
   - SYS -cp-> UC -cp-> FCHAIN -cp-> FUNC (use case driven)
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
<base_snapshot>System.SY.001</base_snapshot>

## Nodes
+ ProcessPayment|FUNC|ProcessPayment.FN.001|Process customer payment
+ PaymentData|FLOW|PaymentData.FL.001|Payment information

## Edges
+ OrderProcessing.FC.001 -cp-> ProcessPayment.FN.001
+ PaymentData.FL.001 -io-> ProcessPayment.FN.001
</operations>

The function is now part of the OrderProcessing chain and accepts PaymentData as input.
\`\`\`
${this.getOpenAIProviderWarning()}`;
  }

  /**
   * Get additional warning for OpenAI-compatible providers (CR-034)
   * These models need stricter format instructions
   */
  private getOpenAIProviderWarning(): string {
    if (!isOpenAIProvider()) {
      return '';
    }
    return `
## CRITICAL FORMAT RULES

**You MUST follow these rules EXACTLY:**

1. **ONE operations block per response** - Never split into multiple blocks
2. **Always close tags** - Every \`<operations>\` MUST have \`</operations>\`
3. **All operations in ONE block** - Combine all nodes and edges into a single block
4. **Complete the block before continuing** - Never leave operations unclosed

**WRONG (multiple blocks):**
\`\`\`
<operations>
+ Node1|TYPE|ID1|Desc
</operations>
Now let's add more:
<operations>
+ Node2|TYPE|ID2|Desc
</operations>
\`\`\`

**CORRECT (single block):**
\`\`\`
<operations>
## Nodes
+ Node1|TYPE|ID1|Desc
+ Node2|TYPE|ID2|Desc
</operations>
\`\`\`

**NEVER start a new \`<operations>\` block if one is already open!**
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
- Reuse existing semantic IDs when referencing nodes
- Maintain hierarchical structure (compose edges)
- Only add/modify what the user requests
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
