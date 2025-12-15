# CR-045: Readline Input Debounce (Preller-Problem)

**Type:** Bug Fix
**Status:** Completed
**Priority:** MEDIUM
**Created:** 2025-12-11

## Problem / Use Case

Bei schneller Tastatureingabe im Terminal werden Zeichen doppelt registriert ("Preller"):
- User tippt "2" → System empfängt "22"
- User tippt "3" → System empfängt "33"

Dies führt zu:
1. Ungültigen Eingaben bei `/load` Auswahl (z.B. "22" statt "2")
2. Unerwarteten LLM-Requests mit falschen Eingaben
3. Verwirrung beim User

## Root Cause Analysis

Node.js `readline` Interface verarbeitet jeden Tastendruck sofort. Bei mechanischem "Prellen" der Taste oder schnellem Tippen werden mehrere Events für einen logischen Tastendruck generiert.

**Betroffene Stellen:**
- `src/terminal-ui/chat-interface.ts` - Haupt-readline für User-Input
- `src/terminal-ui/commands/session-commands.ts` - Temporäres readline für `/load` Auswahl

## Requirements

### Functional Requirements

**FR-1: Input Debounce**
- Implementiere Debounce für readline Input (50-100ms)
- Verhindere doppelte Zeichen bei schnellem Tippen

**FR-2: /load Selection Protection**
- Validiere Eingabe vor Verarbeitung
- Zeige Warnung bei ungültiger Auswahl

### Non-Functional Requirements

**NFR-1:** Keine spürbare Verzögerung bei normaler Eingabe
**NFR-2:** Kompatibel mit Paste-Operationen (längere Strings)

## Architecture / Solution Approach

### Option A: Readline Debounce Wrapper
```typescript
function createDebouncedReadline(options: readline.ReadLineOptions) {
  const rl = readline.createInterface(options);
  let lastInput = '';
  let lastTime = 0;

  const originalQuestion = rl.question.bind(rl);
  rl.question = (query, callback) => {
    originalQuestion(query, (answer) => {
      const now = Date.now();
      // Ignore if same input within 100ms
      if (answer === lastInput && now - lastTime < 100) {
        return;
      }
      lastInput = answer;
      lastTime = now;
      callback(answer);
    });
  };

  return rl;
}
```

### Option B: Input Validation Layer
Validiere numerische Eingaben bei `/load`:
```typescript
const num = parseInt(answer.trim(), 10);
// Check for obvious duplicates like "22", "33"
if (answer.length === 2 && answer[0] === answer[1]) {
  console.log(`Did you mean "${answer[0]}"? (y/n)`);
}
```

## Implementation Plan

### Phase 1: Input Lock Mechanism (Implemented)
- [x] `lockInput()` / `unlockInput()` functions in chat-interface.ts
- [x] `inputLocked` flag checked in `rl.on('line')` handler
- [x] Main readline ignores input while sub-dialog is active

### Phase 2: /load Selection Fix (Implemented)
- [x] Call `lockInput()` before opening selection dialog
- [x] Call `unlockInput()` after selection dialog closes
- [x] Main readline skips processing while locked

### Phase 3: Unit Tests (Implemented)
- [x] `tests/unit/terminal-ui/input-lock.test.ts` - 7 tests
- [x] Tests for lock/unlock cycle
- [x] Tests for duplicate input prevention
- [x] Tests for "preller" simulation

## Acceptance Criteria

- [x] Input during /load selection is ignored by main readline
- [x] No "22" or "33" duplicates processed during selection
- [x] Normale Eingabe hat keine spürbare Verzögerung
- [x] 7 unit tests pass

## Dependencies

- Keine

## Estimated Effort

Total: 3 Stunden

## Solution Approach (Implemented)

### Initial Approach (Partial Fix)
Input lock mechanism with `lockInput()` / `unlockInput()` - prevented duplicate processing but not double echo.

### Final Fix (2025-12-15)
**Root Cause:** Two readline interfaces sharing stdin both echo input (Node.js Issue #30510).

**Solution:** Use `mainRl.question()` instead of creating a second readline interface:

```typescript
// BEFORE (Bug): Two readlines = double echo
const selectRl = readline.createInterface({...});
selectRl.question('Enter number:', callback);

// AFTER (Fix): Reuse mainRl
mainRl.question('Enter number:', callback);
```

**Key files:**
- `src/terminal-ui/chat-interface.ts` - lockInput(), unlockInput(), inputLocked check
- `src/terminal-ui/commands/session-commands.ts` - uses mainRl.question() for selection

**Lessons Learned:**
1. Two readlines on same stdin = double echo (not just double processing)
2. `pause()` prevents processing, not echo
3. Mock-based tests don't catch TTY behavior
4. Web research earlier - Node.js issues had the answer

## References

- [Node.js Issue #30510: readline duplicates input](https://github.com/nodejs/node/issues/30510)
- [Node.js Issue #25875: Double keypress in readline](https://github.com/nodejs/node/issues/25875)
- Node.js readline: https://nodejs.org/api/readline.html
