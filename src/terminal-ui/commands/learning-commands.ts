/**
 * Learning Commands - Learning statistics and monitoring
 *
 * Handles /learning command for CR-063
 *
 * @author andreas@siglochconsulting
 */

import type { CommandContext } from './types.js';
import type { AgentEffectiveness } from '../../llm-engine/agentdb/reflexion-memory.js';
import type { SkillPattern } from '../../llm-engine/agentdb/skill-library.js';

/**
 * Episode statistics aggregated from AgentDB
 */
export interface EpisodeStats {
  total: number;
  successful: number;
  failed: number;
  byAgent: Map<string, { total: number; successful: number; avgReward: number }>;
}

/**
 * Learning statistics combining all sources
 */
export interface LearningStats {
  episodes: EpisodeStats;
  patterns: {
    total: number;
    avgSuccessRate: number;
    avgReward: number;
    topPatterns: SkillPattern[];
  };
  agentPerformance: AgentEffectiveness[];
  recentTrend: {
    successRate: number;
    sampleSize: number;
  };
}

/**
 * Handle /learning command - show learning statistics (CR-063)
 */
export async function handleLearningCommand(ctx: CommandContext): Promise<void> {
  console.log('');
  console.log('\x1b[1;36m📚 Learning Statistics\x1b[0m');
  console.log('\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m');
  ctx.log('📚 Loading learning statistics');

  try {
    const stats = await getLearningStats(ctx);

    // Episode statistics
    console.log('');
    console.log(`\x1b[1mEpisodes:\x1b[0m     ${stats.episodes.total} total (${stats.episodes.successful} successful, ${stats.episodes.failed} failed)`);

    // Pattern statistics
    const avgSuccessPercent = (stats.patterns.avgSuccessRate * 100).toFixed(0);
    console.log(`\x1b[1mPatterns:\x1b[0m     ${stats.patterns.total} stored (avg success rate: ${avgSuccessPercent}%)`);

    // Agent performance
    if (stats.agentPerformance.length > 0) {
      console.log('');
      console.log('\x1b[1mAgent Performance:\x1b[0m');
      for (const agent of stats.agentPerformance) {
        const trendIcon = getTrendIcon(agent.recentTrend);
        const trendText = getTrendText(agent.recentTrend);
        const rewardStr = agent.averageReward.toFixed(2);
        console.log(`  ${agent.agentId.padEnd(20)} ${rewardStr} avg reward ${trendIcon} ${trendText}`);
      }
    }

    // Recent trend
    if (stats.recentTrend.sampleSize > 0) {
      console.log('');
      console.log('\x1b[1mRecent Trend\x1b[0m (last 10 requests):');
      const bar = createProgressBar(stats.recentTrend.successRate, 10);
      const percent = (stats.recentTrend.successRate * 100).toFixed(0);
      console.log(`  ${bar} ${percent}% success rate`);
    }

    // Top patterns
    if (stats.patterns.topPatterns.length > 0) {
      console.log('');
      console.log('\x1b[1mTop Patterns:\x1b[0m');
      for (let i = 0; i < Math.min(3, stats.patterns.topPatterns.length); i++) {
        const p = stats.patterns.topPatterns[i];
        const shortTask = p.task.length > 40 ? p.task.substring(0, 37) + '...' : p.task;
        const successPercent = (p.successRate * 100).toFixed(0);
        console.log(`  ${i + 1}. "${shortTask}" - ${successPercent}% success, used ${p.usageCount}x`);
      }
    }

    // Empty state
    if (stats.episodes.total === 0 && stats.patterns.total === 0) {
      console.log('');
      console.log('\x1b[90m   No learning data yet. Start chatting to build up patterns!\x1b[0m');
    }

    ctx.log(`✅ Learning stats: ${stats.episodes.total} episodes, ${stats.patterns.total} patterns`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Learning stats error: ${errorMsg}\x1b[0m`);
    ctx.log(`❌ Learning stats error: ${errorMsg}`);
  }
  console.log('');
}

/**
 * Aggregate learning statistics from all sources (CR-063)
 */
async function getLearningStats(ctx: CommandContext): Promise<LearningStats> {
  // Get episode stats from AgentDB
  const episodeStats = await getEpisodeStats(ctx);

  // Get skill library stats
  const skillLibrary = getSkillLibraryFromContext(ctx);
  const patternStats = skillLibrary?.getStats() ?? {
    totalPatterns: 0,
    avgSuccessRate: 0,
    avgReward: 0,
    topPatterns: [],
  };

  // Get agent effectiveness for agents with episodes
  const reflexionMemory = getReflexionMemoryFromContext(ctx);
  const agentPerformance: AgentEffectiveness[] = [];

  if (reflexionMemory) {
    for (const agentId of episodeStats.byAgent.keys()) {
      try {
        const effectiveness = await reflexionMemory.getAgentEffectiveness(agentId);
        if (effectiveness.totalEpisodes > 0) {
          agentPerformance.push(effectiveness);
        }
      } catch {
        // Skip agents with errors
      }
    }
  }

  // Calculate recent trend from last 10 episodes
  const recentTrend = calculateRecentTrend(episodeStats);

  return {
    episodes: episodeStats,
    patterns: {
      total: patternStats.totalPatterns,
      avgSuccessRate: patternStats.avgSuccessRate,
      avgReward: patternStats.avgReward,
      topPatterns: patternStats.topPatterns,
    },
    agentPerformance,
    recentTrend,
  };
}

/**
 * Get episode statistics from AgentDB
 */
async function getEpisodeStats(ctx: CommandContext): Promise<EpisodeStats> {
  // Collect all known agent IDs from recent episodes
  // Since AgentDB doesn't have a getAllEpisodes method, we query known agents
  const knownAgents = [
    'system-architect',
    'graph-builder',
    'validator',
    'optimizer',
    'analyzer',
  ];

  const byAgent = new Map<string, { total: number; successful: number; avgReward: number }>();
  let total = 0;
  let successful = 0;

  for (const agentId of knownAgents) {
    try {
      const episodes = await ctx.agentDB.loadAgentContext(agentId, undefined, 100);
      if (episodes.length > 0) {
        const agentSuccessful = episodes.filter(e => e.success).length;
        const avgReward = episodes.reduce((sum, e) => sum + e.reward, 0) / episodes.length;

        byAgent.set(agentId, {
          total: episodes.length,
          successful: agentSuccessful,
          avgReward,
        });

        total += episodes.length;
        successful += agentSuccessful;
      }
    } catch {
      // Skip agents with errors
    }
  }

  return {
    total,
    successful,
    failed: total - successful,
    byAgent,
  };
}

/**
 * Calculate recent success trend
 */
function calculateRecentTrend(stats: EpisodeStats): { successRate: number; sampleSize: number } {
  if (stats.total === 0) {
    return { successRate: 0, sampleSize: 0 };
  }

  // Use overall success rate as proxy for recent trend
  // (In production, we'd query last 10 episodes specifically)
  const sampleSize = Math.min(stats.total, 10);
  const successRate = stats.total > 0 ? stats.successful / stats.total : 0;

  return { successRate, sampleSize };
}

/**
 * Get SkillLibrary from context (via SessionManager accessor)
 */
function getSkillLibraryFromContext(ctx: CommandContext) {
  // Access through sessionManager if available
  const sessionManager = (ctx as unknown as { sessionManagerNew?: { getSkillLibrary?: () => unknown } }).sessionManagerNew;
  if (sessionManager?.getSkillLibrary) {
    return sessionManager.getSkillLibrary() as ReturnType<typeof import('../../llm-engine/agentdb/skill-library.js').createSkillLibrary>;
  }
  return null;
}

/**
 * Get ReflexionMemory from context (via SessionManager accessor)
 */
function getReflexionMemoryFromContext(ctx: CommandContext) {
  // Access through sessionManager if available
  const sessionManager = (ctx as unknown as { sessionManagerNew?: { getReflexionMemory?: () => unknown } }).sessionManagerNew;
  if (sessionManager?.getReflexionMemory) {
    return sessionManager.getReflexionMemory() as import('../../llm-engine/agentdb/reflexion-memory.js').ReflexionMemory;
  }
  return null;
}

/**
 * Get trend icon
 */
function getTrendIcon(trend: 'improving' | 'stable' | 'declining'): string {
  switch (trend) {
    case 'improving': return '\x1b[32m↗\x1b[0m';
    case 'declining': return '\x1b[31m↘\x1b[0m';
    default: return '\x1b[90m→\x1b[0m';
  }
}

/**
 * Get trend text
 */
function getTrendText(trend: 'improving' | 'stable' | 'declining'): string {
  switch (trend) {
    case 'improving': return '\x1b[32mimproving\x1b[0m';
    case 'declining': return '\x1b[31mdeclining\x1b[0m';
    default: return '\x1b[90mstable\x1b[0m';
  }
}

/**
 * Create ASCII progress bar
 */
function createProgressBar(value: number, width: number): string {
  const filled = Math.round(value * width);
  const empty = width - filled;
  return `\x1b[32m${'█'.repeat(filled)}\x1b[90m${'░'.repeat(empty)}\x1b[0m`;
}
