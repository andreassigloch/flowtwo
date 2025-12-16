/**
 * AppTestHelper - E2E Test Helper for Terminal App (CR-042)
 *
 * Provides process management for spawning WebSocket server,
 * chat-interface, and graph-viewer processes.
 *
 * @author andreas@siglochconsulting
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

/**
 * Test environment configuration.
 * Uses separate resources to avoid conflicts with development instance.
 *
 * Isolation strategy:
 * - WS_PORT: 3099 (dev uses 3002)
 * - Workspace: test-workspace (dev uses demo-workspace) - Neo4j data isolated by workspace
 * - AgentDB: Separate SQLite file (./data/test-agentdb.db)
 *
 * Neo4j Community doesn't support multiple databases, so we isolate via workspaceId.
 * All test data uses workspaceId='test-workspace' and won't interfere with dev data.
 */
const TEST_WS_PORT = 3099;
const TEST_AGENTDB_PATH = './data/test-agentdb.db';
const TEST_WORKSPACE_ID = 'test-workspace';
const TEST_ENV = {
  ...process.env,
  WS_PORT: String(TEST_WS_PORT),
  WS_URL: `ws://localhost:${TEST_WS_PORT}`,
  NODE_ENV: 'test',
  // Separate AgentDB SQLite file for tests
  AGENTDB_BACKEND: 'agentdb',
  AGENTDB_URL: TEST_AGENTDB_PATH,
  // Isolated workspace (Neo4j data isolated by this workspaceId)
  WORKSPACE_ID: TEST_WORKSPACE_ID,
};

export interface AppStats {
  nodes: number;
  edges: number;
  systemId?: string;
}

export interface ProcessHandles {
  wsServer: ChildProcess | null;
  chat: ChildProcess | null;
  graphViewer: ChildProcess | null;
  stdout: ChildProcess | null;
}

/**
 * Helper class for E2E testing the GraphEngine terminal app.
 * Manages process lifecycle and provides command/output helpers.
 */
export class AppTestHelper {
  private wsServer: ChildProcess | null = null;
  private chatProcess: ChildProcess | null = null;
  private graphViewer: ChildProcess | null = null;
  private stdoutProcess: ChildProcess | null = null;

  private chatLogs: string[] = [];
  private graphViewerLogs: string[] = [];
  private wsServerLogs: string[] = [];

