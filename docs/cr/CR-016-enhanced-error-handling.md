# CR-016: Enhanced Error Handling

**Status:** Planned
**Priority:** MEDIUM
**Target Phase:** Phase 6 (Production Readiness)
**Created:** 2025-11-19
**Author:** andreas@siglochconsulting

## Problem

Current error handling lacks user-friendly messages and corrective guidance. According to [implan.md:345-349](../implan.md#L345-L349), production deployment requires:

- Natural language error messages (not technical stack traces)
- Suggest corrective actions
- Full context logging for debugging
- User-facing vs developer-facing error separation

**Current Status:** NOT IMPLEMENTED (Phase 6 feature)

**Impact:** Without enhanced error handling:
- Users see cryptic technical errors
- No guidance on how to fix issues
- Difficult to debug production problems
- Poor user experience during errors

## Requirements

**From implan.md Phase 6 requirements:**

1. **Natural Language Errors:**
   - Convert technical errors to user-friendly messages
   - Explain what went wrong in plain language
   - Avoid exposing internal details (security)

2. **Corrective Suggestions:**
   - Suggest specific actions to resolve errors
   - Provide links to documentation
   - Offer alternative approaches when possible

3. **Context Logging:**
   - Log full error context for debugging
   - Include user actions leading to error
   - Capture canvas state at error time
   - Correlate errors across distributed components

## Proposed Solution

### 1. Error Classification System

```typescript
enum ErrorSeverity {
  INFO = 'info',         // Informational (e.g., cache miss)
  WARNING = 'warning',   // Non-blocking issue (e.g., slow performance)
  ERROR = 'error',       // Operation failed but system stable
  CRITICAL = 'critical'  // System instability (e.g., DB connection lost)
}

enum ErrorCategory {
  VALIDATION = 'validation',      // User input validation
  PERMISSION = 'permission',      // Access control
  NOT_FOUND = 'not_found',        // Resource not found
  CONFLICT = 'conflict',          // Concurrent modification
  EXTERNAL_SERVICE = 'external',  // Neo4j, LLM API failure
  INTERNAL = 'internal'           // Unexpected system error
}

interface EnhancedError extends Error {
  code: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  userMessage: string;
  developerMessage: string;
  suggestions: string[];
  context: ErrorContext;
  timestamp: Date;
}
```

### 2. Error Translation Engine

```typescript
interface ErrorTranslation {
  pattern: RegExp;
  userMessage: (error: Error) => string;
  suggestions: (error: Error) => string[];
}

const ERROR_TRANSLATIONS: ErrorTranslation[] = [
  {
    pattern: /CONSTRAINT_VIOLATION.*duplicate.*id/i,
    userMessage: (err) =>
      `An entity with this ID already exists. Please use a unique ID.`,
    suggestions: (err) => [
      'Try using a different ID',
      'Check existing entities with /list command',
      'Use auto-generated IDs by omitting the id field'
    ]
  },
  {
    pattern: /Neo4jError.*ServiceUnavailable/i,
    userMessage: (err) =>
      `Database connection temporarily unavailable. Your work is saved locally.`,
    suggestions: (err) => [
      'Wait a moment and try again',
      'Check your network connection',
      'Contact support if problem persists'
    ]
  },
  {
    pattern: /LLM.*rate_limit/i,
    userMessage: (err) =>
      `AI service is temporarily busy. Please wait a moment.`,
    suggestions: (err) => [
      'Retry in 30 seconds',
      'Use manual commands (/add, /modify) as alternative',
      'Upgrade to higher rate limit plan'
    ]
  },
  {
    pattern: /Validation.*missing required field/i,
    userMessage: (err) =>
      `Required information is missing. Please provide all required fields.`,
    suggestions: (err) => [
      'Check which fields are required in the ontology schema',
      'Use /help <entity-type> to see required fields',
      'Ask the AI assistant for guidance'
    ]
  }
];

class ErrorTranslator {
  translate(error: Error): EnhancedError {
    const translation = ERROR_TRANSLATIONS.find(t =>
      t.pattern.test(error.message)
    );

    if (translation) {
      return {
        ...error,
        userMessage: translation.userMessage(error),
        suggestions: translation.suggestions(error),
        category: this.categorize(error),
        severity: this.assessSeverity(error),
        context: this.captureContext(error)
      };
    }

    // Fallback for unknown errors
    return {
      ...error,
      userMessage: 'An unexpected error occurred. We\'ve logged the details.',
      suggestions: ['Try again', 'Contact support if problem persists'],
      category: ErrorCategory.INTERNAL,
      severity: ErrorSeverity.ERROR,
      context: this.captureContext(error)
    };
  }
}
```

### 3. Context Capture

```typescript
interface ErrorContext {
  userId: string;
  sessionId: string;
  workspaceId: string;
  lastCommand: string;
  canvasState: {
    nodeCount: number;
    edgeCount: number;
    lastModified: Date;
  };
  llmContext: {
    lastPrompt?: string;
    lastResponse?: string;
  };
  systemState: {
    memoryUsage: number;
    neo4jConnected: boolean;
    uptime: number;
  };
  breadcrumbs: Breadcrumb[]; // Recent user actions
}

interface Breadcrumb {
  timestamp: Date;
  action: string;
  details: Record<string, any>;
}

class ErrorContextCapture {
  private breadcrumbs: Breadcrumb[] = [];

  addBreadcrumb(action: string, details: Record<string, any>) {
    this.breadcrumbs.push({
      timestamp: new Date(),
      action,
      details
    });
    // Keep last 50 breadcrumbs
    if (this.breadcrumbs.length > 50) {
      this.breadcrumbs.shift();
    }
  }

  captureContext(error: Error): ErrorContext {
    return {
      userId: getCurrentUser().id,
      sessionId: getCurrentSession().id,
      workspaceId: getCurrentWorkspace().id,
      lastCommand: this.breadcrumbs[this.breadcrumbs.length - 1]?.action,
      canvasState: this.getCanvasState(),
      llmContext: this.getLLMContext(),
      systemState: this.getSystemState(),
      breadcrumbs: this.breadcrumbs.slice(-10) // Last 10 actions
    };
  }
}
```

### 4. Error Presentation

```typescript
class ErrorPresenter {
  presentToUser(error: EnhancedError): string {
    let message = `❌ ${error.userMessage}\n\n`;

    if (error.suggestions.length > 0) {
      message += `💡 Suggestions:\n`;
      error.suggestions.forEach((suggestion, idx) => {
        message += `   ${idx + 1}. ${suggestion}\n`;
      });
    }

    if (error.severity === ErrorSeverity.CRITICAL) {
      message += `\n⚠️  This is a critical error. Please contact support.\n`;
      message += `   Error ID: ${error.code}\n`;
    }

    return message;
  }

  logForDevelopers(error: EnhancedError): void {
    console.error({
      code: error.code,
      severity: error.severity,
      category: error.category,
      message: error.developerMessage,
      stack: error.stack,
      context: error.context,
      timestamp: error.timestamp
    });

    // Send to error tracking service (Sentry, etc.)
    if (error.severity === ErrorSeverity.CRITICAL) {
      this.sendToErrorTracking(error);
    }
  }
}
```

### 5. Retry Logic & Circuit Breaker

```typescript
class RetryableOperation<T> {
  async execute(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    backoffMs: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (this.isRetryable(error) && attempt < maxRetries) {
          const delay = backoffMs * Math.pow(2, attempt - 1);
          console.log(`Retry ${attempt}/${maxRetries} after ${delay}ms`);
          await this.sleep(delay);
        } else {
          break;
        }
      }
    }

    throw lastError;
  }

  private isRetryable(error: Error): boolean {
    // Retry network errors, rate limits, temporary unavailability
    return /network|timeout|rate_limit|unavailable/i.test(error.message);
  }
}

class CircuitBreaker {
  private failures: number = 0;
  private lastFailureTime: Date;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime.getTime() > 60000) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN. Service unavailable.');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = new Date();
    if (this.failures >= 5) {
      this.state = 'OPEN';
    }
  }
}
```

## Implementation Plan

### Phase 1: Error Classification (2-3 hours)
1. Create `src/errors/enhanced-error.ts`
2. Define error severity and category enums
3. Create EnhancedError interface
4. Implement error categorization logic

### Phase 2: Error Translation (4-5 hours)
1. Create `src/errors/error-translator.ts`
2. Define error translation patterns
3. Implement user-friendly message generation
4. Add suggestion generation logic
5. Test with common error scenarios

### Phase 3: Context Capture (3-4 hours)
1. Create `src/errors/error-context.ts`
2. Implement breadcrumb tracking
3. Add context capture for all components
4. Integrate with chat interface
5. Store context with error logs

### Phase 4: Error Presentation (2-3 hours)
1. Create `src/errors/error-presenter.ts`
2. Implement user-facing formatting
3. Implement developer logging
4. Add error tracking integration (Sentry, etc.)
5. Test error display in terminal UI

### Phase 5: Retry & Circuit Breaker (3-4 hours)
1. Create `src/errors/retry-logic.ts`
2. Implement retryable operation wrapper
3. Add circuit breaker for external services
4. Integrate with Neo4j client
5. Integrate with LLM engine

### Phase 6: Global Error Handling (2-3 hours)
1. Add global error handlers (unhandled rejections)
2. Integrate with all error-prone operations
3. Add error recovery mechanisms
4. Test error handling across all components

### Phase 7: Testing & Documentation (3-4 hours)
1. Write unit tests for error translation
2. Test error presentation
3. Simulate various error scenarios
4. Document error codes and resolutions
5. Create error handling guide

## Acceptance Criteria

- [ ] All errors translated to user-friendly messages
- [ ] Corrective suggestions provided for common errors
- [ ] Full error context captured (user actions, canvas state, system state)
- [ ] Developer logs separate from user messages
- [ ] Retry logic implemented for network/API failures
- [ ] Circuit breaker prevents cascading failures
- [ ] Error tracking integrated (Sentry or similar)
- [ ] Global error handlers catch unhandled errors
- [ ] Unit tests cover error handling (70% coverage)
- [ ] Error handling documentation complete

## Dependencies

- Logging infrastructure (already implemented)
- Error tracking service (Sentry, etc.) - needs setup
- Neo4j client (already implemented)
- LLM engine (already implemented)

## Estimated Effort

- Error Classification: 2-3 hours
- Error Translation: 4-5 hours
- Context Capture: 3-4 hours
- Error Presentation: 2-3 hours
- Retry & Circuit Breaker: 3-4 hours
- Global Error Handling: 2-3 hours
- Testing & Documentation: 3-4 hours
- **Total: 19-26 hours (3-4 days)**

## Benefits

**User Experience:**
- Clear, actionable error messages
- Guidance to resolve issues
- Less frustration during errors

**Developer Productivity:**
- Rich context for debugging
- Faster issue resolution
- Better error tracking

**System Reliability:**
- Retry logic prevents transient failures
- Circuit breaker prevents cascading failures
- Better production stability

## References

- [implan.md:345-349](../implan.md#L345-L349) - Phase 6 Error Handling section
- requirements.md NFR-5 - Error handling requirements
- Sentry documentation: https://docs.sentry.io/

## Notes

- Implement after core features stable (Phase 6 priority)
- Balance between helpful suggestions and overwhelming users
- Never expose sensitive data in error messages (security)
- Test error handling in production-like environment
- Consider i18n for multi-language error messages (future)
