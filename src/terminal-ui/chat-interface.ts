/**
 * GraphEngine - Chat Interface (Terminal 3)
 *
 * Simple readline-based chat interface
 * - User input
 * - LLM responses
 * - Commands (/help, /save, /stats, /view)
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import 'dotenv/config';
import * as readline from 'readline';
import * as fs from 'fs';
import { StatelessGraphCanvas } from '../canvas/stateless-graph-canvas.js';
import { ChatCanvas } from '../canvas/chat-canvas.js';
import { LLMEngine } from '../llm-engine/llm-engine.js';
import { Neo4jClient } from '../neo4j-client/neo4j-client.js';
import { FormatEParser } from '../shared/parsers/format-e-parser.js';
import { CanvasWebSocketClient } from '../canvas/websocket-client.js';
import type { BroadcastUpdate } from '../canvas/websocket-server.js';
import { SessionManager } from '../session.js';
import { WS_URL, LOG_PATH, LLM_TEMPERATURE } from '../shared/config.js';
import { DEFAULT_VIEW_CONFIGS } from '../shared/types/view.js';
import { getUnifiedAgentDBService, UnifiedAgentDBService } from '../llm-engine/agentdb/unified-agentdb-service.js';
import {
  ArchitectureDerivationAgent,
  ArchitectureDerivationRequest,
  ReqToTestDerivationAgent,
  ReqToTestDerivationRequest,
  FuncToFlowDerivationAgent,
  FuncToFlowDerivationRequest,
  FuncToModDerivationAgent,
  FuncToModDerivationRequest,
} from '../llm-engine/auto-derivation.js';
import { exportSystem, importSystem, listExports, getExportMetadata } from '../shared/parsers/import-export.js';
import { getWorkflowRouter, SessionContext } from '../llm-engine/agents/workflow-router.js';
import { getAgentExecutor } from '../llm-engine/agents/agent-executor.js';
import { getAgentConfigLoader } from '../llm-engine/agents/config-loader.js';
import { initNeo4jClient, resolveSession, updateActiveSystem } from '../shared/session-resolver.js';
import { getUnifiedRuleEvaluator, getRuleLoader, type PhaseId, type ValidationResult } from '../llm-engine/validation/index.js';

// Configuration - will be set by resolveSession() in main()
const config = {
  workspaceId: '',
  systemId: '',
  chatId: '',
  userId: '',
};

// Helper to get UnifiedAgentDBService with current session context (CR-032)
const getAgentDB = () => getUnifiedAgentDBService(config.workspaceId, config.systemId);

// Components - initialized in main() after session resolution
let llmEngine: LLMEngine | undefined;
let neo4jClient: Neo4jClient;
let sessionManager: SessionManager;
let wsClient: CanvasWebSocketClient;
let graphCanvas: StatelessGraphCanvas;
let chatCanvas: ChatCanvas;
let agentDB: UnifiedAgentDBService;
const parser = new FormatEParser();

/**
 * Log to STDOUT file
 */
function log(message: string): void {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const logMsg = `[${timestamp}] ${message}`;
  fs.appendFileSync(LOG_PATH, logMsg + '\n');
}

/**
 * Notify graph viewer of update via WebSocket
 * Uses same JSON format as file-based polling
 *
 * CR-032: Reads from AgentDB (Single Source of Truth)
 */
function notifyGraphUpdate(): void {
  if (!wsClient || !wsClient.isConnected()) {
    const error = 'WebSocket not connected - cannot notify graph viewer';
    log(`❌ ${error}`);
    console.error(`\x1b[31m❌ ${error}\x1b[0m`);
    return;
  }

  // CR-032: Read from AgentDB (Single Source of Truth)
  const nodes = agentDB.getNodes();
  const edges = agentDB.getEdges();

  // Serialize graph state as JSON (same format as file-based polling)
  const stateData = {
    nodes: nodes.map((n) => [n.semanticId, n]),
    edges: edges.map((e) => [`${e.sourceId}-${e.type}-${e.targetId}`, e]),
    ports: [],
    currentView: graphCanvas.getCurrentView(),
    timestamp: Date.now(),
  };

  wsClient.broadcastUpdate(
    'graph_update',
    JSON.stringify(stateData),  // JSON serialized state (not Format E)
    {
      userId: config.userId,
      sessionId: config.chatId,
      origin: 'llm-operation',
    },
    config.workspaceId,
    config.systemId
  );

  log('📡 Broadcast graph update via WebSocket');
}

/**
 * Print header
 */
function printHeader(): void {
  console.clear();
  console.log('\x1b[36m╔═══════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[36m║     TERMINAL 3: CHAT INTERFACE       ║\x1b[0m');
  console.log('\x1b[36m╚═══════════════════════════════════════╝\x1b[0m');
  console.log('');
  console.log('Commands: /help, /new, /load, /save, /stats, /view <name>, /exit');
  console.log('');

  if (!llmEngine) {
    console.log('\x1b[33m⚠️  LLM Engine not configured (set ANTHROPIC_API_KEY in .env)\x1b[0m');
    console.log('');
  }
}

/**
 * Handle /load command - list and load systems from Neo4j
 * Uses the main readline interface to avoid stdin conflicts
 */
