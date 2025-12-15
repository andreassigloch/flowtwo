/**
 * Command Handlers Index
 *
 * Re-exports all command handlers for the chat interface.
 *
 * @author andreas@siglochconsulting
 */

// Types
export type { CommandContext, SessionConfig } from './types.js';

// Derive commands
export { handleDeriveCommand } from './derive-commands.js';

// Validation commands
export {
  handleValidateCommand,
  handlePhaseGateCommand,
  handleScoreCommand,
  handleAnalyzeCommand,
  handleOptimizeCommand,
} from './validation-commands.js';

// Cleanup commands
export { handleCleanupCommand } from './cleanup-commands.js';

// Session/IO commands
export {
  handleNewCommand,
  handleCommitCommand,
  handleSaveCommand,
  handleRestoreCommand,
  handleLoadCommand,
  handleExportCommand,
  handleImportCommand,
  handleExportsCommand,
  handleStatsCommand,
  handleViewCommand,
  handleStatusCommand,
  printHelpMenu,
} from './session-commands.js';
