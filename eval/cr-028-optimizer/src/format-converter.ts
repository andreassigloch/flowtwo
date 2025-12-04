/**
 * CR-028 Format Converter
 * Converts multiple input formats to CR-028 Architecture format:
 * - UrbanMobilityVehicle JSON format
 * - Format E (.txt) from main app /export
 *
 * @author andreas@siglochconsulting
 */

import { Architecture, Node, Edge, NodeType } from './types.js';

// ============================================================================
// Source Format (UrbanMobilityVehicle)
// ============================================================================

interface SourceNode {
  uuid: string;
  type: string;
  Name: string;
  Descr?: string;
  semanticId?: string;
}

interface SourceRelationship {
  uuid: string;
  type: string;
  source: string;
  target: string;
}

interface SourceArchitecture {
  nodes: SourceNode[];
  relationships: SourceRelationship[];
}

// ============================================================================
// Type Mapping
// ============================================================================

const NODE_TYPE_MAP: Record<string, NodeType | null> = {
  'SYS': null,      // System - skip (meta node)
  'UC': 'UC',       // Use Case
  'ACTOR': null,    // Actor - skip (external)
  'FCHAIN': null,   // Function Chain - skip (grouping only)
  'FUNC': 'FUNC',   // Function
  'REQ': 'REQ',     // Requirement
  'FLOW': 'FLOW',   // Data Flow
  'MOD': 'MOD',     // Module (if present)
  'TEST': 'TEST',   // Test (if present)
  'SCHEMA': 'SCHEMA' // Schema (if present)
};

const EDGE_TYPE_MAP: Record<string, string> = {
  'realize': 'satisfy',  // FUNC realizes REQ → FUNC satisfies REQ
  'derive': 'derive',    // UC derives REQ
  'satisfy': 'satisfy',  // Already correct
  'io': 'io',            // Data flow
  'allocate': 'allocate', // FUNC allocated to MOD
  'verify': 'verify'     // TEST verifies REQ
};

// ============================================================================
// Converter
// ============================================================================

export interface ConversionResult {
  architecture: Architecture;
  warnings: string[];
  stats: {
    nodesConverted: number;
    nodesSkipped: number;
    edgesConverted: number;
    edgesSkipped: number;
    syntheticModsCreated: number;
    syntheticTestsCreated: number;
  };
}

export interface ConversionOptions {
  /** Create synthetic MOD nodes based on FCHAIN groupings */
  createSyntheticMods?: boolean;
  /** Create synthetic TEST nodes for REQs without tests */
  createSyntheticTests?: boolean;
  /** Default volatility for FUNCs without volatility property */
  defaultVolatility?: number;
  /** Architecture ID to use */
  architectureId?: string;
}

const DEFAULT_OPTIONS: ConversionOptions = {
  createSyntheticMods: true,
  createSyntheticTests: false,
  defaultVolatility: 0.3,
  architectureId: 'converted'
};

