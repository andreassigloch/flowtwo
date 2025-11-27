/**
 * Guided Review Flow
 *
 * Generates structured review questions and handles user responses
 * for correction of architecture misclassifications.
 *
 * CR-024: Multi-Agent Architecture System
 *
 * @author andreas@siglochconsulting
 */

import { ReviewQuestion, ReviewOption, ValidationError, CorrectionProposal } from './types.js';
import { AgentDBLogger } from '../agentdb/agentdb-logger.js';

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Guided Review Flow Manager
 *
 * Creates structured questions for user review and processes responses.
 */
export class ReviewFlowManager {
  private pendingQuestions: Map<string, ReviewQuestion> = new Map();
  private completedQuestions: Map<string, { question: ReviewQuestion; selectedOption: ReviewOption }> = new Map();

  /**
   * Generate review questions from validation errors
   *
   * @param errors - Validation errors to convert to questions
   * @returns Array of review questions
   */
  generateQuestionsFromErrors(errors: ValidationError[]): ReviewQuestion[] {
    const questions: ReviewQuestion[] = [];

    for (const error of errors) {
      // Only generate questions for errors and warnings
      if (error.severity === 'info') continue;

      const question = this.createQuestionForError(error);
      if (question) {
        questions.push(question);
        this.pendingQuestions.set(question.id, question);
      }
    }

    AgentDBLogger.agentActivity(
      'architecture-reviewer',
      `generated ${questions.length} questions`,
      `from ${errors.length} errors`
    );

    return questions;
  }

  /**
   * Create a review question for a specific error
   */
  private createQuestionForError(error: ValidationError): ReviewQuestion | null {
    switch (error.code) {
      case 'V1':
        return this.createFormatAsFuncQuestion(error);
      case 'V3':
        return this.createInfrastructureAsFuncQuestion(error);
      case 'V4':
        return this.createMillersLawQuestion(error);
      default:
        return this.createGenericQuestion(error);
    }
  }

  /**
   * V1: Format/Schema as FUNC question
   */
  private createFormatAsFuncQuestion(error: ValidationError): ReviewQuestion {
    const name = error.semanticId.split('.')[0];

    return {
      id: generateId(),
      semanticId: error.semanticId,
      question: `Is "${name}" a data format/structure or an active processing function?`,
      options: [
        {
          id: 'a',
          label: 'Data Format/Structure',
          description: 'Defines data schema, types, or format specification',
          resultingType: 'SCHEMA',
          operations: `- ${error.semanticId}\n+ ${name}|SCHEMA|${name}.SC.001|Data format definition`,
        },
        {
          id: 'b',
          label: 'Active Processing Function',
          description: 'Actively transforms, processes, or manipulates data',
          resultingType: 'FUNC',
        },
        {
          id: 'c',
          label: 'Part of Another Function',
          description: 'Should be nested under a parent FUNC',
          resultingType: 'FUNC',
          operations: `Move to nested position under parent FUNC`,
        },
      ],
      context: error.issue,
      incoseReference: 'SysML 2.0: Data formats should be modeled as Interface Blocks, not Activities',
    };
  }

  /**
   * V3: Infrastructure as FUNC question
   */
  private createInfrastructureAsFuncQuestion(error: ValidationError): ReviewQuestion {
    const name = error.semanticId.split('.')[0];

    return {
      id: generateId(),
      semanticId: error.semanticId,
      question: `Is "${name}" a protocol/transport mechanism or a processing function?`,
      options: [
        {
          id: 'a',
          label: 'Protocol/Transport',
          description: 'Defines communication protocol or transport behavior',
          resultingType: 'SCHEMA',
          operations: `- ${error.semanticId}\n+ ${name}|SCHEMA|${name}.SC.001|Protocol specification`,
        },
        {
          id: 'b',
          label: 'Client/Connection Manager',
          description: 'Manages connections, sessions, or client state',
          resultingType: 'FUNC',
        },
        {
          id: 'c',
          label: 'Data Flow',
          description: 'Represents data transfer between components',
          resultingType: 'FLOW',
          operations: `- ${error.semanticId}\n+ ${name}|FLOW|${name}.FL.001|Data transfer`,
        },
      ],
      context: error.issue,
      incoseReference: 'SysML 2.0: Protocols are Interface Blocks, not Activities',
    };
  }

