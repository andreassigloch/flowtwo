#!/usr/bin/env tsx
/**
 * Physical Layer Generator (Proof of Concept)
 * Auto-generates MOD nodes and MOD→MOD edges from codebase
 * @author andreas@siglochconsulting
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ModNode {
  id: string;
  type: 'MOD';
  name: string;
  description: string;
  filePath?: string;
}

interface ModEdge {
  source: string;
  target: string;
  type: 'cp' | 'rel';
}

function toPascalCase(str: string): string {
  return str
    .replace(/[-_](.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, (_, c) => c.toUpperCase())
    .replace(/\.ts$/, '');
}

function extractDescription(filePath: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    // Look for JSDoc description or first comment block
    for (let i = 0; i < Math.min(20, lines.length); i++) {
      const line = lines[i].trim();

      // JSDoc @description
      if (line.includes('@description')) {
        return line.replace(/.*@description\s+/, '').trim();
      }

      // Comment block description (not @author, @version, etc.)
      if (
        line.startsWith('*') &&
        !line.includes('@') &&
        line.length > 3 &&
        !line.includes('===')
      ) {
        return line.replace(/^\*\s*/, '').trim();
      }
    }

    // Fallback: use filename
    return `${path.basename(filePath, '.ts')} module`;
  } catch {
    return 'Module';
  }
}

function scanDirectory(
  dir: string,
  baseDir: string
): { nodes: ModNode[]; edges: ModEdge[] } {
  const nodes: ModNode[] = [];
  const edges: ModEdge[] = [];

  function walk(currentDir: string, parentId?: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(baseDir, fullPath);

      if (entry.isDirectory()) {
        // Create directory MOD node
        const dirId = `${toPascalCase(entry.name)}.MOD`;
        const dirNode: ModNode = {
          id: dirId,
          type: 'MOD',
          name: `${entry.name.charAt(0).toUpperCase() + entry.name.slice(1)} Module`,
          description: `${entry.name}/ directory containing related modules`,
        };

        nodes.push(dirNode);

        // Parent-child edge (directory hierarchy)
        if (parentId) {
          edges.push({ source: parentId, target: dirId, type: 'cp' });
        }

        // Recurse
        walk(fullPath, dirId);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        // Create file MOD node
        const fileId = `${toPascalCase(entry.name)}.MOD`;
        const fileName = entry.name.replace('.ts', '');
        const description = extractDescription(fullPath);

        const fileNode: ModNode = {
          id: fileId,
          type: 'MOD',
          name: fileName
            .split('-')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' '),
          description,
          filePath: relativePath,
        };

        nodes.push(fileNode);

        // Parent-child edge (file in directory)
        if (parentId) {
          edges.push({ source: parentId, target: fileId, type: 'cp' });
        }
      }
    }
  }

  walk(dir);
  return { nodes, edges };
}

function extractImports(filePath: string): string[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const imports: string[] = [];

  // Regex to match import statements
  const importRegex = /import\s+(?:type\s+)?(?:{[^}]+}|[\w\s,*]+)\s+from\s+['"]([^'"]+)['"]/g;

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    const importPath = match[1];

    // Only relative imports (exclude node_modules and type-only)
    if (importPath.startsWith('.')) {
      imports.push(importPath);
    }
  }

  return imports;
}

function resolveImportToModId(
  importPath: string,
  currentFile: string,
  baseDir: string
): string | null {
  try {
    const currentDir = path.dirname(path.join(baseDir, currentFile));
    let resolved = path.resolve(currentDir, importPath);

    // Add .ts extension if missing
    if (!resolved.endsWith('.ts') && !resolved.endsWith('.js')) {
      if (fs.existsSync(resolved + '.ts')) {
        resolved = resolved + '.ts';
      } else if (fs.existsSync(resolved + '/index.ts')) {
        resolved = resolved + '/index.ts';
      }
    }

    // Convert .js to .ts (ESM imports)
    resolved = resolved.replace(/\.js$/, '.ts');

    if (!fs.existsSync(resolved)) {
      return null;
    }

    const relativePath = path.relative(baseDir, resolved);
    const filename = path.basename(relativePath);
    return `${toPascalCase(filename)}.MOD`;
  } catch {
    return null;
  }
}

function generateImportEdges(nodes: ModNode[], baseDir: string): ModEdge[] {
  const edges: ModEdge[] = [];

  for (const node of nodes) {
    if (!node.filePath) continue;

    const fullPath = path.join(baseDir, node.filePath);
    const imports = extractImports(fullPath);

    for (const importPath of imports) {
      const targetId = resolveImportToModId(importPath, node.filePath, baseDir);
      if (targetId && targetId !== node.id) {
        edges.push({ source: node.id, target: targetId, type: 'rel' });
      }
    }
  }

  return edges;
}

function generateFormatE(nodes: ModNode[], edges: ModEdge[]): string {
  let output = '# Physical Layer (Auto-Generated)\n\n';
  output += '[Nodes]\n\n';

  // Root node
  output += 'GraphEngine.MOD|MOD|GraphEngine Root|Root module containing all source code\n\n';

  // Sort nodes by type (directories first, then files)
  const sortedNodes = [...nodes].sort((a, b) => {
    const aIsDir = !a.filePath;
    const bIsDir = !b.filePath;
    if (aIsDir && !bIsDir) return -1;
    if (!aIsDir && bIsDir) return 1;
    return a.id.localeCompare(b.id);
  });

  for (const node of sortedNodes) {
    output += `${node.id}|${node.type}|${node.name}|${node.description}\n`;
  }

  output += '\n[Edges]\n\n';
  output += '# Composition edges (hierarchy)\n';

  const composeEdges = edges.filter((e) => e.type === 'cp');
  for (const edge of composeEdges) {
    output += `${edge.source}-cp->${edge.target}\n`;
  }

  output += '\n# Relation edges (imports)\n';

  const relEdges = edges.filter((e) => e.type === 'rel');
  for (const edge of relEdges) {
    output += `${edge.source}-rel->${edge.target}\n`;
  }

  return output;
}

function main() {
  const startTime = Date.now();
  const srcDir = path.join(__dirname, '..', 'src');

  console.log('=== PHYSICAL LAYER GENERATOR ===\n');
  console.log('Scanning:', srcDir, '\n');

  // Phase 1: Scan file system
  const { nodes, edges: hierarchyEdges } = scanDirectory(srcDir, srcDir);
  console.log(`✓ Found ${nodes.length} MOD nodes`);
  console.log(`✓ Generated ${hierarchyEdges.length} hierarchy edges\n`);

  // Phase 2: Extract imports
  const importEdges = generateImportEdges(nodes, srcDir);
  console.log(`✓ Extracted ${importEdges.length} import edges\n`);

  // Combine edges
  const allEdges = [...hierarchyEdges, ...importEdges];

  // Phase 3: Generate Format-E
  const formatE = generateFormatE(nodes, allEdges);

  // Write output
  const outputPath = path.join(__dirname, '..', 'examples', 'physical-layer-auto.format-e');
  fs.writeFileSync(outputPath, formatE, 'utf-8');

  const endTime = Date.now();
  console.log(`✓ Generated: ${outputPath}`);
  console.log(`✓ Time: ${endTime - startTime}ms\n`);

  // Statistics
  console.log('=== STATISTICS ===');
  console.log(`Total nodes: ${nodes.length + 1} (including root)`);
  console.log(`Hierarchy edges: ${hierarchyEdges.length}`);
  console.log(`Import edges: ${importEdges.length}`);
  console.log(`Total edges: ${allEdges.length}\n`);
}

main();
