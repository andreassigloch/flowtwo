/**
 * GraphEngine Terminal Application
 *
 * Main application orchestrating 4-panel tmux UI:
 * - Chat panel: User input/LLM responses
 * - Graph panel: ASCII visualization
 * - View panel: View selector
 * - Stdout panel: Debug logs
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import 'dotenv/config';
import { TmuxManager, TmuxPanel } from './tmux-manager.js';
import { GraphCanvas } from '../canvas/graph-canvas.js';
import { ChatCanvas } from '../canvas/chat-canvas.js';
import { LLMEngine } from '../llm-engine/llm-engine.js';
import { Neo4jClient } from '../neo4j-client/neo4j-client.js';
import { FormatEParser } from '../shared/parsers/format-e-parser.js';
import { GraphEngine } from '../graph-engine/graph-engine.js';
import type { ViewType } from '../shared/types/graph-engine.js';
import type { LLMRequest } from '../shared/types/llm.js';
import * as fs from 'fs';
import * as readline from 'readline';
import { spawn } from 'child_process';
import { FIFO_PATH, LOG_PATH, LLM_TEMPERATURE } from '../shared/config.js';

/**
 * Application Configuration
 */
export interface AppConfig {
  workspaceId: string;
  systemId: string;
  chatId: string;
  userId: string;
  neo4jUri?: string;
  neo4jUser?: string;
  neo4jPassword?: string;
  anthropicApiKey?: string;
}

/**
 * GraphEngine Terminal Application
 */
export class GraphEngineApp {
  private tmux: TmuxManager;
  private graphCanvas: GraphCanvas;
  private chatCanvas: ChatCanvas;
  private llmEngine?: LLMEngine;
  private neo4jClient?: Neo4jClient;
  private graphEngine: GraphEngine;
  private parser: FormatEParser;
  private currentView: ViewType = 'hierarchy';
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
    this.parser = new FormatEParser();

    // Initialize tmux manager
    this.tmux = new TmuxManager({
      sessionName: 'graphengine',
      workingDir: process.cwd(),
      windowName: 'GraphEngine',
    });

    // Initialize Neo4j (if configured)
    if (config.neo4jUri && config.neo4jUser && config.neo4jPassword) {
      this.neo4jClient = new Neo4jClient({
        uri: config.neo4jUri,
        user: config.neo4jUser,
        password: config.neo4jPassword,
      });
    }

    // Initialize canvases
    this.graphCanvas = new GraphCanvas(
      config.workspaceId,
      config.systemId,
      config.chatId,
      config.userId,
      'hierarchy',
      this.neo4jClient
    );

    this.chatCanvas = new ChatCanvas(
      config.workspaceId,
      config.systemId,
      config.chatId,
      config.userId,
      this.graphCanvas,
      this.neo4jClient
    );

    // Initialize LLM Engine (if API key provided)
    if (config.anthropicApiKey) {
      this.llmEngine = new LLMEngine({
        apiKey: config.anthropicApiKey,
        model: 'claude-sonnet-4-5-20250929',
        maxTokens: 4096,
        temperature: LLM_TEMPERATURE,
        enableCache: true,
      });
    }

