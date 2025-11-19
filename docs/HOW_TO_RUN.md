# How to Run GraphEngine - Interactive Guide

**All systems operational!** Here's how to see everything in action.

---

## 🚀 Quick Start

### 1. Run All Tests (72 passing)
```bash
npm test
```

**Expected Output:**
```
✓ tests/unit/canvas/canvas-base.test.ts (10 tests)
✓ tests/unit/parsers/format-e-parser.test.ts (17 tests)
✓ tests/unit/canvas/graph-canvas.test.ts (19 tests)
✓ tests/unit/canvas/chat-canvas.test.ts (26 tests)

Test Files  4 passed (4)
Tests  72 passed (72)
Duration  ~180ms
```

### 2. Run Interactive Demo
```bash
node --import tsx demo.ts
```

**Shows:**
- ✅ System hierarchy creation (5 nodes, 4 edges)
- ✅ User/LLM conversation simulation
- ✅ Format E serialization (77% token reduction!)
- ✅ Dirty tracking & persistence
- ✅ Chat history management
- ✅ View switching (Hierarchy → Functional → Requirements)
- ✅ Graph querying & statistics

### 3. Run Visual ASCII Renderer
```bash
node --import tsx visualize.ts
```

**Shows:**
- 📊 Hierarchy tree (system decomposition)
- 🔗 Requirements traceability diagram
- 🏗️  Allocation view (function → module)
- 📈 Statistics & breakdowns
- 💾 Format E representation

---

## 🧪 Test-Specific Commands

### Run Specific Test Suite
```bash
# Canvas Base tests (10 tests)
npm test -- tests/unit/canvas/canvas-base.test.ts

# Format E Parser tests (17 tests)
npm test -- tests/unit/parsers/format-e-parser.test.ts

# Graph Canvas tests (19 tests)
npm test -- tests/unit/canvas/graph-canvas.test.ts

# Chat Canvas tests (26 tests)
npm test -- tests/unit/canvas/chat-canvas.test.ts
```

### Run with Coverage Report
```bash
npm run test:coverage

# Then open HTML report
open coverage/index.html
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

Edit any test file and see it automatically re-run!

---

## 📊 Build & Verify

### TypeScript Compilation
```bash
npm run build
```

Should show: `0 errors` ✅

### Full Validation Pipeline
```bash
npm run validate
```

Runs: `lint → test → build`

---

## 🎨 Interactive Examples

### Example 1: Create a Graph Manually
```typescript
import { GraphCanvas } from './src/canvas/graph-canvas.js';
import { FormatEParser } from './src/shared/parsers/format-e-parser.js';

const parser = new FormatEParser();
const canvas = new GraphCanvas('ws-001', 'MySystem.SY.001', 'chat-001', 'user-001');

// Add nodes via diff
const diff = `<operations>
<base_snapshot>MySystem.SY.001@v1</base_snapshot>

## Nodes
+ MySystem|SYS|MySystem.SY.001|My test system
+ MyFunction|FUNC|MyFunction.FN.001|My test function

## Edges
+ MySystem.SY.001 -cp-> MyFunction.FN.001
</operations>`;

await canvas.applyDiff(parser.parseDiff(diff));

// Query the graph
console.log(`Nodes: ${canvas.getState().nodes.size}`);
console.log(`Edges: ${canvas.getState().edges.size}`);
```

### Example 2: Simulate User Conversation
```typescript
import { ChatCanvas } from './src/canvas/chat-canvas.js';
import { GraphCanvas } from './src/canvas/graph-canvas.js';

const graphCanvas = new GraphCanvas('ws', 'System.SY.001', 'chat', 'user');
const chatCanvas = new ChatCanvas('ws', 'System.SY.001', 'chat', 'user', graphCanvas);

// User message
await chatCanvas.addUserMessage('Add a validation function');

// LLM response (with operations)
const ops = `<operations>
<base_snapshot>System.SY.001@v1</base_snapshot>
## Nodes
+ Validate|FUNC|Validate.FN.001|Validate input
</operations>`;

await chatCanvas.addAssistantMessage('I added a Validate function', ops);

// Check results
console.log(`Messages: ${chatCanvas.getAllMessages().length}`);
console.log(`Graph nodes: ${graphCanvas.getState().nodes.size}`);
```

### Example 3: Test Format E Efficiency
```typescript
import { FormatEParser } from './src/shared/parsers/format-e-parser.js';
import { createSampleGraph } from './tests/setup.js';

const parser = new FormatEParser();
const graph = createSampleGraph();