export function convertToArchitecture(
  source: SourceArchitecture,
  options: Partial<ConversionOptions> = {}
): ConversionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const warnings: string[] = [];
  const stats = {
    nodesConverted: 0,
    nodesSkipped: 0,
    edgesConverted: 0,
    edgesSkipped: 0,
    syntheticModsCreated: 0,
    syntheticTestsCreated: 0
  };

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const nodeIdMap = new Map<string, string>(); // uuid or semanticId → new id
  const funcIds: string[] = [];
  const reqIds: string[] = [];

  // Pass 1: Convert nodes
  for (const srcNode of source.nodes) {
    const targetType = NODE_TYPE_MAP[srcNode.type];

    if (targetType === null) {
      stats.nodesSkipped++;
      continue;
    }

    if (targetType === undefined) {
      warnings.push(`Unknown node type: ${srcNode.type} (node: ${srcNode.uuid})`);
      stats.nodesSkipped++;
      continue;
    }

    // Use semanticId as the node ID (it's what edges reference)
    const newId = srcNode.semanticId || srcNode.uuid;
    nodeIdMap.set(srcNode.uuid, newId);
    // Also map by semanticId if present (for edge lookup)
    if (srcNode.semanticId) {
      nodeIdMap.set(srcNode.semanticId, newId);
    }

    const node: Node = {
      id: newId,
      type: targetType,
      label: srcNode.Name || srcNode.uuid,
      properties: {}
    };

    // Add description if present
    if (srcNode.Descr) {
      node.properties.description = srcNode.Descr;
    }

    // Add semantic ID if present
    if (srcNode.semanticId) {
      node.properties.semanticId = srcNode.semanticId;
    }

    // Add default volatility for FUNCs
    if (targetType === 'FUNC') {
      node.properties.volatility = opts.defaultVolatility;
      funcIds.push(newId);
    }

    if (targetType === 'REQ') {
      reqIds.push(newId);
    }

    nodes.push(node);
    stats.nodesConverted++;
  }

  // Pass 2: Convert edges
  for (const srcEdge of source.relationships) {
    const sourceId = nodeIdMap.get(srcEdge.source);
    const targetId = nodeIdMap.get(srcEdge.target);

    // Skip edges to/from skipped nodes
    if (!sourceId || !targetId) {
      stats.edgesSkipped++;
      continue;
    }

    const edgeType = EDGE_TYPE_MAP[srcEdge.type] || srcEdge.type;

    edges.push({
      id: srcEdge.uuid,
      source: sourceId,
      target: targetId,
      type: edgeType
    });
    stats.edgesConverted++;
  }

  // Pass 3: Create synthetic MODs if requested
  if (opts.createSyntheticMods && funcIds.length > 0) {
    // Check if we already have MODs
    const existingMods = nodes.filter(n => n.type === 'MOD');

    if (existingMods.length === 0) {
      // Create MODs based on Miller's Law (7±2 FUNCs per MOD)
      const FUNCS_PER_MOD = 7;
      const numMods = Math.ceil(funcIds.length / FUNCS_PER_MOD);

      for (let i = 0; i < numMods; i++) {
        const modId = `MOD_synthetic_${i + 1}`;
        nodes.push({
          id: modId,
          type: 'MOD',
          label: `Module ${i + 1}`,
          properties: { synthetic: true }
        });
        stats.syntheticModsCreated++;

        // Allocate FUNCs to this MOD
        const startIdx = i * FUNCS_PER_MOD;
        const endIdx = Math.min(startIdx + FUNCS_PER_MOD, funcIds.length);

        for (let j = startIdx; j < endIdx; j++) {
          edges.push({
            id: `alloc_${funcIds[j]}_${modId}`,
            source: funcIds[j],
            target: modId,
            type: 'allocate'
          });
        }
      }

      warnings.push(`Created ${numMods} synthetic MOD(s) for ${funcIds.length} FUNCs`);
    }
  }

  // Pass 4: Create synthetic TESTs if requested
  if (opts.createSyntheticTests) {
    const reqsWithTests = new Set(
      edges.filter(e => e.type === 'verify').map(e => e.source)
    );

    for (const reqId of reqIds) {
      if (!reqsWithTests.has(reqId)) {
        const testId = `TEST_synthetic_${reqId}`;
        nodes.push({
          id: testId,
          type: 'TEST',
          label: `Test for ${reqId}`,
          properties: { synthetic: true }
        });
        stats.syntheticTestsCreated++;

        edges.push({
          id: `verify_${reqId}_${testId}`,
          source: reqId,
          target: testId,
          type: 'verify'
        });
      }
    }

    if (stats.syntheticTestsCreated > 0) {
      warnings.push(`Created ${stats.syntheticTestsCreated} synthetic TEST(s)`);
    }
  }

  return {
    architecture: {
      id: opts.architectureId!,
      nodes,
      edges
    },
    warnings,
    stats
  };
}

import { readFileSync, writeFileSync } from 'fs';

// ============================================================================
// Format E Parser (from main app /export)
// ============================================================================

/**
 * Format E Syntax:
 *   Node: NodeName|Type|SemanticID|Description [x:0,y:0,zoom:L2]
 *   Edge: SourceID -type-> TargetID  (types: -cp->, -io->, -sat->, -ver->, -alc->)
 */

const FORMAT_E_EDGE_ARROWS: Record<string, string> = {
  '-cp->': 'compose',
  '-io->': 'io',
  '-sat->': 'satisfy',
  '-ver->': 'verify',
  '-alc->': 'allocate',
  '-rel->': 'relation',
  // Long-form aliases
  '-compose->': 'compose',
  '-relation->': 'relation',
  '-satisfy->': 'satisfy',
  '-verify->': 'verify',
  '-allocate->': 'allocate'
};

