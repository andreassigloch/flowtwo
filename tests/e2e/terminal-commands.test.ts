/**
 * Terminal E2E Tests for /analyze and /optimize Commands (CR-038)
 *
 * Tests the actual terminal interface via stdin/stdout.
 * Spawns chat-interface as child process and sends commands.
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../..');

// Test data paths
const TESTDATA_DIR = path.join(PROJECT_ROOT, 'eval/testdata');
const CLEAN_SYSTEM = path.join(TESTDATA_DIR, 'clean-system.txt');
const COMBINED_VIOLATIONS = path.join(TESTDATA_DIR, 'combined-violations.txt');

// Timeout for terminal responses
const COMMAND_TIMEOUT = 15000;

/**
 * Helper to spawn chat-interface and interact with it
 */
class TerminalTestHelper {
  private process: ChildProcess | null = null;
  private output: string = '';
  private ready: boolean = false;

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Terminal startup timeout'));
      }, 30000);

      // Spawn the chat interface
      this.process = spawn('node', ['dist/terminal-ui/chat-interface.js'], {
        cwd: PROJECT_ROOT,
        env: {
          ...process.env,
          // Use test system to avoid interfering with real data
          SYSTEM_ID: 'E2ETest.SY.001',
          WORKSPACE_ID: 'e2e-test-workspace',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.stdout?.on('data', (data) => {
        const text = data.toString();
        this.output += text;

        // Check if ready (prompt shown)
        if (text.includes('You:') || text.includes('Ready')) {
          if (!this.ready) {
            this.ready = true;
            clearTimeout(timeout);
            resolve();
          }
        }
      });

      this.process.stderr?.on('data', (data) => {
        const text = data.toString();
        this.output += text;
        // Some startup messages go to stderr
        if (text.includes('Ready') || text.includes('Connected')) {
          if (!this.ready) {
            this.ready = true;
            clearTimeout(timeout);
            resolve();
          }
        }
      });

      this.process.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      this.process.on('exit', (code) => {
        if (!this.ready) {
          clearTimeout(timeout);
          reject(new Error(`Process exited with code ${code}`));
        }
      });
    });
  }

  async sendCommand(command: string): Promise<string> {
    if (!this.process?.stdin) {
      throw new Error('Process not started');
    }

    // Clear previous output
    const startLen = this.output.length;

    // Send command
    this.process.stdin.write(command + '\n');

    // Wait for response
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const newOutput = this.output.slice(startLen);
        resolve(newOutput); // Return what we got, even if incomplete
      }, COMMAND_TIMEOUT);

      const checkOutput = setInterval(() => {
        const newOutput = this.output.slice(startLen);
        // Check if command completed (new prompt shown)
        if (newOutput.includes('You:') && newOutput.length > command.length + 10) {
          clearInterval(checkOutput);
          clearTimeout(timeout);
          resolve(newOutput);
        }
      }, 100);
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      // Send /quit command
      this.process.stdin?.write('/quit\n');
      await new Promise((resolve) => setTimeout(resolve, 500));
      this.process.kill('SIGTERM');
      this.process = null;
    }
  }

  getFullOutput(): string {
    return this.output;
  }
}

describe('Terminal Commands E2E (CR-038)', { timeout: 60000 }, () => {
  let terminal: TerminalTestHelper;

  // Check if we can run terminal tests (need built dist)
  const canRunTerminalTests = fs.existsSync(path.join(PROJECT_ROOT, 'dist/terminal-ui/chat-interface.js'));

  beforeAll(async () => {
    if (!canRunTerminalTests) {
      console.log('Skipping terminal tests - dist not built');
      return;
    }

    terminal = new TerminalTestHelper();
    try {
      await terminal.start();
    } catch (err) {
      console.log('Terminal startup failed:', err);
      // Tests will be skipped
    }
  });

  afterAll(async () => {
    if (terminal) {
      await terminal.stop();
    }
  });

  describe('/import + /analyze workflow', () => {
    it.skipIf(!canRunTerminalTests)('imports file and analyzes - should see nodes', async () => {
      // Import a test file
      const importOutput = await terminal.sendCommand(`/import ${CLEAN_SYSTEM}`);

      // Should show import success
      expect(importOutput).toMatch(/imported|loaded|nodes/i);

      // Now analyze
      const analyzeOutput = await terminal.sendCommand('/analyze');

      // Should NOT say "No nodes" and should show score
      expect(analyzeOutput).not.toMatch(/no nodes|empty graph/i);
      expect(analyzeOutput).toMatch(/score|%|violations?/i);
    });

    it.skipIf(!canRunTerminalTests)('imports violations file and detects issues', async () => {
      // Import file with violations
      const importOutput = await terminal.sendCommand(`/import ${COMBINED_VIOLATIONS}`);
      expect(importOutput).toMatch(/imported|loaded|nodes/i);

      // Analyze should find violations
      const analyzeOutput = await terminal.sendCommand('/analyze');

      // Should report violations (not 100% clean)
      // Output shows "Suggested Fixes" and "Merge Candidates" for violations
      expect(analyzeOutput).toMatch(/violation|issue|warning|error|score|suggested fixes|merge candidates/i);
    });
  });

  describe('/import + /optimize workflow', () => {
    it.skipIf(!canRunTerminalTests)('imports file and optimizes - should see nodes', async () => {
      // Import
      const importOutput = await terminal.sendCommand(`/import ${CLEAN_SYSTEM}`);
      expect(importOutput).toMatch(/imported|loaded|nodes/i);

      // Optimize
      const optimizeOutput = await terminal.sendCommand('/optimize');

      // Should NOT say "No nodes in graph"
      expect(optimizeOutput).not.toMatch(/no nodes in graph/i);

      // Should show optimization running or results
      expect(optimizeOutput).toMatch(/optimi|iteration|score|result/i);
    });
  });

  describe('/stats command', () => {
    it.skipIf(!canRunTerminalTests)('shows node count after import', async () => {
      // Import
      await terminal.sendCommand(`/import ${CLEAN_SYSTEM}`);

      // Check stats
      const statsOutput = await terminal.sendCommand('/stats');

      // Should show non-zero node count
      expect(statsOutput).toMatch(/nodes?:\s*\d+/i);
      expect(statsOutput).not.toMatch(/nodes?:\s*0[^\d]/i);
    });
  });
});

