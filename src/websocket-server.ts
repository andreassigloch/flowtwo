/**
 * WebSocket Server - Standalone Process
 *
 * Central WebSocket server for Terminal-UI and Web-UI synchronization
 *
 * Runs on port 3001 (WS_PORT from .env)
 * Terminals connect as WebSocket clients for instant updates
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import 'dotenv/config';
import * as fs from 'fs';
import { CanvasWebSocketServer } from './canvas/websocket-server.js';
import { WS_PORT, LOG_PATH } from './shared/config.js';

/**
 * Log to STDOUT file
 */
function log(message: string): void {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  const logMsg = `[${timestamp}] [WS-SERVER] ${message}`;
  fs.appendFileSync(LOG_PATH, logMsg + '\n');
}

const port = parseInt(process.env.WS_PORT || String(WS_PORT), 10);

console.log('╔═══════════════════════════════════════╗');
console.log('║   GraphEngine WebSocket Server       ║');
console.log('╚═══════════════════════════════════════╝');
console.log('');

const wsServer = new CanvasWebSocketServer(port);

console.log(`✅ WebSocket server started on port ${port}`);
console.log('');
console.log('Waiting for terminal connections...');
console.log('(Press Ctrl+C to stop)');
console.log('');

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('');
  console.log('🛑 Shutting down WebSocket server...');
  wsServer.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('');
  console.log('🛑 Shutting down WebSocket server...');
  wsServer.close();
  process.exit(0);
});

// Crash handlers - log errors to STDOUT file
process.on('uncaughtException', (error: Error) => {
  const errorMsg = `💥 CRASH (uncaughtException): ${error.message}`;
  console.error(errorMsg);
  log(errorMsg);
  if (error.stack) {
    log(error.stack);
  }
  wsServer.close();
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  const errorMsg = `💥 CRASH (unhandledRejection): ${reason}`;
  console.error(errorMsg);
  log(errorMsg);
  if (reason instanceof Error && reason.stack) {
    log(reason.stack);
  }
  wsServer.close();
  process.exit(1);
});
