# AiSE Reloaded - Terminal UI Konzept

## Vision: 4-Panel Terminal Interface

```
┌─────────────────────────────────────┬─────────────────────────────────────┐
│ 1. LLM CHAT                         │ 2. TEXT CANVAS                      │
│                                     │                                     │
│ > User: Create order system         │ ## System: OrderSystem              │
│                                     │                                     │
│ AI: I'll create an order system.    │ ### Use Cases                       │
│ Let me derive the main functions... │   - PlaceOrder                      │
│                                     │   - CancelOrder                     │
│ <operations>                        │                                     │
│ + UC PlaceOrder | Customer places   │ ### Functions                       │
│ + FUNC ValidateOrder | Validates... │   PlaceOrder/                       │
│ </operations>                       │     ├─ ValidateOrder                │
│                                     │     ├─ ProcessPayment               │
│ What should the order contain?      │     └─ ShipOrder                    │
│                                     │                                     │
│ > _                                 │ ### Requirements                    │
│                                     │   - OrderValidation                 │
├─────────────────────────────────────┼─────────────────────────────────────┤
│ 3. GRAPH CANVAS (ASCII)             │ 4. SYSTEM LOG                       │
│                                     │                                     │
│ OrderSystem (SYS)                   │ [14:23:45] ✓ Node created: UC-001   │
│  │                                  │ [14:23:45] ✓ Node created: FUNC-001 │
│  ├─[cp]─> PlaceOrder (UC)           │ [14:23:45] ✓ Edge created: compose  │
│  │        │                         │ [14:23:46] ⚡ LLM response: 245ms   │
│  │        ├─[cp]─> ValidateOrder    │ [14:23:46] 💰 Cache hit: 2,100 tok  │
│  │        │        (FUNC)           │ [14:23:46] ✓ SemanticID resolved    │
│  │        │        │                │ [14:23:47] ⚠ Validation: PascalCase │
│  │        │        └─[satisfy]─>    │ [14:23:47] ✓ Pattern stored (RB)    │
│  │        │          OrderValidation│                                     │
│  │        │          (REQ)          │ Status: ████████░░ 80% complete     │
│  │        │                         │ Nodes: 12 | Edges: 18 | Tokens: 1.2K│
│  │        ├─[cp]─> ProcessPayment   │                                     │
│  │        │        (FUNC)           │ Press 'h' for help                  │
│  │        │                         │                                     │
│  │        └─[cp]─> ShipOrder (FUNC) │                                     │
│                                     │                                     │
└─────────────────────────────────────┴─────────────────────────────────────┘
                    [Ctrl+C] Quit | [Tab] Switch Panel
```

---

## Panel 1: LLM Chat Terminal

### Features
- **Interaktiver Chat** mit AI Assistant
- **Streaming Responses** (zeigt Tokens während sie ankommen)
- **Operations Preview** (farbig hervorgehoben)
- **Konversations-Historie** (scroll up/down)

### Implementation
```typescript
// CLI Framework: blessed oder ink (React für Terminal)
import blessed from 'blessed';

class LLMChatPanel {
  private box: blessed.Widgets.BoxElement;
  private input: blessed.Widgets.TextboxElement;
  private messages: Message[] = [];

  render() {
    // Chat history
    this.box.setContent(this.formatMessages());

    // User input at bottom
    this.input.focus();
  }

  private formatMessages(): string {
    return this.messages.map(msg => {
      if (msg.role === 'user') {
        return `{blue-fg}> ${msg.content}{/blue-fg}`;
      } else {
        // Parse operations and highlight
        const highlighted = this.highlightOperations(msg.content);
        return `{green-fg}AI:{/green-fg} ${highlighted}`;
      }
    }).join('\n\n');
  }

  private highlightOperations(text: string): string {
    // Highlight <operations>...</operations> in yellow
    return text.replace(
      /<operations>([\s\S]*?)<\/operations>/g,
      '{yellow-fg}<operations>$1</operations>{/yellow-fg}'
    );
  }
}
```

