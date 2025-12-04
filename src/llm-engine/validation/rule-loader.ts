/**
 * Rule Loader
 *
 * Loads validation rules from ontology-rules.json.
 * Provides phase-aware rule filtering and weight lookup.
 *
 * CR-030: Evaluation Criteria Implementation
 *
 * @author andreas@siglochconsulting
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type {
  OntologyRulesConfig,
  IntegrityRule,
  ValidationRule,
  PhaseId,
  SimilarityThresholds,
  PhaseDefinition,
  NodeTypeDefinition,
  EdgeTypeDefinition,
} from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Rule Loader
 *
 * Manages loading and querying of ontology rules from JSON.
 */
export class RuleLoader {
  private config: OntologyRulesConfig | null = null;
  private configPath: string;
  private lastMtime: number = 0;

  constructor(settingsPath?: string) {
    const basePath = settingsPath || path.resolve(__dirname, '../../../settings');
    this.configPath = path.join(basePath, 'ontology-rules.json');
  }

  /**
   * Load rules from JSON file
   */
  load(): OntologyRulesConfig {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(`Ontology rules not found: ${this.configPath}`);
    }

    const content = fs.readFileSync(this.configPath, 'utf-8');
    this.config = JSON.parse(content) as OntologyRulesConfig;
    this.lastMtime = fs.statSync(this.configPath).mtimeMs;

