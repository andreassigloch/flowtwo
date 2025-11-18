/**
 * LLM Engine Types
 *
 * Types for LLM request/response handling, caching, and auto-derivation
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

/**
 * LLM Request
 *
 * User message + context sent to LLM
 */
export interface LLMRequest {
  /** User message */
  message: string;

  /** Chat ID for context */
  chatId: string;

  /** Workspace ID */
  workspaceId: string;

  /** System ID */
  systemId: string;

  /** User ID */
  userId: string;

  /** Canvas state (Format E) */
  canvasState: string;

  /** Chat history (previous messages) */
  chatHistory?: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;

  /** Optional context hints */
  contextHints?: {
    currentView?: string;
    focusNode?: string;
    suggestedAction?: string;
  };
}

/**
 * LLM Response
 *
 * Parsed LLM output with text and operations
 */
export interface LLMResponse {
  /** Text response (without operations) */
  textResponse: string;

  /** Extracted operations (Format E Diff) */
  operations: string | null;

  /** Tokens used */
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };

  /** Cache hit/miss */
  cacheHit: boolean;

  /** Model used */
  model: string;

  /** Response ID */
  responseId: string;
}

/**
 * Prompt Section
 *
 * Section of system prompt with cache control
 */
export interface PromptSection {
  /** Section content */
  text: string;

  /** Cache control marker */
  cacheControl?: {
    type: 'ephemeral';
  };
}

/**
 * Cache Entry
 *
 * AgentDB cache entry
 */
export interface CacheEntry {
  /** Cache key (hash of request) */
  key: string;

  /** Cached response */
  response: LLMResponse;

  /** Timestamp */
  timestamp: Date;

  /** TTL (seconds) */
  ttl: number;

  /** Hit count */
  hitCount: number;
}

/**
 * Auto-Derivation Rule
 *
 * Rule for deriving child nodes from parent nodes
 */
export interface DerivationRule {
  /** Source node type */
  sourceType: string;

  /** Target node types to derive */
  targetTypes: string[];

  /** Derivation strategy */
  strategy: 'decompose' | 'satisfy' | 'verify' | 'allocate';

  /** Prompt template */
  promptTemplate: string;
}

/**
 * LLM Engine Configuration
 */
export interface LLMEngineConfig {
  /** Anthropic API key */
  apiKey: string;

  /** Model to use */
  model?: string;

  /** Max tokens for response */
  maxTokens?: number;

  /** Temperature */
  temperature?: number;

  /** Enable AgentDB caching */
  enableCache?: boolean;

  /** AgentDB connection string */
  agentDbUrl?: string;

  /** Cache TTL (seconds) */
  cacheTTL?: number;

  /** Enable auto-derivation */
  enableAutoDerivation?: boolean;
}

/**
 * System Prompt Builder Result
 */
export interface SystemPromptResult {
  /** System prompt sections */
  sections: PromptSection[];

  /** Total characters */
  totalChars: number;

  /** Cached sections count */
  cachedSections: number;
}
