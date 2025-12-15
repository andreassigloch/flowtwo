/**
 * Reload clean PRD data via stdin/stdout
 * Executes: /new -> /load -> /analyze -> /save
 */
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..');
const EXPORT_FILE = 'PRDReviewProcess-clean.txt';

let wsServer: ChildProcess | null = null;
let chat: ChildProcess | null = null;
let chatLogs: string[] = [];

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForOutput(pattern: RegExp, timeout = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const combined = chatLogs.join('\n');
    if (pattern.test(combined)) {
      return true;
    }
    await sleep(200);
  }
  return false;
}

function sendCommand(cmd: string): void {
  console.log(`\n>>> Sending: ${cmd}`);
  chatLogs = []; // Reset logs for this command
  chat?.stdin?.write(cmd + '\n');
}

async function main() {
  console.log('Starting WebSocket server...');
  
  wsServer = spawn('npx', ['tsx', 'src/websocket-server.ts'], {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  wsServer.stdout?.on('data', (data) => {
    const text = data.toString();
    if (text.includes('WebSocket server') || text.includes('listening')) {
      console.log('[WS]', text.trim());
    }
  });

  wsServer.stderr?.on('data', (data) => {
    const text = data.toString();
    if (!text.includes('ExperimentalWarning')) {
      console.error('[WS ERR]', text.trim());
    }
  });

  await sleep(2000);
  console.log('Starting chat interface...');

  chat = spawn('npx', ['tsx', 'src/terminal-ui/chat-interface.ts'], {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  chat.stdout?.on('data', (data) => {
    const text = data.toString();
    chatLogs.push(text);
    // Show important output
    if (text.includes('nodes') || text.includes('edges') || 
        text.includes('Loaded') || text.includes('Saved') ||
        text.includes('Error') || text.includes('✅') || 
        text.includes('❌') || text.includes('FCHAIN') ||
        text.includes('violations') || text.includes('Status')) {
      console.log(text.trim());
    }
  });

  chat.stderr?.on('data', (data) => {
    const text = data.toString();
    if (!text.includes('ExperimentalWarning')) {
      console.error('[CHAT ERR]', text.trim());
    }
  });

  await sleep(3000);

  // Step 1: /new - Start fresh session
  sendCommand('/new');
  await waitForOutput(/fresh|new session|cleared/i, 10000);
  await sleep(1000);

  // Step 2: /import - Import from Format E file
  sendCommand(`/import ${EXPORT_FILE}`);
  const loadSuccess = await waitForOutput(/Imported|Loaded|nodes.*edges|58 nodes/i, 15000);
  if (!loadSuccess) {
    console.error('❌ Import failed or timed out');
    console.log('Recent logs:', chatLogs.slice(-10).join('\n'));
  }
  await sleep(2000);

  // Step 3: /status - Verify data loaded
  sendCommand('/status');
  await waitForOutput(/nodes|edges/i, 5000);
  await sleep(1000);

  // Step 4: /analyze - Run validation
  sendCommand('/analyze');
  const analyzeComplete = await waitForOutput(/violations|Status|KORREKT|issues/i, 20000);
  if (!analyzeComplete) {
    console.log('Analyze may still be running...');
  }
  await sleep(3000);

  // Step 5: /save - Persist to Neo4j
  sendCommand('/save');
  const saveSuccess = await waitForOutput(/Saved|persisted|Neo4j|success/i, 15000);
  if (!saveSuccess) {
    console.error('❌ Save may have failed');
    console.log('Recent logs:', chatLogs.slice(-10).join('\n'));
  }
  await sleep(2000);

  // Final status check
  sendCommand('/status');
  await waitForOutput(/nodes|edges/i, 5000);
  await sleep(1000);

  console.log('\n=== Operation Complete ===');
  console.log('Final logs:');
  console.log(chatLogs.slice(-20).join(''));

  // Cleanup
  chat?.kill();
  wsServer?.kill();
  
  await sleep(1000);
  process.exit(0);
}

main().catch(err => {
  console.error('Script error:', err);
  chat?.kill();
  wsServer?.kill();
  process.exit(1);
});
