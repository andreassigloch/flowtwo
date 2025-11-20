/**
 * Graph Engine Layout Demo - Visual Demonstration
 *
 * Shows the complete Graph Engine workflow:
 * 1. Create graph with Canvas
 * 2. Compute layout with Graph Engine
 * 3. Render ASCII visualization
 *
 * @author andreas@siglochconsulting
 */

import { GraphCanvas } from './src/canvas/graph-canvas.js';
import { GraphEngine } from './src/graph-engine/graph-engine.js';
import { FormatEParser } from './src/shared/parsers/format-e-parser.js';

const parser = new FormatEParser();
const graphCanvas = new GraphCanvas('demo-ws', 'UrbanMobility.SY.001', 'chat-001', 'user-001');
const engine = new GraphEngine();

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║       GraphEngine Phase 2 - Layout Engine Demo              ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

// Step 1: Create a hierarchical system
console.log('📦 Step 1: Creating System Hierarchy\n');

const systemGraph = `<operations>
<base_snapshot>UrbanMobility.SY.001@v1</base_snapshot>

## Nodes
+ UrbanMobility|SYS|UrbanMobility.SY.001|Autonomous urban mobility system
+ Navigation|UC|Navigation.UC.001|Navigate urban environment
+ SensorProcessing|FCHAIN|SensorProcessing.FC.001|Process sensor data chain
+ ProcessLidar|FUNC|ProcessLidar.FN.001|Process LIDAR sensor data
+ ProcessCamera|FUNC|ProcessCamera.FN.002|Process camera feed
+ FuseSensorData|FUNC|FuseSensorData.FN.003|Fuse multi-sensor data
+ PathPlanning|FCHAIN|PathPlanning.FC.002|Plan optimal path
+ CalculatePath|FUNC|CalculatePath.FN.004|Calculate navigation path
+ AvoidObstacles|FUNC|AvoidObstacles.FN.005|Avoid detected obstacles

## Edges
+ UrbanMobility.SY.001 -cp-> Navigation.UC.001
+ Navigation.UC.001 -cp-> SensorProcessing.FC.001
+ Navigation.UC.001 -cp-> PathPlanning.FC.002
+ SensorProcessing.FC.001 -cp-> ProcessLidar.FN.001
+ SensorProcessing.FC.001 -cp-> ProcessCamera.FN.002
+ SensorProcessing.FC.001 -cp-> FuseSensorData.FN.003
+ PathPlanning.FC.002 -cp-> CalculatePath.FN.004
+ PathPlanning.FC.002 -cp-> AvoidObstacles.FN.005
</operations>`;

await graphCanvas.applyDiff(parser.parseDiff(systemGraph));

const state = graphCanvas.getState();
console.log(`✅ Created ${state.nodes.size} nodes and ${state.edges.size} edges\n`);

// Step 2: Compute Layout
console.log('🎨 Step 2: Computing Hierarchy Layout (Reingold-Tilford)\n');

const layoutResult = await engine.computeLayout(state, 'hierarchy');

console.log(`✅ Layout computed:`);
console.log(`   Algorithm: ${layoutResult.algorithm}`);
console.log(`   Positions: ${layoutResult.positions.size} nodes`);
console.log(`   Bounds: ${Math.round(layoutResult.bounds.width)}x${Math.round(layoutResult.bounds.height)}`);
console.log(`   Ports extracted: ${layoutResult.ports.size}\n`);

// Step 3: Render ASCII Visualization
console.log('📊 Step 3: ASCII Visualization\n');
console.log('═══════════════════════════════════════════════════════════════\n');

renderASCIITree(state, layoutResult);

console.log('\n═══════════════════════════════════════════════════════════════\n');

// Step 4: Show Detailed Positions
console.log('📍 Step 4: Node Positions (Layout Coordinates)\n');

console.log('┌────────────────────────────────┬──────────┬──────────┐');
console.log('│ Node                           │ X        │ Y        │');
console.log('├────────────────────────────────┼──────────┼──────────┤');

// Sort by Y then X for readable output
const sortedPositions = Array.from(layoutResult.positions.entries())
  .sort(([, a], [, b]) => {
    if (Math.abs(a.y - b.y) < 1) return a.x - b.x;
    return a.y - b.y;
  });

