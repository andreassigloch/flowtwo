/**
 * Performance Measurement Script - Chat Roundtrip
 *
 * Measures end-to-end performance of a single chat roundtrip:
 * 1. User input
 * 2. Graph serialization (Format E)
 * 3. LLM API call (with streaming)
 * 4. Response parsing
 * 5. Diff parsing
 * 6. Graph update
 * 7. WebSocket broadcast
 *
 * @author andreas@siglochconsulting
 */

import 'dotenv/config';
import { performance } from 'perf_hooks';
import { GraphCanvas } from '../src/canvas/graph-canvas.js';
import { ChatCanvas } from '../src/canvas/chat-canvas.js';
import { LLMEngine } from '../src/llm-engine/llm-engine.js';
import { Neo4jClient } from '../src/neo4j-client/neo4j-client.js';
import { FormatEParser } from '../src/shared/parsers/format-e-parser.js';

// Configuration
const config = {
  workspaceId: 'demo-workspace',
  systemId: 'UrbanMobility.SY.001',
  chatId: 'perf-test-chat',
  userId: 'andreas@siglochconsulting',
};

// Test message
const TEST_MESSAGE = 'Add a new function called NavigationSystem under the VehicleCore';

// Performance metrics
interface PerformanceMetrics {
  step: string;
  duration: number;
  startTime: number;
  endTime: number;
}

const metrics: PerformanceMetrics[] = [];

function recordMetric(step: string, startTime: number): void {
  const endTime = performance.now();
  metrics.push({
    step,
    duration: endTime - startTime,
    startTime,
    endTime,
  });
}

/**
 * Main performance test
 */
