# 📁 Prompt Loading Strategie: Filesystem vs RAM vs Anthropic Cache

## 🎯 Die Frage: Wann müssen Prompt-Dateien geladen werden?

### ✅ OPTIMALE STRATEGIE: 3-Ebenen Caching

```
┌─────────────────────────────────────────────────────────────────┐
│  EBENE 1: RAM CACHE (In-Memory)                                 │
│  ────────────────────────────────────────────────────────────  │
│  Lifetime: Bis Server-Neustart oder manuelle Invalidierung     │
│  Speed: <1ms                                                    │
│  Cost: Kostenlos                                                │
└─────────────────────────────────────────────────────────────────┘
                            ↓ (bei RAM-Miss)
┌─────────────────────────────────────────────────────────────────┐
│  EBENE 2: FILESYSTEM (Prompt Dateien)                           │
│  ────────────────────────────────────────────────────────────  │
│  Lifetime: Permanent (bis manuell geändert)                     │
│  Speed: ~10ms                                                   │
│  Cost: Kostenlos                                                │
└─────────────────────────────────────────────────────────────────┘
                            ↓ (immer)
┌─────────────────────────────────────────────────────────────────┐
│  EBENE 3: ANTHROPIC PROMPT CACHE                                │
│  ────────────────────────────────────────────────────────────  │
│  Lifetime: 5 Minuten nach letzter Nutzung                       │
│  Speed: Normale LLM-Speed (aber 90% billiger!)                  │
│  Cost: $0.30 per 1M tokens (statt $3.00)                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## ❌ FALSCHE Annahme:

> "Alle 5 Minuten muss ich die Prompt-Dateien vom Filesystem neu laden"

**NEIN!** Anthropic's Cache-Ablauf bedeutet NICHT, dass Sie die Dateien neu laden müssen!

---

## ✅ RICHTIGE Strategie:

```typescript
class PromptManager {
  // RAM CACHE - Bleibt im Memory!
  private ontologyPrompt: string | null = null;
  private agentRoles: Map<string, string> = new Map();
  private lastLoaded: Date | null = null;

  /**
   * Lädt Prompts vom Filesystem → RAM
   * NUR beim Server-Start oder bei manueller Invalidierung!
   */
  async initialize() {
    console.log('Loading prompts from filesystem...');

    // EINMAL vom Disk laden
    this.ontologyPrompt = await fs.readFile('./prompts/ontology.md', 'utf-8');

    this.agentRoles.set(
      'requirements-specialist',
      await fs.readFile('./prompts/agents/requirements.md', 'utf-8')
    );

    this.agentRoles.set(
      'architecture-designer',
      await fs.readFile('./prompts/agents/architecture.md', 'utf-8')
    );

    this.lastLoaded = new Date();
    console.log('✅ Prompts loaded into RAM');
  }

  /**
   * Gibt Prompt aus RAM zurück
   * KEINE Filesystem-Operation!
   */
  getOntologyPrompt(): string {
    if (!this.ontologyPrompt) {
      throw new Error('Prompts not initialized!');
    }
    return this.ontologyPrompt; // ← Aus RAM!
  }

  /**
   * Gibt Agent-Prompt aus RAM zurück
   */
  getAgentPrompt(agentType: string): string {
    const prompt = this.agentRoles.get(agentType);
    if (!prompt) {
      throw new Error(`Agent prompt not found: ${agentType}`);
    }
    return prompt; // ← Aus RAM!
  }

  /**
   * Invalidiert RAM-Cache (z.B. nach Prompt-Änderungen)
   * NUR bei manuellen Änderungen nötig!
   */
  async reload() {
    console.log('Reloading prompts from filesystem...');
    this.ontologyPrompt = null;
    this.agentRoles.clear();
    await this.initialize();
    console.log('✅ Prompts reloaded');
  }

  /**
   * Hot-Reload bei Datei-Änderungen (optional)
   */
  watchForChanges() {
    fs.watch('./prompts', { recursive: true }, async (event, filename) => {
      console.log(`Prompt file changed: ${filename}`);
      await this.reload();
    });
  }
}

// Singleton
export const promptManager = new PromptManager();
```

---

## 🔥 Der Flow im Detail:

### Server Start:

```typescript
// server.ts
import { promptManager } from './prompt-manager';

async function startServer() {
  // 1. Prompts EINMAL beim Start laden
  await promptManager.initialize(); // ← Filesystem → RAM

  console.log('✅ Prompts loaded into RAM');
  console.log('Server ready!');
}

startServer();
```

**Filesystem-Zugriffe: 1x beim Start** ✅

---

### Request-Handling (100+ Queries):

```typescript
// ai-assistant.service.ts