---

## Panel 2: Text Canvas (Markdown Tree)

### Darstellung
```
## System: OrderManagement

### Actors
  👤 Customer      - External user placing orders
  👤 Administrator - System admin managing orders

### Use Cases
  🎯 PlaceOrder     - Customer places order (Status: ✓ Complete)
  🎯 CancelOrder    - Customer cancels order (Status: ⚠ Draft)

### Functions (Hierarchical)
  PlaceOrder/
    ├─ 🔧 ValidateOrder      - Validates order data
    │  └─ ✅ OrderValidation - Must validate within 2s
    ├─ 🔧 CheckInventory     - Checks product availability
    ├─ 🔧 ProcessPayment     - Processes payment
    │  └─ ✅ PaymentSecurity - Must use encryption
    └─ 🔧 ShipOrder          - Ships order to customer

### Requirements
  ✅ OrderValidation  - Orders must be validated within 2 seconds
  ✅ PaymentSecurity  - All payments must use encrypted channels
  ✅ InventorySync    - Inventory must update in real-time

### Data Flows
  🌊 OrderData       - Customer → ValidateOrder
  🌊 PaymentInfo     - ProcessPayment → PaymentGateway
```

### Farben nach Typ
- **SYS** (System): Cyan
- **ACTOR**: Blue
- **UC** (Use Case): Green
- **FUNC** (Function): Yellow
- **REQ** (Requirement): Red
- **TEST**: Magenta
- **FLOW**: Blue (bright)

### Implementation
```typescript
class TextCanvasPanel {
  private nodes: OntologyNode[];
  private relationships: OntologyRelationship[];

  render(): string {
    const tree = this.buildHierarchicalTree();
    return this.formatAsMarkdown(tree);
  }

  private buildHierarchicalTree(): TreeNode {
    // 1. Find root (SYS nodes)
    const roots = this.nodes.filter(n => n.type === 'SYS');

    // 2. Build tree via compose relationships
    return roots.map(root => this.buildSubtree(root));
  }

  private buildSubtree(node: OntologyNode, depth: number = 0): string {
    const indent = '  '.repeat(depth);
    const icon = this.getIcon(node.type);
    const color = this.getColor(node.type);

    let output = `${indent}${icon} {${color}-fg}${node.Name}{/${color}-fg}`;

    // Add description if available
    if (node.Descr) {
      output += ` - ${node.Descr}`;
    }

    // Find children via compose relationships
    const children = this.getChildren(node.uuid);

    if (children.length > 0) {
      output += '/\n';
      children.forEach((child, i) => {
        const isLast = i === children.length - 1;
        const prefix = isLast ? '└─ ' : '├─ ';
        output += `${indent}${prefix}${this.buildSubtree(child, depth + 1)}`;
      });
    }

    return output;
  }

  private getIcon(type: NodeType): string {
    const icons = {
      SYS: '🏢',
      ACTOR: '👤',
      UC: '🎯',
      FUNC: '🔧',
      REQ: '✅',
      TEST: '🧪',
      FLOW: '🌊',
      MOD: '📦'
    };
    return icons[type] || '•';
  }
}
```

---

## Panel 3: Graph Canvas (ASCII Art)

### Version 1: Einfache Liste (Einstieg)

