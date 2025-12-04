/**
 * Rule Evaluator
 *
 * Evaluates ontology rules against graph data.
 * Runs Cypher queries via Neo4j and similarity checks via SimilarityScorer.
 *
 * CR-030: Evaluation Criteria Implementation
 *
 * @author andreas@siglochconsulting
 */

import type { Neo4jClient } from '../../neo4j-client/neo4j-client.js';
import { getRuleLoader, type RuleLoader } from './rule-loader.js';
import { getSimilarityScorer, type SimilarityScorer, type NodeData } from './similarity-scorer.js';
import type {
  PhaseId,
  RuleViolation,
  ValidationResult,
  SimilarityMatch,
  IntegrityRule,
  ValidationRule,
} from './types.js';

/**
 * Cypher query result for violations
 */
interface ViolationRecord {
  violation: string;
  reason: string;
}

/**
 * Rule Evaluator
 *
 * Evaluates graph against ontology rules.
 */
export class RuleEvaluator {
  private neo4jClient: Neo4jClient | null = null;
  private ruleLoader: RuleLoader;
  private similarityScorer: SimilarityScorer;

  constructor(neo4jClient?: Neo4jClient) {
    this.neo4jClient = neo4jClient || null;
    this.ruleLoader = getRuleLoader();
    this.similarityScorer = getSimilarityScorer();

    if (neo4jClient) {
      this.similarityScorer.setNeo4jClient(neo4jClient);
    }
  }

  /**
   * Set Neo4j client (for lazy initialization)
   */
  setNeo4jClient(client: Neo4jClient): void {
    this.neo4jClient = client;
    this.similarityScorer.setNeo4jClient(client);
  }

  /**
   * Evaluate all rules for a given phase
   */
  async evaluate(
    phase: PhaseId,
    workspaceId: string,
    systemId: string
  ): Promise<ValidationResult> {
    const startTime = Date.now();
    const violations: RuleViolation[] = [];
    let similarityMatches: SimilarityMatch[] = [];

    // Get rules for this phase
    const integrityRules = this.ruleLoader.getIntegrityRulesForPhase(phase);
    const validationRules = this.ruleLoader.getValidationRulesForPhase(phase);

    // Run integrity rules (Cypher-based)
    for (const rule of integrityRules) {
      if (rule.cypher) {
        const ruleViolations = await this.runCypherRule(rule, workspaceId, systemId);
        violations.push(...ruleViolations);
      }
    }

    // Run validation rules (Cypher-based)
    for (const rule of validationRules) {
      if (rule.cypher) {
        const ruleViolations = await this.runCypherValidationRule(rule, workspaceId, systemId);
        violations.push(...ruleViolations);
      }
    }

    // Run similarity rules if we have nodes
    const similarityRules = this.ruleLoader.getSimilarityRules();
    if (similarityRules.length > 0) {
      const nodes = await this.loadNodesForSimilarity(workspaceId, systemId);
      if (nodes.length > 0) {
        similarityMatches = await this.runSimilarityRules(nodes, similarityRules, violations);
      }
    }

    // Calculate scores
    const hardRulesPassed = !violations.some((v) => v.isHard);
    const errorCount = violations.filter((v) => v.severity === 'error').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const infoCount = violations.filter((v) => v.severity === 'info').length;

    const rewardScore = this.calculateRewardScore(violations, phase);
    const phaseGateReady = this.checkPhaseGateReady(phase, rewardScore, hardRulesPassed);

    return {
      phase,
      timestamp: startTime,
      hardRulesPassed,
      totalViolations: violations.length,
      errorCount,
      warningCount,
      infoCount,
      violations,
      similarityMatches,
      rewardScore,
      phaseGateReady,
    };
  }

  /**
   * Evaluate a single rule
   */
  async evaluateRule(
    ruleId: string,
    workspaceId: string,
    systemId: string
  ): Promise<RuleViolation[]> {
    const rule = this.ruleLoader.getRule(ruleId);
    if (!rule) {
      throw new Error(`Unknown rule: ${ruleId}`);
    }

    if ('cypher' in rule && rule.cypher) {
      if ('weight' in rule) {
        return this.runCypherValidationRule(rule as ValidationRule, workspaceId, systemId);
      } else {
        return this.runCypherRule(rule as IntegrityRule, workspaceId, systemId);
      }
    }

    // Similarity rule
    if ('threshold' in rule && rule.threshold !== undefined) {
      const nodes = await this.loadNodesForSimilarity(workspaceId, systemId);
      const violations: RuleViolation[] = [];
      await this.runSimilarityRules(nodes, [rule as ValidationRule], violations);
      return violations;
    }

    return [];
  }

