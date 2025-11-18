# Quick Fix: Shared Canvas State

**Problem:** Graph viewer and chat interface each have their own GraphCanvas instance, so changes in one don't appear in the other.

**Solution:** Use shared state file instead of FIFO notifications.

## Immediate Fix

Replace FIFO-based updates with file-based polling:

**Chat Interface writes:**
```typescript
// After graph update
fs.writeFileSync('/tmp/graphengine-state.json', JSON.stringify({
  nodes: Array.from(graphCanvas.getState().nodes.entries()),
  edges: Array.from(graphCanvas.getState().edges.entries()),
  timestamp: Date.now()
}));
```

**Graph Viewer polls:**
```typescript
setInterval(() => {
  const state = JSON.parse(fs.readFileSync('/tmp/graphengine-state.json', 'utf8'));
  // Load into canvas
  graphCanvas.loadGraph(...);
  // Re-render
  render();
}, 1000); // Poll every second
```

## Better Solution (Next Iteration)

**Single process with blessed/ink for UI layout:**
- No IPC needed
- Shared memory state
- True reactive updates
- Still simple to debug
