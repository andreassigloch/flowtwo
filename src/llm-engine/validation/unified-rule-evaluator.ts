/**
 * Unified Rule Evaluator (CR-032)
 *
 * Evaluates ontology rules against AgentDB data instead of Neo4j.
 * Ensures validation sees the SAME data that LLM sees.
 *
 * Key Changes from RuleEvaluator:
 * - Reads nodes/edges from UnifiedAgentDBService
 * - No direct Neo4j queries for graph data
 * - Uses same in-memory data as Canvas and LLM
 *
 * @author andreas@siglochconsulting
 */

import type { UnifiedAgentDBService } from '../agentdb/unified-agentdb-service.js';
import type { Node, Edge } from '../../shared/types/ontology.js';
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
 * Unified Rule Evaluator
 *
 * Reads from AgentDB for consistent data view.
 */
export class UnifiedRuleEvaluator {
  private agentDB: UnifiedAgentDBService;
  private ruleLoader: RuleLoader;
  private similarityScorer: SimilarityScorer;

  constructor(agentDB: UnifiedAgentDBService) {
    this.agentDB = agentDB;
    this.ruleLoader = getRuleLoader();
    this.similarityScorer = getSimilarityScorer();
  }

  /**
   * Evaluate all rules for a given phase
   *
   * Reads graph data from AgentDB (same as LLM sees)
   */
  async evaluate(phase: PhaseId): Promise<ValidationResult> {
    const startTime = Date.now();
    const violations: RuleViolation[] = [];
    let similarityMatches: SimilarityMatch[] = [];

    // Get rules for this phase
    const integrityRules = this.ruleLoader.getIntegrityRulesForPhase(phase);
    const validationRules = this.ruleLoader.getValidationRulesForPhase(phase);

    // Get nodes and edges from AgentDB (SAME data as LLM sees)
    const nodes = this.agentDB.getNodes();
    const edges = this.agentDB.getEdges();

    // Run integrity rules (in-memory evaluation)
    for (const rule of integrityRules) {
      const ruleViolations = this.evaluateIntegrityRule(rule, nodes, edges);
      violations.push(...ruleViolations);
    }

    // Run validation rules (in-memory evaluation)
    for (const rule of validationRules) {
      const ruleViolations = this.evaluateValidationRule(rule, nodes, edges);
      violations.push(...ruleViolations);
    }

    // Run similarity rules
    const similarityRules = this.ruleLoader.getSimilarityRules();
    if (similarityRules.length > 0 && nodes.length > 0) {
      const nodeData = this.convertToNodeData(nodes);
      similarityMatches = await this.runSimilarityRules(nodeData, similarityRules, violations);
    }

    // Calculate scores
    const hardRulesPassed = !violations.some((v) => v.isHard);
    const errorCount = violations.filter((v) => v.severity === 'error').length;
    const warningCount = violations.filter((v) => v.severity === 'warning').length;
    const infoCount = violations.filter((v) => v.severity === 'info').length;

    const rewardScore = this.calculateRewardScore(violations);
    const phaseGateReady = this.checkPhaseGateReady(rewardScore, hardRulesPassed);

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
   * Evaluate integrity rule in-memory
   *
   * Maps ontology-rules.json rule IDs to in-memory checks.
   */
  private evaluateIntegrityRule(
    rule: IntegrityRule,
    nodes: Node[],
    edges: Edge[]
  ): RuleViolation[] {
    const violations: RuleViolation[] = [];

    // Handle rules from ontology-rules.json
    switch (rule.id) {
      case 'no_duplicate_nodes':
        // Check for duplicate nodes (same type, name in same parent)
        const nodeParents = new Map<string, string[]>();
        for (const edge of edges) {
          if (edge.type === 'compose') {
            const children = nodeParents.get(edge.sourceId) || [];
            children.push(edge.targetId);
            nodeParents.set(edge.sourceId, children);
          }
        }
        for (const [_parentId, childIds] of nodeParents) {
          const childNodes = childIds.map(id => nodes.find(n => n.semanticId === id)).filter(Boolean) as Node[];
          const seen = new Map<string, Node>();
          for (const child of childNodes) {
            const key = `${child.type}|${child.name}`;
            const existing = seen.get(key);
            if (existing) {
              violations.push(this.createViolation(
                rule,
                `${existing.semanticId} / ${child.semanticId}`,
                'Duplicate node in same parent'
              ));
            }
            seen.set(key, child);
          }
        }
        break;

      case 'no_duplicate_edges':
        // Check for duplicate edges (same source, type, target)
        const edgeKeys = new Set<string>();
        for (const edge of edges) {
          const key = `${edge.sourceId}|${edge.type}|${edge.targetId}`;
          if (edgeKeys.has(key)) {
            violations.push(this.createViolation(rule, edge.uuid, `Duplicate edge: ${key}`));
          }
          edgeKeys.add(key);
        }
        break;

      case 'no_self_loops':
        // Check for self-referencing edges
        for (const edge of edges) {
          if (edge.sourceId === edge.targetId) {
            violations.push(this.createViolation(rule, edge.uuid, 'Self-referencing edge'));
          }
        }
        break;

      case 'required_properties':
        // Check for nodes without required properties
        for (const node of nodes) {
          const missing: string[] = [];
          if (!node.uuid) missing.push('uuid');
          if (!node.type) missing.push('type');
          if (!node.name || node.name.trim() === '') missing.push('name');
          if (!node.descr || node.descr.trim() === '') missing.push('descr');

          if (missing.length > 0) {
            violations.push(this.createViolation(
              rule,
              node.semanticId,
              `Missing or empty required properties: ${missing.join(', ')}`
            ));
          }
        }
        break;

      // Default: Skip rules that require Cypher
      default:
        break;
    }

    return violations;
  }

  /**
   * Evaluate validation rule in-memory
   *
   * Maps ontology-rules.json validation rule IDs to in-memory checks.
   */
  private evaluateValidationRule(
    rule: ValidationRule,
    nodes: Node[],
    edges: Edge[]
  ): RuleViolation[] {
    const violations: RuleViolation[] = [];

    // Handle validation rules from ontology-rules.json
    switch (rule.id) {
      case 'isolation':
        // Check for orphan nodes (no edges) - from ontology-rules.json
        for (const node of nodes) {
          if (node.type !== 'SYS') { // SYS nodes can be standalone
            const hasEdges = edges.some(
              e => e.sourceId === node.semanticId || e.targetId === node.semanticId
            );
            if (!hasEdges) {
              violations.push(this.createValidationViolation(
                rule,
                node.semanticId,
                'Orphan node with no connections'
              ));
            }
          }
        }
        break;

      case 'naming':
        // Check node name length (max 25 from ontology constraints)
        for (const node of nodes) {
          if (node.name && node.name.length > 25) {
            violations.push(this.createValidationViolation(
              rule,
              node.semanticId,
              `Name too long (${node.name.length} chars, max 25)`
            ));
          }
        }
        break;

      case 'millers_law':
        // Check for too many children (max 7±2 = 9)
        const childCounts = new Map<string, number>();
        for (const edge of edges) {
          if (edge.type === 'compose') {
            const count = (childCounts.get(edge.sourceId) || 0) + 1;
            childCounts.set(edge.sourceId, count);
          }
        }
        for (const [parentId, count] of childCounts) {
          if (count > 9) {
            violations.push(this.createValidationViolation(
              rule,
              parentId,
              `Too many children (${count}, max 9 per Miller's Law)`
            ));
          }
        }
        break;

      case 'valid_edge_types':
        // Check edge types are valid per ontology
        const validTypes = ['io', 'compose', 'satisfy', 'verify', 'allocate', 'relation'];
        for (const edge of edges) {
          if (!validTypes.includes(edge.type)) {
            violations.push(this.createValidationViolation(
              rule,
              edge.uuid,
              `Invalid edge type: ${edge.type}`
            ));
          }
        }
        break;

      // Similarity rules (near_duplicate, merge_candidate) are handled separately

      default:
        // Skip rules that need Cypher
        break;
    }

    return violations;
  }

  /**
   * Convert Node[] to NodeData[] for similarity scoring
   */
  private convertToNodeData(nodes: Node[]): NodeData[] {
    return nodes
      .filter(n => ['FUNC', 'SCHEMA'].includes(n.type))
      .map(n => ({
        uuid: n.uuid,
        semanticId: n.semanticId,
        type: n.type,
        name: n.name,
        descr: n.descr,
      }));
  }

  /**
   * Run similarity-based rules
   */
  private async runSimilarityRules(
    nodes: NodeData[],
    rules: ValidationRule[],
    violations: RuleViolation[]
  ): Promise<SimilarityMatch[]> {
    const nearDuplicateRule = rules.find((r) => r.id.includes('near_duplicate'));
    const mergeCandidateRule = rules.find((r) => r.id.includes('merge_candidate'));

    const nearDuplicateThreshold = nearDuplicateRule?.threshold ?? 0.85;
    const mergeCandidateThreshold = mergeCandidateRule?.threshold ?? 0.70;

    const allMatches = await this.similarityScorer.findAllSimilarityMatches(
      nodes,
      mergeCandidateThreshold
    );

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
   * Create integrity violation
   */
  private createViolation(rule: IntegrityRule, semanticId: string, reason: string): RuleViolation {
    return {
      ruleId: rule.id,
      ruleName: rule.description,
      severity: rule.severity,
      weight: 0,
      semanticId,
      reason,
      suggestion: this.ruleLoader.getSuggestion(rule.id),
      isHard: rule.type === 'hard',
    };
  }

  /**
   * Create validation violation
   */
  private createValidationViolation(rule: ValidationRule, semanticId: string, reason: string): RuleViolation {
    return {
      ruleId: rule.id,
      ruleName: rule.description,
      severity: rule.severity,
      weight: rule.weight,
      semanticId,
      reason,
      suggestion: this.ruleLoader.getSuggestion(rule.id),
      isHard: rule.type === 'hard',
    };
  }

  /**
   * Calculate reward score
   */
  private calculateRewardScore(violations: RuleViolation[]): number {
    const rewardConfig = this.ruleLoader.getRewardConfig();

    if (violations.some((v) => v.isHard)) {
      return 0;
    }

    let weightedPenalty = 0;
    for (const violation of violations) {
      const weight = violation.weight || rewardConfig.structuralRuleWeights[violation.ruleId] || 0.05;
      weightedPenalty += weight;
    }

    return Math.max(0, 1.0 - Math.min(weightedPenalty, 1.0));
  }

  /**
   * Check if phase gate is ready
   */
  private checkPhaseGateReady(rewardScore: number, hardRulesPassed: boolean): boolean {
    if (!hardRulesPassed) return false;
    const rewardConfig = this.ruleLoader.getRewardConfig();
    return rewardScore >= rewardConfig.successThreshold;
  }

  /**
   * Check phase gate status
   */
  async checkPhaseGate(phase: PhaseId): Promise<{ ready: boolean; blockers: string[]; score: number }> {
    const result = await this.evaluate(phase);

    const blockers: string[] = [];

    const hardFailures = result.violations.filter((v) => v.isHard);
    for (const failure of hardFailures) {
      blockers.push(`Hard rule failed: ${failure.ruleName} - ${failure.reason}`);
    }

    const rewardConfig = this.ruleLoader.getRewardConfig();
    if (result.rewardScore < rewardConfig.successThreshold) {
      blockers.push(`Score ${result.rewardScore.toFixed(2)} below threshold ${rewardConfig.successThreshold}`);
    }

    return {
      ready: result.phaseGateReady,
      blockers,
      score: result.rewardScore,
    };
  }

  /**
   * Get graph statistics
   */
  getGraphStats(): { nodeCount: number; edgeCount: number; version: number } {
    return this.agentDB.getGraphStats();
  }
}

/**
 * Create a UnifiedRuleEvaluator for an AgentDB instance
 */
export function createUnifiedRuleEvaluator(agentDB: UnifiedAgentDBService): UnifiedRuleEvaluator {
  return new UnifiedRuleEvaluator(agentDB);
}
