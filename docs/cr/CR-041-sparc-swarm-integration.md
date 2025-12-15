# CR-041: SPARC/Swarm Integration for Heavy-Lifting CRs

**Type:** Process / Workflow
**Status:** Proposed
**Priority:** HIGH
**Created:** 2025-12-10
**Author:** andreas@siglochconsulting

## Problem Statement

Heavy-lifting CRs (like CR-038 with 9 phases, 36K lines of docs) are implemented manually despite having claude-flow swarm and SPARC methodology available. This leads to:

1. **Inconsistent quality** - No TDD, tests written after
2. **Missed architecture review** - Direct implementation without pseudocode/design
3. **Underutilized tooling** - Swarm used for analysis only, not execution
4. **No persistent learning** - No memory storage for patterns/decisions

### Evidence: CR-038 Implementation

| What Should Happen | What Actually Happened |
|--------------------|------------------------|
| SPARC TDD workflow | Manual coding |
| Agents write code | Agents analyze, human writes |
| Tests first | Tests run after |
| Memory persistence | No memory used |
| 17 SPARC modes | 0 modes used |

## Requirements

### FR-041.1: CR Classification
CRs must be classified by complexity:

| Size | Lines Changed | Phases | Example | Approach |
|------|---------------|--------|---------|----------|
| S | <200 | 1 | Bug fix | Manual |
| M | 200-1000 | 2-3 | New command | Optional SPARC |
| L | 1000-5000 | 4-6 | New feature | **SPARC Required** |
| XL | >5000 | 7+ | Architecture | **SPARC + Swarm** |

### FR-041.2: Mandatory SPARC for L/XL CRs
Large CRs MUST use SPARC methodology:

```bash
# Required workflow for L/XL CRs
npx claude-flow sparc tdd "CR-XXX: <task description>"
```

### FR-041.3: CR Template Enhancement
CR documents must include execution plan:

```markdown
## Execution Approach

**Size:** L (estimated 2500 lines)
**Method:** SPARC TDD with Swarm

### Swarm Configuration
- Topology: hierarchical
- Max Agents: 8
- Strategy: specialized

### SPARC Phases
1. [ ] Specification (`sparc run spec-pseudocode`)
2. [ ] Architecture (`sparc run architect`)
3. [ ] TDD Implementation (`sparc tdd`)
4. [ ] Review (`sparc run review`)
5. [ ] Integration (`sparc run integration`)
```

### FR-041.4: Slash Command `/cr-exec`
New command to execute CR with proper methodology:

```bash
/cr-exec CR-038  # Reads CR, determines size, launches appropriate workflow
```

## Solution Architecture

### Workflow Decision Tree

```
CR Document
    │
    ▼
┌─────────────────┐
│ Classify Size   │
│ (S/M/L/XL)      │
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
    S/M      L/XL
    │         │
    ▼         ▼
 Manual    SPARC Required
           │
           ▼
    ┌──────────────────┐
    │ 1. Skill Invoke  │
    │ sparc-methodology│
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │ 2. Swarm Init    │
    │ (if XL)          │
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │ 3. SPARC TDD     │
    │ Tests → Code     │
    └────────┬─────────┘
             │
             ▼
    ┌──────────────────┐
    │ 4. Memory Store  │
    │ Patterns/Skills  │
    └──────────────────┘
```

### Integration Points

**1. CR Document Parser**
Extract execution plan from CR markdown:
- Size classification
- Phase breakdown
- Dependencies
- Acceptance criteria

**2. SPARC Mode Selection**
Map CR type to SPARC modes:

| CR Type | SPARC Modes |
|---------|-------------|
| Feature | researcher → architect → tdd → reviewer |
| Refactor | analyzer → architect → tdd → optimizer |
| Bug Fix | debugger → tdd → reviewer |
| Architecture | researcher → architect → security → reviewer |

**3. Swarm Topology Selection**
Based on CR characteristics:

| Pattern | Topology | When |
|---------|----------|------|
| Independent phases | mesh | Parallel work possible |
| Sequential phases | hierarchical | Dependencies exist |
| Review/validation | star | Central coordinator needed |

