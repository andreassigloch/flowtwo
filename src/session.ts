/**
 * Session Manager - Application State Persistence & Cleanup
 *
 * Manages persistent application state in Neo4j:
 * - Active workspace (from .env)
 * - Active system
 * - Current view
 * - Last chat ID
 *
 * Session is loaded once at startup and saved on:
 * - /exit command
 * - System switch (/load)
 *
 * Also handles graceful shutdown:
 * - Save session state
 * - Close Neo4j connections
 * - Close WebSocket connections
 *
 * @author andreas@siglochconsulting
 */

import { Neo4jClient } from './neo4j-client/neo4j-client.js';
import type { CanvasWebSocketClient } from './canvas/websocket-client.js';
import type { StatelessGraphCanvas } from './canvas/stateless-graph-canvas.js';
import type { ChatCanvas } from './canvas/chat-canvas.js';

export interface AppSession {
  userId: string;
  workspaceId: string;
  activeSystemId: string;
  currentView: string;
  chatId: string;
  lastActive: Date;
}

export class SessionManager {
  private neo4jClient: Neo4jClient;
  private wsClient?: CanvasWebSocketClient;
  private graphCanvas?: StatelessGraphCanvas;
  private chatCanvas?: ChatCanvas;

  constructor(neo4jClient: Neo4jClient) {
    this.neo4jClient = neo4jClient;
  }

  /**
   * Register components for cleanup on exit
   */
  registerComponents(
    wsClient?: CanvasWebSocketClient,
    graphCanvas?: StatelessGraphCanvas,
    chatCanvas?: ChatCanvas
  ): void {
    this.wsClient = wsClient;
    this.graphCanvas = graphCanvas;
    this.chatCanvas = chatCanvas;
  }

  /**
   * Load application session from Neo4j
   * Returns null if no session exists (first run)
   */
  async loadSession(userId: string, workspaceId: string): Promise<AppSession | null> {
    const session = this.neo4jClient['getSession']();

    try {
      const result = await session.run(
        `MATCH (s:AppSession {userId: $userId, workspaceId: $workspaceId})
         RETURN s`,
        { userId, workspaceId }
      );

      if (result.records.length === 0) {
        return null;
      }

      const record = result.records[0].get('s');
      return {
        userId: record.properties.userId,
        workspaceId: record.properties.workspaceId,
        activeSystemId: record.properties.activeSystemId,
        currentView: record.properties.currentView || 'hierarchy',
        chatId: record.properties.chatId,
        lastActive: new Date(record.properties.lastActive),
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Save application session to Neo4j
   * Called on /exit and system switch
   */
  async saveSession(sessionData: AppSession): Promise<void> {
    const session = this.neo4jClient['getSession']();

    try {
      await session.run(
        `MERGE (s:AppSession {userId: $userId, workspaceId: $workspaceId})
         SET s.activeSystemId = $activeSystemId,
             s.currentView = $currentView,
             s.chatId = $chatId,
             s.lastActive = datetime($lastActive)
         RETURN s`,
        {
          userId: sessionData.userId,
          workspaceId: sessionData.workspaceId,
          activeSystemId: sessionData.activeSystemId,
          currentView: sessionData.currentView,
          chatId: sessionData.chatId,
          lastActive: sessionData.lastActive.toISOString(),
        }
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Delete application session (optional cleanup)
   */
  async deleteSession(userId: string, workspaceId: string): Promise<void> {
    const session = this.neo4jClient['getSession']();

    try {
      await session.run(
        `MATCH (s:AppSession {userId: $userId, workspaceId: $workspaceId})
         DELETE s`,
        { userId, workspaceId }
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Graceful shutdown - saves session and closes all connections
   * Called by /exit command
   */
  async shutdown(sessionData: AppSession): Promise<void> {
    console.log('');
    console.log('💾 Saving session state...');

    // Save session to Neo4j
    try {
      await this.saveSession(sessionData);
      console.log('✅ Session saved');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`\x1b[33m⚠️  Could not save session: ${errorMsg}\x1b[0m`);
    }

    // Auto-save any unsaved changes
    if (this.graphCanvas || this.chatCanvas) {
      console.log('💾 Saving unsaved changes...');

      try {
        const graphResult = this.graphCanvas ? await this.graphCanvas.persistToNeo4j() : { success: true, skipped: true, savedCount: 0 };
        const chatResult = this.chatCanvas ? await this.chatCanvas.persistToNeo4j() : { success: true, skipped: true, savedCount: 0 };

        if (!graphResult.skipped || !chatResult.skipped) {
          const graphCount = graphResult.savedCount || 0;
          const chatCount = chatResult.savedCount || 0;
          console.log(`✅ Auto-saved: ${graphCount} graph items, ${chatCount} messages`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`\x1b[33m⚠️  Could not auto-save: ${errorMsg}\x1b[0m`);
      }
    }

    // Close WebSocket connection
    if (this.wsClient) {
      console.log('🔌 Closing WebSocket connection...');
      this.wsClient.disconnect();
      console.log('✅ WebSocket closed');
    }

    // Close Neo4j connection
    console.log('🔌 Closing Neo4j connection...');
    await this.neo4jClient.close();
    console.log('✅ Neo4j connection closed');

    console.log('');
    console.log('✅ Shutdown complete');
  }
}
