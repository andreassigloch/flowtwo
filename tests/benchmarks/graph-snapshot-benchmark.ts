/**
 * Graph Snapshot Cache Benchmark
 *
 * Measures performance impact of AgentDB graph snapshot caching:
 * - Serialization time (cold start)
 * - Cache retrieval time (warm cache)
 * - Memory usage
 * - Cache invalidation overhead
 *
 * @author andreas@siglochconsulting
 */

import { performance } from 'perf_hooks';
import { getAgentDBService } from '../../src/llm-engine/agentdb/agentdb-service.js';
import { FormatEParser } from '../../src/shared/parsers/format-e-parser.js';
import type { GraphState } from '../../src/canvas/graph-canvas.js';
import type { Node, Edge } from '../../src/shared/types.js';

interface BenchmarkResult {
  scenario: string;
  nodeCount: number;
  edgeCount: number;
  serializationMs: number;
  retrievalMs: number;
  sizeKB: number;
  memoryMB: number;
}

/**
 * Generate synthetic graph for testing
 */
function generateTestGraph(nodeCount: number, edgeCount: number, systemId: string): GraphState {
  const nodes = new Map<string, Node>();
  const edges = new Map<string, Edge>();

  // Generate nodes (mix of types)
  const types = ['SYS', 'FN', 'REQ', 'DA', 'UC'];
  for (let i = 0; i < nodeCount; i++) {
    const type = types[i % types.length];
    const semanticId = `Node${i}.${type}.${String(i).padStart(3, '0')}`;
    nodes.set(semanticId, {
      semanticId,
      type,
      name: `Test ${type} Node ${i}`,
      workspaceId: 'benchmark-ws',
      systemId,
      description: `Synthetic benchmark node ${i} with some description text`,
      properties: {
        priority: Math.random() > 0.5 ? 'HIGH' : 'MEDIUM',
        status: 'DRAFT',
      },
    });
  }

  // Generate edges
  const nodeIds = Array.from(nodes.keys());
  for (let i = 0; i < edgeCount; i++) {
    const fromIndex = Math.floor(Math.random() * nodeIds.length);
    const toIndex = Math.floor(Math.random() * nodeIds.length);
    if (fromIndex !== toIndex) {
      const semanticId = `Edge${i}.REL.${String(i).padStart(3, '0')}`;
      edges.set(semanticId, {
        semanticId,
        type: 'RELATION',
        fromSemanticId: nodeIds[fromIndex],
        toSemanticId: nodeIds[toIndex],
        workspaceId: 'benchmark-ws',
        systemId,
      });
    }
  }

  return {
    nodes,
    edges,
    ports: new Map(),
    currentView: 'hierarchy',
    workspaceId: 'benchmark-ws',
    systemId,
  };
}

/**
 * Measure serialization time (cold cache)
 */
async function benchmarkColdStart(
  parser: FormatEParser,
  state: GraphState,
  _systemId: string
): Promise<{ serializationMs: number; sizeKB: number }> {
  const start = performance.now();
  const formatEString = parser.serializeGraph(state);
  const serializationMs = performance.now() - start;

  const sizeKB = Buffer.byteLength(formatEString, 'utf8') / 1024;

  return { serializationMs, sizeKB };
}

/**
 * Measure cache store + retrieve time (warm cache)
 */
async function benchmarkWarmCache(
  parser: FormatEParser,
  agentdb: any,
  state: GraphState,
  systemId: string
): Promise<{ storeMs: number; retrievalMs: number; sizeKB: number }> {
  const formatEString = parser.serializeGraph(state);
  const sizeKB = Buffer.byteLength(formatEString, 'utf8') / 1024;

  // Store
  const storeStart = performance.now();
  await agentdb.storeGraphSnapshot(systemId, formatEString, {
    nodeCount: state.nodes.size,
    edgeCount: state.edges.size,
  });
  const storeMs = performance.now() - storeStart;

  // Retrieve (should hit cache)
  const retrievalStart = performance.now();
  const cached = await agentdb.getGraphSnapshot(systemId);
  const retrievalMs = performance.now() - retrievalStart;

  if (!cached) {
    throw new Error('Cache miss when expecting hit');
  }

  return { storeMs, retrievalMs, sizeKB };
}

/**
 * Measure memory usage
 */