### Enforcement Mechanism

**Pre-commit Hook Enhancement**
```bash
# .githooks/pre-commit
# Check if CR is L/XL and SPARC was used

CR_SIZE=$(detect_cr_size "$COMMIT_MSG")
if [[ "$CR_SIZE" =~ ^(L|XL)$ ]]; then
  if ! check_sparc_artifacts; then
    echo "ERROR: L/XL CR requires SPARC workflow"
    echo "Run: npx claude-flow sparc tdd 'CR-XXX'"
    exit 1
  fi
fi
```

**SPARC Artifacts Check**
Look for evidence of SPARC usage:
- Test files created before implementation (git log)
- Memory entries for CR decisions
- Agent coordination logs

## Implementation Plan

### Phase 1: CR Template Update (2h)
- Add "Execution Approach" section to CR template
- Add size classification guide
- Update CLAUDE.md with requirements

### Phase 2: /cr-exec Command (4h)
- Parse CR document
- Classify size
- Launch appropriate workflow
- Track progress via TodoWrite

### Phase 3: Memory Integration (3h)
- Store CR decisions in claude-flow memory namespace
- **Storage isolation:** `~/.claude-flow/` (NOT project's `data/graphengine-agentdb.db`)
- Retrieve patterns for similar CRs
- Build skill library from successful CRs

**Note:** Project uses AgentDB at `data/graphengine-agentdb.db` for graph data.
claude-flow memory uses `~/.claude-flow/` and `.swarm/memory.db` - completely separate.

### Phase 4: Enforcement Hooks (2h)
- Pre-commit size detection
- SPARC artifact validation
- Warning for non-compliant L/XL CRs

## Example: Correct CR-038 Execution

```bash
# Step 1: User initiates
User: /cr-exec CR-038

# Step 2: System analyzes CR
Claude: CR-038 classified as XL (36K docs, 9 phases)
        Launching SPARC TDD with hierarchical swarm...

# Step 3: Invoke SPARC skill
Skill("sparc-methodology")

# Step 4: Initialize swarm
mcp__claude-flow__swarm_init {
  topology: "hierarchical",
  maxAgents: 8,
  strategy: "specialized"
}

# Step 5: Execute SPARC phases
npx claude-flow sparc tdd "Phase 8: Context Manager for token optimization"

# Step 6: For each phase:
#   a) Write specification
#   b) Write failing tests
#   c) Implement to pass tests
#   d) Review and refactor
#   e) Store patterns in memory

# Step 7: Memory persistence (stored in ~/.claude-flow/, NOT AgentDB)
mcp__claude-flow__memory_usage {
  action: "store",
  namespace: "sparc-patterns",  # Isolated namespace for SPARC learnings
  key: "cr-038/context-manager-pattern",
  value: "<implementation pattern>"
}
```

## Acceptance Criteria

- [ ] CR template includes "Execution Approach" section
- [ ] L/XL CRs cannot be committed without SPARC artifacts
- [ ] `/cr-exec` command exists and works
- [ ] Memory stores patterns from completed CRs
- [ ] Next similar CR retrieves relevant patterns

## CR History Analysis

| CR | Size | Used SPARC? | Used Swarm? | Outcome |
|----|------|-------------|-------------|---------|
| CR-032 | XL | No | No | Multiple follow-up CRs |
| CR-033 | L | No | No | Partial implementation |
| CR-038 | XL | No | Partial | Manual implementation |
| CR-039 | S | No | No | OK (appropriate) |

**Pattern:** Large CRs without SPARC generate follow-up CRs and rework.

## Estimated Effort

| Phase | Hours |
|-------|-------|
| Template Update | 2 |
| /cr-exec Command | 4 |
| Memory Integration | 3 |
| Enforcement Hooks | 2 |
| **Total** | **11 hours** |

## References

- [SPARC Methodology Skill](.claude/skills/sparc-methodology/skill.md)
- [Swarm Orchestration Skill](.claude/skills/swarm-orchestration/skill.md)
- [CR-038 Clean Architecture](CR-038-clean-architecture-refactor.md)
- [CLAUDE.md](../../CLAUDE.md) - Project instructions
