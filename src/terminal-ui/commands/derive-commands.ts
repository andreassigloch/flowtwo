/**
 * Derive Commands - Auto-derivation command handlers
 *
 * Handles /derive arch|tests|flows|modules commands for automated
 * architecture derivation using LLM agents.
 *
 * @author andreas@siglochconsulting
 */

import type { CommandContext } from './types.js';
import {
  ArchitectureDerivationAgent,
  ArchitectureDerivationRequest,
  ReqToTestDerivationAgent,
  ReqToTestDerivationRequest,
  FuncToFlowDerivationAgent,
  FuncToFlowDerivationRequest,
  FuncToModDerivationAgent,
  FuncToModDerivationRequest,
} from '../../llm-engine/auto-derivation.js';

/**
 * Handle /derive command
 */
export async function handleDeriveCommand(
  args: string[],
  ctx: CommandContext
): Promise<void> {
  if (!ctx.llmEngine) {
    console.log('\x1b[33m⚠️  LLM Engine not configured (set ANTHROPIC_API_KEY in .env)\x1b[0m');
    ctx.rl.prompt();
    return;
  }

  const derivationType = args[0]?.toLowerCase() || 'arch';

  switch (derivationType) {
    case 'tests':
    case 'test':
      await executeDeriveTests(ctx);
      break;
    case 'flows':
    case 'flow':
      await executeDeriveFlows(ctx);
      break;
    case 'modules':
    case 'module':
    case 'mods':
    case 'mod':
      await executeDeriveModules(ctx);
      break;
    case 'arch':
    case 'architecture':
    default:
      await executeDeriveFuncs(ctx);
      break;
  }
}

/**
 * Execute UC → FUNC derivation
 */
async function executeDeriveFuncs(ctx: CommandContext): Promise<void> {
  const state = ctx.graphCanvas.getState();
  const ucNodes = Array.from(state.nodes.values()).filter((n) => n.type === 'UC');

  if (ucNodes.length === 0) {
    console.log('\x1b[33m⚠️  No Use Cases (UC) found in the graph.\x1b[0m');
    console.log('\x1b[90m   Create Use Cases first: "Create a Use Case for user authentication"\x1b[0m');
    console.log('');
    ctx.rl.prompt();
    return;
  }

  console.log('');
  console.log('\x1b[1;36m🏗️  Deriving Logical Architecture from ALL Use Cases\x1b[0m');
  console.log('\x1b[90m   Applying SE principle: Observable + Verifiable at interface boundary\x1b[0m');
  console.log('');

  console.log('\x1b[90mUse Cases to analyze:\x1b[0m');
  ucNodes.forEach((uc) => {
    console.log(`  • ${uc.name} (${uc.semanticId})`);
  });
  console.log('');

  await executeDeriveArchitecture(ctx);
}

/**
 * Execute the UC → FUNC derivation using the Architecture Agent
 */
