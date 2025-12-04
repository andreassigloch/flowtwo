/**
 * Query Evaluation Script for RuVector
 *
 * Tests GraphEngine's validation queries against RuVector's Cypher support
 *
 * @author andreas@siglochconsulting
 */

/**
 * GraphEngine Validation Queries (from validation-queries.ts)
 *
 * These are the actual Cypher queries used in production.
 * We test RuVector's ability to execute them.
 */
export const VALIDATION_QUERIES = [
  {
    code: 'V1',
    name: 'Format as FUNC',
    complexity: 'MEDIUM',
    features: ['MATCH', 'WHERE', 'OR', 'CONTAINS', 'RETURN'],
    cypher: `
      MATCH (s:SYS)-[:compose]->(f:FUNC)
      WHERE f.Name CONTAINS 'Serialization'
         OR f.Name CONTAINS 'Format'
         OR f.Name CONTAINS 'Protocol'
         OR f.Name CONTAINS 'Schema'
      RETURN f.semanticId AS semanticId,
             f.Name AS name,
             'Top-Level FUNC should not be a data format' AS issue
    `,
  },
  {
    code: 'V2',
    name: 'FLOW missing SCHEMA',
    complexity: 'MEDIUM',
    features: ['MATCH', 'WHERE', 'NOT', 'pattern negation'],
    cypher: `
      MATCH (fl:FLOW)
      WHERE NOT (fl)-[:relation]->(:SCHEMA)
      RETURN fl.semanticId AS semanticId,
             fl.Name AS name,
             'FLOW missing Data SCHEMA relation (Layer 2)' AS issue
    `,
  },
  {
    code: 'V4',
    name: "Miller's Law Violation",
    complexity: 'HIGH',
    features: ['MATCH', 'WITH', 'count()', 'WHERE on aggregation'],
    cypher: `
      MATCH (s:SYS)-[:compose]->(f:FUNC)
      WITH s, count(f) AS func_count
      WHERE func_count < 5 OR func_count > 9
      RETURN s.semanticId AS semanticId,
             s.Name AS name,
             'Violates Miller''s Law (5-9 blocks), has ' + toString(func_count) AS issue
    `,
  },
  {
    code: 'V5',
    name: 'Inter-block FLOW missing Protocol',
    complexity: 'HIGH',
    features: ['MATCH chain', 'WHERE NOT', 'variable-length path'],
    cypher: `
      MATCH (f1:FUNC)-[:io]->(fl:FLOW)-[:io]->(f2:FUNC)
      WHERE NOT (fl)-[:relation]->(:SCHEMA {category: 'protocol'})
        AND NOT (f1)-[:compose*1..2]-(f2)
      RETURN fl.semanticId AS semanticId,
             fl.Name AS name,
             'Inter-block FLOW should have Protocol SCHEMA' AS issue
    `,
  },
  {
    code: 'V6',
    name: 'Redundant SCHEMAs',
    complexity: 'MEDIUM',
    features: ['MATCH two nodes', 'WHERE comparison', 'CONTAINS'],
    cypher: `
      MATCH (s1:SCHEMA), (s2:SCHEMA)
      WHERE s1.semanticId < s2.semanticId
        AND (s1.Name CONTAINS s2.Name OR s2.Name CONTAINS s1.Name)
      RETURN s1.semanticId AS semanticId,
             s1.Name + ' / ' + s2.Name AS name,
             'Potentially redundant schemas - consider merging' AS issue
    `,
  },
  {
    code: 'V8',
    name: 'Schema Variance Too High',
    complexity: 'HIGH',
    features: ['MATCH', 'WITH', 'split()', 'collect()', 'size()'],
    cypher: `
      MATCH (s:SCHEMA)
      WITH split(s.Name, 'Schema')[0] AS domain, collect(s) AS schemas
      WHERE size(schemas) > 3
      RETURN domain AS semanticId,
             domain AS name,
             'Too many schemas in domain (' + toString(size(schemas)) + ') - consider consolidation' AS issue
    `,
  },
  {
    code: 'V9',
    name: 'Nested FUNC Schema Mismatch',
    complexity: 'VERY_HIGH',
    features: ['MATCH nested', 'WHERE NOT EXISTS', 'subquery'],
    cypher: `
      MATCH (parent:FUNC)-[:compose]->(child:FUNC)
      MATCH (parent)-[:io]->(parentFlow:FLOW)
      WHERE NOT EXISTS {
        MATCH (child)-[:io]->(:FLOW)-[:relation]->(:SCHEMA)<-[:relation]-(parentFlow)
      }
      RETURN child.semanticId AS semanticId,
             child.Name AS name,
             'Nested FUNC does not use parent FLOW schema' AS issue
    `,
  },
];

/**
 * GraphEngine CRUD Queries (from neo4j-client.ts)
 */
