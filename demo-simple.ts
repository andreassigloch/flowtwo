/**
 * Simple Demo - Without Tmux
 *
 * Demonstrates the complete stack without tmux dependency
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import 'dotenv/config';
import { GraphCanvas } from './src/canvas/graph-canvas.js';
import { ChatCanvas } from './src/canvas/chat-canvas.js';
import { LLMEngine } from './src/llm-engine/llm-engine.js';
import { FormatEParser } from './src/shared/parsers/format-e-parser.js';
import { GraphEngine } from './src/graph-engine/graph-engine.js';
import type { LLMRequest } from './src/shared/types/llm.js';

async function main() {
  console.log('='.repeat(70));
  console.log('GraphEngine v2.0.0 - Simple Demo (No Tmux Required)');
  console.log('='.repeat(70));
  console.log();

  // Check API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY not found in .env file');
    process.exit(1);
  }
  console.log('✅ API key loaded');
  console.log();

  // Initialize components
  const parser = new FormatEParser();
  const graphCanvas = new GraphCanvas(
    'demo-workspace',
    'UrbanMobility.SY.001',
    'demo-chat',
    'andreas@siglochconsulting'
  );
  const chatCanvas = new ChatCanvas(
    'demo-workspace',
    'UrbanMobility.SY.001',
    'demo-chat',
    'andreas@siglochconsulting',
    graphCanvas
  );
  const llmEngine = new LLMEngine({
    apiKey,
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 4096,
    temperature: 0.7,
    enableCache: true,
  });
  const graphEngine = new GraphEngine();

  console.log('🤖 All components initialized');
  console.log();

  // Create initial graph
  console.log('📊 Creating initial graph...');
  const initialGraph = `<operations>
<base_snapshot>UrbanMobility.SY.001@v1</base_snapshot>

## Nodes
+ UrbanMobility|SYS|UrbanMobility.SY.001|Urban mobility system
+ VehicleSharing|UC|VehicleSharing.UC.001|Share vehicles between users
+ User|ACTOR|User.ACT.001|System user

## Edges
+ UrbanMobility.SY.001 -cp-> VehicleSharing.UC.001
+ User.ACT.001 -relation-> VehicleSharing.UC.001
</operations>`;

  const diff = parser.parseDiff(initialGraph);
  await graphCanvas.applyDiff(diff);
  console.log(`   ✓ Created ${graphCanvas.getState().nodes.size} nodes`);
  console.log(`   ✓ Created ${graphCanvas.getState().edges.size} edges`);
  console.log();

  // Send request to LLM
  console.log('─'.repeat(70));
  console.log('Request: Add a payment processing function');
  console.log('─'.repeat(70));
  console.log();

  await chatCanvas.addUserMessage(
    'Add a payment processing function with verification'
  );

  const request: LLMRequest = {
    message:
      'Add a payment processing function with verification to the VehicleSharing use case.',
    chatId: 'demo-chat',
    workspaceId: 'demo-workspace',
    systemId: 'UrbanMobility.SY.001',
    userId: 'andreas@siglochconsulting',
    canvasState: parser.serializeGraph(graphCanvas.getState()),
  };

  console.log('📤 Sending to LLM...');
  const response = await llmEngine.processRequest(request);

  console.log('✅ Response received');
  console.log();
  console.log('💬 LLM Response:');
  console.log('─'.repeat(70));
  console.log(response.textResponse);
  console.log('─'.repeat(70));
  console.log();

  if (response.operations) {
    console.log('🔧 Operations:');
    console.log('─'.repeat(70));
    console.log(response.operations);
    console.log('─'.repeat(70));
    console.log();

    // Store in chat canvas
    await chatCanvas.addAssistantMessage(response.textResponse, response.operations);

    console.log('📊 Graph updated:');
    console.log(`   Total nodes: ${graphCanvas.getState().nodes.size}`);
    console.log(`   Total edges: ${graphCanvas.getState().edges.size}`);
    console.log();
  }

  // Compute and display layout
  console.log('🎨 Computing layout...');
  const layout = await graphEngine.computeLayout(
    {
      nodes: graphCanvas.getState().nodes,
      edges: graphCanvas.getState().edges,
      ports: graphCanvas.getState().ports,
    },
    'hierarchy'
  );

  console.log();
  console.log('📈 ASCII Graph Visualization:');
  console.log('─'.repeat(70));
  displayAsciiGraph(graphCanvas, layout);
  console.log('─'.repeat(70));
  console.log();

  console.log('✅ Demo complete!');
  console.log();
  console.log('Next steps:');
  console.log('  • Install tmux: brew install tmux');
  console.log('  • Run: npm start (for full 4-panel UI)');
  console.log('  • Or run: npx tsx demo-llm.ts (for LLM integration demo)');
}

function displayAsciiGraph(canvas: any, layout: any): void {
  const state = canvas.getState();

  console.log(`System: ${state.systemId}`);
  console.log(`View: Hierarchy`);
  console.log(`Nodes: ${state.nodes.size}, Edges: ${state.edges.size}`);
  console.log();

  // Simple tree visualization
  for (const [id, node] of state.nodes) {
    const pos = layout.positions.get(id);
    const indent = pos ? ' '.repeat(Math.max(0, Math.floor(pos.x / 10))) : '';
    console.log(`${indent}[${node.type}] ${node.name}`);

    // Show outgoing edges
    const outEdges = Array.from(state.edges.values()).filter(
      (e: any) => e.sourceId === id
    );
    for (const edge of outEdges) {
      const target = state.nodes.get(edge.targetId);
      if (target) {
        console.log(`${indent}  └─${edge.type}→ ${target.name}`);
      }
    }
  }
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  console.error('\nStack trace:', error.stack);
  process.exit(1);
});
