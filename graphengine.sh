#!/bin/bash
# GraphEngine Launcher
# Starts 4-panel tmux terminal UI
#
# @author andreas@siglochconsulting
# @version 2.0.0

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}"
echo "╔═══════════════════════════════════════════════════════╗"
echo "║         GraphEngine v2.0.0 - Terminal UI             ║"
echo "║     LLM-Driven Systems Engineering Platform          ║"
echo "╚═══════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Check dependencies
echo "Checking dependencies..."

if ! command -v tmux &> /dev/null; then
  echo -e "${RED}❌ tmux not found. Install with: brew install tmux${NC}"
  exit 1
fi

if ! command -v node &> /dev/null; then
  echo -e "${RED}❌ node not found. Install Node.js 18+${NC}"
  exit 1
fi

echo -e "${GREEN}✅ All dependencies found${NC}"
echo ""

# Check .env file
if [ ! -f .env ]; then
  echo -e "${RED}⚠️  .env file not found${NC}"
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo -e "${BLUE}Please edit .env and add your API keys${NC}"
  exit 1
fi

# Create FIFOs for IPC
echo "Creating IPC pipes..."
mkfifo /tmp/graphengine-input.fifo 2>/dev/null || true
mkfifo /tmp/graphengine-commands.fifo 2>/dev/null || true
mkfifo /tmp/graphengine-output.fifo 2>/dev/null || true

# Start application
echo "Starting GraphEngine..."
echo ""

npx tsx src/terminal-ui/app.ts

# Cleanup on exit
trap "rm -f /tmp/graphengine-*.fifo" EXIT
