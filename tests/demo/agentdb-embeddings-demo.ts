/**
 * AgentDB Embeddings Demo
 *
 * Tests semantic vector search with OpenAI embeddings (ported from aise project).
 *
 * @author andreas@siglochconsulting
 */

import { AgentDBPersistentBackend } from '../../src/llm-engine/agentdb/agentdb-backend.js';

async function demo() {
  console.log('🚀 AgentDB with OpenAI Embeddings Demo\n');

  const dbPath = '/tmp/graphengine-agentdb-embeddings-test.db';
  const backend = new AgentDBPersistentBackend(dbPath);

  try {
    console.log('📦 Initializing AgentDB with embeddings...');
    await backend.initialize();
    console.log('✅ AgentDB initialized\n');

    console.log('💾 Test 1: Store responses with vector embeddings');
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
    console.log('✅ Responses stored with embeddings\n');

    console.log('🔍 Test 2: Semantic search - Exact match');
    console.log('  Query: "What is a system?"');
    const results1 = await backend.vectorSearch('What is a system?', 0.85, 5);
    console.log(`  Found ${results1.length} results`);
    if (results1.length > 0) {
      console.log(`  Best match: similarity=${results1[0].similarity.toFixed(3)}`);
      console.log(`  Content: ${results1[0].content}\n`);
    }

    console.log('🔍 Test 3: Semantic search - Paraphrase (THIS IS THE KEY TEST!)');
    console.log('  Query: "Define a system" (should match "What is a system?")');
    const results2 = await backend.vectorSearch('Define a system', 0.75, 5);
    console.log(`  Found ${results2.length} results`);
    if (results2.length > 0) {
      console.log(`  Best match: similarity=${results2[0].similarity.toFixed(3)}`);
      console.log(`  Content: ${results2[0].content}`);
      console.log(`  ✅ Semantic matching works! "Define" ≈ "What is"\n`);
    } else {
      console.log('  ❌ No matches - semantic search might not be working\n');
    }

    console.log('🔍 Test 4: Semantic search - Synonyms');
    console.log('  Query: "How to add a use case"');
    const results3 = await backend.vectorSearch('How to add a use case', 0.70, 5);
    console.log(`  Found ${results3.length} results`);
    if (results3.length > 0) {
      console.log(`  Best match: similarity=${results3[0].similarity.toFixed(3)}`);
      console.log(`  Content: ${results3[0].content}\n`);
    }

    console.log('📊 Test 5: Metrics');
    const metrics = await backend.getMetrics();
    console.log('  Episodes stored:', metrics.episodesStored);
    console.log('  Cache hits:', metrics.cacheHits);
    console.log('  Cache misses:', metrics.cacheMisses);

    console.log('\n✅ All tests complete!');
  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    if (error.message.includes('API key')) {
      console.error('\n💡 Tip: Set OPENAI_API_KEY in your .env file');
      console.error('   It can be the same as ANTHROPIC_API_KEY for testing');
    }
  } finally {
    await backend.shutdown();
    console.log('\n🔒 AgentDB shut down');
  }
}

demo().catch(console.error);
