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
import { SimilarityScorer, type NodeData } from './similarity-scorer.js';
import { EmbeddingStore } from '../agentdb/embedding-store.js';
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
    // SimilarityScorer uses AgentDB for embeddings (CR-032)
    this.similarityScorer = new SimilarityScorer(agentDB);
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

      case 'function_requirements':
        // Every FUNC must satisfy at least one REQ
        const funcsSatisfying = new Set(
          edges.filter(e => e.type === 'satisfy').map(e => e.sourceId)
        );
        for (const node of nodes) {
          if (node.type === 'FUNC' && !funcsSatisfying.has(node.semanticId)) {
            violations.push(this.createValidationViolation(
              rule,
              node.semanticId,
              'Function has no satisfy→REQ edge'
            ));
          }
        }
        break;

      case 'requirements_verification':
        // Every REQ must be verified by at least one TEST
        const reqsVerified = new Set(
          edges.filter(e => e.type === 'verify').map(e => e.sourceId)
        );
        for (const node of nodes) {
          if (node.type === 'REQ' && !reqsVerified.has(node.semanticId)) {
            violations.push(this.createValidationViolation(
              rule,
              node.semanticId,
              'Requirement has no verify→TEST edge'
            ));
          }
        }
        break;

      case 'function_allocation':
        // Every FUNC must be allocated to at least one MOD
        const funcsAllocated = new Set(
          edges.filter(e => e.type === 'allocate').map(e => e.targetId)
        );
        for (const node of nodes) {
          if (node.type === 'FUNC' && !funcsAllocated.has(node.semanticId)) {
            violations.push(this.createValidationViolation(
              rule,
              node.semanticId,
              'Function not allocated to any MOD'
            ));
          }
        }
        break;

      case 'function_io':
        // Every FUNC must have io input AND output via FLOW (not just one)
        const flowIds = new Set(nodes.filter(n => n.type === 'FLOW').map(n => n.semanticId));
        const ioEdgesForFunc = edges.filter(e => e.type === 'io');

        // FUNC with incoming io FROM FLOW (FLOW → FUNC = input)
        const funcsWithInput = new Set(
          ioEdgesForFunc
            .filter(e => flowIds.has(e.sourceId))
            .map(e => e.targetId)
        );
        // FUNC with outgoing io TO FLOW (FUNC → FLOW = output)
        const funcsWithOutput = new Set(
          ioEdgesForFunc
            .filter(e => flowIds.has(e.targetId))
            .map(e => e.sourceId)
        );

        for (const node of nodes) {
          if (node.type === 'FUNC') {
            const hasInput = funcsWithInput.has(node.semanticId);
            const hasOutput = funcsWithOutput.has(node.semanticId);
            if (!hasInput && !hasOutput) {
              violations.push(this.createValidationViolation(
                rule,
                node.semanticId,
                'Function has no io edges (isolated data flow)'
              ));
            } else if (!hasInput) {
              violations.push(this.createValidationViolation(
                rule,
                node.semanticId,
                'Function missing io input (no FLOW → FUNC edge)'
              ));
            } else if (!hasOutput) {
              violations.push(this.createValidationViolation(
                rule,
                node.semanticId,
                'Function missing io output (no FUNC → FLOW edge)'
              ));
            }
          }
        }
        break;

      case 'flow_connectivity':
        // Every FLOW must have both incoming and outgoing io edges
        const flowsIncoming = new Set(
          edges.filter(e => e.type === 'io').map(e => e.targetId)
        );
        const flowsOutgoing = new Set(
          edges.filter(e => e.type === 'io').map(e => e.sourceId)
        );
        for (const node of nodes) {
          if (node.type === 'FLOW') {
            const hasIn = flowsIncoming.has(node.semanticId);
            const hasOut = flowsOutgoing.has(node.semanticId);
            if (!hasIn && !hasOut) {
              violations.push(this.createValidationViolation(
                rule,
                node.semanticId,
                'FLOW has no io edges'
              ));
            } else if (!hasIn) {
              violations.push(this.createValidationViolation(
                rule,
                node.semanticId,
                'FLOW has no incoming io edge'
              ));
            } else if (!hasOut) {
              violations.push(this.createValidationViolation(
                rule,
                node.semanticId,
                'FLOW has no outgoing io edge'
              ));
            }
          }
        }
        break;

      case 'fchain_actor_boundary':
        // Every FCHAIN must have at least 1 input actor AND 1 output actor
        // Input Actor: ACTOR -io-> FLOW (actor produces data into chain)
        // Output Actor: FLOW -io-> ACTOR (actor receives result from chain)
        {
          const composeEdges = edges.filter(e => e.type === 'compose');
          const ioEdges = edges.filter(e => e.type === 'io');
          const fchainNodes = nodes.filter(n => n.type === 'FCHAIN');
          const flowNodeIds = new Set(nodes.filter(n => n.type === 'FLOW').map(n => n.semanticId));

          for (const fchain of fchainNodes) {
            // Find all nodes composed by this FCHAIN
            const composedIds = new Set(
              composeEdges
                .filter(e => e.sourceId === fchain.semanticId)
                .map(e => e.targetId)
            );

            // Find ACTORs composed by this FCHAIN
            const composedActors = [...composedIds].filter(id => {
              const node = nodes.find(n => n.semanticId === id);
              return node?.type === 'ACTOR';
            });

            // Find FLOWs composed by this FCHAIN
            const composedFlows = new Set([...composedIds].filter(id => flowNodeIds.has(id)));

            // Classify actors as input or output based on io edges
            const inputActors: string[] = [];
            const outputActors: string[] = [];

            for (const actorId of composedActors) {
              // Input: ACTOR -io-> FLOW (where FLOW is in this FCHAIN)
              const hasOutput = ioEdges.some(
                e => e.sourceId === actorId && composedFlows.has(e.targetId)
              );
              // Output: FLOW -io-> ACTOR (where FLOW is in this FCHAIN)
              const hasInput = ioEdges.some(
                e => e.targetId === actorId && composedFlows.has(e.sourceId)
              );

              if (hasOutput) inputActors.push(actorId);
              if (hasInput) outputActors.push(actorId);
            }

            // Report specific violations
            if (inputActors.length === 0 && outputActors.length === 0) {
              violations.push(this.createValidationViolation(
                rule,
                fchain.semanticId,
                `FCHAIN has no boundary actors (needs input actor → FLOW and FLOW → output actor)`
              ));
            } else if (inputActors.length === 0) {
              violations.push(this.createValidationViolation(
                rule,
                fchain.semanticId,
                `FCHAIN missing input actor (need ACTOR -io-> FLOW to start the chain)`
              ));
            } else if (outputActors.length === 0) {
              violations.push(this.createValidationViolation(
                rule,
                fchain.semanticId,
                `FCHAIN missing output actor (need FLOW -io-> ACTOR to end the chain)`
              ));
            }
          }
        }
        break;

      case 'io_bidirectional_flow':
        // A FUNC/ACTOR should not be both source AND target of the same FLOW
        {
          const ioEdges = edges.filter(e => e.type === 'io');
          const flowNodes = new Set(nodes.filter(n => n.type === 'FLOW').map(n => n.semanticId));

          // Build maps: node → flows it writes to, node → flows it reads from
          const writesToFlow = new Map<string, Set<string>>(); // node → flows
          const readsFromFlow = new Map<string, Set<string>>(); // node → flows

          for (const edge of ioEdges) {
            if (flowNodes.has(edge.targetId)) {
              // edge.sourceId writes to edge.targetId (FLOW)
              if (!writesToFlow.has(edge.sourceId)) writesToFlow.set(edge.sourceId, new Set());
              writesToFlow.get(edge.sourceId)!.add(edge.targetId);
            }
            if (flowNodes.has(edge.sourceId)) {
              // edge.targetId reads from edge.sourceId (FLOW)
              if (!readsFromFlow.has(edge.targetId)) readsFromFlow.set(edge.targetId, new Set());
              readsFromFlow.get(edge.targetId)!.add(edge.sourceId);
            }
          }

          // Find nodes that both write AND read the same FLOW
          for (const node of nodes) {
            if (!['FUNC', 'ACTOR'].includes(node.type)) continue;
            const writes = writesToFlow.get(node.semanticId);
            const reads = readsFromFlow.get(node.semanticId);
            if (writes && reads) {
              for (const flowId of writes) {
                if (reads.has(flowId)) {
                  violations.push(this.createValidationViolation(
                    rule,
                    node.semanticId,
                    `Bidirectional io to same FLOW (${flowId}) - verify intent`
                  ));
                }
              }
            }
          }
        }
        break;

      case 'io_circular_chain':
        // FLOW should not have io edge back to its own producer (circular chain)
        // Pattern: Producer -io-> FLOW -io-> Producer (same node)
        {
          const ioEdges = edges.filter(e => e.type === 'io');
          const flowNodes = new Set(nodes.filter(n => n.type === 'FLOW').map(n => n.semanticId));

          // Build maps: node → flows it writes to, node → flows it reads from
          const writesToFlow = new Map<string, Set<string>>(); // node → flows
          const readsFromFlow = new Map<string, Set<string>>(); // node → flows

          for (const edge of ioEdges) {
            if (flowNodes.has(edge.targetId)) {
              // edge.sourceId writes to edge.targetId (FLOW)
              if (!writesToFlow.has(edge.sourceId)) writesToFlow.set(edge.sourceId, new Set());
              writesToFlow.get(edge.sourceId)!.add(edge.targetId);
            }
            if (flowNodes.has(edge.sourceId)) {
              // edge.targetId reads from edge.sourceId (FLOW)
              if (!readsFromFlow.has(edge.targetId)) readsFromFlow.set(edge.targetId, new Set());
              readsFromFlow.get(edge.targetId)!.add(edge.sourceId);
            }
          }

          // Find nodes that both write to AND read from the same FLOW (circular chain)
          for (const node of nodes) {
            if (!['FUNC', 'ACTOR'].includes(node.type)) continue;
            const writes = writesToFlow.get(node.semanticId);
            const reads = readsFromFlow.get(node.semanticId);
            if (writes && reads) {
              for (const flowId of writes) {
                if (reads.has(flowId)) {
                  violations.push(this.createValidationViolation(
                    rule,
                    node.semanticId,
                    `Circular io chain: ${node.semanticId} -io-> ${flowId} -io-> ${node.semanticId}`
                  ));
                }
              }
            }
          }
        }
        break;

      // Similarity rules (near_duplicate, merge_candidate) are handled separately

      default:
        // Skip unknown rules
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

