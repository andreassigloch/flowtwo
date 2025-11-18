# GraphEngine v2.0.0

**Enterprise-Grade LLM-Driven Systems Engineering Platform**

**Author:** andreas@siglochconsulting
**Status:** Phase 0 - Foundation ✅
**Methodology:** SPARC (Specification, Pseudocode, Architecture, Refinement, Completion)

---

## 🎯 System Overview

GraphEngine is an LLM-driven Systems Engineering platform combining:

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

### Dual Canvas Architecture

**Two Canvas Types:**
1. **Graph Canvas** - Manages graph state (nodes, edges, positions)
2. **Chat Canvas** - Manages conversation state (messages, LLM responses)

Both use Format E Diff as the universal change protocol.

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

### 5 Specialized Views
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

## 🚀 Quick Start

### Installation

```bash
# Install dependencies
npm install

# Run tests (verify setup)
npm test

# Run application
npm run dev

# Build for production
npm run build
```

### Test Pyramid

**Distribution: 70% Unit / 20% Integration / 10% E2E**

```bash
npm run test:unit          # Run unit tests only
npm run test:integration   # Run integration tests
npm run test:e2e           # Run E2E tests
npm run test:coverage      # Generate coverage report
```

### Quality Gates

ALL must pass before PR merge:
- ✅ Unit test coverage ≥80%
- ✅ Integration test coverage ≥60%
- ✅ E2E smoke tests: 100% pass rate
- ✅ Contract violations: 0
- ✅ Test isolation failures: 0

---

## 📁 Project Structure

```
graphengine/
├── src/
│   ├── canvas/              # Canvas state managers (Graph + Chat)
│   ├── llm-engine/          # LLM integration (Anthropic + AgentDB)
│   ├── graph-engine/        # Layout algorithms
│   ├── terminal-ui/         # TUI components (Ink + React)
│   ├── neo4j-client/        # Database client
│   └── shared/
│       ├── types/           # TypeScript type definitions
│       ├── validators/      # Format E validators
│       └── parsers/         # Format E parsers
├── tests/
│   ├── unit/                # 70% of tests
│   ├── integration/         # 20% of tests
│   └── e2e/                 # 10% of tests
├── docs/                    # Documentation
│   ├── README.md            ← You are here
│   ├── requirements.md      # Functional requirements
│   ├── ARCHITECTURE.md      # System architecture
│   ├── implan.md            # Implementation plan (6 weeks)
│   ├── TESTING_STRATEGY.md  # Testing philosophy
│   └── specs/               # Detailed specifications
│       ├── ontology_schema.json
│       ├── rendering_ontology.json
│       ├── format_e_spec.md
│       └── views/           # View configurations (5 files)
└── package.json
```

---

## 🧪 Testing Strategy

**Principle:** Test First, Root Cause Driven, No Workarounds

### Current Test Coverage

- ✅ Canvas Base Class (10 tests passing)
- ✅ Diff application logic
- ✅ Dirty tracking
- ✅ Cache strategy decision
- ✅ Persistence logic

### Next Testing Priorities

1. Format E Parser (unit tests)
2. Graph Canvas (unit + integration)
3. Chat Canvas (unit + integration)
4. Neo4j integration (integration tests)
5. LLM Engine (integration tests)

---

## 📋 Implementation Roadmap

### Phase 0: Foundation (Week 1) ✅ CURRENT

- [x] Project structure
- [x] TypeScript configuration
- [x] Test infrastructure (Vitest)
- [x] Core type definitions (Ontology, Canvas, Format E)
- [x] Canvas Base Class implementation
- [x] Unit tests (10 passing)
- [ ] Format E Parser
- [ ] Specification files (ontology_schema.json, views/*.json)

### Phase 1: Canvas (Week 2)

- [ ] Graph Canvas implementation
- [ ] Chat Canvas implementation
- [ ] Format E Diff parser
- [ ] Dirty tracking system
- [ ] Unit tests (≥80% coverage)

### Phase 2: Graph Engine (Week 3)

- [ ] Layout algorithms (Reingold-Tilford, Sugiyama, Orthogonal, Treemap, Radial)
- [ ] View filtering
- [ ] Port extraction from FLOW nodes
- [ ] Unit + integration tests

### Phase 3: LLM Engine (Week 4)

- [ ] Anthropic SDK integration
- [ ] AgentDB MCP client
- [ ] Auto-derivation (UC → FUNC, REQ → TEST)
- [ ] Validation advisor (12 ontology rules)
- [ ] Integration tests

### Phase 4: Terminal UI (Week 5)

- [ ] Chat interface (Ink + Textual)
- [ ] Graph canvas rendering (Rich)
- [ ] WebSocket client
- [ ] View selector
- [ ] E2E tests

### Phase 5: Integration (Week 6)

- [ ] Neo4j persistence
- [ ] Multi-user synchronization
- [ ] E2E smoke tests
- [ ] Performance testing
- [ ] Polish & documentation

---

## 🔧 Tech Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Runtime | Node.js | 20+ |
| Language | TypeScript | 5.7+ |
| Testing | Vitest | 2.0+ |
| Backend | Fastify | 4.28+ |
| Database | Neo4j | 5.x |
| LLM | Anthropic SDK | 0.30+ |
| Terminal UI | Ink | 5.0+ |
| Agent Memory | AgentDB (MCP) | Latest |

---

## 📚 Documentation

- **[requirements.md](docs/requirements.md)** - Complete functional requirements (506 lines)
- **[ARCHITECTURE.md](docs/ARCHITECTURE.md)** - Canvas-centric architecture design
- **[implan.md](docs/implan.md)** - Test-driven implementation plan (6 weeks)
- **[TESTING_STRATEGY.md](docs/TESTING_STRATEGY.md)** - Root cause driven testing

---

## 🤝 Contributing

**Development Principles:**
1. Test-driven development (TDD)
2. Root cause analysis (no workarounds)
3. Schema-first (no hardcoded values)
4. Contract testing (enforce API contracts)

**Before submitting PR:**
```bash
npm run validate  # Runs lint + test + build
```

---

## 📞 Contact

**Project Lead:** andreas@siglochconsulting
**Project:** GraphEngine (Greenfield Rewrite)
**Repository:** /Users/andreas/Documents/Projekte/dev/aise/graphengine

---

## 📝 Change Log

### 2025-11-17 - Phase 0 Foundation Complete ✅

**✅ Completed:**
- TypeScript project structure (src/, tests/, docs/)
- Core type definitions (Ontology V3, Canvas, Format E)
- Canvas Base Class with universal diff protocol
- Test infrastructure (Vitest with 70/20/10 pyramid)
- Unit tests (10 passing, 100% pass rate)
- Quality gates configured (≥80% unit coverage)
- SPARC methodology applied (Specification → Architecture → Types → Tests → Implementation)

**🎯 Next Steps:**
- Implement Format E Parser
- Create specification JSON files (ontology_schema.json, views/*.json)
- Complete Graph Canvas implementation
- Implement Chat Canvas
- Set up Neo4j integration

**📊 Statistics:**
- Lines of Code: ~800
- Test Files: 2
- Tests: 10 passing
- Coverage: Canvas Base Class 100%

---

**Status:** Ready to begin Phase 1 implementation (Week 2) ✅
