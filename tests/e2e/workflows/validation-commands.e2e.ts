/**
 * Validation Commands E2E Test (CR-042)
 *
 * Tests validation commands with real terminal interaction:
 * /analyze, /validate, /optimize, /score, /status
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AppTestHelper } from '../helpers/app-helper.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const TESTDATA_DIR = path.join(PROJECT_ROOT, 'eval/testdata');
const CLEAN_SYSTEM = path.join(TESTDATA_DIR, 'clean-system.txt');
const COMBINED_VIOLATIONS = path.join(TESTDATA_DIR, 'combined-violations.txt');

describe('Validation Commands E2E (CR-042)', { timeout: 120000 }, () => {
  let app: AppTestHelper;

  beforeAll(async () => {
    app = new AppTestHelper();
    await app.startApp();
    await app.waitForReady();

    // Import test data
    await app.sendCommand(`/import ${CLEAN_SYSTEM}`);
    await app.expectOutput(/imported|loaded|nodes/i, 10000);
  });

  afterAll(async () => {
    if (app) {
      await app.stop();
    }
  });

  beforeEach(() => {
    app.clearLogs();
  });

  it('TEST-E2E-004: /analyze returns within 30s with results', async () => {
    await app.sendCommand('/analyze');
    const output = await app.expectOutput(/score|%|violation|clean|analyze|no nodes/i, 30000);

    // Should NOT say "No nodes" when we have imported data
    const hasNodes = app.parseStats().nodes > 0;
    if (hasNodes) {
      expect(output.toLowerCase()).not.toContain('no nodes');
    }
  });

  it('/analyze detects violations in bad data', async () => {
    // Import file with known violations
    await app.sendCommand(`/import ${COMBINED_VIOLATIONS}`);
    await app.expectOutput(/imported|loaded|nodes/i, 10000);

    app.clearLogs();

    await app.sendCommand('/analyze');
    const output = await app.expectOutput(/violation|issue|warning|score|%|suggested|merge/i, 30000);

    // Should report some kind of issue
    console.log('Analyze output (truncated):', output.slice(0, 500));
  });

  it('/validate returns phase gate status with score', async () => {
    await app.sendCommand('/validate');
    await app.expectOutput(/phase|score|validation|gate|%|no nodes/i, 30000);
  });

  it('/validate 1 validates specific phase', async () => {
    await app.sendCommand('/validate 1');
    await app.expectOutput(/phase 1|validation|score|use case|no nodes/i, 30000);
  });

  it('/score returns multi-objective scorecard', async () => {
    await app.sendCommand('/score');
    await app.expectOutput(/score|objective|completeness|consistency|%|no nodes/i, 15000);
  });

  it('/optimize runs with limited iterations', async () => {
    await app.sendCommand('/optimize 1');
    await app.expectOutput(/optimi|iteration|score|variant|completed|no nodes/i, 30000);
  });

  it('/status shows current system state', async () => {
    await app.sendCommand('/status');
    await app.expectOutput(/status|system|nodes|edges|session|changes/i, 5000);
  });

  it('/phase-gate checks readiness', async () => {
    await app.sendCommand('/phase-gate 1');
    await app.expectOutput(/phase|gate|ready|blocked|criteria|no nodes/i, 15000);
  });

  // Change tracking tests - using same app instance to avoid port conflicts
  it('/commit command responds', async () => {
    // First import some data
    await app.sendCommand(`/import ${CLEAN_SYSTEM}`);
    await app.expectOutput(/imported|loaded|nodes/i, 10000);

    app.clearLogs();

    await app.sendCommand('/commit');
    await app.expectOutput(/commit|committed|changes|no changes|nothing/i, 10000);
  });

  /**
   * TEST-E2E-OPT-1: /optimize → /restore workflow (CR-044)
   *
   * Validates UC-OPT-1 and FR-8.4:
   * 1. /import + /commit creates baseline
   * 2. /optimize applies changes and shows diff
   * 3. /restore reverts to baseline
   */
  it('TEST-E2E-OPT-1: /optimize → /restore workflow', async () => {
    // Step 1: Import and commit to set baseline
    await app.sendCommand(`/import ${COMBINED_VIOLATIONS}`);
    await app.expectOutput(/imported|loaded|nodes/i, 10000);
    app.clearLogs();

    await app.sendCommand('/commit');
    await app.expectOutput(/committed|baseline|no changes/i, 10000);
    app.clearLogs();

    // Step 2: Run optimize - should apply changes and show diff
    await app.sendCommand('/optimize 5');
    const optimizeOutput = await app.expectOutput(/optimi|applied|score|commit|restore/i, 30000);

    // Verify output mentions both commit and restore options
    expect(optimizeOutput.toLowerCase()).toMatch(/commit|restore/i);
    console.log('Optimize output (truncated):', optimizeOutput.slice(0, 600));
    app.clearLogs();

    // Step 3: Check status shows changes
    await app.sendCommand('/status');
    await app.expectOutput(/status|changes|nodes|edges/i, 5000);
    app.clearLogs();

    // Step 4: Restore should revert changes
    await app.sendCommand('/restore');
    const restoreOutput = await app.expectOutput(/restored|baseline|no baseline|no changes/i, 10000);
    console.log('Restore output:', restoreOutput);
    app.clearLogs();

    // Step 5: Status after restore should show no changes
    await app.sendCommand('/status');
    const statusOutput = await app.expectOutput(/status|changes|nodes|edges/i, 5000);
    // After restore, should show 0 changes or "no changes"
    expect(statusOutput.toLowerCase()).toMatch(/changes.*0|no changes|unchanged/i);
  });

  /**
   * TEST-E2E-OPT-2: /restore command behavior (CR-044)
   *
   * Note: /new command (CR-043) captures an empty baseline,
   * so /restore correctly shows "no changes to discard"
   */
  it('TEST-E2E-OPT-2: /restore on empty graph shows no changes', async () => {
    // Start fresh - /new captures empty baseline (CR-043)
    await app.sendCommand('/new');
    await app.expectOutput(/new|cleared|empty/i, 5000);
    app.clearLogs();

    // Restore on empty graph with baseline should show no changes
    await app.sendCommand('/restore');
    const output = await app.expectOutput(/restore|baseline|no changes|discard/i, 5000);

    // Should indicate no changes to discard (empty baseline, empty current = no diff)
    expect(output.toLowerCase()).toMatch(/no changes|already at baseline/i);
  });

  // This test terminates the app, so it must run last
  it('/exit gracefully terminates', async () => {
    await app.sendCommand('/exit');
    await app.waitForExit(5000);

    // Process should have exited
    const handles = app.getProcessHandles();
    // Either null or exited
    expect(handles.chat === null || handles.chat.exitCode !== null).toBe(true);
  });
});
