/**
 * Session Commands - Session and I/O command handlers
 *
 * Handles /new, /save, /load, /export, /import, /exports, /stats, /view commands
 *
 * @author andreas@siglochconsulting
 */

import * as readline from 'readline';
import type { CommandContext } from './types.js';
import { DEFAULT_VIEW_CONFIGS } from '../../shared/types/view.js';
import { exportSystem, importSystem, listExports, getExportMetadata } from '../../shared/parsers/import-export.js';
import { updateActiveSystem } from '../../shared/session-resolver.js';

/**
 * Handle /new command - start new system (clear graph)
 */
export async function handleNewCommand(ctx: CommandContext): Promise<void> {
  console.log('');
  console.log('\x1b[33m🗑️  Starting new system...\x1b[0m');
  ctx.log('🗑️  Starting new system');

  ctx.agentDB.clearForSystemLoad();
  await updateActiveSystem(ctx.neo4jClient, ctx.config, 'new-system');
  ctx.log('💾 Session updated: new-system');

  ctx.notifyGraphUpdate();

  console.log('\x1b[32m✅ Graph cleared - ready for new system\x1b[0m');
  console.log('\x1b[90m   (System ID will be auto-detected from first SYS node)\x1b[0m');
  ctx.log('✅ Graph cleared');
  console.log('');
}

/**
 * Handle /commit command - save to Neo4j and reset change tracking (CR-033)
 * This is the primary command for persisting changes.
 * Also accessible via /save (alias for backward compatibility).
 *
 * CR-032: Persistence is session-level, not canvas-level.
 * AgentDB is Single Source of Truth → Neo4j is cold storage.
 */
export async function handleCommitCommand(ctx: CommandContext): Promise<void> {
  if (!ctx.neo4jClient) {
    console.log('\x1b[33m⚠️  Neo4j not configured\x1b[0m');
    return;
  }
  console.log('💾 Committing to Neo4j...');
  ctx.log('💾 Committing to Neo4j...');

  // CR-032: Get nodes/edges from AgentDB (Single Source of Truth)
  const nodes = ctx.agentDB.getNodes();
  const edges = ctx.agentDB.getEdges();

  // Persist graph data to Neo4j
  let graphSavedCount = 0;
  if (nodes.length > 0) {
    await ctx.neo4jClient.saveNodes(nodes);
    graphSavedCount += nodes.length;
  }
  if (edges.length > 0) {
    await ctx.neo4jClient.saveEdges(edges);
    graphSavedCount += edges.length;
  }

  // Persist chat messages
  const chatResult = await ctx.chatCanvas.persistToNeo4j();

  // Update session metadata
  const saveSession = (ctx.neo4jClient as unknown as { getSession: () => { run: (q: string, p: Record<string, string>) => Promise<unknown>; close: () => Promise<void> } }).getSession();
  try {
    await saveSession.run(
      `MERGE (s:AppSession {userId: $userId, workspaceId: $workspaceId})
       SET s.activeSystemId = $systemId, s.updatedAt = datetime()`,
      { userId: ctx.config.userId, workspaceId: ctx.config.workspaceId, systemId: ctx.config.systemId }
    );
  } finally {
    await saveSession.close();
  }

  // Capture baseline for change tracking (CR-033)
  ctx.agentDB.captureBaseline();

  const chatCount = chatResult.savedCount || 0;
  const parts: string[] = [];
  if (graphSavedCount > 0) parts.push(`${nodes.length} nodes, ${edges.length} edges`);
  if (chatCount > 0) parts.push(`${chatCount} messages`);
  const summary = parts.length > 0 ? parts.join(', ') : 'no changes';
  console.log(`\x1b[32m✅ Committed ${summary}\x1b[0m`);
  ctx.log(`✅ Committed ${summary}`);
}

/**
 * Handle /save command - alias for /commit (backward compatibility)
 */
export async function handleSaveCommand(ctx: CommandContext): Promise<void> {
  return handleCommitCommand(ctx);
}

/**
 * Handle /status command - show pending changes summary (CR-033)
 */
export function handleStatusCommand(ctx: CommandContext): void {
  console.log('');
  console.log('\x1b[1;36m📊 Change Status\x1b[0m');

  if (!ctx.agentDB.hasBaseline()) {
    console.log('\x1b[90m   No baseline captured yet. Use /save to establish baseline.\x1b[0m');
    console.log('');
    return;
  }

  const summary = ctx.agentDB.getChangeSummary();

  if (summary.total === 0) {
    console.log('\x1b[32m   ✅ No pending changes\x1b[0m');
  } else {
    const parts: string[] = [];
    if (summary.added > 0) parts.push(`\x1b[32m+${summary.added} added\x1b[0m`);
    if (summary.modified > 0) parts.push(`\x1b[33m~${summary.modified} modified\x1b[0m`);
    if (summary.deleted > 0) parts.push(`\x1b[31m-${summary.deleted} deleted\x1b[0m`);
    console.log(`   ${parts.join(', ')}`);
    console.log(`   \x1b[90m(${summary.total} total pending changes)\x1b[0m`);
  }

  console.log('');
}