```
## Nodes (12)

🏢 OrderSystem            SYS    Order management system
🎯 PlaceOrder             UC     Customer places order
🔧 ValidateOrder          FUNC   Validates order data
🔧 CheckInventory         FUNC   Checks stock availability
🔧 ProcessPayment         FUNC   Processes payment
🔧 ShipOrder              FUNC   Ships order to customer
✅ OrderValidation        REQ    Validate within 2 seconds
✅ PaymentSecurity        REQ    Must use encryption
🌊 OrderData              FLOW   Customer order data
🌊 PaymentInfo            FLOW   Payment information

## Edges (18)

OrderSystem     -cp->  PlaceOrder         (compose)
PlaceOrder      -cp->  ValidateOrder      (compose)
PlaceOrder      -cp->  CheckInventory     (compose)
PlaceOrder      -cp->  ProcessPayment     (compose)
PlaceOrder      -cp->  ShipOrder          (compose)
ValidateOrder   -sat-> OrderValidation    (satisfy)
ProcessPayment  -sat-> PaymentSecurity    (satisfy)
Customer        -io->  OrderData          (input/output)
OrderData       -io->  ValidateOrder      (input/output)
```

**Farben**:
- Node-Typ in Farbe (wie oben)
- Relationship-Typ farbig:
  - `compose` → Gray
  - `satisfy` → Green
  - `verify` → Blue
  - `io` → Cyan

### Version 2: ASCII Tree (Hierarchie)

```
🏢 OrderSystem
 │
 ├─[compose]──> 🎯 PlaceOrder
 │               │
 │               ├─[compose]──> 🔧 ValidateOrder
 │               │               │
 │               │               └─[satisfy]──> ✅ OrderValidation
 │               │
 │               ├─[compose]──> 🔧 CheckInventory
 │               │
 │               ├─[compose]──> 🔧 ProcessPayment
 │               │               │
 │               │               └─[satisfy]──> ✅ PaymentSecurity
 │               │
 │               └─[compose]──> 🔧 ShipOrder
 │
 └─[compose]──> 🎯 CancelOrder
                 │
                 └─[compose]──> 🔧 CancelPayment
```

**Mit Einrückung**:
- Ebene 0: SYS (keine Einrückung)
- Ebene 1: UC (1 Tab)
- Ebene 2: FUNC (2 Tabs)
- Ebene 3: REQ (3 Tabs)

### Version 3: Box-Drawing Characters (Advanced)

```
┌─ OrderSystem (SYS) ───────────────────────────────────────┐
│                                                            │
│  ┌─ PlaceOrder (UC) ──────────────────────────────────┐   │
│  │                                                     │   │
│  │  ┌─ ValidateOrder (FUNC) ─────────────────────┐    │   │
│  │  │  └──> OrderValidation (REQ)                │    │   │
│  │  └────────────────────────────────────────────┘    │   │
│  │                                                     │   │
│  │  ┌─ CheckInventory (FUNC) ─────────────────────┐   │   │
│  │  └────────────────────────────────────────────┘   │   │
│  │                                                     │   │
│  │  ┌─ ProcessPayment (FUNC) ─────────────────────┐   │   │
│  │  │  └──> PaymentSecurity (REQ)                 │   │   │
│  │  └────────────────────────────────────────────┘   │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────┘   │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Implementation

```typescript
class GraphCanvasPanel {
  private nodes: OntologyNode[];
  private edges: OntologyRelationship[];
  private renderMode: 'list' | 'tree' | 'boxes' = 'tree';

  render(): string {
    switch (this.renderMode) {
      case 'list':
        return this.renderAsList();
      case 'tree':
        return this.renderAsTree();
      case 'boxes':
        return this.renderAsBoxes();
    }
  }

  private renderAsTree(): string {
    const roots = this.nodes.filter(n => n.type === 'SYS');
    return roots.map(root => this.renderNodeTree(root, 0)).join('\n\n');
  }

