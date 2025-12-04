#!/bin/bash
#
# CR-028 Architecture Optimizer - Evaluation Script
# Usage: ./evaluate.sh <input-file> [options]
#
# @author andreas@siglochconsulting

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FIXTURES_DIR="$SCRIPT_DIR/fixtures/architectures"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

usage() {
    echo "CR-028 Architecture Optimizer"
    echo ""
    echo "Usage: ./evaluate.sh <input-file> [options]"
    echo ""
    echo "Input formats supported:"
    echo "  - Format E (.txt) from main app export"
    echo "  - JSON (UrbanMobilityVehicle format)"
    echo ""
    echo "Options:"
    echo "  --synthetic-tests      Create TEST nodes for uncovered REQs"
    echo "  --no-synthetic-mods    Don't create MOD nodes automatically"
    echo "  --volatility=<0.0-1.0> Default FUNC volatility (default: 0.3)"
    echo "  --keep                 Keep intermediate JSON file"
    echo "  --help                 Show this help"
    echo ""
    echo "Examples:"
    echo "  ./evaluate.sh ../exports/my-system.txt"
    echo "  ./evaluate.sh ../../docs/UrbanMobilityVehicle_converted.json"
    echo "  ./evaluate.sh input.txt --synthetic-tests --volatility=0.5"
    exit 1
}

# Check arguments
if [ $# -lt 1 ] || [ "$1" == "--help" ]; then
    usage
fi

INPUT_FILE="$1"
shift

# Check input file exists
if [ ! -f "$INPUT_FILE" ]; then
    echo -e "${RED}Error: File not found: $INPUT_FILE${NC}"
    exit 1
fi

# Parse options
CONVERTER_OPTS=""
KEEP_JSON=false

for arg in "$@"; do
    case $arg in
        --synthetic-tests)
            CONVERTER_OPTS="$CONVERTER_OPTS --synthetic-tests"
            ;;
        --no-synthetic-mods)
            CONVERTER_OPTS="$CONVERTER_OPTS --no-synthetic-mods"
            ;;
        --volatility=*)
            CONVERTER_OPTS="$CONVERTER_OPTS $arg"
            ;;
        --keep)
            KEEP_JSON=true
            ;;
        *)
            echo -e "${YELLOW}Warning: Unknown option $arg${NC}"
            ;;
    esac
done

# Generate output filename from input
BASENAME=$(basename "$INPUT_FILE" | sed 's/\.[^.]*$//')
OUTPUT_JSON="$FIXTURES_DIR/${BASENAME}.json"

echo -e "${GREEN}=== CR-028 Architecture Optimizer ===${NC}"
echo ""

# Step 1: Convert
echo -e "${YELLOW}Step 1: Converting input file...${NC}"
cd "$SCRIPT_DIR"
npx tsx src/format-converter.ts "$INPUT_FILE" "$OUTPUT_JSON" $CONVERTER_OPTS
echo ""

# Step 2: Run optimizer
echo -e "${YELLOW}Step 2: Running optimizer...${NC}"
echo ""
npx tsx src/index.ts "$BASENAME"

# Cleanup
if [ "$KEEP_JSON" = false ]; then
    rm -f "$OUTPUT_JSON"
    echo ""
    echo -e "${GREEN}Cleaned up intermediate file${NC}"
else
    echo ""
    echo -e "${GREEN}Kept intermediate file: $OUTPUT_JSON${NC}"
fi
