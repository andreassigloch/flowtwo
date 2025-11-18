# GraphEngine - Troubleshooting Guide

**Author:** andreas@siglochconsulting
**Date:** 2025-11-18
**Version:** 2.0.0

---

## Common Issues & Solutions

### 1. "Processing..." appears but no LLM response

**Symptoms:**
- Chat panel shows "🤖 Processing..."
- No assistant response appears
- STDOUT panel may show error: "no server running on /private/tmp/tmux-501/default"

**Root Cause:**
- Tmux panel mapping incorrect (fixed in commit b00d6d1)
- FIFO message loop not reopening after first message

**Solution:**
```bash
# Update to latest version
git pull

# Restart application
tmux kill-session -t graphengine
npm start
```

**Verification:**
```bash
# Check panel mapping
tmux list-panes -t graphengine

# Should show:
# 0: %X (CHAT - top-left)
# 1: %X (GRAPH - top-right)
# 2: %X (VIEW - bottom-left)
# 3: %X (STDOUT - bottom-right)
```

---

### 2. Application won't start

**Symptoms:**
- `npm start` fails immediately
- Error: "tmux not found" or "node not found"

**Solution:**
```bash
# Install dependencies
brew install tmux  # macOS
# OR
sudo apt install tmux  # Linux

# Verify versions
tmux -V   # Should be 2.0+
node -v   # Should be 20+
```

---

### 3. FIFO errors

**Symptoms:**
- Error: "cannot create FIFO: File exists"
- Messages not being processed

**Solution:**
```bash
# Clean up FIFOs
rm -f /tmp/graphengine*.fifo

# Restart application
npm start
```

**Prevention:**
```bash
# Add to .bashrc or .zshrc
alias graphengine-clean='rm -f /tmp/graphengine*.fifo && tmux kill-session -t graphengine'
```

---

### 4. LLM not responding

**Symptoms:**
- "Processing..." hangs forever
- No response in chat panel
- STDOUT shows: "⚠️ LLM Engine not configured"

**Root Cause:**
- Missing or invalid ANTHROPIC_API_KEY

**Solution:**
```bash
# Check .env file exists
cat .env | grep ANTHROPIC_API_KEY

# If missing or invalid:
cp .env.example .env
# Edit .env and add your API key:
# ANTHROPIC_API_KEY=sk-ant-...

# Restart
npm start
```

**Verification:**
```bash
# Test API key
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{
    "model": "claude-sonnet-4-5-20250929",
    "max_tokens": 10,
    "messages": [{"role": "user", "content": "Hi"}]
  }'
```

---

### 5. Neo4j connection errors

**Symptoms:**
- Warning: "Neo4j not configured"
- /save command fails
- Graph doesn't persist

**Solution:**
```bash
# Option 1: Run without Neo4j (valid for testing)
# Just ignore the warning, app works in memory-only mode

# Option 2: Set up Neo4j
# Install Neo4j Desktop or Docker
docker run -d \
  --name neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  neo4j:latest

# Add to .env
echo "NEO4J_URI=bolt://localhost:7687" >> .env
echo "NEO4J_USER=neo4j" >> .env
echo "NEO4J_PASSWORD=password" >> .env

# Restart
npm start
```

---

### 6. Tmux session already exists

**Symptoms:**
- Error: "duplicate session: graphengine"
- Application won't start

**Solution:**
```bash
# Kill existing session
tmux kill-session -t graphengine

# Or attach to existing session
tmux attach -t graphengine
```

**Prevention:**
The app automatically kills existing sessions on startup.
If this fails, check for zombie processes:
```bash
ps aux | grep graphengine
kill <PID>
```

---

### 7. Panel layout broken

**Symptoms:**
- Panels not arranged correctly
- Wrong content in panels
- Can't see all 4 panels

**Solution:**
```bash
# Detach and restart
# In tmux: Ctrl+B then D
tmux kill-session -t graphengine
npm start

# Or reset layout manually
# In tmux:
# Ctrl+B then Alt+1  # Even horizontal layout
# Ctrl+B then Alt+2  # Even vertical layout
```

---

### 8. Can't scroll in panels

**Symptoms:**
- Chat history not visible
- Graph too long to see
- Can't scroll up

**Solution:**
```
# Enter copy mode (scroll mode)
Ctrl+B then [

# Navigate:
Arrow keys: Scroll up/down
Page Up/Down: Fast scroll
q: Exit copy mode

# Search in copy mode:
Ctrl+S: Search forward
Ctrl+R: Search backward
```

---

### 9. Responses too slow

**Symptoms:**
- LLM takes 5-10 seconds per response
- First response very slow

**Explanation:**
- First request builds prompt cache (~2-5s)
- Subsequent requests use cache (~200ms)
- This is expected behavior