async function executeDeriveArchitecture(ctx: CommandContext): Promise<void> {
  const state = ctx.graphCanvas.getState();

  const useCases = Array.from(state.nodes.values())
    .filter((n) => n.type === 'UC')
    .map((uc) => ({
      semanticId: uc.semanticId,
      name: uc.name,
      descr: uc.descr || '',
    }));

  const actors = Array.from(state.nodes.values())
    .filter((n) => n.type === 'ACTOR')
    .map((a) => ({
      semanticId: a.semanticId,
      name: a.name,
      descr: a.descr || '',
    }));

  const existingFunctions: Array<{
    semanticId: string;
    name: string;
    descr: string;
    parentId?: string;
  }> = [];

  for (const [, node] of state.nodes) {
    if (node.type === 'FUNC') {
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

  const canvasState = ctx.parser.serializeGraph(state);
  const derivationAgent = new ArchitectureDerivationAgent();
  const request: ArchitectureDerivationRequest = {
    useCases,
    actors,
    existingFunctions,
    existingFChains,
    canvasState,
    systemId: ctx.config.systemId,
  };

  const derivationPrompt = derivationAgent.buildArchitecturePrompt(request);
  ctx.log(`🏗️  Architecture derivation started: ${useCases.length} UCs, ${existingFunctions.length} existing FUNCs`);

  try {
    console.log('\x1b[33m🤖 Analyzing Use Cases and deriving architecture...\x1b[0m');

    let isFirstChunk = true;
    let fullResponse = '';

    const llmRequest = {
      message: derivationPrompt,
      chatId: ctx.config.chatId,
      workspaceId: ctx.config.workspaceId,
      systemId: ctx.config.systemId,
      userId: ctx.config.userId,
      canvasState,
    };

    await ctx.llmEngine!.processRequestStream(llmRequest, async (chunk) => {
      if (chunk.type === 'text' && chunk.text) {
        if (isFirstChunk) {
          console.log('');
          process.stdout.write('\x1b[32mArchitect:\x1b[0m ');
          isFirstChunk = false;
        }
        const displayText = chunk.text.replace(/<operations>[\s\S]*?<\/operations>/g, '');
        process.stdout.write(displayText);
        fullResponse += chunk.text;
      } else if (chunk.type === 'complete' && chunk.response) {
        console.log('\n');

        const operations = derivationAgent.extractOperations(fullResponse);

        if (operations) {
          const diff = ctx.parser.parseDiff(operations, ctx.config.workspaceId, ctx.config.systemId);
          await ctx.graphCanvas.applyDiff(diff);

          const newState = ctx.graphCanvas.getState();
          const newFuncs = Array.from(newState.nodes.values()).filter((n) => n.type === 'FUNC').length;
          const newFlows = Array.from(newState.nodes.values()).filter((n) => n.type === 'FLOW').length;

          console.log(`\x1b[32m✅ Architecture applied:\x1b[0m`);
          console.log(`   Nodes: ${newState.nodes.size}, Edges: ${newState.edges.size}`);
          console.log(`   Functions: ${newFuncs}, Flows: ${newFlows}`);
          ctx.log(`✅ Architecture derivation complete: ${newFuncs} functions, ${newFlows} flows`);

          ctx.notifyGraphUpdate();
        } else if (chunk.response.operations) {
          const diff = ctx.parser.parseDiff(chunk.response.operations, ctx.config.workspaceId, ctx.config.systemId);
          await ctx.graphCanvas.applyDiff(diff);

          const newState = ctx.graphCanvas.getState();
          console.log(`\x1b[32m✅ Architecture applied: ${newState.nodes.size} nodes, ${newState.edges.size} edges\x1b[0m`);

          ctx.notifyGraphUpdate();
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
    ctx.log(`❌ Architecture derivation failed: ${errorMsg}`);
    console.log('');
  }

  ctx.rl.prompt();
}

/**
 * Generic derivation executor - shared logic for all derivation types
 */
async function executeDerivation(
  ctx: CommandContext,
  agent: { extractOperations: (response: string) => string | null },
  prompt: string,
  label: string,
  primaryType: string
): Promise<void> {
  const canvasState = ctx.parser.serializeGraph(ctx.graphCanvas.getState());

  console.log(`\x1b[33m🤖 Analyzing and deriving ${label.toLowerCase()}s...\x1b[0m`);

  let isFirstChunk = true;
  let fullResponse = '';

  const llmRequest = {
    message: prompt,
    chatId: ctx.config.chatId,
    workspaceId: ctx.config.workspaceId,
    systemId: ctx.config.systemId,
    userId: ctx.config.userId,
    canvasState,
  };

  await ctx.llmEngine!.processRequestStream(llmRequest, async (chunk) => {
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
        const diff = ctx.parser.parseDiff(operations, ctx.config.workspaceId, ctx.config.systemId);
        await ctx.graphCanvas.applyDiff(diff);

        const newState = ctx.graphCanvas.getState();
        const primaryCount = Array.from(newState.nodes.values()).filter((n) => n.type === primaryType).length;

        console.log(`\x1b[32m✅ ${label} derivation applied:\x1b[0m`);
        console.log(`   Nodes: ${newState.nodes.size}, Edges: ${newState.edges.size}`);
        console.log(`   ${primaryType} nodes: ${primaryCount}`);
        ctx.log(`✅ ${label} derivation complete: ${primaryCount} ${primaryType} nodes`);

        ctx.notifyGraphUpdate();
      } else if (chunk.response.operations) {
        const diff = ctx.parser.parseDiff(chunk.response.operations, ctx.config.workspaceId, ctx.config.systemId);
        await ctx.graphCanvas.applyDiff(diff);

        const newState = ctx.graphCanvas.getState();
        console.log(`\x1b[32m✅ ${label} applied: ${newState.nodes.size} nodes, ${newState.edges.size} edges\x1b[0m`);

        ctx.notifyGraphUpdate();
      } else {
        console.log('\x1b[33m⚠️  No operations generated\x1b[0m');
        console.log(`\x1b[90m   The agent may have determined no ${label.toLowerCase()}s are needed\x1b[0m`);
      }

      console.log('');
    }
  });
}

/**
 * Execute REQ → TEST derivation
 */
async function executeDeriveTests(ctx: CommandContext): Promise<void> {
  const state = ctx.graphCanvas.getState();
  const reqNodes = Array.from(state.nodes.values()).filter((n) => n.type === 'REQ');

  if (reqNodes.length === 0) {
    console.log('\x1b[33m⚠️  No Requirements (REQ) found in the graph.\x1b[0m');
    console.log('\x1b[90m   Create Requirements first: "Add requirement for user authentication"\x1b[0m');
    console.log('');
    ctx.rl.prompt();
    return;
  }

  console.log('');
  console.log('\x1b[1;36m🧪  Deriving Test Cases from Requirements\x1b[0m');
  console.log('\x1b[90m   INCOSE principle: Every requirement must be verifiable\x1b[0m');
  console.log('');

  console.log('\x1b[90mRequirements to derive tests for:\x1b[0m');
  reqNodes.forEach((req) => {
    console.log(`  • ${req.name} (${req.semanticId})`);
  });
  console.log('');

  const requirements = reqNodes.map((req) => ({
    semanticId: req.semanticId,
    name: req.name,
    descr: req.descr || '',
    type: 'functional' as const,
  }));

  const existingTests = Array.from(state.nodes.values())
    .filter((n) => n.type === 'TEST')
    .map((t) => {
      let verifies: string | undefined;
      for (const [, edge] of state.edges) {
        if (edge.type === 'verify' && edge.targetId === t.semanticId) {
          verifies = edge.sourceId;
          break;
        }
      }
      return { semanticId: t.semanticId, name: t.name, verifies };
    });

  const canvasState = ctx.parser.serializeGraph(state);
  const agent = new ReqToTestDerivationAgent();
  const request: ReqToTestDerivationRequest = {
    requirements,
    existingTests,
    canvasState,
    systemId: ctx.config.systemId,
  };

  const derivationPrompt = agent.buildTestDerivationPrompt(request);
  ctx.log(`🧪 Test derivation started: ${requirements.length} REQs, ${existingTests.length} existing tests`);

  try {
    await executeDerivation(ctx, agent, derivationPrompt, 'Test', 'TEST');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Test derivation error: ${errorMsg}\x1b[0m`);
    ctx.log(`❌ Test derivation failed: ${errorMsg}`);
    console.log('');
  }

  ctx.rl.prompt();
}

/**
 * Execute FUNC → FLOW derivation
 */
async function executeDeriveFlows(ctx: CommandContext): Promise<void> {
  const state = ctx.graphCanvas.getState();
  const funcNodes = Array.from(state.nodes.values()).filter((n) => n.type === 'FUNC');

  if (funcNodes.length === 0) {
    console.log('\x1b[33m⚠️  No Functions (FUNC) found in the graph.\x1b[0m');
    console.log('\x1b[90m   Derive architecture first: /derive\x1b[0m');
    console.log('');
    ctx.rl.prompt();
    return;
  }

  console.log('');
  console.log('\x1b[1;36m🔄  Deriving Data Flows for Functions\x1b[0m');
  console.log('\x1b[90m   3-Layer Interface Model: Semantic → Data Format → Protocol\x1b[0m');
  console.log('');

  const functions = funcNodes.map((func) => {
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

  const missingIO = functions.filter((f) => !f.hasInputFlow || !f.hasOutputFlow);
  if (missingIO.length === 0) {
    console.log('\x1b[32m✅ All functions have complete I/O flows\x1b[0m');
    console.log('');
    ctx.rl.prompt();
    return;
  }

  console.log('\x1b[90mFunctions missing I/O:\x1b[0m');
  missingIO.forEach((f) => {
    const status = [];
    if (!f.hasInputFlow) status.push('input');
    if (!f.hasOutputFlow) status.push('output');
    console.log(`  • ${f.name} (missing ${status.join(', ')})`);
  });
  console.log('');

  const existingFlows = Array.from(state.nodes.values())
    .filter((n) => n.type === 'FLOW')
    .map((fl) => {
      const connectedTo: string[] = [];
      for (const [, edge] of state.edges) {
        if (edge.type === 'io' && (edge.sourceId === fl.semanticId || edge.targetId === fl.semanticId)) {
          connectedTo.push(edge.sourceId === fl.semanticId ? edge.targetId : edge.sourceId);
        }
      }
      return { semanticId: fl.semanticId, name: fl.name, connectedTo };
    });

  const existingSchemas = Array.from(state.nodes.values())
    .filter((n) => n.type === 'SCHEMA')
    .map((s) => ({
      semanticId: s.semanticId,
      name: s.name,
      category: 'data' as const,
    }));

  const canvasState = ctx.parser.serializeGraph(state);
  const agent = new FuncToFlowDerivationAgent();
  const request: FuncToFlowDerivationRequest = {
    functions,
    existingFlows,
    existingSchemas,
    canvasState,
    systemId: ctx.config.systemId,
  };

  const derivationPrompt = agent.buildFlowDerivationPrompt(request);
  ctx.log(`🔄 Flow derivation started: ${missingIO.length} functions need I/O`);

  try {
    await executeDerivation(ctx, agent, derivationPrompt, 'Flow', 'FLOW');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Flow derivation error: ${errorMsg}\x1b[0m`);
    ctx.log(`❌ Flow derivation failed: ${errorMsg}`);
    console.log('');
  }

  ctx.rl.prompt();
}

/**
 * Execute FUNC → MOD derivation
 */
async function executeDeriveModules(ctx: CommandContext): Promise<void> {
  const state = ctx.graphCanvas.getState();
  const funcNodes = Array.from(state.nodes.values()).filter((n) => n.type === 'FUNC');

  if (funcNodes.length === 0) {
    console.log('\x1b[33m⚠️  No Functions (FUNC) found in the graph.\x1b[0m');
    console.log('\x1b[90m   Derive architecture first: /derive\x1b[0m');
    console.log('');
    ctx.rl.prompt();
    return;
  }

  console.log('');
  console.log('\x1b[1;36m📦  Deriving Module Allocation for Functions\x1b[0m');
  console.log('\x1b[90m   Principles: Cohesion, Coupling minimization, Volatility isolation\x1b[0m');
  console.log('');

  const functions = funcNodes.map((func) => {
    let allocatedTo: string | undefined;
    const connectedFuncs: string[] = [];

    for (const [, edge] of state.edges) {
      if (edge.type === 'allocate' && edge.targetId === func.semanticId) {
        allocatedTo = edge.sourceId;
      }
      if (edge.type === 'io' && edge.sourceId === func.semanticId) {
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

  const unallocated = functions.filter((f) => !f.allocatedTo);
  if (unallocated.length === 0) {
    console.log('\x1b[32m✅ All functions are allocated to modules\x1b[0m');
    console.log('');
    ctx.rl.prompt();
    return;
  }

  console.log('\x1b[90mUnallocated functions:\x1b[0m');
  unallocated.forEach((f) => {
    const vol = f.volatility ? ` [${f.volatility}]` : '';
    console.log(`  • ${f.name}${vol}`);
  });
  console.log('');

  const existingModules = Array.from(state.nodes.values())
    .filter((n) => n.type === 'MOD')
    .map((m) => {
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

  const canvasState = ctx.parser.serializeGraph(state);
  const agent = new FuncToModDerivationAgent();
  const request: FuncToModDerivationRequest = {
    functions,
    existingModules,
    canvasState,
    systemId: ctx.config.systemId,
  };

  const derivationPrompt = agent.buildAllocationPrompt(request);
  ctx.log(`📦 Module derivation started: ${unallocated.length} functions need allocation`);

  try {
    await executeDerivation(ctx, agent, derivationPrompt, 'Allocation', 'MOD');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Module derivation error: ${errorMsg}\x1b[0m`);
    ctx.log(`❌ Module derivation failed: ${errorMsg}`);
    console.log('');
  }

  ctx.rl.prompt();
}