  private renderNodeTree(node: OntologyNode, depth: number): string {
    const indent = ' │ '.repeat(depth);
    const icon = this.getIcon(node.type);
    const color = this.getColor(node.type);

    let output = `${indent}{${color}-fg}${icon} ${node.Name}{/${color}-fg}`;

    // Get outgoing relationships
    const outgoing = this.edges.filter(e => e.source === node.uuid);

    outgoing.forEach((edge, i) => {
      const isLast = i === outgoing.length - 1;
      const branch = isLast ? ' └─' : ' ├─';
      const relColor = this.getRelColor(edge.type);

      const target = this.nodes.find(n => n.uuid === edge.target);
      if (!target) return;

      output += `\n${indent}${branch}{${relColor}-fg}[${edge.type}]{/${relColor}-fg}──> `;

      // Recursively render target
      if (edge.type === 'compose') {
        output += this.renderNodeTree(target, depth + 1);
      } else {
        // For non-compose, just show the target inline
        const targetIcon = this.getIcon(target.type);
        const targetColor = this.getColor(target.type);
        output += `{${targetColor}-fg}${targetIcon} ${target.Name}{/${targetColor}-fg}`;
      }
    });

    return output;
  }

  private getRelColor(relType: RelationshipType): string {
    const colors = {
      compose: 'gray',
      satisfy: 'green',
      verify: 'blue',
      io: 'cyan',
      allocate: 'yellow',
      relation: 'white'
    };
    return colors[relType] || 'white';
  }
}
```

---

## Panel 4: System Log (Stdout)

### Features
- **Real-time Logs** (scrolling)
- **Log Levels** (farbig):
  - ERROR → Red
  - WARN → Yellow
  - INFO → White
  - DEBUG → Gray
  - SUCCESS → Green
- **Kategorien**:
  - LLM (AI responses)
  - CACHE (prompt caching)
  - DB (Neo4j operations)
  - VALIDATION (ontology rules)
  - AGENTDB (semantic search)
  - REASONINGBANK (pattern storage)

### Darstellung
```
[14:23:45.123] ✓ INFO   | LLM      | Chat request received
[14:23:45.125] ⚡ DEBUG  | CACHE    | Checking prompt cache...
[14:23:45.127] 💰 INFO   | CACHE    | Cache HIT: 2,100 tokens (88.7% saved)
[14:23:45.456] ⚡ INFO   | LLM      | Response: 245ms, 156 tokens
[14:23:45.458] 🔍 DEBUG  | PARSE    | Extracting operations from response
[14:23:45.460] ✓ INFO   | PARSE    | Found 3 operations (2 nodes, 1 edge)
[14:23:45.462] 🔧 DEBUG  | SEMANTIC | Resolving: ValidateOrder.FN.001
[14:23:45.465] ✓ INFO   | SEMANTIC | Resolved: temp-validate → UUID-abc123
[14:23:45.467] 💾 INFO   | NEO4J    | Creating node: FUNC ValidateOrder
[14:23:45.489] ✓ INFO   | NEO4J    | Node created: UUID-abc123 (22ms)
[14:23:45.491] 🔍 INFO   | AGENTDB  | Indexing node for semantic search
[14:23:45.495] ✓ INFO   | AGENTDB  | Indexed: ValidateOrder (4ms)
[14:23:45.497] ⚠ WARN   | VALID    | Name validation: Should be PascalCase
[14:23:45.500] 🧠 INFO   | RB       | Storing derivation pattern
[14:23:45.503] ✓ INFO   | RB       | Pattern stored: uc-to-func (3ms)
[14:23:45.505] 📊 INFO   | STATS    | Nodes: 12 | Edges: 18 | Tokens: 1.2K

════════════════════════════════════════════════════════════
Status: ████████░░ 80% complete | Memory: 45MB | Uptime: 2h
════════════════════════════════════════════════════════════
```

### Implementation
```typescript
class SystemLogPanel {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;

  addLog(level: LogLevel, category: string, message: string) {
    const timestamp = new Date().toISOString().split('T')[1];
    const icon = this.getIcon(level);
    const color = this.getColor(level);

    this.logs.push({
      timestamp,
      level,
      category,
      message,
      formatted: `[${timestamp}] ${icon} {${color}-fg}${level.padEnd(6)}{/${color}-fg} | ${category.padEnd(8)} | ${message}`
    });

    // Keep only last N logs
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    this.render();
  }

