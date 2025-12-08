/**
 * Test UnifiedRuleEvaluator with testdata files
 *
 * These tests verify that the evaluator correctly identifies violations
 * in the testdata files from eval/testdata.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { UnifiedAgentDBService } from '../../../src/llm-engine/agentdb/unified-agentdb-service.js';
import { UnifiedRuleEvaluator } from '../../../src/llm-engine/validation/unified-rule-evaluator.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const TESTDATA_DIR = path.join(process.cwd(), 'eval/testdata');

interface ParsedData {
  nodes: Array<{
    uuid: string;
    semanticId: string;
    type: string;
    name: string;
    descr: string;
    systemId: string;
    workspaceId: string;
  }>;
  edges: Array<{
    uuid: string;
    sourceId: string;
    targetId: string;
    type: string;
    systemId: string;
    workspaceId: string;
  }>;
}

async function parseTestFile(filename: string): Promise<ParsedData> {
  const content = await fs.readFile(path.join(TESTDATA_DIR, filename), 'utf-8');
  const lines = content.split('\n');
  const nodes: ParsedData['nodes'] = [];
  const edges: ParsedData['edges'] = [];
  let section = 'none';

  // Edge type mapping from short to full
  const edgeTypeMap: Record<string, string> = {
    cp: 'compose',
    sat: 'satisfy',
    ver: 'verify',
    alc: 'allocate',
    io: 'io',
    rel: 'relation',
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments (lines starting with single #) but not headers
    if (trimmed.startsWith('# ') || trimmed === '#' || trimmed === '') continue;

    // Check for section headers
    if (trimmed.startsWith('## Nodes')) {
      section = 'nodes';
      continue;
    }
    if (trimmed.startsWith('## Edges')) {
      section = 'edges';
      continue;
    }

    if (section === 'nodes') {
      const parts = trimmed.split('|');
      if (parts.length >= 4) {
        nodes.push({
          uuid: `uuid-${parts[2]}`,
          semanticId: parts[2],
          type: parts[1],
          name: parts[0],
          descr: parts[3],
          systemId: 'TestSystem',
          workspaceId: 'test-workspace',
        });
      }
    }

    if (section === 'edges') {
      // Parse: Source -type-> Target1, Target2
      const match = trimmed.match(/^(\S+)\s+-(\w+)->\s+(.+)$/);
      if (match) {
        const [, sourceId, shortType, targetsStr] = match;
        const edgeType = edgeTypeMap[shortType] || shortType;
        const targets = targetsStr.split(',').map((t) => t.trim());
        for (const targetId of targets) {
          edges.push({
            uuid: `uuid-edge-${sourceId}-${edgeType}-${targetId}`,
            sourceId,
            targetId,
            type: edgeType,
            systemId: 'TestSystem',
            workspaceId: 'test-workspace',
          });
        }
      }
    }
  }

  return { nodes, edges };
}

describe('UnifiedRuleEvaluator with testdata files', () => {
  let agentDB: UnifiedAgentDBService;
  let evaluator: UnifiedRuleEvaluator;

  beforeEach(async () => {
    agentDB = new UnifiedAgentDBService();
    await agentDB.initialize('test-workspace', 'TestSystem');
  });

  afterEach(async () => {
    await agentDB.shutdown();
  });

  async function loadData(filename: string): Promise<void> {
    const { nodes, edges } = await parseTestFile(filename);

    console.log(`Loading ${nodes.length} nodes, ${edges.length} edges`);

    for (const node of nodes) {
      agentDB.setNode(node as any);
    }

    for (const edge of edges) {
      try {
        agentDB.setEdge(edge as any);
      } catch (e) {
        console.log(`  Edge error: ${e}`);
      }
    }

    // Check what was loaded
    const loadedNodes = agentDB.getNodes();
    const loadedEdges = agentDB.getEdges();
    console.log(`  Loaded: ${loadedNodes.length} nodes, ${loadedEdges.length} edges`);

    evaluator = new UnifiedRuleEvaluator(agentDB);
  }

  it('clean-system.txt should have high score (minimal violations)', async () => {
    await loadData('clean-system.txt');
    const result = await evaluator.evaluate('phase2_logical');

    console.log(`clean-system.txt: score=${(result.rewardScore * 100).toFixed(1)}%, violations=${result.totalViolations}`);

    // Clean system should have score >= 80%
    expect(result.rewardScore).toBeGreaterThanOrEqual(0.8);
    expect(result.totalViolations).toBeLessThanOrEqual(5);
  });

  it('combined-violations.txt should have low score (many violations)', async () => {
    await loadData('combined-violations.txt');
    const result = await evaluator.evaluate('phase2_logical');

    console.log(`combined-violations.txt: score=${(result.rewardScore * 100).toFixed(1)}%, violations=${result.totalViolations}`);

    // System with violations should have lower score
    expect(result.rewardScore).toBeLessThan(0.8);
    expect(result.totalViolations).toBeGreaterThan(0);

    // Verify expected violations are detected
    const violationRules = result.violations.map((v) => v.ruleName);
    console.log(`Violation rules: ${[...new Set(violationRules)].join(', ')}`);
  });

  it('missing-traceability.txt should detect missing satisfy/verify edges', async () => {
    await loadData('missing-traceability.txt');
    const result = await evaluator.evaluate('phase2_logical');

    console.log(`missing-traceability.txt: score=${(result.rewardScore * 100).toFixed(1)}%, violations=${result.totalViolations}`);

    // Should detect traceability issues
    expect(result.totalViolations).toBeGreaterThan(0);

    const violationRules = result.violations.map((v) => v.ruleName);
    console.log(`Violation rules: ${[...new Set(violationRules)].join(', ')}`);
  });

  it('orphan-nodes.txt should detect isolated nodes', async () => {
    await loadData('orphan-nodes.txt');
    const result = await evaluator.evaluate('phase2_logical');

    console.log(`orphan-nodes.txt: score=${(result.rewardScore * 100).toFixed(1)}%, violations=${result.totalViolations}`);

    expect(result.totalViolations).toBeGreaterThan(0);

    const violationRules = result.violations.map((v) => v.ruleName);
    console.log(`Violation rules: ${[...new Set(violationRules)].join(', ')}`);
  });

  it('oversized-module.txt should detect Miller Law violations', async () => {
    await loadData('oversized-module.txt');
    const result = await evaluator.evaluate('phase2_logical');

    console.log(`oversized-module.txt: score=${(result.rewardScore * 100).toFixed(1)}%, violations=${result.totalViolations}`);

    expect(result.totalViolations).toBeGreaterThan(0);

    const violationRules = result.violations.map((v) => v.ruleName);
    console.log(`Violation rules: ${[...new Set(violationRules)].join(', ')}`);
  });
});