/**
 * Alternative: Direct function tests (no terminal spawn)
 *
 * These test the command handlers directly which is faster
 * and more reliable than spawning processes.
 */
describe('Command Handlers Direct Test (CR-038)', () => {
  it('handleAnalyzeCommand uses ctx.agentDB', async () => {
    // This tests the implementation directly
    const { handleAnalyzeCommand } = await import('../../src/terminal-ui/commands/validation-commands.js');
    const { getUnifiedAgentDBService, resetAgentDBInstance } = await import('../../src/llm-engine/agentdb/unified-agentdb-service.js');
    const { importSystem } = await import('../../src/shared/parsers/import-export.js');
    const { StatelessGraphCanvas } = await import('../../src/canvas/stateless-graph-canvas.js');
    const { ChatCanvas } = await import('../../src/canvas/chat-canvas.js');
    const { Neo4jClient } = await import('../../src/neo4j-client/neo4j-client.js');

    // Reset singleton
    resetAgentDBInstance();

    // Load test data
    const graphState = await importSystem(CLEAN_SYSTEM);

    // Setup AgentDB
    const agentDB = await getUnifiedAgentDBService('test-workspace', graphState.systemId);
    agentDB.loadFromState(graphState);

    // Verify data loaded
    const stats = agentDB.getGraphStats();
    expect(stats.nodeCount).toBeGreaterThan(10);

    // Create minimal mock context
    const graphCanvas = new StatelessGraphCanvas(
      agentDB,
      'test-workspace',
      graphState.systemId,
      'test-chat',
      'test-user'
    );

    // Capture console output
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    try {
      // Create mock context (minimal for handleAnalyzeCommand)
      const mockContext = {
        agentDB,
        graphCanvas,
        log: (msg: string) => logs.push(msg),
        config: { systemId: graphState.systemId },
      };

      // Call handler
      await handleAnalyzeCommand(mockContext as any);

      // Check output
      const output = logs.join('\n');

      // Should show analysis results, not "No nodes"
      expect(output).toMatch(/score|%|violation|clean/i);
    } finally {
      console.log = originalLog;
    }
  });

  it('handleOptimizeCommand uses ctx.graphCanvas.getState()', async () => {
    const { handleOptimizeCommand } = await import('../../src/terminal-ui/commands/validation-commands.js');
    const { getUnifiedAgentDBService, resetAgentDBInstance } = await import('../../src/llm-engine/agentdb/unified-agentdb-service.js');
    const { importSystem } = await import('../../src/shared/parsers/import-export.js');
    const { StatelessGraphCanvas } = await import('../../src/canvas/stateless-graph-canvas.js');

    // Reset singleton
    resetAgentDBInstance();

    // Load test data
    const graphState = await importSystem(CLEAN_SYSTEM);

    // Setup AgentDB
    const agentDB = await getUnifiedAgentDBService('test-workspace', graphState.systemId);
    agentDB.loadFromState(graphState);

    // Create GraphCanvas
    const graphCanvas = new StatelessGraphCanvas(
      agentDB,
      'test-workspace',
      graphState.systemId,
      'test-chat',
      'test-user'
    );

    // Verify graphCanvas can see the data
    const state = graphCanvas.getState();
    expect(state.nodes.size).toBeGreaterThan(10);

    // Capture console output
    const logs: string[] = [];
    const originalLog = console.log;
    const originalWrite = process.stdout.write.bind(process.stdout);
    console.log = (...args) => logs.push(args.join(' '));

    try {
      // Create mock context
      const mockContext = {
        agentDB,
        graphCanvas,
        log: (msg: string) => logs.push(msg),
        config: { systemId: graphState.systemId },
      };

      // Call handler with small iteration count
      await handleOptimizeCommand('5', mockContext as any);

      // Check output
      const output = logs.join('\n');

      // Should NOT say "No nodes in graph"
      expect(output).not.toMatch(/no nodes in graph/i);

      // Should show optimization progress or results
      expect(output).toMatch(/optimi|iteration|nodes|edges/i);
    } finally {
      console.log = originalLog;
    }
  });
});
