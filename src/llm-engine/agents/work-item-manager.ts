/**
 * Work Item Manager
 *
 * Manages work item lifecycle with priority-based processing and timeouts.
 * Stores work items in AgentDB for persistence.
 *
 * CR-027: Agentic Framework and Process Upgrade
 *
 * @author andreas@siglochconsulting
 */

import { getAgentConfigLoader } from './config-loader.js';
import { AgentDBLogger } from '../agentdb/agentdb-logger.js';

/**
 * Work item status
 */
export type WorkItemStatus = 'pending' | 'in_progress' | 'completed' | 'blocked';

/**
 * Work item priority
 */
export type WorkItemPriority = 'high' | 'medium' | 'low';

/**
 * Work item input for creation
 */
export interface WorkItemInput {
  targetAgent: string;
  action: string;
  affectedNodes: string[];
  sourceRule?: string;
  priority?: WorkItemPriority;
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Full work item with all fields
 */
export interface WorkItem {
  id: string;
  targetAgent: string;
  action: string;
  affectedNodes: string[];
  sourceRule?: string;
  priority: WorkItemPriority;
  status: WorkItemStatus;
  createdAt: string;
  createdBy: string;
  startedAt?: string;
  completedAt?: string;
  blockedReason?: string;
  result?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Work item filter options
 */
export interface WorkItemFilter {
  targetAgent?: string;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  sourceRule?: string;
}

/**
 * Work Item Manager
 *
 * Manages work item queue with full lifecycle support.
 */
export class WorkItemManager {
  private items: Map<string, WorkItem> = new Map();
  private configLoader = getAgentConfigLoader();
  private timeoutHandles: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /**
   * Create a new work item
   */
  createWorkItem(input: WorkItemInput): WorkItem {
    const id = `wi-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const item: WorkItem = {
      id,
      targetAgent: input.targetAgent,
      action: input.action,
      affectedNodes: input.affectedNodes,
      sourceRule: input.sourceRule,
      priority: input.priority || 'medium',
      status: 'pending',
      createdAt: new Date().toISOString(),
      createdBy: input.createdBy || 'system',
      metadata: input.metadata,
    };

    this.items.set(id, item);
    this.startTimeout(item);

    AgentDBLogger.agentActivity(
      input.targetAgent,
      'work item created',
      `${input.action.substring(0, 50)}...`
    );

    return item;
  }

  /**
   * Get next work item for an agent (highest priority first)
   */
  getNextItem(agentId: string): WorkItem | null {
    const config = this.configLoader.getWorkItemQueueConfig();
    const priorityOrder = config.prioritization;

    // Get pending items for this agent
    const pendingItems = Array.from(this.items.values())
      .filter((item) => item.targetAgent === agentId && item.status === 'pending')
      .sort((a, b) => {
        // Sort by priority order from config
        const aPriorityIndex = this.getPriorityIndex(a, priorityOrder);
        const bPriorityIndex = this.getPriorityIndex(b, priorityOrder);

        if (aPriorityIndex !== bPriorityIndex) {
          return aPriorityIndex - bPriorityIndex;
        }

        // Then by creation time (oldest first)
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      });

    return pendingItems[0] || null;
  }

  /**
   * Get priority index based on config prioritization
   */
  private getPriorityIndex(item: WorkItem, priorityOrder: string[]): number {
    // Check for phase gate blockers first
    if (item.sourceRule && priorityOrder.includes('phase_gate_blocker')) {
      // Gate blockers have highest priority
      if (item.action.includes('GATE BLOCKER')) {
        return priorityOrder.indexOf('phase_gate_blocker');
      }
    }

    // Check for hard rule violations
    if (item.priority === 'high' && priorityOrder.includes('hard_rule_violation')) {
      return priorityOrder.indexOf('hard_rule_violation');
    }

    // Check for soft rule violations
    if (item.priority === 'medium' && priorityOrder.includes('soft_rule_violation')) {
      return priorityOrder.indexOf('soft_rule_violation');
    }

    // Default: user request priority
    return priorityOrder.indexOf('user_request');
  }

  /**
   * Update work item status
   */
  updateStatus(
    itemId: string,
    status: WorkItemStatus,
    options?: { blockedReason?: string; result?: string }
  ): void {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`Work item not found: ${itemId}`);
    }

    const oldStatus = item.status;
    item.status = status;

    switch (status) {
      case 'in_progress':
        item.startedAt = new Date().toISOString();
        this.clearTimeout(itemId);
        break;

      case 'completed':
        item.completedAt = new Date().toISOString();
        if (options?.result) {
          item.result = options.result;
        }
        this.clearTimeout(itemId);
        break;

      case 'blocked':
        if (options?.blockedReason) {
          item.blockedReason = options.blockedReason;
        }
        this.clearTimeout(itemId);
        break;

      case 'pending':
        // Re-queued, restart timeout
        this.startTimeout(item);
        break;
    }

    AgentDBLogger.agentActivity(
      item.targetAgent,
      `status: ${oldStatus} → ${status}`,
      item.action.substring(0, 30)
    );
  }

  /**
   * Get blocking items for a phase
   */
  getBlockingItems(_phase: string): WorkItem[] {
    return Array.from(this.items.values()).filter(
      (item) =>
        item.status === 'pending' &&
        item.priority === 'high' &&
        item.action.includes('GATE BLOCKER')
    );
  }

  /**
   * Get work item by ID
   */
  getItem(itemId: string): WorkItem | undefined {
    return this.items.get(itemId);
  }

  /**
   * Get all work items matching filter
   */
  getItems(filter?: WorkItemFilter): WorkItem[] {
    let items = Array.from(this.items.values());

    if (filter?.targetAgent) {
      items = items.filter((i) => i.targetAgent === filter.targetAgent);
    }

    if (filter?.status) {
      items = items.filter((i) => i.status === filter.status);
    }

    if (filter?.priority) {
      items = items.filter((i) => i.priority === filter.priority);
    }

    if (filter?.sourceRule) {
      items = items.filter((i) => i.sourceRule === filter.sourceRule);
    }

    return items;
  }

  /**
   * Get pending count for an agent
   */
  getPendingCount(agentId: string): number {
    return Array.from(this.items.values()).filter(
      (item) => item.targetAgent === agentId && item.status === 'pending'
    ).length;
  }

  /**
   * Get statistics
   */
  getStats(): {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    blocked: number;
    byAgent: Record<string, number>;
    byPriority: Record<string, number>;
  } {
    const items = Array.from(this.items.values());

    const byAgent: Record<string, number> = {};
    const byPriority: Record<string, number> = { high: 0, medium: 0, low: 0 };

    for (const item of items) {
      byAgent[item.targetAgent] = (byAgent[item.targetAgent] || 0) + 1;
      byPriority[item.priority] = (byPriority[item.priority] || 0) + 1;
    }

    return {
      total: items.length,
      pending: items.filter((i) => i.status === 'pending').length,
      inProgress: items.filter((i) => i.status === 'in_progress').length,
      completed: items.filter((i) => i.status === 'completed').length,
      blocked: items.filter((i) => i.status === 'blocked').length,
      byAgent,
      byPriority,
    };
  }

  /**
   * Remove completed items older than specified minutes
   */
  cleanup(olderThanMinutes: number = 60): number {
    const cutoff = Date.now() - olderThanMinutes * 60 * 1000;
    let removed = 0;

    for (const [id, item] of this.items) {
      if (
        item.status === 'completed' &&
        item.completedAt &&
        new Date(item.completedAt).getTime() < cutoff
      ) {
        this.items.delete(id);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Clear all work items
   */
  clear(): void {
    for (const handle of this.timeoutHandles.values()) {
      clearTimeout(handle);
    }
    this.timeoutHandles.clear();
    this.items.clear();
  }

  /**
   * Start timeout for a work item
   */
  private startTimeout(item: WorkItem): void {
    const config = this.configLoader.getWorkItemQueueConfig();
    const timeoutSeconds = config.timeout[item.priority] || 300;

    const handle = setTimeout(() => {
      const currentItem = this.items.get(item.id);
      if (currentItem && currentItem.status === 'pending') {
        this.updateStatus(item.id, 'blocked', {
          blockedReason: `Timeout after ${timeoutSeconds}s`,
        });

        AgentDBLogger.agentActivity(
          item.targetAgent,
          'work item timeout',
          `${item.action.substring(0, 30)}...`
        );
      }
    }, timeoutSeconds * 1000);

    this.timeoutHandles.set(item.id, handle);
  }

  /**
   * Clear timeout for a work item
   */
  private clearTimeout(itemId: string): void {
    const handle = this.timeoutHandles.get(itemId);
    if (handle) {
      clearTimeout(handle);
      this.timeoutHandles.delete(itemId);
    }
  }

  /**
   * Export work items for persistence
   */
  export(): WorkItem[] {
    return Array.from(this.items.values());
  }

  /**
   * Import work items from persistence
   */
  import(items: WorkItem[]): void {
    for (const item of items) {
      this.items.set(item.id, item);
      if (item.status === 'pending') {
        this.startTimeout(item);
      }
    }
  }
}

// Singleton instance
let managerInstance: WorkItemManager | null = null;

/**
 * Get the singleton WorkItemManager instance
 */
export function getWorkItemManager(): WorkItemManager {
  if (!managerInstance) {
    managerInstance = new WorkItemManager();
  }
  return managerInstance;
}