async function handleQuery(userMessage: string) {
  // RAM → Anthropic Cache
  const systemPrompt = [
    {
      type: 'text',
      text: promptManager.getOntologyPrompt(), // ← Aus RAM! (keine Filesystem-IO)
      cache_control: { type: 'ephemeral' }
    }
  ];

  // Anthropic API Call
  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    system: systemPrompt, // ← Gecacht bei Anthropic für 5 Min
    messages: [{ role: 'user', content: userMessage }]
  });

  return response;
}

// 100 Queries = 0 Filesystem-Zugriffe! ✅
```

**Filesystem-Zugriffe: 0** (alles aus RAM!) ✅

---

## ⏱️ Timing-Diagramm (100 Queries in 10 Minuten):

```
Zeit    | Filesystem | RAM Cache | Anthropic Cache | Kosten
────────|────────────|───────────|─────────────────|────────
0:00    | ✅ Load    | ✅ Hit    | Miss (first)    | $3.00
0:01    |            | ✅ Hit    | ✅ Hit (cached) | $0.30
0:02    |            | ✅ Hit    | ✅ Hit (cached) | $0.30
0:03    |            | ✅ Hit    | ✅ Hit (cached) | $0.30
0:04    |            | ✅ Hit    | ✅ Hit (cached) | $0.30
0:05    |            | ✅ Hit    | ✅ Hit (cached) | $0.30
───────────────────────────────────────────────────────────
        (5 Min Anthropic Cache läuft ab wegen Inaktivität)
───────────────────────────────────────────────────────────
0:06    |            | ✅ Hit    | Miss (expired)  | $3.00
0:07    |            | ✅ Hit    | ✅ Hit (cached) | $0.30
0:08    |            | ✅ Hit    | ✅ Hit (cached) | $0.30
...
───────────────────────────────────────────────────────────

Filesystem-Zugriffe total: 1 (nur beim Start)
RAM Cache Hits:           100 (jede Query!)
Anthropic Cache:          90% der Queries gecacht
```

---

## 🎯 Die 3 Cache-Ebenen im Code:

```typescript
class AIAssistantService {
  private promptManager: PromptManager;

  constructor() {
    this.promptManager = promptManager; // ← Singleton (RAM Cache)
  }

  async chat(userMessage: string) {
    // ─────────────────────────────────────────────────────
    // EBENE 1: RAM CACHE (promptManager)
    // ─────────────────────────────────────────────────────
    const ontologyPrompt = this.promptManager.getOntologyPrompt(); // ← RAM!
    const agentPrompt = this.promptManager.getAgentPrompt('requirements'); // ← RAM!

    // Keine Filesystem-Operationen! ✅

    // ─────────────────────────────────────────────────────
    // EBENE 2: agentDB (Semantic Cache)
    // ─────────────────────────────────────────────────────
    const cached = await agentdb.vectorSearch({ query: userMessage });
    if (cached.similarity > 0.85) {
      return cached.operations; // ← Skip LLM komplett!
    }

    // ─────────────────────────────────────────────────────
    // EBENE 3: ANTHROPIC PROMPT CACHE
    // ─────────────────────────────────────────────────────
    const systemPrompt = [
      {
        type: 'text',
        text: ontologyPrompt, // ← Aus RAM!
        cache_control: { type: 'ephemeral' } // ← Anthropic cached 5 Min
      }
    ];

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    });

    return response;
  }
}
```

---

## 📊 Performance-Vergleich:

### ❌ SCHLECHTE Strategie (Filesystem bei jeder Query):

```typescript
async function badApproach(userMessage: string) {
  // JEDES MAL vom Disk lesen! ❌
  const ontology = await fs.readFile('./prompts/ontology.md', 'utf-8'); // 10ms

  const response = await anthropic.messages.create({
    system: [{ text: ontology, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMessage }]
  });

  return response;
}

// 100 Queries = 100 × 10ms = 1000ms Filesystem-Overhead! ❌
```

### ✅ GUTE Strategie (RAM Cache):

```typescript
async function goodApproach(userMessage: string) {
  // Aus RAM lesen! ✅
  const ontology = promptManager.getOntologyPrompt(); // <1ms

  const response = await anthropic.messages.create({
    system: [{ text: ontology, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMessage }]
  });

  return response;
}

// 100 Queries = 100 × <1ms = <100ms RAM-Overhead! ✅
```

**Speedup: 10x schneller!** 🚀

---

## 🔄 Wann muss man Prompts neu laden?

### ✅ Szenarien für Reload:

```typescript
// 1. Server-Start (automatisch)
await promptManager.initialize();

// 2. Manuelle Prompt-Änderungen (Development)
app.post('/admin/reload-prompts', async (req, res) => {
  await promptManager.reload();
  res.json({ success: true, message: 'Prompts reloaded' });
});

// 3. Hot-Reload (optional, für Development)
if (process.env.NODE_ENV === 'development') {
  promptManager.watchForChanges(); // ← Auto-Reload bei Änderungen
}

