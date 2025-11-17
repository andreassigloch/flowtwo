#!/bin/bash
# Benchmark: agentDB vs File-Based Coordination

echo "🔬 BENCHMARK: agentDB vs File-Based Coordination"
echo "=========================================="
echo ""

# Clean previous runs
rm -rf /tmp/agentdb-demo/no-agentdb-output
rm -f /tmp/agentdb-demo/metrics-*.json

echo "📊 Test 1: WITH agentDB (Reflexion Memory)"
echo "------------------------------------------"
START1=$(date +%s%3N)

# WITH agentDB - using CLI commands (already tested)
./node_modules/.bin/agentdb init /tmp/agentdb-demo/benchmark-with-agentdb.db --dimension 1536 --preset small 2>&1 | grep -v "Transformers.js\|sharp\|⚠️" || true

./node_modules/.bin/agentdb reflexion store "researcher-1" "analyze_rest_api" 1.0 true "REST API Best Practices: 1) Use nouns for resources, 2) HTTP methods define actions, 3) Proper status codes, 4) Consistent error format, 5) Versioning" 2>&1 | grep -E "✅|Stored" || true

./node_modules/.bin/agentdb reflexion store "researcher-1" "identify_patterns" 1.0 true "Common REST Design Patterns: Resource-oriented, HATEOAS, Pagination, Filtering, Bearer tokens, Rate limiting" 2>&1 | grep -E "✅|Stored" || true

./node_modules/.bin/agentdb reflexion retrieve "REST API" --k 5 2>&1 | grep -E "✅|Retrieved|Episode" || true

./node_modules/.bin/agentdb reflexion store "coder-2" "implement_users_api" 1.0 true "Implementation: /api/v1/users with GET/POST/PUT/DELETE. Applied researcher best practices from agentDB." 2>&1 | grep -E "✅|Stored" || true

./node_modules/.bin/agentdb reflexion retrieve "API implementation" --k 10 2>&1 | grep -E "✅|Retrieved|Episode" || true

./node_modules/.bin/agentdb reflexion store "reviewer-3" "validate_implementation" 1.0 true "Code Review: APPROVED. Cross-referenced researcher episodes from agentDB." 2>&1 | grep -E "✅|Stored" || true

END1=$(date +%s%3N)
DURATION1=$((END1 - START1))

echo ""
echo "✅ WITH agentDB completed in ${DURATION1}ms"
echo ""

# Get agentDB stats
DB_SIZE=$(stat -f%z /tmp/agentdb-demo/benchmark-with-agentdb.db 2>/dev/null || stat -c%s /tmp/agentdb-demo/benchmark-with-agentdb.db 2>/dev/null || echo "0")

echo ""
echo "📊 Test 2: WITHOUT agentDB (File-Based)"
echo "------------------------------------------"
START2=$(date +%s%3N)

cd /tmp/agentdb-demo && node swarm-demo-WITHOUT-agentdb.js 2>&1 | grep -v "^$"

END2=$(date +%s%3N)
DURATION2=$((END2 - START2))

echo ""
echo "✅ WITHOUT agentDB completed in ${DURATION2}ms"
echo ""

# Comparison
echo ""
echo "=========================================="
echo "🏆 BENCHMARK RESULTS"
echo "=========================================="
echo ""
echo "WITH agentDB:"
echo "  ⏱️  Time: ${DURATION1}ms"
echo "  💾 DB Size: ${DB_SIZE} bytes"
echo "  🔍 Search: Vector similarity"
echo "  📊 Scores: ✅ Available"
echo "  🧠 Synthesis: ✅ Available"
echo "  🎯 Causal: ✅ Available"
echo ""
echo "WITHOUT agentDB (File-Based):"
echo "  ⏱️  Time: ${DURATION2}ms"
echo "  💾 Files: $(ls /tmp/agentdb-demo/no-agentdb-output | wc -l) files"
echo "  🔍 Search: Manual file scan"
echo "  📊 Scores: ❌ Not available"
echo "  🧠 Synthesis: ❌ Not available"
echo "  🎯 Causal: ❌ Not available"
echo ""

# Calculate speedup
if [ $DURATION2 -gt 0 ]; then
    SPEEDUP=$(echo "scale=2; $DURATION2 / $DURATION1" | bc 2>/dev/null || echo "N/A")
    echo "📈 Performance:"
    if [ "$SPEEDUP" != "N/A" ]; then
        echo "  agentDB is ${SPEEDUP}x vs file-based"
    fi
fi

echo ""
echo "✅ Benchmark complete!"
echo ""