  /**
   * Start the full app stack (WebSocket server, chat interface, graph viewer).
   */
  async startApp(): Promise<void> {
    // 1. Start WebSocket server on TEST_WS_PORT (3099) to avoid conflict with dev (3001)
    this.wsServer = spawn('npx', ['tsx', 'src/websocket-server.ts'], {
      cwd: PROJECT_ROOT,
      env: TEST_ENV,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.wsServer.stdout?.on('data', (data) => {
      this.wsServerLogs.push(data.toString());
    });
    this.wsServer.stderr?.on('data', (data) => {
      this.wsServerLogs.push(data.toString());
    });

    // Wait for WebSocket server to initialize
    await this.sleep(1500);

    // 2. Start chat interface (connects to TEST_WS_PORT)
    this.chatProcess = spawn('npx', ['tsx', 'src/terminal-ui/chat-interface.ts'], {
      cwd: PROJECT_ROOT,
      env: TEST_ENV,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.chatProcess.stdout?.on('data', (data) => {
      this.chatLogs.push(data.toString());
    });
    this.chatProcess.stderr?.on('data', (data) => {
      this.chatLogs.push(`[ERR] ${data.toString()}`);
    });

    // 3. Start graph viewer (connects to TEST_WS_PORT)
    this.graphViewer = spawn('npx', ['tsx', 'src/terminal-ui/graph-viewer.ts'], {
      cwd: PROJECT_ROOT,
      env: TEST_ENV,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.graphViewer.stdout?.on('data', (data) => {
      this.graphViewerLogs.push(data.toString());
    });
    this.graphViewer.stderr?.on('data', (data) => {
      this.graphViewerLogs.push(`[ERR] ${data.toString()}`);
    });
  }

  /**
   * Wait for the app to be ready (components initialized).
   * CR-063: Updated to detect SessionManager initialization pattern.
   */
  async waitForReady(timeout: number = 20000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      // CR-063: New pattern - SessionManager outputs this when all components ready
      const chatReady = this.chatLogs.some((log) =>
        log.includes('All components initialized via SessionManager') ||
        log.includes('Connected to WebSocket')  // Legacy fallback
      );
      const graphConnected = this.graphViewerLogs.some((log) => log.includes('Connected to WebSocket'));

      if (chatReady && graphConnected) {
        return;
      }
      await this.sleep(100);
    }
    throw new Error(`App not ready after ${timeout}ms. Chat logs: ${this.chatLogs.slice(-5).join('\n')}`);
  }

  private logCheckpoint: number = 0;

  /**
   * Send a command to the chat interface.
   */
  async sendCommand(cmd: string): Promise<void> {
    if (!this.chatProcess?.stdin) {
      throw new Error('Chat process not started');
    }
    // Record position before sending command
    this.logCheckpoint = this.chatLogs.length;
    this.chatProcess.stdin.write(cmd + '\n');
    await this.sleep(500); // Allow command to propagate
  }

  /**
   * Wait for and verify output matches a pattern.
   * Checks logs from the checkpoint set when sendCommand was called.
   */
  async expectOutput(pattern: RegExp, timeout: number = 10000): Promise<string> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const recentLogs = this.chatLogs.slice(this.logCheckpoint).join('\n');
      if (pattern.test(recentLogs)) {
        return recentLogs;
      }
      await this.sleep(100);
    }

    const allLogs = this.chatLogs.slice(this.logCheckpoint).join('\n');
    throw new Error(`Pattern ${pattern} not found in output after ${timeout}ms. Got: ${allLogs.slice(-500)}`);
  }

  /**
   * Wait for output in graph viewer.
   */
  async expectGraphViewerOutput(pattern: RegExp, timeout: number = 5000): Promise<string> {
    const start = Date.now();
    const startIdx = this.graphViewerLogs.length;

    while (Date.now() - start < timeout) {
      const recentLogs = this.graphViewerLogs.slice(startIdx).join('\n');
      if (pattern.test(recentLogs)) {
        return recentLogs;
      }
      await this.sleep(100);
    }

    const allLogs = this.graphViewerLogs.slice(startIdx).join('\n');
    throw new Error(`Pattern ${pattern} not found in graph viewer after ${timeout}ms. Got: ${allLogs.slice(-500)}`);
  }

  /**
   * Parse node count from /stats output.
   */
  parseNodeCount(): number {
    const allLogs = this.chatLogs.join('\n');
    const match = allLogs.match(/Nodes?:\s*(\d+)/i) || allLogs.match(/(\d+)\s*nodes?/i);
    if (match) {
      return parseInt(match[1], 10);
    }
    return 0;
  }

  /**
   * Parse stats from /stats output.
   */
  parseStats(): AppStats {
    const allLogs = this.chatLogs.join('\n');

    const nodeMatch = allLogs.match(/Nodes?:\s*(\d+)/i) || allLogs.match(/(\d+)\s*nodes?/i);
    const edgeMatch = allLogs.match(/Edges?:\s*(\d+)/i) || allLogs.match(/(\d+)\s*edges?/i);
    const systemMatch = allLogs.match(/System:\s*(\S+)/i) || allLogs.match(/systemId:\s*(\S+)/i);

    return {
      nodes: nodeMatch ? parseInt(nodeMatch[1], 10) : 0,
      edges: edgeMatch ? parseInt(edgeMatch[1], 10) : 0,
      systemId: systemMatch ? systemMatch[1] : undefined,
    };
  }

  /**
   * Get all chat logs.
   */
  getChatLogs(): string[] {
    return [...this.chatLogs];
  }

  /**
   * Get all graph viewer logs.
   */
  getGraphViewerLogs(): string[] {
    return [...this.graphViewerLogs];
  }

  /**
   * Clear collected logs (useful between test steps).
   */
  clearLogs(): void {
    this.chatLogs = [];
    this.graphViewerLogs = [];
  }

  /**
   * Wait for graceful exit of the app.
   */
  async waitForExit(timeout: number = 5000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (!this.chatProcess || this.chatProcess.exitCode !== null) {
        return;
      }
      await this.sleep(100);
    }
    // Force kill if not exited
    this.chatProcess?.kill('SIGTERM');
  }

  /**
   * Stop all processes gracefully.
   */
  async stop(): Promise<void> {
    // Send /exit command first
    if (this.chatProcess?.stdin) {
      this.chatProcess.stdin.write('/exit\n');
      await this.sleep(1000);
    }

    // Kill processes
    if (this.graphViewer) {
      this.graphViewer.kill('SIGTERM');
      this.graphViewer = null;
    }
    if (this.chatProcess) {
      this.chatProcess.kill('SIGTERM');
      this.chatProcess = null;
    }
    if (this.stdoutProcess) {
      this.stdoutProcess.kill('SIGTERM');
      this.stdoutProcess = null;
    }
    if (this.wsServer) {
      this.wsServer.kill('SIGTERM');
      this.wsServer = null;
    }

    // Wait for cleanup
    await this.sleep(500);
  }

  /**
   * Kill a specific process (e.g., WebSocket server for crash testing).
   */
  killProcess(name: 'wsServer' | 'chat' | 'graphViewer'): void {
    switch (name) {
      case 'wsServer':
        this.wsServer?.kill('SIGKILL');
        this.wsServer = null;
        break;
      case 'chat':
        this.chatProcess?.kill('SIGKILL');
        this.chatProcess = null;
        break;
      case 'graphViewer':
        this.graphViewer?.kill('SIGKILL');
        this.graphViewer = null;
        break;
    }
  }

  /**
   * Restart WebSocket server (for crash recovery tests).
   */
  async restartWsServer(): Promise<void> {
    this.wsServer = spawn('npx', ['tsx', 'src/websocket-server.ts'], {
      cwd: PROJECT_ROOT,
      env: TEST_ENV,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.wsServer.stdout?.on('data', (data) => {
      this.wsServerLogs.push(data.toString());
    });
    this.wsServer.stderr?.on('data', (data) => {
      this.wsServerLogs.push(data.toString());
    });

    await this.sleep(1500);
  }

  /**
   * Get process handles for advanced tests.
   */
  getProcessHandles(): ProcessHandles {
    return {
      wsServer: this.wsServer,
      chat: this.chatProcess,
      graphViewer: this.graphViewer,
      stdout: this.stdoutProcess,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Start all terminal processes and return handles.
 * Convenience function for multi-terminal tests.
 */
export async function startAllTerminals(): Promise<{
  helper: AppTestHelper;
  wsServer: ChildProcess | null;
  chat: ChildProcess | null;
  graphViewer: ChildProcess | null;
}> {
  const helper = new AppTestHelper();
  await helper.startApp();
  await helper.waitForReady();

  const handles = helper.getProcessHandles();
  return {
    helper,
    wsServer: handles.wsServer,
    chat: handles.chat,
    graphViewer: handles.graphViewer,
  };
}