  private getIcon(level: LogLevel): string {
    const icons = {
      ERROR: '❌',
      WARN: '⚠',
      INFO: '✓',
      DEBUG: '⚡',
      SUCCESS: '💚'
    };
    return icons[level] || 'ℹ';
  }

  render(): string {
    return this.logs.map(l => l.formatted).join('\n');
  }
}
```

---

## Technologie-Stack

### CLI Framework
```json
{
  "dependencies": {
    "blessed": "^0.1.81",           // Terminal UI framework
    "blessed-contrib": "^4.11.0",   // Widgets (graphs, tables)
    "chalk": "^5.3.0",              // Color support
    "cli-spinners": "^2.9.2",       // Loading animations
    "ora": "^7.0.1",                // Elegant spinner
    "boxen": "^7.1.1",              // Box drawing
    "terminal-kit": "^3.0.1"        // Advanced terminal features
  }
}
```

### Alternative: React für Terminal
```json
{
  "dependencies": {
    "ink": "^4.4.1",                // React for CLIs
    "ink-text-input": "^5.0.1",    // Input component
    "ink-select-input": "^5.0.0",  // Select component
    "ink-spinner": "^5.0.0",       // Spinner component
    "ink-box": "^3.0.0"            // Box component
  }
}
```

---

## Hauptprogramm

```typescript
// src/cli/aise-terminal.ts

import blessed from 'blessed';
import { LLMChatPanel } from './panels/llm-chat';
import { TextCanvasPanel } from './panels/text-canvas';
import { GraphCanvasPanel } from './panels/graph-canvas';
import { SystemLogPanel } from './panels/system-log';
import { WebSocketClient } from './websocket-client';

class AiSETerminal {
  private screen: blessed.Widgets.Screen;
  private panels: {
    chat: LLMChatPanel;
    text: TextCanvasPanel;
    graph: GraphCanvasPanel;
    log: SystemLogPanel;
  };
  private ws: WebSocketClient;
  private activePanel: number = 0;

  constructor() {
    this.initScreen();
    this.initPanels();
    this.initWebSocket();
    this.initKeyBindings();
  }

