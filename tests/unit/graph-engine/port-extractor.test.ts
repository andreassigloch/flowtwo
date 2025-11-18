/**
 * Port Extractor - Unit Tests
 *
 * Test Category: Unit (70% of test pyramid)
 * Purpose: Validate port extraction from FLOW nodes
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { describe, it, expect } from 'vitest';
import { PortExtractor } from '../../../src/graph-engine/port-extractor.js';
import { GraphState, Node, Edge } from '../../../src/shared/types/ontology.js';

describe('PortExtractor', () => {
  describe('extractPorts', () => {
    it('should extract input port (FLOW → FUNC)', () => {
      const graph = createGraphWithPorts([
        createNode('TestFunc.FN.001', 'FUNC', 'TestFunc'),
        createNode('InputData.FL.001', 'FLOW', 'InputData'),
      ], [
        createEdge('InputData.FL.001', 'TestFunc.FN.001', 'io'),
      ]);

      const extractor = new PortExtractor();
      const ports = extractor.extractPorts(graph, 'TestFunc.FN.001');

      expect(ports.inputs.length).toBe(1);
      expect(ports.inputs[0].id).toBe('InputData.FL.001');
      expect(ports.inputs[0].label).toBe('InputData');
      expect(ports.inputs[0].position).toBe('left');
      expect(ports.inputs[0].type).toBe('input');

      expect(ports.outputs.length).toBe(0);
    });

    it('should extract output port (FUNC → FLOW)', () => {
      const graph = createGraphWithPorts([
        createNode('TestFunc.FN.001', 'FUNC', 'TestFunc'),
        createNode('OutputData.FL.002', 'FLOW', 'OutputData'),
      ], [
        createEdge('TestFunc.FN.001', 'OutputData.FL.002', 'io'),
      ]);

      const extractor = new PortExtractor();
      const ports = extractor.extractPorts(graph, 'TestFunc.FN.001');

      expect(ports.outputs.length).toBe(1);
      expect(ports.outputs[0].id).toBe('OutputData.FL.002');
      expect(ports.outputs[0].label).toBe('OutputData');
      expect(ports.outputs[0].position).toBe('right');
      expect(ports.outputs[0].type).toBe('output');

      expect(ports.inputs.length).toBe(0);
    });

    it('should extract multiple input and output ports', () => {
      const graph = createGraphWithPorts([
        createNode('ProcessData.FN.001', 'FUNC', 'ProcessData'),
        createNode('Input1.FL.001', 'FLOW', 'Input1'),
        createNode('Input2.FL.002', 'FLOW', 'Input2'),
        createNode('Output1.FL.003', 'FLOW', 'Output1'),
        createNode('Output2.FL.004', 'FLOW', 'Output2'),
      ], [
        createEdge('Input1.FL.001', 'ProcessData.FN.001', 'io'),
        createEdge('Input2.FL.002', 'ProcessData.FN.001', 'io'),
        createEdge('ProcessData.FN.001', 'Output1.FL.003', 'io'),
        createEdge('ProcessData.FN.001', 'Output2.FL.004', 'io'),
      ]);

      const extractor = new PortExtractor();
      const ports = extractor.extractPorts(graph, 'ProcessData.FN.001');

      expect(ports.inputs.length).toBe(2);
      expect(ports.outputs.length).toBe(2);

      expect(ports.inputs.map((p) => p.label)).toContain('Input1');
      expect(ports.inputs.map((p) => p.label)).toContain('Input2');
      expect(ports.outputs.map((p) => p.label)).toContain('Output1');
      expect(ports.outputs.map((p) => p.label)).toContain('Output2');
    });

    it('should return empty ports for node without FLOW connections', () => {
      const graph = createGraphWithPorts([
        createNode('Standalone.FN.001', 'FUNC', 'Standalone'),
      ], []);

      const extractor = new PortExtractor();
      const ports = extractor.extractPorts(graph, 'Standalone.FN.001');

      expect(ports.inputs.length).toBe(0);
      expect(ports.outputs.length).toBe(0);
    });

    it('should ignore non-io edges', () => {
      const graph = createGraphWithPorts([
        createNode('TestFunc.FN.001', 'FUNC', 'TestFunc'),
        createNode('TestReq.RQ.001', 'REQ', 'TestReq'),
      ], [
        createEdge('TestFunc.FN.001', 'TestReq.RQ.001', 'satisfy'),
      ]);

      const extractor = new PortExtractor();
      const ports = extractor.extractPorts(graph, 'TestFunc.FN.001');

      // satisfy edge should be ignored (not io)
      expect(ports.inputs.length).toBe(0);
      expect(ports.outputs.length).toBe(0);
    });

    it('should extract ports for ACTOR nodes (ACTOR ↔ FLOW)', () => {
      const graph = createGraphWithPorts([
        createNode('User.AC.001', 'ACTOR', 'User'),
        createNode('UserInput.FL.001', 'FLOW', 'UserInput'),
        createNode('SystemResponse.FL.002', 'FLOW', 'SystemResponse'),
      ], [
        createEdge('User.AC.001', 'UserInput.FL.001', 'io'),
        createEdge('SystemResponse.FL.002', 'User.AC.001', 'io'),
      ]);

      const extractor = new PortExtractor();
      const ports = extractor.extractPorts(graph, 'User.AC.001');

      // ACTOR → FLOW = output (actor sends data)
      expect(ports.outputs.length).toBe(1);
      expect(ports.outputs[0].label).toBe('UserInput');

      // FLOW → ACTOR = input (actor receives data)
      expect(ports.inputs.length).toBe(1);
      expect(ports.inputs[0].label).toBe('SystemResponse');
    });
  });

  describe('extractAllPorts', () => {
    it('should extract ports for all nodes in graph', () => {
      const graph = createGraphWithPorts([
        createNode('Func1.FN.001', 'FUNC', 'Func1'),
        createNode('Func2.FN.002', 'FUNC', 'Func2'),
        createNode('Flow1.FL.001', 'FLOW', 'Flow1'),
      ], [
        createEdge('Func1.FN.001', 'Flow1.FL.001', 'io'),
        createEdge('Flow1.FL.001', 'Func2.FN.002', 'io'),
      ]);

      const extractor = new PortExtractor();
      const allPorts = extractor.extractAllPorts(graph);

      expect(allPorts.size).toBe(2); // Func1 and Func2 (not FLOW)
      expect(allPorts.has('Func1.FN.001')).toBe(true);
      expect(allPorts.has('Func2.FN.002')).toBe(true);

      const func1Ports = allPorts.get('Func1.FN.001')!;
      expect(func1Ports.outputs.length).toBe(1);

      const func2Ports = allPorts.get('Func2.FN.002')!;
      expect(func2Ports.inputs.length).toBe(1);
    });
  });
});

// ========== TEST HELPERS ==========

function createNode(
  semanticId: string,
  type: string,
  name: string
): Node {
  return {
    uuid: `uuid-${semanticId}`,
    semanticId,
    type: type as any,
    name,
    description: 'Test node',
    workspaceId: 'test-ws',
    systemId: 'System.SY.001',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
  };
}

function createEdge(
  sourceId: string,
  targetId: string,
  type: string = 'io'
): Edge {
  return {
    uuid: `uuid-${sourceId}-${targetId}`,
    type: type as any,
    sourceId,
    targetId,
    workspaceId: 'test-ws',
    systemId: 'System.SY.001',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'test-user',
  };
}

function createGraphWithPorts(nodes: Node[], edges: Edge[]): GraphState {
  return {
    workspaceId: 'test-ws',
    systemId: 'System.SY.001',
    nodes: new Map(nodes.map((n) => [n.semanticId, n])),
    edges: new Map(edges.map((e, idx) => [`edge-${idx}`, e])),
    ports: new Map(),
    version: 1,
    lastSavedVersion: 1,
    lastModified: new Date(),
  };
}
