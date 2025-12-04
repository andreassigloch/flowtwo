#!/usr/bin/env npx tsx
/**
 * CR-028 Performance Benchmarks
 * Measures optimization performance on various fixture sizes
 *
 * Usage: npm run benchmark
 *
 * @author andreas@siglochconsulting
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Architecture, Node, Edge } from './types.js';
import { scoreArchitecture } from './multi-objective-scorer.js';
import { violationGuidedSearch, detectViolations } from './violation-guided-search.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, '../fixtures/architectures');

// ============================================================================
// Synthetic Architecture Generator
// ============================================================================

function generateSyntheticArchitecture(
  numMods: number,
  funcsPerMod: number,
  volatilityMix: number = 0.3
): Architecture {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  let nodeCounter = 0;
  let edgeCounter = 0;

  // Create MODs
  const modIds: string[] = [];
  for (let m = 0; m < numMods; m++) {
    const modId = `MOD_${m}`;
    modIds.push(modId);
    nodes.push({
      id: modId,
      type: 'MOD',
      label: `Module${m}`,
      properties: {}
    });
  }

  // Create FUNCs per MOD
  const funcsByMod: Record<string, string[]> = {};
  for (const modId of modIds) {
    funcsByMod[modId] = [];

    for (let f = 0; f < funcsPerMod; f++) {
      const funcId = `FUNC_${nodeCounter++}`;
      const isHighVol = Math.random() < volatilityMix;

      nodes.push({
        id: funcId,
        type: 'FUNC',
        label: `Func${nodeCounter}`,
        properties: {
          volatility: isHighVol ? 0.7 + Math.random() * 0.3 : Math.random() * 0.4
        }
      });

      funcsByMod[modId].push(funcId);

      // Allocate to MOD
      edges.push({
        id: `e${edgeCounter++}`,
        source: funcId,
        target: modId,
        type: 'allocate'
      });
    }
  }

  // Create io edges within MODs (chain)
  for (const funcs of Object.values(funcsByMod)) {
    for (let i = 0; i < funcs.length - 1; i++) {
      edges.push({
        id: `e${edgeCounter++}`,
        source: funcs[i],
        target: funcs[i + 1],
        type: 'io'
      });
    }
  }

  // Create some cross-MOD io edges
  for (let m = 0; m < modIds.length - 1; m++) {
    const sourceMod = modIds[m];
    const targetMod = modIds[m + 1];
    const sourceFunc = funcsByMod[sourceMod][funcsByMod[sourceMod].length - 1];
    const targetFunc = funcsByMod[targetMod][0];

    edges.push({
      id: `e${edgeCounter++}`,
      source: sourceFunc,
      target: targetFunc,
      type: 'io'
    });
  }

  // Create REQs and satisfy edges
  const numReqs = Math.ceil(nodes.filter(n => n.type === 'FUNC').length / 3);
  const reqIds: string[] = [];

  for (let r = 0; r < numReqs; r++) {
    const reqId = `REQ_${r}`;
    reqIds.push(reqId);
    nodes.push({
      id: reqId,
      type: 'REQ',
      label: `Requirement${r}`,
      properties: {}
    });
  }

  // Link FUNCs to REQs
  const funcs = nodes.filter(n => n.type === 'FUNC');
  for (let i = 0; i < funcs.length; i++) {
    const reqId = reqIds[i % reqIds.length];
    edges.push({
      id: `e${edgeCounter++}`,
      source: funcs[i].id,
      target: reqId,
      type: 'satisfy'
    });
  }

  // Create some TESTs
  const numTests = Math.ceil(numReqs / 2);
  for (let t = 0; t < numTests; t++) {
    const testId = `TEST_${t}`;
    nodes.push({
      id: testId,
      type: 'TEST',
      label: `Test${t}`,
      properties: {}
    });

    // Link REQs to TEST
    edges.push({
      id: `e${edgeCounter++}`,
      source: reqIds[t % reqIds.length],
      target: testId,
      type: 'verify'
    });
  }

  return {
    id: `synthetic_${numMods}x${funcsPerMod}`,
    nodes,
    edges
  };
}

// ============================================================================
// Benchmark Runner
// ============================================================================

interface BenchmarkResult {
  name: string;
  nodes: number;
  edges: number;
  initialScore: number;
  finalScore: number;
  iterations: number;
  timeMs: number;
  variantsPerSec: number;
  converged: boolean;
}

function runBenchmark(arch: Architecture, maxIterations: number = 50): BenchmarkResult {
  const startTime = performance.now();

  const result = violationGuidedSearch(arch, {
    maxIterations,
    randomSeed: 42
  });

  const endTime = performance.now();
  const timeMs = endTime - startTime;

  return {
    name: arch.id,
    nodes: arch.nodes.length,
    edges: arch.edges.length,
    initialScore: result.stats.scoreHistory[0]?.weighted ?? 0,
    finalScore: result.bestVariant.score.weighted,
    iterations: result.iterations,
    timeMs,
    variantsPerSec: result.stats.totalVariantsGenerated / (timeMs / 1000),
    converged: result.convergenceReason !== 'max_iterations'
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('=== CR-028 Performance Benchmarks ===\n');

  const results: BenchmarkResult[] = [];

  // Benchmark fixtures
  console.log('--- Fixture Benchmarks ---\n');

  const fixtures = fs.readdirSync(FIXTURES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const content = fs.readFileSync(path.join(FIXTURES_DIR, f), 'utf-8');
      const data = JSON.parse(content);
      return { id: data.id, nodes: data.nodes, edges: data.edges } as Architecture;
    });

  for (const arch of fixtures) {
    const result = runBenchmark(arch);
    results.push(result);
    console.log(`${result.name}: ${result.timeMs.toFixed(0)}ms, ${result.iterations} iters, score ${result.initialScore.toFixed(3)}→${result.finalScore.toFixed(3)}`);
  }

  // Benchmark synthetic architectures of increasing size
  console.log('\n--- Synthetic Architecture Benchmarks ---\n');

  const sizes = [
    { mods: 2, funcsPerMod: 5 },   // 10 FUNCs
    { mods: 3, funcsPerMod: 7 },   // 21 FUNCs
    { mods: 5, funcsPerMod: 7 },   // 35 FUNCs
    { mods: 7, funcsPerMod: 9 },   // 63 FUNCs
    { mods: 10, funcsPerMod: 10 }, // 100 FUNCs
  ];

  for (const { mods, funcsPerMod } of sizes) {
    const arch = generateSyntheticArchitecture(mods, funcsPerMod);
    const result = runBenchmark(arch, 30);
    results.push(result);
    console.log(
      `${result.name}: ${result.nodes} nodes, ${result.edges} edges, ` +
      `${result.timeMs.toFixed(0)}ms, ${result.variantsPerSec.toFixed(0)} variants/sec`
    );
  }

  // Summary table
  console.log('\n--- Summary ---\n');
  console.log(
    'Name'.padEnd(25) +
    'Nodes'.padStart(8) +
    'Edges'.padStart(8) +
    'Time(ms)'.padStart(10) +
    'Iters'.padStart(8) +
    'Score'.padStart(8) +
    'V/sec'.padStart(10)
  );
  console.log('-'.repeat(77));

  for (const r of results) {
    console.log(
      r.name.slice(0, 24).padEnd(25) +
      r.nodes.toString().padStart(8) +
      r.edges.toString().padStart(8) +
      r.timeMs.toFixed(0).padStart(10) +
      r.iterations.toString().padStart(8) +
      r.finalScore.toFixed(3).padStart(8) +
      r.variantsPerSec.toFixed(0).padStart(10)
    );
  }

  // Performance targets
  console.log('\n--- Performance Targets (NFR-028) ---');
  console.log(`Move operator < 50ms: ${results.every(r => r.timeMs / r.iterations < 50) ? 'PASS' : 'CHECK'}`);

  const largeArch = results.find(r => r.nodes >= 100);
  if (largeArch) {
    console.log(`100-node cycle < 30s: ${largeArch.timeMs < 30000 ? 'PASS' : 'FAIL'} (${largeArch.timeMs.toFixed(0)}ms)`);
  }
}

main().catch(console.error);
