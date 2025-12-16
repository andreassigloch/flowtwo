/**
 * Shared types for command handlers
 *
 * @author andreas@siglochconsulting
 */

import * as readline from 'readline';
import type { StatelessGraphCanvas } from '../../canvas/stateless-graph-canvas.js';
import type { ChatCanvas } from '../../canvas/chat-canvas.js';
import type { ILLMEngine } from '../../llm-engine/engine-factory.js';
import type { Neo4jClient } from '../../neo4j-client/neo4j-client.js';
import type { FormatEParser } from '../../shared/parsers/format-e-parser.js';
import type { CanvasWebSocketClient } from '../../canvas/websocket-client.js';
import type { UnifiedAgentDBService } from '../../llm-engine/agentdb/unified-agentdb-service.js';
import type { SessionManager } from '../../session.js';
import type { SessionManager as SessionManagerNew } from '../../session-manager.js';

/**
 * Session configuration
 */
export interface SessionConfig {
  workspaceId: string;
  systemId: string;
  chatId: string;
  userId: string;
}

/**
 * Command context - all dependencies needed by command handlers
 */
export interface CommandContext {
  config: SessionConfig;
  llmEngine: ILLMEngine | undefined;
  neo4jClient: Neo4jClient;
  sessionManager: SessionManager;
  wsClient: CanvasWebSocketClient;
  graphCanvas: StatelessGraphCanvas;
  chatCanvas: ChatCanvas;
  agentDB: UnifiedAgentDBService;
  parser: FormatEParser;
  rl: readline.Interface;
  log: (message: string) => void;
  notifyGraphUpdate: () => void;
  /** CR-063: New SessionManager for learning components access */
  sessionManagerNew?: SessionManagerNew;
}
