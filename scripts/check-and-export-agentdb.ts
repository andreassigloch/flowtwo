/**
 * Check AgentDB data integrity and export via running app
 * Uses stdin/stdout to interact with the GraphEngine app
 *
 * @author andreas@siglochconsulting
 */
import 'dotenv/config';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('=== GraphEngine AgentDB Check & Export ===\n');

  // 1. Start WebSocket server
  console.log('Starting WebSocket server...');
  const wsServer = spawn('npx', ['tsx', 'src/websocket-server.ts'], {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const wsLogs: string[] = [];
  wsServer.stdout?.on('data', (data) => wsLogs.push(data.toString()));
  wsServer.stderr?.on('data', (data) => wsLogs.push(data.toString()));

  await sleep(2000);
  console.log('WebSocket server started');

  // 2. Start chat interface
  console.log('Starting chat interface...');
  const chat = spawn('npx', ['tsx', 'src/terminal-ui/chat-interface.ts'], {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const chatLogs: string[] = [];
  chat.stdout?.on('data', (data) => {
    const text = data.toString();
    chatLogs.push(text);
    // Print relevant output
    if (text.includes('Nodes:') || text.includes('Edges:') ||
        text.includes('DUPLICATE') || text.includes('BIDIRECTIONAL') ||
        text.includes('exported') || text.includes('Exported') ||
        text.includes('Error') || text.includes('error')) {
      process.stdout.write(text);
    }
  });
  chat.stderr?.on('data', (data) => {
    chatLogs.push(`[ERR] ${data.toString()}`);
  });

  // Wait for connection
  console.log('Waiting for WebSocket connection...');
  let connected = false;
  for (let i = 0; i < 50; i++) {
    if (chatLogs.some(log => log.includes('Connected to WebSocket'))) {
      connected = true;
      break;
    }
    await sleep(200);
  }

  if (!connected) {
    console.error('Failed to connect to WebSocket');
    wsServer.kill();
    chat.kill();
    process.exit(1);
  }
  console.log('Connected!\n');

  // Helper function to send command and wait for output
  async function sendCommand(cmd: string, waitPattern?: RegExp, timeout = 10000): Promise<string> {
    const startIdx = chatLogs.length;
    console.log(`> ${cmd}`);
    chat.stdin?.write(cmd + '\n');

    if (!waitPattern) {
      await sleep(1000);
      return chatLogs.slice(startIdx).join('');
    }

    const start = Date.now();
    while (Date.now() - start < timeout) {
      const recent = chatLogs.slice(startIdx).join('');
      if (waitPattern.test(recent)) {
        return recent;
      }
      await sleep(100);
    }
    return chatLogs.slice(startIdx).join('');
  }

  try {
    // Load current system
    await sleep(1000);

    // Check stats
    console.log('\n--- Checking current stats ---');
    await sendCommand('/stats', /Nodes:|nodes/i);
    await sleep(500);

    // Export current state
    console.log('\n--- Exporting AgentDB data ---');
    const exportOutput = await sendCommand('/export PRDReviewProcess-clean', /exported|Exported|Error/i, 15000);
    console.log('Export result:', exportOutput.includes('exported') ? 'SUCCESS' : 'CHECK OUTPUT');

    // Run /analyze to check for issues
    console.log('\n--- Running validation ---');
    await sendCommand('/analyze', /issues|violations|clean|KORREKT/i, 20000);
    await sleep(2000);

    // Get final stats
    console.log('\n--- Final stats ---');
    await sendCommand('/stats', /Nodes:|nodes/i);

  } finally {
    // Cleanup
    console.log('\n--- Cleanup ---');
    chat.stdin?.write('/exit\n');
    await sleep(1000);

    chat.kill('SIGTERM');
    wsServer.kill('SIGTERM');

    console.log('Done.');
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
