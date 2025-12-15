/**
 * Format E Parser - Unit Tests
 *
 * Test Category: Unit (70% of test pyramid)
 * Purpose: Validate Format E parsing and serialization
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { FormatEParser } from '../../../src/shared/parsers/format-e-parser.js';
import { GraphState } from '../../../src/shared/types/ontology.js';
import { FormatEDiff } from '../../../src/shared/types/canvas.js';
import { createSampleFormatE, createSampleDiff, createSampleGraph } from '../../setup.js';

describe('FormatEParser', () => {
  let parser: FormatEParser;

  beforeEach(() => {
    parser = new FormatEParser();
  });

  describe('parseGraph', () => {
    it('should parse valid Format E graph', () => {
      const formatE = createSampleFormatE();
      const result = parser.parseGraph(formatE);

      expect(result.nodes.size).toBe(3);
      expect(result.edges.size).toBe(2);
      expect(result.nodes.has('TestSystem.SY.001')).toBe(true);
      expect(result.nodes.has('NavigateEnvironment.UC.001')).toBe(true);
      expect(result.nodes.has('ProcessSensorData.FN.001')).toBe(true);
    });

    it('should parse node attributes correctly (CR-053 compact format)', () => {
      const formatE = `## Nodes
TestNode.FN.001|Test [x:100,y:200,zoom:L3]`;

      const result = parser.parseGraph(formatE);
      const node = result.nodes.get('TestNode.FN.001');

      expect(node).toBeDefined();
      expect(node!.name).toBe('TestNode');
      expect(node!.type).toBe('FUNC');
      expect(node!.position?.x).toBe(100);
      expect(node!.position?.y).toBe(200);
      expect(node!.zoomLevel).toBe('L3');
    });

    it('should parse edges with correct types (CR-053 compact format)', () => {
      const formatE = `## Nodes
A.SY.001|System A
B.UC.001|Use Case B

## Edges
A.SY.001 -cp-> B.UC.001`;

      const result = parser.parseGraph(formatE);

      expect(result.edges.size).toBe(1);
      const edgeKey = 'A.SY.001-compose-B.UC.001';
      const edge = result.edges.get(edgeKey);

      expect(edge).toBeDefined();
      expect(edge!.type).toBe('compose');
      expect(edge!.sourceId).toBe('A.SY.001');
      expect(edge!.targetId).toBe('B.UC.001');
    });

    it('should handle empty graph', () => {
      const formatE = `## Nodes

## Edges`;

      const result = parser.parseGraph(formatE);

      expect(result.nodes.size).toBe(0);
      expect(result.edges.size).toBe(0);
    });

    it('should extract systemId and workspaceId from header comments (CR-053 compact format)', () => {
      const formatE = `# GraphEngine System Export
# Generated: 2024-01-01T12:00:00.000Z
# System ID: MyTestSystem.SY.001
# Workspace ID: my-workspace
# Nodes: 2
# Edges: 1

## Nodes
MyTestSystem.SY.001|Test system
TestUC.UC.001|Test use case

## Edges
MyTestSystem.SY.001 -cp-> TestUC.UC.001`;

      const result = parser.parseGraph(formatE);

      expect(result.systemId).toBe('MyTestSystem.SY.001');
      expect(result.workspaceId).toBe('my-workspace');
      expect(result.nodes.size).toBe(2);
    });

    it('should auto-detect systemId from first SYS node when not in header (CR-053)', () => {
      const formatE = `## Nodes
AutoDetectedSys.SY.001|Auto-detected system
SomeUC.UC.001|Some use case`;

      const result = parser.parseGraph(formatE);

      expect(result.systemId).toBe('AutoDetectedSys.SY.001');
    });

    it('should parse all edge types correctly (CR-053 compact format)', () => {
      const formatE = `## Nodes
A.SY.001|A
B.UC.001|B
C.FN.001|C
D.RQ.001|D
E.TC.001|E
F.MD.001|F

## Edges
A.SY.001 -cp-> B.UC.001
B.UC.001 -io-> C.FN.001
C.FN.001 -sat-> D.RQ.001
E.TC.001 -ver-> D.RQ.001
C.FN.001 -alc-> F.MD.001
A.SY.001 -rel-> B.UC.001`;

      const result = parser.parseGraph(formatE);

      expect(result.edges.size).toBe(6);
      expect(result.edges.has('A.SY.001-compose-B.UC.001')).toBe(true);
      expect(result.edges.has('B.UC.001-io-C.FN.001')).toBe(true);
      expect(result.edges.has('C.FN.001-satisfy-D.RQ.001')).toBe(true);
      expect(result.edges.has('E.TC.001-verify-D.RQ.001')).toBe(true);
      expect(result.edges.has('C.FN.001-allocate-F.MD.001')).toBe(true);
      expect(result.edges.has('A.SY.001-relation-B.UC.001')).toBe(true);
    });

    it('should parse 1:N multi-target edge syntax (CR-053 compact format)', () => {
      const formatE = `## Nodes
A.SY.001|A
B.UC.001|B
C.UC.001|C
D.UC.001|D

## Edges
A.SY.001 -cp-> B.UC.001, C.UC.001, D.UC.001`;

      const result = parser.parseGraph(formatE);

      expect(result.edges.size).toBe(3);
      expect(result.edges.has('A.SY.001-compose-B.UC.001')).toBe(true);
      expect(result.edges.has('A.SY.001-compose-C.UC.001')).toBe(true);
      expect(result.edges.has('A.SY.001-compose-D.UC.001')).toBe(true);
    });

    it('should parse mixed 1:1 and 1:N edge syntax (CR-053 compact format)', () => {
      const formatE = `## Nodes
A.SY.001|A
B.UC.001|B
C.UC.001|C
D.FN.001|D

## Edges
A.SY.001 -cp-> B.UC.001, C.UC.001
B.UC.001 -io-> D.FN.001`;

      const result = parser.parseGraph(formatE);

      expect(result.edges.size).toBe(3);
      expect(result.edges.has('A.SY.001-compose-B.UC.001')).toBe(true);
      expect(result.edges.has('A.SY.001-compose-C.UC.001')).toBe(true);
      expect(result.edges.has('B.UC.001-io-D.FN.001')).toBe(true);
    });

    it('should handle trailing comma in multi-target syntax (CR-053)', () => {
      const formatE = `## Nodes
A.SY.001|A
B.UC.001|B

## Edges
A.SY.001 -cp-> B.UC.001,`;

      const result = parser.parseGraph(formatE);

      expect(result.edges.size).toBe(1);
      expect(result.edges.has('A.SY.001-compose-B.UC.001')).toBe(true);
    });
  });

  describe('parseDiff', () => {
    it('should parse valid diff operations', () => {
      const formatE = createSampleDiff();
      const result = parser.parseDiff(formatE);

      expect(result.baseSnapshot).toBe('TestSystem.SY.001@v1');
      expect(result.viewContext).toBe('Hierarchy');
      expect(result.operations.length).toBeGreaterThan(0);
    });

    it('should parse add node operation (CR-053 compact format)', () => {
      const formatE = `<operations>
<base_snapshot>Test.SY.001@v1</base_snapshot>

## Nodes
+ NewNode.FN.002|New function [x:100,y:200]

</operations>`;

      const result = parser.parseDiff(formatE);

      expect(result.operations.length).toBe(1);
      expect(result.operations[0].type).toBe('add_node');
      expect(result.operations[0].semanticId).toBe('NewNode.FN.002');
      expect(result.operations[0].node).toBeDefined();
      expect(result.operations[0].node!.name).toBe('NewNode');
      expect(result.operations[0].node!.type).toBe('FUNC');
    });

    it('should parse remove node operation', () => {
      const formatE = `<operations>
<base_snapshot>Test.SY.001@v1</base_snapshot>

## Nodes
- OldNode.FN.003

</operations>`;

      const result = parser.parseDiff(formatE);

      expect(result.operations.length).toBe(1);
      expect(result.operations[0].type).toBe('remove_node');
      expect(result.operations[0].semanticId).toBe('OldNode.FN.003');
    });

    it('should parse add edge operation', () => {
      const formatE = `<operations>
<base_snapshot>Test.SY.001@v1</base_snapshot>

## Edges
+ A.SY.001 -cp-> B.UC.001

</operations>`;

      const result = parser.parseDiff(formatE);

      expect(result.operations.length).toBe(1);
      expect(result.operations[0].type).toBe('add_edge');
      expect(result.operations[0].edge).toBeDefined();
      expect(result.operations[0].edge!.sourceId).toBe('A.SY.001');
      expect(result.operations[0].edge!.targetId).toBe('B.UC.001');
      expect(result.operations[0].edge!.type).toBe('compose');
    });

    it('should parse remove edge operation', () => {
      const formatE = `<operations>
<base_snapshot>Test.SY.001@v1</base_snapshot>

## Edges
- A.SY.001 -cp-> B.UC.001

</operations>`;

      const result = parser.parseDiff(formatE);

      expect(result.operations.length).toBe(1);
      expect(result.operations[0].type).toBe('remove_edge');
    });

    it('should parse mixed operations (CR-053 compact format)', () => {
      const formatE = `<operations>
<base_snapshot>Test.SY.001@v1</base_snapshot>

## Nodes
+ NewNode.FN.002|New
- OldNode.FN.003

## Edges
+ A.SY.001 -cp-> NewNode.FN.002
- A.SY.001 -cp-> OldNode.FN.003

</operations>`;

      const result = parser.parseDiff(formatE);

      expect(result.operations.length).toBe(4);
      expect(result.operations.filter((op) => op.type === 'add_node').length).toBe(1);
      expect(result.operations.filter((op) => op.type === 'remove_node').length).toBe(1);
      expect(result.operations.filter((op) => op.type === 'add_edge').length).toBe(1);
      expect(result.operations.filter((op) => op.type === 'remove_edge').length).toBe(1);
    });
  });

  describe('serializeGraph', () => {
    it('should serialize graph to Format E', () => {
      const sample = createSampleGraph();
      const state: GraphState = {
        workspaceId: sample.workspaceId,
        systemId: sample.systemId,
        nodes: new Map(
          sample.nodes.map((n) => [
            n.semanticId,
            {
              uuid: 'uuid-1',
              semanticId: n.semanticId,
              type: n.type as any,
              name: n.name,
              description: n.description,
              workspaceId: sample.workspaceId,
              systemId: sample.systemId,
              position: { x: 0, y: 0 },
              zoomLevel: 'L2',
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: 'test',
            },
          ])
        ),
        edges: new Map(
          sample.edges.map((e, idx) => [
            `edge-${idx}`,
            {
              uuid: `uuid-${idx}`,
              type: e.type as any,
              sourceId: e.sourceId,
              targetId: e.targetId,
              workspaceId: sample.workspaceId,
              systemId: sample.systemId,
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: 'test',
            },
          ])
        ),
        ports: new Map(),
        version: 1,
        lastSavedVersion: 1,
        lastModified: new Date(),
      };

      const result = parser.serializeGraph(state);

      expect(result).toContain('## Nodes');
      expect(result).toContain('## Edges');
      // CR-053: Compact format - SemanticId|Description
      expect(result).toContain('TestSystem.SY.001|');
      expect(result).toContain('NavigateEnvironment.UC.001|');
      expect(result).toContain('-cp->');
    });

    it('should include view context when provided', () => {
      const state: GraphState = {
        workspaceId: 'test',
        systemId: 'test',
        nodes: new Map(),
        edges: new Map(),
        ports: new Map(),
        version: 1,
        lastSavedVersion: 1,
        lastModified: new Date(),
      };

      const result = parser.serializeGraph(state, 'Hierarchy');

      expect(result).toContain('## View-Context');
      expect(result).toContain('Type: Hierarchy');
    });

    it('should serialize edges with 1:N grouping', () => {
      const state: GraphState = {
        workspaceId: 'test',
        systemId: 'test',
        nodes: new Map([
          [
            'A.SY.001',
            {
              uuid: 'u1',
              semanticId: 'A.SY.001',
              type: 'SYS',
              name: 'A',
              workspaceId: 'test',
              systemId: 'test',
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: 'test',
            },
          ],
        ]),
        edges: new Map([
          [
            'e1',
            {
              uuid: 'e1',
              type: 'compose',
              sourceId: 'A.SY.001',
              targetId: 'B.UC.001',
              workspaceId: 'test',
              systemId: 'test',
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: 'test',
            },
          ],
          [
            'e2',
            {
              uuid: 'e2',
              type: 'compose',
              sourceId: 'A.SY.001',
              targetId: 'C.UC.001',
              workspaceId: 'test',
              systemId: 'test',
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: 'test',
            },
          ],
          [
            'e3',
            {
              uuid: 'e3',
              type: 'compose',
              sourceId: 'A.SY.001',
              targetId: 'D.UC.001',
              workspaceId: 'test',
              systemId: 'test',
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: 'test',
            },
          ],
        ]),
        ports: new Map(),
        version: 1,
        lastSavedVersion: 1,
        lastModified: new Date(),
      };

      const result = parser.serializeGraph(state);

      // Should have ONE line for all 3 edges with same source+type
      expect(result).toContain('A.SY.001 -cp-> B.UC.001, C.UC.001, D.UC.001');
      // Should NOT have separate lines
      const edgeLines = result.split('\n').filter((l) => l.includes('-cp->'));
      expect(edgeLines.length).toBe(1);
    });

    it('should separate edges with different types', () => {
      const state: GraphState = {
        workspaceId: 'test',
        systemId: 'test',
        nodes: new Map(),
        edges: new Map([
          [
            'e1',
            {
              uuid: 'e1',
              type: 'compose',
              sourceId: 'A.SY.001',
              targetId: 'B.UC.001',
              workspaceId: 'test',
              systemId: 'test',
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: 'test',
            },
          ],
          [
            'e2',
            {
              uuid: 'e2',
              type: 'io',
              sourceId: 'A.SY.001',
              targetId: 'C.FN.001',
              workspaceId: 'test',
              systemId: 'test',
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: 'test',
            },
          ],
        ]),
        ports: new Map(),
        version: 1,
        lastSavedVersion: 1,
        lastModified: new Date(),
      };

      const result = parser.serializeGraph(state);

      // Should have TWO lines - different edge types
      expect(result).toContain('A.SY.001 -cp-> B.UC.001');
      expect(result).toContain('A.SY.001 -io-> C.FN.001');
    });
  });

  describe('serializeDiff', () => {
    it('should serialize diff to Format E', () => {
      const diff: FormatEDiff = {
        baseSnapshot: 'Test.SY.001@v5',
        viewContext: 'Hierarchy',
        operations: [
          {
            type: 'add_node',
            semanticId: 'New.FN.001',
            node: {
              uuid: 'uuid-1',
              semanticId: 'New.FN.001',
              type: 'FUNC',
              name: 'NewFunc',
              descr: 'New function',
              workspaceId: 'test',
              systemId: 'test',
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: 'test',
            },
          },
          {
            type: 'remove_node',
            semanticId: 'Old.FN.002',
          },
        ],
      };

      const result = parser.serializeDiff(diff);

      expect(result).toContain('<operations>');
      expect(result).toContain('</operations>');
      expect(result).toContain('<base_snapshot>Test.SY.001@v5</base_snapshot>');
      expect(result).toContain('<view_context>Hierarchy</view_context>');
      // CR-053: Compact format - SemanticId|Description
      expect(result).toContain('+ New.FN.001|New function');
      expect(result).toContain('- Old.FN.002');
    });
  });

  describe('parseChatCanvas', () => {
    it('should parse chat messages', () => {
      const formatE = `## Messages
user|2025-11-17T10:00:00Z|Hello, add a function
assistant|2025-11-17T10:00:05Z|I'll add a function|<operations>+...</operations>`;

      const result = parser.parseChatCanvas(formatE);

      expect(result.messages.length).toBe(2);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content).toBe('Hello, add a function');
      expect(result.messages[1].role).toBe('assistant');
      expect(result.messages[1].operations).toBe('<operations>+...</operations>');
    });
  });

  describe('serializeChatCanvas', () => {
    it('should serialize chat messages', () => {
      const state = {
        chatId: 'chat-001',
        workspaceId: 'ws-001',
        systemId: 'sys-001',
        messages: [
          {
            messageId: 'msg-1',
            chatId: 'chat-001',
            role: 'user' as const,
            content: 'Test message',
            timestamp: new Date('2025-11-17T10:00:00Z'),
          },
        ],
        dirtyMessageIds: new Set<string>(),
        createdAt: new Date(),
        lastModified: new Date(),
      };

      const result = parser.serializeChatCanvas(state);

      expect(result).toContain('## Messages');
      expect(result).toContain('user|2025-11-17T10:00:00.000Z|Test message');
    });
  });

  describe('round-trip consistency', () => {
    it('should maintain consistency in parse→serialize→parse', () => {
      const original = createSampleFormatE();
      const parsed = parser.parseGraph(original);
      const serialized = parser.serializeGraph(parsed);
      const reparsed = parser.parseGraph(serialized);

      expect(reparsed.nodes.size).toBe(parsed.nodes.size);
      expect(reparsed.edges.size).toBe(parsed.edges.size);

      // Check specific nodes
      const originalNode = parsed.nodes.get('TestSystem.SY.001');
      const reparsedNode = reparsed.nodes.get('TestSystem.SY.001');

      expect(reparsedNode?.name).toBe(originalNode?.name);
      expect(reparsedNode?.type).toBe(originalNode?.type);
      expect(reparsedNode?.semanticId).toBe(originalNode?.semanticId);
    });
  });
});
