# CR-045: Readline Input Debounce (Preller-Problem)

**Type:** Bug Fix
**Status:** Planned
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

### Phase 1: /load Selection Fix (1h)
- [ ] Duplicate-Detection für numerische Eingaben
- [ ] Confirmation prompt bei verdächtigen Eingaben

### Phase 2: Global Debounce (2h)
- [ ] Debounce-Wrapper für readline
- [ ] Tests für verschiedene Input-Szenarien

## Acceptance Criteria

- [ ] "22" bei /load wird als verdächtig erkannt und nachgefragt
- [ ] Normale Eingabe hat keine spürbare Verzögerung
- [ ] Paste-Operationen funktionieren weiterhin

## Dependencies

- Keine

## Estimated Effort

Total: 3 Stunden

## References

- CR-038: AgentDB Race Condition (behoben - verhindert jetzt Datenverlust bei Preller)
- Node.js readline: https://nodejs.org/api/readline.html
