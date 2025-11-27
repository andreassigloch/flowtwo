/**
 * Architecture Validator
 *
 * Validates graph architecture using decision tree and validation queries.
 * Works both with Format E (in-memory) and Neo4j (when available).
 *
 * CR-024: Multi-Agent Architecture System
 *
 * @author andreas@siglochconsulting
 */

import { ValidationError, CorrectionProposal } from './types.js';
import { classifyNode } from './decision-tree.js';
import { AgentDBLogger } from '../agentdb/agentdb-logger.js';

/**
 * Parsed node from Format E
 */
interface ParsedNode {
  name: string;
  type: string;
  semanticId: string;
  description: string;
  position?: { x: number; y: number };
}

/**
 * Parsed edge from Format E
 */
interface ParsedEdge {
  sourceId: string;
  edgeType: string;
  targetId: string;
}

/**
 * Architecture Validator
 *
 * Validates graph against INCOSE/SysML 2.0 rules.
 */
export class ArchitectureValidator {
  /**
   * Validate Format E graph string
   *
   * @param formatE - Graph in Format E format
   * @returns Array of validation errors
   */
  validateFormatE(formatE: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Parse Format E
    const { nodes, edges } = this.parseFormatE(formatE);

    // V1: Check for format/protocol as FUNC
    errors.push(...this.validateNoFormatAsFUNC(nodes));

    // V2: Check FLOW has SCHEMA relation
    errors.push(...this.validateFlowHasSchema(nodes, edges));

    // V3: Check no infrastructure as FUNC
    errors.push(...this.validateNoInfrastructureAsFUNC(nodes));

    // V4: Check Miller's Law
    errors.push(...this.validateMillersLaw(nodes, edges));

    // V5: Check inter-block FLOW has protocol
    errors.push(...this.validateInterBlockProtocol(nodes, edges));

    // V6: Check for redundant SCHEMAs
    errors.push(...this.validateNoRedundantSchemas(nodes));

    // V7: Check for orphan SCHEMAs
    errors.push(...this.validateNoOrphanSchemas(nodes, edges));

    // V8: Check schema variance
    errors.push(...this.validateSchemaVariance(nodes));

    // V9: Check nested FUNC schema consistency
    errors.push(...this.validateNestedFuncSchemas(nodes, edges));

    // V10: Check for nested SYS (subsystems should be FUNC)
    errors.push(...this.validateNoNestedSYS(nodes, edges));

    const errorCount = errors.filter((e) => e.severity === 'error').length;
    const warningCount = errors.filter((e) => e.severity === 'warning').length;
    AgentDBLogger.validationResult(errorCount, warningCount);

    return errors;
  }

  /**
   * Generate correction proposals for validation errors
   */
  generateCorrections(errors: ValidationError[]): CorrectionProposal[] {
    return errors
      .filter((e) => e.severity === 'error')
      .map((error) => this.generateCorrectionForError(error))
      .filter((c): c is CorrectionProposal => c !== null);
  }

  /**
   * Classify a new node using decision tree
   */
  classifyNewNode(
    name: string,
    description: string,
    context?: { isTopLevel?: boolean; parentType?: string }
  ): { type: string; confidence: number; reasoning: string[] } {
    const result = classifyNode(name, description, context);
    return {
      type: result.nodeType,
      confidence: result.confidence,
      reasoning: result.reasoning,
    };
  }

  /**
   * Parse Format E string into nodes and edges
   */
  private parseFormatE(formatE: string): { nodes: ParsedNode[]; edges: ParsedEdge[] } {
    const nodes: ParsedNode[] = [];
    const edges: ParsedEdge[] = [];

    const lines = formatE.split('\n');
    let inNodesSection = false;
    let inEdgesSection = false;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === '## Nodes') {
        inNodesSection = true;
        inEdgesSection = false;
        continue;
      }

      if (trimmed === '## Edges') {
        inNodesSection = false;
        inEdgesSection = true;
        continue;
      }

      if (inNodesSection && trimmed.startsWith('+')) {
        const node = this.parseNodeLine(trimmed);
        if (node) nodes.push(node);
      }

