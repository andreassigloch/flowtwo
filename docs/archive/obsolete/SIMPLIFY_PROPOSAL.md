# Proposal: Simplify Terminal UI by Removing Tmux

**Author:** andreas@siglochconsulting
**Date:** 2025-11-18
**Status:** PROPOSED

---

## Problem Statement

Current tmux-based implementation has **critical issues**:

1. ✅ Graph rendering works
2. ❌ Chat responses appear as raw echo commands (not executed)
3. ❌ STDOUT logging broken (quote escaping hell)
4. ❌ Overly complex send-keys with nested escape sequences
5. ❌ Difficult to debug (4 panes, quote escaping, FIFO pipes)

**Root cause:** tmux send-keys doesn't handle complex text with quotes/newlines reliably.

---

## Proposed Solution: Simple Terminal Launcher

**Remove tmux entirely.** Use simple approach:

### Option 1: Single Terminal with Sections (RECOMMENDED)

**Architecture:**
```
┌────────────────────────────────────────────────┐
│ GraphEngine v2.0                               │
├────────────────────────────────────────────────┤
│ GRAPH (ASCII):                                 │
│ [SYS] DroneDefense                             │
│   └─[UC] ThreatNeutralization                  │
│     └─[FUNC] DetectDrone                       │
│                                                 │
├────────────────────────────────────────────────┤
│ CHAT:                                          │
│ You: Add payment processing                    │
│ Assistant: I'll add a payment function...      │
│                                                 │
├────────────────────────────────────────────────┤
│ > _                                            │
└────────────────────────────────────────────────┘
```