**Optimization:**
```typescript
// In .env, adjust model settings
ANTHROPIC_MODEL=claude-sonnet-4-5-20250929  # Faster
# OR
ANTHROPIC_MODEL=claude-opus-4  # More capable but slower
```

---

### 10. Graph not updating

**Symptoms:**
- LLM responds with operations
- Chat panel shows: "I've added X..."
- Graph panel unchanged

**Debug Steps:**
```bash
# 1. Check STDOUT panel for errors
# Look for: "📊 Graph updated (N nodes)"

# 2. Check if operations were parsed
cat /tmp/graphengine.log | grep "Graph updated"

# 3. Manually refresh graph
# In chat panel:
/view hierarchy

# 4. Check graph state
# In chat panel:
/stats
```

**If still broken:**
```bash
# Check logs
tail -f /tmp/graphengine.log

# Restart with clean state
tmux kill-session -t graphengine
rm -f /tmp/graphengine*.fifo
npm start
```

---

## Debugging Tips

### Enable Verbose Logging
```typescript
// Edit src/terminal-ui/app.ts
// Add before logToStdout():
console.log('DEBUG:', message);
```

### Monitor All Logs
```bash
# In separate terminal
tail -f /tmp/graphengine.log
```

### Inspect Tmux Panes
```bash
# List all panes
tmux list-panes -t graphengine -a

# Capture pane content
tmux capture-pane -t graphengine:0.0 -p

# Send test message
tmux send-keys -t graphengine:0.0 "echo TEST" C-m
```

### Test FIFO Communication
```bash
# In terminal 1: Read from FIFO
cat /tmp/graphengine-input.fifo

# In terminal 2: Write to FIFO
echo "test message" > /tmp/graphengine-input.fifo

# Should appear in terminal 1
```

### Check Process Status
```bash
# Find GraphEngine process
ps aux | grep "tsx.*app.ts"

# Check open files
lsof -p <PID> | grep fifo

# Monitor system calls
# macOS:
dtruss -p <PID>
# Linux:
strace -p <PID>
```

---

## Known Limitations

### Terminal UI Constraints
1. **No Real-time Streaming** - LLM responses appear all at once (not token-by-token)
2. **ASCII Rendering Only** - No colors, no box-drawing (yet)
3. **Single User** - No multi-user collaboration
4. **No Undo/Redo UI** - Manual recovery from Neo4j required

### Workarounds
1. **Streaming:** Implement in future via WebSocket
2. **Colors:** Use ANSI escape codes (partially implemented)
3. **Multi-user:** Use separate tmux sessions per user
4. **Undo:** Query Neo4j for previous versions

---

## Getting Help

### Log Files
Always include these when reporting issues:
- `/tmp/graphengine.log` - Application log
- `tmux list-panes -t graphengine` output
- `.env` file (without API keys!)

### Diagnostic Command
```bash
# Run this and include output in bug reports
cat <<EOF > diagnostic.sh
#!/bin/bash
echo "=== GraphEngine Diagnostic ==="
echo "Date: \$(date)"
echo "Node: \$(node -v)"
echo "Tmux: \$(tmux -V)"
echo ""
echo "=== Tmux Sessions ==="
tmux list-sessions 2>&1
echo ""
echo "=== Panes (if running) ==="
tmux list-panes -t graphengine 2>&1
echo ""
echo "=== FIFOs ==="
ls -la /tmp/graphengine*.fifo 2>&1
echo ""
echo "=== Processes ==="
ps aux | grep -E "(tsx|graphengine)" | grep -v grep
echo ""
echo "=== Recent Logs (last 20 lines) ==="
tail -20 /tmp/graphengine.log 2>&1
EOF

chmod +x diagnostic.sh
./diagnostic.sh
```

### Report Issues
- GitHub: https://github.com/sigloch-consulting/graphengine/issues
- Email: andreas@siglochconsulting
- Include: Diagnostic output, error messages, steps to reproduce

---

## FAQ

**Q: Can I use GraphEngine without tmux?**
A: Not currently. Tmux is required for the 4-panel terminal UI. Future: web UI alternative.

**Q: Does it work on Windows?**
A: No, requires Unix/macOS. Use WSL2 on Windows.

**Q: Can I run multiple instances?**
A: Yes, use different session names in .env:
```bash
GRAPHENGINE_SESSION=graphengine-project1
```

**Q: How do I backup my graph?**
A: If using Neo4j:
```bash
neo4j-admin dump --database=neo4j --to=/backup/graph.dump
```
If memory-only: Graphs are lost on exit (use /save to persist)

**Q: Can I import SysML/UML models?**
A: Not yet. Planned for future release. Currently: manual input via LLM.

---

**Last Updated:** 2025-11-18
**Applies to:** GraphEngine v2.0.0+