async function handleLoadCommand(mainRl: readline.Interface): Promise<void> {
  if (!neo4jClient) return;

  try {
    console.log('');
    console.log('🔍 Scanning Neo4j for available systems...');
    log('🔍 Scanning Neo4j for systems');

    // Get all systems in workspace
    const systems = await neo4jClient.listSystems(config.workspaceId);

    if (systems.length === 0) {
      console.log('\x1b[33m⚠️  No systems found in workspace: ' + config.workspaceId + '\x1b[0m');
      console.log('');
      return;
    }

    // Display available systems
    console.log('');
    console.log('\x1b[1;36mAvailable Systems:\x1b[0m');
    console.log('');

    systems.forEach((sys, idx) => {
      console.log(`  ${idx + 1}. \x1b[35m${sys.systemId}\x1b[0m \x1b[90m(${sys.nodeCount} nodes)\x1b[0m`);
    });

    console.log('');
    console.log('\x1b[90mEnter number (1-' + systems.length + ') or semantic ID to load (or press Enter to cancel):\x1b[0m');
    console.log('');

    // Use main readline interface to avoid stdin conflicts
    mainRl.question('\x1b[34mLoad:\x1b[0m ', async (answer) => {
      // Don't close the main interface!

      const trimmed = answer.trim();
      if (!trimmed || trimmed === 'q' || trimmed === 'exit' || trimmed === 'cancel') {
        console.log('\x1b[33m❌ Cancelled\x1b[0m');
        console.log('');
        mainRl.prompt();
        return;
      }

      // Check if numeric index
      const index = parseInt(trimmed, 10);
      let selectedSystem: { systemId: string; nodeCount: number } | undefined;

      if (!isNaN(index) && index >= 1 && index <= systems.length) {
        selectedSystem = systems[index - 1];
      } else {
        // Try to find by semantic ID
        selectedSystem = systems.find((s) => s.systemId === trimmed);
      }

      if (!selectedSystem) {
        console.log(`\x1b[31m❌ Invalid selection: ${trimmed}\x1b[0m`);
        console.log('');
        return;
      }

      // Load the selected system
      console.log('');
      console.log(`📥 Loading \x1b[35m${selectedSystem.systemId}\x1b[0m...`);
      log(`📥 Loading system: ${selectedSystem.systemId}`);

      try {
        const { nodes, edges } = await neo4jClient!.loadGraph({
          workspaceId: config.workspaceId,
          systemId: selectedSystem.systemId,
        });

        if (nodes.length === 0) {
          console.log('\x1b[33m⚠️  System has no nodes\x1b[0m');
          console.log('');
          return;
        }

        // CR-032: Load into AgentDB (Single Source of Truth)
        // clearForSystemLoad() preserves episodes/variants but clears graph/embeddings/cache
        const agentDB = await getAgentDB();
        agentDB.clearForSystemLoad();
        agentDB.loadFromState({ nodes, edges });

        // CR-032: Update AppSession in Neo4j
        await updateActiveSystem(neo4jClient!, config, selectedSystem.systemId);
        log(`💾 Session updated: ${config.systemId}`);

        console.log(`\x1b[32m✅ Loaded ${nodes.length} nodes, ${edges.length} edges\x1b[0m`);
        log(`✅ Loaded ${nodes.length} nodes, ${edges.length} edges`);

        // Notify graph viewer
        notifyGraphUpdate();

        console.log('');
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`\x1b[31m❌ Error loading system: ${errorMsg}\x1b[0m`);
        log(`❌ Error loading system: ${errorMsg}`);
        console.log('');
      }

      // Restore the prompt after async operation completes
      mainRl.prompt();
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Error scanning systems: ${errorMsg}\x1b[0m`);
    log(`❌ Error scanning systems: ${errorMsg}`);
    console.log('');
  }
}

/**
 * Handle /derive command - derive architecture elements
 * Supports: UC → FUNC, REQ → TEST, FUNC → FLOW, FUNC → MOD
 */
async function handleDeriveCommand(args: string[], mainRl: readline.Interface): Promise<void> {
  if (!llmEngine) {
    console.log('\x1b[33m⚠️  LLM Engine not configured (set ANTHROPIC_API_KEY in .env)\x1b[0m');
    mainRl.prompt();
    return;
  }

  const derivationType = args[0]?.toLowerCase() || 'arch';

  switch (derivationType) {
    case 'tests':
    case 'test':
      await executeDeriveTests(mainRl);
      break;
    case 'flows':
    case 'flow':
      await executeDeriveFlows(mainRl);
      break;
    case 'modules':
    case 'module':
    case 'mods':
    case 'mod':
      await executeDeriveModules(mainRl);
      break;
    case 'arch':
    case 'architecture':
    default:
      await executeDeriveFuncs(mainRl);
      break;
  }
}

/**
 * Execute UC → FUNC derivation
 */
async function executeDeriveFuncs(mainRl: readline.Interface): Promise<void> {
  const state = graphCanvas.getState();
  const ucNodes = Array.from(state.nodes.values()).filter(n => n.type === 'UC');

  if (ucNodes.length === 0) {
    console.log('\x1b[33m⚠️  No Use Cases (UC) found in the graph.\x1b[0m');
    console.log('\x1b[90m   Create Use Cases first: "Create a Use Case for user authentication"\x1b[0m');
    console.log('');
    mainRl.prompt();
    return;
  }

  console.log('');
  console.log('\x1b[1;36m🏗️  Deriving Logical Architecture from ALL Use Cases\x1b[0m');
  console.log('\x1b[90m   Applying SE principle: Observable + Verifiable at interface boundary\x1b[0m');
  console.log('');

  console.log('\x1b[90mUse Cases to analyze:\x1b[0m');
  ucNodes.forEach(uc => {
    console.log(`  • ${uc.name} (${uc.semanticId})`);
  });
  console.log('');

  await executeDeriveArchitecture(mainRl);
}

/**
 * Execute the UC → FUNC derivation using the Architecture Agent
 * Analyzes ALL Use Cases to derive system-wide architecture
 */
async function executeDeriveArchitecture(mainRl: readline.Interface): Promise<void> {
  const state = graphCanvas.getState();

  // Collect ALL Use Cases
  const useCases = Array.from(state.nodes.values())
    .filter(n => n.type === 'UC')
    .map(uc => ({
      semanticId: uc.semanticId,
      name: uc.name,
      descr: uc.descr || '',
    }));

  // Collect ALL Actors
  const actors = Array.from(state.nodes.values())
    .filter(n => n.type === 'ACTOR')
    .map(a => ({
      semanticId: a.semanticId,
      name: a.name,
      descr: a.descr || '',
    }));

  // Collect existing Functions with their parents
  const existingFunctions: Array<{
    semanticId: string;
    name: string;
    descr: string;
    parentId?: string;
  }> = [];

  for (const [, node] of state.nodes) {
    if (node.type === 'FUNC') {
      // Find parent (FCHAIN or FUNC)
      let parentId: string | undefined;
      for (const [, edge] of state.edges) {
        if (edge.type === 'compose' && edge.targetId === node.semanticId) {
          const sourceNode = state.nodes.get(edge.sourceId);
          if (sourceNode && (sourceNode.type === 'FCHAIN' || sourceNode.type === 'FUNC')) {
            parentId = edge.sourceId;
            break;
          }
        }
      }
      existingFunctions.push({
        semanticId: node.semanticId,
        name: node.name,
        descr: node.descr || '',
        parentId,
      });
    }
  }

  // Collect existing Function Chains with their parent UCs
  const existingFChains: Array<{
    semanticId: string;
    name: string;
    parentUC?: string;
  }> = [];

  for (const [, node] of state.nodes) {
    if (node.type === 'FCHAIN') {
      let parentUC: string | undefined;
      for (const [, edge] of state.edges) {
        if (edge.type === 'compose' && edge.targetId === node.semanticId) {
          const sourceNode = state.nodes.get(edge.sourceId);
          if (sourceNode && sourceNode.type === 'UC') {
            parentUC = edge.sourceId;
            break;
          }
        }
      }
      existingFChains.push({
        semanticId: node.semanticId,
        name: node.name,
        parentUC,
      });
    }
  }

  // Serialize canvas state
  const canvasState = parser.serializeGraph(state);

  // Build derivation request with ALL context
  const derivationAgent = new ArchitectureDerivationAgent();
  const request: ArchitectureDerivationRequest = {
    useCases,
    actors,
    existingFunctions,
    existingFChains,
    canvasState,
    systemId: config.systemId,
  };

  // Build the specialized prompt
  const derivationPrompt = derivationAgent.buildArchitecturePrompt(request);

  log(`🏗️  Architecture derivation started: ${useCases.length} UCs, ${existingFunctions.length} existing FUNCs`);

  try {
    console.log('\x1b[33m🤖 Analyzing Use Cases and deriving architecture...\x1b[0m');

    let isFirstChunk = true;
    let fullResponse = '';

    const llmRequest = {
      message: derivationPrompt,
      chatId: config.chatId,
      workspaceId: config.workspaceId,
      systemId: config.systemId,
      userId: config.userId,
      canvasState,
    };

    await llmEngine!.processRequestStream(llmRequest, async (chunk) => {
      if (chunk.type === 'text' && chunk.text) {
        if (isFirstChunk) {
          console.log('');
          process.stdout.write('\x1b[32mArchitect:\x1b[0m ');
          isFirstChunk = false;
        }
        // Filter out operations blocks from display (show analysis only)
        const displayText = chunk.text
          .replace(/<operations>[\s\S]*?<\/operations>/g, '');
        process.stdout.write(displayText);
        fullResponse += chunk.text;
      } else if (chunk.type === 'complete' && chunk.response) {
        console.log('\n');

        // Extract operations from response
        const operations = derivationAgent.extractOperations(fullResponse);

        if (operations) {
          // Apply operations
          const diff = parser.parseDiff(operations, config.workspaceId, config.systemId);
          await graphCanvas.applyDiff(diff);

          const newState = graphCanvas.getState();
          const newFuncs = Array.from(newState.nodes.values()).filter(n => n.type === 'FUNC').length;
          const newFlows = Array.from(newState.nodes.values()).filter(n => n.type === 'FLOW').length;

          console.log(`\x1b[32m✅ Architecture applied:\x1b[0m`);
          console.log(`   Nodes: ${newState.nodes.size}, Edges: ${newState.edges.size}`);
          console.log(`   Functions: ${newFuncs}, Flows: ${newFlows}`);
          log(`✅ Architecture derivation complete: ${newFuncs} functions, ${newFlows} flows`);

          // Notify graph viewer (cache invalidation is automatic via graph version tracking - CR-032)
          notifyGraphUpdate();
        } else if (chunk.response.operations) {
          // Fallback to response.operations if extraction failed
          const diff = parser.parseDiff(chunk.response.operations, config.workspaceId, config.systemId);
          await graphCanvas.applyDiff(diff);

          const newState = graphCanvas.getState();
          console.log(`\x1b[32m✅ Architecture applied: ${newState.nodes.size} nodes, ${newState.edges.size} edges\x1b[0m`);

          // Cache invalidation is automatic via graph version tracking (CR-032)
          notifyGraphUpdate();
        } else {
          console.log('\x1b[33m⚠️  No operations generated\x1b[0m');
          console.log('\x1b[90m   The architect may have determined no changes are needed\x1b[0m');
        }

        console.log('');
      }
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Derivation error: ${errorMsg}\x1b[0m`);
    log(`❌ Architecture derivation failed: ${errorMsg}`);
    console.log('');
  }

  mainRl.prompt();
}

/**
 * Execute REQ → TEST derivation
 * Generates test cases for requirements
 */
async function executeDeriveTests(mainRl: readline.Interface): Promise<void> {
  const state = graphCanvas.getState();
  const reqNodes = Array.from(state.nodes.values()).filter(n => n.type === 'REQ');

  if (reqNodes.length === 0) {
    console.log('\x1b[33m⚠️  No Requirements (REQ) found in the graph.\x1b[0m');
    console.log('\x1b[90m   Create Requirements first: "Add requirement for user authentication"\x1b[0m');
    console.log('');
    mainRl.prompt();
    return;
  }

  console.log('');
  console.log('\x1b[1;36m🧪  Deriving Test Cases from Requirements\x1b[0m');
  console.log('\x1b[90m   INCOSE principle: Every requirement must be verifiable\x1b[0m');
  console.log('');

  console.log('\x1b[90mRequirements to derive tests for:\x1b[0m');
  reqNodes.forEach(req => {
    console.log(`  • ${req.name} (${req.semanticId})`);
  });
  console.log('');

  // Collect requirements
  const requirements = reqNodes.map(req => ({
    semanticId: req.semanticId,
    name: req.name,
    descr: req.descr || '',
    type: 'functional' as const,
  }));

  // Collect existing tests
  const existingTests = Array.from(state.nodes.values())
    .filter(n => n.type === 'TEST')
    .map(t => {
      // Find which REQ this test verifies
      let verifies: string | undefined;
      for (const [, edge] of state.edges) {
        if (edge.type === 'verify' && edge.targetId === t.semanticId) {
          verifies = edge.sourceId;
          break;
        }
      }
      return { semanticId: t.semanticId, name: t.name, verifies };
    });

  const canvasState = parser.serializeGraph(state);
  const agent = new ReqToTestDerivationAgent();
  const request: ReqToTestDerivationRequest = {
    requirements,
    existingTests,
    canvasState,
    systemId: config.systemId,
  };

  const derivationPrompt = agent.buildTestDerivationPrompt(request);
  log(`🧪 Test derivation started: ${requirements.length} REQs, ${existingTests.length} existing tests`);

  try {
    await executeDerivation(agent, derivationPrompt, mainRl, 'Test', 'TEST');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Test derivation error: ${errorMsg}\x1b[0m`);
    log(`❌ Test derivation failed: ${errorMsg}`);
    console.log('');
  }

  mainRl.prompt();
}

/**
 * Execute FUNC → FLOW derivation
 * Generates flows for functions missing I/O
 */
async function executeDeriveFlows(mainRl: readline.Interface): Promise<void> {
  const state = graphCanvas.getState();
  const funcNodes = Array.from(state.nodes.values()).filter(n => n.type === 'FUNC');

  if (funcNodes.length === 0) {
    console.log('\x1b[33m⚠️  No Functions (FUNC) found in the graph.\x1b[0m');
    console.log('\x1b[90m   Derive architecture first: /derive\x1b[0m');
    console.log('');
    mainRl.prompt();
    return;
  }

  console.log('');
  console.log('\x1b[1;36m🔄  Deriving Data Flows for Functions\x1b[0m');
  console.log('\x1b[90m   3-Layer Interface Model: Semantic → Data Format → Protocol\x1b[0m');
  console.log('');

  // Check I/O status for each function
  const functions = funcNodes.map(func => {
    let hasInputFlow = false;
    let hasOutputFlow = false;

    for (const [, edge] of state.edges) {
      if (edge.type === 'io') {
        if (edge.targetId === func.semanticId) hasInputFlow = true;
        if (edge.sourceId === func.semanticId) hasOutputFlow = true;
      }
    }

    return {
      semanticId: func.semanticId,
      name: func.name,
      descr: func.descr || '',
      hasInputFlow,
      hasOutputFlow,
    };
  });

  const missingIO = functions.filter(f => !f.hasInputFlow || !f.hasOutputFlow);
  if (missingIO.length === 0) {
    console.log('\x1b[32m✅ All functions have complete I/O flows\x1b[0m');
    console.log('');
    mainRl.prompt();
    return;
  }

  console.log('\x1b[90mFunctions missing I/O:\x1b[0m');
  missingIO.forEach(f => {
    const status = [];
    if (!f.hasInputFlow) status.push('input');
    if (!f.hasOutputFlow) status.push('output');
    console.log(`  • ${f.name} (missing ${status.join(', ')})`);
  });
  console.log('');

  // Collect existing flows and schemas
  const existingFlows = Array.from(state.nodes.values())
    .filter(n => n.type === 'FLOW')
    .map(fl => {
      const connectedTo: string[] = [];
      for (const [, edge] of state.edges) {
        if (edge.type === 'io' && (edge.sourceId === fl.semanticId || edge.targetId === fl.semanticId)) {
          connectedTo.push(edge.sourceId === fl.semanticId ? edge.targetId : edge.sourceId);
        }
      }
      return { semanticId: fl.semanticId, name: fl.name, connectedTo };
    });

  const existingSchemas = Array.from(state.nodes.values())
    .filter(n => n.type === 'SCHEMA')
    .map(s => ({
      semanticId: s.semanticId,
      name: s.name,
      category: 'data' as const,
    }));

  const canvasState = parser.serializeGraph(state);
  const agent = new FuncToFlowDerivationAgent();
  const request: FuncToFlowDerivationRequest = {
    functions,
    existingFlows,
    existingSchemas,
    canvasState,
    systemId: config.systemId,
  };

  const derivationPrompt = agent.buildFlowDerivationPrompt(request);
  log(`🔄 Flow derivation started: ${missingIO.length} functions need I/O`);

  try {
    await executeDerivation(agent, derivationPrompt, mainRl, 'Flow', 'FLOW');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Flow derivation error: ${errorMsg}\x1b[0m`);
    log(`❌ Flow derivation failed: ${errorMsg}`);
    console.log('');
  }

  mainRl.prompt();
}

/**
 * Execute FUNC → MOD derivation
 * Suggests module allocation for functions
 */
async function executeDeriveModules(mainRl: readline.Interface): Promise<void> {
  const state = graphCanvas.getState();
  const funcNodes = Array.from(state.nodes.values()).filter(n => n.type === 'FUNC');

  if (funcNodes.length === 0) {
    console.log('\x1b[33m⚠️  No Functions (FUNC) found in the graph.\x1b[0m');
    console.log('\x1b[90m   Derive architecture first: /derive\x1b[0m');
    console.log('');
    mainRl.prompt();
    return;
  }

  console.log('');
  console.log('\x1b[1;36m📦  Deriving Module Allocation for Functions\x1b[0m');
  console.log('\x1b[90m   Principles: Cohesion, Coupling minimization, Volatility isolation\x1b[0m');
  console.log('');

  // Check allocation status and gather function info
  const functions = funcNodes.map(func => {
    let allocatedTo: string | undefined;
    const connectedFuncs: string[] = [];

    for (const [, edge] of state.edges) {
      if (edge.type === 'allocate' && edge.targetId === func.semanticId) {
        allocatedTo = edge.sourceId;
      }
      // Find connected functions via FLOW
      if (edge.type === 'io' && edge.sourceId === func.semanticId) {
        // Find target of this flow
        for (const [, e2] of state.edges) {
          if (e2.type === 'io' && e2.sourceId === edge.targetId) {
            const targetNode = state.nodes.get(e2.targetId);
            if (targetNode?.type === 'FUNC') {
              connectedFuncs.push(e2.targetId);
            }
          }
        }
      }
    }

    return {
      semanticId: func.semanticId,
      name: func.name,
      descr: func.descr || '',
      volatility: (func.attributes?.volatility as 'low' | 'medium' | 'high') || undefined,
      connectedFuncs,
      allocatedTo,
    };
  });

  const unallocated = functions.filter(f => !f.allocatedTo);
  if (unallocated.length === 0) {
    console.log('\x1b[32m✅ All functions are allocated to modules\x1b[0m');
    console.log('');
    mainRl.prompt();
    return;
  }

  console.log('\x1b[90mUnallocated functions:\x1b[0m');
  unallocated.forEach(f => {
    const vol = f.volatility ? ` [${f.volatility}]` : '';
    console.log(`  • ${f.name}${vol}`);
  });
  console.log('');

  // Collect existing modules
  const existingModules = Array.from(state.nodes.values())
    .filter(n => n.type === 'MOD')
    .map(m => {
      const allocatedFuncs: string[] = [];
      for (const [, edge] of state.edges) {
        if (edge.type === 'allocate' && edge.sourceId === m.semanticId) {
          allocatedFuncs.push(edge.targetId);
        }
      }
      return {
        semanticId: m.semanticId,
        name: m.name,
        descr: m.descr || '',
        allocatedFuncs,
      };
    });

  const canvasState = parser.serializeGraph(state);
  const agent = new FuncToModDerivationAgent();
  const request: FuncToModDerivationRequest = {
    functions,
    existingModules,
    canvasState,
    systemId: config.systemId,
  };

  const derivationPrompt = agent.buildAllocationPrompt(request);
  log(`📦 Module derivation started: ${unallocated.length} functions need allocation`);

  try {
    await executeDerivation(agent, derivationPrompt, mainRl, 'Allocation', 'MOD');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Module derivation error: ${errorMsg}\x1b[0m`);
    log(`❌ Module derivation failed: ${errorMsg}`);
    console.log('');
  }

  mainRl.prompt();
}

/**
 * Generic derivation executor - shared logic for all derivation types
 */
async function executeDerivation(
  agent: { extractOperations: (response: string) => string | null },
  prompt: string,
  _mainRl: readline.Interface,
  label: string,
  primaryType: string
): Promise<void> {
  const canvasState = parser.serializeGraph(graphCanvas.getState());

  console.log(`\x1b[33m🤖 Analyzing and deriving ${label.toLowerCase()}s...\x1b[0m`);

  let isFirstChunk = true;
  let fullResponse = '';

  const llmRequest = {
    message: prompt,
    chatId: config.chatId,
    workspaceId: config.workspaceId,
    systemId: config.systemId,
    userId: config.userId,
    canvasState,
  };

  await llmEngine!.processRequestStream(llmRequest, async (chunk) => {
    if (chunk.type === 'text' && chunk.text) {
      if (isFirstChunk) {
        console.log('');
        process.stdout.write(`\x1b[32m${label} Agent:\x1b[0m `);
        isFirstChunk = false;
      }
      const displayText = chunk.text.replace(/<operations>[\s\S]*?<\/operations>/g, '');
      process.stdout.write(displayText);
      fullResponse += chunk.text;
    } else if (chunk.type === 'complete' && chunk.response) {
      console.log('\n');

      const operations = agent.extractOperations(fullResponse);

      if (operations) {
        const diff = parser.parseDiff(operations, config.workspaceId, config.systemId);
        await graphCanvas.applyDiff(diff);

        const newState = graphCanvas.getState();
        const primaryCount = Array.from(newState.nodes.values()).filter(n => n.type === primaryType).length;

        console.log(`\x1b[32m✅ ${label} derivation applied:\x1b[0m`);
        console.log(`   Nodes: ${newState.nodes.size}, Edges: ${newState.edges.size}`);
        console.log(`   ${primaryType} nodes: ${primaryCount}`);
        log(`✅ ${label} derivation complete: ${primaryCount} ${primaryType} nodes`);

        // Cache invalidation is automatic via graph version tracking (CR-032)
        notifyGraphUpdate();
      } else if (chunk.response.operations) {
        const diff = parser.parseDiff(chunk.response.operations, config.workspaceId, config.systemId);
        await graphCanvas.applyDiff(diff);

        const newState = graphCanvas.getState();
        console.log(`\x1b[32m✅ ${label} applied: ${newState.nodes.size} nodes, ${newState.edges.size} edges\x1b[0m`);

        // Cache invalidation is automatic via graph version tracking (CR-032)
        notifyGraphUpdate();
      } else {
        console.log('\x1b[33m⚠️  No operations generated\x1b[0m');
        console.log(`\x1b[90m   The agent may have determined no ${label.toLowerCase()}s are needed\x1b[0m`);
      }

      console.log('');
    }
  });
}

/**
 * Handle /validate command - run full validation report
 * CR-031: Learning System Integration
 */
async function handleValidateCommand(args: string[]): Promise<void> {
  console.log('');
  console.log('\x1b[1;36m🔍 Running Validation...\x1b[0m');
  log('🔍 Running validation');

  try {
    // Determine phase (default: phase2_logical)
    const phaseArg = args[0]?.toLowerCase();
    let phase: PhaseId = 'phase2_logical';
    if (phaseArg === '1' || phaseArg === 'requirements') phase = 'phase1_requirements';
    else if (phaseArg === '2' || phaseArg === 'logical') phase = 'phase2_logical';
    else if (phaseArg === '3' || phaseArg === 'physical') phase = 'phase3_physical';
    else if (phaseArg === '4' || phaseArg === 'verification') phase = 'phase4_verification';

    const evaluator = await getUnifiedRuleEvaluator(config.workspaceId, config.systemId);
    const result = await evaluator.evaluate(phase);
    displayValidationResult(result);

    log(`✅ Validation complete: score=${result.rewardScore.toFixed(2)}, violations=${result.totalViolations}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Validation error: ${errorMsg}\x1b[0m`);
    log(`❌ Validation error: ${errorMsg}`);
  }
  console.log('');
}

/**
 * Handle /phase-gate command - check phase gate readiness
 * CR-031: Learning System Integration
 */
async function handlePhaseGateCommand(args: string[]): Promise<void> {
  console.log('');
  console.log('\x1b[1;36m🚪 Checking Phase Gate...\x1b[0m');
  log('🚪 Checking phase gate');

  try {
    // Determine phase (default: current phase based on graph content)
    const phaseArg = args[0];
    let phase: PhaseId = 'phase2_logical';
    if (phaseArg === '1') phase = 'phase1_requirements';
    else if (phaseArg === '2') phase = 'phase2_logical';
    else if (phaseArg === '3') phase = 'phase3_physical';
    else if (phaseArg === '4') phase = 'phase4_verification';

    const evaluator = await getUnifiedRuleEvaluator(config.workspaceId, config.systemId);
    const ruleLoader = getRuleLoader();

    const gateResult = await evaluator.checkPhaseGate(phase);
    const phaseDef = ruleLoader.getPhaseDefinition(phase);

    console.log('');
    console.log(`\x1b[1mPhase: ${phaseDef?.name || phase}\x1b[0m`);
    console.log(`\x1b[90m${phaseDef?.description || ''}\x1b[0m`);
    console.log('');

    if (gateResult.ready) {
      console.log(`\x1b[32m✅ GATE PASSED - Score: ${gateResult.score.toFixed(2)}\x1b[0m`);
      console.log('\x1b[90m   Ready to advance to next phase\x1b[0m');
    } else {
      console.log(`\x1b[31m❌ GATE BLOCKED - Score: ${gateResult.score.toFixed(2)}\x1b[0m`);
      console.log('');
      console.log('\x1b[1mBlockers:\x1b[0m');
      for (const blocker of gateResult.blockers) {
        console.log(`  • ${blocker}`);
      }
    }

    // Show deliverables checklist
    if (phaseDef?.deliverables && phaseDef.deliverables.length > 0) {
      console.log('');
      console.log('\x1b[1mDeliverables:\x1b[0m');
      for (const deliverable of phaseDef.deliverables) {
        console.log(`  □ ${deliverable}`);
      }
    }

    log(`✅ Phase gate check complete: ${gateResult.ready ? 'PASSED' : 'BLOCKED'}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Phase gate error: ${errorMsg}\x1b[0m`);
    log(`❌ Phase gate error: ${errorMsg}`);
  }
  console.log('');
}

/**
 * Handle /score command - show multi-objective scores
 * CR-031: Learning System Integration
 */
async function handleScoreCommand(): Promise<void> {
  console.log('');
  console.log('\x1b[1;36m📊 Computing Scores...\x1b[0m');
  log('📊 Computing scores');

  try {
    const evaluator = await getUnifiedRuleEvaluator(config.workspaceId, config.systemId);
    const ruleLoader = getRuleLoader();

    // Run validation for all phases to get comprehensive score
    const result = await evaluator.evaluate('phase2_logical');
    const rewardConfig = ruleLoader.getRewardConfig();

    const state = graphCanvas.getState();
    const nodeCount = state.nodes.size;
    const edgeCount = state.edges.size;

    // Count node types
    const typeCounts: Record<string, number> = {};
    for (const node of state.nodes.values()) {
      typeCounts[node.type] = (typeCounts[node.type] || 0) + 1;
    }

    console.log('');
    console.log('\x1b[1m═══════════════════════════════════════\x1b[0m');
    console.log('\x1b[1m           SYSTEM SCORECARD            \x1b[0m');
    console.log('\x1b[1m═══════════════════════════════════════\x1b[0m');
    console.log('');

    // Overall score
    const scoreBar = createProgressBar(result.rewardScore, 20);
    const scoreColor = result.rewardScore >= 0.7 ? '\x1b[32m' : result.rewardScore >= 0.5 ? '\x1b[33m' : '\x1b[31m';
    console.log(`\x1b[1mOverall Score:\x1b[0m ${scoreColor}${(result.rewardScore * 100).toFixed(0)}%\x1b[0m ${scoreBar}`);
    console.log(`\x1b[90mThreshold: ${(rewardConfig.successThreshold * 100).toFixed(0)}%\x1b[0m`);
    console.log('');

    // Graph metrics
    console.log('\x1b[1mGraph Metrics:\x1b[0m');
    console.log(`  Nodes: ${nodeCount}`);
    console.log(`  Edges: ${edgeCount}`);
    if (Object.keys(typeCounts).length > 0) {
      console.log('  Types: ' + Object.entries(typeCounts).map(([t, c]) => `${t}(${c})`).join(', '));
    }
    console.log('');

    // Violation summary
    console.log('\x1b[1mViolation Summary:\x1b[0m');
    console.log(`  \x1b[31mErrors:\x1b[0m   ${result.errorCount}`);
    console.log(`  \x1b[33mWarnings:\x1b[0m ${result.warningCount}`);
    console.log(`  \x1b[36mInfo:\x1b[0m     ${result.infoCount}`);
    console.log('');

    // Phase gate status
    console.log('\x1b[1mPhase Gate:\x1b[0m ' + (result.phaseGateReady
      ? '\x1b[32m✅ Ready\x1b[0m'
      : '\x1b[31m❌ Not Ready\x1b[0m'));

    log(`✅ Score computed: ${(result.rewardScore * 100).toFixed(0)}%`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Score error: ${errorMsg}\x1b[0m`);
    log(`❌ Score error: ${errorMsg}`);
  }
  console.log('');
}

/**
 * Handle /analyze command - analyze violations and suggest fixes
 * CR-031: Learning System Integration
 */
async function handleAnalyzeCommand(): Promise<void> {
  console.log('');
  console.log('\x1b[1;36m🔍 Architecture Analysis\x1b[0m');
  log('🔍 Running analysis');

  try {
    // First run validation to identify issues (reads from AgentDB)
    const evaluator = await getUnifiedRuleEvaluator(config.workspaceId, config.systemId);
    const result = await evaluator.evaluate('phase2_logical');

    if (result.totalViolations === 0) {
      console.log('');
      console.log('\x1b[32m✅ No violations found - architecture is clean!\x1b[0m');
      console.log(`\x1b[90m   Score: ${(result.rewardScore * 100).toFixed(0)}%\x1b[0m`);
      console.log('');
      log('✅ Analysis: no violations');
      return;
    }

    console.log('');
    console.log('\x1b[1mSuggested Fixes:\x1b[0m');
    console.log('');

    // Group violations by type and suggest fixes
    const suggestionGroups = new Map<string, string[]>();
    for (const v of result.violations) {
      const suggestion = v.suggestion || `Fix: ${v.ruleName}`;
      if (!suggestionGroups.has(suggestion)) {
        suggestionGroups.set(suggestion, []);
      }
      suggestionGroups.get(suggestion)!.push(v.semanticId);
    }

    let idx = 1;
    for (const [suggestion, nodes] of suggestionGroups) {
      const severityIcon = result.violations.find(v => v.suggestion === suggestion)?.severity === 'error'
        ? '\x1b[31m●\x1b[0m'
        : '\x1b[33m●\x1b[0m';
      console.log(`  ${idx}. ${severityIcon} ${suggestion}`);
      if (nodes.length <= 3) {
        console.log(`     \x1b[90mAffects: ${nodes.join(', ')}\x1b[0m`);
      } else {
        console.log(`     \x1b[90mAffects: ${nodes.slice(0, 3).join(', ')} (+${nodes.length - 3} more)\x1b[0m`);
      }
      idx++;
    }

    // Show similarity matches if any
    if (result.similarityMatches.length > 0) {
      console.log('');
      console.log('\x1b[1mMerge Candidates:\x1b[0m');
      for (const match of result.similarityMatches.slice(0, 5)) {
        const icon = match.recommendation === 'merge' ? '🔀' : '🔍';
        console.log(`  ${icon} ${match.nodeA.name} ↔ ${match.nodeB.name} (${(match.score * 100).toFixed(0)}% similar)`);
      }
    }

    console.log('');
    console.log(`\x1b[90mTip: Use /optimize to auto-apply fixes, or use natural language:\x1b[0m`);
    console.log(`\x1b[90m  "Add satisfy edge from ProcessData to REQ-001"\x1b[0m`);

    log(`✅ Analysis complete: ${suggestionGroups.size} suggestions`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Analysis error: ${errorMsg}\x1b[0m`);
    log(`❌ Analysis error: ${errorMsg}`);
  }
  console.log('');
}

/**
 * Handle /optimize command - run multi-objective optimization
 * CR-031: Learning System Integration with CR-028 optimizer
 */
async function handleOptimizeCommand(args: string): Promise<void> {
  const maxIterations = args ? parseInt(args, 10) : 30;

  console.log('');
  console.log('\x1b[1;36m⚡ Multi-Objective Optimization\x1b[0m');
  console.log(`\x1b[90m   Max iterations: ${maxIterations}\x1b[0m`);
  log(`⚡ Running optimization (${maxIterations} iterations)`);

  try {
    // Import optimizer dynamically to avoid circular deps
    const { violationGuidedSearch, formatScore } = await import('../llm-engine/optimizer/index.js');

    // Convert current graph to optimizer Architecture format
    const currentState = graphCanvas.getState();
    const arch = {
      id: config.systemId,
      nodes: Array.from(currentState.nodes.values()).map(n => ({
        id: n.uuid,
        type: n.type as 'SYS' | 'UC' | 'REQ' | 'FUNC' | 'FLOW' | 'SCHEMA' | 'MOD' | 'TEST',
        label: n.name || n.uuid,
        properties: { ...n }
      })),
      edges: Array.from(currentState.edges.values()).map(e => ({
        id: e.uuid,
        source: e.sourceId,
        target: e.targetId,
        type: e.type
      })),
      metadata: { systemId: config.systemId }
    };

    if (arch.nodes.length === 0) {
      console.log('\x1b[33m⚠️  No nodes in graph - nothing to optimize\x1b[0m');
      console.log('');
      return;
    }

    console.log(`\x1b[90m   Nodes: ${arch.nodes.length}, Edges: ${arch.edges.length}\x1b[0m`);
    console.log('');

    // Run optimization
    const result = violationGuidedSearch(arch, {
      maxIterations,
      randomSeed: Date.now()
    }, {
      verbose: false,
      onIteration: (state) => {
        if (state.iteration % 5 === 0) {
          process.stdout.write(`\r\x1b[90m   Iteration ${state.iteration}/${maxIterations}...\x1b[0m`);
        }
      }
    });

    console.log('\r\x1b[K'); // Clear progress line

    // Display results
    console.log('\x1b[1mOptimization Results:\x1b[0m');
    console.log(`  Iterations: ${result.iterations}`);
    console.log(`  Convergence: ${result.convergenceReason}`);
    console.log(`  Success: ${result.success ? '\x1b[32mYes\x1b[0m' : '\x1b[33mPartial\x1b[0m'}`);
    console.log('');

    console.log('\x1b[1mBest Variant:\x1b[0m');
    console.log(`  Score: ${formatScore(result.bestVariant.score)}`);
    console.log(`  Applied operators: ${result.bestVariant.appliedOperator || 'none'}`);
    console.log('');

    if (result.paretoFront.length > 1) {
      console.log('\x1b[1mPareto Front:\x1b[0m');
      for (const variant of result.paretoFront) {
        console.log(`  [${variant.id}] w=${variant.score.weighted.toFixed(3)} op=${variant.appliedOperator || '-'}`);
      }
      console.log('');
    }

    // Show operator usage
    const opUsage = Object.entries(result.stats.operatorUsage)
      .filter(([_, count]) => count > 0)
      .map(([op, count]) => `${op}:${count}`)
      .join(', ');
    if (opUsage) {
      console.log(`\x1b[90m   Operators: ${opUsage}\x1b[0m`);
    }
    console.log(`\x1b[90m   Variants: ${result.stats.totalVariantsGenerated} generated, ${result.stats.variantsRejected} rejected\x1b[0m`);

    log(`✅ Optimization complete: score=${result.bestVariant.score.weighted.toFixed(3)}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Optimization error: ${errorMsg}\x1b[0m`);
    log(`❌ Optimization error: ${errorMsg}`);
  }
  console.log('');
}

/**
 * Display validation result in formatted output
 */
function displayValidationResult(result: ValidationResult): void {
  const ruleLoader = getRuleLoader();
  const phaseDef = ruleLoader.getPhaseDefinition(result.phase);

  console.log('');
  console.log('\x1b[1m═══════════════════════════════════════\x1b[0m');
  console.log(`\x1b[1m  VALIDATION REPORT - ${phaseDef?.name || result.phase}\x1b[0m`);
  console.log('\x1b[1m═══════════════════════════════════════\x1b[0m');
  console.log('');

  // Summary
  const scoreBar = createProgressBar(result.rewardScore, 20);
  const scoreColor = result.rewardScore >= 0.7 ? '\x1b[32m' : result.rewardScore >= 0.5 ? '\x1b[33m' : '\x1b[31m';
  console.log(`\x1b[1mScore:\x1b[0m ${scoreColor}${(result.rewardScore * 100).toFixed(0)}%\x1b[0m ${scoreBar}`);
  console.log(`\x1b[1mGate:\x1b[0m  ${result.phaseGateReady ? '\x1b[32m✅ Ready\x1b[0m' : '\x1b[31m❌ Not Ready\x1b[0m'}`);
  console.log('');

  // Violation counts
  if (result.totalViolations === 0) {
    console.log('\x1b[32m✅ No violations found\x1b[0m');
  } else {
    console.log(`\x1b[1mViolations:\x1b[0m ${result.totalViolations} total`);
    if (result.errorCount > 0) console.log(`  \x1b[31m● Errors:\x1b[0m   ${result.errorCount}`);
    if (result.warningCount > 0) console.log(`  \x1b[33m● Warnings:\x1b[0m ${result.warningCount}`);
    if (result.infoCount > 0) console.log(`  \x1b[36m● Info:\x1b[0m     ${result.infoCount}`);
    console.log('');

    // List violations (max 10)
    console.log('\x1b[1mDetails:\x1b[0m');
    const displayViolations = result.violations.slice(0, 10);
    for (const v of displayViolations) {
      const icon = v.severity === 'error' ? '\x1b[31m●\x1b[0m' : v.severity === 'warning' ? '\x1b[33m●\x1b[0m' : '\x1b[36m●\x1b[0m';
      console.log(`  ${icon} ${v.ruleName}`);
      console.log(`    \x1b[90m${v.semanticId}: ${v.reason}\x1b[0m`);
      if (v.suggestion) {
        console.log(`    \x1b[32m→ ${v.suggestion}\x1b[0m`);
      }
    }
    if (result.violations.length > 10) {
      console.log(`  \x1b[90m... and ${result.violations.length - 10} more\x1b[0m`);
    }
  }

  // Similarity matches
  if (result.similarityMatches.length > 0) {
    console.log('');
    console.log(`\x1b[1mSimilarity Matches:\x1b[0m ${result.similarityMatches.length}`);
    for (const match of result.similarityMatches.slice(0, 5)) {
      const icon = match.recommendation === 'merge' ? '🔀' : match.recommendation === 'review' ? '🔍' : '✓';
      console.log(`  ${icon} ${match.nodeA.name} ↔ ${match.nodeB.name} (${(match.score * 100).toFixed(0)}%)`);
    }
  }
}

/**
 * Create ASCII progress bar
 */
function createProgressBar(value: number, width: number): string {
  const filled = Math.round(value * width);
  const empty = width - filled;
  const color = value >= 0.7 ? '\x1b[32m' : value >= 0.5 ? '\x1b[33m' : '\x1b[31m';
  return `${color}[${'█'.repeat(filled)}${'░'.repeat(empty)}]\x1b[0m`;
}

/**
 * Handle /cleanup command - remove nodes from Neo4j not belonging to current system
 * Options:
 * - (no args): Clean nodes NOT in current system (keeps only loaded system's nodes)
 * - all: Clean ALL nodes not in current workspace (across all systems)
 */
async function handleCleanupCommand(args: string[]): Promise<void> {
  console.log('');
  console.log('\x1b[1;36m🧹 Database Cleanup\x1b[0m');
  console.log(`\x1b[90m   Current system: ${config.systemId}\x1b[0m`);
  console.log(`\x1b[90m   Current workspace: ${config.workspaceId}\x1b[0m`);
  log('🧹 Running database cleanup');

  if (!neo4jClient) {
    console.log('\x1b[33m⚠️  Neo4j not configured\x1b[0m');
    console.log('');
    return;
  }

  try {
    const session = neo4jClient['getSession']();
    const cleanAll = args[0]?.toLowerCase() === 'all';

    try {
      // Step 1: Find nodes to clean
      let findQuery: string;
      let description: string;

      if (cleanAll) {
        // Clean all nodes not in current workspace
        description = 'nodes not in current workspace';
        findQuery = `
          MATCH (n:Node)
          WHERE n.workspaceId <> $workspaceId
             OR n.workspaceId IS NULL
             OR n.uuid IS NULL
             OR n.type IS NULL
             OR n.name IS NULL OR n.name = ''
             OR n.descr IS NULL OR n.descr = ''
          RETURN count(n) as count,
                 collect(DISTINCT n.workspaceId)[0..5] as workspaces,
                 collect(DISTINCT n.systemId)[0..5] as systems,
                 collect(coalesce(n.semanticId, n.name, 'unknown'))[0..5] as samples
        `;
      } else {
        // Default: Clean nodes not in current SYSTEM (within workspace)
        description = 'nodes not in current system';
        findQuery = `
          MATCH (n:Node)
          WHERE n.workspaceId = $workspaceId
            AND (n.systemId <> $systemId
                 OR n.systemId IS NULL
                 OR n.uuid IS NULL
                 OR n.type IS NULL
                 OR n.name IS NULL OR n.name = ''
                 OR n.descr IS NULL OR n.descr = '')
          RETURN count(n) as count,
                 collect(DISTINCT n.systemId)[0..10] as systems,
                 collect(coalesce(n.semanticId, n.name, 'unknown'))[0..10] as samples
        `;
      }

      const findResult = await session.run(findQuery, {
        workspaceId: config.workspaceId,
        systemId: config.systemId,
      });

      const record = findResult.records[0];
      const count = record?.get('count')?.toNumber?.() ?? record?.get('count') ?? 0;
      const samples = record?.get('samples') ?? [];
      const systems = record?.get('systems') ?? [];

      if (count === 0) {
        console.log(`\x1b[32m✅ No ${description} found\x1b[0m`);
        console.log('');
        return;
      }

      console.log(`\x1b[33m⚠️  Found ${count} ${description}:\x1b[0m`);
      if (systems.length > 0) {
        console.log(`\x1b[90m   Systems: ${systems.slice(0, 5).join(', ')}${systems.length > 5 ? '...' : ''}\x1b[0m`);
      }
      if (samples.length > 0) {
        console.log(`\x1b[90m   Samples: ${samples.slice(0, 5).join(', ')}${samples.length > 5 ? '...' : ''}\x1b[0m`);
      }
      if (cleanAll && record?.get('workspaces')) {
        const workspaces = record.get('workspaces');
        console.log(`\x1b[90m   Workspaces: ${workspaces.join(', ')}\x1b[0m`);
      }
      console.log('');

      // Step 2: Delete the nodes (and their edges)
      let deleteQuery: string;
      if (cleanAll) {
        deleteQuery = `
          MATCH (n:Node)
          WHERE n.workspaceId <> $workspaceId
             OR n.workspaceId IS NULL
             OR n.uuid IS NULL
             OR n.type IS NULL
             OR n.name IS NULL OR n.name = ''
             OR n.descr IS NULL OR n.descr = ''
          DETACH DELETE n
          RETURN count(*) as deleted
        `;
      } else {
        deleteQuery = `
          MATCH (n:Node)
          WHERE n.workspaceId = $workspaceId
            AND (n.systemId <> $systemId
                 OR n.systemId IS NULL
                 OR n.uuid IS NULL
                 OR n.type IS NULL
                 OR n.name IS NULL OR n.name = ''
                 OR n.descr IS NULL OR n.descr = '')
          DETACH DELETE n
          RETURN count(*) as deleted
        `;
      }

      const deleteResult = await session.run(deleteQuery, {
        workspaceId: config.workspaceId,
        systemId: config.systemId,
      });

      const deleted = deleteResult.records[0]?.get('deleted')?.toNumber?.() ??
                      deleteResult.records[0]?.get('deleted') ?? 0;

      console.log(`\x1b[32m✅ Cleaned ${deleted} nodes from Neo4j\x1b[0m`);
      log(`✅ Cleaned ${deleted} nodes from Neo4j`);

    } finally {
      await session.close();
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Cleanup error: ${errorMsg}\x1b[0m`);
    log(`❌ Cleanup error: ${errorMsg}`);
  }
  console.log('');
}

/**
 * Handle command
 */
async function handleCommand(cmd: string, rl: readline.Interface): Promise<void> {
  const [command, ...args] = cmd.split(' ');

  switch (command) {
    case '/help':
      console.log('');
      console.log('Available commands:');
      console.log('');
      console.log('\x1b[1mSession:\x1b[0m');
      console.log('  /help           - Show this help');
      console.log('  /new            - Start new system (clear graph)');
      console.log('  /load           - List and load systems from Neo4j');
      console.log('  /save           - Save graph to Neo4j');
      console.log('  /stats          - Show graph statistics');
      console.log('  /clear          - Clear chat display');
      console.log('  /exit           - Save session and quit (also: exit, quit)');
      console.log('');
      console.log('\x1b[1mImport/Export:\x1b[0m');
      console.log('  /export [name]  - Export graph to file (default: auto-named)');
      console.log('  /import <file>  - Import graph from file');
      console.log('  /exports        - List available export files');
      console.log('');
      console.log('\x1b[1mViews:\x1b[0m');
      console.log(`  /view <name>    - Switch view (${Object.keys(DEFAULT_VIEW_CONFIGS).join(', ')})`);
      console.log('');
      console.log('\x1b[1mDerivation:\x1b[0m');
      console.log('  /derive [type]  - Auto-derive architecture elements:');
      console.log('                    (no arg) - UC → FUNC logical architecture');
      console.log('                    tests    - REQ → TEST verification cases');
      console.log('                    flows    - FUNC → FLOW interfaces');
      console.log('                    modules  - FUNC → MOD allocation');
      console.log('');
      console.log('\x1b[1mValidation & Optimization (CR-031):\x1b[0m');
      console.log('  /validate [N]   - Run validation report (phase 1-4, default: 2)');
      console.log('  /phase-gate [N] - Check phase gate readiness (1-4)');
      console.log('  /score          - Show multi-objective scorecard');
      console.log('  /analyze        - Analyze violations and suggest fixes');
      console.log('  /optimize [N]   - Run multi-objective optimization (N iterations, default: 30)');
      console.log('');
      console.log('\x1b[1mMaintenance:\x1b[0m');
      console.log('  /cleanup        - Clean nodes not in current system (removes other systems)');
      console.log('  /cleanup all    - Clean ALL nodes not in current workspace');
      console.log('');
      break;

    case '/new':
      console.log('');
      console.log('🗑️  Starting new system...');
      log('🗑️  Starting new system');

      // CR-032: Clear AgentDB (Single Source of Truth)
      agentDB.clearForSystemLoad();

      // Update AppSession in Neo4j
      await updateActiveSystem(neo4jClient, config, 'new-system');
      log('💾 Session updated: new-system');

      // Notify graph viewer
      notifyGraphUpdate();

      console.log('\x1b[32m✅ Graph cleared - ready for new system\x1b[0m');
      console.log('\x1b[90m   (System ID will be auto-detected from first SYS node)\x1b[0m');
      log('✅ Graph cleared');
      console.log('');
      break;

    case '/load':
      if (!neo4jClient) {
        console.log('\x1b[33m⚠️  Neo4j not configured\x1b[0m');
        break;
      }
      await handleLoadCommand(rl);
      return; // Don't call rl.prompt() - handleLoadCommand will do it after async operation

    case '/save': {
      if (!neo4jClient) {
        console.log('\x1b[33m⚠️  Neo4j not configured\x1b[0m');
        break;
      }
      console.log('💾 Saving to Neo4j...');
      log('💾 Saving to Neo4j...');

      const graphResult = await graphCanvas.persistToNeo4j();
      const chatResult = await chatCanvas.persistToNeo4j();

      // Update AppSession timestamp
      const saveSession = neo4jClient['getSession']();
      try {
        await saveSession.run(
          `MERGE (s:AppSession {userId: $userId, workspaceId: $workspaceId})
           SET s.activeSystemId = $systemId, s.updatedAt = datetime()`,
          { userId: config.userId, workspaceId: config.workspaceId, systemId: config.systemId }
        );
      } finally {
        await saveSession.close();
      }

      if (graphResult.skipped && chatResult.skipped) {
        console.log('\x1b[32m✅ Already saved (auto-save keeps graph up to date)\x1b[0m');
        log('✅ Already saved');
      } else {
        const graphCount = graphResult.savedCount || 0;
        const chatCount = chatResult.savedCount || 0;
        const parts: string[] = [];
        if (graphCount > 0) parts.push(`${graphCount} graph items`);
        if (chatCount > 0) parts.push(`${chatCount} messages`);
        const summary = parts.length > 0 ? parts.join(', ') : 'all changes';
        console.log(`\x1b[32m✅ Saved ${summary}\x1b[0m`);
        log(`✅ Saved ${summary}`);
      }
      break;
    }

    case '/export': {
      console.log('📤 Exporting graph...');
      log('📤 Exporting graph...');
      try {
        const exportState = graphCanvas.getState();
        const filename = args.length > 0
          ? (args[0].endsWith('.txt') ? args[0] : `${args[0]}.txt`)
          : `${config.systemId}-${Date.now()}.txt`;
        const filePath = await exportSystem(
          {
            nodes: exportState.nodes,
            edges: exportState.edges,
            ports: exportState.ports,
            systemId: config.systemId,
            workspaceId: config.workspaceId,
            version: exportState.version,
            lastSavedVersion: exportState.lastSavedVersion,
            lastModified: exportState.lastModified,
          },
          filename
        );
        console.log(`\x1b[32m✅ Exported to: ${filePath}\x1b[0m`);
        log(`✅ Exported to: ${filePath}`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.log(`\x1b[31m❌ Export failed: ${errorMsg}\x1b[0m`);
        log(`❌ Export failed: ${errorMsg}`);
      }
      break;
    }

    case '/import': {
      if (args.length === 0) {
        console.log('\x1b[33m⚠️  Usage: /import <filename>\x1b[0m');
        console.log('\x1b[90m   Use /exports to list available files\x1b[0m');
        break;
      }
      const importFilename = args[0].endsWith('.txt') ? args[0] : `${args[0]}.txt`;
      console.log(`📥 Importing from ${importFilename}...`);
      log(`📥 Importing from ${importFilename}...`);
      try {
        const importedState = await importSystem(importFilename);

        // CR-032: Load into AgentDB (Single Source of Truth)
        agentDB.clearForSystemLoad();
        const nodes = Array.from(importedState.nodes.values());
        const edges = Array.from(importedState.edges.values());
        agentDB.loadFromState({ nodes, edges });

        // Update session and persist to Neo4j
        const newSystemId = importedState.systemId || config.systemId;
        await updateActiveSystem(neo4jClient, config, newSystemId);

        // Persist imported data to Neo4j
        await neo4jClient.saveNodes(nodes);
        await neo4jClient.saveEdges(edges);
        log(`💾 Imported system persisted to Neo4j: ${config.systemId}`);

        notifyGraphUpdate();
        console.log(`\x1b[32m✅ Imported: ${importedState.nodes.size} nodes, ${importedState.edges.size} edges\x1b[0m`);
        log(`✅ Imported: ${importedState.nodes.size} nodes, ${importedState.edges.size} edges`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.log(`\x1b[31m❌ Import failed: ${errorMsg}\x1b[0m`);
        log(`❌ Import failed: ${errorMsg}`);
      }
      break;
    }

    case '/exports': {
      console.log('📁 Available exports:');
      log('📁 Listing exports');
      try {
        const files = await listExports();
        if (files.length === 0) {
          console.log('\x1b[90m   No export files found in ./exports/\x1b[0m');
        } else {
          for (const file of files) {
            try {
              const meta = await getExportMetadata(file);
              const info = meta.systemId ? `(${meta.systemId}, ${meta.nodeCount} nodes)` : '';
              console.log(`   ${file} \x1b[90m${info}\x1b[0m`);
            } catch {
              console.log(`   ${file}`);
            }
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.log(`\x1b[31m❌ Error listing exports: ${errorMsg}\x1b[0m`);
      }
      console.log('');
      break;
    }

    case '/stats': {
      const state = graphCanvas.getState();
      console.log('');
      console.log(`Workspace: ${config.workspaceId}`);
      console.log(`System: ${config.systemId}`);
      console.log(`Nodes: ${state.nodes.size}`);
      console.log(`Edges: ${state.edges.size}`);
      console.log(`View: ${state.currentView}`);
      console.log('');
      log(`📊 Stats - Nodes: ${state.nodes.size}, Edges: ${state.edges.size}`);
      break;
    }

    case '/view':
      // Generate valid views dynamically from DEFAULT_VIEW_CONFIGS (single source of truth)
      const validViews = Object.keys(DEFAULT_VIEW_CONFIGS);
      if (args.length === 0) {
        console.log('\x1b[33mUsage: /view <name>\x1b[0m');
        console.log(`Views: ${validViews.join(', ')}`);
        break;
      }
      const viewName = args[0];
      if (!validViews.includes(viewName)) {
        console.log(`\x1b[33m❌ Invalid view: ${viewName}\x1b[0m`);
        console.log(`Valid views: ${validViews.join(', ')}`);
        break;
      }
      // Update graph canvas view
      console.log(`🔄 Switching to ${viewName} view...`);
      log(`🔄 Switching to ${viewName} view`);
      graphCanvas.setCurrentView(viewName);
      notifyGraphUpdate();
      console.log('\x1b[32m✅ View updated (check GRAPH terminal)\x1b[0m');
      break;

    case '/clear':
      printHeader();
      break;

    case '/derive':
      await handleDeriveCommand(args, rl);
      return; // Don't call rl.prompt() - handleDeriveCommand will do it after async operation

    // CR-031: Validation & Optimization commands
    case '/validate':
      await handleValidateCommand(args);
      break;

    case '/phase-gate':
      await handlePhaseGateCommand(args);
      break;

    case '/score':
      await handleScoreCommand();
      break;

    case '/analyze':
      await handleAnalyzeCommand();
      break;

    case '/optimize':
      await handleOptimizeCommand(args[0] || '');
      break;

    case '/cleanup':
      await handleCleanupCommand(args);
      break;

    default:
      console.log('\x1b[33mUnknown command. Type /help for available commands.\x1b[0m');
  }
}

/**
 * Process user message
 */
async function processMessage(message: string): Promise<void> {
  try {
    log(`📨 User: ${message}`);

    if (!llmEngine) {
      console.log('\x1b[33m⚠️  LLM Engine not configured. Set ANTHROPIC_API_KEY in .env\x1b[0m');
      return;
    }

    // CR-027: Get Multi-Agent components
    const workflowRouter = getWorkflowRouter();
    const agentExecutor = getAgentExecutor();
    const configLoader = getAgentConfigLoader();

    // CR-032: Get graph state directly from GraphCanvas (UnifiedAgentDBService is source of truth)
    const currentState = graphCanvas.getState();
    const canvasState = parser.serializeGraph(currentState);

    // CR-027: Build session context for routing
    const sessionContext: SessionContext = {
      currentPhase: 'phase1_requirements', // TODO: Track phase state
      graphEmpty: currentState.nodes.size === 0,
      userMessage: message,
      recentNodeTypes: Array.from(currentState.nodes.values())
        .slice(-5)
        .map((n) => n.type),
    };

    // CR-027: Route to appropriate agent based on message and context
    const selectedAgent = workflowRouter.routeUserInput(message, sessionContext);
    log(`🤖 Agent selected: ${selectedAgent}`);

    // CR-027: Get agent-specific prompt from config
    let agentPrompt: string;
    try {
      agentPrompt = agentExecutor.getAgentContextPrompt(selectedAgent, canvasState, message);
    } catch {
      // Fallback if agent prompt not found
      agentPrompt = configLoader.getPrompt('system-architect');
      log(`⚠️ Fallback to system-architect prompt (${selectedAgent} not configured)`);
    }

    console.log(`\x1b[33m🤖 Processing with ${selectedAgent}...\x1b[0m`);
    log(`🤖 Processing with ${selectedAgent}...`);

    // Add user message to chat canvas
    await chatCanvas.addUserMessage(message);

    // Get conversation context for multi-turn chat (last 10 messages)
    const conversationContext = chatCanvas.getConversationContext(10);
    const chatHistory = conversationContext.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Create LLM request with agent-specific context
    const request = {
      message,
      chatId: config.chatId,
      workspaceId: config.workspaceId,
      systemId: config.systemId,
      userId: config.userId,
      canvasState,
      chatHistory,
      systemPrompt: agentPrompt, // CR-027: Use agent-specific prompt
    };

    // Track streaming state
    let isFirstChunk = true;

    // Send to LLM with streaming
    await llmEngine.processRequestStream(request, async (chunk) => {
      if (chunk.type === 'text' && chunk.text) {
        // Display text chunk in real-time
        if (isFirstChunk) {
          console.log('');
          process.stdout.write('\x1b[32mAssistant:\x1b[0m ');
          isFirstChunk = false;
        }
        process.stdout.write(chunk.text);
      } else if (chunk.type === 'complete' && chunk.response) {
        // Stream complete - process operations
        const response = chunk.response;

        // Add newline after streamed text
        console.log('\n');

        // Add assistant response to chat canvas
        await chatCanvas.addAssistantMessage(response.textResponse, response.operations ?? undefined);

        // Apply operations to graph if present (silently)
        if (response.operations) {
          const diff = parser.parseDiff(response.operations, config.workspaceId, config.systemId);

          // Diagnostic: Log if operations block exists but no operations parsed
          if (diff.operations.length === 0) {
            log(`⚠️ PARSE FAILURE: Operations block found but 0 operations parsed`);
            log(`📋 Operations block (first 800 chars):\n${response.operations.substring(0, 800)}`);
            console.log('\x1b[33m⚠️  Operations block found but no valid Format-E operations parsed\x1b[0m');
            console.log('\x1b[90m   Check LOG for details. Expected format: + Name|TYPE|ID|Description\x1b[0m');
          }

          // CR-032: Apply diff to StatelessGraphCanvas (delegates to AgentDB)
          await graphCanvas.applyDiff(diff);

          const stats = agentDB.getGraphStats();
          log(`📊 Graph updated (${stats.nodeCount} nodes, ${stats.edgeCount} edges)`);

          // Auto-detect system ID from first SYS node (only if placeholder)
          if (config.systemId === 'new-system') {
            const sysNodes = agentDB.getNodes({ type: 'SYS' });
            if (sysNodes.length > 0) {
              const newSystemId = sysNodes[0].semanticId;
              console.log(`\x1b[90m✓ Detected new system: ${newSystemId}\x1b[0m`);
              log(`📌 System ID detected: ${newSystemId}`);

              // Update session and persist to Neo4j
              await updateActiveSystem(neo4jClient, config, newSystemId);
              await neo4jClient.saveNodes(agentDB.getNodes());
              await neo4jClient.saveEdges(agentDB.getEdges());
              log(`💾 System persisted to Neo4j: ${newSystemId}`);
            }
          }

          // Notify graph viewer (silently)
          notifyGraphUpdate();

          // Show brief status
          console.log(`\x1b[90m✓ Graph updated: ${stats.nodeCount} nodes, ${stats.edgeCount} edges (see GRAPH terminal)\x1b[0m`);
          console.log('');
        }

        log('✅ Response complete');

        // CR-027: Store episode for Multi-Agent learning with routed agent
        try {
          // Calculate reward based on validation (CR-027)
          const reward = agentExecutor.calculateReward(selectedAgent, {
            agentId: selectedAgent,
            textResponse: response.textResponse,
            operations: response.operations ?? undefined,
            isComplete: true,
          });

          // CR-032: Use UnifiedAgentDBService via helper
          const agentdb = await getAgentDB();
          await agentdb.storeEpisode(
            selectedAgent, // Use CR-027 routed agent
            message,
            true, // success
            { response: response.textResponse, operations: response.operations },
            `Agent: ${selectedAgent}, Reward: ${reward.toFixed(2)}`
          );
          log(`🧠 Episode stored for agent: ${selectedAgent} (reward: ${reward.toFixed(2)})`);
        } catch (episodeError) {
          // Non-fatal - log but don't fail the request
          log(`⚠️ Episode storage failed: ${episodeError}`);
        }
      }
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31mError:\x1b[0m ${errorMsg}`);
    log(`❌ Error: ${errorMsg}`);

    // Store failed episode for learning (CR-032: use UnifiedAgentDBService)
    try {
      const agentdb = await getAgentDB();
      await agentdb.storeEpisode(
        'system-architect', // Default agent for errors
        message,
        false, // failure
        { error: errorMsg },
        `Error: ${errorMsg}`
      );
    } catch {
      // Ignore episode storage errors during error handling
    }
  }
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  printHeader();

  log('🚀 Chat interface started');

  // ============================================
  // STEP 1: Session Resolution (MANDATORY Neo4j)
  // ============================================
  // Uses central session-resolver for consistent initialization
  // Same logic as graph-viewer.ts
  neo4jClient = initNeo4jClient();
  sessionManager = new SessionManager(neo4jClient);

  const resolved = await resolveSession(neo4jClient);
  config.workspaceId = resolved.workspaceId;
  config.systemId = resolved.systemId;
  config.userId = resolved.userId;
  config.chatId = resolved.chatId;

  console.log(`\x1b[90m✓ Session: ${resolved.systemId} (${resolved.source})\x1b[0m`);
  log(`📋 Session: ${resolved.systemId} (source: ${resolved.source})`);

  // ============================================
  // STEP 2: Initialize AgentDB (CR-032: Single Source of Truth)
  // ============================================
  log('🔧 Initializing UnifiedAgentDBService (CR-032)...');
  agentDB = await getUnifiedAgentDBService(config.workspaceId, config.systemId);
  log('✅ UnifiedAgentDBService initialized');

  // ============================================
  // STEP 3: Initialize Canvases (delegate to AgentDB)
  // ============================================
  graphCanvas = new StatelessGraphCanvas(
    agentDB,
    config.workspaceId,
    config.systemId,
    config.chatId,
    config.userId,
    'hierarchy'
  );

  chatCanvas = new ChatCanvas(
    config.workspaceId,
    config.systemId,
    config.chatId,
    config.userId,
    graphCanvas,
    neo4jClient
  );

  // ============================================
  // STEP 4: Optional LLM Engine
  // ============================================
  if (process.env.ANTHROPIC_API_KEY) {
    llmEngine = new LLMEngine({
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-sonnet-4-5-20250929',
      maxTokens: 4096,
      temperature: LLM_TEMPERATURE,
      enableCache: true,
    });
  }

  // ============================================
  // STEP 4: WebSocket Connection
  // ============================================
  // Connect to WebSocket FIRST (before loading graph, so we can broadcast initial state)
  wsClient = new CanvasWebSocketClient(
    process.env.WS_URL || WS_URL,
    {
      workspaceId: config.workspaceId,
      systemId: config.systemId,
      userId: config.userId,
    },
    (update: BroadcastUpdate) => {
      // Handle updates from other clients (not used in chat terminal)
      const userId = update.source?.userId || 'unknown';
      log(`📡 Received ${update.type} from ${userId}`);
    }
  );

  try {
    await wsClient.connect();
    console.log('\x1b[32m✅ Connected to WebSocket server\x1b[0m');
    log('✅ WebSocket connected');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const wsUrl = process.env.WS_URL || WS_URL;
    console.error('');
    console.error('\x1b[31m╔═══════════════════════════════════════╗\x1b[0m');
    console.error('\x1b[31m║  ERROR: WebSocket Connection Failed  ║\x1b[0m');
    console.error('\x1b[31m╚═══════════════════════════════════════╝\x1b[0m');
    console.error('');
    console.error(`\x1b[31mCould not connect to WebSocket server at ${wsUrl}\x1b[0m`);
    console.error(`\x1b[31mError: ${errorMsg}\x1b[0m`);
    console.error('');
    console.error('\x1b[33mPlease ensure the WebSocket server is running:\x1b[0m');
    console.error('\x1b[33m  npm run websocket-server\x1b[0m');
    console.error('');
    log(`❌ WebSocket connection failed: ${errorMsg}`);
    process.exit(1);
  }

  // CR-032: Load graph from Neo4j into AgentDB (Single Source of Truth)
  // StatelessGraphCanvas reads from AgentDB - no separate loading needed
  if (neo4jClient) {
    try {
      const { nodes, edges } = await neo4jClient.loadGraph({
        workspaceId: config.workspaceId,
        systemId: config.systemId,
      });

      if (nodes.length > 0) {
        console.log(`\x1b[32m✅ Loaded ${nodes.length} nodes, ${edges.length} edges from Neo4j\x1b[0m`);
        log(`📥 Loaded ${nodes.length} nodes, ${edges.length} edges from Neo4j`);

        // CR-032: Load into AgentDB (Single Source of Truth)
        // StatelessGraphCanvas reads from here automatically
        for (const node of nodes) {
          agentDB.setNode(node, { upsert: true });
        }
        for (const edge of edges) {
          agentDB.setEdge(edge, { upsert: true });
        }
        log(`📦 Loaded ${nodes.length} nodes into AgentDB`);

        // Broadcast initial state to graph viewer (WebSocket now connected)
        notifyGraphUpdate();
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`\x1b[33m⚠️  Could not load from Neo4j: ${errorMsg}\x1b[0m`);
      log(`⚠️ Neo4j load error: ${errorMsg}`);
    }
  }

  console.log('');

  // Register components with session manager for cleanup
  if (sessionManager) {
    sessionManager.registerComponents(wsClient, graphCanvas, chatCanvas);
  }

  console.log('');

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[34mYou:\x1b[0m ',
  });

  rl.prompt();

  rl.on('line', async (input) => {
    const trimmed = input.trim();

    if (!trimmed) {
      rl.prompt();
      return;
    }

    if (trimmed === 'exit' || trimmed === 'quit' || trimmed === '/exit') {
      log('🛑 Shutting down all terminals...');

      // Send shutdown signal to other terminals via WebSocket
      if (wsClient) {
        try {
          wsClient.broadcast({
            type: 'shutdown',
            timestamp: new Date().toISOString(),
          });
          log('📡 Shutdown signal sent to all terminals');

          // Wait longer to ensure message delivery before closing connections
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          log(`⚠️  Could not send shutdown signal: ${error}`);
        }
      }

      if (sessionManager) {
        const state = graphCanvas.getState();
        await sessionManager.shutdown({
          userId: config.userId,
          workspaceId: config.workspaceId,
          activeSystemId: config.systemId,
          currentView: state.currentView,
          chatId: config.chatId,
          lastActive: new Date(),
        });
      } else if (neo4jClient) {
        // Fallback if no session manager
        console.log('');
        console.log('💾 Saving before exit...');
        await graphCanvas.persistToNeo4j();
        await chatCanvas.persistToNeo4j();
        await neo4jClient.close();
        console.log('\x1b[32m✅ Goodbye!\x1b[0m');
      }

      log('✅ Shutdown complete');
      process.exit(0);
    }

    if (trimmed.startsWith('/')) {
      await handleCommand(trimmed, rl);
      rl.prompt();
      return;
    }

    await processMessage(trimmed);
    rl.prompt();
  });

  rl.on('close', async () => {
    log('🛑 SIGINT received - shutting down...');

    if (sessionManager) {
      const state = graphCanvas.getState();
      await sessionManager.shutdown({
        userId: config.userId,
        workspaceId: config.workspaceId,
        activeSystemId: config.systemId,
        currentView: state.currentView,
        chatId: config.chatId,
        lastActive: new Date(),
      });
    } else if (neo4jClient) {
      console.log('');
      await graphCanvas.persistToNeo4j();
      await chatCanvas.persistToNeo4j();
      await neo4jClient.close();
    }

    log('✅ Shutdown complete');
    process.exit(0);
  });
}

// Handle signals
process.on('SIGINT', async () => {
  console.log('');
  console.log('💾 Saving...');
  await graphCanvas.persistToNeo4j();
  await chatCanvas.persistToNeo4j();
  if (neo4jClient) await neo4jClient.close();
  console.log('✅ Goodbye!');
  process.exit(0);
});

// Crash handlers - log errors to STDOUT file
process.on('uncaughtException', async (error: Error) => {
  const errorMsg = `💥 CRASH (uncaughtException): ${error.message}`;
  console.error(errorMsg);
  log(errorMsg);
  if (error.stack) {
    log(error.stack);
  }
  // Emergency save attempt
  try {
    log('💾 Emergency save attempt...');
    await graphCanvas.persistToNeo4j();
    await chatCanvas.persistToNeo4j();
    log('✅ Emergency save successful');
  } catch (saveError) {
    log(`❌ Emergency save failed: ${saveError}`);
  }
  if (neo4jClient) await neo4jClient.close();
  process.exit(1);
});

process.on('unhandledRejection', async (reason: unknown) => {
  const errorMsg = `💥 CRASH (unhandledRejection): ${reason}`;
  console.error(errorMsg);
  log(errorMsg);
  if (reason instanceof Error && reason.stack) {
    log(reason.stack);
  }
  // Emergency save attempt
  try {
    log('💾 Emergency save attempt...');
    await graphCanvas.persistToNeo4j();
    await chatCanvas.persistToNeo4j();
    log('✅ Emergency save successful');
  } catch (saveError) {
    log(`❌ Emergency save failed: ${saveError}`);
  }
  if (neo4jClient) await neo4jClient.close();
  process.exit(1);
});

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  log(`💥 FATAL: ${error.message}`);
  if (error.stack) {
    log(error.stack);
  }
  process.exit(1);
});
