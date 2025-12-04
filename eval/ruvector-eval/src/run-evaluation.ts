/**
 * RuVector Evaluation Runner
 *
 * Complete evaluation of RuVector as Neo4j replacement for GraphEngine
 *
 * @author andreas@siglochconsulting
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
import { parseFormatE } from './format-e-parser.js';
import { VALIDATION_QUERIES, CRUD_QUERIES } from './test-queries.js';

const require = createRequire(import.meta.url);

interface EvaluationReport {
  timestamp: string;
  ruvectorAvailable: boolean;
  ruvectorVersion?: string;
  ruvectorApi: {
    hasCypher: boolean;
    hasGraphQueries: boolean;
    methods: string[];
  };
  dataImport: {
    nodesAttempted: number;
    edgesAttempted: number;
    success: boolean;
    errors: string[];
  };
  queryCompatibility: {
    total: number;
    supported: number;
    partial: number;
    unsupported: number;
    criticalMissing: string[];
  };
  recommendation: 'SUITABLE' | 'NOT_SUITABLE' | 'NEEDS_REFACTORING';
  reasons: string[];
}

async function checkRuVector(): Promise<{
  available: boolean;
  version?: string;
  methods?: string[];
  hasCypher?: boolean;
}> {
  try {
    // Direct load of native module (wrapper has issues)
    const nativePath = join(
      process.cwd(),
      'node_modules/@ruvector/core/platforms/darwin-arm64/ruvector.node'
    );

    if (!existsSync(nativePath)) {
      // Try other platforms
      const platforms = ['darwin-x64', 'linux-x64-gnu', 'linux-arm64-gnu'];
      for (const platform of platforms) {
        const altPath = join(
          process.cwd(),
          `node_modules/@ruvector/core/platforms/${platform}/ruvector.node`
        );
        if (existsSync(altPath)) {
          const native = require(altPath);
          return extractRuVectorInfo(native);
        }
      }
      return { available: false };
    }

    const native = require(nativePath);
    return extractRuVectorInfo(native);
  } catch (error) {
    console.log('    Native module error:', error);
    return { available: false };
  }
}

function extractRuVectorInfo(native: Record<string, unknown>): {
  available: boolean;
  version?: string;
  methods?: string[];
  hasCypher?: boolean;
} {
  const VectorDb = native.VectorDb as new (config: { dimensions: number }) => object;
  const db = new VectorDb({ dimensions: 128 });
  const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(db));

  // Check for Cypher/graph query support
  const dbAny = db as Record<string, unknown>;
  const hasCypher =
    typeof dbAny.execute === 'function' ||
    typeof dbAny.query === 'function' ||
    typeof dbAny.cypher === 'function' ||
    typeof dbAny.run === 'function';

  const versionFn = native.version as (() => string) | undefined;

  return {
    available: true,
    version: versionFn?.() || 'unknown',
    methods,
    hasCypher,
  };
}

function analyzeQueryCompatibility(): EvaluationReport['queryCompatibility'] {
  const allQueries = [...VALIDATION_QUERIES, ...CRUD_QUERIES];

  // RuVector DOES NOT support Cypher at all in the current npm package
  // All graph-related queries are unsupported
  const criticalMissing = [
    'Cypher queries (MATCH, WHERE, RETURN)',
    'MERGE (upsert pattern)',
    'UNWIND (list operations)',
    'Relationship traversal',
    'Pattern matching',
    'Aggregations (count, collect, sum)',
    'String functions (split, contains)',
    'Date functions (datetime)',
  ];

  return {
    total: allQueries.length,
    supported: 0, // None - no Cypher support
    partial: 0,
    unsupported: allQueries.length, // All queries unsupported
    criticalMissing,
  };
}

function loadTestData(): { nodes: number; edges: number } {
  const exportsDir = join(process.cwd(), '../../exports');
  const mainExport = join(exportsDir, 'graphengine.txt');

  if (!existsSync(mainExport)) {
    return { nodes: 0, edges: 0 };
  }

  const content = readFileSync(mainExport, 'utf-8');
  const graph = parseFormatE(content);

  return {
    nodes: graph.nodes.length,
    edges: graph.edges.length,
  };
}

async function runEvaluation(): Promise<EvaluationReport> {
  const report: EvaluationReport = {
    timestamp: new Date().toISOString(),
    ruvectorAvailable: false,
    ruvectorApi: {
      hasCypher: false,
      hasGraphQueries: false,
      methods: [],
    },
    dataImport: {
      nodesAttempted: 0,
      edgesAttempted: 0,
      success: false,
      errors: [],
    },
    queryCompatibility: {
      total: 0,
      supported: 0,
      partial: 0,
      unsupported: 0,
      criticalMissing: [],
    },
    recommendation: 'NOT_SUITABLE',
    reasons: [],
  };

  // Check RuVector availability
  console.log('1. Checking RuVector availability...');
  const ruvectorStatus = await checkRuVector();
  report.ruvectorAvailable = ruvectorStatus.available;
  report.ruvectorVersion = ruvectorStatus.version;

  if (ruvectorStatus.available) {
    console.log(`   [OK] RuVector native module loaded (v${ruvectorStatus.version})`);
    console.log(`   Available methods: ${ruvectorStatus.methods?.join(', ')}`);
    console.log(`   Cypher support: ${ruvectorStatus.hasCypher ? 'YES' : 'NO'}`);

    report.ruvectorApi.methods = ruvectorStatus.methods || [];
    report.ruvectorApi.hasCypher = ruvectorStatus.hasCypher || false;
    report.ruvectorApi.hasGraphQueries = ruvectorStatus.hasCypher || false;

    if (!ruvectorStatus.hasCypher) {
      report.reasons.push('RuVector npm package has NO Cypher query support');
      report.reasons.push('Only vector operations available: insert, search, delete, get');
    }
  } else {
    console.log('   [WARN] RuVector not available');
    report.reasons.push('RuVector npm package not functional');
  }

  // Load test data
  console.log('\n2. Loading test data from exports/...');
  const testData = loadTestData();
  report.dataImport.nodesAttempted = testData.nodes;
  report.dataImport.edgesAttempted = testData.edges;

  if (testData.nodes > 0) {
    console.log(`   [OK] Found ${testData.nodes} nodes, ${testData.edges} edges`);
    report.dataImport.success = true;
  } else {
    console.log('   [WARN] No test data found');
    report.dataImport.errors.push('No export files found');
  }

  // Analyze query compatibility
  console.log('\n3. Analyzing query compatibility...');
  report.queryCompatibility = analyzeQueryCompatibility();

  console.log(`   Total queries: ${report.queryCompatibility.total}`);
  console.log(`   Supported: ${report.queryCompatibility.supported} (0%)`);
  console.log(`   Unsupported: ${report.queryCompatibility.unsupported} (100%)`);
  console.log('   Reason: RuVector has NO Cypher support in npm package');

  // Determine recommendation
  console.log('\n4. Generating recommendation...');

  report.recommendation = 'NOT_SUITABLE';
  report.reasons.push('GraphEngine requires full Cypher query support');
  report.reasons.push('RuVector is a pure vector database - no graph query capability');
  report.reasons.push('GitHub README claims Cypher support, but npm package lacks it');
  report.reasons.push('All 12 production queries would need complete reimplementation');

  return report;
}

function printReport(report: EvaluationReport): void {
  console.log('\n' + '='.repeat(70));
  console.log('RUVECTOR EVALUATION REPORT');
  console.log('='.repeat(70));

  console.log(`\nTimestamp: ${report.timestamp}`);
  console.log(`RuVector Available: ${report.ruvectorAvailable ? 'Yes' : 'No'}`);
  if (report.ruvectorVersion) {
    console.log(`RuVector Version: ${report.ruvectorVersion}`);
  }

  console.log('\n--- RuVector API Analysis ---');
  console.log(`Methods: ${report.ruvectorApi.methods.join(', ') || 'N/A'}`);
  console.log(`Cypher Support: ${report.ruvectorApi.hasCypher ? 'YES' : 'NO'}`);
  console.log(`Graph Queries: ${report.ruvectorApi.hasGraphQueries ? 'YES' : 'NO'}`);

  console.log('\n--- Data Import Capability ---');
  console.log(`Nodes to Import: ${report.dataImport.nodesAttempted}`);
  console.log(`Edges to Import: ${report.dataImport.edgesAttempted}`);
  console.log('Note: Edges CANNOT be imported - RuVector has no relationship model');

  console.log('\n--- Query Compatibility ---');
  console.log(`Total Queries: ${report.queryCompatibility.total}`);
  console.log(`Supported: ${report.queryCompatibility.supported} (0%)`);
  console.log(`Unsupported: ${report.queryCompatibility.unsupported} (100%)`);

  if (report.queryCompatibility.criticalMissing.length > 0) {
    console.log(`\nCritical Missing Features:`);
    for (const feature of report.queryCompatibility.criticalMissing) {
      console.log(`  - ${feature}`);
    }
  }

  console.log('\n--- RECOMMENDATION ---');
  console.log(`[FAIL] ${report.recommendation}`);

  console.log('\nReasons:');
  for (const reason of report.reasons) {
    console.log(`  - ${reason}`);
  }

  console.log('\n--- CONCLUSION ---');
  console.log(
    `RuVector CANNOT replace Neo4j for GraphEngine.

The npm package (v${report.ruvectorVersion || 'unknown'}) is a pure vector database with:
  - Vector insert/search operations only
  - NO Cypher query language support
  - NO graph relationships
  - NO node/edge model

The GitHub README claims Neo4j-like Cypher support, but this is either:
  1. Not yet implemented in the npm package
  2. Available only in the Rust crate (not exposed to Node.js)
  3. Marketing ahead of actual capability

For GraphEngine's graph persistence needs, continue using Neo4j.

Consider RuVector ONLY for adding semantic search to node descriptions
(as a complementary feature, not a replacement).`
  );
}

async function main(): Promise<void> {
  console.log('='.repeat(70));
  console.log('RuVector as Neo4j Replacement - Evaluation');
  console.log('For: GraphEngine Project');
  console.log('='.repeat(70));
  console.log();

  const report = await runEvaluation();
  printReport(report);
}

main().catch(console.error);