**Implementation:**
```typescript
// src/terminal-ui/simple-app.ts
import * as readline from 'readline';
import { GraphCanvas } from '../canvas/graph-canvas.js';
import { LLMEngine } from '../llm-engine/llm-engine.js';

class SimpleTerminalUI {
  private rl: readline.Interface;

  async start() {
    console.clear();
    this.printHeader();
    this.renderGraph();
    this.startChatLoop();
  }

  private printHeader() {
    console.log('╔═════════════════════════════════════╗');
    console.log('║  GraphEngine v2.0 - Terminal UI    ║');
    console.log('╚═════════════════════════════════════╝');
    console.log('');
  }

  private renderGraph() {
    console.log('─── GRAPH ───');
    const ascii = this.generateAsciiGraph();
    console.log(ascii);
    console.log('');
  }

  private startChatLoop() {
    console.log('─── CHAT ───');
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'You: '
    });

    this.rl.prompt();

    this.rl.on('line', async (input) => {
      if (input === 'exit') {
        this.rl.close();
        return;
      }

      // Process message
      const response = await this.llm.processRequest({
        message: input,
        canvasState: this.canvas.serialize()
      });

      // Display response
      console.log(`\x1b[32mAssistant:\x1b[0m ${response.textResponse}`);
      console.log('');

      // Re-render graph if changed
      if (response.operations) {
        this.canvas.applyDiff(response.operations);
        console.clear();
        this.printHeader();
        this.renderGraph();
        console.log('─── CHAT ───');
      }

      this.rl.prompt();
    });
  }
}
```

**Benefits:**
- ✅ Single terminal window
- ✅ No tmux complexity
- ✅ No FIFO pipes
- ✅ No quote escaping hell
- ✅ Direct console.log (always works)
- ✅ Easy to debug
- ✅ Works on any terminal

**Trade-offs:**
- Graph scrolls up (but stays visible)
- No separate panels (acceptable for MVP)

---

### Option 2: Launch Separate Terminal Windows

**macOS Implementation:**
```bash
#!/bin/bash
# Launch 4 separate Terminal.app windows

# Window 1: Main app
osascript -e '
tell application "Terminal"
  do script "cd '"$(pwd)"' && npm run app"
end tell
'

# Window 2: Graph viewer
osascript -e '
tell application "Terminal"
  do script "cd '"$(pwd)"' && npm run graph-viewer"
end tell
'

# Window 3: Logs
osascript -e '
tell application "Terminal"
  do script "cd '"$(pwd)"' && tail -f /tmp/graphengine.log"
end tell
'
```

**Benefits:**
- ✅ True separation
- ✅ No tmux needed
- ✅ Each window is independent terminal

**Trade-offs:**
- Platform-specific (osascript = macOS only)
- Window management manual

---

### Option 3: Web UI (Future)

Build React/Next.js UI instead:
```
http://localhost:3000
┌────────────────────────────────────┐
│ Graph Canvas (interactive)         │
├────────────────────────────────────┤
│ Chat (WebSocket real-time)         │
└────────────────────────────────────┘
```

**Benefits:**
- ✅ No terminal limitations
- ✅ Rich interactivity
- ✅ Multi-user support
- ✅ Remote access

**Trade-offs:**
- More development time
- Not "terminal-based" anymore

---

## Recommendation

**Go with Option 1: Single Terminal with Sections**

**Rationale:**
1. Simplest implementation (remove 90% of complexity)
2. No platform dependencies
3. Reliable output (console.log always works)
4. Easy to test and debug
5. Still "terminal UI" as per requirements
6. Can iterate to web UI later

**Migration Path:**
```
Phase 1: Implement simple single-terminal version
Phase 2: Test with real users
Phase 3: If multi-panel needed, build web UI (not tmux)
```

---

## Implementation Plan

### Step 1: Create Simple Terminal UI
```typescript
// src/terminal-ui/simple-app.ts
- Remove tmux-manager.ts
- Remove FIFO pipes
- Direct readline loop
- console.log for all output
- ANSI colors for formatting
```

### Step 2: Update Launcher
```bash
# graphengine.sh
#!/bin/bash
npx tsx src/terminal-ui/simple-app.ts
```

### Step 3: Test
```bash
npm start
# Should show single terminal with:
# - Header
# - Graph (ASCII)
# - Chat history
# - Input prompt
```

### Step 4: Documentation
- Update PHASE5_COMPLETE.md
- Update README.md
- Remove tmux references

---

## Code Example: Complete Simple Version

```typescript
/**
 * Simple Terminal UI - No Tmux Required
 * Single window with graph + chat
 */

import * as readline from 'readline';
import { GraphCanvas } from '../canvas/graph-canvas.js';
import { ChatCanvas } from '../canvas/chat-canvas.js';
import { LLMEngine } from '../llm-engine/llm-engine.js';
import { Neo4jClient } from '../neo4j-client/neo4j-client.js';

export class SimpleTerminalApp {
  private rl: readline.Interface;
  private graphCanvas: GraphCanvas;
  private chatCanvas: ChatCanvas;
  private llmEngine?: LLMEngine;
  private neo4jClient?: Neo4jClient;

  constructor(config) {
    // Initialize components (same as before)
    this.graphCanvas = new GraphCanvas(...);
    this.chatCanvas = new ChatCanvas(...);
    this.llmEngine = new LLMEngine(...);
    this.neo4jClient = new Neo4jClient(...);
  }

  async start() {
    console.clear();

    // Load from Neo4j if exists
    if (this.neo4jClient) {
      await this.loadGraphFromDatabase();
    }

    // Render initial screen
    this.render();

    // Start input loop
    this.startInputLoop();
  }

  private render() {
    console.clear();

    // Header
    console.log('\x1b[1;36m╔═════════════════════════════════════╗\x1b[0m');
    console.log('\x1b[1;36m║  GraphEngine v2.0 - Terminal UI    ║\x1b[0m');
    console.log('\x1b[1;36m╚═════════════════════════════════════╝\x1b[0m');
    console.log('');

    // Graph
    console.log('\x1b[1;33m─── GRAPH ───\x1b[0m');
    const graph = this.generateAsciiGraph();
    console.log(graph);
    console.log('');

    // Chat history (last 10 messages)
    console.log('\x1b[1;33m─── CHAT ───\x1b[0m');
    const messages = this.chatCanvas.getMessages().slice(-10);
    for (const msg of messages) {
      if (msg.role === 'user') {
        console.log(`\x1b[34mYou:\x1b[0m ${msg.content}`);
      } else {
        console.log(`\x1b[32mAssistant:\x1b[0m ${msg.content}`);
      }
    }
    console.log('');
  }

  private startInputLoop() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '\x1b[34mYou:\x1b[0m '
    });

    this.rl.prompt();

    this.rl.on('line', async (input) => {
      if (input.trim() === 'exit') {
        await this.stop();
        return;
      }

      if (input.trim().startsWith('/')) {
        this.handleCommand(input.trim());
        this.rl.prompt();
        return;
      }

      // Process message
      try {
        const response = await this.llmEngine!.processRequest({
          message: input,
          chatId: this.config.chatId,
          workspaceId: this.config.workspaceId,
          systemId: this.config.systemId,
          userId: this.config.userId,
          canvasState: this.parser.serializeGraph(this.graphCanvas.getState())
        });

        // Add to chat history
        await this.chatCanvas.addUserMessage(input);
        await this.chatCanvas.addAssistantMessage(
          response.textResponse,
          response.operations
        );

        // Apply operations to graph
        if (response.operations) {
          await this.graphCanvas.applyDiff(
            this.parser.parseDiff(response.operations)
          );
        }

        // Re-render screen
        this.render();

      } catch (error) {
        console.log(`\x1b[31mError:\x1b[0m ${error.message}`);
      }

      this.rl.prompt();
    });
  }

  private handleCommand(cmd: string) {
    const [command, ...args] = cmd.split(' ');

    switch (command) {
      case '/help':
        console.log('Commands:');
        console.log('  /view <name> - Switch view');
        console.log('  /save - Save to Neo4j');
        console.log('  /stats - Show statistics');
        console.log('  /clear - Clear screen');
        console.log('  exit - Quit');
        break;

      case '/save':
        this.graphCanvas.persistToNeo4j();
        console.log('✅ Saved to Neo4j');
        break;

      case '/stats':
        const state = this.graphCanvas.getState();
        console.log(`Nodes: ${state.nodes.size}, Edges: ${state.edges.size}`);
        break;

      case '/clear':
        this.render();
        break;

      default:
        console.log('Unknown command. Type /help for help.');
    }
  }

  private generateAsciiGraph(): string {
    // Same as before
    const state = this.graphCanvas.getState();
    const lines: string[] = [];

    for (const [id, node] of state.nodes) {
      lines.push(`[\x1b[36m${node.type}\x1b[0m] ${node.name}`);

      const outEdges = Array.from(state.edges.values())
        .filter(e => e.sourceId === id);

      for (const edge of outEdges) {
        const target = state.nodes.get(edge.targetId);
        if (target) {
          lines.push(`  └─\x1b[33m${edge.type}\x1b[0m→ ${target.name}`);
        }
      }
    }

    return lines.join('\n');
  }

  async stop() {
    console.log('\nSaving...');
    await this.graphCanvas.persistToNeo4j();
    await this.chatCanvas.persistToNeo4j();
    await this.neo4jClient?.close();
    console.log('✅ Goodbye!');
    process.exit(0);
  }
}
```

---

## File Changes Required

### Remove
- `src/terminal-ui/tmux-manager.ts` (delete)
- `scripts/chat-loop.sh` (delete)
- All FIFO pipe logic

### Add
- `src/terminal-ui/simple-app.ts` (new)

### Modify
- `graphengine.sh` → Launch simple-app.ts
- `package.json` → Update start script
- `PHASE5_COMPLETE.md` → Document new approach

---

## Decision

**Recommend:** Implement Option 1 (Single Terminal) immediately.

**Estimated effort:** 2-3 hours (vs weeks debugging tmux)

**Risk:** Low (simpler = less bugs)

**User experience:** Better (no quote escaping issues, reliable output)

---

**Status:** AWAITING APPROVAL

Please confirm if you want to proceed with this simplification.
