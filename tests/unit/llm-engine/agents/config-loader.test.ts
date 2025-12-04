/**
 * Config Loader Unit Tests
 *
 * Tests for agent configuration loading and hot-reload.
 *
 * CR-027: Agentic Framework and Process Upgrade
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
  AgentConfigLoader,
  createAgentConfigLoader,
} from '../../../../src/llm-engine/agents/config-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to actual settings directory
const SETTINGS_PATH = path.resolve(__dirname, '../../../../settings');

describe('AgentConfigLoader', () => {
  let loader: AgentConfigLoader;

  beforeEach(() => {
    loader = createAgentConfigLoader(SETTINGS_PATH);
  });

  afterEach(() => {
    loader.stopWatching();
  });

  describe('loadAgentConfig', () => {
    it('should load agent configuration from JSON file', () => {
      const config = loader.loadAgentConfig();

      expect(config).toBeDefined();
      expect(config.id).toBe('graphengine-agent-config');
      expect(config.version).toBe('1.0.0');
    });

    it('should have all expected agents defined', () => {
      const config = loader.loadAgentConfig();
      const agentIds = Object.keys(config.agents);

      expect(agentIds).toContain('requirements-engineer');
      expect(agentIds).toContain('system-architect');
      expect(agentIds).toContain('architecture-reviewer');
      expect(agentIds).toContain('functional-analyst');
      expect(agentIds).toContain('verification-engineer');
    });

    it('should have workflow configuration', () => {
      const config = loader.loadAgentConfig();

      expect(config.workflow).toBeDefined();
      expect(config.workflow.phaseSequence).toContain('phase1_requirements');
      expect(config.workflow.phaseSequence).toContain('phase2_logical');
      expect(config.workflow.phaseSequence).toContain('phase3_physical');
      expect(config.workflow.phaseSequence).toContain('phase4_verification');
    });
  });

  describe('getAgentDefinition', () => {
    it('should return agent definition for valid agent ID', () => {
      const def = loader.getAgentDefinition('requirements-engineer');

      expect(def).toBeDefined();
      expect(def?.role).toBe('Extract requirements from stakeholder input');
      expect(def?.outputNodeTypes).toContain('REQ');
      expect(def?.outputNodeTypes).toContain('UC');
    });

    it('should return undefined for unknown agent ID', () => {
      const def = loader.getAgentDefinition('unknown-agent');

      expect(def).toBeUndefined();
    });
  });

  describe('getAgentIds', () => {
    it('should return all agent IDs', () => {
      const ids = loader.getAgentIds();

      expect(ids.length).toBe(5);
      expect(ids).toContain('requirements-engineer');
      expect(ids).toContain('verification-engineer');
    });
  });

  describe('getAgentsForPhase', () => {
    it('should return agents for phase1_requirements', () => {
      const agents = loader.getAgentsForPhase('phase1_requirements');

      expect(agents).toContain('requirements-engineer');
    });

    it('should return agents for phase2_logical', () => {
      const agents = loader.getAgentsForPhase('phase2_logical');

      expect(agents).toContain('system-architect');
      expect(agents).toContain('functional-analyst');
    });

    it('should include architecture-reviewer for all phases', () => {
      const agents = loader.getAgentsForPhase('phase2_logical');

      expect(agents).toContain('architecture-reviewer');
    });

    it('should return verification-engineer for phase4', () => {
      const agents = loader.getAgentsForPhase('phase4_verification');

      expect(agents).toContain('verification-engineer');
    });
  });

  describe('loadPrompt', () => {
    it('should load prompt for requirements-engineer', () => {
      const prompt = loader.loadPrompt('requirements-engineer');

      expect(prompt).toBeDefined();
      expect(prompt).toContain('Requirements Engineer');
      expect(prompt).toContain('INVEST');
    });

    it('should load prompt for verification-engineer', () => {
      const prompt = loader.loadPrompt('verification-engineer');

      expect(prompt).toBeDefined();
      expect(prompt).toContain('Verification Engineer');
      expect(prompt).toContain('TEST');
    });

    it('should throw for unknown agent', () => {
      expect(() => loader.loadPrompt('unknown-agent')).toThrow('Unknown agent');
    });
  });

  describe('getRoutingRules', () => {
    it('should return routing rules', () => {
      const rules = loader.getRoutingRules();

      expect(rules.length).toBeGreaterThan(0);
      expect(rules[0]).toHaveProperty('condition');
      expect(rules[0]).toHaveProperty('agent');
    });
  });

  describe('getDefaultAgent', () => {
    it('should return requirements-engineer as default', () => {
      const defaultAgent = loader.getDefaultAgent();

      expect(defaultAgent).toBe('requirements-engineer');
    });
  });

  describe('getPhaseSequence', () => {
    it('should return phase sequence in order', () => {
      const phases = loader.getPhaseSequence();

      expect(phases[0]).toBe('phase1_requirements');
      expect(phases[1]).toBe('phase2_logical');
      expect(phases[2]).toBe('phase3_physical');
      expect(phases[3]).toBe('phase4_verification');
    });
  });

  describe('hasToolAccess', () => {
    it('should return true for valid tool access', () => {
      expect(loader.hasToolAccess('requirements-engineer', 'graph_write')).toBe(true);
      expect(loader.hasToolAccess('architecture-reviewer', 'validation_check')).toBe(true);
    });

    it('should return false for missing tool access', () => {
      expect(loader.hasToolAccess('architecture-reviewer', 'graph_write')).toBe(false);
    });

    it('should return false for unknown agent', () => {
      expect(loader.hasToolAccess('unknown-agent', 'graph_write')).toBe(false);
    });
  });

  describe('getSuccessCriteria', () => {
    it('should return success criteria for agent', () => {
      const criteria = loader.getSuccessCriteria('system-architect');

      expect(criteria).toBeDefined();
      expect(criteria?.rules).toContain('millers_law_func');
      expect(criteria?.minReward).toBe(0.7);
    });
  });

  describe('getWorkItemQueueConfig', () => {
    it('should return work item queue configuration', () => {
      const config = loader.getWorkItemQueueConfig();

      expect(config.storage).toBe('agentdb');
      expect(config.timeout.high).toBe(60);
      expect(config.timeout.medium).toBe(300);
      expect(config.timeout.low).toBe(900);
    });
  });

  describe('validate', () => {
    it('should validate configuration successfully', () => {
      const result = loader.validate();

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('reload', () => {
    it('should reload configuration', () => {
      const config1 = loader.getConfig();
      loader.reload();
      const config2 = loader.getConfig();

      expect(config1.id).toBe(config2.id);
    });
  });
});
