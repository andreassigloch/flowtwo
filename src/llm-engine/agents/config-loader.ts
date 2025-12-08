/**
 * Agent Configuration Loader
 *
 * Loads agent definitions from agent-config.json and prompts from settings/prompts/*.md.
 * Supports hot-reload without restart.
 *
 * CR-027: Agentic Framework and Process Upgrade
 *
 * @author andreas@siglochconsulting
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Agent configuration from agent-config.json
 */
export interface AgentDefinition {
  role: string;
  description: string;
  responsibilities: string[];
  inputPhases: string[];
  outputNodeTypes: string[];
  outputEdgeTypes: string[];
  promptTemplate: string;
  toolAccess: string[];
  decisionTrees: string[];
  successCriteria: {
    rules: string[];
    minReward?: number;
    completeness?: string;
  };
  outputFormat: Record<string, unknown>;
  reviewTriggers?: string[];
}

/**
 * Workflow routing rule
 */
export interface RoutingRule {
  condition: string;
  agent: string;
}

/**
 * Workflow routing configuration
 */
export interface RoutingConfig {
  description: string;
  rules?: RoutingRule[];
  steps?: string[];
  default?: string;
}

/**
 * Agent handoff configuration
 */
export interface HandoffConfig {
  trigger: string;
  handoffData: Record<string, string>;
}

/**
 * Work item queue configuration
 */
export interface WorkItemQueueConfig {
  storage: string;
  prioritization: string[];
  fields: Record<string, string>;
  timeout: Record<string, number>;
}

/**
 * Tool definition
 */
export interface ToolDefinition {
  description: string;
  input?: string;
  returns: string;
}

/**
 * Full agent configuration
 */
export interface AgentConfig {
  $schema: string;
  id: string;
  version: string;
  description: string;
  meta: {
    author: string;
    created: string;
    relatedFiles: Record<string, string>;
  };
  agents: Record<string, AgentDefinition>;
  workflow: {
    phaseSequence: string[];
    routing: Record<string, RoutingConfig>;
    agentHandoff: Record<string, HandoffConfig>;
  };
  coordination: {
    workItemQueue: WorkItemQueueConfig;
    agentCommunication: {
      protocol: string;
      messageFormat: Record<string, unknown>;
    };
    sessionState: {
      storage: string;
      fields: Record<string, string>;
    };
  };
  toolDefinitions: Record<string, ToolDefinition>;
}

/**
 * Change listener callback type
 */
type ChangeListener = (type: 'config' | 'prompt', agentId?: string) => void;

/**
 * Agent Configuration Loader
 *
 * Manages loading and hot-reloading of agent configuration and prompts.
 */
export class AgentConfigLoader {
  private config: AgentConfig | null = null;
  private prompts: Map<string, string> = new Map();
  private configPath: string;
  private promptsDir: string;
  private watchers: fs.FSWatcher[] = [];
  private listeners: ChangeListener[] = [];
  private lastConfigMtime: number = 0;
  private promptMtimes: Map<string, number> = new Map();

  constructor(settingsPath?: string) {
    const basePath = settingsPath || path.resolve(__dirname, '../../../settings');
    this.configPath = path.join(basePath, 'agent-config.json');
    this.promptsDir = path.join(basePath, 'prompts');
  }

  /**
   * Load agent configuration from JSON file
   */
  loadAgentConfig(): AgentConfig {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(`Agent config not found: ${this.configPath}`);
    }

    const content = fs.readFileSync(this.configPath, 'utf-8');
    this.config = JSON.parse(content) as AgentConfig;
    this.lastConfigMtime = fs.statSync(this.configPath).mtimeMs;

