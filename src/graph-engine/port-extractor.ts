/**
 * Port Extractor
 *
 * Extracts port definitions from FLOW nodes
 *
 * Pattern:
 * - FLOW → FUNC = Input port (left side of FUNC)
 * - FUNC → FLOW = Output port (right side of FUNC)
 * - FLOW → ACTOR = Input port (actor receives)
 * - ACTOR → FLOW = Output port (actor sends)
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { GraphState, Node } from '../shared/types/ontology.js';
import { Port, NodePorts } from '../shared/types/layout.js';

/**
 * Port Extractor
 *
 * Extracts ports from FLOW→FUNC and FUNC→FLOW io edges
 *
 * TEST: tests/unit/graph-engine/port-extractor.test.ts
 */
export class PortExtractor {
  /**
   * Extract ports for a specific node
   *
   * @param graph - Graph state
   * @param nodeId - Node semantic ID
   * @returns Node ports (inputs and outputs)
   */
  extractPorts(graph: GraphState, nodeId: string): NodePorts {
    const inputs: Port[] = [];
    const outputs: Port[] = [];

    // Find all io edges connected to this node
    for (const edge of graph.edges.values()) {
      if (edge.type !== 'io') {
        continue;
      }

      // FLOW → Node = Input port
      if (edge.targetId === nodeId) {
        const sourceNode = graph.nodes.get(edge.sourceId);
        if (sourceNode && sourceNode.type === 'FLOW') {
          inputs.push({
            id: sourceNode.semanticId,
            label: sourceNode.name,
            position: 'left',
            type: 'input',
            flowProperties: this.extractFlowProperties(sourceNode),
          });
        }
      }

      // Node → FLOW = Output port
      if (edge.sourceId === nodeId) {
        const targetNode = graph.nodes.get(edge.targetId);
        if (targetNode && targetNode.type === 'FLOW') {
          outputs.push({
            id: targetNode.semanticId,
            label: targetNode.name,
            position: 'right',
            type: 'output',
            flowProperties: this.extractFlowProperties(targetNode),
          });
        }
      }
    }

    return {
      nodeId,
      inputs,
      outputs,
    };
  }

  /**
   * Extract ports for all nodes in graph
   *
   * @param graph - Graph state
   * @returns Map of node ID to ports
   */
  extractAllPorts(graph: GraphState): Map<string, NodePorts> {
    const allPorts = new Map<string, NodePorts>();

    for (const node of graph.nodes.values()) {
      // Only extract ports for FUNC and ACTOR nodes (not FLOW itself)
      if (node.type === 'FUNC' || node.type === 'ACTOR') {
        const ports = this.extractPorts(graph, node.semanticId);
        if (ports.inputs.length > 0 || ports.outputs.length > 0) {
          allPorts.set(node.semanticId, ports);
        }
      }
    }

    return allPorts;
  }

  /**
   * Extract FLOW properties
   *
   * (Placeholder for Phase 3 - will extract from FLOW node metadata)
   */
  private extractFlowProperties(flowNode: Node) {
    // TODO: Extract from flowNode.properties when schema is defined
    return {
      dataType: flowNode.descr?.match(/Type:\s*(\w+)/)?.[1],
      pattern: flowNode.descr?.match(/Pattern:\s*(.+)/)?.[1],
      validation: flowNode.descr?.match(/Validation:\s*(.+)/)?.[1],
    };
  }
}
