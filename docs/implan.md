# GraphEngine - Test-Driven Implementation Plan

**Version:** 2.0.0 Greenfield (TypeScript)
**Author:** andreas@siglochconsulting
**Date:** 2025-11-17
**Updated:** 2025-11-17 (Migrated from Python to TypeScript)
**Principle:** Test First, Root Cause Driven, No Workarounds

**Technology Stack:** TypeScript + Bun/Node.js (see [requirements.md](requirements.md) C-1 for full stack)

---

## Implementation Philosophy

**Test-Driven Development (TDD)**: Write tests BEFORE implementation
**Root Cause Driven**: Fix diseases, not symptoms (see [TESTING_STRATEGY.md](TESTING_STRATEGY.md))
**Test Pyramid**: 70% Unit / 20% Integration / 10% E2E

**Quality Gates** (ALL must pass before PR merge):
- ✅ Unit test coverage ≥80%
- ✅ Integration test coverage ≥60%
- ✅ E2E smoke tests: 100% pass rate
- ✅ Contract violations: 0
- ✅ Test isolation failures: 0

---

## Phase 0: Foundation (Week 1)

### Objectives
- Set up project structure
- Create specification files
- Configure test infrastructure
- Define API/WebSocket contracts

### Tasks

#### 1. Project Structure
```
graphengine/
├── src/
│   ├── canvas/         # Canvas state manager
│   ├── llm-engine/     # LLM with AgentDB
│   ├── graph-engine/   # Layout algorithms
│   ├── terminal-ui/    # TUI components (Ink)
│   └── neo4j-client/   # Database client
├── tests/
│   ├── unit/           # 70% of tests
│   ├── integration/    # 20% of tests
│   └── e2e/            # 10% of tests
├── docs/
│   ├── specs/
│   │   ├── ontology_schema.json
│   │   ├── rendering_ontology.json
│   │   ├── format_e_spec.md
│   │   ├── layout_algorithms.md
│   │   └── views/
│   │       ├── hierarchy.json
│   │       ├── functional-flow.json
│   │       ├── requirements.json
│   │       ├── allocation.json
│   │       └── use-case-diagram.json
│   ├── requirements.md
│   ├── architecture.md
│   └── implan.md
├── package.json
├── tsconfig.json
└── bunfig.toml
```

#### 2. Create Specification Files

**2.1 rendering_ontology.json**
- [ ] **Test:** Schema validation (JSON Schema compliance)
- [ ] **Test:** All 10 node types defined
- [ ] **Test:** All zoom levels (L0-L4) present per type
- [ ] **Implementation:** Create file from [graphengineeringdef.md](graphengineeringdef.md:1-460)

**2.2 View Configurations** (5 files in `docs/specs/views/`)
- [ ] **Test:** Schema validation for each view
- [ ] **Test:** View references only valid node/edge types
- [ ] **Test:** Layout algorithm parameters valid
- [ ] **Implementation:** Create from [graphengineeringdef.md](graphengineeringdef.md:603-876)

**2.3 format_e_spec.md**
- [ ] **Test:** EBNF grammar parses example graphs
- [ ] **Test:** Diff syntax validator
- [ ] **Implementation:** Formalize from [graphengineeringdef.md](graphengineeringdef.md:459-565)

#### 3. Test Infrastructure

**3.1 Unit Test Setup (Vitest or Bun test)**
```typescript
// tests/setup.ts
import { beforeEach, afterEach } from 'vitest';

export interface SampleGraph {
    nodes: Array<{
        semanticId: string;
        type: string;
        Name: string;
        Descr: string;
    }>;
    edges: Array<{
        source: string;
        target: string;
        type: string;
    }>;
}

export function createSampleGraph(): SampleGraph {
    return {
        nodes: [
            {
                semanticId: "TestSystem.SY.001",
                type: "SYS",
                Name: "TestSystem",
                Descr: "A test system"
            },
            {
                semanticId: "TestFunction.FN.001",
                type: "FUNC",
                Name: "TestFunction",
                Descr: "A test function"
            }
        ],
        edges: [
            {
                source: "TestSystem.SY.001",
                target: "TestFunction.FN.001",
                type: "compose"
            }
        ]
    };
}

export function createFormatEString(): string {
    return `## View-Context
Type: Hierarchy
Filter: SYS,UC nodes | compose edges

## Nodes
TestSystem|SYS|TestSystem.SY.001|A test system
TestFunction|FUNC|TestFunction.FN.001|A test function

## Edges
TestSystem.SY.001 -cp-> TestFunction.FN.001
`;
}
```

**3.2 Integration Test Setup**
- [ ] **Test:** Neo4j test container starts/stops
- [ ] **Test:** Test isolation (cleanup between tests)
```typescript
// tests/integration/setup.ts
import { beforeAll, afterAll, beforeEach } from 'vitest';
import neo4j, { Driver, Session } from 'neo4j-driver';
import { GenericContainer, StartedTestContainer } from 'testcontainers';

let container: StartedTestContainer;
let driver: Driver;

export async function setupNeo4jContainer() {
    container = await new GenericContainer('neo4j:5')
        .withEnvironment({ NEO4J_AUTH: 'neo4j/test1234' })
        .withExposedPorts(7687)
        .start();

    const uri = `bolt://localhost:${container.getMappedPort(7687)}`;
    driver = neo4j.driver(uri, neo4j.auth.basic('neo4j', 'test1234'));

    return driver;
}

