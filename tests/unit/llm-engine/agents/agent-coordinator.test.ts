/**
 * Agent Coordinator Unit Tests
 *
 * Tests for multi-agent workflow coordination.
 *
 * CR-024: Multi-Agent Architecture System
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentCoordinator } from '../../../../src/llm-engine/agents/agent-coordinator.js';
import type { AgentResponse } from '../../../../src/llm-engine/agents/types.js';

describe('AgentCoordinator', () => {
  let coordinator: AgentCoordinator;

  beforeEach(() => {
    coordinator = new AgentCoordinator();
  });

  describe('initializeWorkflow', () => {
    it('should create initial work item for requirements-engineer', () => {
      const graphSnapshot = '## Nodes\n+ System|SYS|System.SY.001|Test system';
      const userRequest = 'Create a payment system';

      const workItem = coordinator.initializeWorkflow(graphSnapshot, userRequest);

      expect(workItem.agentId).toBe('requirements-engineer');
      expect(workItem.status).toBe('pending');
      expect(workItem.task).toContain('Create a payment system');
    });

    it('should store initial context message', () => {
      const graphSnapshot = '## Nodes\n+ System|SYS|System.SY.001|Test system';
      const userRequest = 'Create a payment system';

      coordinator.initializeWorkflow(graphSnapshot, userRequest);
      const messages = coordinator.getAllMessages();

      expect(messages.length).toBe(1);
      expect(messages[0].messageType).toBe('handoff');
      expect(messages[0].payload.context).toContain('Create a payment system');
    });
  });

  describe('createWorkItem', () => {
    it('should create work item with pending status', () => {
      const workItem = coordinator.createWorkItem('system-architect', 'Design architecture');

      expect(workItem.agentId).toBe('system-architect');
      expect(workItem.task).toBe('Design architecture');
      expect(workItem.status).toBe('pending');
      expect(workItem.startedAt).toBeDefined();
    });

    it('should assign unique IDs', () => {
      const item1 = coordinator.createWorkItem('system-architect', 'Task 1');
      const item2 = coordinator.createWorkItem('architecture-reviewer', 'Task 2');

      expect(item1.id).not.toBe(item2.id);
    });
  });

  describe('updateWorkItemStatus', () => {
    it('should update status to in_progress', () => {
      const workItem = coordinator.createWorkItem('system-architect', 'Design');
      coordinator.updateWorkItemStatus(workItem.id, 'in_progress');

      const items = coordinator.getAllWorkItems();
      const updated = items.find((i) => i.id === workItem.id);

      expect(updated?.status).toBe('in_progress');
    });

    it('should set completedAt when status is completed', () => {
      const workItem = coordinator.createWorkItem('system-architect', 'Design');
      coordinator.updateWorkItemStatus(workItem.id, 'completed');

      const items = coordinator.getAllWorkItems();
      const updated = items.find((i) => i.id === workItem.id);

      expect(updated?.status).toBe('completed');
      expect(updated?.completedAt).toBeDefined();
    });

    it('should store validation errors when provided', () => {
      const workItem = coordinator.createWorkItem('architecture-reviewer', 'Review');
      const errors = [
        {
          code: 'V1',
          severity: 'error' as const,
          semanticId: 'Test.FN.001',
          issue: 'Test issue',
        },
      ];

      coordinator.updateWorkItemStatus(workItem.id, 'blocked', errors);

      const items = coordinator.getAllWorkItems();
      const updated = items.find((i) => i.id === workItem.id);

      expect(updated?.validationErrors).toEqual(errors);
    });
  });

  describe('handoffToNextAgent', () => {
    it('should create work item for next agent in workflow', () => {
      const graphSnapshot = '## Nodes\n+ System|SYS|System.SY.001|Test';
      coordinator.initializeWorkflow(graphSnapshot, 'Test request');

      const response: AgentResponse = {
        agentRole: 'requirements-engineer',
        textResponse: 'Requirements extracted',
        isComplete: true,
      };

      const nextWorkItem = coordinator.handoffToNextAgent(
        'requirements-engineer',
        response,
        graphSnapshot
      );

      expect(nextWorkItem).toBeDefined();
      expect(nextWorkItem?.agentId).toBe('system-architect');
      expect(nextWorkItem?.inputFrom).toBe('requirements-engineer');
    });

    it('should store handoff message', () => {
      const graphSnapshot = '## Nodes\n+ System|SYS|System.SY.001|Test';
      coordinator.initializeWorkflow(graphSnapshot, 'Test request');

      const response: AgentResponse = {
        agentRole: 'requirements-engineer',
        textResponse: 'Requirements extracted',
        isComplete: true,
      };

      coordinator.handoffToNextAgent('requirements-engineer', response, graphSnapshot);
      const messages = coordinator.getAllMessages();

      const handoffMessage = messages.find(
        (m) => m.fromAgent === 'requirements-engineer' && m.toAgent === 'system-architect'
      );

      expect(handoffMessage).toBeDefined();
      expect(handoffMessage?.messageType).toBe('handoff');
    });

    it('should return undefined when workflow is complete', () => {
      const graphSnapshot = '## Nodes\n+ System|SYS|System.SY.001|Test';
      coordinator.initializeWorkflow(graphSnapshot, 'Test request');

      const response: AgentResponse = {
        agentRole: 'functional-analyst',
        textResponse: 'Analysis complete',
        isComplete: true,
      };

      const nextWorkItem = coordinator.handoffToNextAgent(
        'functional-analyst',
        response,
        graphSnapshot
      );

      expect(nextWorkItem).toBeUndefined();
    });
  });

  describe('requestReview', () => {
    it('should create review work item for architecture-reviewer', () => {
      const graphSnapshot = '## Nodes\n+ System|SYS|System.SY.001|Test';
      const openQuestions = ['Is FormatE correct?', 'Should we merge schemas?'];

      const workItem = coordinator.requestReview(
        'system-architect',
        graphSnapshot,
        openQuestions
      );

      expect(workItem.agentId).toBe('architecture-reviewer');
      expect(workItem.inputFrom).toBe('system-architect');
    });

    it('should store review request message with questions', () => {
      const graphSnapshot = '## Nodes\n+ System|SYS|System.SY.001|Test';
      const openQuestions = ['Question 1', 'Question 2'];

      coordinator.requestReview('system-architect', graphSnapshot, openQuestions);
      const messages = coordinator.getAllMessages();

      const reviewMessage = messages.find((m) => m.messageType === 'review-request');
      expect(reviewMessage).toBeDefined();
      expect(reviewMessage?.payload.openQuestions).toEqual(openQuestions);
    });
  });

  describe('buildAgentContext', () => {
    it('should build context with graph snapshot', () => {
      const graphSnapshot = '## Nodes\n+ System|SYS|System.SY.001|Test';
      coordinator.initializeWorkflow(graphSnapshot, 'Test request');

      const context = coordinator.buildAgentContext('requirements-engineer', graphSnapshot);

      expect(context.role).toBe('requirements-engineer');
      expect(context.graphSnapshot).toBe(graphSnapshot);
    });

    it('should include previous messages', () => {
      const graphSnapshot = '## Nodes\n+ System|SYS|System.SY.001|Test';
      coordinator.initializeWorkflow(graphSnapshot, 'Test request');

      const context = coordinator.buildAgentContext('requirements-engineer', graphSnapshot);

      expect(context.previousMessages.length).toBeGreaterThan(0);
    });
  });

  describe('getWorkflowStatus', () => {
    it('should return initial status', () => {
      const graphSnapshot = '## Nodes\n+ System|SYS|System.SY.001|Test';
      coordinator.initializeWorkflow(graphSnapshot, 'Test request');

      const status = coordinator.getWorkflowStatus();

      expect(status.completedAgents).toEqual([]);
      expect(status.totalMessages).toBe(1);
      expect(status.totalWorkItems).toBe(1);
    });

    it('should track completed agents', () => {
      const graphSnapshot = '## Nodes\n+ System|SYS|System.SY.001|Test';
      const workItem = coordinator.initializeWorkflow(graphSnapshot, 'Test request');
      coordinator.updateWorkItemStatus(workItem.id, 'completed');

      const status = coordinator.getWorkflowStatus();

      expect(status.completedAgents).toContain('requirements-engineer');
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      const graphSnapshot = '## Nodes\n+ System|SYS|System.SY.001|Test';
      coordinator.initializeWorkflow(graphSnapshot, 'Test request');

      coordinator.reset();

      expect(coordinator.getAllMessages()).toEqual([]);
      expect(coordinator.getAllWorkItems()).toEqual([]);
    });
  });
});
