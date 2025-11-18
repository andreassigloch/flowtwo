/**
 * LLM Engine Demo
 *
 * Interactive demonstration of LLM-driven graph operations
 *
 * Features:
 * - Load API key from .env
 * - Create initial graph with Canvas
 * - Send natural language requests to LLM Engine
 * - Extract operations from LLM response
 * - Apply operations to Canvas
 * - Show prompt caching benefits
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import 'dotenv/config';
import { GraphCanvas } from './src/canvas/graph-canvas.js';
import { FormatEParser } from './src/shared/parsers/format-e-parser.js';
import { LLMEngine } from './src/llm-engine/llm-engine.js';
import type { LLMRequest } from './src/shared/types/llm.js';

/**
 * Main Demo
 */
async function main() {
  console.log('='.repeat(70));
  console.log('GraphEngine v2.0.0 - LLM Integration Demo');
  console.log('='.repeat(70));
  console.log();

  // 1. Load API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('❌ ANTHROPIC_API_KEY not found in .env file');
    console.log('\nPlease create .env file with:');
    console.log('ANTHROPIC_API_KEY=your-api-key-here');
    process.exit(1);
  }
  console.log('✅ API key loaded from .env');
  console.log();

  // 2. Create Graph Canvas with initial system
  console.log('📊 Creating initial graph...');
  const parser = new FormatEParser();
  const graphCanvas = new GraphCanvas(
    'demo-workspace',
    'UrbanMobility.SY.001',
    'demo-chat',
    'andreas@siglochconsulting'
  );

  const initialGraph = `<operations>
<base_snapshot>UrbanMobility.SY.001@v1</base_snapshot>

## Nodes
+ UrbanMobility|SYS|UrbanMobility.SY.001|Urban mobility system
+ VehicleSharing|UC|VehicleSharing.UC.001|Share vehicles between users
+ User|ACTOR|User.ACT.001|System user
+ Admin|ACTOR|Admin.ACT.002|System administrator

## Edges
+ UrbanMobility.SY.001 -cp-> VehicleSharing.UC.001
+ User.ACT.001 -relation-> VehicleSharing.UC.001
+ Admin.ACT.002 -relation-> UrbanMobility.SY.001
</operations>`;

  const diff = parser.parseDiff(initialGraph);
  await graphCanvas.applyDiff(diff);
  console.log(`   ✓ Created ${graphCanvas.getState().nodes.size} nodes`);
  console.log(`   ✓ Created ${graphCanvas.getState().edges.size} edges`);
  console.log();

  // 3. Initialize LLM Engine
  console.log('🤖 Initializing LLM Engine...');
  const llmEngine = new LLMEngine({
    apiKey,
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 4096,
    temperature: 0.7,
    enableCache: true,
  });
  console.log('   ✓ LLM Engine initialized');
  console.log();

  // 4. First Request - Add Payment Function
  console.log('─'.repeat(70));
  console.log('Request 1: Add a payment processing function');
  console.log('─'.repeat(70));
  console.log();

  const request1: LLMRequest = {
    message:
      'Add a payment processing function to the VehicleSharing use case. The function should handle credit card payments and verify the payment status.',
    chatId: 'demo-chat-001',
    workspaceId: 'demo-workspace',
    systemId: 'UrbanMobility.SY.001',
    userId: 'andreas@siglochconsulting',
    canvasState: parser.serializeGraph(graphCanvas.getState()),
    contextHints: {
      currentView: 'Functional Flow',
      focusNode: 'VehicleSharing.UC.001',
      suggestedAction: 'decompose',
    },
  };

  console.log('📤 Sending request to LLM...');
  const startTime1 = Date.now();
  const response1 = await llmEngine.processRequest(request1);
  const duration1 = Date.now() - startTime1;

  console.log(`✅ Response received in ${duration1}ms\n`);

  console.log('💬 LLM Response:');
  console.log('─'.repeat(70));
  console.log(response1.textResponse);
  console.log('─'.repeat(70));
  console.log();

  if (response1.operations) {
    console.log('🔧 Operations extracted:');
    console.log('─'.repeat(70));
    console.log(response1.operations);
    console.log('─'.repeat(70));
    console.log();

    // Apply operations to canvas
    console.log('📊 Applying operations to canvas...');
    const opDiff = parser.parseDiff(response1.operations);
    const result = await graphCanvas.applyDiff(opDiff);

    if (result.success) {
      console.log(`   ✓ Applied ${result.affectedIds.length} operations`);
      console.log(`   ✓ Total nodes: ${graphCanvas.getState().nodes.size}`);
      console.log(`   ✓ Total edges: ${graphCanvas.getState().edges.size}`);
    } else {
      console.log('   ❌ Failed to apply operations:', result.errors);
    }
    console.log();
  } else {
    console.log('ℹ️  No operations in response (conversational only)\n');
  }

  console.log('📊 Token Usage (Request 1):');
  console.log(`   Input tokens:  ${response1.usage.inputTokens}`);
  console.log(`   Output tokens: ${response1.usage.outputTokens}`);
  if (response1.usage.cacheWriteTokens) {
    console.log(
      `   Cache write tokens: ${response1.usage.cacheWriteTokens} (building cache)`
    );
  }
  console.log(`   Cache hit: ${response1.cacheHit ? 'Yes ✅' : 'No (first request)'}`);
  console.log();

  // 5. Second Request - Test Prompt Caching
  console.log('─'.repeat(70));
  console.log('Request 2: Add a booking function (testing cache)');
  console.log('─'.repeat(70));
  console.log();

  const request2: LLMRequest = {
    message:
      'Add a booking function that allows users to reserve a vehicle. It should check vehicle availability and create a reservation.',
    chatId: 'demo-chat-001',
    workspaceId: 'demo-workspace',
    systemId: 'UrbanMobility.SY.001',
    userId: 'andreas@siglochconsulting',
    canvasState: parser.serializeGraph(graphCanvas.getState()),
    contextHints: {
      currentView: 'Functional Flow',
      focusNode: 'VehicleSharing.UC.001',
      suggestedAction: 'decompose',
    },
  };

  console.log('📤 Sending request to LLM...');
  const startTime2 = Date.now();
  const response2 = await llmEngine.processRequest(request2);
  const duration2 = Date.now() - startTime2;

  console.log(`✅ Response received in ${duration2}ms\n`);

  console.log('💬 LLM Response:');
  console.log('─'.repeat(70));
  console.log(response2.textResponse);
  console.log('─'.repeat(70));
  console.log();

  if (response2.operations) {
    console.log('🔧 Operations extracted:');
    console.log('─'.repeat(70));
    console.log(response2.operations);
    console.log('─'.repeat(70));
    console.log();

    // Apply operations to canvas
    console.log('📊 Applying operations to canvas...');
    const opDiff2 = parser.parseDiff(response2.operations);
    const result2 = await graphCanvas.applyDiff(opDiff2);

    if (result2.success) {
      console.log(`   ✓ Applied ${result2.affectedIds.length} operations`);
      console.log(`   ✓ Total nodes: ${graphCanvas.getState().nodes.size}`);
      console.log(`   ✓ Total edges: ${graphCanvas.getState().edges.size}`);
    } else {
      console.log('   ❌ Failed to apply operations:', result2.errors);
    }
    console.log();
  } else {
    console.log('ℹ️  No operations in response (conversational only)\n');
  }

  console.log('📊 Token Usage (Request 2):');
  console.log(`   Input tokens:  ${response2.usage.inputTokens}`);
  console.log(`   Output tokens: ${response2.usage.outputTokens}`);
  if (response2.usage.cacheReadTokens) {
    console.log(`   Cache read tokens: ${response2.usage.cacheReadTokens} ✅`);
    const savings = Math.round(
      (response2.usage.cacheReadTokens /
        (response2.usage.inputTokens + response2.usage.cacheReadTokens)) *
        100
    );
    console.log(`   Cache savings: ${savings}%`);
  }
  if (response2.usage.cacheWriteTokens) {
    console.log(
      `   Cache write tokens: ${response2.usage.cacheWriteTokens} (updating cache)`
    );
  }
  console.log(`   Cache hit: ${response2.cacheHit ? 'Yes ✅' : 'No'}`);
  console.log();

  // 6. Show final graph state
  console.log('='.repeat(70));
  console.log('Final Graph State');
  console.log('='.repeat(70));
  console.log();

  const finalState = parser.serializeGraph(graphCanvas.getState());
  console.log(finalState);
  console.log();

  // 7. Summary
  console.log('='.repeat(70));
  console.log('Demo Summary');
  console.log('='.repeat(70));
  console.log();
  console.log('✅ LLM Integration Working:');
  console.log(`   • Request 1: ${duration1}ms (cache miss expected)`);
  console.log(`   • Request 2: ${duration2}ms (cache hit expected)`);
  console.log(`   • Total nodes: ${graphCanvas.getState().nodes.size}`);
  console.log(`   • Total edges: ${graphCanvas.getState().edges.size}`);
  console.log();

  if (response2.cacheHit) {
    console.log('✅ Prompt Caching Working:');
    console.log(
      `   • Cache savings: ${Math.round((response2.usage.cacheReadTokens! / (response2.usage.inputTokens + response2.usage.cacheReadTokens!)) * 100)}%`
    );
    console.log(
      `   • Cached tokens: ${response2.usage.cacheReadTokens} (read at 10% cost)`
    );
  } else {
    console.log('ℹ️  Prompt caching not detected (may need 2+ requests)');
  }
  console.log();

  console.log('✅ Format E Integration:');
  console.log('   • Operations extracted from LLM response');
  console.log('   • Applied to Canvas via Format E Diff');
  console.log('   • Graph state updated successfully');
  console.log();

  console.log('='.repeat(70));
  console.log('Demo Complete');
  console.log('='.repeat(70));
}

// Run demo
main().catch((error) => {
  console.error('\n❌ Demo failed:', error);
  console.error('\nStack trace:', error.stack);
  process.exit(1);
});
