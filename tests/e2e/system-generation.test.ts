/**
 * System Generation E2E Tests
 *
 * Tests end-to-end system generation flow:
 * 1. User requests system creation via chat
 * 2. Agent routes to system-architect
 * 3. LLM generates Format E operations
 * 4. Graph canvas applies operations
 * 5. Graph is persisted and retrievable
 *
 * CR-027: Tests full agent-driven workflow
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { GraphCanvas } from '../../src/canvas/graph-canvas.js';
import { ChatCanvas } from '../../src/canvas/chat-canvas.js';
import { Neo4jClient } from '../../src/neo4j-client/neo4j-client.js';
import { FormatEParser } from '../../src/shared/parsers/format-e-parser.js';
import { getWorkflowRouter, SessionContext } from '../../src/llm-engine/agents/workflow-router.js';
import { getAgentExecutor } from '../../src/llm-engine/agents/agent-executor.js';
import { getAgentConfigLoader } from '../../src/llm-engine/agents/config-loader.js';

const workspaceId = 'e2e-system-gen';
const systemId = 'TestSystem.SY.001';
const chatId = 'e2e-chat-001';
const userId = 'e2e-test-user';

describe('System Generation E2E', () => {
  let neo4jClient: Neo4jClient;
  let graphCanvas: GraphCanvas;
  let chatCanvas: ChatCanvas;
  let parser: FormatEParser;

  beforeAll(async () => {
    // Initialize Neo4j client
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'test1234';
    neo4jClient = new Neo4jClient({ uri, user, password });

    parser = new FormatEParser();
  });

  beforeEach(async () => {
    // Create fresh canvases for each test
    graphCanvas = new GraphCanvas(
      workspaceId,
      systemId,
      chatId,
      userId,
      'hierarchy',
      neo4jClient
    );

    chatCanvas = new ChatCanvas(workspaceId, systemId, chatId, userId);
  });

  afterAll(async () => {
    await neo4jClient?.close();
  });

  it('routes system creation request to requirements-engineer', async () => {
    const workflowRouter = getWorkflowRouter();

    const sessionContext: SessionContext = {
      currentPhase: 'phase1_requirements',
      graphEmpty: true,
      userMessage: 'Create a coffee supply system for an office',
    };

    const selectedAgent = workflowRouter.routeUserInput(
      'Create a coffee supply system for an office',
      sessionContext
    );

    // When graph is empty, requirements-engineer creates SYS, UC, REQ nodes first
    expect(selectedAgent).toBe('requirements-engineer');
  });

  it('routes requirement request to requirements-engineer', async () => {
    const workflowRouter = getWorkflowRouter();

    const sessionContext: SessionContext = {
      currentPhase: 'phase1_requirements',
      graphEmpty: false,
      userMessage: 'Add a requirement for user authentication',
    };

    const selectedAgent = workflowRouter.routeUserInput(
      'Add a requirement for user authentication',
      sessionContext
    );

    expect(selectedAgent).toBe('requirements-engineer');
  });

  it('loads agent-specific prompts from config', async () => {
    const agentExecutor = getAgentExecutor();
    const configLoader = getAgentConfigLoader();

    // Verify all 5 agents have prompts
    const agentIds = configLoader.getAgentIds();
    expect(agentIds).toContain('system-architect');
    expect(agentIds).toContain('requirements-engineer');
    expect(agentIds).toContain('architecture-reviewer');
    expect(agentIds).toContain('functional-analyst');
    expect(agentIds).toContain('verification-engineer');

    // Verify system-architect prompt loads
    const prompt = agentExecutor.getAgentPrompt('system-architect');
    expect(prompt).toContain('System Architect');
  });

  it('builds agent context prompt with graph state', async () => {
    const agentExecutor = getAgentExecutor();

    const graphSnapshot = `## Nodes
+ TestSystem|SYS|TestSystem.SY.001|A test system

## Edges
`;

    const contextPrompt = agentExecutor.getAgentContextPrompt(
      'system-architect',
      graphSnapshot,
      'Add a payment processing function'
    );

    // Prompt should include graph state
    expect(contextPrompt).toContain('TestSystem.SY.001');
    expect(contextPrompt).toContain('Add a payment processing function');
  });

  it('applies Format E operations to graph canvas', async () => {
    // Simulate LLM-generated operations
    const operations = `<operations>
<base_snapshot>${systemId}@v1</base_snapshot>

## Nodes
+ CoffeeSystem|SYS|CoffeeSystem.SY.001|Office coffee supply system
+ OrderCoffee|UC|OrderCoffee.UC.001|User orders coffee
+ BrewCoffee|FUNC|BrewCoffee.FN.001|Brews the coffee

## Edges
+ CoffeeSystem.SY.001 -cp-> OrderCoffee.UC.001
+ OrderCoffee.UC.001 -cp-> BrewCoffee.FN.001
</operations>`;

    const parsed = parser.parseDiff(operations, workspaceId, systemId);
    await graphCanvas.applyDiff(parsed);

    const state = graphCanvas.getState();

    // Verify nodes created
    expect(state.nodes.size).toBe(3);
    expect(state.nodes.has('CoffeeSystem.SY.001')).toBe(true);
    expect(state.nodes.has('OrderCoffee.UC.001')).toBe(true);
    expect(state.nodes.has('BrewCoffee.FN.001')).toBe(true);

    // Verify edges created
    expect(state.edges.size).toBe(2);

    // Verify node types
    const sysNode = state.nodes.get('CoffeeSystem.SY.001');
    expect(sysNode?.type).toBe('SYS');

    const ucNode = state.nodes.get('OrderCoffee.UC.001');
    expect(ucNode?.type).toBe('UC');

    const funcNode = state.nodes.get('BrewCoffee.FN.001');
    expect(funcNode?.type).toBe('FUNC');
  });

  it('calculates reward for agent execution', async () => {
    const agentExecutor = getAgentExecutor();

    // Successful execution with operations
    const successResult = {
      agentId: 'system-architect',
      textResponse: 'Created coffee system',
      operations: '## Nodes\n+ CoffeeSystem|SYS|...',
      isComplete: true,
    };

    const successReward = agentExecutor.calculateReward('system-architect', successResult);
    expect(successReward).toBeGreaterThan(0.5);
    expect(successReward).toBeLessThanOrEqual(1.0);

    // Partial execution (no completion bonus)
    const partialResult = {
      agentId: 'system-architect',
      textResponse: 'Working on it...',
      isComplete: false,
    };

    const partialReward = agentExecutor.calculateReward('system-architect', partialResult);
    expect(partialReward).toBeLessThanOrEqual(successReward);
  });

  it('serializes graph to Format E for LLM context', async () => {
    // Add some nodes
    const operations = `<operations>
<base_snapshot>${systemId}@v1</base_snapshot>

## Nodes
+ TestSys|SYS|TestSys.SY.001|Test system
+ TestFunc|FUNC|TestFunc.FN.001|Test function

## Edges
+ TestSys.SY.001 -cp-> TestFunc.FN.001
</operations>`;

    const parsed = parser.parseDiff(operations, workspaceId, systemId);
    await graphCanvas.applyDiff(parsed);

    // Serialize for LLM
    const state = graphCanvas.getState();
    const serialized = parser.serializeGraph(state);

    // Verify serialization format
    expect(serialized).toContain('## Nodes');
    expect(serialized).toContain('TestSys.SY.001');
    expect(serialized).toContain('TestFunc.FN.001');
    expect(serialized).toContain('## Edges');
    expect(serialized).toContain('-cp->');
  });

  it('validates agent configuration structure', async () => {
    const configLoader = getAgentConfigLoader();
    const validation = configLoader.validate();

    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('chat canvas stores conversation history', async () => {
    // Add user message
    await chatCanvas.addUserMessage('Create a payment system');

    // Add assistant response
    await chatCanvas.addAssistantMessage(
      'I will create a payment processing system with the following components...',
      '## Nodes\n+ PaymentSystem|SYS|PaymentSystem.SY.001|Payment system'
    );

    // Get conversation context
    const context = chatCanvas.getConversationContext(10);

    expect(context.length).toBe(2);
    expect(context[0].role).toBe('user');
    expect(context[0].content).toContain('Create a payment system');
    expect(context[1].role).toBe('assistant');
    expect(context[1].content).toContain('payment processing system');
  });

  it('full workflow: empty graph → system creation', async () => {
    const workflowRouter = getWorkflowRouter();
    const agentExecutor = getAgentExecutor();

    // 1. Start with empty graph
    expect(graphCanvas.getState().nodes.size).toBe(0);

    // 2. Route user request - requirements-engineer first (creates SYS, UC, REQ)
    const sessionContext: SessionContext = {
      currentPhase: 'phase1_requirements',
      graphEmpty: true,
      userMessage: 'Create an urban mobility vehicle system',
    };

    const selectedAgent = workflowRouter.routeUserInput(
      'Create an urban mobility vehicle system',
      sessionContext
    );
    expect(selectedAgent).toBe('requirements-engineer');

    // 3. Get agent prompt (simulates what chat-interface does)
    const state = graphCanvas.getState();
    const graphSnapshot = parser.serializeGraph(state);
    const agentPrompt = agentExecutor.getAgentContextPrompt(
      selectedAgent,
      graphSnapshot,
      'Create an urban mobility vehicle system'
    );

    expect(agentPrompt).toContain('Requirements Engineer');

    // 4. Simulate LLM response - requirements-engineer creates SYS, UC, REQ, ACTOR
    const llmOperations = `<operations>
<base_snapshot>empty</base_snapshot>

## Nodes
+ UrbanMobilityVehicle|SYS|UrbanMobilityVehicle.SY.001|Urban mobility vehicle system
+ NavigateAutonomously|UC|NavigateAutonomously.UC.001|Navigate to destination autonomously
+ AutonomousNavigation|REQ|AutonomousNavigation.RQ.001|System shall navigate without human intervention
+ Passenger|ACTOR|Passenger.AC.001|Person using the vehicle

## Edges
+ UrbanMobilityVehicle.SY.001 -cp-> NavigateAutonomously.UC.001
+ NavigateAutonomously.UC.001 -sat-> AutonomousNavigation.RQ.001
</operations>`;

    // 5. Apply operations
    const parsedOps = parser.parseDiff(llmOperations, workspaceId, systemId);
    await graphCanvas.applyDiff(parsedOps);

    // 6. Verify final state - SYS, UC, REQ, ACTOR nodes (Phase 1 output)
    const finalState = graphCanvas.getState();
    expect(finalState.nodes.size).toBe(4);
    expect(finalState.edges.size).toBe(2);

    // Verify requirements structure (not functions yet)
    expect(finalState.nodes.has('UrbanMobilityVehicle.SY.001')).toBe(true);
    expect(finalState.nodes.has('NavigateAutonomously.UC.001')).toBe(true);
    expect(finalState.nodes.has('AutonomousNavigation.RQ.001')).toBe(true);
    expect(finalState.nodes.has('Passenger.AC.001')).toBe(true);

    // 7. Calculate reward for episode storage
    const reward = agentExecutor.calculateReward(selectedAgent, {
      agentId: selectedAgent,
      textResponse: 'Created urban mobility system requirements',
      operations: llmOperations,
      isComplete: true,
    });
    expect(reward).toBeGreaterThan(0.8);
  });
});