// Create state
const state = {
  workspaceId: graph.workspaceId,
  systemId: graph.systemId,
  nodes: new Map(graph.nodes.map(n => [n.semanticId, /* node object */])),
  edges: new Map(),
  ports: new Map(),
  version: 1,
  lastSavedVersion: 1,
  lastModified: new Date()
};

// Serialize
const formatE = parser.serializeGraph(state);
const json = JSON.stringify(state);

console.log(`Format E: ${formatE.length} chars`);
console.log(`JSON: ${json.length} chars`);
console.log(`Savings: ${((json.length - formatE.length) / json.length * 100).toFixed(1)}%`);
```

---

## 📁 Project Files to Explore

### Core Implementation
```
src/canvas/
  ├── canvas-base.ts       - Abstract base class
  ├── graph-canvas.ts      - Graph state manager
  └── chat-canvas.ts       - Chat state manager

src/shared/parsers/
  └── format-e-parser.ts   - Serialization engine

src/shared/types/
  ├── ontology.ts          - Domain types (10 node types, 6 edge types)
  ├── canvas.ts            - Canvas state types
  └── format-e.ts          - Format E interfaces
```

### Tests
```
tests/unit/
  ├── canvas/
  │   ├── canvas-base.test.ts       (10 tests)
  │   ├── graph-canvas.test.ts      (19 tests)
  │   └── chat-canvas.test.ts       (26 tests)
  └── parsers/
      └── format-e-parser.test.ts   (17 tests)
```

### Documentation
```
docs/
  ├── README.md              - Project overview
  ├── requirements.md        - Functional requirements (506 lines)
  ├── ARCHITECTURE.md        - System architecture
  ├── implan.md              - Implementation plan (6 weeks)
  └── TESTING_STRATEGY.md    - Testing philosophy

QUICKSTART.md              - Getting started
PHASE1_COMPLETE.md         - Phase 1 completion report
HOW_TO_RUN.md             - This file
```

---

## 🎯 What Each Demo Shows

### `demo.ts` - Full System Demo
**Shows:** Complete workflow from system creation to persistence

**Highlights:**
- Creates 7 nodes (SYS, UC, FCHAIN, FUNC, REQ, TEST)
- 6 edges (compose, satisfy, verify)
- User/LLM conversation
- Format E serialization (77% reduction)
- Dirty tracking
- Chat history
- View switching

### `visualize.ts` - ASCII Visualization
**Shows:** Graph structure as ASCII art diagrams

**Highlights:**
- Hierarchy tree diagram
- Requirements traceability diagram
- Allocation diagram
- Statistics tables
- Format E sample output

### `npm test` - Test Suite
**Shows:** All 72 tests passing

**Coverage:**
- Unit tests (70%): Canvas, Parser
- Integration tests (20%): Component interaction
- Edge cases: Validation, error handling

---

## 💡 Tips for Exploration

### 1. Modify the Demo
Edit `demo.ts` to:
- Add more nodes/edges
- Change node types
- Test different views
- Experiment with validation

### 2. Create Your Own Graph
```bash
# Copy the demo
cp demo.ts my-graph.ts

# Edit to create your own system
# Run it
node --import tsx my-graph.ts
```

### 3. Inspect Test Files
Tests show **exactly** how to use each component:
```bash
# Read a test file
cat tests/unit/canvas/graph-canvas.test.ts

# Pick a test and run just that one
npm test -- -t "should add node via diff"
```

### 4. Check Coverage
```bash
npm run test:coverage
open coverage/index.html
```

Navigate through files to see exactly what's tested.

---

## 🏆 Expected Results

When everything works, you should see:

✅ **All tests passing** (72/72)
✅ **Fast execution** (~180ms)
✅ **0 TypeScript errors**
✅ **Clean console output** (no unexpected errors)
✅ **Demo runs successfully** (shows all 8 steps)
✅ **Visualization renders** (ASCII diagrams display)

---

## 🐛 Troubleshooting

### Tests Fail
```bash
# Clean and reinstall
rm -rf node_modules
npm install

# Run tests again
npm test
```

### Build Errors
```bash
# Check TypeScript version
npx tsc --version  # Should be 5.7+

# Rebuild
npm run build
```

### Demo Won't Run
```bash
# Make sure tsx is available
npm install -g tsx

# Or use node directly
node --import tsx demo.ts
```

---

## 📚 Next Steps

1. **Run the demos** - See it in action
2. **Read the tests** - Learn by example
3. **Modify & experiment** - Break things safely
4. **Check coverage** - See what's tested
5. **Read PHASE1_COMPLETE.md** - Detailed technical docs

---

**Ready to explore!** Start with:
```bash
npm test && node --import tsx demo.ts && node --import tsx visualize.ts
```

This runs all three main demonstrations in sequence! 🚀
