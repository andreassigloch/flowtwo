/**
 * Zentrale Session Resolution für alle Terminals
 *
 * EINE Funktion für konsistente Initialisierung:
 * - chat-interface.ts
 * - graph-viewer.ts
 *
 * Priorität:
 * 1. ENV (SYSTEM_ID) - explizit konfiguriert
 * 2. Neo4j - letzte Session aus DB
 * 3. 'new-system' - nur wenn Neo4j leer (neue Installation)
 *
 * WICHTIG: Neo4j ist MANDATORY - kein Fallback!
 *
 * @author andreas@siglochconsulting
 */

import { Neo4jClient } from '../neo4j-client/neo4j-client.js';

export interface ResolvedSession {
  workspaceId: string;
  systemId: string;
  userId: string;
  chatId: string;
  source: 'env' | 'neo4j' | 'new-installation';
}

/**
 * Initialisiert Neo4j Client - FAIL FAST wenn nicht konfiguriert
 *
 * @throws process.exit(1) wenn NEO4J_* env vars fehlen
 */
export function initNeo4jClient(): Neo4jClient {
  if (!process.env.NEO4J_URI || !process.env.NEO4J_USER || !process.env.NEO4J_PASSWORD) {
    console.error('');
    console.error('\x1b[31m╔═══════════════════════════════════════════════════════╗\x1b[0m');
    console.error('\x1b[31m║  ERROR: Neo4j configuration missing                   ║\x1b[0m');
    console.error('\x1b[31m╚═══════════════════════════════════════════════════════╝\x1b[0m');
    console.error('');
    console.error('\x1b[33mRequired environment variables:\x1b[0m');
    console.error('  NEO4J_URI      - e.g., bolt://localhost:7687');
    console.error('  NEO4J_USER     - e.g., neo4j');
    console.error('  NEO4J_PASSWORD - your password');
    console.error('');
    console.error('\x1b[33mSet these in your .env file or environment.\x1b[0m');
    console.error('');
    process.exit(1);
  }

  return new Neo4jClient({
    uri: process.env.NEO4J_URI,
    user: process.env.NEO4J_USER,
    password: process.env.NEO4J_PASSWORD,
  });
}

/**
 * Resolve session with clear priority:
 * 1. ENV (SYSTEM_ID) - explicit override
 * 2. Neo4j Session - last active session
 * 3. new-system - only for fresh installations
 *
 * @param neo4jClient - REQUIRED Neo4j client
 */
