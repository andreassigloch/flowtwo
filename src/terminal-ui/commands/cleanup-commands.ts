/**
 * Cleanup Commands - Database maintenance command handlers
 *
 * Handles /cleanup command for removing stale nodes from Neo4j
 *
 * @author andreas@siglochconsulting
 */

import type { CommandContext } from './types.js';

/**
 * Handle /cleanup command - remove nodes from Neo4j not belonging to current system
 * Options:
 * - (no args): Clean nodes NOT in current system (keeps only loaded system's nodes)
 * - all: Clean ALL nodes not in current workspace
 */
export async function handleCleanupCommand(args: string[], ctx: CommandContext): Promise<void> {
  console.log('');
  console.log('\x1b[1;36m🧹 Database Cleanup\x1b[0m');
  console.log(`\x1b[90m   Current system: ${ctx.config.systemId}\x1b[0m`);
  console.log(`\x1b[90m   Current workspace: ${ctx.config.workspaceId}\x1b[0m`);
  ctx.log('🧹 Running database cleanup');

  if (!ctx.neo4jClient) {
    console.log('\x1b[33m⚠️  Neo4j not configured\x1b[0m');
    console.log('');
    return;
  }

  try {
    const session = (ctx.neo4jClient as unknown as { getSession: () => { run: (q: string, p: Record<string, string>) => Promise<{ records: Array<{ get: (k: string) => unknown }> }>; close: () => Promise<void> } }).getSession();
    const cleanAll = args[0]?.toLowerCase() === 'all';

    try {
      let findQuery: string;
      let description: string;

      if (cleanAll) {
        description = 'nodes not in current workspace';
        findQuery = `
          MATCH (n:Node)
          WHERE n.workspaceId <> $workspaceId
             OR n.workspaceId IS NULL
             OR n.uuid IS NULL
             OR n.type IS NULL
             OR n.name IS NULL OR n.name = ''
             OR n.descr IS NULL OR n.descr = ''
          RETURN count(n) as count,
                 collect(DISTINCT n.workspaceId)[0..5] as workspaces,
                 collect(DISTINCT n.systemId)[0..5] as systems,
                 collect(coalesce(n.semanticId, n.name, 'unknown'))[0..5] as samples
        `;
      } else {
        description = 'nodes not in current system';
        findQuery = `
          MATCH (n:Node)
          WHERE n.workspaceId = $workspaceId
            AND (n.systemId <> $systemId
                 OR n.systemId IS NULL
                 OR n.uuid IS NULL
                 OR n.type IS NULL
                 OR n.name IS NULL OR n.name = ''
                 OR n.descr IS NULL OR n.descr = '')
          RETURN count(n) as count,
                 collect(DISTINCT n.systemId)[0..10] as systems,
                 collect(coalesce(n.semanticId, n.name, 'unknown'))[0..10] as samples
        `;
      }

      const findResult = await session.run(findQuery, {
        workspaceId: ctx.config.workspaceId,
        systemId: ctx.config.systemId,
      });

      const record = findResult.records[0];
      const countVal = record?.get('count');
      const count = typeof countVal === 'object' && countVal !== null && 'toNumber' in countVal
        ? (countVal as { toNumber: () => number }).toNumber()
        : (countVal as number) ?? 0;
      const samples = (record?.get('samples') as string[]) ?? [];
      const systems = (record?.get('systems') as string[]) ?? [];

      if (count === 0) {
        console.log(`\x1b[32m✅ No ${description} found\x1b[0m`);
        console.log('');
        return;
      }

      console.log(`\x1b[33m⚠️  Found ${count} ${description}:\x1b[0m`);
      if (systems.length > 0) {
        console.log(`\x1b[90m   Systems: ${systems.slice(0, 5).join(', ')}${systems.length > 5 ? '...' : ''}\x1b[0m`);
      }
      if (samples.length > 0) {
        console.log(`\x1b[90m   Samples: ${samples.slice(0, 5).join(', ')}${samples.length > 5 ? '...' : ''}\x1b[0m`);
      }
      if (cleanAll && record?.get('workspaces')) {
        const workspaces = record.get('workspaces') as string[];
        console.log(`\x1b[90m   Workspaces: ${workspaces.join(', ')}\x1b[0m`);
      }
      console.log('');

      let deleteQuery: string;
      if (cleanAll) {
        deleteQuery = `
          MATCH (n:Node)
          WHERE n.workspaceId <> $workspaceId
             OR n.workspaceId IS NULL
             OR n.uuid IS NULL
             OR n.type IS NULL
             OR n.name IS NULL OR n.name = ''
             OR n.descr IS NULL OR n.descr = ''
          DETACH DELETE n
          RETURN count(*) as deleted
        `;
      } else {
        deleteQuery = `
          MATCH (n:Node)
          WHERE n.workspaceId = $workspaceId
            AND (n.systemId <> $systemId
                 OR n.systemId IS NULL
                 OR n.uuid IS NULL
                 OR n.type IS NULL
                 OR n.name IS NULL OR n.name = ''
                 OR n.descr IS NULL OR n.descr = '')
          DETACH DELETE n
          RETURN count(*) as deleted
        `;
      }

      const deleteResult = await session.run(deleteQuery, {
        workspaceId: ctx.config.workspaceId,
        systemId: ctx.config.systemId,
      });

      const deletedVal = deleteResult.records[0]?.get('deleted');
      const deleted = typeof deletedVal === 'object' && deletedVal !== null && 'toNumber' in deletedVal
        ? (deletedVal as { toNumber: () => number }).toNumber()
        : (deletedVal as number) ?? 0;

      console.log(`\x1b[32m✅ Cleaned ${deleted} nodes from Neo4j\x1b[0m`);
      ctx.log(`✅ Cleaned ${deleted} nodes from Neo4j`);

    } finally {
      await session.close();
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Cleanup error: ${errorMsg}\x1b[0m`);
    ctx.log(`❌ Cleanup error: ${errorMsg}`);
  }
  console.log('');
}
