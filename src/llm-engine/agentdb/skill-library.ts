/**
 * Skill Library (CR-032 Phase 6 / CR-026)
 *
 * Stores successful patterns from validated graph operations.
 * Enables learning from past successes for future similar tasks.
 *
 * Features:
 * - Store successful operation patterns with context
 * - Find applicable patterns by task similarity
 * - Track pattern effectiveness over time
 *
 * @author andreas@siglochconsulting
 */

/**
 * Skill pattern representing a successful operation
 */
export interface SkillPattern {
  id: string;
  task: string;           // Original task description
  operations: string;     // Format E operations that succeeded
  context: {
    phase: string;        // Phase when pattern was applied
    nodeTypes: string[];  // Node types created/modified
    edgeTypes: string[];  // Edge types used
  };
  reward: number;         // Validation score achieved
  usageCount: number;     // Times this pattern was applied
  successRate: number;    // Success rate when reused
  createdAt: number;
  lastUsedAt: number;
}

/**
 * Pattern match result
 */
export interface PatternMatch {
  pattern: SkillPattern;
  similarity: number;
}

/**
 * Skill Library
 *
 * Stores and retrieves successful operation patterns.
 */
export class SkillLibrary {
  private patterns: Map<string, SkillPattern> = new Map();
  private patternCounter = 0;

  // Configuration
  private readonly config = {
    minRewardThreshold: 0.7,     // Minimum reward to store pattern
    minSimilarityThreshold: 0.5, // Minimum similarity to return pattern
    maxPatterns: 1000,           // Maximum patterns to store
    decayFactor: 0.95,           // Success rate decay per failed reuse
  };

  /**
   * Record a successful pattern
   */
  recordSuccess(
    task: string,
    operations: string,
    context: SkillPattern['context'],
    reward: number
  ): string | null {
    // Only store patterns with high enough reward
    if (reward < this.config.minRewardThreshold) {
      return null;
    }

    // Check for duplicate patterns
    const existing = this.findExactMatch(task, operations);
    if (existing) {
      // Update existing pattern
      existing.usageCount++;
      existing.lastUsedAt = Date.now();
      existing.successRate = this.updateSuccessRate(existing.successRate, true);
      return existing.id;
    }

    // Create new pattern
    this.patternCounter++;
    const id = `skill-${this.patternCounter}`;
    const now = Date.now();

    const pattern: SkillPattern = {
      id,
      task,
      operations,
      context,
      reward,
      usageCount: 1,
      successRate: 1.0,
      createdAt: now,
      lastUsedAt: now,
    };

    this.patterns.set(id, pattern);

    // Prune if over limit
    this.pruneOldPatterns();

    return id;
  }

  /**
   * Record a failed reuse of a pattern
   */
  recordFailure(patternId: string): void {
    const pattern = this.patterns.get(patternId);
    if (pattern) {
      pattern.successRate = this.updateSuccessRate(pattern.successRate, false);
      pattern.lastUsedAt = Date.now();
    }
  }

  /**
   * Find applicable patterns for a task
   */
  findApplicablePatterns(
    task: string,
    context?: Partial<SkillPattern['context']>,
    maxResults: number = 3
  ): PatternMatch[] {
    const matches: PatternMatch[] = [];

    for (const pattern of this.patterns.values()) {
      // Calculate task similarity (simple word overlap)
      const similarity = this.calculateSimilarity(task, pattern.task);

      if (similarity >= this.config.minSimilarityThreshold) {
        // Boost similarity if context matches
        let contextBoost = 0;
        if (context) {
          if (context.phase && pattern.context.phase === context.phase) {
            contextBoost += 0.1;
          }
          if (context.nodeTypes) {
            const overlap = context.nodeTypes.filter(t =>
              pattern.context.nodeTypes.includes(t)
            ).length;
            contextBoost += overlap * 0.05;
          }
        }

        matches.push({
          pattern,
          similarity: Math.min(1.0, similarity + contextBoost),
        });
      }
    }

    // Sort by combined score (similarity * success rate)
    matches.sort((a, b) => {
      const scoreA = a.similarity * a.pattern.successRate;
      const scoreB = b.similarity * b.pattern.successRate;
      return scoreB - scoreA;
    });

    return matches.slice(0, maxResults);
  }