    // Initialize Graph Engine
    this.graphEngine = new GraphEngine();
  }

  /**
   * Start application
   */
  async start(): Promise<void> {
    console.log('🚀 Starting GraphEngine...');

    // Create tmux session
    console.log('📺 Creating tmux session...');
    await this.tmux.createSession();

    // Setup panels
    await this.setupChatPanel();
    await this.setupGraphPanel();
    await this.setupViewPanel();
    await this.setupStdoutPanel();

    // Load initial state (if exists in Neo4j)
    if (this.neo4jClient) {
      await this.loadGraphFromDatabase();
    }

    // Render initial graph
    await this.renderGraph();

    // Start message processing loop in background
    this.startMessageProcessing();

    console.log('✅ GraphEngine started!');
    console.log('\nAttaching to tmux session...');
    console.log('Use Ctrl+B then arrow keys to navigate between panels');
    console.log('Use Ctrl+B then D to detach');
    console.log('Use "exit" in chat panel to quit\n');

    // Wait a moment for setup to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Attach to session (blocking - transfers control to tmux)
    this.tmux.attachSession();
  }

  /**
   * Start message processing loop (reads from FIFO)
   */
  private startMessageProcessing(): void {
    if (!this.llmEngine) {
      console.warn('⚠️  LLM Engine not configured, messages will not be processed');
      return;
    }

    // Open FIFO for reading (continuously reopen after each message)
    const fifoPath = FIFO_PATH;

    // Process messages from FIFO in background
    const readMessages = async () => {
      while (true) {
        try {
          // Open FIFO for reading (blocks until writer opens)
          const stream = fs.createReadStream(fifoPath, { encoding: 'utf8' });
          const rl = readline.createInterface({
            input: stream,
            crlfDelay: Infinity,
          });

          for await (const line of rl) {
            if (line.trim()) {
              await this.processUserMessage(line.trim());
            }
          }

          // Stream closed by writer, reopen to wait for next message
          stream.close();
        } catch (error) {
          console.error('FIFO read error:', error);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    };

    // Start in background
    readMessages().catch((error) => {
      console.error('Fatal FIFO error:', error);
    });
  }

  /**
   * Process user message through LLM
   */
  private async processUserMessage(message: string): Promise<void> {
    try {
      // Log to STDOUT panel
      await this.logToStdout(`📨 User: ${message}`);

      // Add user message to chat canvas
      await this.chatCanvas.addUserMessage(message);

      // Create LLM request
      const request: LLMRequest = {
        message,
        chatId: this.config.chatId,
        workspaceId: this.config.workspaceId,
        systemId: this.config.systemId,
        userId: this.config.userId,
        canvasState: this.parser.serializeGraph(this.graphCanvas.getState()),
      };

      // Send to LLM
      await this.logToStdout('🤖 Processing with LLM...');
      const response = await this.llmEngine!.processRequest(request);

      // Add assistant response to chat canvas
      await this.chatCanvas.addAssistantMessage(
        response.textResponse,
        response.operations
      );

      // Display response in CHAT panel
      await this.tmux.sendToPanel(
        TmuxPanel.CHAT,
        `echo -e "\\033[0;32mAssistant:\\033[0m ${response.textResponse.replace(/"/g, '\\"')}"`,
        true
      );

      // Update graph visualization if there were operations
      if (response.operations) {
        await this.logToStdout(`📊 Graph updated (${this.graphCanvas.getState().nodes.size} nodes)`);
        await this.renderGraph();
      }

      await this.logToStdout('✅ Response complete');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.logToStdout(`❌ Error: ${errorMsg}`);
      await this.tmux.sendToPanel(
        TmuxPanel.CHAT,
        `echo -e "\\033[0;31mError:\\033[0m ${errorMsg.replace(/"/g, '\\"')}"`,
        true
      );
    }
  }

  /**
   * Log message to STDOUT panel
   */
  private async logToStdout(message: string): Promise<void> {
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const logMsg = `[${timestamp}] ${message}`;

    // Append to log file
    fs.appendFileSync(LOG_PATH, logMsg + '\n');

    // Send to stdout panel
    await this.tmux.sendToPanel(
      TmuxPanel.STDOUT,
      `echo "${logMsg.replace(/"/g, '\\"')}"`,
      true
    );
  }

  /**
   * Setup chat panel (bottom-left)
   */
  private async setupChatPanel(): Promise<void> {
    await this.tmux.clearPanel(TmuxPanel.CHAT);
    await this.tmux.sendToPanel(TmuxPanel.CHAT, '# CHAT PANEL', false);
    await this.tmux.sendToPanel(TmuxPanel.CHAT, '', true);
    await this.tmux.sendToPanel(
      TmuxPanel.CHAT,
      'echo "Welcome to GraphEngine! Type your message and press Enter."',
      true
    );
    await this.tmux.sendToPanel(
      TmuxPanel.CHAT,
      'echo "Commands: /view <name>, /save, /stats, /help, exit"',
      true
    );
    await this.tmux.sendToPanel(
      TmuxPanel.CHAT,
      'echo "Scroll: Ctrl+B then [ (arrows to scroll, q to exit)"',
      true
    );
    await this.tmux.sendToPanel(TmuxPanel.CHAT, 'echo ""', true);

    // Start interactive chat loop in chat panel
    const chatScript = `${process.cwd()}/scripts/chat-loop.sh`;
    await this.tmux.runInPanel(TmuxPanel.CHAT, chatScript);
  }

  /**
   * Setup graph panel (top-right)
   */
  private async setupGraphPanel(): Promise<void> {
    await this.tmux.clearPanel(TmuxPanel.GRAPH);
    await this.tmux.sendToPanel(TmuxPanel.GRAPH, '# GRAPH PANEL', false);
    await this.tmux.sendToPanel(TmuxPanel.GRAPH, '', true);
    await this.tmux.sendToPanel(TmuxPanel.GRAPH, 'echo "Graph visualization (ASCII)"', true);
    await this.tmux.sendToPanel(TmuxPanel.GRAPH, 'echo ""', true);
  }

  /**
   * Setup view panel (bottom-left)
   */
  private async setupViewPanel(): Promise<void> {
    await this.tmux.clearPanel(TmuxPanel.VIEW);
    await this.tmux.sendToPanel(TmuxPanel.VIEW, '# VIEW SELECTOR', false);
    await this.tmux.sendToPanel(TmuxPanel.VIEW, '', true);
    await this.tmux.sendToPanel(TmuxPanel.VIEW, 'echo "Current View: Hierarchy"', true);
    await this.tmux.sendToPanel(TmuxPanel.VIEW, 'echo ""', true);
    await this.tmux.sendToPanel(TmuxPanel.VIEW, 'echo "Available views:"', true);
    await this.tmux.sendToPanel(TmuxPanel.VIEW, 'echo "  1. Hierarchy"', true);
    await this.tmux.sendToPanel(TmuxPanel.VIEW, 'echo "  2. Functional Flow"', true);
    await this.tmux.sendToPanel(TmuxPanel.VIEW, 'echo "  3. Requirements"', true);
    await this.tmux.sendToPanel(TmuxPanel.VIEW, 'echo "  4. Allocation"', true);
    await this.tmux.sendToPanel(TmuxPanel.VIEW, 'echo "  5. Use Case"', true);
    await this.tmux.sendToPanel(TmuxPanel.VIEW, 'echo ""', true);
    await this.tmux.sendToPanel(TmuxPanel.VIEW, 'echo "Type: /view <name>"', true);
  }

  /**
   * Setup stdout panel (bottom-right)
   */
  private async setupStdoutPanel(): Promise<void> {
    await this.tmux.clearPanel(TmuxPanel.STDOUT);
    await this.tmux.sendToPanel(TmuxPanel.STDOUT, '# DEBUG / LOGS', false);
    await this.tmux.sendToPanel(TmuxPanel.STDOUT, '', true);
    await this.tmux.sendToPanel(TmuxPanel.STDOUT, 'echo "Application logs:"', true);
    await this.tmux.sendToPanel(TmuxPanel.STDOUT, 'echo ""', true);

    // Tail application log file
    await this.tmux.runInPanel(TmuxPanel.STDOUT, 'tail', ['-f', LOG_PATH]);
  }

  /**
   * Load graph from Neo4j
   */
  private async loadGraphFromDatabase(): Promise<void> {
    if (!this.neo4jClient) return;

    try {
      const { nodes, edges } = await this.neo4jClient.loadGraph({
        workspaceId: this.config.workspaceId,
        systemId: this.config.systemId,
      });

      if (nodes.length > 0) {
        console.log(`📥 Loaded ${nodes.length} nodes and ${edges.length} edges from Neo4j`);

        // Apply to canvas
        const nodesMap = new Map(nodes.map((n) => [n.semanticId, n]));
        const edgesMap = new Map(edges.map((e) => [e.semanticId, e]));

        await this.graphCanvas.loadGraph({
          nodes: nodesMap,
          edges: edgesMap,
          ports: new Map(),
        });
      }
    } catch (error) {
      console.error('Failed to load graph from Neo4j:', error);
    }
  }

  /**
   * Render graph to graph panel
   */
  private async renderGraph(): Promise<void> {
    const state = this.graphCanvas.getState();

    // Compute layout
    const layout = await this.graphEngine.computeLayout(
      {
        nodes: state.nodes,
        edges: state.edges,
        ports: state.ports,
      },
      this.currentView
    );

    // Generate ASCII visualization
    const ascii = this.generateAsciiGraph(layout);

    // Send to graph panel
    await this.tmux.clearPanel(TmuxPanel.GRAPH);
    await this.tmux.sendToPanel(TmuxPanel.GRAPH, `echo "${ascii}"`, true);
  }

  /**
   * Generate ASCII graph visualization
   */
  private generateAsciiGraph(layout: any): string {
    const state = this.graphCanvas.getState();
    const lines: string[] = [];

    lines.push(`Graph: ${this.config.systemId}`);
    lines.push(`View: ${this.currentView}`);
    lines.push(`Nodes: ${state.nodes.size}, Edges: ${state.edges.size}`);
    lines.push('');

    // Simple tree visualization
    for (const [id, node] of state.nodes) {
      const pos = layout.positions.get(id);
      const indent = pos ? ' '.repeat(Math.max(0, Math.floor(pos.x / 10))) : '';
      lines.push(`${indent}[${node.type}] ${node.name}`);

      // Show outgoing edges
      const outEdges = Array.from(state.edges.values()).filter((e) => e.sourceId === id);
      for (const edge of outEdges) {
        const target = state.nodes.get(edge.targetId);
        if (target) {
          lines.push(`${indent}  └─${edge.type}→ ${target.name}`);
        }
      }
    }

    return lines.join('\\n');
  }

  /**
   * Stop application
   */
  async stop(): Promise<void> {
    console.log('🛑 Stopping GraphEngine...');

    // Save state to Neo4j
    if (this.neo4jClient) {
      await this.graphCanvas.persistToNeo4j();
      await this.chatCanvas.persistToNeo4j();
      await this.neo4jClient.close();
    }

    // Kill tmux session
    await this.tmux.killSession();

    console.log('✅ GraphEngine stopped');
  }
}

/**
 * Main entry point
 */
async function main() {
  const config: AppConfig = {
    workspaceId: 'demo-workspace',
    systemId: 'UrbanMobility.SY.001',
    chatId: 'demo-chat-001',
    userId: 'andreas@siglochconsulting',
    neo4jUri: process.env.NEO4J_URI,
    neo4jUser: process.env.NEO4J_USER,
    neo4jPassword: process.env.NEO4J_PASSWORD,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  };

  const app = new GraphEngineApp(config);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    await app.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await app.stop();
    process.exit(0);
  });

  await app.start();
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
