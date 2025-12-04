/**
 * CR-028 Pareto Front Implementation
 * Maintains a set of non-dominated solutions
 *
 * @author andreas@siglochconsulting
 */

import { Variant, MultiObjectiveScore } from './types.js';
import { compareDominance } from './multi-objective-scorer.js';

export class ParetoFrontImpl {
  private variants: Variant[] = [];
  readonly maxSize: number;

  constructor(maxSize: number = 5) {
    this.maxSize = maxSize;
  }

  /**
   * Attempt to add a variant to the Pareto front
   * Returns true if variant was added (is non-dominated)
   */
  add(variant: Variant): boolean {
    // Check if new variant is dominated by any existing variant
    for (const existing of this.variants) {
      if (compareDominance(existing.score, variant.score) === 1) {
        // Existing dominates new → reject new
        return false;
      }
    }

    // Remove any variants dominated by the new one
    this.variants = this.variants.filter(
      existing => compareDominance(variant.score, existing.score) !== 1
    );

    // Add the new variant
    this.variants.push(variant);

    // If over capacity, remove based on crowding distance
    if (this.variants.length > this.maxSize) {
      this.pruneByDiversity();
    }

    return true;
  }

  /**
   * Get all variants in the Pareto front
   */
  getVariants(): Variant[] {
    return [...this.variants];
  }

  /**
   * Get variants sorted by a specific objective (descending)
   */
  sortedBy(objectiveId: string): Variant[] {
    return [...this.variants].sort((a, b) => {
      const aScore = a.score.scores.find(s => s.id === objectiveId)?.value ?? 0;
      const bScore = b.score.scores.find(s => s.id === objectiveId)?.value ?? 0;
      return bScore - aScore; // Descending
    });
  }

  /**
   * Get the variant with highest weighted score
   */
  getBest(): Variant | null {
    if (this.variants.length === 0) return null;

    return this.variants.reduce((best, current) =>
      current.score.weighted > best.score.weighted ? current : best
    );
  }

  /**
   * Check if a variant would be non-dominated
   */
  wouldBeNonDominated(score: MultiObjectiveScore): boolean {
    for (const existing of this.variants) {
      if (compareDominance(existing.score, score) === 1) {
        return false;
      }
    }
    return true;
  }

  /**
   * Remove least diverse variant when over capacity
   * Uses crowding distance to maintain spread
   */
  private pruneByDiversity(): void {
    if (this.variants.length <= this.maxSize) return;

    const distances = this.calculateCrowdingDistances();

    // Find variant with minimum crowding distance (least diverse)
    let minIdx = 0;
    let minDist = Infinity;

    for (let i = 0; i < distances.length; i++) {
      if (distances[i] < minDist) {
        minDist = distances[i];
        minIdx = i;
      }
    }

    // Remove least diverse
    this.variants.splice(minIdx, 1);
  }

  /**
   * Calculate crowding distance for diversity preservation
   * Higher distance = more isolated = more valuable for diversity
   */
  private calculateCrowdingDistances(): number[] {
    const n = this.variants.length;
    if (n <= 2) return this.variants.map(() => Infinity);

    const distances = new Array(n).fill(0);
    const numObjectives = this.variants[0]?.score.scores.length ?? 0;

    for (let m = 0; m < numObjectives; m++) {
      // Sort by this objective
      const indices = Array.from({ length: n }, (_, i) => i);
      indices.sort((a, b) => {
        const aVal = this.variants[a].score.scores[m]?.value ?? 0;
        const bVal = this.variants[b].score.scores[m]?.value ?? 0;
        return aVal - bVal;
      });

      // Boundary points get infinite distance
      distances[indices[0]] = Infinity;
      distances[indices[n - 1]] = Infinity;

      // Calculate range for normalization
      const minVal = this.variants[indices[0]].score.scores[m]?.value ?? 0;
      const maxVal = this.variants[indices[n - 1]].score.scores[m]?.value ?? 0;
      const range = maxVal - minVal;

      if (range === 0) continue;

      // Interior points: distance = (neighbor_right - neighbor_left) / range
      for (let i = 1; i < n - 1; i++) {
        const leftVal = this.variants[indices[i - 1]].score.scores[m]?.value ?? 0;
        const rightVal = this.variants[indices[i + 1]].score.scores[m]?.value ?? 0;
        distances[indices[i]] += (rightVal - leftVal) / range;
      }
    }

    return distances;
  }

  /**
   * Get statistics about the Pareto front
   */
  getStats(): ParetoStats {
    if (this.variants.length === 0) {
      return {
        size: 0,
        objectiveRanges: {},
        bestWeighted: 0,
        worstWeighted: 0,
        avgWeighted: 0
      };
    }

    const objectiveRanges: Record<string, { min: number; max: number }> = {};

    for (const score of this.variants[0].score.scores) {
      objectiveRanges[score.id] = { min: Infinity, max: -Infinity };
    }

    let bestWeighted = -Infinity;
    let worstWeighted = Infinity;
    let sumWeighted = 0;

    for (const variant of this.variants) {
      for (const score of variant.score.scores) {
        const range = objectiveRanges[score.id];
        if (range) {
          range.min = Math.min(range.min, score.value);
          range.max = Math.max(range.max, score.value);
        }
      }

      bestWeighted = Math.max(bestWeighted, variant.score.weighted);
      worstWeighted = Math.min(worstWeighted, variant.score.weighted);
      sumWeighted += variant.score.weighted;
    }

    return {
      size: this.variants.length,
      objectiveRanges,
      bestWeighted,
      worstWeighted,
      avgWeighted: sumWeighted / this.variants.length
    };
  }

  /**
   * Clear the Pareto front
   */
  clear(): void {
    this.variants = [];
  }
}

export interface ParetoStats {
  size: number;
  objectiveRanges: Record<string, { min: number; max: number }>;
  bestWeighted: number;
  worstWeighted: number;
  avgWeighted: number;
}

/**
 * Format Pareto front for display
 */
export function formatParetoFront(front: ParetoFrontImpl): string {
  const stats = front.getStats();
  const lines: string[] = [
    `Pareto Front (${stats.size} variants):`,
    `  Weighted score range: ${stats.worstWeighted.toFixed(3)} - ${stats.bestWeighted.toFixed(3)}`
  ];

  for (const [objId, range] of Object.entries(stats.objectiveRanges)) {
    lines.push(`  ${objId}: ${range.min.toFixed(3)} - ${range.max.toFixed(3)}`);
  }

  lines.push('');
  lines.push('Variants:');

  for (const variant of front.getVariants()) {
    const scores = variant.score.scores.map(s => `${s.id.slice(0, 4)}=${s.value.toFixed(2)}`).join(' ');
    lines.push(`  [${variant.id}] w=${variant.score.weighted.toFixed(3)} | ${scores}`);
  }

  return lines.join('\n');
}
