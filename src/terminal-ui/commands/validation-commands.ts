/**
 * Validation Commands - Validation and analysis command handlers
 *
 * Handles /validate, /phase-gate, /score, /analyze, /optimize commands
 *
 * @author andreas@siglochconsulting
 */

import type { CommandContext } from './types.js';
import {
  getUnifiedRuleEvaluator,
  getRuleLoader,
  type PhaseId,
  type ValidationResult,
} from '../../llm-engine/validation/index.js';

/**
 * Handle /validate command - run full validation report
 */
export async function handleValidateCommand(args: string[], ctx: CommandContext): Promise<void> {
  console.log('');
  console.log('\x1b[1;36m🔍 Running Validation...\x1b[0m');
  ctx.log('🔍 Running validation');

  try {
    const phaseArg = args[0]?.toLowerCase();
    let phase: PhaseId = 'phase2_logical';
    if (phaseArg === '1' || phaseArg === 'requirements') phase = 'phase1_requirements';
    else if (phaseArg === '2' || phaseArg === 'logical') phase = 'phase2_logical';
    else if (phaseArg === '3' || phaseArg === 'physical') phase = 'phase3_physical';
    else if (phaseArg === '4' || phaseArg === 'verification') phase = 'phase4_verification';

    const evaluator = await getUnifiedRuleEvaluator(ctx.config.workspaceId, ctx.config.systemId);
    const result = await evaluator.evaluate(phase);
    displayValidationResult(result);

    ctx.log(`✅ Validation complete: score=${result.rewardScore.toFixed(2)}, violations=${result.totalViolations}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Validation error: ${errorMsg}\x1b[0m`);
    ctx.log(`❌ Validation error: ${errorMsg}`);
  }
  console.log('');
}

/**
 * Handle /phase-gate command - check phase gate readiness
 */
export async function handlePhaseGateCommand(args: string[], ctx: CommandContext): Promise<void> {
  console.log('');
  console.log('\x1b[1;36m🚪 Checking Phase Gate...\x1b[0m');
  ctx.log('🚪 Checking phase gate');

  try {
    const phaseArg = args[0];
    let phase: PhaseId = 'phase2_logical';
    if (phaseArg === '1') phase = 'phase1_requirements';
    else if (phaseArg === '2') phase = 'phase2_logical';
    else if (phaseArg === '3') phase = 'phase3_physical';
    else if (phaseArg === '4') phase = 'phase4_verification';

    const evaluator = await getUnifiedRuleEvaluator(ctx.config.workspaceId, ctx.config.systemId);
    const ruleLoader = getRuleLoader();

    const gateResult = await evaluator.checkPhaseGate(phase);
    const phaseDef = ruleLoader.getPhaseDefinition(phase);

    console.log('');
    console.log(`\x1b[1mPhase: ${phaseDef?.name || phase}\x1b[0m`);
    console.log(`\x1b[90m${phaseDef?.description || ''}\x1b[0m`);
    console.log('');

    if (gateResult.ready) {
      console.log(`\x1b[32m✅ GATE PASSED - Score: ${gateResult.score.toFixed(2)}\x1b[0m`);
      console.log('\x1b[90m   Ready to advance to next phase\x1b[0m');
    } else {
      console.log(`\x1b[31m❌ GATE BLOCKED - Score: ${gateResult.score.toFixed(2)}\x1b[0m`);
      console.log('');
      console.log('\x1b[1mBlockers:\x1b[0m');
      for (const blocker of gateResult.blockers) {
        console.log(`  • ${blocker}`);
      }
    }

    if (phaseDef?.deliverables && phaseDef.deliverables.length > 0) {
      console.log('');
      console.log('\x1b[1mDeliverables:\x1b[0m');
      for (const deliverable of phaseDef.deliverables) {
        console.log(`  □ ${deliverable}`);
      }
    }

    ctx.log(`✅ Phase gate check complete: ${gateResult.ready ? 'PASSED' : 'BLOCKED'}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Phase gate error: ${errorMsg}\x1b[0m`);
    ctx.log(`❌ Phase gate error: ${errorMsg}`);
  }
  console.log('');
}

/**
 * Handle /score command - show multi-objective scores
 */
