#!/bin/bash
# GraphEngine - 4 iTerm2 Tab Launcher
# Spawns 4 iTerm2 tabs for inline image support
#
# @author andreas@siglochconsulting
# @version 2.0.0

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   GraphEngine v2.0 - iTerm2 4-Tab Launcher           ║${NC}"
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

# Launch iTerm2 with 4 tabs
echo "3. Launching iTerm2 with 4 tabs..."
osascript <<EOF
tell application "iTerm"
    activate

    -- Create new window
    create window with default profile

    tell current session of current window
        -- Tab 1: WebSocket Server
        set name to "GraphEngine: WebSocket Server"
        write text "cd '$PROJECT_DIR'"
        write text "clear"
        write text "echo '╔═══════════════════════════════════════╗'"
        write text "echo '║  TERMINAL 1: WEBSOCKET SERVER        ║'"
        write text "echo '╚═══════════════════════════════════════╝'"
        write text "echo ''"
        write text "npm run websocket-server"
    end tell

    delay 2

    tell current window
        -- Tab 2: Graph Viewer
        create tab with default profile
        tell current session
            set name to "GraphEngine: GRAPH"
            write text "cd '$PROJECT_DIR'"
            write text "npx tsx src/terminal-ui/graph-viewer.ts"
        end tell

        delay 1

        -- Tab 3: Chat Interface
        create tab with default profile
        tell current session
            set name to "GraphEngine: CHAT"
            write text "cd '$PROJECT_DIR'"
            write text "npx tsx src/terminal-ui/chat-interface.ts"
        end tell

        delay 1

        -- Tab 4: STDOUT / Logs
        create tab with default profile
        tell current session
            set name to "GraphEngine: STDOUT"
            write text "cd '$PROJECT_DIR'"
            write text "clear"
            write text "echo '╔═══════════════════════════════════════╗'"
            write text "echo '║  TERMINAL 4: STDOUT / LOGS           ║'"
            write text "echo '╚═══════════════════════════════════════╝'"
            write text "echo ''"
            write text "echo '📋 Monitoring: /tmp/graphengine.log'"
            write text "echo ''"
            write text "tail -n 0 -f /tmp/graphengine.log"
        end tell
    end tell
end tell
EOF

echo ""
echo -e "${GREEN}✅ All 4 iTerm2 tabs launched!${NC}"
echo ""
echo "Tab 1: WEBSOCKET SERVER (must be running first)"
echo "Tab 2: GRAPH VIEWER (ASCII visualization with inline images)"
echo "Tab 3: CHAT (main interaction)"
echo "Tab 4: STDOUT / LOGS (debug output)"
echo ""
echo "To stop: Type /exit in CHAT tab or press Ctrl+C in each tab"
echo ""
echo "🎨 Inline images enabled in iTerm2 - Architecture view will show Mermaid diagrams!"
echo ""