export function convertFormatE(
  content: string,
  options: Partial<ConversionOptions> = {}
): ConversionResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const warnings: string[] = [];
  const stats = {
    nodesConverted: 0,
    nodesSkipped: 0,
    edgesConverted: 0,
    edgesSkipped: 0,
    syntheticModsCreated: 0,
    syntheticTestsCreated: 0
  };

  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const funcIds: string[] = [];
  const reqIds: string[] = [];
  const nodeIdSet = new Set<string>();

  const lines = content.split('\n').map(l => l.trim());
  let section: 'none' | 'view' | 'nodes' | 'edges' = 'none';
  let systemId = opts.architectureId || 'converted';

  for (const line of lines) {
    // Detect section markers
    const lineLower = line.toLowerCase();
    if (line === '## View-Context' || lineLower === '[view-context]') {
      section = 'view';
      continue;
    }
    if (line === '## Nodes' || lineLower === '[nodes]') {
      section = 'nodes';
      continue;
    }
    if (line === '## Edges' || lineLower === '[edges]') {
      section = 'edges';
      continue;
    }

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) continue;

    // Extract system ID from header
    if (line.startsWith('# System ID:')) {
      systemId = line.replace('# System ID:', '').trim();
      continue;
    }

    if (section === 'nodes') {
      // Parse: NodeName|Type|SemanticID|Description [attrs]
      const attrMatch = line.match(/\[([^\]]+)\]$/);
      let coreLine = line;
      const attributes: Record<string, unknown> = {};

      if (attrMatch) {
        coreLine = line.substring(0, line.indexOf('['));
        const attrStr = attrMatch[1];
        for (const pair of attrStr.split(',')) {
          const [key, value] = pair.split(':');
          if (key && value) {
            attributes[key.trim()] = isNaN(Number(value)) ? value.trim() : Number(value);
          }
        }
      }

      const parts = coreLine.split('|').map(p => p.trim());
      if (parts.length < 3) {
        stats.nodesSkipped++;
        continue;
      }

      const [name, type, semanticId, description] = parts;
      const targetType = NODE_TYPE_MAP[type];

      if (targetType === null || targetType === undefined) {
        stats.nodesSkipped++;
        continue;
      }

      const node: Node = {
        id: semanticId,
        type: targetType,
        label: name || semanticId,
        properties: { ...attributes }
      };

      if (description) {
        node.properties.description = description;
      }

      // Add default volatility for FUNCs
      if (targetType === 'FUNC') {
        node.properties.volatility = opts.defaultVolatility;
        funcIds.push(semanticId);
      }

      if (targetType === 'REQ') {
        reqIds.push(semanticId);
      }

      nodes.push(node);
      nodeIdSet.add(semanticId);
      stats.nodesConverted++;
    }

    if (section === 'edges') {
      // Parse: SourceID -type-> TargetID or SourceID -type-> T1, T2, T3
      let foundArrow = false;

      for (const [arrow, edgeType] of Object.entries(FORMAT_E_EDGE_ARROWS)) {
        if (line.includes(arrow)) {
          const parts = line.split(arrow).map(p => p.trim());
          if (parts.length === 2) {
            const sourceId = parts[0];
            const targets = parts[1].split(',').map(t => t.trim()).filter(t => t);

            for (const targetId of targets) {
              // Only include edges where both nodes exist
              if (nodeIdSet.has(sourceId) && nodeIdSet.has(targetId)) {
                edges.push({
                  id: `${sourceId}-${edgeType}-${targetId}`,
                  source: sourceId,
                  target: targetId,
                  type: edgeType
                });
                stats.edgesConverted++;
              } else {
                stats.edgesSkipped++;
              }
            }
            foundArrow = true;
            break;
          }
        }
      }

      if (!foundArrow) {
        stats.edgesSkipped++;
      }
    }
  }

  // Create synthetic MODs if needed (same logic as JSON converter)
  if (opts.createSyntheticMods && funcIds.length > 0) {
    const existingMods = nodes.filter(n => n.type === 'MOD');

    if (existingMods.length === 0) {
      const FUNCS_PER_MOD = 7;
      const numMods = Math.ceil(funcIds.length / FUNCS_PER_MOD);

      for (let i = 0; i < numMods; i++) {
        const modId = `MOD_synthetic_${i + 1}`;
        nodes.push({
          id: modId,
          type: 'MOD',
          label: `Module ${i + 1}`,
          properties: { synthetic: true }
        });
        stats.syntheticModsCreated++;

        const startIdx = i * FUNCS_PER_MOD;
        const endIdx = Math.min(startIdx + FUNCS_PER_MOD, funcIds.length);

        for (let j = startIdx; j < endIdx; j++) {
          edges.push({
            id: `alloc_${funcIds[j]}_${modId}`,
            source: funcIds[j],
            target: modId,
            type: 'allocate'
          });
        }
      }

      warnings.push(`Created ${numMods} synthetic MOD(s) for ${funcIds.length} FUNCs`);
    }
  }

  // Create synthetic TESTs if requested
  if (opts.createSyntheticTests) {
    const reqsWithTests = new Set(
      edges.filter(e => e.type === 'verify').map(e => e.source)
    );

    for (const reqId of reqIds) {
      if (!reqsWithTests.has(reqId)) {
        const testId = `TEST_synthetic_${reqId}`;
        nodes.push({
          id: testId,
          type: 'TEST',
          label: `Test for ${reqId}`,
          properties: { synthetic: true }
        });
        stats.syntheticTestsCreated++;

        edges.push({
          id: `verify_${reqId}_${testId}`,
          source: reqId,
          target: testId,
          type: 'verify'
        });
      }
    }

    if (stats.syntheticTestsCreated > 0) {
      warnings.push(`Created ${stats.syntheticTestsCreated} synthetic TEST(s)`);
    }
  }

  return {
    architecture: {
      id: systemId,
      nodes,
      edges
    },
    warnings,
    stats
  };
}

