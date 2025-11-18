# GraphEngine v2.0.0 - Quick Start Guide

**LLM-Driven Systems Engineering Platform with Canvas-Centric Architecture**

## Installation

```bash
# 1. Install dependencies
npm install

# 2. Install tmux (if not already installed)
brew install tmux

# 3. Create .env file with API key
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

## Running the Application

### Option 1: Full 4-Panel Terminal UI (Recommended)

```bash
npm start
```

This launches a tmux session with 4 panels:
```
┌─────────────────────┬─────────────────────┐
│   CHAT              │   GRAPH             │
│   User I/O          │   ASCII viz         │
├─────────────────────┼─────────────────────┤
│   VIEW              │   STDOUT            │
│   View selector     │   Debug logs        │
└─────────────────────┴─────────────────────┘
```

**Navigation**:
- **Ctrl+B** then **arrow keys**: Switch between panels
- **Ctrl+B** then **D**: Detach (session keeps running)
- **Ctrl+D** or `exit`: Quit

**Reattach to detached session**:
```bash
tmux attach -t graphengine
```

### Option 2: Simple Demo (No Tmux)

```bash
npx tsx demo-simple.ts
```

This runs a complete demo showing:
- Canvas operations (Graph + Chat)
- LLM Engine integration (with 97% cache hit!)
- Graph Engine layout computation
- ASCII visualization

## Chat Commands

In the CHAT panel, you can use:

- **Natural language**: "Add a payment processing function"
- **/view <name>**: Switch view (hierarchy, functional-flow, requirements, allocation, use-case)
- **/save**: Persist current state to Neo4j
- **/stats**: Show graph statistics
- **/help**: Show help
- **exit**: Quit application

## View Types

1. **hierarchy**: Component decomposition tree
2. **functional-flow**: Function execution flow
3. **requirements**: Requirements traceability
4. **allocation**: Component-to-function mapping
5. **use-case**: Use case diagrams

## Development

```bash
# Run tests (128 tests)
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test suites
npm run test:unit
npm run test:integration

# Build (TypeScript compilation)
npm run build

# Lint code
npm run lint

# Format code
npm run format
```

## Architecture

**5-Phase SPARC Implementation**:

1. **Canvas** (graph-canvas.ts, chat-canvas.ts)
   - Dual canvas architecture (Graph + Chat)
   - Batch persistence (100ms debounce)
   - Format E diff protocol

2. **Graph Engine** (graph-engine.ts)
   - Layout algorithms (Reingold-Tilford, Force-directed, Circular)
   - View filters (5 SysML view types)
   - Position computation

3. **LLM Engine** (llm-engine.ts)
   - Anthropic Claude Sonnet 4.5
   - Prompt caching (97% cache hit rate)
   - Format E response parsing

4. **Neo4j Client** (neo4j-client.ts)
   - Batch operations (UNWIND-based)
   - Graph persistence
   - Audit logging

5. **Terminal UI** (tmux-manager.ts, app.ts)
   - 4-panel tmux layout
   - FIFO pipe IPC
   - Real-time visualization

## Example Session

```bash
$ npm start

# In CHAT panel, type:
You: Add a vehicle tracking function to the UrbanMobility system

# LLM processes request and updates graph
# GRAPH panel shows new nodes/edges
# STDOUT panel shows operation logs

# Switch view:
You: /view functional-flow

# GRAPH panel updates to show functional flow

# Save to database:
You: /save

# Detach and continue later:
Ctrl+B then D

# Reattach:
$ tmux attach -t graphengine
```

## Troubleshooting

**Tmux not found**:
```bash
brew install tmux
```

**API key error**:
```bash
# Check .env file exists
cat .env

# Verify ANTHROPIC_API_KEY is set
echo $ANTHROPIC_API_KEY
```

**Session already exists**:
```bash
# Kill old session
tmux kill-session -t graphengine

# Restart
npm start
```

**Log file missing**:
```bash
# Create log file
touch /tmp/graphengine.log
```

## Next Steps

1. **Try the demo**: `npx tsx demo-simple.ts`
2. **Read architecture**: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
3. **Review tests**: `npm test`
4. **Explore code**: Start with [src/canvas/](src/canvas/)

## Technical Stack

- **Language**: TypeScript 5.7
- **Runtime**: Node.js 20+
- **LLM**: Anthropic Claude Sonnet 4.5
- **Database**: Neo4j (optional)
- **UI**: Tmux 3.5+
- **Testing**: Vitest 2.0

## Status

✅ **All 5 phases complete**
✅ **128/128 tests passing**
✅ **Full tmux UI working**
✅ **Production ready**

---

**Author**: andreas@siglochconsulting
**Version**: 2.0.0
**License**: MIT
