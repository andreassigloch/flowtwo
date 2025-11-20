/**
 * AgentDB Logger
 *
 * Centralized logging for AgentDB operations.
 * Tracks cache hits/misses, embeddings, and agent memory.
 *
 * @author andreas@siglochconsulting
 */

import * as fs from 'fs';
import { LOG_PATH } from '../../shared/config.js';

/**
 * Log levels for AgentDB operations
 */
export enum AgentDBLogLevel {
  INFO = 'INFO',
  DEBUG = 'DEBUG',
  CACHE = 'CACHE',
  EPISODE = 'EPISODE',
  METRICS = 'METRICS',
  ERROR = 'ERROR',
}

/**
 * AgentDB logger utility
 */
export class AgentDBLogger {
  private static enabled = true;

  /**
   * Log a message with timestamp and category
   */
  private static log(level: AgentDBLogLevel, message: string): void {
    if (!this.enabled) return;

    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const logMsg = `[${timestamp}] [AgentDB:${level}] ${message}`;

    fs.appendFileSync(LOG_PATH, logMsg + '\n');
  }

  /**
   * Log cache hit
   */
  static cacheHit(query: string, similarity: number, backend: string): void {
    this.log(
      AgentDBLogLevel.CACHE,
      `🎯 CACHE HIT [${backend}] similarity=${similarity.toFixed(3)} query="${query.substring(0, 50)}..."`
    );
  }

  /**
   * Log cache miss
   */
  static cacheMiss(query: string, backend: string): void {
    this.log(
      AgentDBLogLevel.CACHE,
      `❌ CACHE MISS [${backend}] query="${query.substring(0, 50)}..."`
    );
  }

  /**
   * Log response stored
   */
  static responseStored(query: string, backend: string, withEmbedding: boolean): void {
    const embeddingInfo = withEmbedding ? '(with embedding)' : '(word-based)';
    this.log(
      AgentDBLogLevel.CACHE,
      `💾 STORED ${embeddingInfo} [${backend}] query="${query.substring(0, 50)}..."`
    );
  }

  /**
   * Log episode stored
   */
  static episodeStored(agentId: string, task: string, success: boolean, backend: string): void {
    const status = success ? '✅ SUCCESS' : '❌ FAILED';
    this.log(
      AgentDBLogLevel.EPISODE,
      `🧠 EPISODE ${status} [${backend}] agent="${agentId}" task="${task.substring(0, 50)}..."`
    );
  }

  /**
   * Log episodes retrieved
   */
  static episodesRetrieved(agentId: string, count: number, backend: string): void {
    this.log(
      AgentDBLogLevel.EPISODE,
      `📖 RETRIEVED ${count} episodes [${backend}] agent="${agentId}"`
    );
  }

  /**
   * Log cache metrics
   */
  static metrics(
    hits: number,
    misses: number,
    hitRate: number,
    episodes: number,
    tokensSaved: number,
    costSavings: number,
    backend: string
  ): void {
    this.log(
      AgentDBLogLevel.METRICS,
      `📊 METRICS [${backend}] hits=${hits} misses=${misses} rate=${(hitRate * 100).toFixed(1)}% episodes=${episodes} tokens_saved=${tokensSaved} cost_saved=$${costSavings.toFixed(4)}`
    );
  }

  /**
   * Log backend initialization
   */
  static backendInitialized(backend: string, withEmbeddings: boolean): void {
    const embInfo = withEmbeddings ? 'WITH OpenAI embeddings' : 'word-based matching';
    this.log(AgentDBLogLevel.INFO, `✅ Backend initialized: ${backend} (${embInfo})`);
  }

  /**
   * Log backend shutdown
   */
  static backendShutdown(backend: string): void {
    this.log(AgentDBLogLevel.INFO, `🔒 Backend shutdown: ${backend}`);
  }

  /**
   * Log cleanup operation
   */
  static cleanup(expiredCount: number, backend: string): void {
    this.log(
      AgentDBLogLevel.INFO,
      `🧹 Cleanup: removed ${expiredCount} expired entries [${backend}]`
    );
  }

  /**
   * Log error
   */
  static error(message: string, error?: Error): void {
    this.log(AgentDBLogLevel.ERROR, `⚠️ ${message}`);
    if (error) {
      this.log(AgentDBLogLevel.ERROR, `   ${error.message}`);
    }
  }

  /**
   * Log embedding generation
   */
  static embeddingGenerated(text: string, dimension: number): void {
    this.log(
      AgentDBLogLevel.DEBUG,
      `🔢 Embedding generated: dim=${dimension} text="${text.substring(0, 40)}..."`
    );
  }

  /**
   * Enable/disable logging
   */
  static setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}
