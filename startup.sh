#!/bin/bash
# GraphEngine - 4 Terminal Launcher
# Spawns 4 separate Terminal.app windows for easy evaluation
#
# @author andreas@siglochconsulting
# @version 2.0.0

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║      GraphEngine v2.0 - 4 Terminal Launcher          ║${NC}"
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

# Create FIFOs and log file
echo "2. Creating IPC pipes and log file..."
mkfifo /tmp/graphengine-input.fifo 2>/dev/null || true
mkfifo /tmp/graphengine-output.fifo 2>/dev/null || true
touch /tmp/graphengine.log

# Launch Terminal 1: WebSocket Server
echo "3. Launching Terminal 1: WEBSOCKET SERVER..."
osascript <<EOF
tell application "Terminal"
    set newTab to do script "cd '$PROJECT_DIR' && clear && echo '╔═══════════════════════════════════════╗' && echo '║  TERMINAL 1: WEBSOCKET SERVER        ║' && echo '╚═══════════════════════════════════════╝' && echo '' && npm run websocket-server; osascript -e 'tell application \"Terminal\" to close (every window whose custom title contains \"WebSocket Server\")'; exit"
    set custom title of front window to "GraphEngine: WebSocket Server"
end tell
EOF

sleep 2

# Launch Terminal 2: Graph Viewer
echo "4. Launching Terminal 2: GRAPH VIEWER..."
osascript <<EOF
tell application "Terminal"
    set newTab to do script "cd '$PROJECT_DIR' && npx tsx src/terminal-ui/graph-viewer.ts; osascript -e 'tell application \"Terminal\" to close (every window whose custom title contains \"GRAPH\")'; exit"
    set custom title of front window to "GraphEngine: GRAPH"
end tell
EOF

sleep 1

# Launch Terminal 3: Chat Interface
echo "5. Launching Terminal 3: CHAT..."
osascript <<EOF
tell application "Terminal"
    set newTab to do script "cd '$PROJECT_DIR' && npx tsx src/terminal-ui/chat-interface.ts; osascript -e 'tell application \"Terminal\" to close (every window whose custom title contains \"CHAT\")'; exit"
    set custom title of front window to "GraphEngine: CHAT"
end tell
EOF

sleep 1

# Launch Terminal 4: STDOUT / Logs
echo "6. Launching Terminal 4: STDOUT (logs)..."
osascript <<EOF
tell application "Terminal"
    set newTab to do script "cd '$PROJECT_DIR' && clear && echo '╔═══════════════════════════════════════╗' && echo '║  TERMINAL 4: STDOUT / LOGS           ║' && echo '╚═══════════════════════════════════════╝' && echo '' && echo '📋 Monitoring: /tmp/graphengine.log' && echo '' && tail -n 0 -f /tmp/graphengine.log; osascript -e 'tell application \"Terminal\" to close (every window whose custom title contains \"STDOUT\")'; exit"
    set custom title of front window to "GraphEngine: STDOUT"
end tell
EOF

sleep 1

echo ""
echo -e "${GREEN}✅ All 4 terminals launched!${NC}"
echo ""
echo "Terminal 1: WEBSOCKET SERVER (must be running first)"
echo "Terminal 2: GRAPH VIEWER (ASCII visualization)"
echo "Terminal 3: CHAT (main interaction)"
echo "Terminal 4: STDOUT / LOGS (debug output)"
echo ""
echo "To stop: Type /exit in CHAT terminal - all windows will close automatically"
echo ""