    return this.config;
  }

  /**
   * Get config (loads if not loaded)
   */
  getConfig(): OntologyRulesConfig {
    if (!this.config) {
      return this.load();
    }
    return this.config;
  }

  /**
   * Check if config file changed and reload if needed
   */
  reloadIfChanged(): boolean {
    if (!fs.existsSync(this.configPath)) {
      return false;
    }

    const currentMtime = fs.statSync(this.configPath).mtimeMs;
    if (currentMtime !== this.lastMtime) {
      this.load();
      return true;
    }
    return false;
  }

  /**
   * Get all integrity rules
   */
  getIntegrityRules(): IntegrityRule[] {
    const config = this.getConfig();
    return Object.values(config.integrityRules);
  }

  /**
   * Get all validation rules
   */
  getValidationRules(): ValidationRule[] {
    const config = this.getConfig();
    return Object.values(config.validationRules);
  }

  /**
   * Get integrity rules for a specific phase
   */
  getIntegrityRulesForPhase(phase: PhaseId): IntegrityRule[] {
    return this.getIntegrityRules().filter(
      (rule) => rule.phase === 'all' || rule.phase === phase
    );
  }

  /**
   * Get validation rules for a specific phase
   */
  getValidationRulesForPhase(phase: PhaseId): ValidationRule[] {
    return this.getValidationRules().filter(
      (rule) => rule.phase === 'all' || rule.phase === phase
    );
  }

  /**
   * Get phase gate rules (rules that must pass for phase transition)
   */
  getPhaseGateRules(phase: PhaseId): string[] {
    const config = this.getConfig();
    const phaseDef = config.phases[phase];
    return phaseDef?.gateRules || [];
  }

  /**
   * Get rule weight from structuralRuleWeights
   */
  getRuleWeight(ruleId: string): number {
    const config = this.getConfig();
    const weight = config.rewardCalculation.structuralRuleWeights[ruleId];
    return weight ?? 0;
  }

  /**
   * Get rule by ID
   */
  getRule(ruleId: string): IntegrityRule | ValidationRule | undefined {
    const config = this.getConfig();
    return config.integrityRules[ruleId] || config.validationRules[ruleId];
  }

  /**
   * Get similarity thresholds for FUNC nodes
   */
  getFuncSimilarityThresholds(): SimilarityThresholds {
    const config = this.getConfig();
    return config.funcSimilarity.thresholds;
  }

  /**
   * Get similarity thresholds for SCHEMA nodes
   */
  getSchemaSimilarityThresholds(): SimilarityThresholds {
    const config = this.getConfig();
    return config.schemaSimilarity.thresholds;
  }

  /**
   * Get canonical verb mapping for FUNC similarity
   */
  getCanonicalVerbs(): Record<string, string[]> {
    const config = this.getConfig();
    return config.funcSimilarity.canonicalVerbs;
  }

  /**
   * Get phase definition
   */
  getPhaseDefinition(phase: PhaseId): PhaseDefinition | undefined {
    const config = this.getConfig();
    return config.phases[phase];
  }

  /**
   * Get all phase IDs in sequence
   */
  getPhaseSequence(): PhaseId[] {
    const config = this.getConfig();
    return Object.keys(config.phases) as PhaseId[];
  }

  /**
   * Get node type definition
   */
  getNodeType(type: string): NodeTypeDefinition | undefined {
    const config = this.getConfig();
    return config.nodeTypes[type];
  }

  /**
   * Get all node types
   */
  getNodeTypes(): Record<string, NodeTypeDefinition> {
    const config = this.getConfig();
    return config.nodeTypes;
  }

  /**
   * Get edge type definition
   */
  getEdgeType(type: string): EdgeTypeDefinition | undefined {
    const config = this.getConfig();
    return config.edgeTypes[type];
  }

  /**
   * Get all edge types
   */
  getEdgeTypes(): Record<string, EdgeTypeDefinition> {
    const config = this.getConfig();
    return config.edgeTypes;
  }

  /**
   * Get reward calculation config
   */
  getRewardConfig() {
    const config = this.getConfig();
    return config.rewardCalculation;
  }

  /**
   * Get phase threshold for gate transition
   */
  getPhaseThreshold(fromPhase: PhaseId, metric: string): number | undefined {
    const config = this.getConfig();
    const thresholdKey = this.getPhaseThresholdKey(fromPhase);
    if (!thresholdKey) return undefined;
    return config.rewardCalculation.phaseThresholds[thresholdKey]?.[metric];
  }

  /**
   * Get LLM context suggestion for a rule
   */
  getSuggestion(ruleId: string): string | undefined {
    const config = this.getConfig();
    return config.llmContext.suggestionMap[ruleId];
  }

  /**
   * Get LLM system prompt section
   */
  getSystemPromptSection(): string {
    const config = this.getConfig();
    return config.llmContext.systemPromptSection;
  }

  /**
   * Get rules that require similarity calculation (not pure Cypher)
   */
  getSimilarityRules(): ValidationRule[] {
    return this.getValidationRules().filter(
      (rule) => rule.note?.includes('similarity') || rule.threshold !== undefined
    );
  }

  /**
   * Get rules with Cypher queries
   */
  getCypherRules(): (IntegrityRule | ValidationRule)[] {
    const integrity = this.getIntegrityRules().filter((r) => r.cypher);
    const validation = this.getValidationRules().filter((r) => r.cypher);
    return [...integrity, ...validation];
  }

  /**
   * Map phase to threshold key
   */
  private getPhaseThresholdKey(phase: PhaseId): string | undefined {
    const mapping: Record<string, string> = {
      phase1_requirements: 'phase1to2',
      phase2_logical: 'phase2to3',
      phase3_physical: 'phase3to4',
      phase4_verification: 'phase4toHandoff',
    };
    return mapping[phase];
  }

  /**
   * Get config version
   */
  getVersion(): string {
    const config = this.getConfig();
    return config.version;
  }
}

// Singleton instance
let loaderInstance: RuleLoader | null = null;

/**
 * Get the singleton RuleLoader instance
 */
export function getRuleLoader(): RuleLoader {
  if (!loaderInstance) {
    loaderInstance = new RuleLoader();
  }
  return loaderInstance;
}

/**
 * Create a new RuleLoader with custom settings path
 */
export function createRuleLoader(settingsPath: string): RuleLoader {
  return new RuleLoader(settingsPath);
}