  /**
   * Check if phase gate is ready for transition
   */
  async checkPhaseGate(
    phase: PhaseId,
    workspaceId: string,
    systemId: string
  ): Promise<{ ready: boolean; blockers: string[]; score: number }> {
    const result = await this.evaluate(phase, workspaceId, systemId);

    const blockers: string[] = [];

    // Check hard rule failures
    const hardFailures = result.violations.filter((v) => v.isHard);
    for (const failure of hardFailures) {
      blockers.push(`Hard rule failed: ${failure.ruleName} - ${failure.reason}`);
    }

    // Check phase threshold
    const rewardConfig = this.ruleLoader.getRewardConfig();
    const threshold = rewardConfig.successThreshold;
    if (result.rewardScore < threshold) {
      blockers.push(`Score ${result.rewardScore.toFixed(2)} below threshold ${threshold}`);
    }

    return {
      ready: result.phaseGateReady,
      blockers,
      score: result.rewardScore,
    };
  }

  /**
   * Run a Cypher integrity rule
   */
  private async runCypherRule(
    rule: IntegrityRule,
    workspaceId: string,
    systemId: string
  ): Promise<RuleViolation[]> {
    if (!this.neo4jClient) {
      return [];
    }

    try {
      // Add workspace/system filter to query
      const filteredCypher = this.addWorkspaceFilter(rule.cypher, workspaceId, systemId);
      const records = await this.neo4jClient.query<ViolationRecord>(filteredCypher);

      return records.map((record) => ({
        ruleId: rule.id,
        ruleName: rule.description,
        severity: rule.severity,
        weight: 0,
        semanticId: record.violation || 'unknown',
        reason: record.reason || rule.description,
        suggestion: this.ruleLoader.getSuggestion(rule.id),
        isHard: rule.type === 'hard',
      }));
    } catch (error) {
      console.error(`Failed to run rule ${rule.id}:`, error);
      return [];
    }
  }

  /**
   * Run a Cypher validation rule
   */
  private async runCypherValidationRule(
    rule: ValidationRule,
    workspaceId: string,
    systemId: string
  ): Promise<RuleViolation[]> {
    if (!this.neo4jClient || !rule.cypher) {
      return [];
    }

    try {
      const filteredCypher = this.addWorkspaceFilter(rule.cypher, workspaceId, systemId);
      const records = await this.neo4jClient.query<ViolationRecord>(filteredCypher);

      return records.map((record) => ({
        ruleId: rule.id,
        ruleName: rule.description,
        severity: rule.severity,
        weight: rule.weight,
        semanticId: record.violation || 'unknown',
        reason: record.reason || rule.description,
        suggestion: this.ruleLoader.getSuggestion(rule.id),
        isHard: rule.type === 'hard',
      }));
    } catch (error) {
      console.error(`Failed to run rule ${rule.id}:`, error);
      return [];
    }
  }

  /**
   * Add workspace/system filter to Cypher query
   */
  private addWorkspaceFilter(cypher: string, workspaceId: string, systemId: string): string {
    // Replace MATCH (n) with MATCH (n {workspaceId: '...', systemId: '...'})
    // This is a simplified approach - full implementation would parse Cypher AST

    // For queries with MATCH (n:TYPE) pattern
    const matchPattern = /MATCH\s*\((\w+)(?::(\w+))?\)/gi;

    return cypher.replace(matchPattern, (_match, varName, label) => {
      const labelPart = label ? `:${label}` : '';
      return `MATCH (${varName}${labelPart} {workspaceId: '${workspaceId}', systemId: '${systemId}'})`;
    });
  }