/**
 * Get fresh UnifiedRuleEvaluator with current AgentDB data
 *
 * CR-039: NO CACHING - always creates fresh evaluator with current data
 * This ensures /analyze and /optimize see the current graph state
 */
export async function getUnifiedRuleEvaluator(
  workspaceId: string,
  systemId: string
): Promise<UnifiedRuleEvaluator> {
  const { getUnifiedAgentDBService } = await import('../agentdb/unified-agentdb-service.js');

  // Always get the singleton AgentDB (true singleton per CR-039)
  const agentDB = await getUnifiedAgentDBService(workspaceId, systemId);

  // Always create fresh evaluator - no caching (CR-039 Fix 2)
  return new UnifiedRuleEvaluator(agentDB);
}

/**
 * Clear evaluator cache (no-op, kept for API compatibility)
 * @deprecated No longer has any effect - evaluators are not cached
 */
export function clearEvaluatorCache(): void {
  // No-op: evaluators are no longer cached (CR-039)
}

/**
 * Minimal interface required by UnifiedRuleEvaluator and SimilarityScorer
 * Used to create evaluators from raw graph data (e.g., GraphCanvas state)
 */
interface GraphDataProvider {
  getNodes(): Node[];
  getEdges(): Edge[];
  getGraphStats(): { nodeCount: number; edgeCount: number; version: number };
  // Embedding methods for SimilarityScorer
  getEmbedding(node: { uuid: string; semanticId: string; type: string; name: string; descr: string }): Promise<number[]>;
  getCachedEmbedding(nodeId: string): number[] | null;
  batchComputeEmbeddings(nodes: { uuid: string; semanticId: string; type: string; name: string; descr: string }[]): Promise<void>;
  cosineSimilarity(a: number[], b: number[]): number;
  invalidateEmbedding(nodeId: string): void;
  clearEmbeddings(): void;
  getEmbeddingStats(): { size: number; oldestMs: number };
}