// ============================================================================
// Auto-detect format and convert
// ============================================================================

export function detectFormat(content: string): 'json' | 'format-e' | 'unknown' {
  const trimmed = content.trim();

  // JSON starts with { or [
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'json';
  }

  // Format E has ## sections or header comments
  if (trimmed.includes('## Nodes') || trimmed.includes('[Nodes]') ||
      trimmed.startsWith('# GraphEngine')) {
    return 'format-e';
  }

  return 'unknown';
}

export function convertAuto(
  content: string,
  options?: Partial<ConversionOptions>
): ConversionResult {
  const format = detectFormat(content);

  if (format === 'json') {
    const source = JSON.parse(content);
    return convertToArchitecture(source, options);
  }

  if (format === 'format-e') {
    return convertFormatE(content, options);
  }

  throw new Error('Unknown input format. Expected JSON or Format E (.txt)');
}

// ============================================================================
// CLI
// ============================================================================

export function convertFile(
  inputPath: string,
  outputPath: string,
  options?: Partial<ConversionOptions>
): ConversionResult {
  const content = readFileSync(inputPath, 'utf-8');
  const result = convertAuto(content, options);
  writeFileSync(outputPath, JSON.stringify(result.architecture, null, 2));
  return result;
}

// Run if executed directly
const isMainModule = process.argv[1]?.endsWith('format-converter.ts') ||
                     process.argv[1]?.endsWith('format-converter.js');

if (isMainModule) {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: npx tsx src/format-converter.ts <input> <output.json> [options]');
    console.log('');
    console.log('Supported input formats:');
    console.log('  - JSON (UrbanMobilityVehicle format)');
    console.log('  - Format E (.txt from main app /export)');
    console.log('');
    console.log('Options:');
    console.log('  --no-synthetic-mods    Do not create synthetic MOD nodes');
    console.log('  --synthetic-tests      Create synthetic TEST nodes for uncovered REQs');
    console.log('  --volatility=<0.0-1.0> Default volatility for FUNCs (default: 0.3)');
    process.exit(1);
  }

  const inputPath = args[0];
  const outputPath = args[1];

  const options: Partial<ConversionOptions> = {
    createSyntheticMods: !args.includes('--no-synthetic-mods'),
    createSyntheticTests: args.includes('--synthetic-tests')
  };

  const volArg = args.find(a => a.startsWith('--volatility='));
  if (volArg) {
    options.defaultVolatility = parseFloat(volArg.split('=')[1]);
  }

  const content = readFileSync(inputPath, 'utf-8');
  const format = detectFormat(content);

  console.log(`Converting ${inputPath} → ${outputPath}`);
  console.log(`Detected format: ${format}`);
  console.log('Options:', options);
  console.log('');

  const result = convertFile(inputPath, outputPath, options);

  console.log('=== Conversion Complete ===');
  console.log(`Nodes: ${result.stats.nodesConverted} converted, ${result.stats.nodesSkipped} skipped`);
  console.log(`Edges: ${result.stats.edgesConverted} converted, ${result.stats.edgesSkipped} skipped`);

  if (result.stats.syntheticModsCreated > 0) {
    console.log(`Synthetic MODs: ${result.stats.syntheticModsCreated}`);
  }
  if (result.stats.syntheticTestsCreated > 0) {
    console.log(`Synthetic TESTs: ${result.stats.syntheticTestsCreated}`);
  }

  if (result.warnings.length > 0) {
    console.log('');
    console.log('Warnings:');
    for (const w of result.warnings) {
      console.log(`  - ${w}`);
    }
  }
}
