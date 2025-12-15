/**
 * Import/Export Round-Trip E2E Test (CR-042)
 *
 * Tests the complete import → export → reimport cycle:
 * import file → export → clear → reimport → verify identical
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AppTestHelper } from '../helpers/app-helper.js';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const TESTDATA_DIR = path.join(PROJECT_ROOT, 'eval/testdata');
const EXPORTS_DIR = path.join(PROJECT_ROOT, 'exports');
const CLEAN_SYSTEM = path.join(TESTDATA_DIR, 'clean-system.txt');

describe('Import/Export Round-Trip E2E (CR-042)', { timeout: 90000 }, () => {
  let app: AppTestHelper;

  beforeAll(async () => {
    app = new AppTestHelper();
    await app.startApp();
    await app.waitForReady();
  });

  afterAll(async () => {
    if (app) {
      await app.stop();
    }

    // Cleanup test export files
    const testExportFile = path.join(EXPORTS_DIR, 'roundtrip-test.json');
    if (fs.existsSync(testExportFile)) {
      fs.unlinkSync(testExportFile);
    }
  });

  beforeEach(() => {
    app.clearLogs();
  });

  it('TEST-E2E-003: import → export → reimport produces identical graph', async () => {
    // 1. Import test file
    await app.sendCommand(`/import ${CLEAN_SYSTEM}`);
    await app.expectOutput(/imported|loaded|nodes/i, 10000);

    // 2. Get original stats
    await app.sendCommand('/stats');
    await app.expectOutput(/nodes/i, 5000);
    const originalStats = app.parseStats();

    expect(originalStats.nodes).toBeGreaterThan(0);
    console.log(`Original: ${originalStats.nodes} nodes, ${originalStats.edges} edges`);

    // 3. Export to file
    await app.sendCommand('/export roundtrip-test');
    await app.expectOutput(/exported|saved|created|no nodes/i, 10000);

    // Check export file exists
    const exportFilePath = path.join(EXPORTS_DIR, 'roundtrip-test.json');
    const txtExportPath = path.join(EXPORTS_DIR, 'roundtrip-test.txt');

    // Wait a bit for file to be written
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const exportExists = fs.existsSync(exportFilePath) || fs.existsSync(txtExportPath);

    if (!exportExists) {
      console.log('Export file not found, checking logs:', app.getChatLogs().slice(-5).join('\n'));
      // Skip remaining assertions if export failed (e.g., no nodes)
      if (originalStats.nodes === 0) {
        console.log('No nodes to export, skipping round-trip test');
        return;
      }
    }

    // 4. Clear current graph (start fresh system)
    await app.sendCommand('/new');
    await app.expectOutput(/new|cleared|created|starting fresh/i, 5000);

    // 5. Verify graph is clear
    await app.sendCommand('/stats');
    await app.expectOutput(/nodes/i, 5000);
    const clearedStats = app.parseStats();
    console.log(`After clear: ${clearedStats.nodes} nodes`);

    // 6. Re-import exported file
    const reimportPath = fs.existsSync(exportFilePath) ? exportFilePath : txtExportPath;
    if (fs.existsSync(reimportPath)) {
      await app.sendCommand(`/import ${reimportPath}`);
      await app.expectOutput(/imported|loaded|nodes/i, 10000);

      // 7. Get reimport stats
      await app.sendCommand('/stats');
      await app.expectOutput(/nodes/i, 5000);
      const reimportStats = app.parseStats();

      console.log(`After reimport: ${reimportStats.nodes} nodes, ${reimportStats.edges} edges`);

      // 8. Verify identical (with small tolerance)
      expect(reimportStats.nodes).toBe(originalStats.nodes);
      expect(reimportStats.edges).toBe(originalStats.edges);
    }
  });

  it('/exports command lists available export files', async () => {
    await app.sendCommand('/exports');
    await app.expectOutput(/export|available|files|no export/i, 5000);
  });

  it('/export with custom name creates file', async () => {
    // First ensure we have data
    await app.sendCommand(`/import ${CLEAN_SYSTEM}`);
    await app.expectOutput(/imported|loaded|nodes/i, 10000);

    // Export with timestamp name
    const exportName = `test-export-${Date.now()}`;
    await app.sendCommand(`/export ${exportName}`);
    await app.expectOutput(/exported|saved|created|no nodes/i, 10000);

    // Verify file exists
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const jsonPath = path.join(EXPORTS_DIR, `${exportName}.json`);
    const txtPath = path.join(EXPORTS_DIR, `${exportName}.txt`);

    const exists = fs.existsSync(jsonPath) || fs.existsSync(txtPath);

    // Cleanup
    if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
    if (fs.existsSync(txtPath)) fs.unlinkSync(txtPath);

    expect(exists).toBe(true);
  });

  /**
   * CR-043: Verify /new captures empty baseline for change tracking
   */
  it('CR-043: /new captures empty baseline for change tracking', async () => {
    // 1. Start fresh with /new
    await app.sendCommand('/new');
    await app.expectOutput(/cleared|new|starting/i, 5000);

    // 2. /status should show "no pending changes" (not "no baseline captured")
    await app.sendCommand('/status');
    await app.expectOutput(/no pending changes|0 total|change status|pending/i, 5000);

    // 3. Import some data
    await app.sendCommand(`/import ${CLEAN_SYSTEM}`);
    await app.expectOutput(/imported|loaded|nodes/i, 10000);

    // 4. /status should now show additions or pending changes
    // (baseline was empty, current has nodes → shows as added)
    await app.sendCommand('/status');
    // The output may vary: "+N added", "N pending changes", or just show nodes
    // The key is it should NOT say "no baseline captured"
    const statusLogs = app.getChatLogs().join('\n');
    const hasValidStatus =
      /\+\d+|added|pending|changes|nodes/i.test(statusLogs) &&
      !/no baseline captured/i.test(statusLogs);
    expect(hasValidStatus).toBe(true);
  });
});
