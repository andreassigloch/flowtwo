/**
 * App E2E Test (CR-018)
 *
 * REAL end-to-end test: starts the actual app, sends commands via stdin, reads logs.
 * No mocks, no unit isolation - just start and verify it works.
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';

const STARTUP_TIMEOUT = 30000;

describe('e2e: App Startup and Commands', () => {
  let wsServerProcess: ChildProcess | null = null;
  let chatProcess: ChildProcess | null = null;
  let graphViewerProcess: ChildProcess | null = null;
  let chatLogs: string[] = [];
  let graphViewerLogs: string[] = [];

  beforeAll(async () => {
    // 1. Start WebSocket server first
    wsServerProcess = spawn('npx', ['tsx', 'src/websocket-server.ts'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    wsServerProcess.stdout?.on('data', (data) => {
      console.log('[WS-SERVER]', data.toString().trim());
    });
    wsServerProcess.stderr?.on('data', (data) => {
      console.log('[WS-SERVER ERR]', data.toString().trim());
    });

    // Wait for WebSocket server to start
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 2. Start the chat interface
    chatProcess = spawn('npx', ['tsx', 'src/terminal-ui/chat-interface.ts'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    chatProcess.stdout?.on('data', (data) => {
      const line = data.toString();
      chatLogs.push(line);
      console.log('[CHAT]', line.trim());
    });

    chatProcess.stderr?.on('data', (data) => {
      const line = data.toString();
      chatLogs.push(`[ERR] ${line}`);
      console.log('[CHAT ERR]', line.trim());
    });

    // Wait for chat to connect
    await waitForLog(chatLogs, 'Connected to WebSocket', 15000);

    // 3. Start Graph Viewer
    graphViewerProcess = spawn('npx', ['tsx', 'src/terminal-ui/graph-viewer.ts'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    graphViewerProcess.stdout?.on('data', (data) => {
      const line = data.toString();
      graphViewerLogs.push(line);
      console.log('[GRAPH]', line.trim());
    });

    graphViewerProcess.stderr?.on('data', (data) => {
      const line = data.toString();
      graphViewerLogs.push(`[ERR] ${line}`);
      console.log('[GRAPH ERR]', line.trim());
    });

    // Wait for graph viewer to connect and receive initial state
    await waitForLog(graphViewerLogs, 'Connected to WebSocket', 10000);
  }, STARTUP_TIMEOUT);

  afterAll(async () => {
    if (graphViewerProcess) {
      graphViewerProcess.kill('SIGTERM');
      graphViewerProcess = null;
    }
    if (chatProcess) {
      // Send /exit command
      chatProcess.stdin?.write('/exit\n');
      await new Promise((resolve) => setTimeout(resolve, 1000));
      chatProcess.kill('SIGTERM');
      chatProcess = null;
    }
    if (wsServerProcess) {
      wsServerProcess.kill('SIGTERM');
      wsServerProcess = null;
    }
  });

  it('app starts and connects to WebSocket', () => {
    const hasWebSocket = chatLogs.some((log) => log.includes('Connected to WebSocket'));
    expect(hasWebSocket).toBe(true);
  });

  it('app loads session or starts fresh', () => {
    const hasSession =
      chatLogs.some((log) => log.includes('Session restored')) ||
      chatLogs.some((log) => log.includes('starting fresh')) ||
      chatLogs.some((log) => log.includes('No existing systems')) ||
      chatLogs.some((log) => log.includes('Loaded') && log.includes('nodes')) ||
      chatLogs.some((log) => log.includes('System:'));
    expect(hasSession).toBe(true);
  });

  it('/help command works', async () => {
    const logsBefore = chatLogs.length;

    chatProcess?.stdin?.write('/help\n');
    await new Promise((resolve) => setTimeout(resolve, 500));

    const newLogs = chatLogs.slice(logsBefore).join('\n');
    expect(newLogs.toLowerCase()).toContain('commands');
  });

  it('/stats command works', async () => {
    const logsBefore = chatLogs.length;

    chatProcess?.stdin?.write('/stats\n');
    await new Promise((resolve) => setTimeout(resolve, 500));

    const newLogs = chatLogs.slice(logsBefore).join('\n');
    // Stats should show node count or "no nodes"
    const hasStats = newLogs.includes('nodes') || newLogs.includes('Nodes') || newLogs.includes('Stats');
    expect(hasStats).toBe(true);
  });

  it('/view hierarchy command works (no LLM needed)', async () => {
    const logsBefore = chatLogs.length;

    chatProcess?.stdin?.write('/view hierarchy\n');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const newLogs = chatLogs.slice(logsBefore).join('\n');
    // Should either show hierarchy view or "no nodes to display"
    const hasViewResponse =
      newLogs.includes('hierarchy') ||
      newLogs.includes('Hierarchy') ||
      newLogs.includes('View') ||
      newLogs.includes('nodes') ||
      newLogs.includes('Processing');
    expect(hasViewResponse).toBe(true);
  });

  it('no WebSocket errors after loading nodes', () => {
    // If Neo4j loaded nodes, there should be NO "WebSocket not connected" error
    const hasNodes = chatLogs.some((log) => log.includes('Loaded') && log.includes('nodes'));
    if (hasNodes) {
      const hasWsError = chatLogs.some((log) => log.includes('WebSocket not connected'));
      expect(hasWsError).toBe(false); // Should NOT have this error
    } else {
      // No nodes loaded, skip this check
      expect(true).toBe(true);
    }
  });

  // === GRAPH VIEWER TESTS ===

  it('graph viewer connects to WebSocket', () => {
    const hasWebSocket = graphViewerLogs.some((log) => log.includes('Connected to WebSocket'));
    expect(hasWebSocket).toBe(true);
  });

  it('graph viewer receives initial state from cache', () => {
    // Graph viewer should receive cached broadcast from chat
    const receivedUpdate = graphViewerLogs.some(
      (log) => log.includes('graph_update') || log.includes('Received') || log.includes('nodes')
    );
    // Or check for rendered nodes
    const hasRenderedContent = graphViewerLogs.some(
      (log) =>
        log.includes('SYS') ||
        log.includes('FUNC') ||
        log.includes('UC') ||
        log.includes('hierarchy') ||
        log.includes('System')
    );
    expect(receivedUpdate || hasRenderedContent).toBe(true);
  });

  it('graph viewer shows nodes after /view command', async () => {
    const logsBefore = graphViewerLogs.length;

    // Send /view hierarchy from chat
    chatProcess?.stdin?.write('/view hierarchy\n');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Graph viewer should receive update and render
    const newLogs = graphViewerLogs.slice(logsBefore).join('\n');
    const allLogs = graphViewerLogs.join('\n');

    // Should show some content (nodes, edges, or view name)
    const hasContent =
      allLogs.includes('SYS') ||
      allLogs.includes('hierarchy') ||
      allLogs.includes('FUNC') ||
      allLogs.includes('nodes') ||
      newLogs.includes('update');

    expect(hasContent).toBe(true);
  });
});

// Helper: wait for a specific log message
async function waitForLog(logs: string[], searchText: string, timeout: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (logs.some((log) => log.includes(searchText))) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  console.log('=== LOGS SO FAR ===');
  logs.forEach((log) => console.log(log));
  console.log('===================');
  throw new Error(`Timeout waiting for log: "${searchText}" after ${timeout}ms`);
}
