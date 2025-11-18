/**
 * Test Infrastructure Setup
 *
 * Test Pyramid: 70% Unit / 20% Integration / 10% E2E
 *
 * Quality Gates:
 * - Unit test coverage ≥80%
 * - Integration test coverage ≥60%
 * - E2E smoke tests: 100% pass rate
 * - Contract violations: 0
 * - Test isolation failures: 0
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { beforeEach, afterEach } from 'vitest';

/**
 * Sample graph data for testing
 */
export interface SampleGraph {
  workspaceId: string;
  systemId: string;
  nodes: Array<{
    semanticId: string;
    type: string;
    name: string;
    description?: string;
  }>;
  edges: Array<{
    sourceId: string;
    type: string;
    targetId: string;
  }>;
}

/**
 * Create sample system for testing
 *
 * Creates a simple system hierarchy:
 * - TestSystem (SYS)
 *   - NavigateEnvironment (UC)
 *     - ProcessSensorData (FUNC)
 */
export function createSampleGraph(): SampleGraph {
  return {
    workspaceId: 'test-workspace-001',
    systemId: 'TestSystem.SY.001',
    nodes: [
      {
        semanticId: 'TestSystem.SY.001',
        type: 'SYS',
        name: 'TestSystem',
        description: 'Test system for unit tests',
      },
      {
        semanticId: 'NavigateEnvironment.UC.001',
        type: 'UC',
        name: 'NavigateEnvironment',
        description: 'Navigate through environment',
      },
      {
        semanticId: 'ProcessSensorData.FN.001',
        type: 'FUNC',
        name: 'ProcessSensorData',
        description: 'Process incoming sensor data',
      },
    ],
    edges: [
      {
        sourceId: 'TestSystem.SY.001',
        type: 'compose',
        targetId: 'NavigateEnvironment.UC.001',
      },
      {
        sourceId: 'NavigateEnvironment.UC.001',
        type: 'compose',
        targetId: 'ProcessSensorData.FN.001',
      },
    ],
  };
}

/**
 * Create Format E string for testing
 */
export function createSampleFormatE(): string {
  return `## View-Context
Type: Hierarchy
Filter: All nodes | compose edges

## Nodes
TestSystem|SYS|TestSystem.SY.001|Test system [x:0,y:0]
NavigateEnvironment|UC|NavigateEnvironment.UC.001|Navigate environment [x:100,y:100]
ProcessSensorData|FUNC|ProcessSensorData.FN.001|Process sensor data [x:200,y:200]

## Edges
TestSystem.SY.001 -cp-> NavigateEnvironment.UC.001
NavigateEnvironment.UC.001 -cp-> ProcessSensorData.FN.001
`;
}

/**
 * Create sample Format E Diff for testing
 */
export function createSampleDiff(): string {
  return `<operations>
<base_snapshot>TestSystem.SY.001@v1</base_snapshot>
<view_context>Hierarchy</view_context>

## Nodes
+ NewFunction|FUNC|NewFunction.FN.002|Newly added function [x:300,y:300]
- OldFunction.FN.003

## Edges
+ TestSystem.SY.001 -cp-> NewFunction.FN.002
- TestSystem.SY.001 -cp-> OldFunction.FN.003
</operations>`;
}

/**
 * Mock Neo4j client for testing
 */
export class MockNeo4jClient {
  private data: Map<string, unknown> = new Map();

  async run(query: string, params?: Record<string, unknown>): Promise<unknown> {
    console.log('Mock Neo4j query:', query, params);
    return { records: [] };
  }

  async saveBatch(items: unknown[]): Promise<void> {
    items.forEach((item, index) => {
      this.data.set(`item-${index}`, item);
    });
  }

  async createAuditLog(log: unknown): Promise<void> {
    this.data.set('audit-log', log);
  }

  clear(): void {
    this.data.clear();
  }
}

/**
 * Setup/Teardown hooks
 */
let mockNeo4jClient: MockNeo4jClient;

beforeEach(() => {
  mockNeo4jClient = new MockNeo4jClient();
});

afterEach(() => {
  mockNeo4jClient.clear();
});

export { mockNeo4jClient };
