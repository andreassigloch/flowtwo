/**
 * GraphEngine - Main Entry Point
 *
 * LLM-driven Systems Engineering platform with Canvas-centric architecture
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import 'dotenv/config';
import { GraphEngineApp } from './terminal-ui/app.js';
import { validateConfig } from './shared/config.js';
import type { AppConfig } from './terminal-ui/app.js';

/**
 * Main application entry point
 * Implements CR-002 Option A: Terminal UI launcher with config validation
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

  // Build application configuration
  const config: AppConfig = {
    workspaceId: process.env.WORKSPACE_ID || 'default-workspace',
    systemId: process.env.SYSTEM_ID || 'system-001',
    chatId: process.env.CHAT_ID || 'chat-001',
    userId: process.env.USER_ID || 'user@example.com',
    neo4jUri: process.env.NEO4J_URI,
    neo4jUser: process.env.NEO4J_USER,
    neo4jPassword: process.env.NEO4J_PASSWORD,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  };

  // Initialize application
  const app = new GraphEngineApp(config);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await app.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await app.stop();
    process.exit(0);
  });

  // Start terminal UI
  try {
    await app.start();
  } catch (error) {
    console.error('❌ Fatal error during startup:');
    console.error(error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}
