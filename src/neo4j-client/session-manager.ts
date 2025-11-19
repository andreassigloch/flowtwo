/**
 * Session Manager - Persistent User Session State
 *
 * Manages:
 * - Active workspace
 * - Active system
 * - Current view
 * - Last chat ID
 * - User preferences
 *
 * @author andreas@siglochconsulting
 */

import { Neo4jClient } from './neo4j-client.js';

export interface UserSession {
  userId: string;
  workspaceId: string;
  activeSystemId: string;
  currentView: string;
  chatId: string;
  lastActive: Date;
  preferences?: Record<string, unknown>;
}

export class SessionManager {
  private neo4jClient: Neo4jClient;

  constructor(neo4jClient: Neo4jClient) {
    this.neo4jClient = neo4jClient;
  }

  /**
   * Load user session from Neo4j
   */
  async loadSession(userId: string, workspaceId: string): Promise<UserSession | null> {
    const session = this.neo4jClient['getSession']();

    try {
      const result = await session.run(
        `MATCH (s:UserSession {userId: $userId, workspaceId: $workspaceId})
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
        preferences: record.properties.preferences
          ? JSON.parse(record.properties.preferences)
          : undefined,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Save user session to Neo4j
   */
  async saveSession(sessionData: UserSession): Promise<void> {
    const session = this.neo4jClient['getSession']();

    try {
      await session.run(
        `MERGE (s:UserSession {userId: $userId, workspaceId: $workspaceId})
         SET s.activeSystemId = $activeSystemId,
             s.currentView = $currentView,
             s.chatId = $chatId,
             s.lastActive = datetime($lastActive),
             s.preferences = $preferences
         RETURN s`,
        {
          userId: sessionData.userId,
          workspaceId: sessionData.workspaceId,
          activeSystemId: sessionData.activeSystemId,
          currentView: sessionData.currentView,
          chatId: sessionData.chatId,
          lastActive: sessionData.lastActive.toISOString(),
          preferences: sessionData.preferences
            ? JSON.stringify(sessionData.preferences)
            : null,
        }
      );
    } finally {
      await session.close();
    }
  }

  /**
   * Delete user session
   */
  async deleteSession(userId: string, workspaceId: string): Promise<void> {
    const session = this.neo4jClient['getSession']();

    try {
      await session.run(
        `MATCH (s:UserSession {userId: $userId, workspaceId: $workspaceId})
         DELETE s`,
        { userId, workspaceId }
      );
    } finally {
      await session.close();
    }
  }
}
