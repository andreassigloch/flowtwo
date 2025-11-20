/**
 * Centralized Configuration
 *
 * All configuration values loaded from environment variables with sensible defaults.
 * This prevents hardcoded values scattered throughout the codebase.
 *
 * @author andreas@siglochconsulting
 */

import * as path from 'path';
import { config as loadDotenv } from 'dotenv';

// Load .env file
loadDotenv();

/**
 * WebSocket Configuration
 */
export const WS_PORT = parseInt(process.env.WS_PORT || '3001', 10);
export const WS_URL = process.env.WS_URL || `ws://localhost:${WS_PORT}`;
export const WS_MAX_RECONNECT_ATTEMPTS = parseInt(process.env.WS_MAX_RECONNECT_ATTEMPTS || '5', 10);
export const WS_RECONNECT_DELAY = parseInt(process.env.WS_RECONNECT_DELAY || '1000', 10);

/**
 * File Paths
 * Use /tmp explicitly (not os.tmpdir()) to match startup.sh expectations
 */
const TMP_DIR = process.env.TMP_DIR || '/tmp';
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
 * AgentDB Configuration (LLM Agent Shared Memory)
 */
export const AGENTDB_ENABLED = process.env.AGENTDB_ENABLED !== 'false'; // Default: true
export const AGENTDB_BACKEND = (process.env.AGENTDB_BACKEND || 'memory') as 'agentdb' | 'memory' | 'disabled';
export const AGENTDB_URL = process.env.AGENTDB_URL || '';
export const AGENTDB_CACHE_TTL = parseInt(process.env.AGENTDB_CACHE_TTL || '1800', 10); // 30 min default
export const AGENTDB_SIMILARITY_THRESHOLD = parseFloat(process.env.AGENTDB_SIMILARITY_THRESHOLD || '0.85');

/**
 * OpenAI Embeddings Configuration (for AgentDB vector search)
 */
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '';
export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
export const EMBEDDING_DIMENSION = parseInt(process.env.EMBEDDING_DIMENSION || '1536', 10);

/**
 * Import/Export Configuration
 */
export const IMPORT_EXPORT_DIR = process.env.IMPORT_EXPORT_DIR || path.join(process.cwd(), 'exports');
export const DEFAULT_EXPORT_FILENAME = process.env.DEFAULT_EXPORT_FILENAME || 'system-export.txt';

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

  if (!['agentdb', 'memory', 'disabled'].includes(AGENTDB_BACKEND)) {
    errors.push(`AGENTDB_BACKEND must be 'agentdb', 'memory', or 'disabled', got '${AGENTDB_BACKEND}'`);
  }

  if (AGENTDB_BACKEND === 'agentdb' && AGENTDB_ENABLED && !AGENTDB_URL) {
    errors.push('AGENTDB_URL is required when AGENTDB_BACKEND=agentdb and AGENTDB_ENABLED=true');
  }

  if (AGENTDB_SIMILARITY_THRESHOLD < 0 || AGENTDB_SIMILARITY_THRESHOLD > 1) {
    errors.push(`AGENTDB_SIMILARITY_THRESHOLD must be between 0 and 1, got ${AGENTDB_SIMILARITY_THRESHOLD}`);
  }

  if (AGENTDB_CACHE_TTL < 0) {
    errors.push(`AGENTDB_CACHE_TTL must be >= 0, got ${AGENTDB_CACHE_TTL}`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
