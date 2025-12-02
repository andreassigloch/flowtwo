/**
 * WebSocket Server Tests
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CanvasWebSocketServer } from '../../../src/canvas/websocket-server.js';
import WebSocket from 'ws';

// Use unique port per test file to avoid conflicts
const TEST_PORT = 3050 + Math.floor(Math.random() * 100);

describe('CanvasWebSocketServer', { sequential: true }, () => {
  let server: CanvasWebSocketServer;

  beforeEach(async () => {
    server = new CanvasWebSocketServer(TEST_PORT);
    // Wait for server to start
    await new Promise((resolve) => setTimeout(resolve, 150));
  });

  afterEach(async () => {
    server.clearBroadcastCache();
    await server.close();
    // Wait for port to be released
    await new Promise((resolve) => setTimeout(resolve, 150));
  });

  it('starts WebSocket server on specified port', () => {
    expect(server.getClientCount()).toBe(0);
  });

  it('accepts client connections', (done) => {
    const client = new WebSocket(`ws://localhost:${TEST_PORT}`);

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
    const client = new WebSocket(`ws://localhost:${TEST_PORT}`);
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
    const client1 = new WebSocket(`ws://localhost:${TEST_PORT}`);
    const client2 = new WebSocket(`ws://localhost:${TEST_PORT}`);
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
    const client = new WebSocket(`ws://localhost:${TEST_PORT}`);
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
    const client = new WebSocket(`ws://localhost:${TEST_PORT}`);

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

    const client1 = new WebSocket(`ws://localhost:${TEST_PORT}`);
    const client2 = new WebSocket(`ws://localhost:${TEST_PORT}`);

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

  // ============================================
  // Broadcast Caching Tests (CR-018)
  // ============================================

  describe('Broadcast Caching', () => {
    it('caches broadcast with workspaceId and systemId', (done) => {
      const client = new WebSocket(`ws://localhost:${TEST_PORT}`);

      client.on('open', () => {
        client.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'connected') {
            client.send(JSON.stringify({
              type: 'subscribe',
              workspaceId: 'test-workspace',
              systemId: 'Test.SY.001',
              userId: 'user-test',
            }));
          } else if (message.type === 'subscribed') {
            // Send a broadcast with workspaceId and systemId
            client.send(JSON.stringify({
              type: 'graph_update',
              diff: '{"nodes":[],"edges":[]}',
              workspaceId: 'test-workspace',
              systemId: 'Test.SY.001',
              source: {
                userId: 'user-test',
                sessionId: 'session-test',
                origin: 'llm-operation',
              },
              timestamp: new Date().toISOString(),
            }));

            // Wait for broadcast to be processed
            setTimeout(() => {
              const cached = server.getCachedBroadcast('test-workspace', 'Test.SY.001');
              expect(cached).toBeDefined();
              expect(cached?.type).toBe('graph_update');
              expect(cached?.workspaceId).toBe('test-workspace');
              expect(cached?.systemId).toBe('Test.SY.001');
              client.close();
              done();
            }, 100);
          }
        });
      });
    });

    it('sends cached broadcast to new subscriber', (done) => {
      // First: cache a broadcast
      const firstClient = new WebSocket(`ws://localhost:${TEST_PORT}`);

      firstClient.on('open', () => {
        firstClient.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'connected') {
            firstClient.send(JSON.stringify({
              type: 'subscribe',
              workspaceId: 'cache-test-ws',
              systemId: 'CacheTest.SY.001',
              userId: 'first-user',
            }));
          } else if (message.type === 'subscribed') {
            // Send broadcast to cache it
            firstClient.send(JSON.stringify({
              type: 'graph_update',
              diff: '{"nodes":[["TestNode.FN.001",{"name":"CachedNode"}]],"edges":[]}',
              workspaceId: 'cache-test-ws',
              systemId: 'CacheTest.SY.001',
              source: {
                userId: 'first-user',
                sessionId: 'session-1',
                origin: 'llm-operation',
              },
              timestamp: new Date().toISOString(),
            }));

            // Wait for cache, then connect second client
            setTimeout(() => {
              const secondClient = new WebSocket(`ws://localhost:${TEST_PORT}`);
              let receivedCachedBroadcast = false;

              secondClient.on('open', () => {
                secondClient.on('message', (data) => {
                  const msg = JSON.parse(data.toString());

                  if (msg.type === 'connected') {
                    secondClient.send(JSON.stringify({
                      type: 'subscribe',
                      workspaceId: 'cache-test-ws',
                      systemId: 'CacheTest.SY.001',
                      userId: 'second-user',
                    }));
                  } else if (msg.type === 'subscribed') {
                    // After subscribed, should receive cached broadcast
                  } else if (msg.type === 'graph_update') {
                    receivedCachedBroadcast = true;
                    expect(msg.diff).toContain('CachedNode');
                    expect(msg.workspaceId).toBe('cache-test-ws');
                    expect(msg.systemId).toBe('CacheTest.SY.001');
                    firstClient.close();
                    secondClient.close();
                    done();
                  }
                });
              });
            }, 100);
          }
        });
      });
    });

    it('updates cache on new broadcast', (done) => {
      const client = new WebSocket(`ws://localhost:${TEST_PORT}`);

      client.on('open', () => {
        client.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'connected') {
            client.send(JSON.stringify({
              type: 'subscribe',
              workspaceId: 'update-cache-ws',
              systemId: 'UpdateCache.SY.001',
              userId: 'user-test',
            }));
          } else if (message.type === 'subscribed') {
            // First broadcast
            client.send(JSON.stringify({
              type: 'graph_update',
              diff: '{"version":1}',
              workspaceId: 'update-cache-ws',
              systemId: 'UpdateCache.SY.001',
              timestamp: new Date().toISOString(),
            }));

            setTimeout(() => {
              // Second broadcast (should replace first)
              client.send(JSON.stringify({
                type: 'graph_update',
                diff: '{"version":2}',
                workspaceId: 'update-cache-ws',
                systemId: 'UpdateCache.SY.001',
                timestamp: new Date().toISOString(),
              }));

              setTimeout(() => {
                const cached = server.getCachedBroadcast('update-cache-ws', 'UpdateCache.SY.001');
                expect(cached).toBeDefined();
                expect(cached?.diff).toBe('{"version":2}');
                client.close();
                done();
              }, 100);
            }, 100);
          }
        });
      });
    });

    it('returns undefined for uncached workspace+system', () => {
      const cached = server.getCachedBroadcast('nonexistent-ws', 'NonExistent.SY.001');
      expect(cached).toBeUndefined();
    });

    it('clears broadcast cache', (done) => {
      const client = new WebSocket(`ws://localhost:${TEST_PORT}`);

      client.on('open', () => {
        client.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'connected') {
            client.send(JSON.stringify({
              type: 'subscribe',
              workspaceId: 'clear-cache-ws',
              systemId: 'ClearCache.SY.001',
              userId: 'user-test',
            }));
          } else if (message.type === 'subscribed') {
            client.send(JSON.stringify({
              type: 'graph_update',
              diff: '{"test":true}',
              workspaceId: 'clear-cache-ws',
              systemId: 'ClearCache.SY.001',
              timestamp: new Date().toISOString(),
            }));

            setTimeout(() => {
              expect(server.getCachedBroadcast('clear-cache-ws', 'ClearCache.SY.001')).toBeDefined();
              server.clearBroadcastCache();
              expect(server.getCachedBroadcast('clear-cache-ws', 'ClearCache.SY.001')).toBeUndefined();
              client.close();
              done();
            }, 100);
          }
        });
      });
    });
  });
});
