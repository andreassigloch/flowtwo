/**
 * Check Neo4j state - debug script
 */
import 'dotenv/config';
import { Neo4jClient } from '../src/neo4j-client/neo4j-client.js';

async function main() {
  const client = new Neo4jClient({
    uri: process.env.NEO4J_URI || '',
    user: process.env.NEO4J_USER || '',
    password: process.env.NEO4J_PASSWORD || '',
  });

  const session = client['getSession']();

  // Check AppSession
  const sessionResult = await session.run('MATCH (s:AppSession) RETURN s.userId, s.workspaceId, s.activeSystemId, s.chatId LIMIT 5');
  console.log('=== AppSession nodes ===');
  if (sessionResult.records.length === 0) {
    console.log('  (none found)');
  } else {
    sessionResult.records.forEach(r => {
      console.log('  userId:', r.get('s.userId'), '| workspace:', r.get('s.workspaceId'), '| activeSystemId:', r.get('s.activeSystemId'));
    });
  }

  // Check SYS nodes
  const sysResult = await session.run('MATCH (n) WHERE n.type = "SYS" RETURN n.semanticId, n.name, n.workspaceId LIMIT 10');
  console.log('\n=== SYS nodes ===');
  if (sysResult.records.length === 0) {
    console.log('  (none found)');
  } else {
    sysResult.records.forEach(r => {
      console.log('  ', r.get('n.semanticId'), '|', r.get('n.name'), '| workspace:', r.get('n.workspaceId'));
    });
  }

  // Check total node count
  const countResult = await session.run('MATCH (n) RETURN count(n) as total');
  console.log('\n=== Total nodes in Neo4j ===');
  console.log('  ', countResult.records[0].get('total').toString());

  // Check what types of nodes exist
  const typesResult = await session.run('MATCH (n) RETURN DISTINCT labels(n) as labels, n.type as type, count(*) as count ORDER BY count DESC LIMIT 20');
  console.log('\n=== Node types breakdown ===');
  typesResult.records.forEach(r => {
    const labels = r.get('labels');
    const type = r.get('type');
    const count = r.get('count').toString();
    console.log('  ', labels?.join(':') || '(no label)', '| type:', type || '(none)', '| count:', count);
  });

  // Check orphan nodes systemId
  const orphanResult = await session.run('MATCH (n:Node) RETURN DISTINCT n.systemId, n.workspaceId, count(*) as cnt ORDER BY cnt DESC');
  console.log('\n=== Orphan nodes by systemId ===');
  orphanResult.records.forEach(r => {
    console.log('  systemId:', r.get('n.systemId'), '| workspace:', r.get('n.workspaceId'), '| count:', r.get('cnt').toString());
  });

  await session.close();
  await client.close();
}

main().catch(console.error);