  /**
   * Load nodes for similarity checking
   */
  private async loadNodesForSimilarity(
    workspaceId: string,
    systemId: string
  ): Promise<NodeData[]> {
    if (!this.neo4jClient) {
      return [];
    }

    try {
      const records = await this.neo4jClient.query<{
        uuid: string;
        semanticId: string;
        type: string;
        name: string;
        descr: string;
      }>(`
        MATCH (n:Node)
        WHERE n.workspaceId = '${workspaceId}' AND n.systemId = '${systemId}'
          AND n.type IN ['FUNC', 'SCHEMA']
        RETURN n.uuid as uuid, n.semanticId as semanticId, n.type as type,
               n.name as name, coalesce(n.descr, '') as descr
      `);

      return records.map((r) => ({
        uuid: r.uuid,
        semanticId: r.semanticId,
        type: r.type,
        name: r.name,
        descr: r.descr,
      }));
    } catch (error) {
      console.error('Failed to load nodes for similarity:', error);
      return [];
    }
  }

  /**
   * Run similarity-based rules
   */
  private async runSimilarityRules(
    nodes: NodeData[],
    rules: ValidationRule[],
    violations: RuleViolation[]
  ): Promise<SimilarityMatch[]> {
    // Get thresholds from rules
    const nearDuplicateRule = rules.find((r) => r.id.includes('near_duplicate'));
    const mergeCandidateRule = rules.find((r) => r.id.includes('merge_candidate'));

    const nearDuplicateThreshold = nearDuplicateRule?.threshold ?? 0.85;
    const mergeCandidateThreshold = mergeCandidateRule?.threshold ?? 0.70;

    // Find all similarity matches
    const allMatches = await this.similarityScorer.findAllSimilarityMatches(
      nodes,
      mergeCandidateThreshold
    );

    // Create violations for near-duplicates
    for (const match of allMatches) {
      if (match.score >= nearDuplicateThreshold && nearDuplicateRule) {
        violations.push({
          ruleId: nearDuplicateRule.id,
          ruleName: nearDuplicateRule.description,
          severity: nearDuplicateRule.severity,
          weight: nearDuplicateRule.weight,
          semanticId: `${match.nodeA.semanticId} / ${match.nodeB.semanticId}`,
          reason: `Near-duplicate ${match.nodeA.type}s with similarity ${match.score.toFixed(2)}`,
          suggestion: this.ruleLoader.getSuggestion(nearDuplicateRule.id),
          isHard: nearDuplicateRule.type === 'hard',
        });
      } else if (match.score >= mergeCandidateThreshold && mergeCandidateRule) {
        violations.push({
          ruleId: mergeCandidateRule.id,
          ruleName: mergeCandidateRule.description,
          severity: mergeCandidateRule.severity,
          weight: mergeCandidateRule.weight,
          semanticId: `${match.nodeA.semanticId} / ${match.nodeB.semanticId}`,
          reason: `Merge candidate ${match.nodeA.type}s with similarity ${match.score.toFixed(2)}`,
          suggestion: this.ruleLoader.getSuggestion(mergeCandidateRule.id),
          isHard: false,
        });
      }
    }

    return allMatches;
  }

  /**
   * Calculate reward score based on violations
   */
  private calculateRewardScore(violations: RuleViolation[], _phase: PhaseId): number {
    const rewardConfig = this.ruleLoader.getRewardConfig();

    // If any hard rule fails, reward = 0
    if (violations.some((v) => v.isHard)) {
      return 0;
    }

    // Calculate weighted penalty
    let weightedPenalty = 0;

    for (const violation of violations) {
      const weight = violation.weight || rewardConfig.structuralRuleWeights[violation.ruleId] || 0.05;
      weightedPenalty += weight;
    }

    // Base score minus penalties
    const baseScore = 1.0;
    const penalty = Math.min(weightedPenalty, 1.0);
    return Math.max(0, baseScore - penalty);
  }

  /**
   * Check if phase gate is ready
   */
  private checkPhaseGateReady(
    _phase: PhaseId,
    rewardScore: number,
    hardRulesPassed: boolean
  ): boolean {
    if (!hardRulesPassed) {
      return false;
    }

    const rewardConfig = this.ruleLoader.getRewardConfig();
    return rewardScore >= rewardConfig.successThreshold;
  }
}

// Singleton instance
let evaluatorInstance: RuleEvaluator | null = null;

/**
 * Get the singleton RuleEvaluator instance
 */
export function getRuleEvaluator(): RuleEvaluator {
  if (!evaluatorInstance) {
    evaluatorInstance = new RuleEvaluator();
  }
  return evaluatorInstance;
}

/**
 * Create a new RuleEvaluator with Neo4j client
 */
export function createRuleEvaluator(neo4jClient?: Neo4jClient): RuleEvaluator {
  return new RuleEvaluator(neo4jClient);
}
