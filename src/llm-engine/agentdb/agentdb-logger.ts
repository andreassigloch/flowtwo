/**
 * AgentDB Logger
 *
 * Centralized logging for AgentDB operations.
 * Tracks cache hits/misses, embeddings, and agent memory.
 *
 * @author andreas@siglochconsulting
 */

import * as fs from 'fs';
import { LOG_PATH, SUPPRESS_TEST_LOGS, LOG_LEVEL } from '../../shared/config.js';

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
    if (SUPPRESS_TEST_LOGS) return; // Skip in test mode
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
    if (SUPPRESS_TEST_LOGS) return; // Skip in test mode
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
   * Log graph snapshot stored
   */
  static graphSnapshotStored(
    systemId: string,
    sizeKB: number,
    nodeCount: number | undefined,
    edgeCount: number | undefined,
    backend: string
  ): void {
    const nodeInfo = nodeCount && edgeCount ? ` (${nodeCount} nodes, ${edgeCount} edges)` : '';
    this.log(
      AgentDBLogLevel.CACHE,
      `💾 GRAPH SNAPSHOT stored [${backend}] systemId="${systemId}" size=${sizeKB.toFixed(2)}KB${nodeInfo}`
    );
  }

  /**
   * Log graph snapshot retrieved
   */
  static graphSnapshotRetrieved(
    systemId: string,
    sizeKB: number,
    nodeCount: number | undefined,
    edgeCount: number | undefined,
    backend: string
  ): void {
    const nodeInfo = nodeCount && edgeCount ? ` (${nodeCount} nodes, ${edgeCount} edges)` : '';
    this.log(
      AgentDBLogLevel.CACHE,
      `🎯 GRAPH SNAPSHOT cache hit [${backend}] systemId="${systemId}" size=${sizeKB.toFixed(2)}KB${nodeInfo}`
    );
  }

  /**
   * Log graph snapshot cache miss
   */
  static graphSnapshotMiss(systemId: string, backend: string): void {
    this.log(
      AgentDBLogLevel.CACHE,
      `❌ GRAPH SNAPSHOT cache miss [${backend}] systemId="${systemId}"`
    );
  }

  /**
   * Log graph snapshot invalidated
   */
  static graphSnapshotInvalidated(systemId: string, backend: string): void {
    this.log(
      AgentDBLogLevel.CACHE,
      `🔄 GRAPH SNAPSHOT invalidated [${backend}] systemId="${systemId}"`
    );
  }

  /**
   * Log embedding generation
   */
  static embeddingGenerated(text: string, dimension: number): void {
    if (LOG_LEVEL !== 'DEBUG') return; // Only in debug mode
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

  /**
   * Log agent activity (CR-024)
   */
  static agentActivity(
    agentId: string,
    action: string,
    details?: string
  ): void {
    const detailsStr = details ? ` ${details}` : '';
    this.log(
      AgentDBLogLevel.INFO,
      `🤖 AGENT [${agentId}] ${action}${detailsStr}`
    );
  }

  /**
   * Log agent validation result (CR-024)
   */
  static validationResult(
    errorCount: number,
    warningCount: number
  ): void {
    this.log(
      AgentDBLogLevel.INFO,
      `✅ VALIDATION: ${errorCount} errors, ${warningCount} warnings`
    );
  }

  /**
   * Log agent review question (CR-024)
   */
  static reviewQuestion(
    semanticId: string,
    question: string
  ): void {
    this.log(
      AgentDBLogLevel.INFO,
      `❓ REVIEW [${semanticId}] ${question.substring(0, 60)}...`
    );
  }

  /**
   * Log info message (CR-032)
   */
  static info(message: string): void {
    if (SUPPRESS_TEST_LOGS) return;
    this.log(AgentDBLogLevel.INFO, message);
  }

  /**
   * Log debug message (CR-032)
   */
  static debug(message: string): void {
    if (LOG_LEVEL !== 'DEBUG') return;
    this.log(AgentDBLogLevel.DEBUG, message);
  }
}
