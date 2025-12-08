# GraphEngine Project Maintenance Rules

## Architecture Context ⭐ READ FIRST

**Every prompt MUST understand the system architecture before making changes.**

### Core Architecture (docs/architecture.md)
- **4-Terminal UI**: WebSocket server (port 3001), Stdout logs, Graph viewer, Chat interface
- **AgentDB-Centric (CR-032)**: UnifiedAgentDBService is the single source of truth during sessions
- **Format E Protocol**: Universal diff format for ALL changes (graph, chat, user edits, LLM ops)
- **Multi-Agent System**: Config-driven agents via `settings/agent-config.json`

### Data Layer (CR-032 - Unified Data Layer)
| Component | Reads From | Writes To |
|-----------|------------|-----------|
| Canvas | AgentDB | AgentDB |
| LLM Engine | AgentDB | via Canvas |
| Validation | AgentDB | - |
| Neo4j | - | Cold storage only |

**Key Rules:**
1. All components read/write through AgentDB (not Neo4j directly)
2. Response cache keyed by query + graph version
3. No duplicate semanticIds or edges allowed (DuplicateSemanticIdError)
4. Neo4j = cold storage: load on session start, persist on explicit /save

### Migration Status
- ✅ UnifiedAgentDBService (source of truth)
- ✅ Validation reads from AgentDB
- ⏳ Canvas migration: `StatelessGraphCanvas` exists but `chat-interface.ts` still uses stateful `GraphCanvas`

**Reference documents:**
- [docs/architecture.md](docs/architecture.md) - System architecture
- [docs/cr/CR-032-unified-data-layer.md](docs/cr/CR-032-unified-data-layer.md) - Data layer details

---

## Project Structure

### Root Directory Rules
- **ONLY these files allowed in root:**
  - README.md (single entry point)
  - package.json, package-lock.json
  - tsconfig.json, vitest.config.ts
  - eslint.config.js
  - .env.example, .gitignore, .prettierrc
- **NO multiple README files** - only one in project root
- **NO temporary .md files in root** - use docs/ or docs/archive/

### Documentation Organization

```
docs/
├── cr/                    # ALL Change Requests (features, bugs, refactoring)
│   └── CR-NNN-description.md
├── archive/              # Historical/completed documentation only
├── requirements.md       # System requirements (FR-*, NFR-*)
└── architecture.md       # System architecture and design decisions
```

**That's it. Avoid creating any other .md files.**

### Documentation Proximity Rule
**Data structure documentation must be near the data:**
- Place README.md or howto.md in directories containing data structures
- Example: `docs/specs/views/README.md` explains Format E view specifications
- Rationale: LLM agents need context-adjacent documentation to understand data formats

## Change Request (CR) Workflow

### When to Create a CR
Create a CR (Change Request) document for **EVERYTHING**:
- New features
- Bug fixes
- Refactoring tasks
- Architectural changes
- Performance improvements
- Documentation tasks

**Everything goes through CRs for simplicity.**

### CR Naming Convention
- Format: `docs/cr/CR-NNN-short-description.md`
- Numbers: Sequential starting from 001
- Examples:
  - `CR-001-initial-implementation.md` (replaces old implan.md concept)
  - `CR-005-auto-derivation-logic.md`
  - `CR-014-auto-save-crash-recovery.md`

### CR Document Structure
**CRs are combined requirements/architecture/use case documents - NOT implementation guides.**

```markdown
# CR-NNN: Task Title

**Type:** Feature | Bug Fix | Refactoring | Architecture | Performance
**Status:** Planned | In Progress | Completed | Cancelled
**Priority:** CRITICAL | HIGH | MEDIUM | LOW
**Target Phase:** Phase N (if applicable)
**Created:** YYYY-MM-DD
**MVP Acceptance Criteria:** #N (if applicable)

## Problem / Use Case
What problem are we solving? What is the user/system need?

## Requirements
- Functional requirements (what must it do?)
- Non-functional requirements (performance, security, etc.)
- Constraints and acceptance criteria

## Architecture / Solution Approach
Describe the architectural approach and key design decisions.
How will this fit into the existing system?

## Implementation Plan
High-level phases and estimated effort for each component.
### Phase 1: Component (X-Y hours)
### Phase 2: Component (X-Y hours)

## Current Status
- [x] Completed task 1
- [ ] Pending task 2

## Acceptance Criteria
- [ ] How do we know it's done?
- [ ] What must be verified?

## Dependencies
What must exist before this can be implemented?

## Estimated Effort
Total: X-Y hours (N-M days)

## MVP Impact (if applicable)
Why this is critical for MVP

## References
- Links to requirements.md sections (FR-*, NFR-*)
- Links to related CRs
```

