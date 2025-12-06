/**
 * AgentDB Error Types
 *
 * Custom errors for Graph Store operations with uniqueness constraints.
 *
 * @author andreas@siglochconsulting
 */

/**
 * Thrown when attempting to add a node with a semanticId that already exists
 * but with a different UUID (indicates duplicate import)
 */
export class DuplicateSemanticIdError extends Error {
  constructor(
    public readonly semanticId: string,
    public readonly existingUuid: string,
    public readonly newUuid: string
  ) {
    super(
      `Duplicate semanticId '${semanticId}': existing uuid='${existingUuid}', new uuid='${newUuid}'. ` +
        `Use { upsert: true } to intentionally overwrite.`
    );
    this.name = 'DuplicateSemanticIdError';
  }
}

/**
 * Thrown when attempting to add an edge with the same (source, type, target)
 * combination but with a different UUID
 */
export class DuplicateEdgeError extends Error {
  constructor(
    public readonly sourceId: string,
    public readonly targetId: string,
    public readonly edgeType: string,
    public readonly existingUuid: string,
    public readonly newUuid: string
  ) {
    super(
      `Duplicate edge '${sourceId} -${edgeType}-> ${targetId}': existing uuid='${existingUuid}', new uuid='${newUuid}'. ` +
        `Use { upsert: true } to intentionally overwrite.`
    );
    this.name = 'DuplicateEdgeError';
  }
}

/**
 * Thrown when a node referenced by an edge does not exist
 */
export class NodeNotFoundError extends Error {
  constructor(
    public readonly semanticId: string,
    public readonly context: string
  ) {
    super(`Node '${semanticId}' not found (${context})`);
    this.name = 'NodeNotFoundError';
  }
}

/**
 * Thrown when attempting to operate on a variant that doesn't exist
 */
export class VariantNotFoundError extends Error {
  constructor(public readonly variantId: string) {
    super(`Variant '${variantId}' not found`);
    this.name = 'VariantNotFoundError';
  }
}

/**
 * Thrown when the Graph Store is not initialized
 */
export class GraphStoreNotInitializedError extends Error {
  constructor() {
    super('GraphStore not initialized. Call initialize() first.');
    this.name = 'GraphStoreNotInitializedError';
  }
}