/**
 * Handle /load command - list and load systems from Neo4j
 */
export async function handleLoadCommand(mainRl: readline.Interface, ctx: CommandContext): Promise<void> {
  console.log('');
  console.log('\x1b[1;36m📂 Available Systems in Neo4j\x1b[0m');
  ctx.log('📂 Listing systems');

  if (!ctx.neo4jClient) {
    console.log('\x1b[33m⚠️  Neo4j not configured\x1b[0m');
    console.log('');
    mainRl.prompt();
    return;
  }

  try {
    const session = (ctx.neo4jClient as unknown as { getSession: () => { run: (q: string, p: Record<string, string>) => Promise<{ records: Array<{ get: (k: string) => unknown }> }>; close: () => Promise<void> } }).getSession();
    try {
      const result = await session.run(
        `MATCH (n:Node {type: 'SYS', workspaceId: $workspaceId})
         RETURN n.semanticId as systemId, n.name as name, n.descr as descr
         ORDER BY n.name`,
        { workspaceId: ctx.config.workspaceId }
      );

      if (result.records.length === 0) {
        console.log('\x1b[90m   No systems found in this workspace\x1b[0m');
        console.log('');
        mainRl.prompt();
        return;
      }

      console.log('');
      result.records.forEach((record, idx) => {
        const systemId = record.get('systemId') as string;
        const name = record.get('name') as string;
        const descr = (record.get('descr') as string) || '';
        const current = systemId === ctx.config.systemId ? ' \x1b[32m(current)\x1b[0m' : '';
        console.log(`  ${idx + 1}. ${name}${current}`);
        console.log(`     \x1b[90m${systemId}\x1b[0m`);
        if (descr) console.log(`     \x1b[90m${descr.substring(0, 60)}${descr.length > 60 ? '...' : ''}\x1b[0m`);
      });
      console.log('');

      // Create temporary readline for selection
      const selectRl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      selectRl.question('Enter number to load (or press Enter to cancel): ', async (answer) => {
        selectRl.close();

        const num = parseInt(answer.trim(), 10);
        if (isNaN(num) || num < 1 || num > result.records.length) {
          console.log('\x1b[90mCancelled\x1b[0m');
          console.log('');
          mainRl.prompt();
          return;
        }

        const selectedRecord = result.records[num - 1];
        const selectedSystemId = selectedRecord.get('systemId') as string;
        const selectedName = selectedRecord.get('name') as string;

        console.log(`\n📥 Loading ${selectedName}...`);
        ctx.log(`📥 Loading system: ${selectedSystemId}`);

        try {
          // CR-032: Clear AgentDB before loading (prevents duplicates)
          ctx.agentDB.clearForSystemLoad();

          // Load graph data
          const { nodes, edges } = await ctx.neo4jClient.loadGraph({
            workspaceId: ctx.config.workspaceId,
            systemId: selectedSystemId,
          });

          // CR-032: Load into AgentDB (Single Source of Truth)
          for (const node of nodes) {
            ctx.agentDB.setNode(node, { upsert: true });
          }
          for (const edge of edges) {
            ctx.agentDB.setEdge(edge, { upsert: true });
          }

          // Update session
          await updateActiveSystem(ctx.neo4jClient, ctx.config, selectedSystemId);

          // Update WebSocket subscription
          if (ctx.wsClient) {
            ctx.wsClient.updateSubscription(ctx.config.systemId);
          }

          ctx.notifyGraphUpdate();

          console.log(`\x1b[32m✅ Loaded ${nodes.length} nodes, ${edges.length} edges\x1b[0m`);
          ctx.log(`✅ Loaded ${selectedSystemId}: ${nodes.length} nodes, ${edges.length} edges`);
        } catch (loadError) {
          const errorMsg = loadError instanceof Error ? loadError.message : String(loadError);
          console.log(`\x1b[31m❌ Load failed: ${errorMsg}\x1b[0m`);
          ctx.log(`❌ Load failed: ${errorMsg}`);
        }

        console.log('');
        mainRl.prompt();
      });
    } finally {
      await session.close();
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Error listing systems: ${errorMsg}\x1b[0m`);
    ctx.log(`❌ Error listing systems: ${errorMsg}`);
    console.log('');
    mainRl.prompt();
  }
}

/**
 * Handle /export command
 */
export async function handleExportCommand(args: string[], ctx: CommandContext): Promise<void> {
  console.log('📤 Exporting graph...');
  ctx.log('📤 Exporting graph...');
  try {
    const exportState = ctx.graphCanvas.getState();
    const filename = args.length > 0
      ? (args[0].endsWith('.txt') ? args[0] : `${args[0]}.txt`)
      : `${ctx.config.systemId}-${Date.now()}.txt`;
    const filePath = await exportSystem(
      {
        nodes: exportState.nodes,
        edges: exportState.edges,
        ports: exportState.ports,
        systemId: ctx.config.systemId,
        workspaceId: ctx.config.workspaceId,
        version: exportState.version,
        lastSavedVersion: exportState.lastSavedVersion,
        lastModified: exportState.lastModified,
      },
      filename
    );
    console.log(`\x1b[32m✅ Exported to: ${filePath}\x1b[0m`);
    ctx.log(`✅ Exported to: ${filePath}`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.log(`\x1b[31m❌ Export failed: ${errorMsg}\x1b[0m`);
    ctx.log(`❌ Export failed: ${errorMsg}`);
  }
}

/**
 * Handle /import command
 */
export async function handleImportCommand(args: string[], ctx: CommandContext): Promise<void> {
  if (args.length === 0) {
    console.log('\x1b[33m⚠️  Usage: /import <filename>\x1b[0m');
    console.log('\x1b[90m   Use /exports to list available files\x1b[0m');
    return;
  }
  const importFilename = args[0].endsWith('.txt') ? args[0] : `${args[0]}.txt`;
  console.log(`📥 Importing from ${importFilename}...`);
  ctx.log(`📥 Importing from ${importFilename}...`);
  try {
    const importedState = await importSystem(importFilename);

    ctx.agentDB.clearForSystemLoad();
    const nodes = Array.from(importedState.nodes.values());
    const edges = Array.from(importedState.edges.values());
    ctx.agentDB.loadFromState({ nodes, edges });

    const newSystemId = importedState.systemId || ctx.config.systemId;
    await updateActiveSystem(ctx.neo4jClient, ctx.config, newSystemId);

    await ctx.neo4jClient.saveNodes(nodes);
    await ctx.neo4jClient.saveEdges(edges);
    ctx.log(`💾 Imported system persisted to Neo4j: ${ctx.config.systemId}`);

    ctx.notifyGraphUpdate();
    console.log(`\x1b[32m✅ Imported: ${importedState.nodes.size} nodes, ${importedState.edges.size} edges\x1b[0m`);
    ctx.log(`✅ Imported: ${importedState.nodes.size} nodes, ${importedState.edges.size} edges`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.log(`\x1b[31m❌ Import failed: ${errorMsg}\x1b[0m`);
    ctx.log(`❌ Import failed: ${errorMsg}`);
  }
}

/**
 * Handle /exports command - list available export files
 */
export async function handleExportsCommand(ctx: CommandContext): Promise<void> {
  console.log('📁 Available exports:');
  ctx.log('📁 Listing exports');
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
}

/**
 * Handle /stats command
 */
export function handleStatsCommand(ctx: CommandContext): void {
  const state = ctx.graphCanvas.getState();
  console.log('');
  console.log(`Workspace: ${ctx.config.workspaceId}`);
  console.log(`System: ${ctx.config.systemId}`);
  console.log(`Nodes: ${state.nodes.size}`);
  console.log(`Edges: ${state.edges.size}`);
  console.log(`View: ${state.currentView}`);
  console.log('');
  ctx.log(`📊 Stats - Nodes: ${state.nodes.size}, Edges: ${state.edges.size}`);
}

/**
 * Handle /view command
 */
export function handleViewCommand(args: string[], ctx: CommandContext): void {
  const validViews = Object.keys(DEFAULT_VIEW_CONFIGS);
  if (args.length === 0) {
    console.log('\x1b[33mUsage: /view <name>\x1b[0m');
    console.log(`Views: ${validViews.join(', ')}`);
    return;
  }
  const viewName = args[0];
  if (!validViews.includes(viewName)) {
    console.log(`\x1b[33m❌ Invalid view: ${viewName}\x1b[0m`);
    console.log(`Valid views: ${validViews.join(', ')}`);
    return;
  }
  console.log(`🔄 Switching to ${viewName} view...`);
  ctx.log(`🔄 Switching to ${viewName} view`);
  ctx.graphCanvas.setCurrentView(viewName);
  ctx.notifyGraphUpdate();
  console.log('\x1b[32m✅ View updated (check GRAPH terminal)\x1b[0m');
}

/**
 * Print help menu
 */
export function printHelpMenu(): void {
  console.log('');
  console.log('Available commands:');
  console.log('');
  console.log('\x1b[1mSession:\x1b[0m');
  console.log('  /help           - Show this help');
  console.log('  /new            - Start new system (clear graph)');
  console.log('  /load           - List and load systems from Neo4j');
  console.log('  /commit         - Commit changes to Neo4j (resets change indicators)');
  console.log('  /save           - Alias for /commit');
  console.log('  /status         - Show pending changes (git-like diff)');
  console.log('  /stats          - Show graph statistics');
  console.log('  /clear          - Clear chat display');
  console.log('  /exit           - Commit and quit (also: exit, quit)');
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
  console.log('  /cleanup        - Clean nodes not in current system');
  console.log('  /cleanup all    - Clean ALL nodes not in current workspace');
  console.log('');
}