function getMemoryUsageMB(): number {
  const mem = process.memoryUsage();
  return mem.heapUsed / 1024 / 1024;
}

/**
 * Run benchmark suite
 */
async function runBenchmark(): Promise<void> {
  console.log('🚀 Graph Snapshot Cache Benchmark\n');
  console.log('='.repeat(80));

  const agentdb = await getAgentDBService();
  const parser = new FormatEParser();
  const results: BenchmarkResult[] = [];

  // Test scenarios: (nodeCount, edgeCount)
  const scenarios = [
    { nodes: 10, edges: 15, name: 'Tiny (10 nodes)' },
    { nodes: 50, edges: 75, name: 'Small (50 nodes)' },
    { nodes: 100, edges: 150, name: 'Medium (100 nodes)' },
    { nodes: 500, edges: 750, name: 'Large (500 nodes)' },
    { nodes: 1000, edges: 1500, name: 'XLarge (1000 nodes)' },
  ];

  for (const scenario of scenarios) {
    console.log(`\n📊 Testing: ${scenario.name}`);
    console.log('-'.repeat(80));

    const systemId = `benchmark-${scenario.nodes}`;
    const state = generateTestGraph(scenario.nodes, scenario.edges, systemId);

    // Cold start (no cache)
    const memBefore = getMemoryUsageMB();
    const { serializationMs, sizeKB } = await benchmarkColdStart(parser, state, systemId);
    console.log(`   ❄️  Cold start serialization: ${serializationMs.toFixed(2)}ms (${sizeKB.toFixed(2)}KB)`);

    // Warm cache
    const { storeMs, retrievalMs } = await benchmarkWarmCache(parser, agentdb, state, systemId);
    console.log(`   💾 Cache store:            ${storeMs.toFixed(2)}ms`);
    console.log(`   🎯 Cache retrieval:        ${retrievalMs.toFixed(2)}ms`);

    const memAfter = getMemoryUsageMB();
    const memoryMB = memAfter - memBefore;
    console.log(`   🧠 Memory delta:           ${memoryMB.toFixed(2)}MB`);

    // Calculate speedup
    const speedup = ((serializationMs / retrievalMs) * 100 - 100).toFixed(0);
    console.log(`   ⚡ Speedup:                ${speedup}% faster with cache`);

    results.push({
      scenario: scenario.name,
      nodeCount: scenario.nodes,
      edgeCount: scenario.edges,
      serializationMs,
      retrievalMs,
      sizeKB,
      memoryMB,
    });

    // Cleanup
    await agentdb.invalidateGraphSnapshot(systemId);
  }

  // Summary table
  console.log('\n\n📋 Summary Table');
  console.log('='.repeat(80));
  console.log(
    'Scenario'.padEnd(20) +
      'Nodes'.padStart(8) +
      'Size(KB)'.padStart(12) +
      'Cold(ms)'.padStart(12) +
      'Warm(ms)'.padStart(12) +
      'Speedup'.padStart(12)
  );
  console.log('-'.repeat(80));

  for (const r of results) {
    const speedup = ((r.serializationMs / r.retrievalMs) * 100 - 100).toFixed(0) + '%';
    console.log(
      r.scenario.padEnd(20) +
        r.nodeCount.toString().padStart(8) +
        r.sizeKB.toFixed(1).padStart(12) +
        r.serializationMs.toFixed(2).padStart(12) +
        r.retrievalMs.toFixed(2).padStart(12) +
        speedup.padStart(12)
    );
  }

  console.log('='.repeat(80));

  // Key findings
  console.log('\n💡 Key Findings:');
  const avgSpeedup =
    results.reduce((sum, r) => sum + r.serializationMs / r.retrievalMs, 0) / results.length;
  console.log(`   - Average cache speedup: ${((avgSpeedup - 1) * 100).toFixed(0)}%`);

  const largestGraph = results[results.length - 1];
  console.log(
    `   - Largest graph (${largestGraph.nodeCount} nodes): ${largestGraph.sizeKB.toFixed(1)}KB in memory`
  );

  const totalMemory = results.reduce((sum, r) => sum + r.memoryMB, 0);
  console.log(`   - Total memory overhead: ${totalMemory.toFixed(2)}MB`);

  await agentdb.shutdown();
}

// Run benchmark
runBenchmark().catch((error) => {
  console.error('❌ Benchmark failed:', error);
  process.exit(1);
});
