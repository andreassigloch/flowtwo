# GraphEngine Documentation

**Version:** 2.0.0 Greenfield
**Status:** Specification Phase (No Implementation)
**Author:** andreas@siglochconsulting
**Date:** 2025-11-17

---

## Quick Navigation

### 📋 Core Specifications (Start Here)

1. **[requirements.md](requirements.md)** - Functional & non-functional requirements
   - 10 node types, 6 edge types (Ontology V3)
   - 5 specialized views (Hierarchy, Functional Flow, Requirements, Allocation, Use Case)
   - Multi-tenancy, Canvas-centric architecture
   - Format E serialization, LLM integration, AgentDB caching

2. **[architecture.md](architecture.md)** - System design & component contracts
   - Canvas (central state manager)
   - Terminal UI (Rich + Textual)
   - LLM Engine (Anthropic + AgentDB)
   - Graph Engine (layout algorithms)
   - Neo4j (long-term persistence)
   - WebSocket + REST contracts

3. **[implan.md](implan.md)** - Test-driven implementation plan
   - 6-week roadmap (Phase 0-5)
   - Test-first approach (70% unit / 20% integration / 10% E2E)
   - Detailed test examples for each phase
   - Quality gates & CI/CD pipeline

4. **[TESTING_STRATEGY.md](TESTING_STRATEGY.md)** - Root cause driven testing philosophy
   - Test pyramid strategy
   - Contract testing
   - Audit logging
   - Quality gates

---

## 📁 Directory Structure

```
docs/
├── README.md                  ← You are here
├── requirements.md            ← WHAT to build
├── architecture.md            ← HOW it works
├── implan.md                  ← Implementation roadmap (TDD)
├── TESTING_STRATEGY.md        ← Testing philosophy
├── archive/                   ← Old documentation (pre-greenfield)
└── specs/                     ← Detailed specifications (to be created)
    ├── ontology_schema.json
    ├── rendering_ontology.json
    ├── format_e_spec.md
    ├── layout_algorithms.md
    └── views/
        ├── hierarchy.json
        ├── functional-flow.json
        ├── requirements.json
        ├── allocation.json
        └── use-case-diagram.json
```

---

## 🎯 System Overview

**GraphEngine** is an LLM-driven Systems Engineering platform combining:
- **Natural Language Interface** (Terminal UI with chat)
- **Ontology-Based Graph Database** (Neo4j with Ontology V3)
- **Multi-View Visualization** (5 specialized SE views)
- **Intelligent Assistance** (LLM with SE methodology guidance)
- **Persistent Memory** (AgentDB for context + prompt caching)

**Key Principle**: Canvas-centric architecture where Canvas owns working state, LLM and user both interact with Canvas, Neo4j serves as long-term persistence.

---

## 🏗️ Architecture at a Glance

```
Terminal UI (TUI)
    ↕ WebSocket
Canvas (State Manager) ★ Source of Truth
    ↓ Format E          ↓ Cypher         ↓ REST
LLM Engine          Neo4j Database   Graph Engine
    ↓ MCP
AgentDB
```

**Data Flow**:
1. User types in Terminal UI
2. Canvas forwards to LLM (with canvas state in Format E)
3. LLM generates operations (Format E Diff)
4. Canvas applies diff, marks dirty
5. Canvas broadcasts update to all users
6. Terminal UI requests layout from Graph Engine
7. Terminal UI renders graph
8. On save: Canvas persists dirty nodes to Neo4j

---

## 📊 Key Specifications

### Ontology V3 (10 Node Types)
- **SYS** (System), **UC** (Use Case), **ACTOR** (External Entity)
- **FCHAIN** (Function Chain), **FUNC** (Function), **FLOW** (Data Flow Contract)
- **REQ** (Requirement), **TEST** (Test Case), **MOD** (Module), **SCHEMA** (Data Structure)

### 6 Relationship Types
- **compose** (hierarchy), **io** (input/output flow)
- **satisfy** (requirement satisfaction), **verify** (test verification)
- **allocate** (function to module), **relation** (generic)

