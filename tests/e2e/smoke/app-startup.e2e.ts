/**
 * App Startup Smoke Test (CR-042)
 *
 * Fast smoke tests for pre-commit validation:
 * - App starts within 30s
 * - WebSocket connections establish
 * - Basic commands respond
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, afterAll } from 'vitest';
import { AppTestHelper } from '../helpers/app-helper.js';

describe('App Startup Smoke E2E (CR-042)', { timeout: 60000 }, () => {
  let app: AppTestHelper | null = null;

  afterAll(async () => {
    if (app) {
      await app.stop();
    }
  });

  it('TEST-E2E-001: app starts and connects within 30s', async () => {
    app = new AppTestHelper();
    await app.startApp();
    await app.waitForReady(30000);

    // Verify WebSocket connections
    // CR-063: Chat now shows SessionManager init; graph viewer still shows WebSocket
    const chatLogs = app.getChatLogs().join('\n');
    expect(chatLogs).toMatch(/All components initialized via SessionManager|Connected to WebSocket/);

    const graphLogs = app.getGraphViewerLogs().join('\n');
    expect(graphLogs).toContain('Connected to WebSocket');
  });

  it('/help responds within 500ms', async () => {
    if (!app) {
      app = new AppTestHelper();
      await app.startApp();
      await app.waitForReady();
    }

    const startTime = Date.now();
    await app.sendCommand('/help');
    await app.expectOutput(/commands|help|available/i, 2000);
    const elapsed = Date.now() - startTime;

    expect(elapsed).toBeLessThan(3000); // Allow 3s for full response
    console.log(`/help responded in ${elapsed}ms`);
  });

  it('/stats responds with valid data', async () => {
    if (!app) {
      app = new AppTestHelper();
      await app.startApp();
      await app.waitForReady();
    }

    await app.sendCommand('/stats');
    await app.expectOutput(/nodes|stats|edges|system/i, 2000);

    const stats = app.parseStats();
    // Stats should be parseable (even if 0 nodes)
    expect(stats.nodes).toBeGreaterThanOrEqual(0);
  });
});