export async function handleScoreCommand(ctx: CommandContext): Promise<void> {
  console.log('');
  console.log('\x1b[1;36m📊 Computing Scores...\x1b[0m');
  ctx.log('📊 Computing scores');

  try {
    const evaluator = await getUnifiedRuleEvaluator(ctx.config.workspaceId, ctx.config.systemId);
    const ruleLoader = getRuleLoader();

    const result = await evaluator.evaluate('phase2_logical');
    const rewardConfig = ruleLoader.getRewardConfig();

    const state = ctx.graphCanvas.getState();
    const nodeCount = state.nodes.size;
    const edgeCount = state.edges.size;

    const typeCounts: Record<string, number> = {};
    for (const node of state.nodes.values()) {
      typeCounts[node.type] = (typeCounts[node.type] || 0) + 1;
    }

    console.log('');
    console.log('\x1b[1m═══════════════════════════════════════\x1b[0m');
    console.log('\x1b[1m           SYSTEM SCORECARD            \x1b[0m');
    console.log('\x1b[1m═══════════════════════════════════════\x1b[0m');
    console.log('');

    const scoreBar = createProgressBar(result.rewardScore, 20);
    const scoreColor = result.rewardScore >= 0.7 ? '\x1b[32m' : result.rewardScore >= 0.5 ? '\x1b[33m' : '\x1b[31m';
    console.log(`\x1b[1mOverall Score:\x1b[0m ${scoreColor}${(result.rewardScore * 100).toFixed(0)}%\x1b[0m ${scoreBar}`);
    console.log(`\x1b[90mThreshold: ${(rewardConfig.successThreshold * 100).toFixed(0)}%\x1b[0m`);
    console.log('');

    console.log('\x1b[1mGraph Metrics:\x1b[0m');
    console.log(`  Nodes: ${nodeCount}`);
    console.log(`  Edges: ${edgeCount}`);
    if (Object.keys(typeCounts).length > 0) {
      console.log('  Types: ' + Object.entries(typeCounts).map(([t, c]) => `${t}(${c})`).join(', '));
    }
    console.log('');

    console.log('\x1b[1mViolation Summary:\x1b[0m');
    console.log(`  \x1b[31mErrors:\x1b[0m   ${result.errorCount}`);
    console.log(`  \x1b[33mWarnings:\x1b[0m ${result.warningCount}`);
    console.log(`  \x1b[36mInfo:\x1b[0m     ${result.infoCount}`);
    console.log('');

    console.log('\x1b[1mPhase Gate:\x1b[0m ' + (result.phaseGateReady
      ? '\x1b[32m✅ Ready\x1b[0m'
      : '\x1b[31m❌ Not Ready\x1b[0m'));

    ctx.log(`✅ Score computed: ${(result.rewardScore * 100).toFixed(0)}%`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Score error: ${errorMsg}\x1b[0m`);
    ctx.log(`❌ Score error: ${errorMsg}`);
  }
  console.log('');
}

/**
 * Handle /analyze command - analyze violations and suggest fixes
 */
export async function handleAnalyzeCommand(ctx: CommandContext): Promise<void> {
  console.log('');
  console.log('\x1b[1;36m🔍 Architecture Analysis\x1b[0m');
  ctx.log('🔍 Running analysis');

  try {
    const evaluator = await getUnifiedRuleEvaluator(ctx.config.workspaceId, ctx.config.systemId);
    const result = await evaluator.evaluate('phase2_logical');

    if (result.totalViolations === 0) {
      console.log('');
      console.log('\x1b[32m✅ No violations found - architecture is clean!\x1b[0m');
      console.log(`\x1b[90m   Score: ${(result.rewardScore * 100).toFixed(0)}%\x1b[0m`);
      console.log('');
      ctx.log('✅ Analysis: no violations');
      return;
    }

    console.log('');
    console.log('\x1b[1mSuggested Fixes:\x1b[0m');
    console.log('');

    const suggestionGroups = new Map<string, string[]>();
    for (const v of result.violations) {
      const suggestion = v.suggestion || `Fix: ${v.ruleName}`;
      if (!suggestionGroups.has(suggestion)) {
        suggestionGroups.set(suggestion, []);
      }
      suggestionGroups.get(suggestion)!.push(v.semanticId);
    }

    let idx = 1;
    for (const [suggestion, nodes] of suggestionGroups) {
      const severityIcon = result.violations.find(v => v.suggestion === suggestion)?.severity === 'error'
        ? '\x1b[31m●\x1b[0m'
        : '\x1b[33m●\x1b[0m';
      console.log(`  ${idx}. ${severityIcon} ${suggestion}`);
      if (nodes.length <= 3) {
        console.log(`     \x1b[90mAffects: ${nodes.join(', ')}\x1b[0m`);
      } else {
        console.log(`     \x1b[90mAffects: ${nodes.slice(0, 3).join(', ')} (+${nodes.length - 3} more)\x1b[0m`);
      }
      idx++;
    }

    if (result.similarityMatches.length > 0) {
      console.log('');
      console.log('\x1b[1mMerge Candidates:\x1b[0m');
      for (const match of result.similarityMatches.slice(0, 5)) {
        const icon = match.recommendation === 'merge' ? '🔀' : '🔍';
        console.log(`  ${icon} ${match.nodeA.name} ↔ ${match.nodeB.name} (${(match.score * 100).toFixed(0)}% similar)`);
      }
    }

    console.log('');
    console.log(`\x1b[90mTip: Use /optimize to auto-apply fixes, or use natural language:\x1b[0m`);
    console.log(`\x1b[90m  "Add satisfy edge from ProcessData to REQ-001"\x1b[0m`);

    ctx.log(`✅ Analysis complete: ${suggestionGroups.size} suggestions`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Analysis error: ${errorMsg}\x1b[0m`);
    ctx.log(`❌ Analysis error: ${errorMsg}`);
  }
  console.log('');
}

/**
 * Handle /optimize command - run multi-objective optimization
 */
export async function handleOptimizeCommand(args: string, ctx: CommandContext): Promise<void> {
  const maxIterations = args ? parseInt(args, 10) : 30;

  console.log('');
  console.log('\x1b[1;36m⚡ Multi-Objective Optimization\x1b[0m');
  console.log(`\x1b[90m   Max iterations: ${maxIterations}\x1b[0m`);
  ctx.log(`⚡ Running optimization (${maxIterations} iterations)`);

  try {
    const { violationGuidedSearch, formatScore } = await import('../../llm-engine/optimizer/index.js');

    const currentState = ctx.graphCanvas.getState();
    const arch = {
      id: ctx.config.systemId,
      nodes: Array.from(currentState.nodes.values()).map(n => ({
        id: n.uuid,
        type: n.type as 'SYS' | 'UC' | 'REQ' | 'FUNC' | 'FLOW' | 'SCHEMA' | 'MOD' | 'TEST',
        label: n.name || n.uuid,
        properties: { ...n }
      })),
      edges: Array.from(currentState.edges.values()).map(e => ({
        id: e.uuid,
        source: e.sourceId,
        target: e.targetId,
        type: e.type
      })),
      metadata: { systemId: ctx.config.systemId }
    };

    if (arch.nodes.length === 0) {
      console.log('\x1b[33m⚠️  No nodes in graph - nothing to optimize\x1b[0m');
      console.log('');
      return;
    }

    console.log(`\x1b[90m   Nodes: ${arch.nodes.length}, Edges: ${arch.edges.length}\x1b[0m`);
    console.log('');

    const result = violationGuidedSearch(arch, {
      maxIterations,
      randomSeed: Date.now()
    }, {
      verbose: false,
      onIteration: (state) => {
        if (state.iteration % 5 === 0) {
          process.stdout.write(`\r\x1b[90m   Iteration ${state.iteration}/${maxIterations}...\x1b[0m`);
        }
      }
    });

    console.log('\r\x1b[K');

    console.log('\x1b[1mOptimization Results:\x1b[0m');
    console.log(`  Iterations: ${result.iterations}`);
    console.log(`  Convergence: ${result.convergenceReason}`);
    console.log(`  Success: ${result.success ? '\x1b[32mYes\x1b[0m' : '\x1b[33mPartial\x1b[0m'}`);
    console.log('');

    console.log('\x1b[1mBest Variant:\x1b[0m');
    console.log(`  Score: ${formatScore(result.bestVariant.score)}`);
    console.log(`  Applied operators: ${result.bestVariant.appliedOperator || 'none'}`);
    console.log('');

    if (result.paretoFront.length > 1) {
      console.log('\x1b[1mPareto Front:\x1b[0m');
      for (const variant of result.paretoFront) {
        console.log(`  [${variant.id}] w=${variant.score.weighted.toFixed(3)} op=${variant.appliedOperator || '-'}`);
      }
      console.log('');
    }

    const opUsage = Object.entries(result.stats.operatorUsage)
      .filter(([, count]) => count > 0)
      .map(([op, count]) => `${op}:${count}`)
      .join(', ');
    if (opUsage) {
      console.log(`\x1b[90m   Operators: ${opUsage}\x1b[0m`);
    }
    console.log(`\x1b[90m   Variants: ${result.stats.totalVariantsGenerated} generated, ${result.stats.variantsRejected} rejected\x1b[0m`);

    ctx.log(`✅ Optimization complete: score=${result.bestVariant.score.weighted.toFixed(3)}`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.log(`\x1b[31m❌ Optimization error: ${errorMsg}\x1b[0m`);
    ctx.log(`❌ Optimization error: ${errorMsg}`);
  }
  console.log('');
}

/**
 * Display validation result in formatted output
 */
function displayValidationResult(result: ValidationResult): void {
  const ruleLoader = getRuleLoader();
  const phaseDef = ruleLoader.getPhaseDefinition(result.phase);

  console.log('');
  console.log('\x1b[1m═══════════════════════════════════════\x1b[0m');
  console.log(`\x1b[1m  VALIDATION REPORT - ${phaseDef?.name || result.phase}\x1b[0m`);
  console.log('\x1b[1m═══════════════════════════════════════\x1b[0m');
  console.log('');

  const scoreBar = createProgressBar(result.rewardScore, 20);
  const scoreColor = result.rewardScore >= 0.7 ? '\x1b[32m' : result.rewardScore >= 0.5 ? '\x1b[33m' : '\x1b[31m';
  console.log(`\x1b[1mScore:\x1b[0m ${scoreColor}${(result.rewardScore * 100).toFixed(0)}%\x1b[0m ${scoreBar}`);
  console.log(`\x1b[1mGate:\x1b[0m  ${result.phaseGateReady ? '\x1b[32m✅ Ready\x1b[0m' : '\x1b[31m❌ Not Ready\x1b[0m'}`);
  console.log('');

  if (result.totalViolations === 0) {
    console.log('\x1b[32m✅ No violations found\x1b[0m');
  } else {
    console.log(`\x1b[1mViolations:\x1b[0m ${result.totalViolations} total`);
    if (result.errorCount > 0) console.log(`  \x1b[31m● Errors:\x1b[0m   ${result.errorCount}`);
    if (result.warningCount > 0) console.log(`  \x1b[33m● Warnings:\x1b[0m ${result.warningCount}`);
    if (result.infoCount > 0) console.log(`  \x1b[36m● Info:\x1b[0m     ${result.infoCount}`);
    console.log('');

    console.log('\x1b[1mDetails:\x1b[0m');
    const displayViolations = result.violations.slice(0, 10);
    for (const v of displayViolations) {
      const icon = v.severity === 'error' ? '\x1b[31m●\x1b[0m' : v.severity === 'warning' ? '\x1b[33m●\x1b[0m' : '\x1b[36m●\x1b[0m';
      console.log(`  ${icon} ${v.ruleName}`);
      console.log(`    \x1b[90m${v.semanticId}: ${v.reason}\x1b[0m`);
      if (v.suggestion) {
        console.log(`    \x1b[32m→ ${v.suggestion}\x1b[0m`);
      }
    }
    if (result.violations.length > 10) {
      console.log(`  \x1b[90m... and ${result.violations.length - 10} more\x1b[0m`);
    }
  }

  if (result.similarityMatches.length > 0) {
    console.log('');
    console.log(`\x1b[1mSimilarity Matches:\x1b[0m ${result.similarityMatches.length}`);
    for (const match of result.similarityMatches.slice(0, 5)) {
      const icon = match.recommendation === 'merge' ? '🔀' : match.recommendation === 'review' ? '🔍' : '✓';
      console.log(`  ${icon} ${match.nodeA.name} ↔ ${match.nodeB.name} (${(match.score * 100).toFixed(0)}%)`);
    }
  }
}

/**
 * Create ASCII progress bar
 */
function createProgressBar(value: number, width: number): string {
  const filled = Math.round(value * width);
  const empty = width - filled;
  const color = value >= 0.7 ? '\x1b[32m' : value >= 0.5 ? '\x1b[33m' : '\x1b[31m';
  return `${color}[${'█'.repeat(filled)}${'░'.repeat(empty)}]\x1b[0m`;
}
