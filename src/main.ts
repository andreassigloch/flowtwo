/**
 * GraphEngine - Main Entry Point
 *
 * LLM-driven Systems Engineering platform with Canvas-centric architecture
 *
 * Actual UI: Run WebSocket server + chat-interface.ts + graph-viewer.ts in separate terminals
 * See README.md for launch instructions
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import 'dotenv/config';
import { validateConfig } from './shared/config.js';

/**
 * Main application entry point
 * Validates configuration and displays instructions
 */
export async function main(): Promise<void> {
  console.log('🚀 GraphEngine v2.0.0');
  console.log('📊 Enterprise-grade Systems Engineering Platform');
  console.log('');

  // Validate configuration
  const configValidation = validateConfig();
  if (!configValidation.valid) {
    console.error('❌ Configuration errors:');
    configValidation.errors.forEach(error => {
      console.error(`   • ${error}`);
    });
    console.error('');
    console.error('Please check your .env file or environment variables.');
    console.error('See .env.example for required configuration.');
    process.exit(1);
  }

  console.log('✅ Configuration valid');
  console.log('');
  console.log('To run GraphEngine, start 3 terminals:');
  console.log('');
  console.log('  Terminal 1: npm run websocket-server');
  console.log('  Terminal 2: tsx src/terminal-ui/graph-viewer.ts');
  console.log('  Terminal 3: tsx src/terminal-ui/chat-interface.ts');
  console.log('');
  console.log('See README.md for details.');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}
