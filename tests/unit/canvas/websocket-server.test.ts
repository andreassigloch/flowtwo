/**
 * WebSocket Server Tests
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CanvasWebSocketServer } from '../../../src/canvas/websocket-server.js';
import WebSocket from 'ws';

describe('CanvasWebSocketServer', () => {
  let server: CanvasWebSocketServer;
  const testPort = 3002;

  beforeEach(async () => {
    server = new CanvasWebSocketServer(testPort);
    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    await server.close();
  });

  it('starts WebSocket server on specified port', () => {
    expect(server.getClientCount()).toBe(0);
  });

  it('accepts client connections', (done) => {
    const client = new WebSocket(`ws://localhost:${testPort}`);

    client.on('open', () => {
      // Server should send connection acknowledgment
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        expect(message.type).toBe('connected');
        expect(message.clientId).toBeDefined();
        client.close();
        done();
      });
    });
  });

  it('handles client subscription', (done) => {
    const client = new WebSocket(`ws://localhost:${testPort}`);
    let connectedReceived = false;

    client.on('open', () => {
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'connected') {
          connectedReceived = true;
          // Send subscription
          client.send(JSON.stringify({
            type: 'subscribe',
            workspaceId: 'ws-test',
            systemId: 'TestSystem.SY.001',
            userId: 'user-test',
          }));
        } else if (message.type === 'subscribed') {
          expect(connectedReceived).toBe(true);
          expect(message.subscription.workspaceId).toBe('ws-test');
          expect(message.subscription.systemId).toBe('TestSystem.SY.001');
          expect(server.getClientsForWorkspace('ws-test', 'TestSystem.SY.001')).toBe(1);
          client.close();
          done();
        }
      });
    });
  });

  it('broadcasts updates to subscribed clients only', (done) => {
    const client1 = new WebSocket(`ws://localhost:${testPort}`);
    const client2 = new WebSocket(`ws://localhost:${testPort}`);
    let client1Subscribed = false;
    let client2Subscribed = false;

    const subscribe = (client: WebSocket, userId: string) => {
      client.send(JSON.stringify({
        type: 'subscribe',
        workspaceId: 'ws-test',
        systemId: 'TestSystem.SY.001',
        userId,
      }));
    };

    client1.on('open', () => {
      client1.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'connected') {
          subscribe(client1, 'user1');
        } else if (message.type === 'subscribed') {
          client1Subscribed = true;
          checkReady();
        } else if (message.type === 'graph_update') {
          broadcastReceived = true;
          expect(message.diff).toBeDefined();
          expect(message.source.userId).toBe('user2');
          client1.close();
          client2.close();
          done();
        }
      });
    });

    client2.on('open', () => {
      client2.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'connected') {
          subscribe(client2, 'user2');
        } else if (message.type === 'subscribed') {
          client2Subscribed = true;
          checkReady();
        }
      });
    });

    const checkReady = () => {
      if (client1Subscribed && client2Subscribed) {
        // Broadcast update from user2
        server.broadcast(
          {
            type: 'graph_update',
            diff: '<operations>+ TestNode|FUNC|TestNode.FN.001</operations>',
            source: {
              userId: 'user2',
              sessionId: 'session-test',
              origin: 'user-edit',
            },
            timestamp: new Date(),
          },
          'ws-test',
          'TestSystem.SY.001'
        );
      }
    };
  });

  it('does not broadcast to originating user', (done) => {
    const client = new WebSocket(`ws://localhost:${testPort}`);
    let messageCount = 0;

    client.on('open', () => {
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());
        messageCount++;

        if (message.type === 'connected') {
          client.send(JSON.stringify({
            type: 'subscribe',
            workspaceId: 'ws-test',
            systemId: 'TestSystem.SY.001',
            userId: 'user1',
          }));
        } else if (message.type === 'subscribed') {
          // Broadcast from same user
          server.broadcast(
            {
              type: 'graph_update',
              diff: '<operations></operations>',
              source: {
                userId: 'user1', // Same as subscriber
                sessionId: 'session-test',
                origin: 'user-edit',
              },
              timestamp: new Date(),
            },
            'ws-test',
            'TestSystem.SY.001'
          );

          // Wait to ensure no broadcast received
          setTimeout(() => {
            expect(messageCount).toBe(2); // Only connected + subscribed
            client.close();
            done();
          }, 100);
        } else if (message.type === 'graph_update') {
          // Should NOT receive this
          done(new Error('Should not broadcast to originating user'));
        }
      });
    });
  });

  it('handles ping-pong', (done) => {
    const client = new WebSocket(`ws://localhost:${testPort}`);

    client.on('open', () => {
      client.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'connected') {
          client.send(JSON.stringify({ type: 'ping' }));
        } else if (message.type === 'pong') {
          expect(message.timestamp).toBeDefined();
          client.close();
          done();
        }
      });
    });
  });

  it('tracks client count correctly', (done) => {
    expect(server.getClientCount()).toBe(0);

    const client1 = new WebSocket(`ws://localhost:${testPort}`);
    const client2 = new WebSocket(`ws://localhost:${testPort}`);

    let openCount = 0;

    const onOpen = () => {
      openCount++;
      if (openCount === 2) {
        setTimeout(() => {
          expect(server.getClientCount()).toBe(2);
          client1.close();
          client2.close();

          setTimeout(() => {
            expect(server.getClientCount()).toBe(0);
            done();
          }, 100);
        }, 100);
      }
    };

    client1.on('open', onOpen);
    client2.on('open', onOpen);
  });
});