**Important CR Guidelines:**
- CRs are **requirements + architecture documents**, not code
- Focus on **WHAT** and **WHY**, not HOW (code-level details)
- **NO code examples** unless specifically requested
- Describe solutions conceptually, not programmatically
- Think: use case + requirements + architecture decision
- CRs include their own "Current Status" section

## Documentation Maintenance

### Moving .md Files to Archive
Before archiving any .md file, verify:
1. **Is content implemented?** → Update requirements.md/architecture.md if needed, then archive
2. **Is content documented in requirements.md?** → If yes, archive
3. **Is content outdated?** → Archive directly
4. **Is content still needed but not implemented?** → Create CR-NNN-*.md, then archive original

### Updating Core Documentation
**requirements.md:**
- Add new features under appropriate FR-* sections
- Add non-functional requirements under NFR-* sections
- Mark completed features with ✅
- Reference CR documents for planned features

**architecture.md:**
- Update when architectural decisions are made
- Document new modules/components
- Keep technology stack current
- Document design patterns and principles

**README.md:**
- Single source of truth for getting started
- Quick commands and project status
- Links to requirements.md and architecture.md

### No Other Documentation Files
**Avoid creating:**
- ❌ CURRENT_STATUS.md (status goes in CRs)
- ❌ ROADMAP.md (roadmap is the list of CRs)
- ❌ CHANGELOG.md (use git history)
- ❌ FEATURES.md (features are in requirements.md)
- ❌ TODO.md (TODOs are CRs)
- ❌ REF-* files (only if absolutely necessary, otherwise archive or delete)

**Keep it simple: requirements.md + architecture.md + CRs**

## Quality Enforcement

### Pre-Push Quality Checks
Git pre-push hook (`.githooks/pre-push`) runs automatically:
1. Documentation audit (checks for stale/unarchived docs)
2. Code quality checks:
   - Stale code detection (TODO, FIXME, stubs)
   - Hardcoded values (ports, paths, magic numbers)
   - Module size violations (>500 lines)
   - Lint validation
   - Test pyramid distribution (70% unit / 20% integration / 10% E2E)
   - Smoke tests (TypeScript compilation + unit tests)

### Manual Quality Check
Run before proposing task completion:
```bash
npx tsx scripts/quality-check.ts
```

### Configuration Centralization
**NEVER use hardcoded values - ALWAYS use config:**
```typescript
// ❌ FORBIDDEN
const port = 3001;
const wsUrl = 'ws://localhost:3001';
const temp = 0.7;

// ✅ REQUIRED
import { WS_PORT, WS_URL, LLM_TEMPERATURE } from '../shared/config.js';
```

All environment-based configuration goes in `src/shared/config.ts`.

## Development Workflow Integration

### Before Committing ⭐ MANDATORY
1. Run quality checks: `npx tsx scripts/quality-check.ts`
2. **Run E2E tests:** `npm run test:e2e` - MUST pass before commit
3. Verify unit tests pass: `npm test`
4. Update documentation if interfaces changed
5. Update CR status if task completed

**E2E tests are NOT optional** - they validate the Terminal UI integration which is the primary user interface.

### Before Proposing Completion
Per global CLAUDE.md rules:
1. **Start the application:** `npm run dev`
2. **Run system tests:** `npm run test:e2e`
3. Only then present results to user

### During Development
- Keep root directory clean (only essential config files)
- Document data structures near the data
- Create CR documents for ALL planned work (features, bugs, refactoring)
- Update CR status as work progresses
- Archive completed documentation immediately
- Update requirements.md when new requirements emerge
- Update architecture.md when design decisions are made

## Code Quality Standards

### Module Size
- **Maximum 500 lines** per file (non-empty, non-comment)
- Enforced by ESLint and quality checks
- Suggest refactoring when approaching limit

### Test Distribution (Test Pyramid)
- **70% Unit tests** - tests/unit/**/*.test.ts
- **20% Integration tests** - tests/integration/**/*.test.ts
- **10% E2E tests** - tests/e2e/**/*.spec.ts
- **Zero skipped tests** - no .skip() allowed in CI

### Interactive UI Elements
**MANDATORY:** All interactive elements must have `data-testid` attributes:
```typescript
// ✅ REQUIRED
<button data-testid="save-graph-btn">Save</button>
<input data-testid="node-label-input" />

// ❌ FORBIDDEN
<button>Save</button>
<input />
```

Use kebab-case, be specific, include context.

## Summary

This project maintains strict quality standards through:
- **Simple documentation structure:** requirements.md + architecture.md + CRs
- **Everything is a CR:** Features, bugs, refactoring - all tracked as CRs
- **No extra documentation files:** Avoid creating additional .md files
- **Status in CRs:** Each CR tracks its own implementation status
- Automated pre-push hooks blocking quality violations
- Centralized configuration (no hardcoded values)
- Test pyramid enforcement (70/20/10 distribution)
- Clean root directory (only essential files)

When in doubt: Create a CR, update requirements.md or architecture.md, run quality checks.