      if (inEdgesSection && trimmed.startsWith('+')) {
        const edge = this.parseEdgeLine(trimmed);
        if (edge) edges.push(edge);
      }
    }

    return { nodes, edges };
  }

  /**
   * Parse a node line from Format E
   */
  private parseNodeLine(line: string): ParsedNode | null {
    // + {Name}|{Type}|{SemanticID}|{Description} [{x:100,y:200,zoom:L2}]
    const match = line.match(/^\+\s*([^|]+)\|([^|]+)\|([^|]+)\|([^[]+)/);
    if (!match) return null;

    return {
      name: match[1].trim(),
      type: match[2].trim(),
      semanticId: match[3].trim(),
      description: match[4].trim(),
    };
  }

  /**
   * Parse an edge line from Format E
   */
  private parseEdgeLine(line: string): ParsedEdge | null {
    // + {SourceID} -cp-> {TargetID}
    const match = line.match(/^\+\s*([^\s]+)\s+-(\w+)->\s+([^\s]+)/);
    if (!match) return null;

    return {
      sourceId: match[1].trim(),
      edgeType: match[2].trim(),
      targetId: match[3].trim(),
    };
  }

  /**
   * V1: No format/schema as FUNC
   */
  private validateNoFormatAsFUNC(nodes: ParsedNode[]): ValidationError[] {
    const formatKeywords = ['serialization', 'format', 'protocol', 'schema', 'type', 'spec'];
    const errors: ValidationError[] = [];

    for (const node of nodes) {
      if (node.type === 'FUNC') {
        const nameLower = node.name.toLowerCase();
        if (formatKeywords.some((kw) => nameLower.includes(kw))) {
          errors.push({
            code: 'V1',
            severity: 'error',
            semanticId: node.semanticId,
            issue: `Top-Level FUNC "${node.name}" should not be a data format`,
            suggestion: `Convert to SCHEMA type`,
            incoseReference: 'SysML 2.0 Interface Block',
          });
        }
      }
    }

    return errors;
  }

  /**
   * V2: FLOW has SCHEMA relation
   */
  private validateFlowHasSchema(
    nodes: ParsedNode[],
    edges: ParsedEdge[]
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const flowNodes = nodes.filter((n) => n.type === 'FLOW');
    const schemaRelations = edges.filter((e) => e.edgeType === 'rel');

    for (const flow of flowNodes) {
      const hasSchemaRelation = schemaRelations.some((e) => e.sourceId === flow.semanticId);
      if (!hasSchemaRelation) {
        errors.push({
          code: 'V2',
          severity: 'warning',
          semanticId: flow.semanticId,
          issue: `FLOW "${flow.name}" missing Data SCHEMA relation`,
          suggestion: 'Add -rel-> to appropriate SCHEMA',
          incoseReference: '3-Layer Interface Model',
        });
      }
    }

    return errors;
  }

  /**
   * V3: No infrastructure as FUNC
   */
  private validateNoInfrastructureAsFUNC(nodes: ParsedNode[]): ValidationError[] {
    const infraKeywords = ['websocket', 'http', 'tcp', 'udp', 'socket'];
    const errors: ValidationError[] = [];

    for (const node of nodes) {
      if (node.type === 'FUNC') {
        const nameLower = node.name.toLowerCase();
        if (infraKeywords.some((kw) => nameLower.includes(kw))) {
          errors.push({
            code: 'V3',
            severity: 'error',
            semanticId: node.semanticId,
            issue: `Infrastructure "${node.name}" should not be a FUNC`,
            suggestion: 'Convert to SCHEMA (ProtocolSchema)',
            incoseReference: 'SysML 2.0 Interface Block',
          });
        }
      }
    }

    return errors;
  }

  /**
   * V4: Miller's Law (5-9 top-level FUNCs)
   */
  private validateMillersLaw(
    nodes: ParsedNode[],
    edges: ParsedEdge[]
  ): ValidationError[] {
    const errors: ValidationError[] = [];

    // Find SYS nodes
    const sysNodes = nodes.filter((n) => n.type === 'SYS');

    for (const sys of sysNodes) {
      // Count direct FUNC children (via compose)
      const directFuncs = edges
        .filter((e) => e.sourceId === sys.semanticId && e.edgeType === 'cp')
        .map((e) => nodes.find((n) => n.semanticId === e.targetId))
        .filter((n) => n?.type === 'FUNC');

      const count = directFuncs.length;
      if (count > 0 && (count < 5 || count > 9)) {
        errors.push({
          code: 'V4',
          severity: 'warning',
          semanticId: sys.semanticId,
          issue: `System "${sys.name}" has ${count} top-level FUNCs (should be 5-9)`,
          suggestion: count < 5 ? 'Consider if system is too simple' : 'Decompose into subsystems',
          incoseReference: "Miller's Law (1956)",
        });
      }
    }

    return errors;
  }

  /**
   * V5: Inter-block FLOW has Protocol SCHEMA
   */
  private validateInterBlockProtocol(
    _nodes: ParsedNode[],
    _edges: ParsedEdge[]
  ): ValidationError[] {
    // Simplified check: Look for FLOWs between FUNCs without protocol schema
    // Full implementation would require traversing compose hierarchy
    return [];
  }

  /**
   * V6: No redundant SCHEMAs
   */
  private validateNoRedundantSchemas(nodes: ParsedNode[]): ValidationError[] {
    const errors: ValidationError[] = [];
    const schemas = nodes.filter((n) => n.type === 'SCHEMA');

    for (let i = 0; i < schemas.length; i++) {
      for (let j = i + 1; j < schemas.length; j++) {
        const s1 = schemas[i];
        const s2 = schemas[j];
        const n1 = s1.name.toLowerCase();
        const n2 = s2.name.toLowerCase();

        // Check if one contains the other OR if they share a common prefix (>4 chars)
        const minLen = Math.min(n1.length, n2.length);
        let commonPrefix = 0;
        for (let k = 0; k < minLen; k++) {
          if (n1[k] === n2[k]) {
            commonPrefix++;
          } else {
            break;
          }
        }

        const hasSignificantOverlap = n1.includes(n2) || n2.includes(n1) || commonPrefix >= 4;
        if (hasSignificantOverlap) {
          errors.push({
            code: 'V6',
            severity: 'info',
            semanticId: s1.semanticId,
            issue: `SCHEMAs "${s1.name}" and "${s2.name}" may be redundant`,
            suggestion: 'Consider merging similar schemas',
            incoseReference: 'Schema Variance Optimization',
          });
        }
      }
    }

    return errors;
  }

  /**
   * V7: No orphan SCHEMAs
   */
  private validateNoOrphanSchemas(
    nodes: ParsedNode[],
    edges: ParsedEdge[]
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const schemas = nodes.filter((n) => n.type === 'SCHEMA');

    for (const schema of schemas) {
      const hasReference = edges.some(
        (e) => e.targetId === schema.semanticId && e.edgeType === 'rel'
      );

      if (!hasReference) {
        errors.push({
          code: 'V7',
          severity: 'warning',
          semanticId: schema.semanticId,
          issue: `SCHEMA "${schema.name}" is not referenced by any FLOW or FUNC`,
          suggestion: 'Add relation from FLOW or FUNC',
          incoseReference: 'Traceability',
        });
      }
    }

    return errors;
  }

  /**
   * V8: Schema variance not too high
   */
  private validateSchemaVariance(nodes: ParsedNode[]): ValidationError[] {
    const errors: ValidationError[] = [];
    const schemas = nodes.filter((n) => n.type === 'SCHEMA');

    // Group by domain prefix (extract common prefix like "Order" from "OrderDetails")
    const domainGroups = new Map<string, ParsedNode[]>();
    for (const schema of schemas) {
      // Extract domain: remove common suffixes, then take first word (PascalCase)
      let domain = schema.name.replace(/Schema$|Types$|Format$|Details$|Items$|Summary$|Data$/i, '');
      // If name is PascalCase, extract first word segment
      const pascalMatch = domain.match(/^([A-Z][a-z]*)/);
      if (pascalMatch) {
        domain = pascalMatch[1];
      }
      const existing = domainGroups.get(domain) || [];
      existing.push(schema);
      domainGroups.set(domain, existing);
    }

    for (const [domain, group] of domainGroups) {
      if (group.length > 3) {
        errors.push({
          code: 'V8',
          severity: 'info',
          semanticId: domain,
          issue: `Domain "${domain}" has ${group.length} schemas (>3)`,
          suggestion: 'Consolidate schemas with same lifecycle/owner',
          incoseReference: 'Schema Variance Optimization',
        });
      }
    }

    return errors;
  }

  /**
   * V9: Nested FUNC schema consistency
   */
  private validateNestedFuncSchemas(
    _nodes: ParsedNode[],
    _edges: ParsedEdge[]
  ): ValidationError[] {
    // Simplified: Would need to trace compose hierarchy and compare schemas
    return [];
  }

  /**
   * V10: No nested SYS nodes (subsystems should be FUNC)
   *
   * In logical architecture, use FUNC for decomposition, not nested SYS.
   * SYS should only be used for the top-level system boundary.
   */
  private validateNoNestedSYS(
    nodes: ParsedNode[],
    edges: ParsedEdge[]
  ): ValidationError[] {
    const errors: ValidationError[] = [];
    const sysNodes = nodes.filter((n) => n.type === 'SYS');

    // Find SYS nodes that are composed into another SYS
    for (const sys of sysNodes) {
      const hasParentSYS = edges.some(
        (e) =>
          e.targetId === sys.semanticId &&
          e.edgeType === 'cp' &&
          sysNodes.some((s) => s.semanticId === e.sourceId)
      );

      if (hasParentSYS) {
        errors.push({
          code: 'V10',
          severity: 'error',
          semanticId: sys.semanticId,
          issue: `Nested SYS "${sys.name}" should be a FUNC, not a subsystem`,
          suggestion: 'Convert to FUNC for logical decomposition',
          incoseReference: 'SysML 2.0: Use Activities (FUNC) for logical architecture, not nested Blocks (SYS)',
        });
      }
    }

    // Also check for SYS nodes with "Subsystem" in name
    for (const sys of sysNodes) {
      if (sys.name.toLowerCase().includes('subsystem')) {
        errors.push({
          code: 'V10',
          severity: 'error',
          semanticId: sys.semanticId,
          issue: `"${sys.name}" should be a FUNC, not a SYS - use FUNC for logical subsystems`,
          suggestion: 'Convert to FUNC type',
          incoseReference: 'SysML 2.0: Logical architecture uses Activities (FUNC)',
        });
      }
    }

    return errors;
  }

  /**
   * Generate correction proposal for an error
   */
  private generateCorrectionForError(error: ValidationError): CorrectionProposal | null {
    switch (error.code) {
      case 'V1':
      case 'V3': {
        // Convert FUNC to SCHEMA
        const oldId = error.semanticId;
        const name = oldId.split('.')[0];
        const newId = `${name}.SC.001`;
        return {
          semanticId: oldId,
          currentType: 'FUNC',
          proposedType: 'SCHEMA',
          reason: error.issue,
          operations: `- ${oldId}\n+ ${name}|SCHEMA|${newId}|${error.suggestion}`,
        };
      }

      case 'V10': {
        // Convert SYS to FUNC (subsystem to function)
        const sysId = error.semanticId;
        const sysName = sysId.split('.')[0];
        const funcId = `${sysName}.FN.001`;
        return {
          semanticId: sysId,
          currentType: 'SYS',
          proposedType: 'FUNC',
          reason: error.issue,
          operations: `- ${sysId}\n+ ${sysName}|FUNC|${funcId}|Logical function (converted from subsystem)`,
        };
      }

      default:
        return null;
    }
  }
}

// Singleton instance
let validatorInstance: ArchitectureValidator | null = null;

/**
 * Get the singleton ArchitectureValidator instance
 */
export function getArchitectureValidator(): ArchitectureValidator {
  if (!validatorInstance) {
    validatorInstance = new ArchitectureValidator();
  }
  return validatorInstance;
}