export const CRUD_QUERIES = [
  {
    name: 'Save Nodes (Batch)',
    complexity: 'HIGH',
    features: ['UNWIND', 'MERGE', 'SET multiple properties', 'datetime()'],
    cypher: `
      UNWIND $nodes AS nodeData
      MERGE (n:Node {uuid: nodeData.uuid})
      SET n.semanticId = nodeData.semanticId,
          n.type = nodeData.type,
          n.name = nodeData.name,
          n.description = nodeData.description,
          n.workspaceId = nodeData.workspaceId,
          n.systemId = nodeData.systemId,
          n.position = nodeData.position,
          n.zoomLevel = nodeData.zoomLevel,
          n.createdAt = datetime(nodeData.createdAt),
          n.updatedAt = datetime(nodeData.updatedAt),
          n.createdBy = nodeData.createdBy
      RETURN count(n) as count
    `,
  },
  {
    name: 'Save Edges (Batch)',
    complexity: 'HIGH',
    features: ['UNWIND', 'MATCH x2', 'MERGE relationship', 'SET on relationship'],
    cypher: `
      UNWIND $edges AS edgeData
      MATCH (source:Node {semanticId: edgeData.sourceId})
      MATCH (target:Node {semanticId: edgeData.targetId})
      MERGE (source)-[r:EDGE {uuid: edgeData.uuid}]->(target)
      SET r.semanticId = edgeData.semanticId,
          r.type = edgeData.type,
          r.workspaceId = edgeData.workspaceId,
          r.systemId = edgeData.systemId,
          r.createdAt = datetime(edgeData.createdAt),
          r.updatedAt = datetime(edgeData.updatedAt),
          r.createdBy = edgeData.createdBy
      RETURN count(r) as count
    `,
  },
  {
    name: 'Load Graph',
    complexity: 'MEDIUM',
    features: ['MATCH', 'WHERE', 'dynamic IN', 'RETURN'],
    cypher: `
      MATCH (n:Node)
      WHERE n.workspaceId = $workspaceId
        AND n.systemId = $systemId
        AND n.type IN $nodeTypes
      RETURN n
    `,
  },
  {
    name: 'List Systems',
    complexity: 'HIGH',
    features: ['MATCH with OR labels', 'WITH DISTINCT', 'count()', 'IS NOT NULL'],
    cypher: `
      MATCH (n)
      WHERE (n:Node OR n:OntologyNode)
        AND n.workspaceId = $workspaceId
        AND n.systemId IS NOT NULL
      WITH DISTINCT n.systemId as systemId, count(n) as nodeCount
      WHERE systemId IS NOT NULL
      RETURN systemId, nodeCount
      ORDER BY systemId
    `,
  },
  {
    name: 'Get Graph Stats',
    complexity: 'HIGH',
    features: ['MATCH', 'WITH aggregation', 'collect()', 'sum()', 'UNION'],
    cypher: `
      MATCH (n:Node)
      WHERE n.workspaceId = $workspaceId
        AND n.systemId = $systemId
      WITH n.type as type, count(n) as count
      RETURN collect({type: type, count: count}) as nodesByType,
             sum(count) as totalNodes
      UNION
      MATCH ()-[r:EDGE]->()
      WHERE r.workspaceId = $workspaceId
        AND r.systemId = $systemId
      WITH r.type as type, count(r) as count
      RETURN collect({type: type, count: count}) as edgesByType,
             sum(count) as totalEdges
    `,
  },
];

interface TestResult {
  query: string;
  name: string;
  complexity: string;
  features: string[];
  supported: 'YES' | 'NO' | 'PARTIAL' | 'UNKNOWN';
  error?: string;
  notes?: string;
}

async function testQuery(
  db: unknown,
  query: (typeof VALIDATION_QUERIES)[0] | (typeof CRUD_QUERIES)[0]
): Promise<TestResult> {
  const result: TestResult = {
    query: 'code' in query ? query.code : query.name,
    name: query.name,
    complexity: query.complexity,
    features: query.features,
    supported: 'UNKNOWN',
  };

  // Check for features RuVector likely doesn't support (based on documentation)
  const unsupportedFeatures = [
    'NOT EXISTS',
    'subquery',
    'variable-length path',
    'UNION',
    'datetime()',
    'split()',
  ];

  const hasUnsupported = query.features.some((f) =>
    unsupportedFeatures.some((u) => f.toLowerCase().includes(u.toLowerCase()))
  );

  if (hasUnsupported) {
    result.supported = 'NO';
    result.notes = `Uses features likely unsupported: ${query.features.filter((f) =>
      unsupportedFeatures.some((u) => f.toLowerCase().includes(u.toLowerCase()))
    ).join(', ')}`;
    return result;
  }

  // If we have a db instance, try to execute
  if (db && typeof (db as { execute?: unknown }).execute === 'function') {
    try {
      (db as { execute: (q: string) => void }).execute(query.cypher);
      result.supported = 'YES';
    } catch (error) {
      result.supported = 'NO';
      result.error = String(error);
    }
  } else {
    // Static analysis based on documented RuVector capabilities
    const basicFeatures = ['MATCH', 'WHERE', 'RETURN', 'CREATE'];
    const allBasic = query.features.every((f) =>
      basicFeatures.some((b) => f.toUpperCase().includes(b))
    );

    if (allBasic) {
      result.supported = 'PARTIAL';
      result.notes = 'Basic features only - may work with simple patterns';
    } else {
      result.supported = 'UNKNOWN';
      result.notes = 'Cannot verify without RuVector instance';
    }
  }

  return result;
}

