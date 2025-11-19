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
import { CanvasWebSocketServer } from './canvas/websocket-server.js';
import { WS_PORT } from './shared/config.js';

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
