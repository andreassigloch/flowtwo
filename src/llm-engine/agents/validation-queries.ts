/**
 * Architecture Validation Queries
 *
 * Cypher queries for validating graph architecture.
 * Implements V1-V9 validation rules from CR-024.
 *
 * CR-024: Multi-Agent Architecture System
 *
 * @author andreas@siglochconsulting
 */

import { ValidationError } from './types.js';

/**
 * Validation query definition
 */
export interface ValidationQuery {
  code: string;
  name: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  cypher: string;
  incoseReference?: string;
}

/**
 * All validation queries (V1-V9)
 */
export const VALIDATION_QUERIES: ValidationQuery[] = [
  {
    code: 'V1',
    name: 'Format as FUNC',
    description: 'Top-Level FUNC should not be a data format',
    severity: 'error',
    cypher: `
      MATCH (s:SYS)-[:compose]->(f:FUNC)
      WHERE f.Name CONTAINS 'Serialization'
         OR f.Name CONTAINS 'Format'
         OR f.Name CONTAINS 'Protocol'
         OR f.Name CONTAINS 'Schema'
      RETURN f.semanticId AS semanticId,
             f.Name AS name,
             'Top-Level FUNC should not be a data format' AS issue
    `,
    incoseReference: 'SysML 2.0 Interface Block',
  },
  {
    code: 'V2',
    name: 'FLOW missing SCHEMA',
    description: 'FLOW should have relation to a SCHEMA (Layer 2)',
    severity: 'warning',
    cypher: `
      MATCH (fl:FLOW)
      WHERE NOT (fl)-[:relation]->(:SCHEMA)
      RETURN fl.semanticId AS semanticId,
             fl.Name AS name,
             'FLOW missing Data SCHEMA relation (Layer 2)' AS issue
    `,
    incoseReference: '3-Layer Interface Model',
  },
  {
    code: 'V3',
    name: 'Infrastructure as FUNC',
    description: 'Infrastructure/protocol should not be modeled as FUNC',
    severity: 'error',
    cypher: `
      MATCH (f:FUNC)
      WHERE f.Name CONTAINS 'WebSocket'
         OR f.Name CONTAINS 'HTTP'
         OR f.Name CONTAINS 'TCP'
         OR f.Name CONTAINS 'Protocol'
      RETURN f.semanticId AS semanticId,
             f.Name AS name,
             'Infrastructure should not be a FUNC' AS issue
    `,
    incoseReference: 'SysML 2.0 Interface Block',
  },
  {
    code: 'V4',
    name: 'Miller\'s Law Violation',
    description: 'System should have 5-9 top-level FUNCs (Miller\'s Law)',
    severity: 'warning',
    cypher: `
      MATCH (s:SYS)-[:compose]->(f:FUNC)
      WITH s, count(f) AS func_count
      WHERE func_count < 5 OR func_count > 9
      RETURN s.semanticId AS semanticId,
             s.Name AS name,
             'Violates Miller''s Law (5-9 blocks), has ' + toString(func_count) AS issue
    `,
    incoseReference: 'Miller\'s Law (1956)',
  },
  {
    code: 'V5',
    name: 'Inter-block FLOW missing Protocol',
    description: 'Inter-block FLOW should have Protocol SCHEMA',
    severity: 'warning',
    cypher: `
      MATCH (f1:FUNC)-[:io]->(fl:FLOW)-[:io]->(f2:FUNC)
      WHERE NOT (fl)-[:relation]->(:SCHEMA {category: 'protocol'})
        AND NOT (f1)-[:compose*1..2]-(f2)
      RETURN fl.semanticId AS semanticId,
             fl.Name AS name,
             'Inter-block FLOW should have Protocol SCHEMA' AS issue
    `,
    incoseReference: '3-Layer Interface Model Layer 3',
  },
  {
    code: 'V6',
    name: 'Redundant SCHEMAs',
    description: 'Similar named SCHEMAs might be redundant',
    severity: 'info',
    cypher: `
      MATCH (s1:SCHEMA), (s2:SCHEMA)
      WHERE s1.semanticId < s2.semanticId
        AND (s1.Name CONTAINS s2.Name OR s2.Name CONTAINS s1.Name)
      RETURN s1.semanticId AS semanticId,
             s1.Name + ' / ' + s2.Name AS name,
             'Potentially redundant schemas - consider merging' AS issue
    `,
    incoseReference: 'Schema Variance Optimization',
  },
  {
    code: 'V7',
    name: 'Orphan SCHEMA',
    description: 'SCHEMA without FLOW or FUNC reference',
    severity: 'warning',
    cypher: `
      MATCH (s:SCHEMA)
      WHERE NOT (:FLOW)-[:relation]->(s)
        AND NOT (:FUNC)-[:relation]->(s)
      RETURN s.semanticId AS semanticId,
             s.Name AS name,
             'Schema not referenced by any FLOW or FUNC' AS issue
    `,
    incoseReference: 'Traceability',
  },
  {
    code: 'V8',
    name: 'Schema Variance Too High',
    description: 'Too many SCHEMAs in one domain (>3)',
    severity: 'info',
    cypher: `
      MATCH (s:SCHEMA)
      WITH split(s.Name, 'Schema')[0] AS domain, collect(s) AS schemas
      WHERE size(schemas) > 3
      RETURN domain AS semanticId,
             domain AS name,
             'Too many schemas in domain (' + toString(size(schemas)) + ') - consider consolidation' AS issue
    `,
    incoseReference: 'Schema Variance Optimization',
  },
  {
    code: 'V9',
    name: 'Nested FUNC Schema Mismatch',
    description: 'Nested FUNC must use parent FLOW schema',
    severity: 'warning',
    cypher: `
      MATCH (parent:FUNC)-[:compose]->(child:FUNC)
      MATCH (parent)-[:io]->(parentFlow:FLOW)
      WHERE NOT EXISTS {
        MATCH (child)-[:io]->(:FLOW)-[:relation]->(:SCHEMA)<-[:relation]-(parentFlow)
      }
      RETURN child.semanticId AS semanticId,
             child.Name AS name,
             'Nested FUNC does not use parent FLOW schema' AS issue
    `,
    incoseReference: 'SysML 2.0 Interface Block Inheritance',
  },
];

