/**
 * AgentDB Integration Demo
 *
 * Demonstrates AgentDB caching and episodic memory in action.
 *
 * @author andreas@siglochconsulting
 */

import { getAgentDBService } from '../../src/llm-engine/agentdb/agentdb-service.js';

async function demo() {
  console.log('🚀 AgentDB Integration Demo\n');

  const agentdb = await getAgentDBService();

  console.log('📝 Test 1: Cache miss (first query)');
  const cached1 = await agentdb.checkCache('What is a system?');
  console.log('  Result:', cached1 ? 'CACHE HIT ✅' : 'CACHE MISS ❌');

  console.log('\n💾 Storing response in cache...');
  await agentdb.cacheResponse(
    'What is a system?',
    'A system is a set of interacting or interdependent components forming an integrated whole.',
    []
  );

  console.log('\n📝 Test 2: Exact match (should hit cache)');
  const cached2 = await agentdb.checkCache('What is a system?');
  console.log('  Result:', cached2 ? 'CACHE HIT ✅' : 'CACHE MISS ❌');
  if (cached2) {
    console.log('  Response:', cached2.response);
  }

  console.log('\n📝 Test 3: Similar query (word-based matching)');
  const cached3 = await agentdb.checkCache('what is system');
  console.log('  Result:', cached3 ? 'CACHE HIT ✅' : 'CACHE MISS ❌');
  if (cached3) {
    console.log('  Response:', cached3.response);
  }

  console.log('\n🧠 Test 4: Episodic memory (Reflexion)');
  await agentdb.storeEpisode('test-agent', 'Create a use case', true, { nodes: 5 }, 'Successfully created use case');
  await agentdb.storeEpisode('test-agent', 'Validate ontology', true, { violations: 0 }, 'Ontology is valid');
  await agentdb.storeEpisode('test-agent', 'Create system', false, {}, 'Missing system name');

  const episodes = await agentdb.loadAgentContext('test-agent', undefined, 5);
  console.log(`  Stored ${episodes.length} episodes for test-agent`);
  episodes.forEach((ep, i) => {
    console.log(`    ${i + 1}. ${ep.task} - ${ep.success ? 'SUCCESS ✅' : 'FAILED ❌'}`);
  });

  console.log('\n📊 Test 5: Cache metrics');
  const metrics = await agentdb.getMetrics();
  console.log('  Cache hits:', metrics.cacheHits);
  console.log('  Cache misses:', metrics.cacheMisses);
  console.log('  Hit rate:', `${(metrics.cacheHitRate * 100).toFixed(1)}%`);
  console.log('  Episodes stored:', metrics.episodesStored);
  console.log('  Tokens saved:', metrics.tokensSaved);
  console.log('  Cost savings:', `$${metrics.costSavings.toFixed(4)}`);

  console.log('\n✅ Demo complete!');
  await agentdb.shutdown();
}

demo().catch(console.error);