export async function teardownNeo4jContainer() {
    await driver?.close();
    await container?.stop();
}

export async function cleanupNeo4j(session: Session) {
    await session.run('MATCH (n) DETACH DELETE n');
}
```

**3.3 E2E Test Setup**
- [ ] **Test:** Terminal UI launches without errors
- [ ] **Test:** WebSocket connection established
```typescript
// tests/e2e/setup.ts
import { beforeAll, afterAll } from 'vitest';
import { CanvasServer } from '../../src/canvas/server';
import { TerminalApp } from '../../src/terminal-ui/app';

let canvasServer: CanvasServer;
let terminalApp: TerminalApp;

export async function setupE2ESystem() {
    // Start Canvas server
    canvasServer = new CanvasServer({ port: 3001 });
    await canvasServer.start();

    // Start Terminal UI
    terminalApp = new TerminalApp({ canvasUrl: 'ws://localhost:3001' });
    await terminalApp.connect();

    return { canvas: canvasServer, tui: terminalApp };
}

export async function teardownE2ESystem() {
    await terminalApp?.disconnect();
    await canvasServer?.stop();
}
```

#### 4. Contract Definitions

**4.1 WebSocket Contract** (`tests/contracts/websocket-contract.ts`)
```typescript
// Type definitions
export interface UserEditMessage {
    type: 'user-edit';
    chatId: string;
    workspaceId: string;
    systemId: string;
    userId: string;
    diff: string;  // Format E Diff
    timestamp: string;  // ISO 8601
}

export interface CanvasUpdateMessage {
    type: 'canvas-update';
    chatId: string;
    systemId: string;
    diff: string;
    source: 'llm' | 'user' | 'sync';
    userId?: string;
    timestamp: string;
}

// Tests
import { describe, it, expect } from 'vitest';

describe('WebSocket Contract', () => {
    it('validates user edit message', () => {
        const msg: UserEditMessage = {
            type: 'user-edit',
            chatId: 'chat-123',
            workspaceId: 'ws-001',
            systemId: 'TestSystem.SY.001',
            userId: 'user-andreas',
            diff: '<operations>+ TestNode|FUNC|TestNode.FN.001</operations>',
            timestamp: '2025-11-17T10:00:00Z'
        };

        expect(msg.type).toBe('user-edit');
    });
});
```

**4.2 REST API Contract** (OpenAPI schema)
- [ ] **Test:** OpenAPI schema validates sample requests
- [ ] **Test:** Response schemas match specification
- [ ] **Implementation:** Define OpenAPI 3.0 spec

---

## Phase 1: Canvas State Manager (Week 2)

### Objectives
- Implement canvas state management
- Handle Format E parsing and diff application
- Support dirty tracking and persistence decision logic

### Test-First Implementation

#### 1. Format E Parser

**Unit Tests (write first):**
```typescript
// tests/unit/format-e-parser.test.ts
import { describe, it, expect } from 'vitest';
import { FormatEParser, ParseError } from '../../src/canvas/format-e-parser';

describe('FormatEParser', () => {
    it('parses nodes section', () => {
        const formatE = `## Nodes
TestSystem|SYS|TestSystem.SY.001|Test description
TestFunction|FUNC|TestFunction.FN.001|Test function [x:100,y:200,zoom:L2]
`;
        const parser = new FormatEParser();
        const nodes = parser.parseNodes(formatE);

        expect(nodes).toHaveLength(2);
        expect(nodes[0].semanticId).toBe('TestSystem.SY.001');
        expect(nodes[0].type).toBe('SYS');
        expect(nodes[0].Name).toBe('TestSystem');
        expect(nodes[0].Descr).toBe('Test description');

        expect(nodes[1].semanticId).toBe('TestFunction.FN.001');
        expect(nodes[1].presentation.x).toBe(100);
        expect(nodes[1].presentation.zoom).toBe('L2');
    });

    it('parses edges section', () => {
        const formatE = `## Edges
TestSystem.SY.001 -cp-> TestFunction.FN.001
TestFunction.FN.001 -io-> TestFlow.FL.001
`;
        const parser = new FormatEParser();
        const edges = parser.parseEdges(formatE);

        expect(edges).toHaveLength(2);
        expect(edges[0].source).toBe('TestSystem.SY.001');
        expect(edges[0].target).toBe('TestFunction.FN.001');
        expect(edges[0].type).toBe('compose');
    });

    it('parses diff operations', () => {
        const diff = `<operations>
<base_snapshot>TestSystem.SY.001@v1</base_snapshot>
<view_context>Hierarchy</view_context>

## Nodes
+ NewNode|FUNC|NewNode.FN.002|New function
- OldNode.FN.003
- TestFunction.FN.001|Old description
+ TestFunction.FN.001|Updated description [x:150,y:250]

## Edges
+ TestSystem.SY.001 -cp-> NewNode.FN.002
- TestSystem.SY.001 -cp-> OldNode.FN.003
</operations>`;

        const parser = new FormatEParser();
        const operations = parser.parseDiff(diff);

        expect(operations.baseSnapshot).toBe('TestSystem.SY.001@v1');
        expect(operations.viewContext).toBe('Hierarchy');
        expect(operations.addNodes).toHaveLength(2);  // NewNode + updated TestFunction
        expect(operations.removeNodes).toHaveLength(2);  // OldNode + old TestFunction
        expect(operations.addEdges).toHaveLength(1);
        expect(operations.removeEdges).toHaveLength(1);
    });

    it('throws error on invalid format', () => {
        const invalid = `## Nodes
InvalidLine without pipes
`;
        const parser = new FormatEParser();

        expect(() => parser.parseNodes(invalid)).toThrow(ParseError);
        expect(() => parser.parseNodes(invalid)).toThrow(/Line 2/);
        expect(() => parser.parseNodes(invalid)).toThrow(/Invalid node syntax/);
    });
});
```

**Implementation (after tests fail):**
```typescript
// src/canvas/format-e-parser.ts

