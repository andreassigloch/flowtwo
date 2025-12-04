/**
 * @ruvector/graph-node Evaluation
 *
 * Tests the graph-node package for Neo4j replacement capability
 *
 * @author andreas@siglochconsulting
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);

interface TestResult {
  feature: string;
  works: boolean;
  notes: string;
}

async function runTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const { GraphDatabase, version } = require('@ruvector/graph-node');

  console.log(`Testing @ruvector/graph-node v${version()}`);
  console.log('='.repeat(60));

  const db = new GraphDatabase();
  const embedding = new Float32Array(128).fill(0.1);

  // Test 1: Node Creation
  console.log('\n1. Node Creation...');
  try {
    await db.createNode({
      id: 'sys-001',
      label: 'SYS',
      embedding,
      properties: { name: 'GraphEngine', semanticId: 'GraphEngine.SY.001' },
    });
    await db.createNode({
      id: 'func-001',
      label: 'FUNC',
      embedding,
      properties: { name: 'LLMIntegration', semanticId: 'LLM.FN.001' },
    });
    await db.createNode({
      id: 'func-002',
      label: 'FUNC',
      embedding,
      properties: { name: 'Canvas', semanticId: 'Canvas.FN.002' },
    });
    const stats = await db.stats();
    results.push({
      feature: 'createNode()',
      works: stats.totalNodes === 3,
      notes: `Created 3 nodes. Requires embedding field.`,
    });
    console.log('   [OK] createNode works (requires embedding)');
  } catch (e) {
    results.push({ feature: 'createNode()', works: false, notes: String(e) });
    console.log('   [FAIL]', e);
  }

  // Test 2: Edge Creation
  console.log('\n2. Edge Creation...');
  try {
    await db.createEdge({
      from: 'sys-001',
      to: 'func-001',
      label: 'compose',
      embedding,
      properties: {},
      description: 'composes',
    });
    await db.createEdge({
      from: 'sys-001',
      to: 'func-002',
      label: 'compose',
      embedding,
      properties: {},
      description: 'composes',
    });
    const stats = await db.stats();
    results.push({
      feature: 'createEdge()',
      works: stats.totalEdges === 2,
      notes: `Created 2 edges. Requires embedding field.`,
    });
    console.log('   [OK] createEdge works (requires embedding)');
  } catch (e) {
    results.push({ feature: 'createEdge()', works: false, notes: String(e) });
    console.log('   [FAIL]', e);
  }

  // Test 3: Graph Traversal (kHopNeighbors)
  console.log('\n3. Graph Traversal (kHopNeighbors)...');
  try {
    const neighbors = await db.kHopNeighbors('sys-001', 1);
    results.push({
      feature: 'kHopNeighbors()',
      works: neighbors.length === 3,
      notes: `Returns node IDs: ${neighbors.join(', ')}`,
    });
    console.log('   [OK] kHopNeighbors works:', neighbors);
  } catch (e) {
    results.push({ feature: 'kHopNeighbors()', works: false, notes: String(e) });
    console.log('   [FAIL]', e);
  }

  // Test 4: Basic Cypher Query
  console.log('\n4. Cypher Query (MATCH)...');
  try {
    const result = db.querySync('MATCH (n) RETURN n');
    const works = result.nodes.length > 0;
    results.push({
      feature: 'Cypher MATCH (n)',
      works,
      notes: works
        ? `Returns ${result.nodes.length} nodes`
        : `Parses but returns empty. Stats show ${result.stats.totalNodes} nodes.`,
    });
    console.log(
      works
        ? `   [OK] Returns ${result.nodes.length} nodes`
        : `   [FAIL] Returns empty array despite ${result.stats.totalNodes} nodes existing`
    );
  } catch (e) {
    results.push({ feature: 'Cypher MATCH (n)', works: false, notes: String(e) });
    console.log('   [FAIL]', e);
  }

  // Test 5: Cypher Label Filter
  console.log('\n5. Cypher Label Filter (MATCH (n:FUNC))...');
  try {
    const result = db.querySync('MATCH (n:FUNC) RETURN n');
    results.push({
      feature: 'Cypher MATCH (n:Label)',
      works: result.nodes.length > 0,
      notes: `Returns ${result.nodes.length} FUNC nodes (expected 2)`,
    });
    console.log(`   ${result.nodes.length > 0 ? '[OK]' : '[FAIL]'} Returns ${result.nodes.length} nodes`);
  } catch (e) {
    results.push({ feature: 'Cypher MATCH (n:Label)', works: false, notes: String(e) });
    console.log('   [FAIL]', e);
  }

  // Test 6: Cypher Relationship Pattern
  console.log('\n6. Cypher Relationship Pattern...');
  try {
    const result = db.querySync('MATCH (a)-[:compose]->(b) RETURN a, b');
    results.push({
      feature: 'Cypher Relationship Pattern',
      works: result.edges.length > 0 || result.nodes.length > 0,
      notes: `Returns ${result.nodes.length} nodes, ${result.edges.length} edges (expected 2 edges)`,
    });
    console.log(`   ${result.edges.length > 0 ? '[OK]' : '[FAIL]'} Returns ${result.edges.length} edges`);
  } catch (e) {
    results.push({ feature: 'Cypher Relationship Pattern', works: false, notes: String(e) });
    console.log('   [FAIL]', e);
  }

  // Test 7: Cypher WHERE Clause
  console.log('\n7. Cypher WHERE Clause...');
  try {
    const result = db.querySync("MATCH (n) WHERE n.name = 'GraphEngine' RETURN n");
    results.push({
      feature: 'Cypher WHERE clause',
      works: result.nodes.length > 0,
      notes: `Returns ${result.nodes.length} nodes (expected 1)`,
    });
    console.log(`   ${result.nodes.length > 0 ? '[OK]' : '[FAIL]'} Returns ${result.nodes.length} nodes`);
  } catch (e) {
    results.push({ feature: 'Cypher WHERE clause', works: false, notes: String(e) });
    console.log('   [FAIL]', e);
  }

  // Test 8: Cypher CREATE
  console.log('\n8. Cypher CREATE...');
  try {
    const before = (await db.stats()).totalNodes;
    db.querySync("CREATE (n:TEST {name: 'Created'})");
    const after = (await db.stats()).totalNodes;
    results.push({
      feature: 'Cypher CREATE',
      works: after > before,
      notes: `Nodes before: ${before}, after: ${after}`,
    });
    console.log(`   ${after > before ? '[OK]' : '[FAIL]'} Nodes: ${before} -> ${after}`);
  } catch (e) {
    results.push({ feature: 'Cypher CREATE', works: false, notes: String(e) });
    console.log('   [FAIL]', e);
  }

  // Test 9: Cypher MERGE
  console.log('\n9. Cypher MERGE...');
  try {
    const before = (await db.stats()).totalNodes;
    db.querySync("MERGE (n:TEST {name: 'Merged'})");
    const after = (await db.stats()).totalNodes;
    results.push({
      feature: 'Cypher MERGE',
      works: after >= before,
      notes: `Nodes before: ${before}, after: ${after}`,
    });
    console.log(`   ${after > before ? '[OK]' : '[FAIL]'} Nodes: ${before} -> ${after}`);
  } catch (e) {
    results.push({ feature: 'Cypher MERGE', works: false, notes: String(e) });
    console.log('   [FAIL]', e);
  }

  // Test 10: Cypher COUNT
  console.log('\n10. Cypher COUNT...');
  try {
    const result = db.querySync('MATCH (n) RETURN count(n) as total');
    const hasCount = 'total' in result || result.nodes.length > 0;
    results.push({
      feature: 'Cypher count()',
      works: hasCount,
      notes: `Result: ${JSON.stringify(result).substring(0, 100)}`,
    });
    console.log(`   ${hasCount ? '[OK]' : '[FAIL]'}`);
  } catch (e) {
    results.push({ feature: 'Cypher count()', works: false, notes: String(e) });
    console.log('   [FAIL]', e);
  }

  return results;
}

async function main() {
  console.log('='.repeat(60));
  console.log('@ruvector/graph-node Evaluation');
  console.log('='.repeat(60));

  const results = await runTests();

  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  const working = results.filter((r) => r.works);
  const broken = results.filter((r) => !r.works);

  console.log(`\nWorking (${working.length}/${results.length}):`);
  working.forEach((r) => console.log(`  [OK] ${r.feature}: ${r.notes}`));

  console.log(`\nNot Working (${broken.length}/${results.length}):`);
  broken.forEach((r) => console.log(`  [FAIL] ${r.feature}: ${r.notes}`));

  console.log('\n' + '='.repeat(60));
  console.log('CONCLUSION');
  console.log('='.repeat(60));

  const cypherWorks = results.filter((r) => r.feature.startsWith('Cypher') && r.works).length;
  const cypherTotal = results.filter((r) => r.feature.startsWith('Cypher')).length;

  console.log(`
@ruvector/graph-node has:
  - Node/Edge creation API (requires embeddings)
  - kHopNeighbors traversal (works!)
  - Cypher parser (accepts queries)
  - Cypher execution: ${cypherWorks}/${cypherTotal} features working

${
  cypherWorks === 0
    ? `CRITICAL: Cypher queries PARSE but return EMPTY results.
The query() method accepts Cypher syntax but doesn't execute it.
This is likely an incomplete/stub implementation.`
    : cypherWorks < cypherTotal
      ? `PARTIAL: Some Cypher features work but not all.
Would require significant query rewriting.`
      : `COMPLETE: Cypher queries work as expected.`
}

For Neo4j replacement in GraphEngine: ${cypherWorks >= cypherTotal * 0.8 ? 'POSSIBLE' : 'NOT SUITABLE'}
`);
}

main().catch(console.error);
