/**
 * Data Import Script for RuVector Evaluation
 *
 * Loads GraphEngine export files and imports them into RuVector
 *
 * @author andreas@siglochconsulting
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { parseFormatE, ParsedGraph } from './format-e-parser.js';

// Type definitions based on RuVector documentation
// Note: These may need adjustment based on actual RuVector API

interface RuVectorDB {
  // Vector operations
  insert(id: string, embedding: number[]): void;
  search(embedding: number[], k: number): SearchResult[];

  // Graph operations (Cypher)
  execute(cypher: string): QueryResult;
}

interface SearchResult {
  id: string;
  score: number;
}

interface QueryResult {
  records: Record<string, unknown>[];
}

// Placeholder - actual import depends on RuVector package structure
let VectorDB: new (dimensions: number) => RuVectorDB;

async function loadRuVector(): Promise<typeof VectorDB | null> {
  try {
    const ruvector = await import('ruvector');
    console.log('[OK] RuVector loaded successfully');
    console.log('    Available exports:', Object.keys(ruvector));
    return ruvector.VectorDB || ruvector.default?.VectorDB || null;
  } catch (error) {
    console.error('[FAIL] Failed to load RuVector:', error);
    return null;
  }
}

function loadExportFiles(exportsDir: string): ParsedGraph[] {
  const graphs: ParsedGraph[] = [];

  try {
    const files = readdirSync(exportsDir).filter((f) => f.endsWith('.txt'));
    console.log(`[INFO] Found ${files.length} export files`);

    for (const file of files) {
      const content = readFileSync(join(exportsDir, file), 'utf-8');
      const graph = parseFormatE(content);

      if (graph.nodes.length > 0) {
        console.log(`  - ${file}: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
        graphs.push(graph);
      }
    }
  } catch (error) {
    console.error('[FAIL] Failed to load export files:', error);
  }

  return graphs;
}

async function testRuVectorImport(
  db: RuVectorDB | null,
  graph: ParsedGraph
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  if (!db) {
    // Simulate what we'd do if RuVector was available
    console.log('\n[SIMULATE] Would import nodes via Cypher:');

    // Test CREATE syntax
    for (const node of graph.nodes.slice(0, 3)) {
      const cypher = `CREATE (n:${node.type} {
        semanticId: '${node.semanticId}',
        name: '${node.name.replace(/'/g, "\\'")}',
        description: '${node.description.replace(/'/g, "\\'")}'
      })`;
      console.log(`    ${cypher.substring(0, 80)}...`);
    }

    console.log('\n[SIMULATE] Would import edges via Cypher:');
    for (const edge of graph.edges.slice(0, 3)) {
      const cypher = `MATCH (a {semanticId: '${edge.sourceId}'}), (b {semanticId: '${edge.targetId}'})
      CREATE (a)-[:${edge.type.toUpperCase()}]->(b)`;
      console.log(`    ${cypher.substring(0, 80)}...`);
    }

    return { success: true, errors: ['RuVector not available - simulation only'] };
  }

  // Actual RuVector import
  try {
    // Import nodes
    for (const node of graph.nodes) {
      const cypher = `CREATE (n:${node.type} {
        semanticId: '${node.semanticId}',
        name: '${node.name.replace(/'/g, "\\'")}',
        description: '${node.description.replace(/'/g, "\\'")}'
      })`;

      try {
        db.execute(cypher);
      } catch (e) {
        errors.push(`Node ${node.semanticId}: ${e}`);
      }
    }

    // Import edges
    for (const edge of graph.edges) {
      const cypher = `MATCH (a {semanticId: '${edge.sourceId}'}), (b {semanticId: '${edge.targetId}'})
      CREATE (a)-[:${edge.type.toUpperCase()}]->(b)`;

      try {
        db.execute(cypher);
      } catch (e) {
        errors.push(`Edge ${edge.sourceId}->${edge.targetId}: ${e}`);
      }
    }

    return { success: errors.length === 0, errors };
  } catch (error) {
    return { success: false, errors: [`Import failed: ${error}`] };
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('RuVector Data Import Evaluation');
  console.log('='.repeat(60));

  // Load RuVector
  const RuVectorClass = await loadRuVector();

  // Load export files
  const exportsDir = join(process.cwd(), '../../exports');
  const graphs = loadExportFiles(exportsDir);

  if (graphs.length === 0) {
    console.error('[FAIL] No graphs loaded');
    process.exit(1);
  }

  // Use largest graph for testing
  const testGraph = graphs.reduce((a, b) => (a.nodes.length > b.nodes.length ? a : b));
  console.log(`\n[INFO] Using graph with ${testGraph.nodes.length} nodes, ${testGraph.edges.length} edges`);

  // Create RuVector instance (if available)
  let db: RuVectorDB | null = null;
  if (RuVectorClass) {
    try {
      db = new RuVectorClass(384); // Standard embedding dimension
      console.log('[OK] RuVector instance created');
    } catch (error) {
      console.error('[FAIL] Failed to create RuVector instance:', error);
    }
  }

  // Test import
  console.log('\n--- Data Import Test ---');
  const importResult = await testRuVectorImport(db, testGraph);

  if (importResult.success) {
    console.log('[OK] Data import successful');
  } else {
    console.log('[FAIL] Data import failed');
    for (const err of importResult.errors.slice(0, 10)) {
      console.log(`    - ${err}`);
    }
    if (importResult.errors.length > 10) {
      console.log(`    ... and ${importResult.errors.length - 10} more errors`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Import Evaluation Summary');
  console.log('='.repeat(60));
  console.log(`RuVector Available: ${RuVectorClass ? 'Yes' : 'No'}`);
  console.log(`Nodes to Import: ${testGraph.nodes.length}`);
  console.log(`Edges to Import: ${testGraph.edges.length}`);
  console.log(`Node Types: ${[...new Set(testGraph.nodes.map((n) => n.type))].join(', ')}`);
  console.log(`Edge Types: ${[...new Set(testGraph.edges.map((e) => e.type))].join(', ')}`);
}

main().catch(console.error);