### 5 Views
1. **Hierarchy** - System decomposition tree (Reingold-Tilford layout)
2. **Functional Flow** - FUNC network with I/O ports (Orthogonal routing)
3. **Requirements** - REQ → FUNC → TEST traceability (Sugiyama layered)
4. **Allocation** - MOD contains FUNC (Treemap)
5. **Use Case** - UC + ACTOR (Radial, UML-style)

### Format E (Token-Efficient Serialization)
- 74% token reduction vs JSON
- Syntax: `NodeName|Type|SemanticID|Descr [x:100,y:200]`
- Diff format for incremental updates

---

## 🚀 Implementation Status

**Current Phase**: Phase 0 - Foundation

| Phase | Duration | Status | Tasks |
|-------|----------|--------|-------|
| **Phase 0: Foundation** | Week 1 | 🟢 In Progress | Project structure, spec files, test infrastructure |
| **Phase 1: Canvas** | Week 2 | ⚪ Not Started | State management, Format E parsing, dirty tracking |
| **Phase 2: Graph Engine** | Week 3 | ⚪ Not Started | Layout algorithms, view filtering, port extraction |
| **Phase 3: LLM Engine** | Week 4 | ⚪ Not Started | Anthropic integration, AgentDB, auto-derivation |
| **Phase 4: Terminal UI** | Week 5 | ⚪ Not Started | Chat interface, graph canvas, WebSocket client |
| **Phase 5: Integration** | Week 6 | ⚪ Not Started | E2E tests, performance testing, polish |

---

## 🧪 Testing Strategy

**Test Pyramid**: 70% Unit / 20% Integration / 10% E2E

**Quality Gates** (ALL must pass before PR merge):
- ✅ Unit test coverage ≥80%
- ✅ Integration test coverage ≥60%
- ✅ E2E smoke tests: 100% pass rate
- ✅ Contract violations: 0
- ✅ Test isolation failures: 0

**Principle**: **Test First, Root Cause Driven, No Workarounds**

---

## 📚 Detailed Specs (To Be Created)

### Next Steps (Week 1)

1. **Create `docs/specs/rendering_ontology.json`**
   - Visual rendering rules for 10 node types
   - Zoom levels L0-L4 per type
   - Styling (colors, strokes, fonts, stereotypes)

2. **Create `docs/specs/views/*.json` (5 files)**
   - `hierarchy.json` - Tree layout configuration
   - `functional-flow.json` - Orthogonal routing configuration
   - `requirements.json` - Layered layout configuration
   - `allocation.json` - Treemap configuration
   - `use-case-diagram.json` - Radial layout configuration

3. **Create `docs/specs/format_e_spec.md`**
   - Formal EBNF grammar
   - Validation rules
   - Diff format specification

4. **Create `docs/specs/layout_algorithms.md`**
   - Reingold-Tilford pseudocode
   - Sugiyama pseudocode
   - Orthogonal routing (Manhattan A*)
   - Squarified treemap

---

## 🔗 External References

- **Ontology V3 Schema**: Already exists at project root (ontology_schema.json)
- **SysML 2.0 Concepts**: INCOSE website (for naming conventions, not compliance)
- **Anthropic Prompt Caching**: [Anthropic Docs](https://docs.anthropic.com/claude/docs/prompt-caching)
- **AgentDB (MCP)**: Model Context Protocol for agent memory
- **Rich + Textual**: Python TUI frameworks

---

## 📞 Contact

**Project Lead**: andreas@siglochconsulting
**Project**: GraphEngine (Greenfield Rewrite)
**Repository**: /Users/andreas/Documents/Projekte/dev/aise/graphengine

---

## 📝 Change Log

### 2025-11-17 - Greenfield Specification
- Created consolidated [requirements.md](requirements.md) (506 lines)
- Created Canvas-centric [architecture.md](architecture.md)
- Created test-driven [implan.md](implan.md) (1000+ lines, 6-week roadmap)
- Archived old documentation (19 files moved to `archive/`)
- Established Canvas-centric architecture principle
- Defined 6 component contracts (Terminal UI, Canvas, LLM, Neo4j, Graph Engine, AgentDB)

---

**Status**: Ready to begin Phase 0 implementation (Week 1) ✅