    return this.config;
  }

  /**
   * Get current config (loads if not loaded)
   */
  getConfig(): AgentConfig {
    if (!this.config) {
      return this.loadAgentConfig();
    }
    return this.config;
  }

  /**
   * Load prompt template for an agent
   */
  loadPrompt(agentId: string): string {
    const config = this.getConfig();
    const agentDef = config.agents[agentId];

    if (!agentDef) {
      throw new Error(`Unknown agent: ${agentId}`);
    }

    const promptPath = path.resolve(
      path.dirname(this.configPath),
      '..',
      agentDef.promptTemplate
    );

    if (!fs.existsSync(promptPath)) {
      throw new Error(`Prompt template not found: ${promptPath}`);
    }

    const content = fs.readFileSync(promptPath, 'utf-8');
    this.prompts.set(agentId, content);
    this.promptMtimes.set(agentId, fs.statSync(promptPath).mtimeMs);

    return content;
  }

  /**
   * Get prompt (loads if not loaded)
   */
  getPrompt(agentId: string): string {
    if (!this.prompts.has(agentId)) {
      return this.loadPrompt(agentId);
    }
    return this.prompts.get(agentId)!;
  }

  /**
   * Get agent definition by ID
   */
  getAgentDefinition(agentId: string): AgentDefinition | undefined {
    const config = this.getConfig();
    return config.agents[agentId];
  }

  /**
   * Get all agent IDs
   */
  getAgentIds(): string[] {
    const config = this.getConfig();
    return Object.keys(config.agents);
  }

  /**
   * Get agents for a specific phase
   */
  getAgentsForPhase(phase: string): string[] {
    const config = this.getConfig();
    return Object.entries(config.agents)
      .filter(([_, def]) => def.inputPhases.includes(phase) || def.inputPhases.includes('all'))
      .map(([id]) => id);
  }

  /**
   * Get routing rules for user input
   */
  getRoutingRules(): RoutingRule[] {
    const config = this.getConfig();
    return config.workflow.routing.user_input?.rules || [];
  }

  /**
   * Get default agent for routing
   */
  getDefaultAgent(): string {
    const config = this.getConfig();
    return config.workflow.routing.user_input?.default || 'requirements-engineer';
  }

  /**
   * Get handoff configuration between agents
   */
  getHandoffConfig(fromAgent: string, toAgent: string): HandoffConfig | undefined {
    const config = this.getConfig();
    const key = `${fromAgent} → ${toAgent}`;
    return config.workflow.agentHandoff[key];
  }

  /**
   * Get work item queue configuration
   */
  getWorkItemQueueConfig(): WorkItemQueueConfig {
    const config = this.getConfig();
    return config.coordination.workItemQueue;
  }

  /**
   * Get phase sequence
   */
  getPhaseSequence(): string[] {
    const config = this.getConfig();
    return config.workflow.phaseSequence;
  }

  /**
   * Get tool definition
   */
  getToolDefinition(toolId: string): ToolDefinition | undefined {
    const config = this.getConfig();
    return config.toolDefinitions[toolId];
  }

  /**
   * Check if agent has access to a tool
   */
  hasToolAccess(agentId: string, toolId: string): boolean {
    const def = this.getAgentDefinition(agentId);
    return def?.toolAccess.includes(toolId) || false;
  }

  /**
   * Get success criteria for an agent
   */
  getSuccessCriteria(agentId: string): AgentDefinition['successCriteria'] | undefined {
    const def = this.getAgentDefinition(agentId);
    return def?.successCriteria;
  }

  /**
   * Watch for configuration changes (hot-reload)
   */
  watchForChanges(callback: ChangeListener): void {
    this.listeners.push(callback);

    // Only start watchers if not already running
    if (this.watchers.length > 0) {
      return;
    }

    // Watch config file
    if (fs.existsSync(this.configPath)) {
      const configWatcher = fs.watch(this.configPath, (eventType) => {
        if (eventType === 'change') {
          this.handleConfigChange();
        }
      });
      this.watchers.push(configWatcher);
    }

    // Watch prompts directory
    if (fs.existsSync(this.promptsDir)) {
      const promptsWatcher = fs.watch(this.promptsDir, (eventType, filename) => {
        if (eventType === 'change' && filename?.endsWith('.md')) {
          this.handlePromptChange(filename);
        }
      });
      this.watchers.push(promptsWatcher);
    }
  }

  /**
   * Handle config file change
   */
  private handleConfigChange(): void {
    try {
      const currentMtime = fs.statSync(this.configPath).mtimeMs;
      if (currentMtime === this.lastConfigMtime) {
        return; // No actual change
      }

      this.loadAgentConfig();
      this.notifyListeners('config');
    } catch {
      // Ignore errors during hot-reload (file might be mid-write)
    }
  }

  /**
   * Handle prompt file change
   */
  private handlePromptChange(filename: string): void {
    const agentId = filename.replace('.md', '');

    try {
      const promptPath = path.join(this.promptsDir, filename);
      const currentMtime = fs.statSync(promptPath).mtimeMs;
      const lastMtime = this.promptMtimes.get(agentId) || 0;

      if (currentMtime === lastMtime) {
        return; // No actual change
      }

      // Reload prompt
      this.loadPrompt(agentId);
      this.notifyListeners('prompt', agentId);
    } catch {
      // Ignore errors during hot-reload
    }
  }

  /**
   * Notify all listeners of a change
   */
  private notifyListeners(type: 'config' | 'prompt', agentId?: string): void {
    for (const listener of this.listeners) {
      try {
        listener(type, agentId);
      } catch {
        // Don't let one listener break others
      }
    }
  }

  /**
   * Stop watching for changes
   */
  stopWatching(): void {
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];
    this.listeners = [];
  }

  /**
   * Reload all configuration
   */
  reload(): void {
    this.config = null;
    this.prompts.clear();
    this.promptMtimes.clear();
    this.loadAgentConfig();

    // Reload all prompts that were previously loaded
    for (const agentId of this.getAgentIds()) {
      try {
        this.loadPrompt(agentId);
      } catch {
        // Some agents might not have prompts
      }
    }
  }

  /**
   * Validate configuration structure
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const config = this.getConfig();

      // Check required top-level fields
      if (!config.agents || Object.keys(config.agents).length === 0) {
        errors.push('No agents defined');
      }

      if (!config.workflow?.phaseSequence?.length) {
        errors.push('No phase sequence defined');
      }

      // Validate each agent
      for (const [agentId, def] of Object.entries(config.agents)) {
        if (!def.promptTemplate) {
          errors.push(`Agent ${agentId}: missing promptTemplate`);
        }

        if (!def.toolAccess?.length) {
          errors.push(`Agent ${agentId}: no tool access defined`);
        }

        // Check prompt file exists
        try {
          this.loadPrompt(agentId);
        } catch {
          errors.push(`Agent ${agentId}: prompt file not found`);
        }
      }

      // Validate routing rules reference valid agents
      const validAgentIds = new Set(Object.keys(config.agents));
      const routingRules = config.workflow.routing.user_input?.rules || [];

      for (const rule of routingRules) {
        if (!validAgentIds.has(rule.agent)) {
          errors.push(`Routing rule references unknown agent: ${rule.agent}`);
        }
      }

      const defaultAgent = config.workflow.routing.user_input?.default;
      if (defaultAgent && !validAgentIds.has(defaultAgent)) {
        errors.push(`Default agent not found: ${defaultAgent}`);
      }
    } catch (e) {
      errors.push(`Config load error: ${e instanceof Error ? e.message : String(e)}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Singleton instance
let loaderInstance: AgentConfigLoader | null = null;

/**
 * Get the singleton AgentConfigLoader instance
 */
export function getAgentConfigLoader(): AgentConfigLoader {
  if (!loaderInstance) {
    loaderInstance = new AgentConfigLoader();
  }
  return loaderInstance;
}

/**
 * Create a new AgentConfigLoader with custom settings path
 */
export function createAgentConfigLoader(settingsPath: string): AgentConfigLoader {
  return new AgentConfigLoader(settingsPath);
}
