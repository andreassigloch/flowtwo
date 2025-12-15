# CR-034: OpenAI-Compatible LLM Provider Integration

**Type:** Feature
**Status:** Completed
**Priority:** MEDIUM
**Created:** 2025-12-08
**Completed:** 2025-12-08

## Problem / Use Case

Currently GraphEngine only supports Anthropic Claude models via the `@anthropic-ai/sdk`. Users want to:
- Use local LLM models (e.g., LM Studio with Devstral) for offline development
- Use alternative cloud providers (OpenRouter) for cost optimization or model variety
- Reduce API costs by using local inference
- Switch between providers without code changes

**Available endpoints:**
- LM Studio (local): `http://192.168.78.202:1234` with `devstral-small-2505-mlx`
- OpenRouter (cloud): `https://openrouter.ai/api/v1` with various models

## Requirements

### Functional Requirements
- FR-1: Support OpenAI-compatible API endpoints (LM Studio, Ollama, vLLM, etc.)
- FR-2: Configuration-based provider selection (env vars)
- FR-3: Graceful fallback when local model unavailable
- FR-4: Same streaming interface as Anthropic integration

### Non-Functional Requirements
- NFR-1: No breaking changes to existing Anthropic integration
- NFR-2: Provider switch via environment variables only
- NFR-3: Comparable response quality for graph operations

## Architecture / Solution Approach

### Option A: Separate Engine Class (Recommended)

Create `openai-compatible-engine.ts` alongside existing `llm-engine.ts`:

```
src/llm-engine/
├── llm-engine.ts           # Anthropic (existing)
├── openai-engine.ts        # OpenAI-compatible (new)
├── engine-factory.ts       # Factory to select engine (new)
└── types.ts                # Shared interfaces
```

**Pros:**
- Zero risk to existing Anthropic integration
- Clean separation of concerns
- Easy to test independently

**Cons:**
- Some code duplication (streaming logic, etc.)

### Option B: Provider Abstraction

Refactor `LLMEngine` to support multiple providers via strategy pattern:

```typescript
interface LLMProvider {
  processStream(request: LLMRequest, onChunk: ChunkCallback): Promise<void>;
}

class AnthropicProvider implements LLMProvider { ... }
class OpenAIProvider implements LLMProvider { ... }
```

**Pros:**
- DRY code
- Easier to add more providers

**Cons:**
- Higher risk of breaking existing functionality
- More complex refactoring

### Recommended: Option A

Lower risk, faster implementation, keeps Anthropic integration stable.

### Configuration

```bash
# .env additions
LLM_PROVIDER=anthropic|openai          # Provider selection

# For LM Studio (local)
OPENAI_BASE_URL=http://192.168.78.202:1234/v1
OPENAI_MODEL=devstral-small-2505-mlx
OPENAI_API_KEY=not-needed              # LM Studio doesn't require key

# For OpenRouter (cloud)
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=mistralai/devstral-small:free
OPENAI_API_KEY=${OPEN_ROUTER_API_KEY}  # Requires credits
```

### Feature Differences to Handle

| Feature | Anthropic | OpenAI-Compatible |
|---------|-----------|-------------------|
| cache_control | ✅ Supported | ❌ Not available |
| Prompt caching | ✅ Metrics available | ❌ Not available |
| Usage stats | input_tokens, output_tokens | prompt_tokens, completion_tokens |
| Streaming | MessageStream | ChatCompletionStream |

## Implementation Plan

### Phase 1: OpenAI Engine (3-4 hours)
- Add `openai` npm package
- Create `openai-engine.ts` with same interface as `llm-engine.ts`
- Implement streaming for chat completions
- Handle usage stats translation

### Phase 2: Engine Factory (1-2 hours)
- Create `engine-factory.ts` for provider selection
- Add configuration to `src/shared/config.ts`
- Update `.env.example`

### Phase 3: Integration (2-3 hours)
- Update `chat-interface.ts` to use factory
- Test with LM Studio
- Handle connection errors gracefully

### Phase 4: Testing (2-3 hours)
- Unit tests for OpenAI engine
- Integration tests with mock server
- Manual testing with LM Studio

## Acceptance Criteria

- [x] Can switch to OpenAI-compatible provider via `LLM_PROVIDER=openai`
- [x] Streaming works with LM Studio
- [x] Graph operations produce valid Format E output
- [x] Graceful error handling when local server unavailable
- [x] Existing Anthropic integration unchanged
- [x] Documentation updated (.env.example, CR-034)

## Dependencies

- `openai` npm package
- Running LM Studio instance (for testing)
- Existing LLMEngine interface

## Estimated Effort

Total: 8-12 hours (1-2 days)

## Open Questions

1. Should we support model-specific system prompts? (Devstral may need different prompting)
2. How to handle rate limiting differences?
3. Should embedding model (`text-embedding-nomic-embed-text-v1.5`) also be integrated?

## References

- Current LLM engine: [llm-engine.ts](../../src/llm-engine/llm-engine.ts)
- LM Studio API: OpenAI-compatible at `http://192.168.78.202:1234/v1`
- OpenRouter API: `https://openrouter.ai/api/v1`
- Available local models: `devstral-small-2505-mlx`, `text-embedding-nomic-embed-text-v1.5`

## Notes on cache_control

Anthropic's `cache_control` feature for prompt caching is **not supported** by OpenAI-compatible APIs. The engine will:
- Strip `cache_control` fields from system prompts
- Not track cache metrics (cache_read_input_tokens, cache_creation_input_tokens)
- Function normally without caching benefits
