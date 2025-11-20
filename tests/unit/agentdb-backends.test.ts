/**
 * Unit Tests for AgentDB Backends
 *
 * Tests memory backend, agentdb backend abstraction, and service layer.
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryBackend } from '../../src/llm-engine/agentdb/memory-backend.js';
import { DisabledBackend } from '../../src/llm-engine/agentdb/disabled-backend.js';
import type { CachedResponse, Episode } from '../../src/llm-engine/agentdb/types.js';

describe('unit: AgentDB MemoryBackend', () => {
  let backend: MemoryBackend;

  beforeEach(async () => {
    backend = new MemoryBackend();
    await backend.initialize();
  });

  it('should initialize without errors', async () => {
    expect(backend).toBeDefined();
  });

  it('should cache and retrieve responses', async () => {
    const response: CachedResponse = {
      query: 'What is a system?',
      response: 'A system is a set of interacting components.',
      operations: [],
      timestamp: Date.now(),
      ttl: 3600000,
    };

    await backend.cacheResponse(response);

    // Exact match should have similarity 1.0
    const results = await backend.vectorSearch('What is a system?', 0.85, 5);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].similarity).toBe(1.0);
    expect(results[0].content).toBe(response.response);
  });

  it('should find similar queries with substring matching', async () => {
    const response: CachedResponse = {
      query: 'How do I create a use case?',
      response: 'Use the CREATE_UC operation.',
      operations: [],
      timestamp: Date.now(),
      ttl: 3600000,
    };

    await backend.cacheResponse(response);

    // Partial match should have similarity >= 0.7 (word-based matching)
    const results = await backend.vectorSearch('create use case', 0.7, 5);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].similarity).toBeGreaterThanOrEqual(0.7);
  });

  it('should not return results below threshold', async () => {
    const response: CachedResponse = {
      query: 'What is a system?',
      response: 'A system is a set of interacting components.',
      operations: [],
      timestamp: Date.now(),
      ttl: 3600000,
    };

    await backend.cacheResponse(response);

    // Unrelated query should not match
    const results = await backend.vectorSearch('How to cook pasta?', 0.85, 5);

    expect(results.length).toBe(0);
  });

  it('should store and retrieve episodes', async () => {
    const episode: Episode = {
      agentId: 'test-agent',
      task: 'Create system structure',
      reward: 1.0,
      success: true,
      critique: 'Successfully created structure',
      output: { nodes: 5, edges: 4 },
      timestamp: Date.now(),
    };

    await backend.storeEpisode(episode);

    const episodes = await backend.retrieveEpisodes('test-agent', undefined, 10);

    expect(episodes.length).toBe(1);
    expect(episodes[0].agentId).toBe('test-agent');
    expect(episodes[0].task).toBe('Create system structure');
    expect(episodes[0].success).toBe(true);
  });

  it('should filter episodes by task', async () => {
    const episode1: Episode = {
      agentId: 'agent-1',
      task: 'Create use case',
      reward: 1.0,
      success: true,
      critique: 'Success',
      output: {},
      timestamp: Date.now(),
    };

    const episode2: Episode = {
      agentId: 'agent-1',
      task: 'Validate ontology',
      reward: 1.0,
      success: true,
      critique: 'Success',
      output: {},
      timestamp: Date.now(),
    };

    await backend.storeEpisode(episode1);
    await backend.storeEpisode(episode2);

    const episodes = await backend.retrieveEpisodes('agent-1', 'use case', 10);

    expect(episodes.length).toBe(1);
    expect(episodes[0].task).toBe('Create use case');
  });

  it('should track cache metrics', async () => {
    (backend as any).recordCacheHit(1000);
    (backend as any).recordCacheHit(2000);
    (backend as any).recordCacheMiss();

    const metrics = await backend.getMetrics();

    expect(metrics.cacheHits).toBe(2);
    expect(metrics.cacheMisses).toBe(1);
    expect(metrics.cacheHitRate).toBeCloseTo(0.666, 2);
    expect(metrics.tokensSaved).toBe(3000);
  });

  it('should cleanup expired cache entries', async () => {
    const expiredResponse: CachedResponse = {
      query: 'Old query',
      response: 'Old response',
      operations: [],
      timestamp: Date.now() - 7200000, // 2 hours ago
      ttl: 3600000, // 1 hour TTL
    };

    const freshResponse: CachedResponse = {
      query: 'Fresh query',
      response: 'Fresh response',
      operations: [],
      timestamp: Date.now(),
      ttl: 3600000,
    };

    await backend.cacheResponse(expiredResponse);
    await backend.cacheResponse(freshResponse);

    await backend.cleanup();

    // Expired should be gone
    const expiredResults = await backend.vectorSearch('Old query', 0.85, 5);
    expect(expiredResults.length).toBe(0);

    // Fresh should still exist
    const freshResults = await backend.vectorSearch('Fresh query', 0.85, 5);
    expect(freshResults.length).toBeGreaterThan(0);
  });
});

describe('unit: AgentDB DisabledBackend', () => {
  let backend: DisabledBackend;

  beforeEach(async () => {
    backend = new DisabledBackend();
    await backend.initialize();
  });

  it('should return empty results for all operations', async () => {
    const response: CachedResponse = {
      query: 'Test',
      response: 'Test',
      operations: [],
      timestamp: Date.now(),
      ttl: 3600000,
    };

    await backend.cacheResponse(response);

    const results = await backend.vectorSearch('Test', 0.85, 5);
    expect(results.length).toBe(0);

    const episodes = await backend.retrieveEpisodes('agent', undefined, 10);
    expect(episodes.length).toBe(0);

    const metrics = await backend.getMetrics();
    expect(metrics.cacheHits).toBe(0);
    expect(metrics.cacheMisses).toBe(0);
  });
});