async function main() {
  console.log('='.repeat(70));
  console.log('RuVector Query Compatibility Evaluation');
  console.log('='.repeat(70));

  // Try to load RuVector
  let db: unknown = null;
  try {
    const ruvector = await import('ruvector');
    if (ruvector.VectorDB) {
      db = new ruvector.VectorDB(384);
      console.log('[OK] RuVector loaded - will test actual execution\n');
    }
  } catch {
    console.log('[INFO] RuVector not available - using static analysis\n');
  }

  // Test validation queries
  console.log('--- Validation Queries (from validation-queries.ts) ---\n');
  const validationResults: TestResult[] = [];

  for (const query of VALIDATION_QUERIES) {
    const result = await testQuery(db, query);
    validationResults.push(result);

    const icon = result.supported === 'YES' ? '[OK]' : result.supported === 'NO' ? '[FAIL]' : '[?]';
    console.log(`${icon} ${result.query}: ${result.name}`);
    console.log(`    Complexity: ${result.complexity}`);
    console.log(`    Features: ${result.features.join(', ')}`);
    console.log(`    Supported: ${result.supported}`);
    if (result.notes) console.log(`    Notes: ${result.notes}`);
    if (result.error) console.log(`    Error: ${result.error}`);
    console.log();
  }

  // Test CRUD queries
  console.log('--- CRUD Queries (from neo4j-client.ts) ---\n');
  const crudResults: TestResult[] = [];

  for (const query of CRUD_QUERIES) {
    const result = await testQuery(db, query);
    crudResults.push(result);

    const icon = result.supported === 'YES' ? '[OK]' : result.supported === 'NO' ? '[FAIL]' : '[?]';
    console.log(`${icon} ${result.name}`);
    console.log(`    Complexity: ${result.complexity}`);
    console.log(`    Features: ${result.features.join(', ')}`);
    console.log(`    Supported: ${result.supported}`);
    if (result.notes) console.log(`    Notes: ${result.notes}`);
    if (result.error) console.log(`    Error: ${result.error}`);
    console.log();
  }

  // Summary
  console.log('='.repeat(70));
  console.log('Compatibility Summary');
  console.log('='.repeat(70));

  const allResults = [...validationResults, ...crudResults];
  const supported = allResults.filter((r) => r.supported === 'YES').length;
  const partial = allResults.filter((r) => r.supported === 'PARTIAL').length;
  const unsupported = allResults.filter((r) => r.supported === 'NO').length;
  const unknown = allResults.filter((r) => r.supported === 'UNKNOWN').length;

  console.log(`Total Queries Tested: ${allResults.length}`);
  console.log(`  Fully Supported:    ${supported} (${((supported / allResults.length) * 100).toFixed(0)}%)`);
  console.log(`  Partially Supported: ${partial} (${((partial / allResults.length) * 100).toFixed(0)}%)`);
  console.log(`  Not Supported:      ${unsupported} (${((unsupported / allResults.length) * 100).toFixed(0)}%)`);
  console.log(`  Unknown:            ${unknown} (${((unknown / allResults.length) * 100).toFixed(0)}%)`);

  console.log('\n--- Critical Missing Features ---');
  const missingFeatures = new Set<string>();
  for (const result of allResults.filter((r) => r.supported === 'NO')) {
    if (result.notes) {
      const features = result.notes.match(/Uses features likely unsupported: (.+)/)?.[1];
      if (features) {
        features.split(', ').forEach((f) => missingFeatures.add(f));
      }
    }
  }
  console.log(Array.from(missingFeatures).join(', ') || 'None identified');

  console.log('\n--- Recommendation ---');
  if (unsupported > allResults.length * 0.3) {
    console.log('NOT RECOMMENDED: Too many critical queries unsupported');
    console.log('RuVector cannot replace Neo4j for this application.');
  } else if (unsupported > 0) {
    console.log('PARTIAL: Some queries need refactoring');
    console.log('Consider RuVector only if you can simplify these queries.');
  } else {
    console.log('POSSIBLE: Queries appear compatible');
    console.log('Recommend thorough testing before migration.');
  }
}

main().catch(console.error);