  private initScreen() {
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'AiSE Reloaded - Terminal UI',
      fullUnicode: true
    });
  }

  private initPanels() {
    // Panel 1: LLM Chat (top-left)
    const chatBox = blessed.box({
      parent: this.screen,
      top: 0,
      left: 0,
      width: '50%',
      height: '50%',
      label: ' 🤖 LLM Chat ',
      border: { type: 'line' },
      style: {
        border: { fg: 'cyan' }
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: true
    });

    // Panel 2: Text Canvas (top-right)
    const textBox = blessed.box({
      parent: this.screen,
      top: 0,
      left: '50%',
      width: '50%',
      height: '50%',
      label: ' 📄 Text Canvas ',
      border: { type: 'line' },
      style: {
        border: { fg: 'green' }
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: true
    });

    // Panel 3: Graph Canvas (bottom-left)
    const graphBox = blessed.box({
      parent: this.screen,
      top: '50%',
      left: 0,
      width: '50%',
      height: '50%',
      label: ' 🌳 Graph Canvas ',
      border: { type: 'line' },
      style: {
        border: { fg: 'yellow' }
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: true
    });

    // Panel 4: System Log (bottom-right)
    const logBox = blessed.box({
      parent: this.screen,
      top: '50%',
      left: '50%',
      width: '50%',
      height: '50%',
      label: ' 📊 System Log ',
      border: { type: 'line' },
      style: {
        border: { fg: 'magenta' }
      },
      scrollable: true,
      alwaysScroll: true,
      mouse: true
    });

    this.panels = {
      chat: new LLMChatPanel(chatBox),
      text: new TextCanvasPanel(textBox),
      graph: new GraphCanvasPanel(graphBox),
      log: new SystemLogPanel(logBox)
    };
  }

  private initWebSocket() {
    this.ws = new WebSocketClient('ws://localhost:3001');

    // Listen for LLM responses
    this.ws.on('ai-response-chunk', (chunk) => {
      this.panels.chat.addChunk(chunk);
      this.panels.log.addLog('INFO', 'LLM', `Token received: ${chunk.length} chars`);
    });

    // Listen for graph updates
    this.ws.on('graph-update', (update) => {
      this.panels.graph.updateGraph(update.nodes, update.edges);
      this.panels.text.updateGraph(update.nodes, update.edges);
      this.panels.log.addLog('SUCCESS', 'GRAPH', `Updated: ${update.nodes.length} nodes, ${update.edges.length} edges`);
    });

    // Listen for validation warnings
    this.ws.on('validation-warning', (warning) => {
      this.panels.log.addLog('WARN', 'VALID', warning.message);
    });
  }

  private initKeyBindings() {
    // Quit
    this.screen.key(['C-c', 'q'], () => {
      return process.exit(0);
    });

    // Switch panels with Tab
    this.screen.key(['tab'], () => {
      this.activePanel = (this.activePanel + 1) % 4;
      this.focusActivePanel();
    });

    // Switch to specific panel
    this.screen.key(['1'], () => this.focusPanel(0));
    this.screen.key(['2'], () => this.focusPanel(1));
    this.screen.key(['3'], () => this.focusPanel(2));
    this.screen.key(['4'], () => this.focusPanel(3));

    // Graph canvas mode switching
    this.screen.key(['m'], () => {
      this.panels.graph.cycleMode();
      this.panels.log.addLog('INFO', 'UI', `Graph mode: ${this.panels.graph.mode}`);
    });

    // Refresh
    this.screen.key(['r'], () => {
      this.refresh();
    });

    // Help
    this.screen.key(['h', '?'], () => {
      this.showHelp();
    });
  }

  private focusPanel(index: number) {
    this.activePanel = index;
    this.focusActivePanel();
  }

  private focusActivePanel() {
    const panels = [
      this.panels.chat.box,
      this.panels.text.box,
      this.panels.graph.box,
      this.panels.log.box
    ];

    panels.forEach((panel, i) => {
      panel.style.border.fg = i === this.activePanel ? 'white' : 'gray';
    });

    panels[this.activePanel].focus();
    this.screen.render();
  }

  private showHelp() {
    const helpText = `
╔═══════════════════════════════════════════════════════════╗
║              AiSE Reloaded - Terminal UI                  ║
║                    Keyboard Shortcuts                     ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  Navigation:                                              ║
║    Tab         - Switch between panels                    ║
║    1/2/3/4     - Jump to specific panel                   ║
║    ↑/↓         - Scroll active panel                      ║
║                                                           ║
║  Graph Canvas:                                            ║
║    m           - Cycle graph mode (list/tree/boxes)       ║
║    +/-         - Zoom in/out (box mode)                   ║
║                                                           ║
║  General:                                                 ║
║    r           - Refresh all panels                       ║
║    h or ?      - Show this help                           ║
║    Ctrl+C / q  - Quit                                     ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

Press any key to close...
    `;

    const helpBox = blessed.message({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '80%',
      height: '80%',
      label: ' Help ',
      border: { type: 'line' },
      style: {
        border: { fg: 'white' },
        bg: 'black'
      }
    });

    helpBox.display(helpText, 0, () => {
      this.screen.render();
    });
  }

  start() {
    this.panels.log.addLog('SUCCESS', 'SYSTEM', 'AiSE Terminal UI started');
    this.screen.render();
  }
}

// Start the terminal UI
const terminal = new AiSETerminal();
terminal.start();
```

---

## Kreative Erweiterungen

### 1. Vim-Mode Navigation
```typescript
// Vim-style navigation
screen.key(['j'], () => scrollDown());
screen.key(['k'], () => scrollUp());
screen.key(['g'], () => scrollToTop());
screen.key(['G'], () => scrollToBottom());
screen.key(['/'], () => startSearch());
screen.key(['n'], () => nextSearchResult());
```

### 2. Interactive Node Selection
```typescript
// Select node in graph, show details in text panel
graphPanel.on('select', (node) => {
  textPanel.showNodeDetails(node);
  logPanel.addLog('INFO', 'UI', `Selected: ${node.Name}`);
});
```

### 3. Inline Editing
```typescript
// Press 'e' to edit selected node
screen.key(['e'], () => {
  const selected = graphPanel.getSelected();
  if (selected) {
    editDialog.show(selected, (updated) => {
      ws.send('update-node', updated);
    });
  }
});
```

### 4. Split-Screen Layouts
```typescript
// Toggle between 4-panel and 2-panel layouts
screen.key(['l'], () => {
  if (layout === '4-panel') {
    layout = '2-panel-vertical';  // Chat | Graph
  } else if (layout === '2-panel-vertical') {
    layout = '2-panel-horizontal';  // Chat over Graph
  } else {
    layout = '4-panel';
  }
  rearrangePanels(layout);
});
```

### 5. Graph Navigation with Arrow Keys
```typescript
// Navigate graph with arrow keys
screen.key(['left'], () => graphPanel.selectParent());
screen.key(['right'], () => graphPanel.selectFirstChild());
screen.key(['up'], () => graphPanel.selectPrevSibling());
screen.key(['down'], () => graphPanel.selectNextSibling());
```

### 6. Live Graph Animations
```typescript
// Animate new nodes appearing
class GraphCanvasPanel {
  addNode(node: OntologyNode) {
    // Flash effect
    this.highlightNode(node.uuid, 'green');
    setTimeout(() => {
      this.unhighlightNode(node.uuid);
    }, 1000);
  }
}
```

### 7. Dashboard Stats Widget
```typescript
// Bottom status bar
const statsBar = blessed.box({
  bottom: 0,
  left: 0,
  width: '100%',
  height: 1,
  content: 'Nodes: 12 | Edges: 18 | LLM: 245ms | Cache: 88.7% | Memory: 45MB',
  style: {
    bg: 'blue',
    fg: 'white'
  }
});
```

### 8. Color Themes
```typescript
// Switch color themes
const themes = {
  default: { /* ... */ },
  solarized: { /* ... */ },
  dracula: { /* ... */ },
  monokai: { /* ... */ }
};

screen.key(['t'], () => {
  currentTheme = (currentTheme + 1) % themes.length;
  applyTheme(themes[currentTheme]);
});
```

---

## Performance Vorteile

### vs Browser UI

| Metric | Browser UI | Terminal UI | Verbesserung |
|--------|------------|-------------|--------------|
| **Startup Zeit** | 3-5 Sekunden | <0.5 Sekunden | **6x-10x schneller** |
| **Memory** | 200-400 MB | 20-40 MB | **10x weniger** |
| **CPU** | 5-15% idle | <1% idle | **15x effizienter** |
| **SSH-fähig** | ❌ Nein | ✅ Ja | Remote-Zugriff |
| **Vim-Power** | ❌ Limitiert | ✅ Full | Power-User |

---

## Installation & Usage

```bash
# Install
npm install -g aise-terminal

# Run
aise-terminal --host localhost --port 3001

# With session
aise-terminal --session abc123 --user andreas

# SSH Remote
ssh user@server
aise-terminal --remote
```

---

## Beispiel: Live-Session

```bash
$ aise-terminal

   ___    _  ____  ___
  / _ |  (_)/ __/ / __/
 / __ | / /_\ \  / _/
/_/ |_|/_//___/ /___/  Reloaded v2.0.0

Connecting to ws://localhost:3001...
✓ Connected | Session: abc123 | User: andreas

[Press 'h' for help]
```

---

Fantastische Idee! Soll ich das implementieren? 🚀
