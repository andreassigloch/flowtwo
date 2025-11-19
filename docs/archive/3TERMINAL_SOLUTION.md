# GraphEngine - 3 Terminal Solution

**Author:** andreas@siglochconsulting
**Date:** 2025-11-18
**Status:** ✅ IMPLEMENTED

---

## Overview

**Simple, reliable terminal UI with 3 separate Terminal.app windows.**

No tmux complexity. No FIFO escaping hell. Just 3 terminals doing their job.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Terminal 1: STDOUT / Logs                               │
│ tail -f /tmp/graphengine.log                            │
│                                                          │
│ [09:30:15] 🚀 Chat interface started                    │
│ [09:30:16] 📥 Loaded 45 nodes from Neo4j                │
│ [09:30:20] 📨 User: Add payment processing              │
│ [09:30:21] 🤖 Processing with LLM...                    │
│ [09:30:26] 📊 Graph updated (48 nodes, 62 edges)        │
│ [09:30:26] ✅ Response complete                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Terminal 2: GRAPH VIEWER                                │
│ npx tsx src/terminal-ui/graph-viewer.ts                 │
│                                                          │
│ Graph: UrbanMobility.SY.001                             │
│ View: hierarchy                                          │
│ Nodes: 48 | Edges: 62                                   │
│                                                          │
│ └─[SYS] UrbanMobility                                   │
│   ├─[UC] VehicleSharing                                 │
│   │ └─[FCHAIN] PaymentProcessing                        │
│   │   ├─[FUNC] ValidatePayment                          │
│   │   ├─[FUNC] AuthorizePayment                         │
│   │   └─[FUNC] RecordTransaction                        │
│   └─[UC] ThreatNeutralization                           │
│     └─[FCHAIN] Detection                                │
│       ├─[FUNC] ScanAirspace                             │
│       └─[FUNC] ClassifyObject                           │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Terminal 3: CHAT                                        │
│ npx tsx src/terminal-ui/chat-interface.ts               │
│                                                          │
│ You: Add payment processing                             │
│                                                          │
│ Assistant: I'll add a payment processing capability     │
│ to your system. I've created:                           │
│ - ProcessPayment function chain                         │
│ - ValidatePayment function                              │
│ - AuthorizePayment function                             │
│ - RecordTransaction function                            │
│                                                          │
│ (Graph updated - check GRAPH terminal)                  │
│                                                          │
│ You: _                                                  │
└─────────────────────────────────────────────────────────┘
```

---

## Usage

### Launch All 3 Terminals
```bash
./launch-3terminals.sh
```

This automatically:
1. Cleans up old FIFOs and logs
2. Creates IPC pipes
3. Launches Terminal 1: STDOUT (tail -f /tmp/graphengine.log)
4. Launches Terminal 2: GRAPH VIEWER
5. Launches Terminal 3: CHAT (your main interaction)

### Interact

**Terminal 3 (CHAT) is your main interface:**

```
You: Add payment processing
🤖 Processing...