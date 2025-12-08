#!/bin/bash
# GraphEngine - 3 iTerm2 Window Launcher
# Spawns 3 separate iTerm2 windows for Graph, Chat, and Logs
# WebSocket server runs in background
#
# @author andreas@siglochconsulting
# @version 3.0.0

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
NC='\033[0m'

echo -e "${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   GraphEngine v3.0 - iTerm2 3-Window Launcher        ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

# Get project directory
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Project: $PROJECT_DIR"
echo ""

# Clean up old FIFOs and logs
echo "1. Cleaning up..."
rm -f /tmp/graphengine*.fifo 2>/dev/null || true
rm -f /tmp/graphengine.log 2>/dev/null || true

# Kill any existing WebSocket server
pkill -f "websocket-server" 2>/dev/null || true

# Create FIFOs and log file
echo "2. Creating IPC pipes and log file..."
mkfifo /tmp/graphengine-input.fifo 2>/dev/null || true
mkfifo /tmp/graphengine-output.fifo 2>/dev/null || true
touch /tmp/graphengine.log

# Start WebSocket server in background
echo "3. Starting WebSocket server in background..."
cd "$PROJECT_DIR"
npm run websocket-server >> /tmp/graphengine.log 2>&1 &
WS_PID=$!
echo "   WebSocket server PID: $WS_PID"

# Wait for WebSocket server to start
echo "4. Waiting for WebSocket server..."
sleep 2

# Check if WebSocket server is running
if ! kill -0 $WS_PID 2>/dev/null; then
    echo -e "${YELLOW}⚠️  WebSocket server failed to start. Check /tmp/graphengine.log${NC}"
    exit 1
fi
echo -e "   ${GREEN}✅ WebSocket server running${NC}"

# Launch 3 separate iTerm2 windows
echo "5. Launching 3 iTerm2 windows..."
osascript <<EOF
tell application "iTerm"
    activate

    -- Window 1: Graph Viewer
    create window with default profile
    tell current session of current window
        set name to "GraphEngine: GRAPH"
        write text "cd '$PROJECT_DIR'"
        write text "clear"
        write text "echo '╔═══════════════════════════════════════╗'"
        write text "echo '║  WINDOW 1: GRAPH VIEWER              ║'"
        write text "echo '╚═══════════════════════════════════════╝'"
        write text "echo ''"
        write text "npx tsx src/terminal-ui/graph-viewer.ts"
    end tell

    delay 1

    -- Window 2: Chat Interface
    create window with default profile
    tell current session of current window
        set name to "GraphEngine: CHAT"
        write text "cd '$PROJECT_DIR'"
        write text "clear"
        write text "echo '╔═══════════════════════════════════════╗'"
        write text "echo '║  WINDOW 2: CHAT INTERFACE            ║'"
        write text "echo '╚═══════════════════════════════════════╝'"
        write text "echo ''"
        write text "npx tsx src/terminal-ui/chat-interface.ts"
    end tell

    delay 1

    -- Window 3: Logs
    create window with default profile
    tell current session of current window
        set name to "GraphEngine: LOGS"
        write text "cd '$PROJECT_DIR'"
        write text "clear"
        write text "echo '╔═══════════════════════════════════════╗'"
        write text "echo '║  WINDOW 3: LOGS                      ║'"
        write text "echo '╚═══════════════════════════════════════╝'"
        write text "echo ''"
        write text "echo '📋 WebSocket Server PID: $WS_PID'"
        write text "echo '📋 Monitoring: /tmp/graphengine.log'"
        write text "echo ''"
        write text "tail -n 50 -f /tmp/graphengine.log"
    end tell
end tell
EOF

echo ""
echo -e "${GREEN}✅ All 3 iTerm2 windows launched!${NC}"
echo ""
echo "Window 1: GRAPH VIEWER (ASCII visualization with inline images)"
echo "Window 2: CHAT (main interaction)"
echo "Window 3: LOGS (debug output)"
echo ""
echo -e "${BLUE}Background:${NC} WebSocket server (PID: $WS_PID)"
echo ""
echo "To stop:"
echo "  - Type /exit in CHAT window"
echo "  - Or run: kill $WS_PID"
echo ""
echo "🎨 Inline images enabled in iTerm2 - Architecture view will show Mermaid diagrams!"
echo ""
