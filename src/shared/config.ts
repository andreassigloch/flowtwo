/**
 * Centralized Configuration
 *
 * All configuration values loaded from environment variables with sensible defaults.
 * This prevents hardcoded values scattered throughout the codebase.
 *
 * @author andreas@siglochconsulting
 */

import * as os from 'os';
import * as path from 'path';

/**
 * WebSocket Configuration
 */
export const WS_PORT = parseInt(process.env.WS_PORT || '3001', 10);
export const WS_URL = process.env.WS_URL || `ws://localhost:${WS_PORT}`;
export const WS_MAX_RECONNECT_ATTEMPTS = parseInt(process.env.WS_MAX_RECONNECT_ATTEMPTS || '5', 10);
export const WS_RECONNECT_DELAY = parseInt(process.env.WS_RECONNECT_DELAY || '1000', 10);

/**
 * File Paths
 */
const TMP_DIR = process.env.TMP_DIR || os.tmpdir();
export const LOG_PATH = process.env.LOG_PATH || path.join(TMP_DIR, 'graphengine.log');
export const FIFO_PATH = process.env.FIFO_PATH || path.join(TMP_DIR, 'graphengine-input.fifo');

/**
 * LLM Configuration
 */
export const LLM_TEMPERATURE = parseFloat(process.env.LLM_TEMPERATURE || '0.7');
export const LLM_MODEL = process.env.LLM_MODEL || 'claude-3-5-sonnet-20241022';
export const LLM_MAX_TOKENS = parseInt(process.env.LLM_MAX_TOKENS || '8000', 10);

/**
 * Neo4j Configuration
 */
export const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
export const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
export const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

/**
 * Application Configuration
 */
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const DEBUG = process.env.DEBUG === 'true';

/**
 * Validate required environment variables
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!process.env.ANTHROPIC_API_KEY) {
    errors.push('ANTHROPIC_API_KEY is required');
  }

  if (WS_PORT < 1024 || WS_PORT > 65535) {
    errors.push(`WS_PORT must be between 1024 and 65535, got ${WS_PORT}`);
  }

  if (LLM_TEMPERATURE < 0 || LLM_TEMPERATURE > 2) {
    errors.push(`LLM_TEMPERATURE must be between 0 and 2, got ${LLM_TEMPERATURE}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
