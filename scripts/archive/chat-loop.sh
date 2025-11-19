#!/bin/bash
# Chat Loop Script
# Simple readline loop for chat panel
#
# @author andreas@siglochconsulting
# @version 2.0.0

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}Chat ready. Type your message:${NC}"
echo ""

while true; do
  # Read user input
  echo -ne "${BLUE}You: ${NC}"
  read -r input

  # Check for exit
  if [ "$input" = "exit" ] || [ "$input" = "quit" ]; then
    echo "Goodbye!"
    break
  fi

  # Check for commands
  if [[ "$input" == /* ]]; then
    case "$input" in
      /help)
        echo "Commands:"
        echo "  /view <name>  - Switch view (hierarchy, functional, requirements, allocation, usecase)"
        echo "  /save         - Save to Neo4j"
        echo "  /stats        - Show graph statistics"
        echo "  /clear        - Clear screen"
        echo "  /help         - Show this help"
        echo "  exit          - Quit application"
        ;;
      /clear)
        clear
        ;;
      /save)
        echo "💾 Saving to Neo4j..."
        echo "$input" >> /tmp/graphengine-commands.fifo
        ;;
      /stats)
        echo "📊 Graph statistics..."
        echo "$input" >> /tmp/graphengine-commands.fifo
        ;;
      /view*)
        echo "🔄 Switching view..."
        echo "$input" >> /tmp/graphengine-commands.fifo
        ;;
      *)
        echo "Unknown command. Type /help for available commands."
        ;;
    esac
  else
    # Send message to LLM
    echo "🤖 Processing..."
    echo "$input" >> /tmp/graphengine-input.fifo

    # Note: Response will be sent directly to this panel by app.ts
    # No need to wait here - app.ts uses tmux send-keys to display response
  fi

  echo ""
done