/**
 * Get validation query by code
 */
export function getValidationQuery(code: string): ValidationQuery | undefined {
  return VALIDATION_QUERIES.find((q) => q.code === code);
}

/**
 * Get all queries by severity
 */
export function getQueriesBySeverity(
  severity: 'error' | 'warning' | 'info'
): ValidationQuery[] {
  return VALIDATION_QUERIES.filter((q) => q.severity === severity);
}

/**
 * Parse Neo4j query results into ValidationError
 */
export function parseValidationResult(
  query: ValidationQuery,
  records: Array<{ semanticId: string; name: string; issue: string }>
): ValidationError[] {
  return records.map((record) => ({
    code: query.code,
    severity: query.severity,
    semanticId: record.semanticId,
    issue: record.issue,
    suggestion: getSuggestionForQuery(query.code, record.name),
    incoseReference: query.incoseReference,
  }));
}

/**
 * Get suggestion for a validation error
 */
function getSuggestionForQuery(code: string, name: string): string {
  const suggestions: Record<string, string> = {
    V1: `Convert ${name} to SCHEMA type`,
    V2: `Add -rel-> to an appropriate SCHEMA`,
    V3: `Convert ${name} to SCHEMA (ProtocolSchema)`,
    V4: 'Reorganize functions to have 5-9 top-level blocks',
    V5: 'Add Protocol SCHEMA relation for cross-boundary communication',
    V6: 'Consider merging similar schemas',
    V7: 'Add relation from FLOW or FUNC to this SCHEMA',
    V8: 'Consolidate schemas with same lifecycle/owner',
    V9: 'Ensure nested FUNC uses compatible FLOW schema',
  };

  return suggestions[code] || 'Review and correct the issue';
}