async function measurePerformance(): Promise<void> {
  console.log('🔍 Chat Roundtrip Performance Analysis\n');
  console.log(`Test message: "${TEST_MESSAGE}"\n`);

  const overallStart = performance.now();

  // Initialize components
  console.log('⚙️  Initializing components...');
  const initStart = performance.now();

  const neo4jClient = new Neo4jClient({
    uri: process.env.NEO4J_URI!,
    user: process.env.NEO4J_USER!,
    password: process.env.NEO4J_PASSWORD!,
  });

  const graphCanvas = new GraphCanvas(
    config.workspaceId,
    config.systemId,
    config.chatId,
    config.userId,
    'hierarchy',
    neo4jClient
  );

  const chatCanvas = new ChatCanvas(
    config.workspaceId,
    config.systemId,
    config.chatId,
    config.userId,
    graphCanvas,
    neo4jClient
  );

  const llmEngine = new LLMEngine({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    model: 'claude-sonnet-4-5-20250929',
    maxTokens: 4096,
    temperature: 0.7,
    enableCache: true,
  });

  const parser = new FormatEParser();

  recordMetric('Initialization', initStart);
  console.log(`✅ Initialized in ${(metrics[0].duration).toFixed(2)}ms\n`);

  // Load graph from Neo4j
  console.log('📥 Loading graph from Neo4j...');
  const loadStart = performance.now();

  const { nodes, edges } = await neo4jClient.loadGraph({
    workspaceId: config.workspaceId,
    systemId: config.systemId,
  });

  const nodesMap = new Map(nodes.map((n) => [n.semanticId, n]));
  const edgesMap = new Map(edges.filter((e) => e.semanticId).map((e) => [e.semanticId!, e]));

  await graphCanvas.loadGraph({
    nodes: nodesMap,
    edges: edgesMap,
    ports: new Map(),
  });

  recordMetric('Load graph from Neo4j', loadStart);
  console.log(`✅ Loaded ${nodes.length} nodes in ${(metrics[metrics.length - 1].duration).toFixed(2)}ms\n`);

  // === ROUNDTRIP STARTS HERE ===
  console.log('🚀 Starting chat roundtrip...\n');

  // Step 1: Add user message
  const userMsgStart = performance.now();
  await chatCanvas.addUserMessage(TEST_MESSAGE);
  recordMetric('Add user message to canvas', userMsgStart);

  // Step 2: Serialize graph to Format E
  const serializeStart = performance.now();
  const canvasState = parser.serializeGraph(graphCanvas.getState());
  recordMetric('Serialize graph (Format E)', serializeStart);

  // Step 3: Prepare LLM request
  const prepareStart = performance.now();
  const request = {
    message: TEST_MESSAGE,
    chatId: config.chatId,
    workspaceId: config.workspaceId,
    systemId: config.systemId,
    userId: config.userId,
    canvasState,
  };
  recordMetric('Prepare LLM request', prepareStart);

  // Step 4: LLM API call (streaming)
  console.log('🤖 Calling LLM API (streaming)...');
  const llmStart = performance.now();
  let firstChunkTime = 0;
  let streamComplete = false;
  let response: any;

  await llmEngine.processRequestStream(request, async (chunk) => {
    if (chunk.type === 'text' && chunk.text && firstChunkTime === 0) {
      firstChunkTime = performance.now();
      recordMetric('LLM first chunk (TTFB)', llmStart);
      console.log(`   ⚡ First chunk received in ${(firstChunkTime - llmStart).toFixed(2)}ms`);
    } else if (chunk.type === 'complete' && chunk.response) {
      response = chunk.response;
      streamComplete = true;
      recordMetric('LLM complete response', llmStart);
    }
  });

  if (!streamComplete || !response) {
    console.error('❌ LLM stream did not complete properly');
    await neo4jClient.close();
    return;
  }

  console.log(`   ✅ Complete response in ${(metrics[metrics.length - 1].duration).toFixed(2)}ms`);
  console.log(`   📊 Input tokens: ${response.usage.inputTokens}`);
  console.log(`   📊 Output tokens: ${response.usage.outputTokens}`);
  if (response.usage.cacheReadTokens) {
    console.log(`   📊 Cache read tokens: ${response.usage.cacheReadTokens}`);
  }
  console.log('');

  // Step 5: Add assistant message
  const addAssistantStart = performance.now();
  await chatCanvas.addAssistantMessage(response.textResponse, response.operations);
  recordMetric('Add assistant message to canvas', addAssistantStart);

  // Step 6: Parse operations
  let diffParseTime = 0;
  let graphApplyTime = 0;

  if (response.operations) {
    const parseStart = performance.now();
    const diff = parser.parseDiff(response.operations);
    diffParseTime = performance.now() - parseStart;
    recordMetric('Parse diff (Format E)', parseStart);

    // Step 7: Apply diff to graph
    const applyStart = performance.now();
    await graphCanvas.applyDiff(diff);
    graphApplyTime = performance.now() - applyStart;
    recordMetric('Apply diff to graph', applyStart);

    const state = graphCanvas.getState();
    console.log(`   📊 Graph updated: ${state.nodes.size} nodes, ${state.edges.size} edges`);
  }

  // Step 8: Persist to Neo4j
  const persistStart = performance.now();
  await graphCanvas.persistToNeo4j();
  await chatCanvas.persistToNeo4j();
  recordMetric('Persist to Neo4j', persistStart);

  const overallEnd = performance.now();
  const totalTime = overallEnd - overallStart;

  // === PRINT RESULTS ===
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║           PERFORMANCE BREAKDOWN (ROUNDTRIP)              ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');

  // Group metrics
  const roundtripMetrics = metrics.slice(1); // Skip initialization and load

  let cumulativeTime = 0;
  roundtripMetrics.forEach((metric, idx) => {
    const percentage = (metric.duration / totalTime) * 100;
    cumulativeTime += metric.duration;

    const bar = '█'.repeat(Math.round(percentage / 2));
    const label = metric.step.padEnd(40);
    const duration = metric.duration.toFixed(2).padStart(8);
    const pct = percentage.toFixed(1).padStart(5);

    console.log(`${label} ${duration}ms ${pct}% ${bar}`);
  });

  console.log('\n' + '─'.repeat(61));
  console.log(`${'TOTAL ROUNDTRIP TIME'.padEnd(40)} ${totalTime.toFixed(2).padStart(8)}ms`);
  console.log('─'.repeat(61) + '\n');

  // Bottleneck analysis
  console.log('🔍 BOTTLENECK ANALYSIS:\n');

  const sortedMetrics = [...roundtripMetrics].sort((a, b) => b.duration - a.duration);
  const top3 = sortedMetrics.slice(0, 3);

  top3.forEach((metric, idx) => {
    const percentage = (metric.duration / totalTime) * 100;
    console.log(`   ${idx + 1}. ${metric.step}`);
    console.log(`      ${metric.duration.toFixed(2)}ms (${percentage.toFixed(1)}%)`);
    console.log('');
  });

  // Recommendations
  console.log('💡 RECOMMENDATIONS:\n');

  const llmTime = roundtripMetrics.find((m) => m.step.includes('LLM complete'))?.duration || 0;
  const llmPercentage = (llmTime / totalTime) * 100;

  if (llmPercentage > 70) {
    console.log('   ⚠️  LLM API call is the dominant cost (>70% of total time)');
    console.log('      → This is expected and cannot be optimized much');
    console.log('      → Consider prompt caching (already enabled)');
    console.log('      → Focus on minimizing roundtrips (batching operations)');
  }

  const serializeTime = roundtripMetrics.find((m) => m.step.includes('Serialize'))?.duration || 0;
  if (serializeTime > 100) {
    console.log('\n   ⚠️  Graph serialization is slow (>100ms)');
    console.log('      → Consider incremental serialization');
    console.log('      → Cache serialized state between requests');
  }

  const persistTime = roundtripMetrics.find((m) => m.step.includes('Persist'))?.duration || 0;
  if (persistTime > 200) {
    console.log('\n   ⚠️  Neo4j persistence is slow (>200ms)');
    console.log('      → Consider batching writes');
    console.log('      → Use async persistence (fire-and-forget)');
    console.log('      → Check database connection pool settings');
  }

  console.log('');

  // Cleanup
  await neo4jClient.close();
}

// Run
measurePerformance().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
