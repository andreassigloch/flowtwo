/**
 * Import/Export Unit Tests
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  exportSystem,
  importSystem,
  listExports,
  deleteExport,
  getExportMetadata,
} from '../../src/shared/parsers/import-export.js';
import { GraphState, Node, Edge } from '../../src/shared/types/ontology.js';

// Test directory (use /tmp to avoid polluting project)
const TEST_EXPORT_DIR = path.join('/tmp', 'graphengine-test-exports');

describe('Import/Export Functions', () => {
  let originalImportExportDir: string | undefined;

  beforeEach(async () => {
    // Save original env
    originalImportExportDir = process.env.IMPORT_EXPORT_DIR;

    // Set test export directory
    process.env.IMPORT_EXPORT_DIR = TEST_EXPORT_DIR;

    // Clean up test directory
    try {
      await fs.rm(TEST_EXPORT_DIR, { recursive: true });
    } catch {
      // Directory doesn't exist yet
    }
    await fs.mkdir(TEST_EXPORT_DIR, { recursive: true });
  });

  afterEach(async () => {
    // Restore original env
    if (originalImportExportDir !== undefined) {
      process.env.IMPORT_EXPORT_DIR = originalImportExportDir;
    } else {
      delete process.env.IMPORT_EXPORT_DIR;
    }

    // Clean up test directory
    try {
      await fs.rm(TEST_EXPORT_DIR, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('exportSystem', () => {
    it('should export graph to .txt file with header', async () => {
      // Arrange
      const testNode: Node = {
        id: 'TestNode.SYS.001',
        type: 'SYS',
        workspaceId: 'test-ws',
        systemId: 'test-sys',
        label: 'TestNode',
        description: 'Test description',
        x: 100,
        y: 200,
        zoom: 'L2',
        timestamp: Date.now(),
      };

      const graphState: GraphState = {
        workspaceId: 'test-ws',
        systemId: 'test-sys',
        nodes: new Map([['TestNode.SYS.001', testNode]]),
        edges: new Map(),
        ports: new Map(),
        metadata: {},
      };

      // Act
      const filePath = await exportSystem(graphState, 'test-export.txt');

      // Assert
      expect(filePath).toContain('test-export.txt');

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('# GraphEngine System Export');
      expect(content).toContain('# System ID: test-sys');
      expect(content).toContain('# Workspace ID: test-ws');
      expect(content).toContain('# Nodes: 1');
      expect(content).toContain('# Edges: 0');
      // Check for Nodes section and SYS type
      expect(content).toContain('## Nodes');
      expect(content).toContain('|SYS|');
    });

    it('should generate timestamped filename if not provided', async () => {
      // Arrange
      const graphState: GraphState = {
        workspaceId: 'test-ws',
        systemId: 'test-sys',
        nodes: new Map(),
        edges: new Map(),
        ports: new Map(),
        metadata: {},
      };

      // Act
      const filePath = await exportSystem(graphState);

      // Assert
      expect(filePath).toMatch(/system-export-\d+\.txt$/);
    });

    it('should handle graphs with edges', async () => {
      // Arrange
      const node1: Node = {
        id: 'Node1.SYS.001',
        type: 'SYS',
        workspaceId: 'test-ws',
        systemId: 'test-sys',
        label: 'Node1',
        description: 'First node',
        x: 0,
        y: 0,
        zoom: 'L2',
        timestamp: Date.now(),
      };

      const node2: Node = {
        id: 'Node2.MOD.001',
        type: 'MOD',
        workspaceId: 'test-ws',
        systemId: 'test-sys',
        label: 'Node2',
        description: 'Second node',
        x: 100,
        y: 0,
        zoom: 'L2',
        timestamp: Date.now(),
      };

      const edge: Edge = {
        id: 'edge-1',
        workspaceId: 'test-ws',
        systemId: 'test-sys',
        source: 'Node1.SYS.001',
        target: 'Node2.MOD.001',
        edgeType: 'compose',
        timestamp: Date.now(),
      };

      const graphState: GraphState = {
        workspaceId: 'test-ws',
        systemId: 'test-sys',
        nodes: new Map([
          ['Node1.SYS.001', node1],
          ['Node2.MOD.001', node2],
        ]),
        edges: new Map([['edge-1', edge]]),
        ports: new Map(),
        metadata: {},
      };

      // Act
      const filePath = await exportSystem(graphState, 'test-with-edges.txt');

      // Assert
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('# Nodes: 2');
      expect(content).toContain('# Edges: 1');
      // Check for edge section (parser may format differently)
      expect(content).toContain('## Edges');
    });
  });

  describe('importSystem', () => {
    it('should import graph from .txt file', async () => {
      // Arrange
      const testContent = `# GraphEngine System Export
# Generated: 2025-01-01T00:00:00.000Z
# System ID: test-sys
# Workspace ID: test-ws
# Nodes: 1
# Edges: 0
#

## Nodes
TestNode|SYS|Test Node|Test description [x:100,y:200,zoom:L2]

## Edges
`;

      const testFile = path.join(TEST_EXPORT_DIR, 'test-import.txt');
      await fs.writeFile(testFile, testContent, 'utf-8');

      // Act
      const graphState = await importSystem('test-import.txt');

      // Assert
      expect(graphState.nodes.size).toBeGreaterThan(0);
    });

    it('should throw error if file not found', async () => {
      // Act & Assert
      await expect(importSystem('non-existent.txt')).rejects.toThrow('Import file not found');
    });

    it('should handle absolute paths', async () => {
      // Arrange
      const testContent = `# GraphEngine System Export

## Nodes
TestNode|SYS|Test Node|Test description

## Edges
`;

      const absolutePath = path.join(TEST_EXPORT_DIR, 'absolute-test.txt');
      await fs.writeFile(absolutePath, testContent, 'utf-8');

      // Act
      const graphState = await importSystem(absolutePath);

      // Assert
      expect(graphState.nodes.size).toBeGreaterThan(0);
    });
  });

  describe('listExports', () => {
    it('should list all .txt files in exports directory', async () => {
      // Arrange - clean first to ensure isolation
      await fs.rm(TEST_EXPORT_DIR, { recursive: true });
      await fs.mkdir(TEST_EXPORT_DIR, { recursive: true });

      await fs.writeFile(path.join(TEST_EXPORT_DIR, 'file1.txt'), '', 'utf-8');
      await fs.writeFile(path.join(TEST_EXPORT_DIR, 'file2.txt'), '', 'utf-8');
      await fs.writeFile(path.join(TEST_EXPORT_DIR, 'other.json'), '', 'utf-8');

      // Act
      const files = await listExports();

      // Assert
      expect(files).toHaveLength(2);
      expect(files).toContain('file1.txt');
      expect(files).toContain('file2.txt');
      expect(files).not.toContain('other.json');
    });

    it('should return empty array if directory does not exist', async () => {
      // Arrange - delete and DON'T recreate
      await fs.rm(TEST_EXPORT_DIR, { recursive: true });

      // Act
      const files = await listExports();

      // Assert
      expect(files).toEqual([]);
    });

    it('should return sorted filenames', async () => {
      // Arrange - clean first
      await fs.rm(TEST_EXPORT_DIR, { recursive: true });
      await fs.mkdir(TEST_EXPORT_DIR, { recursive: true });

      await fs.writeFile(path.join(TEST_EXPORT_DIR, 'c.txt'), '', 'utf-8');
      await fs.writeFile(path.join(TEST_EXPORT_DIR, 'a.txt'), '', 'utf-8');
      await fs.writeFile(path.join(TEST_EXPORT_DIR, 'b.txt'), '', 'utf-8');

      // Act
      const files = await listExports();

      // Assert
      expect(files).toEqual(['a.txt', 'b.txt', 'c.txt']);
    });
  });

  describe('deleteExport', () => {
    it('should delete existing file', async () => {
      // Arrange - clean first
      await fs.rm(TEST_EXPORT_DIR, { recursive: true });
      await fs.mkdir(TEST_EXPORT_DIR, { recursive: true });

      const testFile = path.join(TEST_EXPORT_DIR, 'to-delete.txt');
      await fs.writeFile(testFile, 'test', 'utf-8');

      // Act
      const deleted = await deleteExport('to-delete.txt');

      // Assert
      expect(deleted).toBe(true);

      // Verify file is gone
      const exists = await fs
        .access(testFile)
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });

    it('should return false if file does not exist', async () => {
      // Act
      const deleted = await deleteExport('non-existent.txt');

      // Assert
      expect(deleted).toBe(false);
    });
  });

  describe('getExportMetadata', () => {
    it('should extract metadata from header', async () => {
      // Arrange - clean first
      await fs.rm(TEST_EXPORT_DIR, { recursive: true });
      await fs.mkdir(TEST_EXPORT_DIR, { recursive: true });

      const testContent = `# GraphEngine System Export
# Generated: 2025-01-15T12:34:56.789Z
# System ID: my-system
# Workspace ID: my-workspace
# Nodes: 42
# Edges: 108
#

## Nodes
`;

      const testFile = path.join(TEST_EXPORT_DIR, 'metadata-test.txt');
      await fs.writeFile(testFile, testContent, 'utf-8');

      // Act
      const metadata = await getExportMetadata('metadata-test.txt');

      // Assert
      expect(metadata.systemId).toBe('my-system');
      expect(metadata.workspaceId).toBe('my-workspace');
      expect(metadata.nodeCount).toBe(42);
      expect(metadata.edgeCount).toBe(108);
      expect(metadata.generatedAt).toBe('2025-01-15T12:34:56.789Z');
    });

    it('should return null for missing metadata fields', async () => {
      // Arrange - clean first
      await fs.rm(TEST_EXPORT_DIR, { recursive: true });
      await fs.mkdir(TEST_EXPORT_DIR, { recursive: true });

      const testContent = `# Some file
# Not a proper export

## Nodes
`;

      const testFile = path.join(TEST_EXPORT_DIR, 'incomplete-metadata.txt');
      await fs.writeFile(testFile, testContent, 'utf-8');

      // Act
      const metadata = await getExportMetadata('incomplete-metadata.txt');

      // Assert
      expect(metadata.systemId).toBeNull();
      expect(metadata.workspaceId).toBeNull();
      expect(metadata.nodeCount).toBeNull();
      expect(metadata.edgeCount).toBeNull();
      expect(metadata.generatedAt).toBeNull();
    });

    it('should handle absolute paths', async () => {
      // Arrange - clean first
      await fs.rm(TEST_EXPORT_DIR, { recursive: true });
      await fs.mkdir(TEST_EXPORT_DIR, { recursive: true });

      const testContent = `# GraphEngine System Export
# Generated: 2025-01-01
# System ID: abs-test
# Workspace ID: abs-ws
# Nodes: 5
# Edges: 3

## Nodes
`;

      const absolutePath = path.join(TEST_EXPORT_DIR, 'abs-metadata.txt');
      await fs.writeFile(absolutePath, testContent, 'utf-8');

      // Act
      const metadata = await getExportMetadata(absolutePath);

      // Assert
      expect(metadata.systemId).toBe('abs-test');
      expect(metadata.nodeCount).toBe(5);
    });
  });
});
