/**
 * Rule Loader Unit Tests
 *
 * Tests for loading and querying ontology rules from JSON.
 *
 * CR-030: Evaluation Criteria Implementation
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { RuleLoader, createRuleLoader } from '../../../../src/llm-engine/validation/rule-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('RuleLoader', () => {
  let loader: RuleLoader;

  beforeEach(() => {
    const settingsPath = path.resolve(__dirname, '../../../../settings');
    loader = createRuleLoader(settingsPath);
  });

  describe('load', () => {
    it('should load ontology-rules.json', () => {
      const config = loader.load();

      expect(config).toBeDefined();
      expect(config.id).toBe('graphengine-ontology-rules');
      expect(config.version).toBeDefined();
    });

    it('should have required sections', () => {
      const config = loader.getConfig();

      expect(config.nodeTypes).toBeDefined();
      expect(config.edgeTypes).toBeDefined();
      expect(config.phases).toBeDefined();
      expect(config.integrityRules).toBeDefined();
      expect(config.validationRules).toBeDefined();
    });
  });

  describe('getIntegrityRules', () => {
    it('should return all integrity rules', () => {
      const rules = loader.getIntegrityRules();

      expect(rules.length).toBeGreaterThan(0);
      expect(rules.every((r) => r.id && r.severity && r.cypher)).toBe(true);
    });

    it('should include required integrity rules', () => {
      const rules = loader.getIntegrityRules();
      const ruleIds = rules.map((r) => r.id);

      expect(ruleIds).toContain('no_duplicate_nodes');
      expect(ruleIds).toContain('no_duplicate_edges');
      expect(ruleIds).toContain('naming');
      expect(ruleIds).toContain('required_properties');
    });
  });

  describe('getValidationRules', () => {
    it('should return all validation rules', () => {
      const rules = loader.getValidationRules();

      expect(rules.length).toBeGreaterThan(0);
      expect(rules.every((r) => r.id && r.severity)).toBe(true);
    });

    it('should include rules with weights', () => {
      const rules = loader.getValidationRules();
      const rulesWithWeights = rules.filter((r) => r.weight !== undefined);

      expect(rulesWithWeights.length).toBeGreaterThan(0);
    });
  });

  describe('getIntegrityRulesForPhase', () => {
    it('should return rules for phase1_requirements', () => {
      const rules = loader.getIntegrityRulesForPhase('phase1_requirements');

      expect(rules.length).toBeGreaterThan(0);
      rules.forEach((rule) => {
        expect(rule.phase === 'all' || rule.phase === 'phase1_requirements').toBe(true);
      });
    });

    it('should return all-phase rules for any phase', () => {
      const phase1Rules = loader.getIntegrityRulesForPhase('phase1_requirements');
      const phase2Rules = loader.getIntegrityRulesForPhase('phase2_logical');

      const allPhaseRules = loader.getIntegrityRules().filter((r) => r.phase === 'all');

      allPhaseRules.forEach((rule) => {
        expect(phase1Rules.some((r) => r.id === rule.id)).toBe(true);
        expect(phase2Rules.some((r) => r.id === rule.id)).toBe(true);
      });
    });
  });

  describe('getValidationRulesForPhase', () => {
    it('should return rules for phase2_logical', () => {
      const rules = loader.getValidationRulesForPhase('phase2_logical');

      expect(rules.length).toBeGreaterThan(0);
      rules.forEach((rule) => {
        expect(rule.phase === 'all' || rule.phase === 'phase2_logical').toBe(true);
      });
    });

    it('should include function-related rules for phase2', () => {
      const rules = loader.getValidationRulesForPhase('phase2_logical');
      const ruleIds = rules.map((r) => r.id);

      expect(ruleIds).toContain('function_requirements');
      expect(ruleIds).toContain('function_io');
    });
  });

  describe('getRuleWeight', () => {
    it('should return weight for known rules', () => {
      const weight = loader.getRuleWeight('function_requirements');
      expect(weight).toBe(0.20);
    });

    it('should return 0 for unknown rules', () => {
      const weight = loader.getRuleWeight('unknown_rule');
      expect(weight).toBe(0);
    });
  });

  describe('getRule', () => {
    it('should return integrity rule by ID', () => {
      const rule = loader.getRule('no_duplicate_nodes');

      expect(rule).toBeDefined();
      expect(rule?.id).toBe('no_duplicate_nodes');
    });

    it('should return validation rule by ID', () => {
      const rule = loader.getRule('function_requirements');

      expect(rule).toBeDefined();
      expect(rule?.id).toBe('function_requirements');
    });

    it('should return undefined for unknown rule', () => {
      const rule = loader.getRule('unknown_rule');
      expect(rule).toBeUndefined();
    });
  });

  describe('getSimilarityThresholds', () => {
    it('should return FUNC similarity thresholds', () => {
      const thresholds = loader.getFuncSimilarityThresholds();

      expect(thresholds.nearDuplicate).toBe(0.85);
      expect(thresholds.mergeCandidate).toBe(0.70);
      expect(thresholds.review).toBe(0.50);
    });

    it('should return SCHEMA similarity thresholds', () => {
      const thresholds = loader.getSchemaSimilarityThresholds();

      expect(thresholds.nearDuplicate).toBe(0.85);
      expect(thresholds.mergeCandidate).toBe(0.70);
      expect(thresholds.review).toBe(0.50);
    });
  });

  describe('getCanonicalVerbs', () => {
    it('should return canonical verb mapping', () => {
      const verbs = loader.getCanonicalVerbs();

      expect(verbs.Validate).toContain('Check');
      expect(verbs.Validate).toContain('Verify');
      expect(verbs.Create).toContain('Generate');
      expect(verbs.Transform).toContain('Convert');
    });
  });

  describe('getPhaseDefinition', () => {
    it('should return phase definition', () => {
      const phase = loader.getPhaseDefinition('phase2_logical');

      expect(phase).toBeDefined();
      expect(phase?.name).toBe('Logical Architecture');
      expect(phase?.gateRules).toBeDefined();
      expect(phase?.gateRules.length).toBeGreaterThan(0);
    });
  });

  describe('getPhaseGateRules', () => {
    it('should return gate rules for phase', () => {
      const gateRules = loader.getPhaseGateRules('phase2_logical');

      expect(gateRules.length).toBeGreaterThan(0);
      expect(gateRules).toContain('millers_law');
      expect(gateRules).toContain('function_requirements');
    });
  });

  describe('getNodeType', () => {
    it('should return node type definition', () => {
      const funcType = loader.getNodeType('FUNC');

      expect(funcType).toBeDefined();
      expect(funcType?.name).toBe('Function');
      expect(funcType?.abbreviation).toBe('FN');
      expect(funcType?.requiredProperties).toContain('uuid');
      expect(funcType?.allowedOutgoingEdges).toContain('compose');
    });
  });

  describe('getEdgeType', () => {
    it('should return edge type definition', () => {
      const composeType = loader.getEdgeType('compose');

      expect(composeType).toBeDefined();
      expect(composeType?.name).toBe('Composition');
      expect(composeType?.isNesting).toBe(true);
    });
  });

  describe('getRewardConfig', () => {
    it('should return reward calculation config', () => {
      const config = loader.getRewardConfig();

      expect(config.successThreshold).toBe(0.7);
      expect(config.componentWeights).toBeDefined();
      expect(config.structuralRuleWeights).toBeDefined();
    });
  });

  describe('getSuggestion', () => {
    it('should return suggestion for known rule', () => {
      const suggestion = loader.getSuggestion('function_requirements');

      expect(suggestion).toBeDefined();
      expect(suggestion).toContain('satisfy');
    });

    it('should return undefined for unknown rule', () => {
      const suggestion = loader.getSuggestion('unknown_rule');
      expect(suggestion).toBeUndefined();
    });
  });

  describe('getSystemPromptSection', () => {
    it('should return LLM system prompt section', () => {
      const prompt = loader.getSystemPromptSection();

      expect(prompt).toBeDefined();
      expect(prompt).toContain('INCOSE');
      expect(prompt).toContain('SysML');
    });
  });

  describe('getSimilarityRules', () => {
    it('should return rules that require similarity calculation', () => {
      const rules = loader.getSimilarityRules();

      expect(rules.length).toBeGreaterThan(0);
      rules.forEach((rule) => {
        expect(rule.note?.includes('similarity') || rule.threshold !== undefined).toBe(true);
      });
    });
  });

  describe('getCypherRules', () => {
    it('should return rules with Cypher queries', () => {
      const rules = loader.getCypherRules();

      expect(rules.length).toBeGreaterThan(0);
      rules.forEach((rule) => {
        expect(rule.cypher).toBeDefined();
      });
    });
  });

  describe('getVersion', () => {
    it('should return config version', () => {
      const version = loader.getVersion();

      expect(version).toBeDefined();
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });
});