export interface Node {
    semanticId: string;
    type: string;
    Name: string;
    Descr?: string;
    presentation?: Record<string, any>;
}

export interface Edge {
    source: string;
    target: string;
    type: string;
}

export class ParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ParseError';
    }
}

export class FormatEParser {
    private static readonly OPERATOR_MAP: Record<string, string> = {
        '-cp->': 'compose',
        '-io->': 'io',
        '-sf->': 'satisfy',
        '-vf->': 'verify',
        '-al->': 'allocate',
        '-rl->': 'relation'
    };

    parseNodes(formatE: string): Node[] {
        const nodes: Node[] = [];
        let inNodesSection = false;

        const lines = formatE.split('\n');
        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum].trim();
            if (!line) continue;

            if (line === '## Nodes') {
                inNodesSection = true;
                continue;
            } else if (line.startsWith('##')) {
                inNodesSection = false;
                continue;
            }

            if (inNodesSection) {
                const node = this.parseNodeLine(line, lineNum + 1);
                nodes.push(node);
            }
        }

        return nodes;
    }

    private parseNodeLine(line: string, lineNum: number): Node {
        // Pattern: Name|Type|SemanticID|Descr [attrs]
        // Attributes are optional
        const attrMatch = line.match(/\[(.+)\]$/);
        const attrs: Record<string, any> = {};

        if (attrMatch) {
            const attrStr = attrMatch[1];
            line = line.substring(0, attrMatch.index).trim();

            // Parse attrs: x:100,y:200,zoom:L2
            attrStr.split(',').forEach(attr => {
                const [key, valueStr] = attr.split(':', 2);
                let value: any = valueStr;

                // Try to convert to number
                const numValue = Number(valueStr);
                if (!isNaN(numValue)) {
                    value = numValue;
                }

                attrs[key.trim()] = value;
            });
        }

        const parts = line.split('|');
        if (parts.length < 3) {
            throw new ParseError(`Line ${lineNum}: Invalid node syntax: ${line}`);
        }

        return {
            Name: parts[0],
            type: parts[1],
            semanticId: parts[2],
            Descr: parts[3] || '',
            presentation: attrs
        };
    }

    // ... parseEdges, parseDiff implementations
}
```

#### 2. Canvas State Management

**Unit Tests:**
```typescript
// tests/unit/canvas-state.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { CanvasState } from '../../src/canvas/canvas-state';
import { Node } from '../../src/canvas/format-e-parser';