  /**
   * V4: Miller's Law question
   */
  private createMillersLawQuestion(error: ValidationError): ReviewQuestion {
    const match = error.issue.match(/has (\d+) top-level/);
    const count = match ? parseInt(match[1], 10) : 0;
    const tooFew = count < 5;

    return {
      id: generateId(),
      semanticId: error.semanticId,
      question: tooFew
        ? `System has only ${count} top-level functions. Is this intentional?`
        : `System has ${count} top-level functions (exceeds 7±2). How should we restructure?`,
      options: tooFew
        ? [
            {
              id: 'a',
              label: 'System is Simple',
              description: 'This is intentional - the system scope is limited',
            },
            {
              id: 'b',
              label: 'Add More Functions',
              description: 'Help identify missing functional areas',
            },
          ]
        : [
            {
              id: 'a',
              label: 'Create Subsystems',
              description: 'Group related functions into subsystem blocks',
            },
            {
              id: 'b',
              label: 'Merge Similar Functions',
              description: 'Combine overlapping functions',
            },
            {
              id: 'c',
              label: 'Keep Current Structure',
              description: 'Accept the current decomposition',
            },
          ],
      context: error.issue,
      incoseReference: "Miller's Law (1956): Humans can process 7±2 chunks of information",
    };
  }

  /**
   * Generic question for other error types
   */
  private createGenericQuestion(error: ValidationError): ReviewQuestion {
    return {
      id: generateId(),
      semanticId: error.semanticId,
      question: `How should we address: ${error.issue}?`,
      options: [
        {
          id: 'a',
          label: 'Apply Suggestion',
          description: error.suggestion || 'Apply the recommended fix',
        },
        {
          id: 'b',
          label: 'Ignore',
          description: 'This is intentional, no action needed',
        },
        {
          id: 'c',
          label: 'Need More Context',
          description: 'Provide more information before deciding',
        },
      ],
      context: error.issue,
      incoseReference: error.incoseReference,
    };
  }

  /**
   * Process user response to a review question
   *
   * @param questionId - ID of the question being answered
   * @param optionId - ID of the selected option
   * @returns Correction proposal if applicable
   */
  processResponse(questionId: string, optionId: string): CorrectionProposal | null {
    const question = this.pendingQuestions.get(questionId);
    if (!question) {
      throw new Error(`Question not found: ${questionId}`);
    }

    const selectedOption = question.options.find((o) => o.id === optionId);
    if (!selectedOption) {
      throw new Error(`Option not found: ${optionId}`);
    }

    // Move from pending to completed
    this.pendingQuestions.delete(questionId);
    this.completedQuestions.set(questionId, { question, selectedOption });

    AgentDBLogger.reviewQuestion(
      question.semanticId,
      `User selected: ${selectedOption.label}`
    );

    // Generate correction if option has operations
    if (selectedOption.operations && selectedOption.resultingType) {
      return {
        semanticId: question.semanticId,
        currentType: 'FUNC', // Assumption based on most common errors
        proposedType: selectedOption.resultingType,
        reason: `User selected: ${selectedOption.label}`,
        operations: selectedOption.operations,
      };
    }

    return null;
  }

  /**
   * Format review questions for display
   */
  formatQuestionsForDisplay(questions: ReviewQuestion[]): string {
    if (questions.length === 0) {
      return 'No review questions pending.';
    }

    const lines: string[] = ['## Architecture Review\n'];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      lines.push(`### Question ${i + 1}: ${q.semanticId}`);
      lines.push('');
      lines.push(q.question);
      lines.push('');

      for (const opt of q.options) {
        lines.push(`  (${opt.id}) **${opt.label}**`);
        lines.push(`      ${opt.description}`);
      }

      lines.push('');
      lines.push(`*Context:* ${q.context}`);
      if (q.incoseReference) {
        lines.push(`*Reference:* ${q.incoseReference}`);
      }
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Get pending questions
   */
  getPendingQuestions(): ReviewQuestion[] {
    return Array.from(this.pendingQuestions.values());
  }

  /**
   * Get completed questions with responses
   */
  getCompletedQuestions(): Array<{ question: ReviewQuestion; selectedOption: ReviewOption }> {
    return Array.from(this.completedQuestions.values());
  }

  /**
   * Clear all questions
   */
  reset(): void {
    this.pendingQuestions.clear();
    this.completedQuestions.clear();
  }
}

// Singleton instance
let reviewFlowInstance: ReviewFlowManager | null = null;

/**
 * Get the singleton ReviewFlowManager instance
 */
export function getReviewFlowManager(): ReviewFlowManager {
  if (!reviewFlowInstance) {
    reviewFlowInstance = new ReviewFlowManager();
  }
  return reviewFlowInstance;
}
