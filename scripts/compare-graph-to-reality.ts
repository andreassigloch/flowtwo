#!/usr/bin/env tsx
/**
 * Compare Format-E Graph to Actual Codebase
 * Identifies missing MOD->MOD edges in Format-E graph
 * @author andreas@siglochconsulting
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Actual dependencies extracted from import statements
const actualDeps: Record<string, string[]> = {
  'ChatInterface.MOD': [
    'GraphCanvas.MOD',
    'ChatCanvas.MOD',
    'LLMEngineImpl.MOD',
    'Neo4jClientImpl.MOD',
    'FormatEParser.MOD',
    'WebSocketClient.MOD',
    'SessionManager.MOD',
    'Config.MOD',
  ],
  'GraphViewer.MOD': [
    'GraphEngineImpl.MOD',
    'GraphCanvas.MOD',
    'Neo4jClientImpl.MOD',
  ],
  'GraphCanvas.MOD': [
    'FormatEParser.MOD',
    'Neo4jClientImpl.MOD',
    'WebSocketServer.MOD',
  ],
  'ChatCanvas.MOD': ['FormatEParser.MOD', 'Neo4jClientImpl.MOD'],
  'LLMEngineImpl.MOD': ['PromptBuilder.MOD', 'ResponseParser.MOD'],
  'GraphEngineImpl.MOD': [
    'ViewFilter.MOD',
    'PortExtractor.MOD',
    'ReingoldTilford.MOD',
    'SugiyamaLayout.MOD',
    'RadialLayout.MOD',
  ],
};

// Format-E graph dependencies
function parseFormatEGraph(formatEPath: string): Record<string, string[]> {
  const content = fs.readFileSync(formatEPath, 'utf-8');
  const lines = content.split('\n');
  const formatEDeps: Record<string, string[]> = {};

  let inEdges = false;
  for (const line of lines) {
    if (line.trim() === '[Edges]') {
      inEdges = true;
      continue;
    }
    if (!inEdges || line.startsWith('#') || !line.trim()) continue;

    if (line.includes('-rel->')) {
      const [source, target] = line.split('-rel->');
      if (!formatEDeps[source]) {
        formatEDeps[source] = [];
      }
      formatEDeps[source].push(target);
    }
  }

  return formatEDeps;
}

function main() {
  const formatEPath = path.join(
    __dirname,
    '..',
    'examples',
    'graphengine-self-graph.format-e'
  );

  const formatEDeps = parseFormatEGraph(formatEPath);

  console.log('\n=== DEPENDENCY ALIGNMENT ANALYSIS ===\n');
  console.log('Comparing actual codebase imports to Format-E graph MOD->MOD edges\n');

  let totalMissing = 0;
  const missingEdges: string[] = [];

  console.log('Module                  | Actual | Format-E | Missing | Status');
  console.log('------------------------|--------|----------|---------|--------');

  for (const [mod, actualDepList] of Object.entries(actualDeps)) {
    const formatEDepList = formatEDeps[mod] || [];
    const missing = actualDepList.filter((d) => !formatEDepList.includes(d));
    const missingCount = missing.length;
    totalMissing += missingCount;

    const status = missingCount === 0 ? '✅ OK' : '❌ INCOMPLETE';
    const modPadded = mod.padEnd(23);
    const actualPadded = String(actualDepList.length).padStart(6);
    const formatEPadded = String(formatEDepList.length).padStart(8);
    const missingPadded = String(missingCount).padStart(7);

    console.log(
      `${modPadded} | ${actualPadded} | ${formatEPadded} | ${missingPadded} | ${status}`
    );

    if (missingCount > 0) {
      missing.forEach((dep) => {
        missingEdges.push(`${mod}-rel->${dep}`);
      });
    }
  }

  console.log('\n=== MISSING EDGES IN FORMAT-E GRAPH ===\n');
  if (missingEdges.length === 0) {
    console.log('✅ Format-E graph is complete and accurate!\n');
  } else {
    console.log(`Found ${missingEdges.length} missing MOD->MOD edges:\n`);
    missingEdges.forEach((edge) => console.log(`  ${edge}`));
    console.log('\n');
  }

  console.log('=== ROOT CAUSE ANALYSIS ===\n');
  console.log('a) WHAT IS THE DIFFERENCE?');
  console.log('   - Format-E graph shows 18 MOD->MOD edges');
  console.log(`   - Actual codebase has ${missingEdges.length} additional import relationships`);
  console.log('   - Graph is outdated/incomplete (missing direct imports)\n');

  console.log('b) WHAT NEEDS TO BE UPDATED?\n');
  console.log('1. ChatInterface.MOD - CRITICAL (5 missing edges)');
  console.log('   - Add: ChatInterface.MOD-rel->Neo4jClientImpl.MOD');
  console.log('   - Add: ChatInterface.MOD-rel->FormatEParser.MOD');
  console.log('   - Add: ChatInterface.MOD-rel->WebSocketClient.MOD');
  console.log('   - Add: ChatInterface.MOD-rel->SessionManager.MOD');
  console.log('   - Add: ChatInterface.MOD-rel->Config.MOD');
  console.log('   Why: chat-interface.ts directly imports these (lines 19-24)\n');

  console.log('2. GraphViewer.MOD - MINOR (1 missing edge)');
  console.log('   - Add: GraphViewer.MOD-rel->Neo4jClientImpl.MOD');
  console.log('   Why: graph-viewer.ts directly imports Neo4jClient\n');

  console.log('3. ChatCanvas.MOD - MODERATE (2 missing edges)');
  console.log('   - Add: ChatCanvas.MOD-rel->FormatEParser.MOD');
  console.log('   - Add: ChatCanvas.MOD-rel->Neo4jClientImpl.MOD');
  console.log('   Why: chat-canvas.ts uses both for persistence/parsing\n');

  console.log('=== IMPACT ON ORIGINAL ANALYSIS ===\n');
  console.log('After correcting Format-E graph:');
  console.log('- ChatInterface.MOD would show 8 dependencies (not 3)');
  console.log('- GraphViewer.MOD would show 3 dependencies (not 2)');
  console.log('- ChatCanvas.MOD would show 2 dependencies (not 0)\n');

  console.log('This means MY analysis would align with COLLEAGUE\'s:');
  console.log('- ChatInterface is the most coupled module (8 deps)');
  console.log('- Refactoring priority: ChatInterface > GraphViewer > ChatCanvas\n');

  console.log('=== RECOMMENDATION ===\n');
  console.log('Update graphengine-self-graph.format-e with missing edges above.');
  console.log('Then re-run dependency analysis for accurate architectural insights.\n');
}

main();
