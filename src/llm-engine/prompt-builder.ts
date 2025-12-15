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
 * CR-054: Now generates "CRITICAL ERRORS TO AVOID" section from ontology-rules.json
 *
 * @author andreas@siglochconsulting
 * @version 2.1.0
 */

import { PromptSection, SystemPromptResult } from '../shared/types/llm.js';
import { isOpenAIProvider } from './engine-factory.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CriticalError {
  rule: string;
  title: string;
  wrong: string;
  right: string;
  fix: string;
}

interface OntologyRulesLLMContext {
  criticalErrors?: CriticalError[];
  preSubmissionChecklist?: string[];
}

interface OntologyRules {
  llmContext?: OntologyRulesLLMContext;
}

/**
 * Load ontology rules from JSON file
 */
function loadOntologyRules(): OntologyRules | null {
  try {
    const rulesPath = join(__dirname, '../../settings/ontology-rules.json');
    const content = readFileSync(rulesPath, 'utf-8');
    return JSON.parse(content) as OntologyRules;
  } catch {
    // Fail silently - rules are optional enhancement
    return null;
  }
}

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

1. **compose** (-cp->) - Hierarchical composition (NESTING)
   - Valid: SYS→SYS, SYS→UC, SYS→FUNC, UC→UC, UC→FCHAIN, FCHAIN→ACTOR, FCHAIN→FUNC, FCHAIN→FLOW, FUNC→FUNC, MOD→MOD
   - **FCHAIN composes:** ACTORs (boundary), FUNCs (steps), FLOWs (data)
   - **DEFAULT to FUNC→FUNC** for logical decomposition
   - SYS→SYS ONLY when: purchased/third-party, different team, black-box integration

