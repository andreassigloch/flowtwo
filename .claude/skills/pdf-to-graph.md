---
name: pdf-to-graph
description: Extract structured specification graph from PDF documents using LLM
version: 3.0.0
author: andreas@siglochconsulting
tags: [pdf, extraction, graph, systems-engineering, ontology, llm, anonymization]
---

# PDF to Graph Extraction Skill

Extract structured specification graphs from PDF documents (user manuals, technical specifications) using LLM-powered analysis compliant with GraphEngine ontology.

## When to Use

- Extracting requirements from technical manuals
- Building system models from specification documents
- Creating traceable graphs from legacy documentation
- Converting PDFs to structured data for GraphEngine
- Anonymizing OEM/product references for demos or training

## Usage

### Basic Extraction
```bash
# Single PDF
npm run start -- extract document.pdf

# Multiple PDFs for one system (auto-merges related docs)
npm run start -- extract manual.pdf safety.pdf install.pdf
```

### With Anonymization
```bash
# Replace OEM names with <OEM> and type designations with <TYP>
npm run start -- extract --anonymize document.pdf
```

### Language Filtering
```bash
# Extract only German content (default)
npm run start -- extract -l de document.pdf

# Extract only English content
npm run start -- extract -l en document.pdf
```

### Provider Selection
```bash
# Claude (default)
npm run start -- extract --provider claude document.pdf

# OpenAI
npm run start -- extract --provider openai document.pdf

# Ollama (localhost)
npm run start -- extract --provider ollama --model llama3.1:70b document.pdf

# Local LLM (192.168.78.202:1234)
npm run start -- extract --provider local document.pdf
```

### With Options
```bash
npm run start -- extract \
  --name "VVM S320" \
  --output ./graphs \
  --format json \
  --anonymize \
  -l de \
  manual.pdf safety.pdf
```

### Analyze First (Recommended)
```bash
# Check document structure and languages
npm run start -- analyze document.pdf

# Then extract
npm run start -- extract document.pdf
```

## Environment Variables

```bash
export ANTHROPIC_API_KEY=sk-ant-...    # For Claude
export OPENAI_API_KEY=sk-...            # For OpenAI
export OLLAMA_BASE_URL=http://localhost:11434  # For Ollama
```

## Multi-Document Analysis

When multiple PDFs are provided, the system:
1. **Classifies documents** (user-manual, installer-manual, safety-manual, compliance, etc.)
2. **Detects relationships** between documents (same system, shared components)
3. **Recommends processing order** based on content hierarchy
4. **Eliminates duplicates** across documents

### Document Types Detected
- `user-manual` - End user documentation
- `installer-manual` - Professional installation guides
- `safety-manual` - Safety instructions and warnings
- `compliance` - Regulatory compliance documentation
- `datasheet` - Technical specifications
- `quick-guide` - Quick start guides

## Anonymization

The `--anonymize` flag replaces:
- **OEM names** → `<OEM>` (NIBE, Bosch, Stihl, Renault, etc.)
- **Type designations** → `<TYP>` (VVM S320, iMOW 5.0, NU 1402-8, etc.)

Useful for:
- Demo environments without NDA concerns
- Training data preparation
- Cross-manufacturer analysis

## Ontology Reference

### Node Types
| Type | Abbr | Description |
|------|------|-------------|
| SYS | SY | System boundary (root) |
| UC | UC | Use Case |
| REQ | RQ | Requirement |
| FUNC | FN | Function |
| MOD | MD | Module/Component |
| TEST | TC | Test Case |
| ACTOR | AC | External entity |
| FLOW | FL | Data Flow |
| FCHAIN | FC | Function Chain |
| SCHEMA | SC | Global definition |

### Edge Types
| Type | Abbr | Description |
|------|------|-------------|
| compose | cp | Parent-child hierarchy |
| satisfy | sat | Requirement satisfaction |
| verify | ver | Test verification |
| allocate | alc | Function→Module mapping |
| io | io | Data flow |
| relation | rel | Generic relationship |

## Output Formats

- `format-e` (default) - Token-efficient serialization (.txt)
- `json` - Native graph format
- `jsonld` - Linked Data format
- `graphml` - Graph visualization tools (yEd, Gephi)
- `csv` - Spreadsheet tools
- `markdown` - Human-readable documentation

## CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--provider` | LLM provider (claude/openai/ollama/local) | claude |
| `--model` | Model override | - |
| `--anonymize` | Replace OEM/types with placeholders | false |
| `-l, --language` | Filter by language (de/en) | de |
| `-o, --output` | Output directory | ./output |
| `-f, --format` | Export format | format-e |
| `-n, --name` | System name override | from PDF |
| `-v, --verbose` | Verbose output | false |

## Examples

### Heat Pump Documentation Set
```bash
npm run start -- extract \
  -l de \
  --anonymize \
  -o output \
  examples/heatpump/*.pdf
```

### STIHL Robot Mower (English)
```bash
npm run start -- extract \
  -l en \
  --anonymize \
  examples/DVS_STIHL_*.pdf
```

### Renault Vehicle Manual
```bash
npm run start -- extract \
  -l de \
  --anonymize \
  examples/GUI_NU_REN_*.pdf
```

### Cost-Conscious Extraction (Ollama)
```bash
# Free local extraction
npm run start -- extract \
  --provider ollama \
  --model llama3.1:8b \
  document.pdf
```

### Batch Processing
```bash
for f in docs/*.pdf; do
  npm run start -- extract --anonymize -o ./graphs "$f"
done
```

## Troubleshooting

### Large Documents
```bash
# Check structure first
npm run start -- analyze large.pdf
```

### Rate Limits
The system automatically handles rate limits with exponential backoff.

### Missing Language Pages
If extraction is empty, check the language filtering:
```bash
# See available languages
npm run start -- analyze document.pdf

# Extract different language
npm run start -- extract -l en document.pdf
```
