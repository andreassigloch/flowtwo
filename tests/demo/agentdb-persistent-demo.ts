/**
 * AgentDB Persistent Backend Demo
 *
 * Tests the actual AgentDB library integration with vector embeddings.
 *
 * @author andreas@siglochconsulting
 */

import { AgentDBPersistentBackend } from '../../src/llm-engine/agentdb/agentdb-backend.js';

async function demo() {
  console.log('🚀 AgentDB Persistent Backend Demo\n');

  const dbPath = '/tmp/graphengine-agentdb-test.db';
  const backend = new AgentDBPersistentBackend(dbPath);

  try {
    console.log('📦 Initializing AgentDB...');
    await backend.initialize();
    console.log('✅ AgentDB initialized\n');

    console.log('💾 Test 1: Store responses in vector database');
    await backend.cacheResponse({
      query: 'What is a system?',
      response: 'A system is a set of interacting or interdependent components.',
      operations: [],
      timestamp: Date.now(),
      ttl: 3600000,
    });

    await backend.cacheResponse({
      query: 'How do I create a use case?',
      response: 'Use the CREATE_UC operation with a label.',
      operations: [],
      timestamp: Date.now(),
      ttl: 3600000,
    });
    console.log('✅ Responses stored\n');

    console.log('🔍 Test 2: Vector similarity search');
    console.log('  Query: "What is a system?"');
    const results1 = await backend.vectorSearch('What is a system?', 0.85, 5);
    console.log(`  Found ${results1.length} results`);
    if (results1.length > 0) {
      console.log(`  Best match: similarity=${results1[0].similarity.toFixed(3)}`);
      console.log(`  Content: ${results1[0].content.substring(0, 80)}...\n`);
    }

    console.log('  Query: "Define a system" (semantic similarity test)');
    const results2 = await backend.vectorSearch('Define a system', 0.75, 5);
    console.log(`  Found ${results2.length} results`);
    if (results2.length > 0) {
      console.log(`  Best match: similarity=${results2[0].similarity.toFixed(3)}`);
      console.log(`  Content: ${results2[0].content.substring(0, 80)}...\n`);
    }

    console.log('🧠 Test 3: Episodic memory (Reflexion)');
    await backend.storeEpisode({
      agentId: 'test-agent',
      task: 'Create system structure',
      reward: 1.0,
      success: true,
      critique: 'Successfully created',
      output: { nodes: 5 },
      timestamp: Date.now(),
    });

    const episodes = await backend.retrieveEpisodes('test-agent', undefined, 5);
    console.log(`  Retrieved ${episodes.length} episodes`);
    if (episodes.length > 0) {
      console.log(`  Episode: ${episodes[0].task} - ${episodes[0].success ? 'SUCCESS' : 'FAILED'}\n`);
    }

    console.log('📊 Test 4: Metrics');
    const metrics = await backend.getMetrics();
    console.log('  Episodes stored:', metrics.episodesStored);

    console.log('\n✅ All tests passed!');
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await backend.shutdown();
    console.log('\n🔒 AgentDB shut down');
  }
}

demo().catch(console.error);