/**
 * Create adapter from nodes/edges Maps to GraphDataProvider interface
 * Includes a local EmbeddingStore for similarity scoring
 */
function createGraphDataAdapter(
  nodes: Map<string, Node>,
  edges: Map<string, Edge>
): GraphDataProvider {
  const embeddingStore = new EmbeddingStore();

  return {
    getNodes: () => Array.from(nodes.values()),
    getEdges: () => Array.from(edges.values()),
    getGraphStats: () => ({ nodeCount: nodes.size, edgeCount: edges.size, version: 1 }),
    // Delegate embedding operations to local EmbeddingStore
    getEmbedding: (node) => embeddingStore.getEmbedding(node),
    getCachedEmbedding: (nodeId) => embeddingStore.getCachedEmbedding(nodeId),
    batchComputeEmbeddings: (nodes) => embeddingStore.batchCompute(nodes),
    cosineSimilarity: (a, b) => embeddingStore.cosineSimilarity(a, b),
    invalidateEmbedding: (nodeId) => embeddingStore.invalidate(nodeId),
    clearEmbeddings: () => embeddingStore.clear(),
    getEmbeddingStats: () => embeddingStore.getStats(),
  };
}

/**
 * Create a UnifiedRuleEvaluator from raw graph data (nodes/edges Maps)
 * Used by /analyze command to evaluate GraphCanvas state directly
 */
export function createEvaluatorFromGraph(
  nodes: Map<string, Node>,
  edges: Map<string, Edge>
): UnifiedRuleEvaluator {
  const adapter = createGraphDataAdapter(nodes, edges);
  // Cast adapter to UnifiedAgentDBService since evaluator only uses getNodes/getEdges/getGraphStats + embedding methods
  return new UnifiedRuleEvaluator(adapter as unknown as UnifiedAgentDBService);
}
