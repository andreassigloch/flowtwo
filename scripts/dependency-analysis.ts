#!/usr/bin/env tsx
/**
 * Dependency Analysis Script
 * Analyzes cross-file dependencies from Format-E graph
 * @author andreas@siglochconsulting
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Node {
  id: string;
  type: string;
  name: string;
}

interface FunctionDependency {
  func: string;
  funcId: string;
  module: string;
  moduleId: string;
  dependencies: number;
  dependentModules: string[];
}

function analyzeDependencies(formatEPath: string): FunctionDependency[] {
  const content = fs.readFileSync(formatEPath, 'utf-8');
  const lines = content.split('\n');

  // Parse nodes
  const nodeMap = new Map<string, Node>();
  let inNodes = false;
  let inEdges = false;

  for (const line of lines) {
    if (line.trim() === '[Nodes]') {
      inNodes = true;
      inEdges = false;
      continue;
    }
    if (line.trim() === '[Edges]') {
      inNodes = false;
      inEdges = true;
      continue;
    }
    if (line.startsWith('#') || !line.trim()) continue;

    if (inNodes) {
      const parts = line.split('|');
      const [id, type] = parts;
      if (type === 'FUNC' || type === 'MOD') {
        nodeMap.set(id, { id, type, name: parts[2] || id });
      }
    }
  }

  // Parse allocate edges (MOD -> FUNC)
  const funcToModule = new Map<string, string>();
  const moduleToFunc = new Map<string, string[]>();

  inEdges = false;
  for (const line of lines) {
    if (line.trim() === '[Edges]') {
      inEdges = true;
      continue;
    }
    if (!inEdges || line.startsWith('#') || !line.trim()) continue;

    if (line.includes('-alc->')) {
      const [source, target] = line.split('-alc->');
      funcToModule.set(target, source);
      if (!moduleToFunc.has(source)) {
        moduleToFunc.set(source, []);
      }
      moduleToFunc.get(source)!.push(target);
    }
  }

  // Parse relation edges (MOD -> MOD)
  const modDependencies = new Map<string, Set<string>>();

  inEdges = false;
  for (const line of lines) {
    if (line.trim() === '[Edges]') {
      inEdges = true;
      continue;
    }
    if (!inEdges || line.startsWith('#') || !line.trim()) continue;

    if (line.includes('-rel->')) {
      const [source, target] = line.split('-rel->');
      if (!modDependencies.has(source)) {
        modDependencies.set(source, new Set());
      }
      modDependencies.get(source)!.add(target);
    }
  }

  // Calculate cross-file dependencies for each function
  const funcDeps: FunctionDependency[] = [];

  for (const [funcId, moduleId] of funcToModule.entries()) {
    const deps = modDependencies.get(moduleId) || new Set<string>();
    let crossFileDeps = 0;

    // Count functions in dependent modules
    for (const depModule of deps) {
      const funcsInDepModule = moduleToFunc.get(depModule) || [];
      crossFileDeps += funcsInDepModule.length;
    }

    const funcNode = nodeMap.get(funcId);
    const moduleNode = nodeMap.get(moduleId);

    if (funcNode && moduleNode) {
      funcDeps.push({
        func: funcNode.name,
        funcId,
        module: moduleNode.name,
        moduleId,
        dependencies: crossFileDeps,
        dependentModules: Array.from(deps).map((m) => nodeMap.get(m)?.name || m),
      });
    }
  }

  return funcDeps.sort((a, b) => b.dependencies - a.dependencies);
}

function main() {
  const startTime = Date.now();

  const formatEPath = path.join(
    __dirname,
    '..',
    'examples',
    'graphengine-self-graph.format-e'
  );

  console.log('\n=== ANALYZING CROSS-FILE DEPENDENCIES ===\n');

  const funcDeps = analyzeDependencies(formatEPath);
  const top5 = funcDeps.slice(0, 5);

  console.log('TOP 5 FUNCTIONS WITH MOST CROSS-FILE DEPENDENCIES:\n');

  top5.forEach((item, i) => {
    console.log(`${i + 1}. ${item.func}`);
    console.log(`   ID: ${item.funcId}`);
    console.log(`   Module: ${item.module}`);
    console.log(`   Cross-file dependencies: ${item.dependencies}`);
    console.log(`   Depends on modules (${item.dependentModules.length}):`);
    item.dependentModules.forEach((mod) => console.log(`     - ${mod}`));
    console.log();
  });

  console.log('\n=== SIMPLIFICATION PROPOSALS ===\n');

  // Analyze patterns
  const chatInterfaceFuncs = funcDeps.filter((f) => f.module === 'Chat Interface');
  const graphViewerFuncs = funcDeps.filter((f) => f.module === 'Graph Viewer');
  const appFuncs = funcDeps.filter((f) => f.module === 'App');

  console.log('1. TERMINAL UI CONSOLIDATION');
  console.log(`   Problem: Chat Interface (${chatInterfaceFuncs.length} funcs), Graph Viewer (${graphViewerFuncs.length} funcs), and App (${appFuncs.length} funcs)`);
  console.log('   have high cross-dependencies due to scattered responsibilities.');
  console.log('   Proposal: Create src/terminal-ui/terminal-orchestrator.ts');
  console.log('   - Move: HandleUserInput, DisplayStreamingTokens → orchestrator');
  console.log('   - Move: App coordination logic → orchestrator');
  console.log('   - Keep: RenderChat, RenderGraph as pure rendering functions');
  console.log('   - Benefit: Reduces coupling, centralizes state management\n');

  console.log('2. CANVAS STATE MANAGEMENT');
  console.log('   Problem: Graph Canvas functions depend on multiple modules');
  console.log('   (Format-E Parser, Neo4j Client, WebSocket Server).');
  console.log('   Proposal: Introduce src/canvas/canvas-service.ts facade');
  console.log('   - Encapsulates: ApplyDiff, LoadGraph, PersistToNeo4j, BroadcastUpdate');
  console.log('   - Hides: Internal dependencies on parser/db/websocket');
  console.log('   - Benefit: Single point of contact for canvas operations\n');

  console.log('3. LLM ENGINE SIMPLIFICATION');
  console.log('   Problem: LLM Engine Impl directly depends on Prompt Builder, Response Parser.');
  console.log('   Proposal: Split src/llm-engine/llm-engine.ts into:');
  console.log('   - src/llm-engine/llm-api-client.ts (API calls only)');
  console.log('   - src/llm-engine/llm-coordinator.ts (orchestrates prompt/response/streaming)');
  console.log('   - Benefit: Clearer separation, easier to test\n');

  console.log('4. GRAPH ENGINE LAYOUT ABSTRACTION');
  console.log('   Problem: Graph Engine Impl depends on 5 layout algorithms directly.');
  console.log('   Proposal: Create src/graph-engine/layout-factory.ts');
  console.log('   - Factory pattern: getLayoutAlgorithm(viewType) → ILayoutAlgorithm');
  console.log('   - Graph Engine depends on factory, not individual algorithms');
  console.log('   - Benefit: Reduces coupling from 5 deps to 1\n');

  console.log('5. NEO4J CLIENT BATCHING');
  console.log('   Problem: Neo4j Client has many individual operations (CreateNode, UpdateNode, etc.).');
  console.log('   Proposal: Introduce src/neo4j-client/batch-operation-builder.ts');
  console.log('   - Builder pattern for batch operations');
  console.log('   - Single BatchPersist entry point');
  console.log('   - Benefit: Reduces API surface, improves performance\n');

  const endTime = Date.now();
  console.log(`\n=== ANALYSIS COMPLETE (${endTime - startTime}ms) ===\n`);
}

main();
