/**
 * Embedding Service (from aise project)
 *
 * Provides vector embeddings using OpenAI via LangChain.
 * Ported from aise/src/assistant/utils/vector_store.py
 *
 * @author andreas@siglochconsulting
 */

import { OpenAIEmbeddings } from '@langchain/openai';
import { OPENAI_API_KEY, EMBEDDING_MODEL, EMBEDDING_DIMENSION } from '../../shared/config.js';

export class EmbeddingService {
  private embeddings: OpenAIEmbeddings;

  constructor() {
    // Initialize OpenAI embeddings (same as aise project)
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: OPENAI_API_KEY,
      modelName: EMBEDDING_MODEL,
      dimensions: EMBEDDING_DIMENSION,
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
