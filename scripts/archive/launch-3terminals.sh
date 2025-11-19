#!/bin/bash
# GraphEngine - 4 Terminal Launcher
# Spawns 4 separate Terminal.app windows:
# 0. WebSocket Server
# 1. STDOUT / Logs
# 2. Graph Viewer
# 3. Chat Interface
#
# @author andreas@siglochconsulting
# @version 2.0.0

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║      GraphEngine v2.0 - 4 Terminal Launcher          ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
echo ""

# Get project directory
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Project: $PROJECT_DIR"
echo ""

# Clean up old logs
echo "1. Cleaning up..."
rm -f /tmp/graphengine.log 2>/dev/null || true

# Create empty log file
echo "2. Creating log file..."
touch /tmp/graphengine.log

# Launch Terminal 0: WebSocket Server
echo "3. Launching Terminal 0: WEBSOCKET SERVER..."
osascript <<EOF
tell application "Terminal"
    do script "cd '$PROJECT_DIR' && npx tsx src/websocket-server.ts"
    set custom title of window 1 to "GraphEngine: WEBSOCKET"
end tell
EOF

echo -e "${YELLOW}   Waiting for WebSocket server to start...${NC}"
sleep 2

# Launch Terminal 1: STDOUT / Logs
echo "4. Launching Terminal 1: STDOUT (logs)..."
osascript <<EOF
tell application "Terminal"
    do script "cd '$PROJECT_DIR' && clear && echo '╔═══════════════════════════════════════╗' && echo '║  TERMINAL 1: STDOUT / LOGS           ║' && echo '╚═══════════════════════════════════════╝' && echo '' && echo 'Application logs will appear here...' && echo '' && tail -f /tmp/graphengine.log"
    set custom title of window 1 to "GraphEngine: STDOUT"
end tell
EOF

sleep 1

# Launch Terminal 2: Graph Viewer
echo "5. Launching Terminal 2: GRAPH VIEWER..."
osascript <<EOF
tell application "Terminal"
    do script "cd '$PROJECT_DIR' && clear && echo 'Starting graph viewer...' && echo 'Tip: Use Cmd+K to clear, or scroll with mouse/trackpad' && echo '' && npx tsx src/terminal-ui/graph-viewer.ts"
    set custom title of window 1 to "GraphEngine: GRAPH"
end tell
EOF

sleep 1

# Launch Terminal 3: Chat Interface
echo "6. Launching Terminal 3: CHAT..."
osascript <<EOF
tell application "Terminal"
    do script "cd '$PROJECT_DIR' && npx tsx src/terminal-ui/chat-interface.ts"
    set custom title of window 1 to "GraphEngine: CHAT"
end tell
EOF

sleep 1

echo ""
echo -e "${GREEN}✅ All 4 terminals launched!${NC}"
echo ""
echo "Terminal 0: WEBSOCKET SERVER (central synchronization)"
echo "Terminal 1: STDOUT / Logs (tail -f /tmp/graphengine.log)"
echo "Terminal 2: GRAPH VIEWER (real-time updates via WebSocket)"
echo "Terminal 3: CHAT (main interaction)"
echo ""
echo -e "${YELLOW}⚠️  IMPORTANT: Close WebSocket terminal LAST to avoid errors${NC}"
echo "To stop: Close chat & graph terminals first, then WebSocket, then logs"
echo ""
