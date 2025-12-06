/**
 * Neo4j Database Cleanup Script
 *
 * Shows systems and incomplete nodes.
 * Pass --delete to actually delete non-target nodes.
 *
 * Usage:
 *   npx tsx scripts/cleanup-neo4j.ts                    # Show only
 *   npx tsx scripts/cleanup-neo4j.ts --delete           # Delete non-GraphEngine nodes
 *   npx tsx scripts/cleanup-neo4j.ts --keep "SystemId"  # Keep specific system
 *
 * @author andreas@siglochconsulting
 */

import neo4j from 'neo4j-driver';

const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

async function cleanup() {
  const args = process.argv.slice(2);
  const doDelete = args.includes('--delete');
  const keepIndex = args.indexOf('--keep');
  const keepSystem = keepIndex >= 0 ? args[keepIndex + 1] : null;

  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session();

  try {
    // First, show what systems exist
    console.log('=== Systems in Neo4j ===');
    const systemsResult = await session.run(`
      MATCH (n:Node)
      RETURN DISTINCT n.systemId as systemId, n.workspaceId as workspaceId, count(*) as nodeCount
      ORDER BY nodeCount DESC
    `);

    if (systemsResult.records.length === 0) {
      console.log('  (no nodes in database)');
    } else {
      for (const record of systemsResult.records) {
        const systemId = record.get('systemId');
        const workspaceId = record.get('workspaceId');
        const count = record.get('nodeCount').toNumber();
        console.log(`  ${systemId} (${workspaceId}): ${count} nodes`);
      }
    }

    // Find nodes with missing properties
    console.log('\n=== Incomplete Nodes ===');
    const incompleteResult = await session.run(`
      MATCH (n:Node)
      WHERE n.uuid IS NULL OR n.type IS NULL OR n.name IS NULL OR n.name = '' OR n.descr IS NULL OR n.descr = ''
      RETURN coalesce(n.semanticId, n.name, 'unknown') as id, n.type as type, n.systemId as systemId
      LIMIT 20
    `);

    if (incompleteResult.records.length === 0) {
      console.log('  None found');
    } else {
      for (const record of incompleteResult.records) {
        console.log(`  ${record.get('id')} (type: ${record.get('type')}, system: ${record.get('systemId')})`);
      }
    }

    if (!doDelete) {
      console.log('\n=== Dry Run ===');
      console.log('  Use --delete to actually delete nodes');
      console.log('  Use --keep "SystemId" to specify which system to keep');
      return;
    }

    // Delete nodes not belonging to target system
    const targetSystem = keepSystem || 'GraphEngine';
    console.log(`\n=== Cleaning (keeping ${targetSystem}*) ===`);
    const deleteResult = await session.run(`
      MATCH (n:Node)
      WHERE NOT n.systemId STARTS WITH $targetSystem
         OR n.systemId IS NULL
         OR n.uuid IS NULL
         OR n.type IS NULL
         OR n.name IS NULL OR n.name = ''
         OR n.descr IS NULL OR n.descr = ''
      DETACH DELETE n
      RETURN count(*) as deleted
    `, { targetSystem });

    const deleted = deleteResult.records[0]?.get('deleted').toNumber() || 0;
    console.log(`  Deleted: ${deleted} nodes`);

    // Show remaining
    console.log('\n=== Remaining Systems ===');
    const remainingResult = await session.run(`
      MATCH (n:Node)
      RETURN DISTINCT n.systemId as systemId, count(*) as nodeCount
      ORDER BY nodeCount DESC
    `);

    if (remainingResult.records.length === 0) {
      console.log('  (no nodes remaining)');
    } else {
      for (const record of remainingResult.records) {
        const systemId = record.get('systemId');
        const count = record.get('nodeCount').toNumber();
        console.log(`  ${systemId}: ${count} nodes`);
      }
    }

  } finally {
    await session.close();
    await driver.close();
  }
}

cleanup().catch(console.error);
