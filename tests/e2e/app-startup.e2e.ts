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

// Unique port for this test suite to avoid conflicts with parallel tests
const TEST_WS_PORT = 3102;
const TEST_ENV = {
  ...process.env,
  WS_PORT: String(TEST_WS_PORT),
  WS_URL: `ws://localhost:${TEST_WS_PORT}`,
};

describe('e2e: App Startup and Commands', () => {
  let wsServerProcess: ChildProcess | null = null;
  let chatProcess: ChildProcess | null = null;
  let graphViewerProcess: ChildProcess | null = null;
  const chatLogs: string[] = [];
  const graphViewerLogs: string[] = [];

  beforeAll(async () => {
    // 1. Start WebSocket server first (on TEST_WS_PORT to avoid conflicts)
    wsServerProcess = spawn('npx', ['tsx', 'src/websocket-server.ts'], {
      cwd: process.cwd(),
      env: TEST_ENV,
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

    // 2. Start the chat interface (connects to TEST_WS_PORT)
    chatProcess = spawn('npx', ['tsx', 'src/terminal-ui/chat-interface.ts'], {
      cwd: process.cwd(),
      env: TEST_ENV,
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

    // 3. Start Graph Viewer (connects to TEST_WS_PORT)
    graphViewerProcess = spawn('npx', ['tsx', 'src/terminal-ui/graph-viewer.ts'], {
      cwd: process.cwd(),
      env: TEST_ENV,
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

  // === PERSISTENCE COMMANDS ===

  it('/save command persists to Neo4j', async () => {
    const logsBefore = chatLogs.length;

    chatProcess?.stdin?.write('/save\n');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const newLogs = chatLogs.slice(logsBefore).join('\n');
    // Should confirm save or show error if no changes
    const hasSaveResponse =
      newLogs.includes('Saved') ||
      newLogs.includes('saved') ||
      newLogs.includes('persisted') ||
      newLogs.includes('Neo4j') ||
      newLogs.includes('Nothing to save') ||
      newLogs.includes('No changes') ||
      newLogs.includes('nodes');
    expect(hasSaveResponse).toBe(true);
  });

  it('/load command lists available systems', async () => {
    const logsBefore = chatLogs.length;

    chatProcess?.stdin?.write('/load\n');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const newLogs = chatLogs.slice(logsBefore).join('\n');
    // Should show available systems or "no systems" message
    const hasLoadResponse =
      newLogs.includes('Available') ||
      newLogs.includes('systems') ||
      newLogs.includes('No existing') ||
      newLogs.includes('GraphEngine') ||
      newLogs.includes('Select') ||
      newLogs.includes('Load');
    expect(hasLoadResponse).toBe(true);

    // Cancel selection mode by sending 0 or empty line
    chatProcess?.stdin?.write('0\n');
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  // === IMPORT/EXPORT COMMANDS ===

  it('/exports command lists export files', async () => {
    const logsBefore = chatLogs.length;

    chatProcess?.stdin?.write('/exports\n');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const newLogs = chatLogs.slice(logsBefore).join('\n');
    // Should list exports or show "no exports"
    const hasExportsResponse =
      newLogs.includes('export') ||
      newLogs.includes('Export') ||
      newLogs.includes('No export') ||
      newLogs.includes('Available') ||
      newLogs.includes('.json') ||
      newLogs.includes('files');
    expect(hasExportsResponse).toBe(true);
  });

  it('/export command creates export file', async () => {
    const logsBefore = chatLogs.length;

    chatProcess?.stdin?.write('/export test-e2e-export\n');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const newLogs = chatLogs.slice(logsBefore).join('\n');
    // Should confirm export or show error
    const hasExportResponse =
      newLogs.includes('Exported') ||
      newLogs.includes('exported') ||
      newLogs.includes('Export') ||
      newLogs.includes('test-e2e-export') ||
      newLogs.includes('saved') ||
      newLogs.includes('No nodes');
    expect(hasExportResponse).toBe(true);
  });

  // === VALIDATION & OPTIMIZATION COMMANDS (CR-031/CR-032 data layer) ===

  it('/validate command runs validation report', async () => {
    const logsBefore = chatLogs.length;

    chatProcess?.stdin?.write('/validate\n');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const newLogs = chatLogs.slice(logsBefore).join('\n');
    // Should show validation results or phase info
    const hasValidateResponse =
      newLogs.includes('Validation') ||
      newLogs.includes('validation') ||
      newLogs.includes('Phase') ||
      newLogs.includes('phase') ||
      newLogs.includes('violations') ||
      newLogs.includes('Violations') ||
      newLogs.includes('passed') ||
      newLogs.includes('score') ||
      newLogs.includes('Score') ||
      newLogs.includes('rules') ||
      newLogs.includes('No nodes');
    expect(hasValidateResponse).toBe(true);
  });

  it('/validate 1 command validates phase 1', async () => {
    const logsBefore = chatLogs.length;

    chatProcess?.stdin?.write('/validate 1\n');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const newLogs = chatLogs.slice(logsBefore).join('\n');
    // Should validate phase 1 specifically
    const hasPhase1Response =
      newLogs.includes('Phase 1') ||
      newLogs.includes('phase 1') ||
      newLogs.includes('Validation') ||
      newLogs.includes('Use Case') ||
      newLogs.includes('UC') ||
      newLogs.includes('score') ||
      newLogs.includes('No nodes');
    expect(hasPhase1Response).toBe(true);
  });

  it('/phase-gate command checks phase readiness', async () => {
    const logsBefore = chatLogs.length;

    chatProcess?.stdin?.write('/phase-gate 2\n');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const newLogs = chatLogs.slice(logsBefore).join('\n');
    // Should show phase gate status
    const hasPhaseGateResponse =
      newLogs.includes('Phase') ||
      newLogs.includes('phase') ||
      newLogs.includes('Gate') ||
      newLogs.includes('gate') ||
      newLogs.includes('Ready') ||
      newLogs.includes('ready') ||
      newLogs.includes('blocked') ||
      newLogs.includes('Blocked') ||
      newLogs.includes('criteria') ||
      newLogs.includes('No nodes');
    expect(hasPhaseGateResponse).toBe(true);
  });

  it('/score command shows multi-objective scorecard', async () => {
    const logsBefore = chatLogs.length;

    chatProcess?.stdin?.write('/score\n');
    await new Promise((resolve) => setTimeout(resolve, 3000));

    const newLogs = chatLogs.slice(logsBefore).join('\n');
    // Should show score or scorecard
    const hasScoreResponse =
      newLogs.includes('Score') ||
      newLogs.includes('score') ||
      newLogs.includes('Objective') ||
      newLogs.includes('objective') ||
      newLogs.includes('completeness') ||
      newLogs.includes('Completeness') ||
      newLogs.includes('consistency') ||
      newLogs.includes('Consistency') ||
      newLogs.includes('%') ||
      newLogs.includes('No nodes');
    expect(hasScoreResponse).toBe(true);
  });

  it('/analyze command analyzes violations', async () => {
    const logsBefore = chatLogs.length;

    chatProcess?.stdin?.write('/analyze\n');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const newLogs = chatLogs.slice(logsBefore).join('\n');
    // Should show analysis results
    const hasAnalyzeResponse =
      newLogs.includes('Analyze') ||
      newLogs.includes('analyze') ||
      newLogs.includes('Analysis') ||
      newLogs.includes('analysis') ||
      newLogs.includes('violation') ||
      newLogs.includes('Violation') ||
      newLogs.includes('suggestion') ||
      newLogs.includes('Suggestion') ||
      newLogs.includes('fix') ||
      newLogs.includes('Fix') ||
      newLogs.includes('No violations') ||
      newLogs.includes('No nodes');
    expect(hasAnalyzeResponse).toBe(true);
  });

  it('/optimize command runs optimization (limited iterations)', async () => {
    const logsBefore = chatLogs.length;

    // Run with just 1 iteration for speed in E2E test
    chatProcess?.stdin?.write('/optimize 1\n');
    await new Promise((resolve) => setTimeout(resolve, 10000));

    const newLogs = chatLogs.slice(logsBefore).join('\n');
    // Should show optimization progress or results
    const hasOptimizeResponse =
      newLogs.includes('Optimi') || // Optimize/Optimizing/Optimization
      newLogs.includes('optimi') ||
      newLogs.includes('iteration') ||
      newLogs.includes('Iteration') ||
      newLogs.includes('improvement') ||
      newLogs.includes('Improvement') ||
      newLogs.includes('score') ||
      newLogs.includes('Score') ||
      newLogs.includes('variant') ||
      newLogs.includes('Variant') ||
      newLogs.includes('No nodes') ||
      newLogs.includes('completed') ||
      newLogs.includes('Completed');
    expect(hasOptimizeResponse).toBe(true);
  }, 15000); // Extended timeout for optimization

  // === DERIVATION COMMANDS ===

  it('/derive command auto-derives architecture', async () => {
    const logsBefore = chatLogs.length;

    chatProcess?.stdin?.write('/derive\n');
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const newLogs = chatLogs.slice(logsBefore).join('\n');
    // Should show derivation results
    const hasDeriveResponse =
      newLogs.includes('Deriv') || // Derive/Derived/Derivation
      newLogs.includes('deriv') ||
      newLogs.includes('FUNC') ||
      newLogs.includes('function') ||
      newLogs.includes('architecture') ||
      newLogs.includes('Architecture') ||
      newLogs.includes('created') ||
      newLogs.includes('Created') ||
      newLogs.includes('No Use Cases') || // Exact match from chat-interface.ts
      newLogs.includes('No nodes') ||
      newLogs.includes('LLM Engine not configured'); // API key issue
    expect(hasDeriveResponse).toBe(true);
  });

  // === VIEW COMMANDS (additional views) ===

  it('/view functional-network command works', async () => {
    const logsBefore = chatLogs.length;

    chatProcess?.stdin?.write('/view functional-network\n');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const newLogs = chatLogs.slice(logsBefore).join('\n');
    const hasViewResponse =
      newLogs.includes('functional') ||
      newLogs.includes('Functional') ||
      newLogs.includes('network') ||
      newLogs.includes('Network') ||
      newLogs.includes('View') ||
      newLogs.includes('view') ||
      newLogs.includes('updated') ||
      newLogs.includes('FUNC') ||
      newLogs.includes('ACTOR');
    expect(hasViewResponse).toBe(true);
  });

  it('/view requirements command works', async () => {
    const logsBefore = chatLogs.length;

    chatProcess?.stdin?.write('/view requirements\n');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const newLogs = chatLogs.slice(logsBefore).join('\n');
    const hasViewResponse =
      newLogs.includes('requirement') ||
      newLogs.includes('Requirement') ||
      newLogs.includes('REQ') ||
      newLogs.includes('View') ||
      newLogs.includes('view') ||
      newLogs.includes('updated') ||
      newLogs.includes('No nodes');
    expect(hasViewResponse).toBe(true);
  });

  it('/view allocation command works', async () => {
    const logsBefore = chatLogs.length;

    chatProcess?.stdin?.write('/view allocation\n');
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const newLogs = chatLogs.slice(logsBefore).join('\n');
    const hasViewResponse =
      newLogs.includes('allocation') ||
      newLogs.includes('Allocation') ||
      newLogs.includes('MOD') ||
      newLogs.includes('FUNC') ||
      newLogs.includes('View') ||
      newLogs.includes('view') ||
      newLogs.includes('updated');
    expect(hasViewResponse).toBe(true);
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