for (const [nodeId, pos] of sortedPositions) {
  const node = state.nodes.get(nodeId);
  if (node) {
    const name = `${node.name} [${node.type}]`;
    console.log(`│ ${name.padEnd(30)} │ ${Math.round(pos.x).toString().padStart(8)} │ ${Math.round(pos.y).toString().padStart(8)} │`);
  }
}

console.log('└────────────────────────────────┴──────────┴──────────┘\n');

// Step 5: View Configuration Details
console.log('⚙️  Step 5: View Configuration\n');

const viewConfig = engine.getViewConfig('hierarchy');
console.log(`View: ${viewConfig!.name}`);
console.log(`Description: ${viewConfig!.description}`);
console.log(`Layout Algorithm: ${viewConfig!.layoutConfig.algorithm}`);
console.log(`Included Node Types: ${viewConfig!.layoutConfig.includeNodeTypes.join(', ')}`);
console.log(`Included Edge Types: ${viewConfig!.layoutConfig.includeEdgeTypes.join(', ')}`);
console.log(`Rendered Node Types: ${viewConfig!.renderConfig.showNodes.join(', ')}`);
console.log(`Rendered Edge Types: ${viewConfig!.renderConfig.showEdges.join(', ') || '(implicit via nesting)'}\n`);

// Step 6: Statistics
console.log('📈 Step 6: Graph Statistics\n');

const nodesByType = new Map<string, number>();
for (const node of state.nodes.values()) {
  nodesByType.set(node.type, (nodesByType.get(node.type) || 0) + 1);
}

console.log('Node Distribution:');
for (const [type, count] of nodesByType) {
  console.log(`  ${type.padEnd(8)}: ${count}`);
}

console.log(`\nTotal Depth: ${Math.max(...Array.from(layoutResult.positions.values()).map(p => p.y)) / 100 + 1} levels`);
console.log(`Total Width: ${Math.round(layoutResult.bounds.width)} units\n`);

console.log('═══════════════════════════════════════════════════════════════');
console.log('✅ Graph Engine Demo Complete!');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('💡 Next Steps:');
console.log('   • Add FLOW nodes to test port extraction');
console.log('   • Try different orientations (left-right, bottom-up)');
console.log('   • Test with larger graphs (50+ nodes)');
console.log('   • Implement Sugiyama layout for functional-flow view\n');

// ========== ASCII RENDERING HELPER ==========

function renderASCIITree(state: any, layout: any) {
  // Group nodes by level (Y coordinate)
  const levels = new Map<number, Array<{node: any, pos: any}>>();

  for (const [nodeId, pos] of layout.positions.entries()) {
    const node = state.nodes.get(nodeId);
    if (!node) continue;

    const level = Math.round(pos.y / 100);
    if (!levels.has(level)) {
      levels.set(level, []);
    }
    levels.get(level)!.push({ node, pos });
  }

  // Sort levels
  const sortedLevels = Array.from(levels.keys()).sort((a, b) => a - b);

  for (const level of sortedLevels) {
    const nodesAtLevel = levels.get(level)!;

    // Sort by X coordinate
    nodesAtLevel.sort((a, b) => a.pos.x - b.pos.x);

    // Print level indicator
    console.log(`Level ${level}:`);

    // Print nodes
    const nodeStrs: string[] = [];
    for (const { node } of nodesAtLevel) {
      const nodeStr = `┌─${node.name}─[${node.type}]─┐`;
      nodeStrs.push(nodeStr);
    }

    console.log('  ' + nodeStrs.join('     '));

    // Print bottom border
    const bottomStrs = nodeStrs.map(s => '└' + '─'.repeat(s.length - 2) + '┘');
    console.log('  ' + bottomStrs.join('     '));

    // Print connection lines (if not last level)
    if (level < sortedLevels[sortedLevels.length - 1]) {
      const connStrs = nodeStrs.map(s => {
        const center = Math.floor(s.length / 2);
        return ' '.repeat(center) + '│' + ' '.repeat(s.length - center - 1);
      });
      console.log('  ' + connStrs.join('     '));
      console.log('  ' + connStrs.join('     '));
    }

    console.log();
  }
}
