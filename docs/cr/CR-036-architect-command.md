# CR-036: /architect Command - Top-Level Architecture Design

**Type:** Feature
**Status:** Planned
**Priority:** HIGH
**Target Phase:** Phase 2 (Logical Architecture)
**Created:** 2025-12-08
**Author:** andreas@siglochconsulting

## Problem / Use Case

After completing Phase 1 (requirements capture with SYS, UC, REQ nodes), there is no command to design the **top-level logical and physical architecture**. The current `/derive` command creates FUNCs attached to FCHAINs (implementation-level), not the 5-9 top-level FUNCs and MODs required by the ontology.

**Current Gap:**
- `/derive` creates FUNCs under FCHAIN (activity diagram steps)
- No command creates top-level FUNCs under SYS (architecture blocks)
- No command creates MODs under SYS (module structure)
- `/optimize` fails because no MODs exist for cohesion/coupling analysis

**Result:** Optimizer shows 0% cohesion, cannot generate variants, architecture quality cannot be measured.

## Requirements

### Functional Requirements

1. **FR-1**: Command `/architect` shall analyze all UCs and REQs from Phase 1
2. **FR-2**: Command shall create 5-9 top-level FUNC nodes under SYS
3. **FR-3**: Command shall create 5-9 top-level MOD nodes under SYS
4. **FR-4**: Command shall create `FUNC -satisfy-> REQ` edges for traceability
5. **FR-5**: Command shall create `MOD -allocate-> FUNC` edges for function allocation
6. **FR-6**: Command shall respect Miller's Law (5-9 children per parent)
7. **FR-7**: Command shall isolate high-volatility functions in dedicated adapter MODs
8. **FR-8**: Command shall output pure Format E Diff

### Non-Functional Requirements

1. **NFR-1**: LLM prompt must include full ontology context for correct edge types
2. **NFR-2**: Must validate Phase 1 gate before proceeding (UCs and REQs exist)
3. **NFR-3**: Must integrate with existing phase-gate-manager

## Architecture / Solution Approach

### Command Flow

```
User: /architect
         │
         ▼
┌─────────────────────────────────────┐
│ 1. Phase Gate Check                 │
│    - Verify Phase 1 complete        │
│    - Check UCs exist                │
│    - Check REQs exist               │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 2. Gather Context                   │
│    - All UC nodes                   │
│    - All REQ nodes                  │
│    - All ACTOR nodes                │
│    - Existing FUNCs (if any)        │
│    - Current canvas state           │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 3. Build Architecture Prompt        │
│    - SE principles (observable,     │
│      verifiable at interface)       │
│    - Miller's Law constraints       │
│    - Volatility isolation rules     │
│    - Top-level FUNC/MOD patterns    │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 4. LLM Generates Architecture       │
│    - 5-9 top-level FUNCs            │
│    - 5-9 top-level MODs             │
│    - satisfy edges (FUNC→REQ)       │
│    - allocate edges (MOD→FUNC)      │
│    - compose edges (SYS→FUNC/MOD)   │
└─────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│ 5. Apply Format E Diff              │
│    - Parse operations               │
│    - Apply to AgentDB               │
│    - Notify graph viewer            │
└─────────────────────────────────────┘
         │
         ▼
   Ready for /optimize
```

### Output Structure (Per Ontology)

```
SYS (BankingApp.SY.001)
├── UC (ViewAccountBalance.UC.001)
│   ├── REQ (ViewBalance.RQ.001)
│   └── FCHAIN (ViewBalanceChain.FC.001)  ← Activity diagram
├── UC (TransferFunds.UC.002)
│   └── ...
├── FUNC (ManageAccounts.FN.001)          ← TOP-LEVEL FUNC under SYS
│   └── FUNC (ValidateAccount.FN.002)     ← Decomposed sub-function
├── FUNC (ProcessTransactions.FN.003)     ← TOP-LEVEL FUNC under SYS
├── FUNC (HandleBilling.FN.004)           ← TOP-LEVEL FUNC under SYS
├── MOD (AccountModule.MD.001)            ← TOP-LEVEL MOD under SYS
│   └── allocate → ManageAccounts.FN.001
├── MOD (TransactionModule.MD.002)        ← TOP-LEVEL MOD under SYS
│   └── allocate → ProcessTransactions.FN.003
└── MOD (BillingModule.MD.003)            ← TOP-LEVEL MOD under SYS
    └── allocate → HandleBilling.FN.004
```

