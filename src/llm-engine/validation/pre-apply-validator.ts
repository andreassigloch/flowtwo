/**
 * Pre-Apply Validator (CR-055)
 *
 * Validates LLM operations BEFORE they are applied to AgentDB.
 * Catches bidirectional io edges, circular chains, duplicates, and other
 * critical errors that the LLM tends to create during "repairs".
 *
 * Key features:
 * - Validates pending operations against existing graph state
 * - Generates LLM-friendly feedback for retry loop
 * - Blocks invalid operations from reaching AgentDB
 *
 * @author andreas@siglochconsulting
 */

import type { Node, Edge } from '../../shared/types/ontology.js';
import type { PreApplyError, PreApplyResult } from './types.js';
import { extractFromSemanticId } from '../../shared/utils/semantic-id.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Parsed operation from Format E diff
 */
export interface ParsedOperation {
  action: 'add' | 'remove';
  type: 'node' | 'edge';
  raw: string;
  // For nodes
  name?: string;
  nodeType?: string;
  semanticId?: string;
  description?: string;
  // For edges
  sourceId?: string;
  edgeType?: string;
  targetId?: string;
}

/**
 * Edge type valid connections from ontology-rules.json
 */
interface ValidConnection {
  source: string;
  target: string;
}

interface OntologyEdgeType {
  validConnections: ValidConnection[];
}

interface OntologyRules {
  edgeTypes: Record<string, OntologyEdgeType>;
  llmContext?: {
    criticalErrors?: Array<{
      rule: string;
      title: string;
      wrong: string;
      right: string;
      fix: string;
    }>;
  };
}

/**
 * Load ontology rules from JSON file
 */
function loadOntologyRules(): OntologyRules | null {
  try {
    const rulesPath = join(__dirname, '../../../settings/ontology-rules.json');
    const content = readFileSync(rulesPath, 'utf-8');
    return JSON.parse(content) as OntologyRules;
  } catch {
    return null;
  }
}

/**
 * Pre-Apply Validator
 *
 * Validates operations before AgentDB apply
 */
export class PreApplyValidator {
  private ontologyRules: OntologyRules | null;

  constructor() {
    this.ontologyRules = loadOntologyRules();
  }

  /**
   * Validate pending operations against existing graph
   *
   * @param operations - Parsed operations from LLM response
   * @param existingNodes - Current nodes in AgentDB
   * @param existingEdges - Current edges in AgentDB
   * @returns Validation result with errors if any
   */
  validateOperations(
    operations: ParsedOperation[],
    existingNodes: Node[],
    existingEdges: Edge[]
  ): PreApplyResult {
    const errors: PreApplyError[] = [];

    // Build lookup maps for existing data
    const existingNodeIds = new Set(existingNodes.map((n) => n.semanticId));
    const existingEdgeKeys = new Set(
      existingEdges.map((e) => `${e.sourceId}|${e.type}|${e.targetId}`)
    );
    const nodeTypeMap = new Map(existingNodes.map((n) => [n.semanticId, n.type]));

    // Track what will be added by these operations
    const pendingNodeIds = new Set<string>();
    const pendingEdgeKeys = new Set<string>();
    const pendingNodeTypes = new Map<string, string>();

    // Collect pending adds for lookahead validation
    for (const op of operations) {
      if (op.action === 'add') {
        if (op.type === 'node' && op.semanticId) {
          pendingNodeIds.add(op.semanticId);
          if (op.nodeType) {
            pendingNodeTypes.set(op.semanticId, op.nodeType);
          }
        }
        if (op.type === 'edge' && op.sourceId && op.edgeType && op.targetId) {
          pendingEdgeKeys.add(`${op.sourceId}|${op.edgeType}|${op.targetId}`);
        }
      }
    }

    // Validate each operation
    operations.forEach((op, index) => {
      if (op.action === 'add') {
        if (op.type === 'node') {
          errors.push(...this.validateNodeAdd(op, index, existingNodeIds));
        }
        if (op.type === 'edge') {
          errors.push(
            ...this.validateEdgeAdd(
              op,
              index,
              existingEdgeKeys,
              existingNodeIds,
              pendingNodeIds,
              nodeTypeMap,
              pendingNodeTypes,
              existingEdges,
              operations
            )
          );
        }
      }
    });

    // Generate feedback string for LLM
    const feedback = this.generateFeedback(errors);

    return {
      valid: errors.filter((e) => e.severity === 'error').length === 0,
      errors,
      feedback,
    };
  }