2. **io** (-io->) - Input/Output flow (UNIDIRECTIONAL DATA FLOW)
   - Valid: FLOW→FUNC, FUNC→FLOW, ACTOR→FLOW, FLOW→ACTOR
   - **CRITICAL io-flow-io RULES:**
     - Data flows are UNIDIRECTIONAL chains: Source → FLOW → Target
     - NEVER create bidirectional io edges (A→FLOW→B AND B→FLOW→A is WRONG)
     - NEVER create circular io edges (FLOW→FUNC→same FLOW is WRONG)
     - Pattern: FUNC writes → FLOW stores → next FUNC reads
     - Example chain: FuncA -io-> DataFlow -io-> FuncB (FuncA produces, FuncB consumes)
     - When fixing io edges: DELETE existing wrong edges FIRST, then ADD correct ones
   - **MANDATORY: Before creating or modifying io edges, use graph_query tool:**
     - Use \`graph_query(queryType: "io_chain", filters: {fchainId: "..."})\` to analyze existing io patterns
     - Use \`graph_query(queryType: "check_edge", filters: {sourceId: "...", targetId: "...", edgeType: "io"})\` to verify edge doesn't exist
     - The tool will identify bidirectional and circular issues before you make changes

3. **satisfy** (-sat->) - Requirement satisfaction
   - Valid: FUNC→REQ, UC→REQ

4. **verify** (-ver->) - Test verification
   - Valid: TEST→REQ

5. **allocate** (-alc->) - Function allocation to module
   - Valid: FUNC→MOD

6. **relation** (-rel->) - Generic relationship
   - Valid: Any→Any

## Edge Categories
- **Nesting (hierarchy):** compose, satisfy, allocate → parent-child structure
- **Cross-reference:** io, verify, relation → no hierarchy, just links

## Format E Syntax (CR-053 Compact)

All graph modifications MUST use Format E Diff format with COMPACT node syntax:

\`\`\`
<operations>
<base_snapshot>{SystemID}</base_snapshot>

## Nodes
+ {SemanticID}|{Description}
- {SemanticID}

## Edges
+ {SourceID} -cp-> {TargetID}
- {SourceID} -cp-> {TargetID}
</operations>
\`\`\`

**CRITICAL: Node format is SemanticID|Description (2 fields, NOT 4)**
- Name and Type are DERIVED from the SemanticID automatically
- SemanticID format: {Name}.{TypeAbbr}.{Counter}
- Example: \`+ ProcessPayment.FN.001|Process customer payment\`
  - SemanticID: ProcessPayment.FN.001
  - Description: Process customer payment
  - Name (derived): ProcessPayment
  - Type (derived): FUNC

**Key Rules:**
- Names: PascalCase, verb+noun for functions
- Operations block MUST be wrapped in <operations>...</operations>
- Text response OUTSIDE operations block

## Modifying Nodes

**Three operations available:**
- \`+\` Add new node
- \`-\` Remove node
- \`~\` Modify node (update properties, keep edges)

**To change a node's description:** Use the \`~\` prefix
\`\`\`
## Nodes
~ ProcessPayment.FN.001|Updated description text
\`\`\`
This updates ONLY the description. All existing edges remain intact.

**To rename a node (change semanticId):** Delete + Add + Re-connect edges
\`\`\`
## Nodes
- OldName.FN.001
+ NewName.FN.001|Same description

## Edges
- ParentSystem.SYS.001 -cp-> OldName.FN.001
+ ParentSystem.SYS.001 -cp-> NewName.FN.001
\`\`\`
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

## Best Practices

1. **Use Compose Edges for Hierarchy:**
   - SYS -cp-> FUNC (top-level functions)
   - FUNC -cp-> FUNC (nested functions for internal decomposition)
   - SYS -cp-> UC -cp-> FCHAIN -cp-> FUNC (use case driven)
   - Creates nested structure

2. **FCHAIN Structure:**
   - FCHAIN -cp-> ACTOR (boundary actors)
   - FCHAIN -cp-> FUNC (processing steps)
   - FCHAIN -cp-> FLOW (data between steps)
   - **Pattern:** Actor→FLOW→Func1→FLOW→Func2→...→FLOW→Actor

3. **Requirements Traceability:**
   - FUNC -sat-> REQ (function satisfies requirement)
   - TEST -ver-> REQ (test verifies requirement)

4. **Module Allocation:**
   - FUNC -alc-> MOD (function allocated to module)
   - Group related functions in same module
${this.getCriticalErrorsSection()}${this.getPreSubmissionChecklist()}${this.getOpenAIProviderWarning()}`;
  }

  /**
   * Generate CRITICAL ERRORS TO AVOID section from ontology-rules.json (CR-054)
   */
  private getCriticalErrorsSection(): string {
    const rules = loadOntologyRules();
    const criticalErrors = rules?.llmContext?.criticalErrors;

    if (!criticalErrors || criticalErrors.length === 0) {
      return '';
    }

    const errorLines = criticalErrors.map((err, idx) => {
      return `${idx + 1}. **${err.title}**
   - Wrong: ${err.wrong}
   - Right: ${err.right}
   - Fix: ${err.fix}`;
    });

    return `

## CRITICAL ERRORS TO AVOID

These errors will cause your output to be REJECTED. Check BEFORE submitting:

${errorLines.join('\n\n')}
`;
  }

  /**
   * Generate Pre-Submission Checklist from ontology-rules.json (CR-054)
   */
  private getPreSubmissionChecklist(): string {
    const rules = loadOntologyRules();
    const checklist = rules?.llmContext?.preSubmissionChecklist;

    if (!checklist || checklist.length === 0) {
      return '';
    }

    const checklistLines = checklist.map((item, idx) => `${idx + 1}. ${item}`);

    return `

## Pre-Submission Validation

Before returning your response, VERIFY:
${checklistLines.join('\n')}

Include validation confirmation in your response.
`;
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
+ Node1.FN.001|Description
</operations>
Now let's add more:
<operations>
+ Node2.FN.002|Another description
</operations>
\`\`\`

**CORRECT (single block):**
\`\`\`
<operations>
## Nodes
+ Node1.FN.001|Description
+ Node2.FN.002|Another description
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
