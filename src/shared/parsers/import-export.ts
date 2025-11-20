/**
 * Import/Export Functions
 *
 * Provides file-based import and export of system graphs in Format E (.txt files).
 * Uses FormatEParser for serialization/deserialization.
 *
 * @author andreas@siglochconsulting
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { GraphState } from '../types/ontology.js';
import { FormatEParser } from './format-e-parser.js';

/**
 * Get export directory (respects process.env for testing)
 */
function getExportDir(): string {
  return process.env.IMPORT_EXPORT_DIR || path.join(process.cwd(), 'exports');
}

/**
 * Export system graph to a .txt file
 *
 * @param graphState - Graph state to export
 * @param filename - Optional filename (defaults to system-export.txt)
 * @returns Absolute path to the exported file
 *
 * @example
 * const filePath = await exportSystem(graphState, 'my-system.txt');
 * console.log(`Exported to ${filePath}`);
 */
export async function exportSystem(
  graphState: GraphState,
  filename?: string
): Promise<string> {
  const exportDir = getExportDir();

  // Ensure export directory exists
  await fs.mkdir(exportDir, { recursive: true });

  // Generate filename with timestamp if not provided
  const defaultFilename = filename || `system-export-${Date.now()}.txt`;
  const filePath = path.join(exportDir, defaultFilename);

  // Serialize graph to Format E
  const parser = new FormatEParser();
  const formatE = parser.serializeGraph(graphState);

  // Add header with metadata
  const header = [
    `# GraphEngine System Export`,
    `# Generated: ${new Date().toISOString()}`,
    `# System ID: ${graphState.systemId}`,
    `# Workspace ID: ${graphState.workspaceId}`,
    `# Nodes: ${graphState.nodes.size}`,
    `# Edges: ${graphState.edges.size}`,
    `#`,
    `# Format: Format E (Token-Efficient Serialization)`,
    `# File Extension: .txt (universal editor compatibility)`,
    `#`,
    ``,
  ].join('\n');

  // Write to file
  await fs.writeFile(filePath, header + formatE, 'utf-8');

  return filePath;
}

/**
 * Import system graph from a .txt file
 *
 * @param filename - Filename in exports directory or absolute path
 * @returns Parsed graph state
 *
 * @example
 * const graphState = await importSystem('my-system.txt');
 * console.log(`Loaded ${graphState.nodes.size} nodes`);
 */
export async function importSystem(filename: string): Promise<GraphState> {
  const exportDir = getExportDir();

  // Determine file path (absolute or relative to exports dir)
  const filePath = path.isAbsolute(filename)
    ? filename
    : path.join(exportDir, filename);

  // Check if file exists
  try {
    await fs.access(filePath);
  } catch {
    throw new Error(`Import file not found: ${filePath}`);
  }

  // Read file
  const content = await fs.readFile(filePath, 'utf-8');

  // Parse Format E (skip header comments)
  const parser = new FormatEParser();
  const graphState = parser.parseGraph(content);

  return graphState;
}

/**
 * List all available export files in the exports directory
 *
 * @returns Array of filenames (not full paths)
 *
 * @example
 * const files = await listExports();
 * console.log(`Available exports: ${files.join(', ')}`);
 */
export async function listExports(): Promise<string[]> {
  const exportDir = getExportDir();

  try {
    // Ensure directory exists
    await fs.mkdir(exportDir, { recursive: true });

    // Read directory
    const files = await fs.readdir(exportDir);

    // Filter .txt files only
    return files.filter((f) => f.endsWith('.txt')).sort();
  } catch {
    // Directory doesn't exist or is not accessible
    return [];
  }
}

/**
 * Delete an export file
 *
 * @param filename - Filename in exports directory
 * @returns True if deleted, false if not found
 *
 * @example
 * const deleted = await deleteExport('old-system.txt');
 * if (deleted) console.log('Export deleted');
 */
export async function deleteExport(filename: string): Promise<boolean> {
  const exportDir = getExportDir();
  const filePath = path.join(exportDir, filename);

  try {
    await fs.unlink(filePath);
    return true;
  } catch {
    // File doesn't exist
    return false;
  }
}

/**
 * Get metadata from an export file without loading the full graph
 *
 * @param filename - Filename in exports directory or absolute path
 * @returns Metadata object
 *
 * @example
 * const meta = await getExportMetadata('my-system.txt');
 * console.log(`System: ${meta.systemId}, Nodes: ${meta.nodeCount}`);
 */
export async function getExportMetadata(filename: string): Promise<{
  systemId: string | null;
  workspaceId: string | null;
  nodeCount: number | null;
  edgeCount: number | null;
  generatedAt: string | null;
}> {
  const exportDir = getExportDir();

  // Determine file path
  const filePath = path.isAbsolute(filename)
    ? filename
    : path.join(exportDir, filename);

  // Read file
  const content = await fs.readFile(filePath, 'utf-8');

  // Parse header comments (first ~10 lines)
  const lines = content.split('\n').slice(0, 15);

  const metadata = {
    systemId: null as string | null,
    workspaceId: null as string | null,
    nodeCount: null as number | null,
    edgeCount: null as number | null,
    generatedAt: null as string | null,
  };

  for (const line of lines) {
    if (line.startsWith('# Generated:')) {
      metadata.generatedAt = line.replace('# Generated:', '').trim();
    } else if (line.startsWith('# System ID:')) {
      metadata.systemId = line.replace('# System ID:', '').trim();
    } else if (line.startsWith('# Workspace ID:')) {
      metadata.workspaceId = line.replace('# Workspace ID:', '').trim();
    } else if (line.startsWith('# Nodes:')) {
      metadata.nodeCount = parseInt(line.replace('# Nodes:', '').trim(), 10);
    } else if (line.startsWith('# Edges:')) {
      metadata.edgeCount = parseInt(line.replace('# Edges:', '').trim(), 10);
    }
  }

  return metadata;
}