// 4. Scheduled Reload (optional, z.B. täglich)
cron.schedule('0 0 * * *', async () => {
  await promptManager.reload(); // ← Täglich um Mitternacht
});
```

### ❌ NICHT nötig:

- ❌ Nach Anthropic Cache-Ablauf (5 Min)
- ❌ Bei jeder Query
- ❌ Periodisch ohne Grund

---

## 💡 Best Practices:

```typescript
class OptimizedPromptManager {
  private cache: Map<string, { content: string; loadedAt: Date }> = new Map();

  /**
   * Lazy Loading - nur bei Bedarf vom Disk
   */
  async getPrompt(key: string): Promise<string> {
    // 1. Check RAM Cache
    const cached = this.cache.get(key);
    if (cached) {
      return cached.content; // ← RAM Hit!
    }

    // 2. Load from Filesystem (nur bei Cache-Miss)
    const content = await fs.readFile(`./prompts/${key}.md`, 'utf-8');

    // 3. Store in RAM
    this.cache.set(key, {
      content,
      loadedAt: new Date()
    });

    return content;
  }

  /**
   * Selective Invalidation - nur geänderte Prompts
   */
  invalidate(key: string) {
    this.cache.delete(key);
    console.log(`Invalidated prompt: ${key}`);
  }

  /**
   * Smart Reload - nur wenn wirklich nötig
   */
  async reloadIfModified(key: string) {
    const cached = this.cache.get(key);
    if (!cached) return;

    const stats = await fs.stat(`./prompts/${key}.md`);
    const fileModified = stats.mtime;

    if (fileModified > cached.loadedAt) {
      console.log(`File modified: ${key}, reloading...`);
      this.invalidate(key);
      await this.getPrompt(key); // ← Lädt neu
    }
  }
}
```

---

## 🎯 Zusammenfassung: Wann wird was geladen?

| Zeitpunkt | Filesystem | RAM Cache | Anthropic Cache | Grund |
|-----------|------------|-----------|-----------------|-------|
| **Server Start** | ✅ Load | ✅ Fill | - | Initialisierung |
| **Query 1** | - | ✅ Hit | Miss | Erster Call |
| **Query 2-100** | - | ✅ Hit | ✅ Hit | Normalbetrieb |
| **Nach 5 Min Pause** | - | ✅ Hit | Miss | Cache expired |
| **Query 101** | - | ✅ Hit | Miss | Neuer Cache-Cycle |
| **Prompt geändert** | ✅ Reload | ♻️ Update | - | Manual/Hot-Reload |
| **Server Neustart** | ✅ Load | ✅ Fill | - | RAM verloren |

---

## ✅ Finale Code-Struktur:

```typescript
// startup.ts
import { promptManager } from './prompt-manager';

async function bootstrap() {
  console.log('🚀 Starting server...');

  // 1. Prompts laden (EINMAL)
  await promptManager.initialize();
  console.log('✅ Prompts loaded into RAM');

  // 2. Hot-Reload in Development
  if (process.env.NODE_ENV === 'development') {
    promptManager.watchForChanges();
    console.log('👀 Watching for prompt changes...');
  }

  // 3. Server starten
  app.listen(3000);
  console.log('✅ Server running on port 3000');
}

bootstrap();
```

```typescript
// ai-assistant.service.ts
export class AIAssistantService {
  async chat(userMessage: string) {
    // RAM → Anthropic (kein Filesystem!)
    const systemPrompt = [
      {
        type: 'text',
        text: promptManager.getOntologyPrompt(), // ← RAM!
        cache_control: { type: 'ephemeral' }     // ← Anthropic cached 5 Min
      }
    ];

    const response = await anthropic.messages.create({
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    });

    return response;
  }
}
```

---

## 🚀 Performance-Metriken:

**Production (1000 Queries/Tag):**

| Metrik | Mit Filesystem-Load pro Query | Mit RAM Cache |
|--------|-------------------------------|---------------|
| Filesystem-Zugriffe | 1000/Tag | 1/Tag (beim Start) |
| Latenz-Overhead | ~10ms/Query | <1ms/Query |
| I/O-Wait | 10 Sekunden/Tag | <1ms/Tag |
| **Speedup** | Baseline | **10,000x schneller!** 🚀 |

---

## ✅ Fazit:

**NEIN - Sie müssen Prompts NICHT alle 5 Minuten neu laden!**

1. ✅ **Beim Server-Start**: Einmal vom Filesystem → RAM
2. ✅ **Bei Queries**: Aus RAM → Anthropic Cache
3. ✅ **Bei Änderungen**: Manuell/Hot-Reload
4. ❌ **NICHT**: Nach Anthropic Cache-Ablauf

**Anthropic Cache-Ablauf ≠ RAM Cache-Ablauf!**

Der RAM-Cache bleibt bis Server-Neustart oder manuelle Invalidierung! 🎉
