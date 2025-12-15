/**
 * Check AgentDB data integrity
 */
import 'dotenv/config';
import { getUnifiedAgentDBService } from '../src/llm-engine/agentdb/unified-agentdb-service.js';

async function check() {
  const agentdb = await getUnifiedAgentDBService('default', 'PRDReviewProcess');

  const nodes = agentdb.getNodes();
  const edges = agentdb.getEdges();

  console.log('=== AgentDB Status ===');
  console.log('Nodes:', nodes.length);
  console.log('Edges:', edges.length);

  // Count by type
  const nodeTypes = new Map<string, number>();
  for (const n of nodes) {
    nodeTypes.set(n.type, (nodeTypes.get(n.type) || 0) + 1);
  }
  console.log('\nNode types:');
  for (const [type, count] of nodeTypes) {
    console.log('  ' + type + ':', count);
  }

  const edgeTypes = new Map<string, number>();
  for (const e of edges) {
    edgeTypes.set(e.type, (edgeTypes.get(e.type) || 0) + 1);
  }
  console.log('\nEdge types:');
  for (const [type, count] of edgeTypes) {
    console.log('  ' + type + ':', count);
  }

  // Check for duplicate edges
  const edgeKeys = new Map<string, string[]>();
  for (const e of edges) {
    const key = e.sourceId + '-' + e.type + '->' + e.targetId;
    const existing = edgeKeys.get(key) || [];
    existing.push(e.uuid);
    edgeKeys.set(key, existing);
  }

  let duplicates = 0;
  for (const [key, uuids] of edgeKeys) {
    if (uuids.length > 1) {
      duplicates++;
      console.log('\nDUPLICATE:', key, '(' + uuids.length + 'x)');
    }
  }
  console.log('\nTotal duplicate edge patterns:', duplicates);

  // Check for bidirectional io
  const ioEdges = edges.filter(e => e.type === 'io');
  const flows = nodes.filter(n => n.type === 'FLOW');

  let bidirectional = 0;
  for (const flow of flows) {
    const incoming = ioEdges.filter(e => e.targetId === flow.semanticId);
    const outgoing = ioEdges.filter(e => e.sourceId === flow.semanticId);

    for (const inc of incoming) {
      for (const out of outgoing) {
        if (inc.sourceId === out.targetId) {
          bidirectional++;
          console.log('\nBIDIRECTIONAL:', inc.sourceId, '<->', flow.semanticId);
        }
      }
    }
  }
  console.log('\nTotal bidirectional patterns:', bidirectional);

  // Summary
  console.log('\n=== Summary ===');
  if (duplicates === 0 && bidirectional === 0) {
    console.log('✅ AgentDB data is CLEAN');
  } else {
    console.log('❌ AgentDB has issues:', duplicates, 'duplicates,', bidirectional, 'bidirectional');
  }
}

check().catch(console.error);
