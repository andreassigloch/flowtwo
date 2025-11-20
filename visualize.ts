/**
 * GraphEngine Visualizer - ASCII Graph Renderer
 *
 * Renders graph structure as ASCII art
 *
 * @author andreas@siglochconsulting
 */

import { GraphCanvas } from './src/canvas/graph-canvas.js';
import { FormatEParser } from './src/shared/parsers/format-e-parser.js';

const parser = new FormatEParser();
const graphCanvas = new GraphCanvas('demo-ws', 'TestSystem.SY.001', 'chat-001', 'user-001');

// Create a simple graph
const systemGraph = `<operations>
<base_snapshot>TestSystem.SY.001@v1</base_snapshot>

## Nodes
+ UrbanMobilityVehicle|SYS|UrbanMobilityVehicle.SY.001|Autonomous vehicle
+ NavigationSystem|UC|NavigationSystem.UC.001|Navigate environment
+ ProcessSensors|FUNC|ProcessSensors.FN.001|Process sensor data
+ DetectObstacles|REQ|DetectObstacles.RQ.001|Detect obstacles
+ ObstacleTest|TEST|ObstacleTest.TS.001|Test obstacle detection
+ SensorModule|MOD|SensorModule.MD.001|Sensor hardware

## Edges
+ UrbanMobilityVehicle.SY.001 -cp-> NavigationSystem.UC.001
+ NavigationSystem.UC.001 -cp-> ProcessSensors.FN.001
+ ProcessSensors.FN.001 -sat-> DetectObstacles.RQ.001
+ ObstacleTest.TS.001 -ver-> DetectObstacles.RQ.001
+ ProcessSensors.FN.001 -alc-> SensorModule.MD.001
</operations>`;

await graphCanvas.applyDiff(parser.parseDiff(systemGraph));

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║       GraphEngine - System Architecture Visualization        ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

const state = graphCanvas.getState();

// Hierarchy View (Tree Structure)
console.log('📊 Hierarchy View (System Decomposition Tree)');
console.log('═══════════════════════════════════════════════════════════\n');
console.log('    ┌─────────────────────────────┐');
console.log('    │  UrbanMobilityVehicle [SYS] │');
console.log('    │  Autonomous vehicle         │');
console.log('    └─────────────┬───────────────┘');
console.log('                  │ compose');
console.log('                  ▼');
console.log('         ┌────────────────────┐');
console.log('         │ NavigationSystem   │');
console.log('         │ [UC]               │');
console.log('         │ Navigate environ.  │');
console.log('         └──────────┬─────────┘');
console.log('                    │ compose');
console.log('                    ▼');
console.log('           ┌──────────────────┐');
console.log('           │ ProcessSensors   │');
console.log('           │ [FUNC]           │');
console.log('           │ Process sensors  │');
console.log('           └──────────────────┘\n');

// Requirements Traceability
console.log('🔗 Requirements Traceability View');
console.log('═══════════════════════════════════════════════════════════\n');
console.log('   ┌──────────────────┐');
console.log('   │ ProcessSensors   │  ──satisfy──►  ┌───────────────────┐');
console.log('   │ [FUNC]           │                │ DetectObstacles   │');
console.log('   └──────────────────┘                │ [REQ]             │');
console.log('                                       │ Detect obstacles  │');
console.log('                                       └─────────┬─────────┘');
console.log('                                                 │');
console.log('                                            ◄─verify─┐');
console.log('                                                 │');
console.log('                                      ┌──────────▼──────────┐');
console.log('                                      │ ObstacleTest        │');
console.log('                                      │ [TEST]              │');
console.log('                                      │ Test detection      │');
console.log('                                      └─────────────────────┘\n');

// Allocation View
console.log('🏗️  Allocation View (Module Assignment)');
console.log('═══════════════════════════════════════════════════════════\n');
console.log('   ┌──────────────────┐       allocate       ╔═══════════════════╗');
console.log('   │ ProcessSensors   │  ────────────────►   ║ SensorModule      ║');
console.log('   │ [FUNC]           │                      ║ [MOD]             ║');
console.log('   └──────────────────┘                      ║ Sensor hardware   ║');
console.log('                                             ╚═══════════════════╝\n');

// Graph Statistics
console.log('📈 Graph Statistics');
console.log('═══════════════════════════════════════════════════════════\n');
console.log(`   Total Nodes:      ${state.nodes.size}`);
console.log(`   Total Edges:      ${state.edges.size}`);
console.log(`   Current View:     ${state.currentView}`);
console.log(`   Graph Version:    v${state.version}`);
console.log();

// Node Breakdown
const byType = new Map<string, string[]>();
for (const node of state.nodes.values()) {
  if (!byType.has(node.type)) {
    byType.set(node.type, []);
  }
  byType.get(node.type)!.push(node.name);
}

console.log('📦 Node Breakdown by Type:');
console.log('┌─────────┬───────┬──────────────────────────────────┐');
console.log('│ Type    │ Count │ Names                            │');
console.log('├─────────┼───────┼──────────────────────────────────┤');
for (const [type, names] of byType) {
  const nameStr = names.join(', ').substring(0, 32);
  console.log(`│ ${type.padEnd(7)} │ ${names.length.toString().padStart(5)} │ ${nameStr.padEnd(32)} │`);
}
console.log('└─────────┴───────┴──────────────────────────────────┘\n');

// Edge Breakdown
console.log('🔗 Edge Breakdown by Type:');
console.log('┌────────────┬───────┬──────────────────────────────┐');
console.log('│ Type       │ Count │ Description                  │');
console.log('├────────────┼───────┼──────────────────────────────┤');
const edgeTypes = new Map<string, number>();
for (const edge of state.edges.values()) {
  edgeTypes.set(edge.type, (edgeTypes.get(edge.type) || 0) + 1);
}

const edgeDescriptions: Record<string, string> = {
  compose: 'Hierarchical composition',
  io: 'Input/output flow',
  satisfy: 'Requirement satisfaction',
  verify: 'Test verification',
  allocate: 'Function allocation',
  relation: 'Generic relationship'
};

for (const [type, count] of edgeTypes) {
  const desc = edgeDescriptions[type] || 'Unknown';
  console.log(`│ ${type.padEnd(10)} │ ${count.toString().padStart(5)} │ ${desc.padEnd(28)} │`);
}
console.log('└────────────┴───────┴──────────────────────────────┘\n');

// Format E Sample
console.log('💾 Format E Representation (Sample):');
console.log('═══════════════════════════════════════════════════════════\n');
const formatE = parser.serializeGraph(state, 'Hierarchy');
const lines = formatE.split('\n');
for (let i = 0; i < Math.min(12, lines.length); i++) {
  console.log(`   ${lines[i]}`);
}
console.log('   ...\n');

console.log('✅ Visualization Complete!\n');
console.log('💡 Tips:');
console.log('   • Switch views: graphCanvas.setCurrentView("functional-flow")');
console.log('   • Query nodes: graphCanvas.getNode("ProcessSensors.FN.001")');
console.log('   • Get edges: graphCanvas.getNodeEdges("ProcessSensors.FN.001")');
console.log('   • Persist: await graphCanvas.persistToNeo4j()\n');