export async function resolveSession(neo4jClient: Neo4jClient): Promise<ResolvedSession> {
  const workspaceId = process.env.WORKSPACE_ID || 'demo-workspace';
  const userId = process.env.USER_ID || 'andreas@siglochconsulting';
  const chatId = process.env.CHAT_ID || 'demo-chat-001';

  // 1. ENV hat höchste Priorität
  if (process.env.SYSTEM_ID) {
    return {
      workspaceId,
      systemId: process.env.SYSTEM_ID,
      userId,
      chatId,
      source: 'env',
    };
  }

  // 2. Neo4j Session (MANDATORY)
  try {
    const session = await loadSessionFromNeo4j(neo4jClient, userId, workspaceId);
    if (session) {
      return {
        workspaceId,
        systemId: session.activeSystemId,
        userId,
        chatId: session.chatId || chatId,
        source: 'neo4j',
      };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('');
    console.error('\x1b[31m╔═══════════════════════════════════════════════════════╗\x1b[0m');
    console.error('\x1b[31m║  ERROR: Neo4j connection failed                       ║\x1b[0m');
    console.error('\x1b[31m╚═══════════════════════════════════════════════════════╝\x1b[0m');
    console.error('');
    console.error(`\x1b[31m${errorMsg}\x1b[0m`);
    console.error('');
    console.error('\x1b[33mEnsure Neo4j is running and credentials are correct.\x1b[0m');
    console.error('');
    process.exit(1);
  }

  // 3. Neue Installation (Neo4j leer, aber erreichbar)
  return {
    workspaceId,
    systemId: 'new-system',
    userId,
    chatId,
    source: 'new-installation',
  };
}

/**
 * Load session from Neo4j AppSession node
 *
 * IMPORTANT: Validates that the activeSystemId actually has nodes in Neo4j.
 * If the system no longer exists (stale), returns null → triggers new-installation flow.
 * NO FALLBACKS - user must explicitly /load a system.
 */
async function loadSessionFromNeo4j(
  neo4jClient: Neo4jClient,
  userId: string,
  workspaceId: string
): Promise<{ activeSystemId: string; chatId?: string } | null> {
  const session = neo4jClient['getSession']();

  try {
    // 1. Get AppSession
    const sessionResult = await session.run(
      `MATCH (s:AppSession {userId: $userId, workspaceId: $workspaceId})
       RETURN s.activeSystemId as activeSystemId, s.chatId as chatId`,
      { userId, workspaceId }
    );

    if (sessionResult.records.length === 0) {
      // No AppSession
      return null;
    }

    const record = sessionResult.records[0];
    const activeSystemId = record.get('activeSystemId');
    const chatId = record.get('chatId');

    // 2. Validate that the system actually has nodes
    // Note: Uses :Node label (consistent with neo4j-client.ts saveNodes)
    const validationResult = await session.run(
      `MATCH (n:Node {systemId: $systemId})
       RETURN count(n) as nodeCount LIMIT 1`,
      { systemId: activeSystemId }
    );

    const nodeCount = validationResult.records[0]?.get('nodeCount')?.toNumber() || 0;

    if (nodeCount > 0) {
      // System exists and has data - use it
      return { activeSystemId, chatId };
    }

    // 3. System is stale (no nodes) - return null, no fallback
    console.log(`\x1b[33m⚠️  System '${activeSystemId}' has no data in Neo4j\x1b[0m`);
    console.log(`\x1b[33m   Use /load to select a system or /import to import one\x1b[0m`);
    return null;
  } finally {
    await session.close();
  }
}

/**
 * Interface for config object passed to updateActiveSystem
 */
export interface SessionConfig {
  userId: string;
  workspaceId: string;
  systemId: string;
}

/**
 * Interface for objects with updateSystemId method (GraphCanvas)
 */
export interface SystemIdUpdatable {
  updateSystemId(newSystemId: string): void;
  persistToNeo4j(force?: boolean): Promise<{ success: boolean; savedCount?: number }>;
}

/**
 * Interface for AgentDB service (compatible with both old and new services)
 * CR-032: UnifiedAgentDBService doesn't need invalidateGraphSnapshot (uses version-aware caching)
 */
interface AgentDBService {
  invalidateGraphSnapshot?(systemId: string): Promise<void>;
}

/**
 * Update active system ID consistently across all components
 *
 * Called by: /new, /load, /import, auto-detect SYS
 *
 * @param neo4jClient - Neo4j client for AppSession updates
 * @param canvas - GraphCanvas or any object with updateSystemId() and persistToNeo4j()
 * @param config - Config object with userId, workspaceId, systemId (will be mutated!)
 * @param newSystemId - The new system ID to set
 * @param options.persistGraph - If true, persist graph to Neo4j (for /import and auto-detect)
 * @param options.getAgentDB - Function to get AgentDB service for cache invalidation
 *
 * @author andreas@siglochconsulting
 */
export async function updateActiveSystem(
  neo4jClient: Neo4jClient,
  canvas: SystemIdUpdatable,
  config: SessionConfig,
  newSystemId: string,
  options: {
    persistGraph?: boolean;
    // CR-032: Accept any AgentDB-like service (old or new)
    getAgentDB?: () => Promise<AgentDBService | unknown>;
  } = {}
): Promise<void> {
  const oldSystemId = config.systemId;

  // 1. Update config (mutation)
  config.systemId = newSystemId;

  // 2. Update canvas state (marks all nodes dirty for new systemId)
  canvas.updateSystemId(newSystemId);

  // 3. Persist to Neo4j if needed (for /import and auto-detect, NOT for /load)
  if (options.persistGraph) {
    await canvas.persistToNeo4j(true);
  }

  // 4. Update AppSession in Neo4j
  const session = neo4jClient['getSession']();
  try {
    await session.run(
      `MERGE (s:AppSession {userId: $userId, workspaceId: $workspaceId})
       SET s.activeSystemId = $systemId, s.updatedAt = datetime()`,
      { userId: config.userId, workspaceId: config.workspaceId, systemId: newSystemId }
    );
  } finally {
    await session.close();
  }

  // 5. Cache invalidation
  // Note: With CR-032 UnifiedAgentDBService, cache invalidation is automatic via graph version tracking.
  // Old AgentDB snapshot invalidation is no longer needed - the version-aware cache handles this.
  // If getAgentDB is provided (legacy), call invalidateGraphSnapshot for backward compatibility.
  if (options.getAgentDB) {
    try {
      const agentdb = await options.getAgentDB() as AgentDBService;
      if (agentdb.invalidateGraphSnapshot) {
        await agentdb.invalidateGraphSnapshot(oldSystemId);
        await agentdb.invalidateGraphSnapshot(newSystemId);
      }
    } catch {
      // Ignore - using new UnifiedAgentDBService which doesn't need this
    }
  }
}