  /**
   * Validate node addition
   */
  private validateNodeAdd(
    op: ParsedOperation,
    index: number,
    existingNodeIds: Set<string>
  ): PreApplyError[] {
    const errors: PreApplyError[] = [];

    // Check for duplicate node
    if (op.semanticId && existingNodeIds.has(op.semanticId)) {
      errors.push({
        code: 'DUPLICATE_NODE',
        severity: 'error',
        operationIndex: index,
        operation: op.raw,
        reason: `Node ${op.semanticId} already exists`,
        suggestion: 'Reuse existing semanticId instead of adding duplicate',
      });
    }

    // Check semantic ID format - relaxed to allow more variations
    // Format: {Name}.{TYPE}.{NNN} where:
    // - Name: CamelCase, may include numbers (e.g., ProcessData, User2FA, OAuth2Login)
    // - TYPE: 2-4 uppercase letters (FN, FUNC, FL, FLOW, FC, SYS, etc.)
    // - NNN: 2-4 digits (01, 001, 0001)
    if (op.semanticId) {
      const idPattern = /^[A-Z][a-zA-Z0-9]*\.[A-Z]{2,4}\.\d{2,4}$/;
      if (!idPattern.test(op.semanticId)) {
        // Log warning but don't block - existing parser handles this
        // Only block if completely malformed (no dots at all)
        if (!op.semanticId.includes('.')) {
          errors.push({
            code: 'INVALID_SEMANTIC_ID',
            severity: 'error',
            operationIndex: index,
            operation: op.raw,
            reason: `Invalid semantic ID format: ${op.semanticId}`,
            suggestion: 'Use format {Name}.{TYPE}.{NNN} (e.g., ProcessData.FN.001)',
          });
        }
        // Otherwise, let it through - the main parser will handle validation
      }
    }

    return errors;
  }

  /**
   * Validate edge addition
   */
  private validateEdgeAdd(
    op: ParsedOperation,
    index: number,
    existingEdgeKeys: Set<string>,
    existingNodeIds: Set<string>,
    pendingNodeIds: Set<string>,
    nodeTypeMap: Map<string, string>,
    pendingNodeTypes: Map<string, string>,
    existingEdges: Edge[],
    allOperations: ParsedOperation[]
  ): PreApplyError[] {
    const errors: PreApplyError[] = [];

    if (!op.sourceId || !op.edgeType || !op.targetId) {
      return errors;
    }

    const edgeKey = `${op.sourceId}|${op.edgeType}|${op.targetId}`;

    // Check for duplicate edge
    if (existingEdgeKeys.has(edgeKey)) {
      errors.push({
        code: 'DUPLICATE_EDGE',
        severity: 'error',
        operationIndex: index,
        operation: op.raw,
        reason: `Edge ${op.sourceId} -${op.edgeType}-> ${op.targetId} already exists`,
        suggestion: 'Check existing edges before adding. Use graph_query tool to verify.',
      });
    }

    // Check source node exists (or will exist)
    const sourceExists = existingNodeIds.has(op.sourceId) || pendingNodeIds.has(op.sourceId);
    if (!sourceExists) {
      errors.push({
        code: 'MISSING_SOURCE_NODE',
        severity: 'error',
        operationIndex: index,
        operation: op.raw,
        reason: `Source node ${op.sourceId} does not exist`,
        suggestion: 'Add the source node first, or check the semanticId spelling',
      });
    }

    // Check target node exists (or will exist)
    const targetExists = existingNodeIds.has(op.targetId) || pendingNodeIds.has(op.targetId);
    if (!targetExists) {
      errors.push({
        code: 'MISSING_TARGET_NODE',
        severity: 'error',
        operationIndex: index,
        operation: op.raw,
        reason: `Target node ${op.targetId} does not exist`,
        suggestion: 'Add the target node first, or check the semanticId spelling',
      });
    }

    // Validate edge type connections (if we know the node types)
    const sourceType = nodeTypeMap.get(op.sourceId) || pendingNodeTypes.get(op.sourceId);
    const targetType = nodeTypeMap.get(op.targetId) || pendingNodeTypes.get(op.targetId);

    if (sourceType && targetType && this.ontologyRules) {
      const edgeTypeDef = this.ontologyRules.edgeTypes[op.edgeType];
      if (edgeTypeDef?.validConnections) {
        const isValid = edgeTypeDef.validConnections.some(
          (conn) => conn.source === sourceType && conn.target === targetType
        );
        if (!isValid) {
          errors.push({
            code: 'INVALID_EDGE_CONNECTION',
            severity: 'error',
            operationIndex: index,
            operation: op.raw,
            reason: `Edge type '${op.edgeType}' cannot connect ${sourceType} to ${targetType}`,
            suggestion: `Check validConnections in ontology for allowed ${op.edgeType} edge patterns`,
          });
        }
      }
    }

    // Check for bidirectional io pattern
    if (op.edgeType === 'io') {
      errors.push(
        ...this.checkBidirectionalIo(op, index, existingEdges, allOperations)
      );
    }

    return errors;
  }

