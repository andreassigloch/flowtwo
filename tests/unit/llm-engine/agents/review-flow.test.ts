/**
 * Review Flow Unit Tests
 *
 * Tests for guided review flow and user interaction.
 *
 * CR-024: Multi-Agent Architecture System
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ReviewFlowManager } from '../../../../src/llm-engine/agents/review-flow.js';
import type { ValidationError } from '../../../../src/llm-engine/agents/types.js';

describe('ReviewFlowManager', () => {
  let manager: ReviewFlowManager;

  beforeEach(() => {
    manager = new ReviewFlowManager();
  });

  describe('generateQuestionsFromErrors', () => {
    it('should generate questions for V1 errors', () => {
      const errors: ValidationError[] = [
        {
          code: 'V1',
          severity: 'error',
          semanticId: 'FormatESerialization.FN.001',
          issue: 'Top-Level FUNC should not be a data format',
        },
      ];

      const questions = manager.generateQuestionsFromErrors(errors);

      expect(questions.length).toBe(1);
      expect(questions[0].semanticId).toBe('FormatESerialization.FN.001');
      expect(questions[0].options.length).toBeGreaterThan(1);
    });

    it('should generate questions for V3 errors', () => {
      const errors: ValidationError[] = [
        {
          code: 'V3',
          severity: 'error',
          semanticId: 'WebSocketHandler.FN.001',
          issue: 'Infrastructure should not be a FUNC',
        },
      ];

      const questions = manager.generateQuestionsFromErrors(errors);

      expect(questions.length).toBe(1);
      expect(questions[0].question).toContain('WebSocketHandler');
    });

    it('should generate questions for V4 errors', () => {
      const errors: ValidationError[] = [
        {
          code: 'V4',
          severity: 'warning',
          semanticId: 'System.SY.001',
          issue: 'System has 12 top-level FUNCs (should be 5-9)',
        },
      ];

      const questions = manager.generateQuestionsFromErrors(errors);

      expect(questions.length).toBe(1);
      expect(questions[0].question).toContain('12');
    });

    it('should skip info severity errors', () => {
      const errors: ValidationError[] = [
        {
          code: 'V6',
          severity: 'info',
          semanticId: 'Schema1.SC.001',
          issue: 'Potentially redundant schemas',
        },
      ];

      const questions = manager.generateQuestionsFromErrors(errors);

      expect(questions.length).toBe(0);
    });

    it('should generate generic questions for unknown error codes', () => {
      const errors: ValidationError[] = [
        {
          code: 'V99',
          severity: 'warning',
          semanticId: 'Test.FN.001',
          issue: 'Some unknown issue',
          suggestion: 'Fix it somehow',
        },
      ];

      const questions = manager.generateQuestionsFromErrors(errors);

      expect(questions.length).toBe(1);
      expect(questions[0].options.length).toBe(3); // Apply, Ignore, Need More Context
    });
  });

  describe('V1 question structure', () => {
    it('should have three options: Data Format, Processing, Nested', () => {
      const errors: ValidationError[] = [
        {
          code: 'V1',
          severity: 'error',
          semanticId: 'FormatE.FN.001',
          issue: 'Format as FUNC',
        },
      ];

      const questions = manager.generateQuestionsFromErrors(errors);
      const options = questions[0].options;

      expect(options.length).toBe(3);
      expect(options.find((o) => o.id === 'a')?.resultingType).toBe('SCHEMA');
      expect(options.find((o) => o.id === 'b')?.resultingType).toBe('FUNC');
      expect(options.find((o) => o.id === 'c')?.resultingType).toBe('FUNC');
    });

    it('should include Format E operations for SCHEMA option', () => {
      const errors: ValidationError[] = [
        {
          code: 'V1',
          severity: 'error',
          semanticId: 'FormatE.FN.001',
          issue: 'Format as FUNC',
        },
      ];

      const questions = manager.generateQuestionsFromErrors(errors);
      const schemaOption = questions[0].options.find((o) => o.id === 'a');

      expect(schemaOption?.operations).toContain('-');
      expect(schemaOption?.operations).toContain('+');
      expect(schemaOption?.operations).toContain('SCHEMA');
    });
  });

  describe('processResponse', () => {
    it('should return correction for SCHEMA selection', () => {
      const errors: ValidationError[] = [
        {
          code: 'V1',
          severity: 'error',
          semanticId: 'FormatE.FN.001',
          issue: 'Format as FUNC',
        },
      ];

      const questions = manager.generateQuestionsFromErrors(errors);
      const questionId = questions[0].id;

      const correction = manager.processResponse(questionId, 'a');

      expect(correction).not.toBeNull();
      expect(correction?.proposedType).toBe('SCHEMA');
      expect(correction?.operations).toBeDefined();
    });

    it('should return null for keep FUNC selection', () => {
      const errors: ValidationError[] = [
        {
          code: 'V1',
          severity: 'error',
          semanticId: 'FormatE.FN.001',
          issue: 'Format as FUNC',
        },
      ];

      const questions = manager.generateQuestionsFromErrors(errors);
      const questionId = questions[0].id;

      const correction = manager.processResponse(questionId, 'b');

      expect(correction).toBeNull();
    });

    it('should throw for unknown question ID', () => {
      expect(() => {
        manager.processResponse('unknown-id', 'a');
      }).toThrow('Question not found');
    });

    it('should throw for unknown option ID', () => {
      const errors: ValidationError[] = [
        {
          code: 'V1',
          severity: 'error',
          semanticId: 'FormatE.FN.001',
          issue: 'Format as FUNC',
        },
      ];

      const questions = manager.generateQuestionsFromErrors(errors);
      const questionId = questions[0].id;

      expect(() => {
        manager.processResponse(questionId, 'z');
      }).toThrow('Option not found');
    });

    it('should move question from pending to completed', () => {
      const errors: ValidationError[] = [
        {
          code: 'V1',
          severity: 'error',
          semanticId: 'FormatE.FN.001',
          issue: 'Format as FUNC',
        },
      ];

      const questions = manager.generateQuestionsFromErrors(errors);
      const questionId = questions[0].id;

      expect(manager.getPendingQuestions().length).toBe(1);

      manager.processResponse(questionId, 'a');

      expect(manager.getPendingQuestions().length).toBe(0);
      expect(manager.getCompletedQuestions().length).toBe(1);
    });
  });

  describe('formatQuestionsForDisplay', () => {
    it('should format questions as markdown', () => {
      const errors: ValidationError[] = [
        {
          code: 'V1',
          severity: 'error',
          semanticId: 'FormatE.FN.001',
          issue: 'Format as FUNC',
        },
      ];

      const questions = manager.generateQuestionsFromErrors(errors);
      const formatted = manager.formatQuestionsForDisplay(questions);

      expect(formatted).toContain('## Architecture Review');
      expect(formatted).toContain('FormatE.FN.001');
      expect(formatted).toContain('(a)');
      expect(formatted).toContain('(b)');
    });

    it('should return message when no questions', () => {
      const formatted = manager.formatQuestionsForDisplay([]);

      expect(formatted).toContain('No review questions pending');
    });

    it('should include INCOSE reference when available', () => {
      const errors: ValidationError[] = [
        {
          code: 'V1',
          severity: 'error',
          semanticId: 'FormatE.FN.001',
          issue: 'Format as FUNC',
          incoseReference: 'SysML 2.0 Interface Block',
        },
      ];

      const questions = manager.generateQuestionsFromErrors(errors);
      const formatted = manager.formatQuestionsForDisplay(questions);

      expect(formatted).toContain('Reference:');
    });
  });

  describe('getPendingQuestions', () => {
    it('should return all pending questions', () => {
      const errors: ValidationError[] = [
        {
          code: 'V1',
          severity: 'error',
          semanticId: 'FormatE.FN.001',
          issue: 'Issue 1',
        },
        {
          code: 'V3',
          severity: 'error',
          semanticId: 'WebSocket.FN.002',
          issue: 'Issue 2',
        },
      ];

      manager.generateQuestionsFromErrors(errors);
      const pending = manager.getPendingQuestions();

      expect(pending.length).toBe(2);
    });
  });

  describe('reset', () => {
    it('should clear all questions', () => {
      const errors: ValidationError[] = [
        {
          code: 'V1',
          severity: 'error',
          semanticId: 'FormatE.FN.001',
          issue: 'Issue',
        },
      ];

      manager.generateQuestionsFromErrors(errors);
      manager.reset();

      expect(manager.getPendingQuestions().length).toBe(0);
      expect(manager.getCompletedQuestions().length).toBe(0);
    });
  });
});
