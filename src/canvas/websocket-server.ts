/**
 * WebSocket Server for Canvas Broadcasting
 *
 * Manages WebSocket connections for multi-user graph synchronization
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { WebSocketServer, WebSocket } from 'ws';
import { WS_PORT } from '../shared/config.js';

export interface BroadcastUpdate {
  type: 'graph_update' | 'chat_update' | 'shutdown';
  diff?: string; // Format E Diff as string (optional for shutdown)
  source?: {
    userId: string;
    sessionId: string;
    origin: 'user-edit' | 'llm-operation' | 'system';
  };
  timestamp: Date | string;
}

export interface ClientSubscription {
  workspaceId: string;
  systemId: string;
  userId: string;
}

interface Client {
  ws: WebSocket;
  subscription: ClientSubscription;
  connectedAt: Date;
}

/**
 * WebSocket Server
 *
 * Broadcasts canvas updates to subscribed clients
 */
export class CanvasWebSocketServer {
  private wss: WebSocketServer;
  private clients: Map<string, Client> = new Map();
  private port: number;

  constructor(port: number = WS_PORT) {
    this.port = port;
    this.wss = new WebSocketServer({ port });
    this.setupServer();
  }

  /**
   * Setup WebSocket server event handlers
   */
  private setupServer(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      const clientId = this.generateClientId();

      ws.on('message', (data: Buffer) => {
        this.handleMessage(clientId, ws, data);
      });

      ws.on('close', () => {
        this.handleDisconnect(clientId);
      });

      ws.on('error', (error) => {
        console.error(`[WebSocket] Client ${clientId} error:`, error);
        this.handleDisconnect(clientId);
      });

      // Send connection acknowledgment
      ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        timestamp: new Date(),
      }));
    });

    this.wss.on('listening', () => {
      console.log(`[WebSocket] Server listening on port ${this.port}`);
    });

    this.wss.on('error', (error) => {
      console.error('[WebSocket] Server error:', error);
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(clientId: string, ws: WebSocket, data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'subscribe':
          this.handleSubscribe(clientId, ws, message);
          break;

        case 'unsubscribe':
          this.handleUnsubscribe(clientId);
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date() }));
          break;

        case 'graph_update':
        case 'chat_update':
          this.handleBroadcast(message as BroadcastUpdate);
          break;

        case 'shutdown':
          this.handleShutdown(message as BroadcastUpdate);
          break;

        default:
          console.warn(`[WebSocket] Unknown message type: ${message.type}`);
      }
    } catch (error) {
      console.error('[WebSocket] Message parsing error:', error);
    }
  }

  /**
   * Handle client subscription
   */
  private handleSubscribe(
    clientId: string,
    ws: WebSocket,
    message: { workspaceId: string; systemId: string; userId: string }
  ): void {
    const subscription: ClientSubscription = {
      workspaceId: message.workspaceId,
      systemId: message.systemId,
      userId: message.userId,
    };

    this.clients.set(clientId, {
      ws,
      subscription,
      connectedAt: new Date(),
    });

    console.log(
      `[WebSocket] Client ${clientId} subscribed to workspace=${subscription.workspaceId}, system=${subscription.systemId}`
    );

    // Acknowledge subscription
    ws.send(JSON.stringify({
      type: 'subscribed',
      subscription,
      timestamp: new Date(),
    }));
  }

  /**
   * Handle client unsubscribe
   */
  private handleUnsubscribe(clientId: string): void {
    this.clients.delete(clientId);
    console.log(`[WebSocket] Client ${clientId} unsubscribed`);
  }

  /**
   * Handle client disconnect
   */
  private handleDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      console.log(
        `[WebSocket] Client ${clientId} disconnected (workspace=${client.subscription.workspaceId})`
      );
      this.clients.delete(clientId);
    }
  }

  /**
   * Handle broadcast request from client
   */
  private handleBroadcast(update: BroadcastUpdate): void {
    const message = JSON.stringify(update);
    let broadcastCount = 0;

    for (const [clientId, client] of this.clients.entries()) {
      // Broadcast to ALL clients in same workspace+system
      // (Don't filter by userId - we want same-user updates across terminals)
      if (
        client.subscription.workspaceId &&
        client.subscription.systemId
      ) {
        try {
          if (client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(message);
            broadcastCount++;
          }
        } catch (error) {
          console.error(`[WebSocket] Broadcast error to client ${clientId}:`, error);
        }
      }
    }

    console.log(
      `[WebSocket] Broadcast ${update.type} to ${broadcastCount} clients`
    );
  }

  /**
   * Handle shutdown signal - broadcast to all clients then shutdown server
   */
  private async handleShutdown(update: BroadcastUpdate): Promise<void> {
    console.log('[WebSocket] Received shutdown signal');

    // Broadcast shutdown to all clients
    const message = JSON.stringify(update);
    let broadcastCount = 0;

    for (const [clientId, client] of this.clients.entries()) {
      try {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(message);
          broadcastCount++;
        }
      } catch (error) {
        console.error(`[WebSocket] Shutdown broadcast error to client ${clientId}:`, error);
      }
    }

    console.log(`[WebSocket] Shutdown signal sent to ${broadcastCount} clients`);

    // Give clients time to receive shutdown signal
    await new Promise(resolve => setTimeout(resolve, 300));

    // Shutdown the server
    console.log('[WebSocket] Shutting down server...');
    await this.close();
    process.exit(0);
  }

  /**
   * Broadcast update to all clients in same workspace+system
   */
  broadcast(update: BroadcastUpdate, workspaceId: string, systemId: string): void {
    const message = JSON.stringify(update);
    let broadcastCount = 0;

    for (const [clientId, client] of this.clients.entries()) {
      // Only broadcast to clients in same workspace+system
      if (
        client.subscription.workspaceId === workspaceId &&
        client.subscription.systemId === systemId
      ) {
        // Don't send update back to originating user (if source is defined)
        if (!update.source || client.subscription.userId !== update.source.userId) {
          try {
            if (client.ws.readyState === WebSocket.OPEN) {
              client.ws.send(message);
              broadcastCount++;
            }
          } catch (error) {
            console.error(`[WebSocket] Broadcast error to client ${clientId}:`, error);
          }
        }
      }
    }

    console.log(
      `[WebSocket] Broadcast to ${broadcastCount} clients (workspace=${workspaceId}, system=${systemId})`
    );
  }

  /**
   * Get connected clients count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get clients by workspace+system
   */
  getClientsForWorkspace(workspaceId: string, systemId: string): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (
        client.subscription.workspaceId === workspaceId &&
        client.subscription.systemId === systemId
      ) {
        count++;
      }
    }
    return count;
  }

  /**
   * Close WebSocket server
   */
  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Close all client connections
      for (const [clientId, client] of this.clients.entries()) {
        client.ws.close();
        this.clients.delete(clientId);
      }

      // Close server
      this.wss.close((err) => {
        if (err) {
          console.error('[WebSocket] Error closing server:', err);
          reject(err);
        } else {
          console.log('[WebSocket] Server closed');
          resolve();
        }
      });
    });
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }
}
