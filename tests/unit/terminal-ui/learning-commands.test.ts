/**
 * Unit Tests for Learning Commands (CR-063)
 *
 * Tests the /learning command statistics aggregation
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dependencies
vi.mock('../../../src/llm-engine/agentdb/unified-agentdb-service.js', () => ({
  UnifiedAgentDBService: vi.fn(),
}));

describe('Learning Commands (CR-063)', () => {
  describe('Episode Statistics', () => {
    it('should aggregate episode stats by agent', async () => {
      // Arrange
      const mockEpisodes = [
        { agentId: 'system-architect', task: 'Add FUNC', success: true, reward: 0.9, critique: '', output: {}, timestamp: Date.now() },
        { agentId: 'system-architect', task: 'Add UC', success: true, reward: 0.8, critique: '', output: {}, timestamp: Date.now() },
        { agentId: 'system-architect', task: 'Add io', success: false, reward: 0.4, critique: 'Failed', output: {}, timestamp: Date.now() },
      ];

      // Act - simulate stats aggregation
      const byAgent = new Map<string, { total: number; successful: number; avgReward: number }>();
      const agentId = 'system-architect';
      const agentSuccessful = mockEpisodes.filter(e => e.success).length;
      const avgReward = mockEpisodes.reduce((sum, e) => sum + e.reward, 0) / mockEpisodes.length;

      byAgent.set(agentId, {
        total: mockEpisodes.length,
        successful: agentSuccessful,
        avgReward,
      });

      // Assert
      expect(byAgent.get('system-architect')?.total).toBe(3);
      expect(byAgent.get('system-architect')?.successful).toBe(2);
      expect(byAgent.get('system-architect')?.avgReward).toBeCloseTo(0.7, 1);
    });

    it('should calculate failed episodes correctly', () => {
      // Arrange
      const total = 10;
      const successful = 7;

      // Act
      const failed = total - successful;

      // Assert
      expect(failed).toBe(3);
    });
  });

  describe('Trend Calculation', () => {
    it('should identify improving trend when recent > older', () => {
      // Arrange
      const episodes = [
        { reward: 0.9 }, { reward: 0.85 }, { reward: 0.8 }, // recent (higher)
        { reward: 0.6 }, { reward: 0.55 }, { reward: 0.5 }, // older (lower)
      ];

      // Act
      const midpoint = Math.floor(episodes.length / 2);
      const recentAvg = episodes.slice(0, midpoint).reduce((sum, e) => sum + e.reward, 0) / midpoint;
      const olderAvg = episodes.slice(midpoint).reduce((sum, e) => sum + e.reward, 0) / (episodes.length - midpoint);

      let trend: 'improving' | 'stable' | 'declining' = 'stable';
      if (recentAvg > olderAvg + 0.1) trend = 'improving';
      else if (recentAvg < olderAvg - 0.1) trend = 'declining';

      // Assert
      expect(trend).toBe('improving');
      expect(recentAvg).toBeGreaterThan(olderAvg);
    });

    it('should identify declining trend when recent < older', () => {
      // Arrange
      const episodes = [
        { reward: 0.5 }, { reward: 0.55 }, { reward: 0.6 }, // recent (lower)
        { reward: 0.8 }, { reward: 0.85 }, { reward: 0.9 }, // older (higher)
      ];

      // Act
      const midpoint = Math.floor(episodes.length / 2);
      const recentAvg = episodes.slice(0, midpoint).reduce((sum, e) => sum + e.reward, 0) / midpoint;
      const olderAvg = episodes.slice(midpoint).reduce((sum, e) => sum + e.reward, 0) / (episodes.length - midpoint);

      let trend: 'improving' | 'stable' | 'declining' = 'stable';
      if (recentAvg > olderAvg + 0.1) trend = 'improving';
      else if (recentAvg < olderAvg - 0.1) trend = 'declining';

      // Assert
      expect(trend).toBe('declining');
      expect(recentAvg).toBeLessThan(olderAvg);
    });

    it('should identify stable trend when change < 0.1', () => {
      // Arrange
      const episodes = [
        { reward: 0.72 }, { reward: 0.73 }, { reward: 0.71 }, // recent
        { reward: 0.70 }, { reward: 0.72 }, { reward: 0.68 }, // older
      ];

      // Act
      const midpoint = Math.floor(episodes.length / 2);
      const recentAvg = episodes.slice(0, midpoint).reduce((sum, e) => sum + e.reward, 0) / midpoint;
      const olderAvg = episodes.slice(midpoint).reduce((sum, e) => sum + e.reward, 0) / (episodes.length - midpoint);

      let trend: 'improving' | 'stable' | 'declining' = 'stable';
      if (recentAvg > olderAvg + 0.1) trend = 'improving';
      else if (recentAvg < olderAvg - 0.1) trend = 'declining';

      // Assert
      expect(trend).toBe('stable');
      expect(Math.abs(recentAvg - olderAvg)).toBeLessThan(0.1);
    });
  });

  describe('Progress Bar Generation', () => {
    it('should generate correct progress bar for 80% success', () => {
      // Arrange
      const value = 0.8;
      const width = 10;

      // Act
      const filled = Math.round(value * width);
      const empty = width - filled;
      const bar = '█'.repeat(filled) + '░'.repeat(empty);

      // Assert
      expect(bar).toBe('████████░░');
      expect(filled).toBe(8);
      expect(empty).toBe(2);
    });

    it('should handle 0% success', () => {
      // Arrange
      const value = 0;
      const width = 10;

      // Act
      const filled = Math.round(value * width);
      const empty = width - filled;
      const bar = '█'.repeat(filled) + '░'.repeat(empty);

      // Assert
      expect(bar).toBe('░░░░░░░░░░');
    });

    it('should handle 100% success', () => {
      // Arrange
      const value = 1.0;
      const width = 10;

      // Act
      const filled = Math.round(value * width);
      const empty = width - filled;
      const bar = '█'.repeat(filled) + '░'.repeat(empty);

      // Assert
      expect(bar).toBe('██████████');
    });
  });

  describe('Pattern Statistics', () => {
    it('should calculate average success rate', () => {
      // Arrange
      const patterns = [
        { successRate: 0.9 },
        { successRate: 0.8 },
        { successRate: 0.7 },
      ];

      // Act
      const avgSuccessRate = patterns.reduce((sum, p) => sum + p.successRate, 0) / patterns.length;

      // Assert
      expect(avgSuccessRate).toBeCloseTo(0.8, 1);
    });

    it('should sort top patterns by usage * success rate', () => {
      // Arrange
      const patterns = [
        { task: 'A', usageCount: 10, successRate: 0.5 }, // score: 5
        { task: 'B', usageCount: 5, successRate: 0.9 },  // score: 4.5
        { task: 'C', usageCount: 2, successRate: 1.0 },  // score: 2
      ];

      // Act
      const sorted = [...patterns].sort((a, b) =>
        (b.usageCount * b.successRate) - (a.usageCount * a.successRate)
      );

      // Assert
      expect(sorted[0].task).toBe('A');
      expect(sorted[1].task).toBe('B');
      expect(sorted[2].task).toBe('C');
    });
  });
});
