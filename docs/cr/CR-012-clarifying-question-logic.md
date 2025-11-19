# CR-012: Implement Clarifying Question Logic

**Status:** Planned
**Priority:** MEDIUM
**Target Phase:** Phase 3
**Created:** 2025-11-19
**Author:** andreas@siglochconsulting

## Problem

LLM currently proceeds with ambiguous requirements without asking for clarification, leading to incorrect assumptions and rework. According to [implan.md:241-244](../implan.md#L241-L244), the system should:

- Detect when requirements are ambiguous or incomplete
- Ask clarifying questions instead of making assumptions
- Store clarifications in conversation context
- Use clarifications to refine entity creation

**Current Status:** NOT IMPLEMENTED (marked as Phase 3 remaining task)

**Impact:** Without clarifying question logic, the LLM:
- Makes incorrect assumptions about user intent
- Creates entities that don't match requirements
- Forces users to manually correct mistakes
- Reduces trust in AI assistance

## Requirements

**From implan.md Phase 3 remaining tasks:**
1. Detect ambiguous/incomplete requirements
2. Ask clarifying questions when needed
3. Store clarifications in context
4. Use clarifications for better entity derivation

**Ambiguity Detection Criteria:**
- Vague quantifiers ("many", "several", "fast")
- Missing constraints (performance, capacity, interfaces)
- Unclear relationships ("connected to", "related to")
- Undefined terms (acronyms, domain-specific vocabulary)
- Conflicting statements

## Proposed Solution

### 1. Ambiguity Detection Engine

```typescript
interface AmbiguityDetection {
  type: AmbiguityType;
  text: string;
  reason: string;
  suggestedQuestions: string[];
}

enum AmbiguityType {
  VAGUE_QUANTIFIER,     // "many users", "fast response"
  MISSING_CONSTRAINT,   // no performance/capacity specified
  UNCLEAR_RELATIONSHIP, // "A connects to B" (how? interface?)
  UNDEFINED_TERM,       // acronyms, jargon without definition
  CONFLICTING_STATEMENT,// contradicts previous requirements
  INCOMPLETE_SPEC       // missing required fields
}
```

**Detection Patterns:**
```typescript
const AMBIGUITY_PATTERNS = {
  VAGUE_QUANTIFIER: [
    /\b(many|several|few|some|various)\b/i,
    /\b(fast|slow|quick|large|small)\b/i,
    /\b(high|low|good|bad|better)\b/i
  ],
  MISSING_CONSTRAINT: [
    /shall (process|handle|support)/i,  // without specifying limits
    /must be (available|reliable)/i     // without specifying metrics
  ],
  UNDEFINED_TERM: [
    /\b[A-Z]{2,}\b/,  // Acronyms
    /\b\w+\b(?=.*\?)/  // Terms followed by questions
  ]
};
```

### 2. Question Generation Logic

```typescript
interface ClarifyingQuestion {
  id: string;
  ambiguityType: AmbiguityType;
  question: string;
  context: string;
  suggestedAnswers?: string[];
  required: boolean;
}
```

**Question Templates:**

**Vague Quantifiers:**
```
"You mentioned '{vague_term}'. Can you be more specific?
- How many exactly? (e.g., 10, 100, 1000)
- What range? (e.g., 50-200)
- What percentage? (e.g., 95% of cases)"
```

**Missing Constraints:**
```
"I notice the requirement lacks specific constraints:
- Performance: What response time is acceptable? (e.g., <500ms)
- Capacity: How many concurrent users? (e.g., 100 simultaneous)
- Reliability: What uptime is required? (e.g., 99.9%)"
```

**Unclear Relationships:**
```
"You mentioned '{entity_a}' connects to '{entity_b}'. Could you clarify:
- What type of connection? (data flow, control flow, physical)
- What interface/protocol? (REST API, message queue, function call)
- What data is exchanged? (payload structure)"
```

**Undefined Terms:**
```
"I see the acronym '{acronym}'. To ensure accuracy:
- What does {acronym} stand for?
- Is there a standard definition I should use?
- Are there specific constraints related to {acronym}?"
```

### 3. Clarification Storage

```typescript
interface Clarification {
  questionId: string;
  question: string;
  answer: string;
  timestamp: number;
  appliedTo: string[];  // entity IDs affected
}

interface ClarificationContext {
  sessionId: string;
  clarifications: Clarification[];
  terminologyGlossary: Map<string, string>;
}
```

**Storage Strategy:**
- Store in chat session context
- Persist in Neo4j for cross-session use
- Build terminology glossary over time
- Reference in LLM prompts for consistency

### 4. Decision Logic: Ask vs Proceed

```typescript
interface ClarificationDecision {
  shouldAskQuestions: boolean;
  questions: ClarifyingQuestion[];
  canProceedWithAssumptions: boolean;
  assumptions: string[];
}
```

**Decision Rules:**
- CRITICAL ambiguity (undefined interface, missing capacity) → MUST ask
- HIGH ambiguity (vague quantifiers) → SHOULD ask
- LOW ambiguity (minor details) → Proceed with assumptions, document
- If >3 questions → Batch and prioritize

## Implementation Plan

### Phase 1: Ambiguity Detection (3-4 hours)
1. Create `src/llm-engine/clarification-engine.ts`
2. Implement ambiguity detection patterns
3. Add classification logic (type, severity)
4. Test with common ambiguous phrases

### Phase 2: Question Generation (3-4 hours)
1. Create question template library
2. Implement template selection logic
3. Add suggested answer generation
4. Prioritize questions by severity

### Phase 3: Clarification Storage (2-3 hours)
1. Define clarification data structures
2. Integrate with Neo4j for persistence
3. Build terminology glossary
4. Implement context retrieval

### Phase 4: LLM Integration (2-3 hours)
1. Inject clarification logic into LLMEngine
2. Add clarification mode to chat interface
3. Implement batch question presentation
4. Handle user responses and store clarifications

### Phase 5: Context Usage (2-3 hours)
1. Reference clarifications in LLM prompts
2. Use glossary for consistent terminology
3. Apply clarifications to entity derivation
4. Document assumptions when proceeding without answers

### Phase 6: Testing & Refinement (2-3 hours)
1. Write unit tests for ambiguity detection
2. Test question generation with real scenarios
3. Validate clarification storage/retrieval
4. Refine detection patterns based on feedback
5. Document clarification workflow

## Acceptance Criteria

- [ ] Ambiguity detection identifies vague/incomplete requirements
- [ ] Clarifying questions generated for detected ambiguities
- [ ] Questions prioritized by severity (critical → low)
- [ ] User answers stored in session context
- [ ] Clarifications persist in Neo4j for reuse
- [ ] Terminology glossary builds over time
- [ ] LLM uses clarifications for entity derivation
- [ ] Assumptions documented when proceeding without answers
- [ ] Unit tests cover detection logic (70% coverage)
- [ ] Integration tests validate question/answer workflow

## Dependencies

- LLM Engine must be functional (already implemented)
- Neo4j client for clarification persistence (already implemented)
- Chat interface command handling (already implemented)
- Auto-derivation logic (CR-005) - benefits from clarifications

## Estimated Effort

- Ambiguity Detection: 3-4 hours
- Question Generation: 3-4 hours
- Clarification Storage: 2-3 hours
- LLM Integration: 2-3 hours
- Context Usage: 2-3 hours
- Testing & Refinement: 2-3 hours
- **Total: 14-20 hours (2-3 days)**

## Benefits

**Quality Improvement:**
- Fewer incorrect assumptions
- Better requirement understanding
- More accurate entity creation

**User Experience:**
- Proactive guidance
- Collaborative refinement
- Trust in AI assistance

**Efficiency:**
- Reduce rework from misunderstandings
- Build reusable terminology glossary
- Improve LLM prompt effectiveness over time

## References

- [implan.md:241-244](../implan.md#L241-L244) - Phase 3 Clarifying Questions section
- requirements.md FR-8.1 - LLM guidance requirements
- CR-005 - Auto-Derivation (benefits from clarifications)
- CR-011 - SE Methodology (complements guidance)

## Notes

- Start with high-severity ambiguities (undefined terms, missing constraints)
- Avoid asking too many questions (max 3 per interaction)
- Consider confidence scoring (0-100%) for proceeding without clarification
- Integrate with SE methodology prompts (CR-011) for comprehensive guidance
- Build terminology glossary incrementally (learn from user's domain)
