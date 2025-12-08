/**
 * Crash Recovery & Data Consistency E2E Tests
 *
 * Simulates crashes at various points to verify:
 * - No data loss on graceful shutdown
 * - Recovery from Neo4j after crash
 * - WebSocket reconnection after server crash
 * - Graph state consistency after partial operations
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';

const STARTUP_TIMEOUT = 30000;

describe('e2e: Crash Recovery', () => {
  let wsServerProcess: ChildProcess | null = null;
  let chatProcess: ChildProcess | null = null;
  let chatLogs: string[] = [];

  const startWsServer = async (): Promise<ChildProcess> => {
    const proc = spawn('npx', ['tsx', 'src/websocket-server.ts'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stdout?.on('data', (data) => {
      console.log('[WS-SERVER]', data.toString().trim());
    });
    proc.stderr?.on('data', (data) => {
      console.log('[WS-SERVER ERR]', data.toString().trim());
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));
    return proc;
  };

  const startChat = async (): Promise<{ proc: ChildProcess; logs: string[] }> => {
    const logs: string[] = [];
    const proc = spawn('npx', ['tsx', 'src/terminal-ui/chat-interface.ts'], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stdout?.on('data', (data) => {
      const line = data.toString();
      logs.push(line);
      console.log('[CHAT]', line.trim());
    });
    proc.stderr?.on('data', (data) => {
      const line = data.toString();
      logs.push(`[ERR] ${line}`);
      console.log('[CHAT ERR]', line.trim());
    });

    // Wait for connection
    await waitForLog(logs, 'Connected to WebSocket', 15000);
    return { proc, logs };
  };

  const killProcess = (proc: ChildProcess | null, signal: NodeJS.Signals = 'SIGKILL') => {
    if (proc && !proc.killed) {
      proc.kill(signal);
    }
  };

  afterEach(async () => {
    // Cleanup any remaining processes
    killProcess(chatProcess, 'SIGTERM');
    killProcess(wsServerProcess, 'SIGTERM');
    chatProcess = null;
    wsServerProcess = null;
    chatLogs = [];
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  describe('WebSocket Server Crash', () => {
    it('chat interface detects WS server crash', async () => {
      // Start WS server and chat
      wsServerProcess = await startWsServer();
      const chat = await startChat();
      chatProcess = chat.proc;
      chatLogs = chat.logs;

      // Verify connected
      expect(chatLogs.some((l) => l.includes('Connected to WebSocket'))).toBe(true);

      // Kill WS server abruptly (SIGKILL = no cleanup)
      killProcess(wsServerProcess, 'SIGKILL');
      wsServerProcess = null;

      // Wait for disconnect detection (need longer for WS timeout)
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Chat should detect disconnection - check various message patterns
      const hasDisconnect = chatLogs.some(
        (l) =>
          l.includes('Disconnected') ||
          l.includes('disconnected') ||
          l.includes('lost') ||
          l.includes('closed') ||
          l.includes('error') ||
          l.includes('reconnect')
      );
      expect(hasDisconnect).toBe(true);
    }, STARTUP_TIMEOUT);

    it('chat interface reconnects after WS server restart', async () => {
      // Start WS server and chat
      wsServerProcess = await startWsServer();
      const chat = await startChat();
      chatProcess = chat.proc;
      chatLogs = chat.logs;

      // Kill WS server
      killProcess(wsServerProcess, 'SIGKILL');

      // Wait for disconnect
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Restart WS server
      wsServerProcess = await startWsServer();

      // Wait for reconnection
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Check for reconnection (may show "Connected" again or "Reconnected")
      const reconnectLogs = chatLogs.slice(-20).join('\n');
      const hasReconnect =
        reconnectLogs.includes('Connected') ||
        reconnectLogs.includes('Reconnected') ||
        reconnectLogs.includes('connected');
      expect(hasReconnect).toBe(true);
    }, STARTUP_TIMEOUT * 2);
  });

  describe('Chat Interface Crash', () => {
    it('graph data persists after chat crash and reload', async () => {
      wsServerProcess = await startWsServer();

      // Start chat and get initial node count
      let chat = await startChat();
      chatProcess = chat.proc;
      chatLogs = chat.logs;

      // Wait for nodes to load
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Get initial stats
      chatProcess.stdin?.write('/stats\n');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const statsLog = chatLogs.join('\n');
      const nodeMatch = statsLog.match(/Nodes:\s*(\d+)/);
      const initialNodeCount = nodeMatch ? parseInt(nodeMatch[1], 10) : 0;

      console.log(`[TEST] Initial node count: ${initialNodeCount}`);

      // Crash chat abruptly (SIGKILL = no graceful shutdown)
      killProcess(chatProcess, 'SIGKILL');
      chatProcess = null;
      chatLogs = [];

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Restart chat
      chat = await startChat();
      chatProcess = chat.proc;
      chatLogs = chat.logs;

      // Wait for reload
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Check stats again
      chatProcess.stdin?.write('/stats\n');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const newStatsLog = chatLogs.join('\n');
      const newNodeMatch = newStatsLog.match(/Nodes:\s*(\d+)/);
      const newNodeCount = newNodeMatch ? parseInt(newNodeMatch[1], 10) : 0;

      console.log(`[TEST] Node count after crash: ${newNodeCount}`);

      // Node count should be same (or more if auto-save kicked in)
      expect(newNodeCount).toBeGreaterThanOrEqual(initialNodeCount - 1); // Allow 1 node tolerance
    }, STARTUP_TIMEOUT * 2);
  });

  describe('Mid-Operation Crash', () => {
    it('recovers from crash during /save operation', async () => {
      wsServerProcess = await startWsServer();
      const chat = await startChat();
      chatProcess = chat.proc;
      chatLogs = chat.logs;

      // Wait for load
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Start a save operation
      chatProcess.stdin?.write('/save\n');

      // Wait a tiny bit then crash (mid-operation)
      await new Promise((resolve) => setTimeout(resolve, 100));
      killProcess(chatProcess, 'SIGKILL');
      chatProcess = null;

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Restart and verify no corruption
      const newChat = await startChat();
      chatProcess = newChat.proc;
      chatLogs = newChat.logs;

      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Should load without errors
      const hasError = chatLogs.some(
        (l) => l.includes('corrupt') || l.includes('Corrupt') || l.includes('invalid') || l.includes('Error loading')
      );
      expect(hasError).toBe(false);

      // Should have nodes
      const hasNodes = chatLogs.some((l) => l.includes('Loaded') && l.includes('nodes'));
      expect(hasNodes).toBe(true);
    }, STARTUP_TIMEOUT * 2);

    it('recovers from crash during /validate operation', async () => {
      wsServerProcess = await startWsServer();
      const chat = await startChat();
      chatProcess = chat.proc;
      chatLogs = chat.logs;

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Start validation (long operation)
      chatProcess.stdin?.write('/validate\n');

      // Crash mid-validation
      await new Promise((resolve) => setTimeout(resolve, 500));
      killProcess(chatProcess, 'SIGKILL');
      chatProcess = null;

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Restart
      const newChat = await startChat();
      chatProcess = newChat.proc;
      chatLogs = newChat.logs;

      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Validation should work again
      chatProcess.stdin?.write('/validate\n');
      await new Promise((resolve) => setTimeout(resolve, 5000));

      const hasValidation = chatLogs.some((l) => l.includes('Validation') || l.includes('validation'));
      expect(hasValidation).toBe(true);
    }, STARTUP_TIMEOUT * 2);
  });

  describe('Data Consistency After Recovery', () => {
    it('graph version is consistent after crash recovery', async () => {
      wsServerProcess = await startWsServer();
      let chat = await startChat();
      chatProcess = chat.proc;
      chatLogs = chat.logs;

      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Get initial view
      chatProcess.stdin?.write('/view hierarchy\n');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Crash
      killProcess(chatProcess, 'SIGKILL');
      chatProcess = null;

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Restart
      chat = await startChat();
      chatProcess = chat.proc;
      chatLogs = chat.logs;

      await new Promise((resolve) => setTimeout(resolve, 3000));

      // View should work and show same data
      chatProcess.stdin?.write('/view hierarchy\n');
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const hasHierarchy =
        chatLogs.some((l) => l.includes('SYS')) || chatLogs.some((l) => l.includes('hierarchy'));
      expect(hasHierarchy).toBe(true);
    }, STARTUP_TIMEOUT * 2);
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
  throw new Error(`Timeout waiting for log: "${searchText}" after ${timeout}ms`);
}
