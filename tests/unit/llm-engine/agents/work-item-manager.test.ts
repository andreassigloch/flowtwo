/**
 * Work Item Manager Unit Tests
 *
 * Tests for work item lifecycle and queue management.
 *
 * CR-027: Agentic Framework and Process Upgrade
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  WorkItemManager,
  getWorkItemManager,
  WorkItem,
} from '../../../../src/llm-engine/agents/work-item-manager.js';

describe('WorkItemManager', () => {
  let manager: WorkItemManager;

  beforeEach(() => {
    manager = getWorkItemManager();
    manager.clear();
  });

  afterEach(() => {
    manager.clear();
  });

  describe('createWorkItem', () => {
    it('should create a work item with default values', () => {
      const item = manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Fix validation error',
        affectedNodes: ['Func.FN.001'],
      });

      expect(item.id).toBeDefined();
      expect(item.targetAgent).toBe('system-architect');
      expect(item.action).toBe('Fix validation error');
      expect(item.status).toBe('pending');
      expect(item.priority).toBe('medium');
      expect(item.createdBy).toBe('system');
    });

    it('should create a work item with specified priority', () => {
      const item = manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Critical fix',
        affectedNodes: ['Func.FN.001'],
        priority: 'high',
      });

      expect(item.priority).toBe('high');
    });

    it('should create a work item with source rule', () => {
      const item = manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Fix V1',
        affectedNodes: ['Format.FN.001'],
        sourceRule: 'V1',
      });

      expect(item.sourceRule).toBe('V1');
    });
  });

  describe('getNextItem', () => {
    it('should return highest priority item first', () => {
      manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Low priority task',
        affectedNodes: ['A.FN.001'],
        priority: 'low',
      });

      manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'High priority task',
        affectedNodes: ['B.FN.001'],
        priority: 'high',
      });

      manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Medium priority task',
        affectedNodes: ['C.FN.001'],
        priority: 'medium',
      });

      const next = manager.getNextItem('system-architect');

      expect(next?.action).toBe('High priority task');
    });

    it('should return oldest item for same priority', () => {
      manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'First task',
        affectedNodes: ['A.FN.001'],
        priority: 'medium',
      });

      // Small delay to ensure different timestamps
      manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Second task',
        affectedNodes: ['B.FN.001'],
        priority: 'medium',
      });

      const next = manager.getNextItem('system-architect');

      expect(next?.action).toBe('First task');
    });

    it('should return null for agent with no items', () => {
      manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Task',
        affectedNodes: ['A.FN.001'],
      });

      const next = manager.getNextItem('requirements-engineer');

      expect(next).toBeNull();
    });

    it('should not return completed items', () => {
      const item = manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Task',
        affectedNodes: ['A.FN.001'],
      });

      manager.updateStatus(item.id, 'completed');

      const next = manager.getNextItem('system-architect');

      expect(next).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update status to in_progress', () => {
      const item = manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Task',
        affectedNodes: ['A.FN.001'],
      });

      manager.updateStatus(item.id, 'in_progress');

      const updated = manager.getItem(item.id);
      expect(updated?.status).toBe('in_progress');
      expect(updated?.startedAt).toBeDefined();
    });

    it('should update status to completed with result', () => {
      const item = manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Task',
        affectedNodes: ['A.FN.001'],
      });

      manager.updateStatus(item.id, 'completed', { result: 'Fixed the issue' });

      const updated = manager.getItem(item.id);
      expect(updated?.status).toBe('completed');
      expect(updated?.completedAt).toBeDefined();
      expect(updated?.result).toBe('Fixed the issue');
    });

    it('should update status to blocked with reason', () => {
      const item = manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Task',
        affectedNodes: ['A.FN.001'],
      });

      manager.updateStatus(item.id, 'blocked', { blockedReason: 'Missing data' });

      const updated = manager.getItem(item.id);
      expect(updated?.status).toBe('blocked');
      expect(updated?.blockedReason).toBe('Missing data');
    });

    it('should throw for unknown item', () => {
      expect(() => manager.updateStatus('unknown-id', 'completed')).toThrow('not found');
    });
  });

  describe('getBlockingItems', () => {
    it('should return high priority gate blockers', () => {
      manager.createWorkItem({
        targetAgent: 'system-architect',
        action: '[GATE BLOCKER] Fix function allocation',
        affectedNodes: ['A.FN.001'],
        priority: 'high',
      });

      manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Regular task',
        affectedNodes: ['B.FN.001'],
        priority: 'medium',
      });

      const blockers = manager.getBlockingItems('phase2_logical');

      expect(blockers.length).toBe(1);
      expect(blockers[0].action).toContain('GATE BLOCKER');
    });
  });

  describe('getItems', () => {
    it('should filter by agent', () => {
      manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Task 1',
        affectedNodes: ['A.FN.001'],
      });

      manager.createWorkItem({
        targetAgent: 'requirements-engineer',
        action: 'Task 2',
        affectedNodes: ['B.RQ.001'],
      });

      const items = manager.getItems({ targetAgent: 'system-architect' });

      expect(items.length).toBe(1);
      expect(items[0].action).toBe('Task 1');
    });

    it('should filter by status', () => {
      const item1 = manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Task 1',
        affectedNodes: ['A.FN.001'],
      });

      manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Task 2',
        affectedNodes: ['B.FN.001'],
      });

      manager.updateStatus(item1.id, 'completed');

      const pending = manager.getItems({ status: 'pending' });
      const completed = manager.getItems({ status: 'completed' });

      expect(pending.length).toBe(1);
      expect(completed.length).toBe(1);
    });

    it('should filter by priority', () => {
      manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'High task',
        affectedNodes: ['A.FN.001'],
        priority: 'high',
      });

      manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Low task',
        affectedNodes: ['B.FN.001'],
        priority: 'low',
      });

      const highItems = manager.getItems({ priority: 'high' });

      expect(highItems.length).toBe(1);
      expect(highItems[0].action).toBe('High task');
    });
  });

  describe('getPendingCount', () => {
    it('should return count of pending items for agent', () => {
      manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Task 1',
        affectedNodes: ['A.FN.001'],
      });

      manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Task 2',
        affectedNodes: ['B.FN.001'],
      });

      manager.createWorkItem({
        targetAgent: 'requirements-engineer',
        action: 'Task 3',
        affectedNodes: ['C.RQ.001'],
      });

      expect(manager.getPendingCount('system-architect')).toBe(2);
      expect(manager.getPendingCount('requirements-engineer')).toBe(1);
      expect(manager.getPendingCount('verification-engineer')).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', () => {
      const item1 = manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Task 1',
        affectedNodes: ['A.FN.001'],
        priority: 'high',
      });

      manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Task 2',
        affectedNodes: ['B.FN.001'],
        priority: 'medium',
      });

      manager.updateStatus(item1.id, 'completed');

      const stats = manager.getStats();

      expect(stats.total).toBe(2);
      expect(stats.pending).toBe(1);
      expect(stats.completed).toBe(1);
      expect(stats.byAgent['system-architect']).toBe(2);
      expect(stats.byPriority.high).toBe(1);
      expect(stats.byPriority.medium).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('should remove old completed items', () => {
      const item = manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Task',
        affectedNodes: ['A.FN.001'],
      });

      manager.updateStatus(item.id, 'completed');

      // Mock the completed time to be old
      const stored = manager.getItem(item.id);
      if (stored) {
        stored.completedAt = new Date(Date.now() - 120 * 60 * 1000).toISOString();
      }

      const removed = manager.cleanup(60);

      expect(removed).toBe(1);
    });
  });

  describe('export/import', () => {
    it('should export all items', () => {
      manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Task 1',
        affectedNodes: ['A.FN.001'],
      });

      manager.createWorkItem({
        targetAgent: 'system-architect',
        action: 'Task 2',
        affectedNodes: ['B.FN.001'],
      });

      const exported = manager.export();

      expect(exported.length).toBe(2);
    });

    it('should import items', () => {
      const items: WorkItem[] = [
        {
          id: 'test-1',
          targetAgent: 'system-architect',
          action: 'Imported task',
          affectedNodes: ['A.FN.001'],
          priority: 'high',
          status: 'pending',
          createdAt: new Date().toISOString(),
          createdBy: 'test',
        },
      ];

      manager.import(items);

      expect(manager.getItem('test-1')).toBeDefined();
      expect(manager.getItem('test-1')?.action).toBe('Imported task');
    });
  });
});