describe('CanvasState', () => {
    it('initializes with empty state', () => {
        const canvas = new CanvasState({
            workspaceId: 'ws-test',
            systemId: 'TestSystem.SY.001'
        });

        expect(canvas.workspaceId).toBe('ws-test');
        expect(canvas.systemId).toBe('TestSystem.SY.001');
        expect(canvas.nodes.size).toBe(0);
        expect(canvas.edges.size).toBe(0);
        expect(canvas.dirtyNodes.size).toBe(0);
    });

    it('marks node as dirty when added', () => {
        const canvas = new CanvasState({
            workspaceId: 'ws-test',
            systemId: 'TestSystem.SY.001'
        });

        const node: Node = {
            semanticId: 'TestNode.FN.001',
            type: 'FUNC',
            Name: 'TestNode'
        };

        canvas.addNode(node);

        expect(canvas.nodes.has('TestNode.FN.001')).toBe(true);
        expect(canvas.dirtyNodes.has('TestNode.FN.001')).toBe(true);
    });

    it('applies diff to add node', async () => {
        const canvas = new CanvasState({
            workspaceId: 'ws-test',
            systemId: 'TestSystem.SY.001'
        });

        const diff = `<operations>
<base_snapshot>TestSystem.SY.001@v1</base_snapshot>

## Nodes
+ NewNode|FUNC|NewNode.FN.002|New function

## Edges
</operations>`;

        const result = await canvas.applyDiff(diff);

        expect(canvas.nodes.has('NewNode.FN.002')).toBe(true);
        expect(canvas.dirtyNodes.has('NewNode.FN.002')).toBe(true);
        expect(result.success).toBe(true);
        expect(result.addedNodes).toHaveLength(1);
    });

    it('applies diff to update existing node', async () => {
        const canvas = new CanvasState({
            workspaceId: 'ws-test',
            systemId: 'TestSystem.SY.001'
        });
    # Add initial node
    canvas.add_node(Node(
        semanticId="TestNode.FN.001",
        type="FUNC",
        Name="TestNode",
        Descr="Old description"
    ))
    canvas.dirtyNodes.clear()  # Clear dirty after initial add

    # Update via diff
    diff = """<operations>
## Nodes
- TestNode.FN.001|Old description
+ TestNode.FN.001|Updated description [x:100,y:200]
</operations>"""

    canvas.apply_diff(diff)

    assert canvas.nodes["TestNode.FN.001"].Descr == "Updated description"
    assert canvas.nodes["TestNode.FN.001"].presentation["x"] == 100
    assert "TestNode.FN.001" in canvas.dirtyNodes  # Marked dirty

def test_serialize_to_format_e():
    """Serialize canvas state to Format E"""
    canvas = CanvasState("ws-test", "TestSystem.SY.001")
    canvas.add_node(Node(
        semanticId="TestSystem.SY.001",
        type="SYS",
        Name="TestSystem",
        Descr="Test system"
    ))
    canvas.add_node(Node(
        semanticId="TestFunction.FN.001",
        type="FUNC",
        Name="TestFunction",
        Descr="Test function",
        presentation={"x": 100, "y": 200, "zoom": "L2"}
    ))

    format_e = canvas.serialize_to_format_e(view_context="Hierarchy")

    assert "## View-Context" in format_e
    assert "Type: Hierarchy" in format_e
    assert "TestSystem|SYS|TestSystem.SY.001|Test system" in format_e
    assert "TestFunction|FUNC|TestFunction.FN.001|Test function [x:100,y:200,zoom:L2]" in format_e
```

**Implementation:**
```python
# src/canvas/canvas_state.py

from dataclasses import dataclass, field
from typing import Dict, Set, List
from datetime import datetime
from .format_e_parser import FormatEParser, Node, Edge

@dataclass
class CanvasState:
    workspaceId: str
    systemId: str
    currentView: str = "hierarchy"

    nodes: Dict[str, Node] = field(default_factory=dict)
    edges: Dict[str, Edge] = field(default_factory=dict)
    positions: Dict[str, Dict[str, float]] = field(default_factory=dict)

    dirtyNodes: Set[str] = field(default_factory=set)
    dirtyEdges: Set[str] = field(default_factory=set)
    lastSaveTimestamp: datetime | None = None

    def add_node(self, node: Node) -> None:
        self.nodes[node.semanticId] = node
        self.dirtyNodes.add(node.semanticId)

    def remove_node(self, semantic_id: str) -> None:
        if semantic_id in self.nodes:
            del self.nodes[semantic_id]
            self.dirtyNodes.add(semantic_id)  # Track for deletion

    def apply_diff(self, diff: str) -> "DiffResult":
        parser = FormatEParser()
        operations = parser.parse_diff(diff)

        added_nodes = []
        removed_nodes = []

        # Process node removals
        for node_id in operations.remove_nodes:
            if node_id in self.nodes:
                self.remove_node(node_id)
                removed_nodes.append(node_id)

        # Process node additions/updates
        for node in operations.add_nodes:
            self.add_node(node)
            added_nodes.append(node.semanticId)

        # Process edges similarly...

        return DiffResult(
            success=True,
            added_nodes=added_nodes,
            removed_nodes=removed_nodes,
            # ...
        )

    def serialize_to_format_e(self, view_context: str) -> str:
        lines = []
        lines.append("## View-Context")
        lines.append(f"Type: {view_context}")
        lines.append("")

        lines.append("## Nodes")
        for node in self.nodes.values():
            parts = [node.Name, node.type, node.semanticId]
            if node.Descr:
                parts.append(node.Descr)

            line = "|".join(parts)

            if node.presentation:
                attrs = ",".join(f"{k}:{v}" for k, v in node.presentation.items())
                line += f" [{attrs}]"

            lines.append(line)

        lines.append("")
        lines.append("## Edges")
        # ... serialize edges

        return "\n".join(lines)

    def get_dirty_nodes(self) -> List[Node]:
        return [self.nodes[sid] for sid in self.dirtyNodes if sid in self.nodes]
```

#### 3. Integration Tests (Canvas + Neo4j)

```python
# tests/integration/test_canvas_persistence.py

def test_canvas_persists_dirty_nodes_to_neo4j(neo4j_session):
    """Canvas persists only dirty nodes to Neo4j"""
    canvas = CanvasState("ws-test", "TestSystem.SY.001")

    # Add nodes
    canvas.add_node(Node("TestNode1.FN.001", "FUNC", "TestNode1"))
    canvas.add_node(Node("TestNode2.FN.002", "FUNC", "TestNode2"))

    # Persist
    neo4j_client = Neo4jClient(neo4j_session)
    canvas.persist_to_neo4j(neo4j_client)

    # Verify in Neo4j
    result = neo4j_session.run("""
        MATCH (n {workspaceId: $wid, systemId: $sid})
        RETURN count(n) as count
    """, wid="ws-test", sid="TestSystem.SY.001")

    assert result.single()["count"] == 2

    # Modify only one node
    canvas.dirtyNodes.clear()
    canvas.nodes["TestNode1.FN.001"].Descr = "Updated"
    canvas.dirtyNodes.add("TestNode1.FN.001")

    # Persist again (should only update TestNode1)
    canvas.persist_to_neo4j(neo4j_client)

    # Verify update
    result = neo4j_session.run("""
        MATCH (n {semanticId: $sid})
        RETURN n.Descr as descr
    """, sid="TestNode1.FN.001")

    assert result.single()["descr"] == "Updated"
```

---

## Phase 2: Graph Engine - Layout Algorithms (Week 3)

### Objectives
- Implement Reingold-Tilford (tree layout)
- View filtering (layout vs render graphs)
- Port extraction from FLOW nodes

### Test-First Implementation

#### 1. View Filtering

**Unit Tests:**
```python
# tests/unit/test_view_filter.py

def test_filter_nodes_by_view_config(sample_graph):
    """Filter nodes based on view configuration"""
    view_config = {
        "layoutConfig": {
            "includeNodeTypes": ["SYS", "UC"],
            "includeRelTypes": ["compose"]
        }
    }

    view_filter = ViewFilter(view_config)
    filtered = view_filter.apply_layout_filter(sample_graph)

    # Only SYS and UC nodes included
    assert all(n["type"] in ["SYS", "UC"] for n in filtered["nodes"])

def test_separate_layout_and_render_filters():
    """Layout filter differs from render filter"""
    view_config = {
        "layoutConfig": {
            "includeNodeTypes": ["SYS", "FUNC", "FLOW"],
            "includeRelTypes": ["compose", "io"]
        },
        "renderConfig": {
            "showNodes": ["SYS", "FUNC"],
            "hideNodes": ["FLOW"],  # FLOW used for ports, not rendered
            "showEdges": ["io"],
            "hideEdges": ["compose"]  # Implicit via nesting
        }
    }

    view_filter = ViewFilter(view_config)

    # Layout sees FLOW nodes (for port extraction)
    layout_graph = view_filter.apply_layout_filter(graph)
    assert any(n["type"] == "FLOW" for n in layout_graph["nodes"])

    # Render hides FLOW nodes
    render_graph = view_filter.apply_render_filter(graph)
    assert not any(n["type"] == "FLOW" for n in render_graph["nodes"])
```

#### 2. Port Extraction

**Unit Tests:**
```python
# tests/unit/test_port_extraction.py

def test_extract_input_ports_from_flow_nodes():
    """FLOW --io--> FUNC = input port"""
    graph = {
        "nodes": [
            {"semanticId": "TestFunc.FN.001", "type": "FUNC", "Name": "TestFunc"},
            {"semanticId": "InputData.FL.001", "type": "FLOW", "Name": "InputData"}
        ],
        "edges": [
            {"source": "InputData.FL.001", "target": "TestFunc.FN.001", "type": "io"}
        ]
    }

    port_extractor = PortExtractor()
    ports = port_extractor.extract_ports(graph, "TestFunc.FN.001")

    assert len(ports["inputs"]) == 1
    assert ports["inputs"][0]["id"] == "InputData.FL.001"
    assert ports["inputs"][0]["label"] == "InputData"
    assert ports["inputs"][0]["position"] == "left"

def test_extract_output_ports_from_flow_nodes():
    """FUNC --io--> FLOW = output port"""
    graph = {
        "nodes": [
            {"semanticId": "TestFunc.FN.001", "type": "FUNC", "Name": "TestFunc"},
            {"semanticId": "OutputData.FL.002", "type": "FLOW", "Name": "OutputData"}
        ],
        "edges": [
            {"source": "TestFunc.FN.001", "target": "OutputData.FL.002", "type": "io"}
        ]
    }

    port_extractor = PortExtractor()
    ports = port_extractor.extract_ports(graph, "TestFunc.FN.001")

    assert len(ports["outputs"]) == 1
    assert ports["outputs"][0]["id"] == "OutputData.FL.002"
    assert ports["outputs"][0]["position"] == "right"
```

#### 3. Reingold-Tilford Layout

**Unit Tests:**
```python
# tests/unit/test_reingold_tilford.py

def test_tree_layout_positions_nodes():
    """Reingold-Tilford assigns positions to tree nodes"""
    tree = {
        "nodes": [
            {"semanticId": "Root.SY.001", "type": "SYS"},
            {"semanticId": "Child1.UC.001", "type": "UC"},
            {"semanticId": "Child2.UC.002", "type": "UC"}
        ],
        "edges": [
            {"source": "Root.SY.001", "target": "Child1.UC.001", "type": "compose"},
            {"source": "Root.SY.001", "target": "Child2.UC.002", "type": "compose"}
        ]
    }

    layout = ReingoldTilfordLayout(orientation="top-down")
    result = layout.compute(tree)

    # Root at top
    assert result.positions["Root.SY.001"]["y"] == 0

    # Children on same level
    assert result.positions["Child1.UC.001"]["y"] == result.positions["Child2.UC.002"]["y"]
    assert result.positions["Child1.UC.001"]["y"] > 0  # Below root

    # Children horizontally separated
    assert result.positions["Child1.UC.001"]["x"] != result.positions["Child2.UC.002"]["x"]

def test_tree_layout_minimizes_width():
    """Layout minimizes tree width"""
    # Deep tree with few children per level
    tree = create_deep_tree(depth=5, children_per_level=2)

    layout = ReingoldTilfordLayout()
    result = layout.compute(tree)

    # Width should be proportional to max children at any level
    # not total node count
    assert result.bounds["width"] < 500  # Reasonable width for small tree
```

---

## Phase 3: LLM Engine + AgentDB (Week 4)

### Objectives
- Implement LLM request/response handling
- Integrate Anthropic prompt caching
- Connect AgentDB for persistent caching
- Implement auto-derivation (UC→FUNC)

### Test-First Implementation

#### 1. LLM Request Handler

**Unit Tests (with mocked LLM):**
```python
# tests/unit/test_llm_engine.py

@pytest.fixture
def mock_anthropic_client(mocker):
    """Mock Anthropic API client"""
    mock = mocker.patch('anthropic.Anthropic')
    mock.return_value.messages.create.return_value = MockResponse(
        content="I've added a payment function<operations>+ ProcessPayment|FUNC|...</operations>"
    )
    return mock

def test_llm_receives_canvas_state(mock_anthropic_client):
    """LLM request includes canvas state in prompt"""
    canvas_state = "## Nodes\nTestSystem|SYS|TestSystem.SY.001"
    llm = LLMEngine()

    llm.process_request(
        message="Add payment function",
        canvas_state=canvas_state,
        chatId="chat-123"
    )

    # Verify canvas state was in prompt
    call_args = mock_anthropic_client.return_value.messages.create.call_args
    system_prompts = call_args.kwargs["system"]

    assert any(canvas_state in prompt.get("text", "") for prompt in system_prompts)

def test_llm_uses_prompt_caching(mock_anthropic_client):
    """LLM marks static sections for caching"""
    llm = LLMEngine()
    llm.process_request(
        message="Test",
        canvas_state="## Nodes\n...",
        chatId="chat-123"
    )

    call_args = mock_anthropic_client.return_value.messages.create.call_args
    system_prompts = call_args.kwargs["system"]

    # Check cache_control markers
    cached_sections = [p for p in system_prompts if "cache_control" in p]
    assert len(cached_sections) >= 2  # At least ontology + canvas state cached

def test_llm_extracts_operations_from_response():
    """LLM response parser extracts operations"""
    llm = LLMEngine()
    response_text = """I've added a payment function.

<operations>
<base_snapshot>TestSystem.SY.001@v1</base_snapshot>

## Nodes
+ ProcessPayment|FUNC|ProcessPayment.FN.002|Processes payments
</operations>"""

    result = llm._parse_response(response_text)

    assert "I've added a payment function" in result["text"]
    assert result["operations"] is not None
    assert "+ ProcessPayment|FUNC|ProcessPayment.FN.002" in result["operations"]
```

#### 2. AgentDB Integration

**Unit Tests (with mocked AgentDB):**
```python
# tests/unit/test_agentdb_cache.py

@pytest.fixture
def mock_agentdb(mocker):
    """Mock AgentDB MCP client"""
    mock = mocker.patch('src.llm_engine.agentdb.AgentDBClient')
    return mock.return_value

def test_check_cache_before_llm_call(mock_agentdb, mock_anthropic_client):
    """AgentDB cache checked before calling LLM"""
    # Setup cache hit
    mock_agentdb.cache_lookup.return_value = {
        "hit": True,
        "response": "Cached response",
        "operations": "<operations>...</operations>"
    }

    llm = LLMEngine(agentdb_client=mock_agentdb)
    result = llm.process_request(
        message="Add payment function",
        canvas_state="## Nodes\n...",
        chatId="chat-123"
    )

    # Cache was checked
    assert mock_agentdb.cache_lookup.called

    # LLM was NOT called (cache hit)
    assert not mock_anthropic_client.return_value.messages.create.called

    # Cached result returned
    assert result["text"] == "Cached response"

def test_store_in_cache_after_llm_call(mock_agentdb, mock_anthropic_client):
    """Store LLM response in AgentDB cache"""
    # Setup cache miss
    mock_agentdb.cache_lookup.return_value = {"hit": False}

    llm = LLMEngine(agentdb_client=mock_agentdb)
    llm.process_request(
        message="Add payment function",
        canvas_state="## Nodes\n...",
        chatId="chat-123"
    )

    # Response stored in cache
    assert mock_agentdb.cache_store.called
    call_args = mock_agentdb.cache_store.call_args
    assert "response" in call_args.kwargs
    assert "operations" in call_args.kwargs
```

#### 3. Auto-Derivation (UC → FUNC)

**Unit Tests:**
```python
# tests/unit/test_auto_derivation.py

def test_uc_to_func_derivation():
    """Use case auto-derives functions"""
    canvas_state = """## Nodes
ManageFleet|UC|ManageFleet.UC.001|Manage vehicle fleet operations
"""
    llm = LLMEngine()

    # User: "Decompose ManageFleet use case"
    result = llm.process_request(
        message="Decompose ManageFleet use case into functions",
        canvas_state=canvas_state,
        chatId="chat-123"
    )

    operations = result["operations"]

    # Should suggest functions
    assert "+ " in operations  # New nodes added
    assert "|FUNC|" in operations  # Functions derived
    # Typical functions for fleet management:
    # - TrackVehicleLocations, AssignVehicles, MonitorMaintenance, etc.

def test_req_to_test_derivation():
    """Requirement auto-derives test cases"""
    canvas_state = """## Nodes
SecurityRequirement|REQ|SecurityRequirement.RQ.001|System must validate all inputs
"""
    llm = LLMEngine()

    result = llm.process_request(
        message="Generate tests for SecurityRequirement",
        canvas_state=canvas_state,
        chatId="chat-123"
    )

    operations = result["operations"]

    # Should create TEST nodes
    assert "|TEST|" in operations
    # Should link tests to requirement
    assert "-vf->" in operations  # verify relationship
```

---

## Phase 4: Terminal UI (Week 5)

### Objectives
- Build chat interface (Textual)
- Build graph canvas (Rich/ASCII art)
- WebSocket client for Canvas communication

### Test-First Implementation

#### 1. Chat Interface

**Unit Tests:**
```python
# tests/unit/test_chat_interface.py

async def test_chat_input_sends_message():
    """Typing message sends to Canvas"""
    chat = ChatInterface(canvas_url="ws://localhost:3001")
    mock_ws = MockWebSocket()
    chat._ws = mock_ws

    await chat.send_message("Add payment function")

    # Verify WebSocket message sent
    assert mock_ws.sent_messages[-1]["type"] == "user-message"
    assert mock_ws.sent_messages[-1]["message"] == "Add payment function"

async def test_chat_displays_llm_streaming_response():
    """LLM streaming tokens displayed in real-time"""
    chat = ChatInterface()
    messages = []

    # Simulate streaming chunks
    await chat.on_message({"type": "text", "chunk": "I'll add "})
    messages.append(chat.get_last_message())

    await chat.on_message({"type": "text", "chunk": "a payment "})
    messages.append(chat.get_last_message())

    await chat.on_message({"type": "text", "chunk": "function."})
    messages.append(chat.get_last_message())

    # Messages accumulate
    assert messages[0] == "I'll add "
    assert messages[1] == "I'll add a payment "
    assert messages[2] == "I'll add a payment function."
```

#### 2. Graph Canvas

**Unit Tests:**
```python
# tests/unit/test_graph_canvas.py

def test_render_simple_graph_as_ascii():
    """Render small graph as ASCII art"""
    graph = {
        "positions": {
            "TestSystem.SY.001": {"x": 0, "y": 0},
            "TestFunction.FN.001": {"x": 0, "y": 50}
        },
        "nodes": {
            "TestSystem.SY.001": {"type": "SYS", "Name": "TestSystem"},
            "TestFunction.FN.001": {"type": "FUNC", "Name": "TestFunction"}
        },
        "edges": [
            {"source": "TestSystem.SY.001", "target": "TestFunction.FN.001"}
        ]
    }

    canvas = GraphCanvas()
    ascii_art = canvas.render_ascii(graph)

    # Verify nodes appear
    assert "TestSystem" in ascii_art
    assert "TestFunction" in ascii_art
    # Verify connection (vertical line or arrow)
    assert "|" in ascii_art or "↓" in ascii_art

def test_switch_view_triggers_layout_request():
    """Switching view requests new layout"""
    canvas = GraphCanvas(canvas_url="ws://localhost:3001")
    mock_http = MockHTTPClient()
    canvas._http = mock_http

    canvas.switch_view("functional-flow")

    # Verify layout request sent
    assert mock_http.last_request["url"] == "/api/layout/compute"
    assert mock_http.last_request["data"]["viewId"] == "functional-flow"
```

---

## Phase 5: Integration & E2E (Week 6)

### Objectives
- Full system integration tests
- E2E smoke tests for critical paths
- Performance testing

### E2E Tests

```python
# tests/e2e/test_smoke.py

@pytest.mark.e2e
async def test_create_system_via_llm(running_system):
    """E2E: User creates system via natural language"""
    tui = running_system["tui"]

    # 1. User types message
    await tui.send_message("Create a vehicle system called UrbanMobility")

    # 2. Wait for LLM response
    await tui.wait_for_response(timeout=30)

    # 3. Verify canvas updated
    canvas_state = await tui.get_canvas_state()
    assert "UrbanMobility" in canvas_state
    assert "|SYS|" in canvas_state

    # 4. Verify graph rendered
    graph_display = tui.get_graph_display()
    assert "UrbanMobility" in graph_display

@pytest.mark.e2e
async def test_switch_views(running_system):
    """E2E: User switches between views"""
    tui = running_system["tui"]

    # Setup: Create some nodes
    await tui.send_message("Create system TestSystem with function TestFunc")
    await tui.wait_for_response(timeout=30)

    # Switch to functional flow view
    await tui.switch_view("functional-flow")
    await tui.wait_for_layout(timeout=5)

    # Verify layout changed
    graph1 = tui.get_graph_display()

    # Switch to hierarchy view
    await tui.switch_view("hierarchy")
    await tui.wait_for_layout(timeout=5)

    graph2 = tui.get_graph_display()

    # Layouts differ
    assert graph1 != graph2

@pytest.mark.e2e
async def test_persistence_after_restart(running_system):
    """E2E: Data persists after system restart"""
    tui = running_system["tui"]

    # 1. Create node
    await tui.send_message("Create system PersistenceTest")
    await tui.wait_for_response(timeout=30)

    # 2. Save
    await tui.send_command("/save")
    await tui.wait_for_confirmation()

    # 3. Restart system
    await running_system["canvas"].stop()
    await running_system["canvas"].start()
    await tui.reconnect()

    # 4. Load same workspace+system
    canvas_state = await tui.get_canvas_state()

    # 5. Verify node still exists
    assert "PersistenceTest" in canvas_state
```

---

## Testing Strategy Summary

### Unit Tests (70%)

**Coverage Target**: ≥80% of code

**What to Test**:
- Format E parsing (valid/invalid syntax)
- Canvas state management (add/remove/update nodes)
- Diff application (add/remove/modify operations)
- View filtering (layout vs render)
- Port extraction (FLOW → ports)
- Layout algorithms (positions, bounds)
- LLM request handling (prompt construction, caching)
- AgentDB caching (hit/miss scenarios)
- Auto-derivation logic (UC→FUNC, REQ→TEST)

**Mocking Strategy**:
- Mock external APIs (Anthropic, AgentDB)
- Mock Neo4j (use in-memory graph)
- No real I/O in unit tests

### Integration Tests (20%)

**Coverage Target**: ≥60% of API endpoints and database operations

**What to Test**:
- Canvas ↔ Neo4j persistence
- LLM Engine ↔ AgentDB communication
- Graph Engine REST API
- WebSocket message contracts
- Multi-user canvas sync

**Test Containers**:
- Neo4j (testcontainers)
- Redis (if used for Canvas session store)

### E2E Tests (10%)

**Coverage Target**: 5-10 critical user journeys, 100% pass rate

**What to Test**:
- Create system via LLM
- Switch views
- Multi-user concurrent edit
- Persistence after restart
- Performance (layout <2s for 500 nodes)

**Environment**: Full system running (all components)

---

## Continuous Integration Pipeline

```yaml
# .github/workflows/ci.yml
name: GraphEngine CI

on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
        with:
          python-version: '3.11'
      - run: pip install -e .[dev]
      - run: pytest tests/unit/ --cov=src --cov-report=xml
      - name: Check coverage
        run: |
          COVERAGE=$(coverage report | grep TOTAL | awk '{print $4}' | sed 's/%//')
          if [ "$COVERAGE" -lt 80 ]; then
            echo "Coverage $COVERAGE% < 80%"
            exit 1
          fi

  integration-tests:
    needs: unit-tests
    runs-on: ubuntu-latest
    services:
      neo4j:
        image: neo4j:5
        env:
          NEO4J_AUTH: neo4j/testpassword
        ports:
          - 7687:7687
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
      - run: pip install -e .[dev]
      - run: pytest tests/integration/
        env:
          NEO4J_URI: bolt://localhost:7687
          NEO4J_PASSWORD: testpassword

  e2e-tests:
    needs: integration-tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-python@v4
      - run: pip install -e .[dev]
      - run: pytest tests/e2e/ --timeout=60
      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: e2e-logs
          path: tests/e2e/logs/
```

---

## Definition of Done (Each Phase)

**Code Complete When**:
1. ✅ All unit tests written BEFORE implementation
2. ✅ All unit tests pass (≥80% coverage)
3. ✅ All integration tests pass (≥60% coverage)
4. ✅ E2E smoke tests pass (100% for implemented features)
5. ✅ Contract validation tests pass (0 violations)
6. ✅ No test isolation failures
7. ✅ Code reviewed (peer or self if solo)
8. ✅ Documentation updated (if public API changed)

**Phase Complete When**:
1. All tasks in phase have "Code Complete" status
2. CI/CD pipeline green
3. Demo successful (show working features to stakeholder)

---

## Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Layout algorithms too complex | Medium | High | Use ELK.js as fallback, simplify custom algorithms |
| LLM hallucinations create invalid graphs | High | High | Strong validation, rollback on error, user confirmation for large changes |
| Neo4j performance issues at scale | Low | Medium | Index optimization, query profiling, consider graph partitioning |
| AgentDB integration delays | Medium | Medium | Implement basic file-based cache as fallback |
| Terminal UI rendering limitations | Medium | Low | Offer web UI as post-MVP alternative |

---

**End of Test-Driven Implementation Plan**