### Key Edge Types

| Edge | Pattern | Purpose |
|------|---------|---------|
| `compose` | SYS -cp-> FUNC | Top-level function hierarchy |
| `compose` | SYS -cp-> MOD | Top-level module hierarchy |
| `compose` | FUNC -cp-> FUNC | Function decomposition |
| `compose` | MOD -cp-> MOD | Module decomposition |
| `satisfy` | FUNC -sat-> REQ | Traceability: function satisfies requirement |
| `allocate` | MOD -all-> FUNC | Allocation: module contains function |

### LLM Prompt Strategy

The prompt must emphasize:

1. **Top-level means under SYS**: FUNCs and MODs compose directly from SYS node
2. **Not under FCHAIN**: FCHAIN is for activity diagrams, not architecture blocks
3. **Miller's Law**: Exactly 5-9 top-level FUNCs, exactly 5-9 top-level MODs
4. **Satisfy edges required**: Every FUNC must trace to at least one REQ
5. **Allocate edges required**: Every FUNC must be allocated to exactly one MOD
6. **Volatility isolation**: High-volatility FUNCs (external APIs, AI) in dedicated MODs

## Implementation Plan

### Phase 1: ArchitectureDesignAgent (4-6 hours)

1. Create `src/llm-engine/auto-derivation.ts` extension:
   - `ArchitectureDesignAgent` class
   - `ArchitectureDesignRequest` interface
   - `buildArchitectureDesignPrompt()` method

2. Prompt must generate:
   - Top-level FUNCs with SYS -cp-> FUNC edges
   - Top-level MODs with SYS -cp-> MOD edges
   - FUNC -sat-> REQ satisfy edges
   - MOD -all-> FUNC allocate edges

### Phase 2: Command Handler (2-3 hours)

1. Create `handleArchitectCommand()` in `derive-commands.ts` or new file
2. Add `/architect` case to `chat-interface.ts` switch
3. Implement phase gate check (Phase 1 must be complete)
4. Stream response and apply diff

### Phase 3: Integration & Testing (2-3 hours)

1. Add unit tests for ArchitectureDesignAgent
2. Add integration test with sample UC/REQ graph
3. Verify `/optimize` works after `/architect`
4. Update `/help` menu

## Current Status

- [ ] Create ArchitectureDesignAgent class
- [ ] Implement buildArchitectureDesignPrompt()
- [ ] Create handleArchitectCommand() handler
- [ ] Add /architect to command switch
- [ ] Add phase gate validation
- [ ] Unit tests
- [ ] Integration tests
- [ ] Update help menu

## Acceptance Criteria

- [ ] `/architect` command exists and is documented in `/help`
- [ ] Running `/architect` after Phase 1 creates 5-9 top-level FUNCs under SYS
- [ ] Running `/architect` creates 5-9 top-level MODs under SYS
- [ ] Every generated FUNC has at least one satisfy edge to REQ
- [ ] Every generated FUNC is allocated to exactly one MOD
- [ ] `/analyze` shows no violations after `/architect`
- [ ] `/optimize` generates variants and improves scores after `/architect`
- [ ] Cohesion score > 0 after `/architect` (MODs exist)

## Dependencies

- Phase 1 completion (SYS, UC, REQ nodes exist)
- CR-032: Unified Data Layer (AgentDB integration)
- Ontology rules (settings/ontology-rules.json)

## Estimated Effort

Total: 8-12 hours (1-2 days)

## Related Documents

- [ontology-rules.json](../../settings/ontology-rules.json) - Phase definitions, edge types
- [auto-derivation.ts](../../src/llm-engine/auto-derivation.ts) - Existing derivation agents
- [derive-commands.ts](../../src/terminal-ui/commands/derive-commands.ts) - Command handlers
- [multi-objective-scorer.ts](../../src/llm-engine/optimizer/multi-objective-scorer.ts) - Why MODs needed
