# CR-040: Claude-Flow MCP Diagnostics & Fix

**Type:** Bug Fix
**Status:** In Progress
**Priority:** HIGH
**Created:** 2025-12-10

## Problem

Claude-flow swarm initialization appeared to fail silently. Investigation revealed multiple configuration and understanding issues.

## Root Cause Analysis

### Finding 1: MCP Tools Are Coordination-Only
The MCP `swarm_init` tool creates **coordination metadata only** - it does NOT spawn actual Claude processes.

```javascript
// swarm_init just stores topology config
swarm_init: { topology, maxAgents, strategy }
// Returns: { swarmId, agentCount: 0, ... }  // 0 agents is EXPECTED
```

**Key insight**: `agentCount: 0` after `swarm_init` is correct behavior. Agents must be explicitly spawned via `agent_spawn` or Claude Code's Task tool.

### Finding 2: CLI Commands Spawn Nested Claude Instances
Running `npx claude-flow swarm status` spawns a **new Claude instance** with full tool loading:
- Creates new session_id
- Loads 200+ tools
- Connects to all MCP servers
- Very slow and resource-intensive

**Recommendation**: Use MCP tools directly (`mcp__claude-flow__swarm_status`) instead of CLI for status checks.

### Finding 3: MCP Config Key Mismatch
Two different MCP configs had different key names:

| File | Key | Issue |
|------|-----|-------|
| `~/.mcp.json` | `"claude-flow"` | ✅ Correct |
| `.mcp.json` (project) | `"claude-flow@alpha"` | ⚠️ Different key |

**Fixed**: Aligned project `.mcp.json` to use `"claude-flow"` key.

### Finding 4: VSCode Extension Version Lag
| Component | Version |
|-----------|---------|
| Claude Code CLI | 2.0.64 |
| VSCode Extension (active) | 2.0.62 |

2 patch versions behind - minor but noted.

### Finding 5: Stale MCP Process
MCP server process (pid 28331) had been running since Nov 30 - over a week old.

**Fixed**: Killed stale process with `pkill -f "claude-flow.*mcp"`

## Versions Confirmed

| Component | Version | Status |
|-----------|---------|--------|
| claude-flow@alpha | 2.7.47 | ✅ Latest |
| Claude Code CLI | 2.0.64 | ✅ Current |
| Node.js requirement | 18+ | ✅ Met (20.x) |
| NPX Cache | Fresh (Dec 10) | ✅ OK |

## Fixes Applied

1. ✅ Killed stale MCP processes
2. ✅ Aligned `.mcp.json` key names (`claude-flow@alpha` → `claude-flow`)
3. ⏳ VSCode reload required to reconnect MCP servers

## Correct Usage Pattern

### MCP Coordinates, Task Tool Executes

```javascript
// Step 1: MCP sets up coordination (optional)
mcp__claude-flow__swarm_init({ topology: "hierarchical", maxAgents: 6 })

// Step 2: Claude Code Task tool spawns ACTUAL agents
Task("Research agent", "Analyze requirements...", "researcher")
Task("Coder agent", "Implement features...", "coder")
```

### Don't Use CLI for Status
```bash
# ❌ SLOW - spawns nested Claude instance
npx claude-flow swarm status

# ✅ FAST - direct MCP call
mcp__claude-flow__swarm_status()
```

## Verification Steps (Post-Reload)

1. Reload VSCode window (Cmd+Shift+P → "Developer: Reload Window")
2. Test MCP connection:
   ```javascript
   mcp__claude-flow__swarm_status()
   ```
3. Initialize swarm:
   ```javascript
   mcp__claude-flow__swarm_init({ topology: "hierarchical" })
   ```
4. Spawn test agent:
   ```javascript
   mcp__claude-flow__agent_spawn({ type: "researcher" })
   ```

## Test Task (After Verification)

Design a new view showing FCHAINs with functions, actors, and flows:
- View spec created: `docs/specs/views/fchain-view.json`
- Uses activity diagram layout (top-to-bottom)
- Actor swimlanes for responsibility visualization
- FLOW nodes as labeled edges

## Acceptance Criteria

- [ ] MCP tools connect after VSCode reload
- [ ] `swarm_init` returns success with swarmId
- [ ] `agent_spawn` creates agent with non-zero agentCount
- [ ] `swarm_status` shows active swarm
- [ ] Task tool can execute with swarm coordination

## References

- [claude-flow GitHub](https://github.com/ruvnet/claude-flow)
- [CLAUDE.md](../../CLAUDE.md) - MCP vs Task tool usage patterns
