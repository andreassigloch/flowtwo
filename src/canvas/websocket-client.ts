/**
 * WebSocket Client for Terminal-UI
 *
 * Connects terminals to central WebSocket server
 * Handles graph updates and synchronization
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import WebSocket from 'ws';
import type { BroadcastUpdate, ClientSubscription } from './websocket-server.js';
import { WS_MAX_RECONNECT_ATTEMPTS, WS_RECONNECT_DELAY } from '../shared/config.js';

export interface GraphUpdateCallback {
  (update: BroadcastUpdate): void;
}

/**
 * WebSocket Client
 *
 * Connects to WebSocket server and handles graph updates
 */
export class CanvasWebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private subscription: ClientSubscription;
  private onUpdate: GraphUpdateCallback;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = WS_MAX_RECONNECT_ATTEMPTS;
  private reconnectDelay = WS_RECONNECT_DELAY;

  constructor(
    url: string,
    subscription: ClientSubscription,
    onUpdate: GraphUpdateCallback
  ) {
    this.url = url;
    this.subscription = subscription;
    this.onUpdate = onUpdate;
  }

  /**
   * Connect to WebSocket server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);

        this.ws.on('open', () => {
          console.log('[WS Client] Connected to server');
          this.reconnectAttempts = 0;

          // Subscribe to workspace+system
          this.send({
            type: 'subscribe',
            ...this.subscription,
          });

          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          this.handleMessage(data);
        });

        this.ws.on('close', () => {
          console.log('[WS Client] Disconnected from server');
          this.handleReconnect();
        });

        this.ws.on('error', (error) => {
          console.error('[WS Client] Error:', error.message);
          if (this.reconnectAttempts === 0) {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'connected':
          // Connection acknowledged
          break;

        case 'subscribed':
          console.log(`[WS Client] Subscribed to ${message.subscription.systemId}`);
          break;

        case 'graph_update':
        case 'chat_update':
          // Forward update to callback
          this.onUpdate(message as BroadcastUpdate);
          break;

        default:
          console.warn('[WS Client] Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('[WS Client] Error parsing message:', error);
    }
  }

  /**
   * Send message to server
   */
  send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[WS Client] Cannot send - not connected');
    }
  }

  /**
   * Broadcast graph update
   */
  broadcastUpdate(
    type: 'graph_update' | 'chat_update',
    diff: string,
    source: BroadcastUpdate['source']
  ): void {
    const update: BroadcastUpdate = {
      type,
      diff,
      source,
      timestamp: new Date(),
    };

    // Note: Client broadcasts via Canvas which has reference to server
    // This method is for future direct client-to-server broadcasting
    this.send(update);
  }

  /**
   * Broadcast any message (including shutdown)
   */
  broadcast(message: BroadcastUpdate): void {
    this.send(message);
  }

  /**
   * Handle reconnection
   */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[WS Client] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;

    console.log(`[WS Client] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error('[WS Client] Reconnection failed:', error.message);
      });
    }, delay);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
