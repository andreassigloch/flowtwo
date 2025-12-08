/**
 * Embedding Service (from aise project)
 *
 * Provides vector embeddings using OpenAI via LangChain.
 * Ported from aise/src/assistant/utils/vector_store.py
 *
 * @author andreas@siglochconsulting
 */

import { OpenAIEmbeddings } from '@langchain/openai';
import { OPENAI_EMBEDDING_API_KEY, EMBEDDING_MODEL, EMBEDDING_DIMENSION } from '../../shared/config.js';

export class EmbeddingService {
  private embeddings: OpenAIEmbeddings;

  constructor() {
    // Initialize OpenAI embeddings with explicit baseURL to avoid LM Studio conflict (CR-034)
    // LangChain reads OPENAI_BASE_URL env var, which may point to LM Studio
    // We need to explicitly use OpenAI's API for embeddings
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: OPENAI_EMBEDDING_API_KEY,
      modelName: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSION,
      configuration: {
        baseURL: 'https://api.openai.com/v1',
      },
    });
  }

  /**
   * Generate embedding vector for a single text
   */
  async embedText(text: string): Promise<number[]> {
    const embedding = await this.embeddings.embedQuery(text);
    return embedding;
  }

  /**
   * Alias for embedText - required by agentdb ReflexionMemory
   * ReflexionMemory expects embedder.embed(text) -> Float32Array interface
   */
  async embed(text: string): Promise<Float32Array> {
    const embedding = await this.embedText(text);
    return new Float32Array(embedding);
  }

  /**
   * Generate embedding vectors for multiple texts
   */
  async embedTexts(texts: string[]): Promise<number[][]> {
    const embeddings = await this.embeddings.embedDocuments(texts);
    return embeddings;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