  /**
   * Get pattern by ID
   */
  getPattern(id: string): SkillPattern | null {
    return this.patterns.get(id) ?? null;
  }

  /**
   * Get all patterns
   */
  getAllPatterns(): SkillPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get library statistics
   */
  getStats(): {
    totalPatterns: number;
    avgSuccessRate: number;
    avgReward: number;
    topPatterns: SkillPattern[];
  } {
    const patterns = Array.from(this.patterns.values());

    if (patterns.length === 0) {
      return {
        totalPatterns: 0,
        avgSuccessRate: 0,
        avgReward: 0,
        topPatterns: [],
      };
    }

    const avgSuccessRate = patterns.reduce((sum, p) => sum + p.successRate, 0) / patterns.length;
    const avgReward = patterns.reduce((sum, p) => sum + p.reward, 0) / patterns.length;

    // Top patterns by usage * success rate
    const topPatterns = [...patterns]
      .sort((a, b) => (b.usageCount * b.successRate) - (a.usageCount * a.successRate))
      .slice(0, 5);

    return {
      totalPatterns: patterns.length,
      avgSuccessRate,
      avgReward,
      topPatterns,
    };
  }

  /**
   * Clear all patterns
   */
  clear(): void {
    this.patterns.clear();
    this.patternCounter = 0;
  }

  /**
   * Export patterns for persistence
   */
  exportPatterns(): SkillPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Import patterns from persistence
   */
  importPatterns(patterns: SkillPattern[]): void {
    for (const pattern of patterns) {
      this.patterns.set(pattern.id, pattern);
      const num = parseInt(pattern.id.replace('skill-', ''), 10);
      if (num > this.patternCounter) {
        this.patternCounter = num;
      }
    }
  }

  /**
   * Calculate word-based similarity between two texts
   */
  private calculateSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(text2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

    if (words1.size === 0 || words2.size === 0) return 0;

    let intersection = 0;
    for (const word of words1) {
      if (words2.has(word)) intersection++;
    }

    // Jaccard similarity
    const union = words1.size + words2.size - intersection;
    return intersection / union;
  }

  /**
   * Find exact match by task and operations
   */
  private findExactMatch(task: string, operations: string): SkillPattern | null {
    for (const pattern of this.patterns.values()) {
      if (pattern.task === task && pattern.operations === operations) {
        return pattern;
      }
    }
    return null;
  }

  /**
   * Update success rate with exponential moving average
   */
  private updateSuccessRate(current: number, success: boolean): number {
    const alpha = 0.3; // Learning rate
    const newValue = success ? 1.0 : 0.0;
    return current * (1 - alpha) + newValue * alpha;
  }

  /**
   * Prune old/unused patterns when over limit
   */
  private pruneOldPatterns(): void {
    if (this.patterns.size <= this.config.maxPatterns) return;

    // Sort by score (usage * success * recency)
    const now = Date.now();
    const patterns = Array.from(this.patterns.entries())
      .map(([id, p]) => ({
        id,
        score: p.usageCount * p.successRate * (1 - (now - p.lastUsedAt) / (30 * 24 * 60 * 60 * 1000)),
      }))
      .sort((a, b) => a.score - b.score);

    // Remove lowest scoring patterns
    const toRemove = patterns.slice(0, patterns.length - this.config.maxPatterns);
    for (const { id } of toRemove) {
      this.patterns.delete(id);
    }
  }
}

/**
 * Create a new SkillLibrary instance
 */
export function createSkillLibrary(): SkillLibrary {
  return new SkillLibrary();
}