  /**
   * Check for bidirectional io pattern (critical error)
   *
   * A→FLOW and FLOW→A is bidirectional (wrong)
   * A→FLOW→B is unidirectional (correct)
   */
  private checkBidirectionalIo(
    op: ParsedOperation,
    index: number,
    existingEdges: Edge[],
    allOperations: ParsedOperation[]
  ): PreApplyError[] {
    const errors: PreApplyError[] = [];

    if (!op.sourceId || !op.targetId) return errors;

    // Check if reverse edge exists in existing graph
    const reverseExists = existingEdges.some(
      (e) => e.type === 'io' && e.sourceId === op.targetId && e.targetId === op.sourceId
    );

    if (reverseExists) {
      errors.push({
        code: 'BIDIRECTIONAL_IO',
        severity: 'error',
        operationIndex: index,
        operation: op.raw,
        reason: `Bidirectional io: ${op.sourceId} and ${op.targetId} already have reverse io edge`,
        suggestion:
          'DELETE one direction. If feedback needed, create separate return FLOW (e.g., RequestData vs ResponseData)',
      });
    }

    // Check if reverse edge is being added in same operation batch
    const reverseInBatch = allOperations.some(
      (other, otherIdx) =>
        otherIdx !== index &&
        other.action === 'add' &&
        other.type === 'edge' &&
        other.edgeType === 'io' &&
        other.sourceId === op.targetId &&
        other.targetId === op.sourceId
    );

    if (reverseInBatch) {
      errors.push({
        code: 'BIDIRECTIONAL_IO_BATCH',
        severity: 'error',
        operationIndex: index,
        operation: op.raw,
        reason: `Creating bidirectional io in same batch: both ${op.sourceId}→${op.targetId} and ${op.targetId}→${op.sourceId}`,
        suggestion:
          'Remove one direction. io edges must be unidirectional chains: Source→FLOW→Target',
      });
    }

    return errors;
  }

  /**
   * Generate LLM-friendly feedback from errors
   */
  private generateFeedback(errors: PreApplyError[]): string {
    if (errors.length === 0) {
      return '';
    }

    const criticalErrors = errors.filter((e) => e.severity === 'error');
    const warnings = errors.filter((e) => e.severity === 'warning');

    const lines: string[] = [
      '[VALIDATION FAILED - Operations blocked]',
      '',
    ];

    if (criticalErrors.length > 0) {
      lines.push(`${criticalErrors.length} CRITICAL ERROR(S):`);
      criticalErrors.forEach((err, idx) => {
        lines.push(`  ${idx + 1}. ${err.code}: ${err.reason}`);
        lines.push(`     Operation: ${err.operation}`);
        lines.push(`     Fix: ${err.suggestion}`);
      });
      lines.push('');
    }

    if (warnings.length > 0) {
      lines.push(`${warnings.length} WARNING(S):`);
      warnings.forEach((err, idx) => {
        lines.push(`  ${idx + 1}. ${err.code}: ${err.reason}`);
      });
      lines.push('');
    }

    lines.push('Please fix these errors and try again.');
    lines.push('Remember: DELETE invalid edges BEFORE adding correct ones.');

    return lines.join('\n');
  }
}

