/**
 * CR-045: Input Lock Tests
 *
 * Tests for the input locking mechanism that prevents duplicate input
 * processing during sub-dialogs like /load selection.
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock the log function before importing
vi.mock('fs', () => ({
  appendFileSync: vi.fn(),
}));

describe('CR-045: Input Lock Mechanism', () => {
  let lockInput: () => void;
  let unlockInput: () => void;
  let inputLocked: boolean;

  beforeEach(async () => {
    // Reset modules to get fresh state
    vi.resetModules();

    // We need to test the lock/unlock mechanism in isolation
    // Since the actual module has side effects, we'll test the logic pattern
    inputLocked = false;

    lockInput = () => {
      inputLocked = true;
    };

    unlockInput = () => {
      inputLocked = false;
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should start with input unlocked', () => {
    expect(inputLocked).toBe(false);
  });

  it('should lock input when lockInput() is called', () => {
    lockInput();
    expect(inputLocked).toBe(true);
  });

  it('should unlock input when unlockInput() is called', () => {
    lockInput();
    expect(inputLocked).toBe(true);
    unlockInput();
    expect(inputLocked).toBe(false);
  });

  it('should ignore input when locked (simulated line handler)', () => {
    const processedInputs: string[] = [];

    // Simulate the rl.on('line') handler logic
    const handleLine = (input: string) => {
      if (inputLocked) {
        // Input ignored while locked
        return;
      }
      processedInputs.push(input);
    };

    // Normal input processing
    handleLine('hello');
    expect(processedInputs).toEqual(['hello']);

    // Lock input (simulating /load command opening selection dialog)
    lockInput();

    // Input should be ignored
    handleLine('3');
    handleLine('3'); // Duplicate from "preller"
    expect(processedInputs).toEqual(['hello']); // Still just 'hello'

    // Unlock input (selection dialog closed)
    unlockInput();

    // New input should be processed
    handleLine('world');
    expect(processedInputs).toEqual(['hello', 'world']);
  });

  it('should prevent duplicate "22" input pattern (preller simulation)', () => {
    const mainRlInputs: string[] = [];
    const selectRlInputs: string[] = [];

    // Simulate two readline interfaces
    const mainRlHandler = (input: string) => {
      if (inputLocked) {
        // Ignored - this is the fix for CR-045
        return;
      }
      mainRlInputs.push(input);
    };

    const selectRlHandler = (input: string) => {
      selectRlInputs.push(input);
    };

    // User types /load
    mainRlHandler('/load');
    expect(mainRlInputs).toEqual(['/load']);

    // /load command locks input and opens selection dialog
    lockInput();

    // User types "2" but due to keyboard "preller", "22" is generated
    // Both readline interfaces receive the input simultaneously

    // The selectRl (intended recipient) receives it
    selectRlHandler('2');

    // The mainRl also receives it but should ignore due to lock
    mainRlHandler('2');

    // Without fix, mainRl would also process "2" causing duplicate processing
    // With fix, mainRl ignores it
    expect(mainRlInputs).toEqual(['/load']); // No extra "2"
    expect(selectRlInputs).toEqual(['2']); // selectRl processes normally

    // Selection dialog closes
    unlockInput();

    // Normal operation resumes
    mainRlHandler('hello');
    expect(mainRlInputs).toEqual(['/load', 'hello']);
  });

  it('should handle rapid lock/unlock cycles', () => {
    const processed: string[] = [];

    const handleLine = (input: string) => {
      if (inputLocked) return;
      processed.push(input);
    };

    // Multiple rapid cycles
    for (let i = 0; i < 5; i++) {
      handleLine(`before-${i}`);
      lockInput();
      handleLine(`during-${i}`); // Should be ignored
      unlockInput();
      handleLine(`after-${i}`);
    }

    // Only 'before' and 'after' should be processed
    expect(processed).toEqual([
      'before-0', 'after-0',
      'before-1', 'after-1',
      'before-2', 'after-2',
      'before-3', 'after-3',
      'before-4', 'after-4',
    ]);
  });
});

describe('CR-045: Duplicate Input Detection', () => {
  it('should detect obvious duplicate patterns like "22" or "33"', () => {
    // This test documents the pattern we want to protect against
    const detectObviousDuplicate = (input: string): boolean => {
      // Single digit duplicated (e.g., "22", "33", "11")
      if (input.length === 2 && /^\d\d$/.test(input) && input[0] === input[1]) {
        return true;
      }
      return false;
    };

    expect(detectObviousDuplicate('22')).toBe(true);
    expect(detectObviousDuplicate('33')).toBe(true);
    expect(detectObviousDuplicate('11')).toBe(true);
    expect(detectObviousDuplicate('2')).toBe(false);
    expect(detectObviousDuplicate('23')).toBe(false);
    expect(detectObviousDuplicate('hello')).toBe(false);
  });
});

describe('CR-045: readline.pause() Fix', () => {
  it('should simulate mainRl.pause/resume preventing stdin consumption', () => {
    // Simulate the fix: mainRl.pause() prevents it from receiving stdin
    // while selectRl is active
    let mainRlPaused = false;
    const mainRlBuffer: string[] = [];
    const selectRlBuffer: string[] = [];

    // Simulate stdin characters arriving
    const simulateStdin = (char: string) => {
      // When mainRl is paused, it doesn't consume from stdin
      // Only the active (unpaused) readline gets the input
      if (!mainRlPaused) {
        mainRlBuffer.push(char);
      }
      // selectRl always receives when active (it's the intended recipient)
      // In real code, selectRl is created AFTER mainRl.pause()
    };

    // Normal operation - mainRl gets input
    simulateStdin('h');
    simulateStdin('e');
    simulateStdin('l');
    simulateStdin('l');
    simulateStdin('o');
    expect(mainRlBuffer.join('')).toBe('hello');

    // /load command: pause mainRl, create selectRl
    mainRlPaused = true;
    mainRlBuffer.length = 0; // Clear for next test

    // User types "3" for selection
    // With pause, mainRl doesn't receive it
    simulateStdin('3');
    expect(mainRlBuffer).toEqual([]); // mainRl didn't receive

    // selectRl processes the input (separate handler)
    selectRlBuffer.push('3');
    expect(selectRlBuffer).toEqual(['3']);

    // Selection complete: resume mainRl
    mainRlPaused = false;

    // Normal operation resumes
    simulateStdin('x');
    expect(mainRlBuffer).toEqual(['x']);
  });

  it('should prevent preller when mainRl is paused', () => {
    // The actual fix: mainRl.pause() before selectRl creation
    // This prevents the scenario where BOTH readlines receive the same keystroke
    let mainRlPaused = false;
    let inputLocked = false;
    const mainRlProcessed: string[] = [];
    const selectRlProcessed: string[] = [];

    const mainRlOnLine = (input: string) => {
      // Double protection: pause + lock
      if (mainRlPaused || inputLocked) return;
      mainRlProcessed.push(input);
    };

    const selectRlOnLine = (input: string) => {
      selectRlProcessed.push(input);
    };

    // User types /load
    mainRlOnLine('/load');
    expect(mainRlProcessed).toEqual(['/load']);

    // /load handler: lock + pause
    inputLocked = true;
    mainRlPaused = true;

    // Preller scenario: keyboard sends "33" rapidly
    // With pause, mainRl doesn't even see the input
    mainRlOnLine('3');
    mainRlOnLine('3'); // Preller duplicate
    selectRlOnLine('3'); // Only selectRl processes

    expect(mainRlProcessed).toEqual(['/load']); // No preller leak
    expect(selectRlProcessed).toEqual(['3']);

    // Cleanup
    inputLocked = false;
    mainRlPaused = false;

    mainRlOnLine('done');
    expect(mainRlProcessed).toEqual(['/load', 'done']);
  });
});
