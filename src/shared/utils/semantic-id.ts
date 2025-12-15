/**
 * CR-052: Semantic ID Generation Utility
 * CR-053: Semantic ID Extraction for Compact Format E
 *
 * Generates readable, unique semantic IDs for optimizer-created nodes
 *
 * Format: {sanitizedName}.{TYPE_ABBR}.{random6}
 * Example: ValidatePayment.FN.a3b2c1
 *
 * @author andreas@siglochconsulting
 */

import { NodeType } from '../types/ontology.js';

/**
 * Type abbreviation to full NodeType mapping
 * Based on ontology-rules.json nodeTypes.*.abbreviation
 */
const ABBREV_TO_TYPE: Record<string, NodeType> = {
  SY: 'SYS',
  UC: 'UC',
  RQ: 'REQ',
  FN: 'FUNC',
  FC: 'FCHAIN',
  FL: 'FLOW',
  AC: 'ACTOR',
  MD: 'MOD',
  TC: 'TEST',
  TS: 'TEST', // Legacy alias
  SC: 'SCHEMA',
};

/**
 * Full NodeType to abbreviation mapping (inverse of ABBREV_TO_TYPE)
 */
const TYPE_TO_ABBREV: Record<NodeType, string> = {
  SYS: 'SY',
  UC: 'UC',
  REQ: 'RQ',
  FUNC: 'FN',
  FCHAIN: 'FC',
  FLOW: 'FL',
  ACTOR: 'AC',
  MOD: 'MD',
  TEST: 'TC',
  SCHEMA: 'SC',
};

/**
 * CR-053: Extract name and type from semanticId
 *
 * @param semanticId - SemanticId in format {name}.{TYPE_ABBR}.{counter/random}
 * @returns Object with extracted name and full NodeType
 * @throws Error if semanticId format is invalid
 *
 * @example
 * extractFromSemanticId('ValidateOrder.FN.001') → { name: 'ValidateOrder', type: 'FUNC' }
 * extractFromSemanticId('TestSystem.SY.001') → { name: 'TestSystem', type: 'SYS' }
 */
export function extractFromSemanticId(semanticId: string): { name: string; type: NodeType } {
  const parts = semanticId.split('.');
  if (parts.length < 3) {
    throw new Error(`Invalid semanticId format: "${semanticId}" - expected {name}.{TYPE}.{id}`);
  }

  const name = parts[0];
  const typeAbbr = parts[1];
  const type = ABBREV_TO_TYPE[typeAbbr];

  if (!type) {
    throw new Error(`Unknown type abbreviation "${typeAbbr}" in semanticId: "${semanticId}"`);
  }

  return { name, type };
}

/**
 * Get type abbreviation for a NodeType
 *
 * @param type - Full NodeType (e.g., 'FUNC')
 * @returns Type abbreviation (e.g., 'FN')
 */
export function getTypeAbbreviation(type: NodeType): string {
  return TYPE_TO_ABBREV[type] || type.slice(0, 2).toUpperCase();
}

/**
 * Generate unique, readable semanticId with collision check
 *
 * @param name - Human-readable name (e.g., "ValidatePayment+ValidateShipment")
 * @param type - Node type (e.g., "FUNC", "MOD", "TEST")
 * @param existingIds - Set of existing IDs to check for collisions
 * @returns Unique semanticId in format: {name}.{TYPE}.{random6}
 * @throws Error if unique ID cannot be generated after 100 attempts
 */
export function generateSemanticId(
  name: string,
  type: string,
  existingIds: Set<string>
): string {
  const sanitizedName = sanitizeName(name);
  let id: string;
  let attempts = 0;

  do {
    const random = Math.random().toString(36).slice(2, 8);
    id = `${sanitizedName}.${type}.${random}`;
    attempts++;
  } while (existingIds.has(id) && attempts < 100);

  if (attempts >= 100) {
    throw new Error(`Could not generate unique semanticId for "${name}" after 100 attempts`);
  }

  return id;
}

/**
 * Sanitize name for use in semanticId
 * - Removes special characters except underscore and plus
 * - Truncates to max 50 characters
 *
 * @param name - Raw name to sanitize
 * @returns Sanitized name safe for semanticId
 */
export function sanitizeName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_+]/g, '') // Only alphanumeric + underscore + plus
    .slice(0, 50); // Max 50 chars
}

/**
 * Generate edge ID from source, type, and target
 * Edge IDs are already readable, no random suffix needed
 *
 * @param sourceId - Source node semanticId
 * @param edgeType - Edge type (e.g., "compose", "satisfy")
 * @param targetId - Target node semanticId
 * @returns Edge ID in format: {sourceId}-{type}-{targetId}
 */
export function generateEdgeId(
  sourceId: string,
  edgeType: string,
  targetId: string
): string {
  return `${sourceId}-${edgeType}-${targetId}`;
}