/**
 * Parse Format E operations block into structured operations
 *
 * Handles multiple header formats:
 * - "## Nodes" / "## Edges" (standard)
 * - "# Nodes" / "# Edges" (alternative)
 * - "Nodes:" / "Edges:" (colon format)
 * - No headers (auto-detect from line format)
 */
export function parseOperations(operationsBlock: string): ParsedOperation[] {
  const operations: ParsedOperation[] = [];
  const lines = operationsBlock.split('\n');

  let inNodesSection = false;
  let inEdgesSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Handle various header formats (case-insensitive)
    const lowerTrimmed = trimmed.toLowerCase();
    if (
      lowerTrimmed === '## nodes' ||
      lowerTrimmed === '# nodes' ||
      lowerTrimmed === 'nodes:' ||
      lowerTrimmed === 'nodes'
    ) {
      inNodesSection = true;
      inEdgesSection = false;
      continue;
    }

    if (
      lowerTrimmed === '## edges' ||
      lowerTrimmed === '# edges' ||
      lowerTrimmed === 'edges:' ||
      lowerTrimmed === 'edges'
    ) {
      inNodesSection = false;
      inEdgesSection = true;
      continue;
    }

    if (trimmed.startsWith('+') || trimmed.startsWith('-')) {
      const action = trimmed.startsWith('+') ? 'add' : 'remove';
      const content = trimmed.slice(1).trim();

      // Auto-detect type if no section header was found
      // CR-053 Compact node format: SemanticId|Description (1 pipe, no arrow)
      // Edge format: SourceID -type-> TargetID (has arrow)
      const looksLikeEdge = content.includes('->');
      const looksLikeNode = content.includes('|') && !looksLikeEdge;

      const isNode = inNodesSection || (!inEdgesSection && looksLikeNode && !looksLikeEdge);
      const isEdge = inEdgesSection || (!inNodesSection && looksLikeEdge);

      if (isNode) {
        // CR-053 Compact format ONLY: SemanticId|Description [attrs]
        const nodeMatch = content.match(/^([A-Z][a-zA-Z0-9]*\.[A-Z]{2,4}\.[a-zA-Z0-9]{2,6})\|([^|]*)$/);
        if (nodeMatch) {
          const semanticId = nodeMatch[1].trim();
          const description = nodeMatch[2].trim().split('[')[0].trim();
          try {
            const { name, type } = extractFromSemanticId(semanticId);
            operations.push({
              action,
              type: 'node',
              raw: trimmed,
              name,
              nodeType: type,
              semanticId,
              description,
            });
          } catch {
            // Extraction failed - skip
          }
        } else if (action === 'remove') {
          operations.push({
            action,
            type: 'node',
            raw: trimmed,
            semanticId: content.trim(),
          });
        }
      }

      if (isEdge) {
        // Parse edge: + {SourceID} -type-> {TargetID}
        const edgeMatch = content.match(/^([^\s]+)\s+-(\w+)->\s+([^\s]+)/);
        if (edgeMatch) {
          operations.push({
            action,
            type: 'edge',
            raw: trimmed,
            sourceId: edgeMatch[1].trim(),
            edgeType: edgeMatch[2].trim(),
            targetId: edgeMatch[3].trim(),
          });
        }
      }
    }
  }

  return operations;
}

// Singleton instance
let validatorInstance: PreApplyValidator | null = null;

/**
 * Get the PreApplyValidator singleton
 */
export function getPreApplyValidator(): PreApplyValidator {
  if (!validatorInstance) {
    validatorInstance = new PreApplyValidator();
  }
  return validatorInstance;
}
