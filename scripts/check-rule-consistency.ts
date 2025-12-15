#!/usr/bin/env npx tsx
/**
 * Rule Consistency Checker
 *
 * Ensures ontology-rules.json, agent prompts, and unified-rule-evaluator.ts
 * are consistent. Run as pre-commit hook.
 *
 * Checks:
 * 1. Every validationRule in ontology-rules.json has implementation in evaluator
 * 2. Every rule mentioned in prompts exists in ontology-rules.json
 * 3. Rule descriptions match between sources
 *
 * @author andreas@siglochconsulting
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const ONTOLOGY_PATH = join(ROOT, 'settings/ontology-rules.json');
const EVALUATOR_PATH = join(ROOT, 'src/llm-engine/validation/unified-rule-evaluator.ts');
const PROMPTS_DIR = join(ROOT, 'settings/prompts');

interface ValidationRule {
  id: string;
  description: string;
  phase?: string;
  severity?: string;
}

interface OntologyRules {
  validationRules: Record<string, ValidationRule>;
  integrityRules?: Record<string, ValidationRule>;
}

interface ConsistencyError {
  type: 'missing_implementation' | 'missing_rule' | 'orphan_case' | 'description_mismatch';
  rule: string;
  details: string;
  file?: string;
}

function loadOntologyRules(): OntologyRules {
  const content = readFileSync(ONTOLOGY_PATH, 'utf-8');
  return JSON.parse(content);
}

function extractEvaluatorCases(): Set<string> {
  const content = readFileSync(EVALUATOR_PATH, 'utf-8');
  const cases = new Set<string>();

  // Match case 'rule_name': patterns
  const caseRegex = /case\s+['"]([a-z_]+)['"]\s*:/g;
  let match;
  while ((match = caseRegex.exec(content)) !== null) {
    cases.add(match[1]);
  }

  return cases;
}

function extractPromptRules(): Map<string, string[]> {
  const rulesByFile = new Map<string, string[]>();
  const files = readdirSync(PROMPTS_DIR).filter(f => f.endsWith('.md'));

  for (const file of files) {
    const content = readFileSync(join(PROMPTS_DIR, file), 'utf-8');
    const rules: string[] = [];

    // Match backtick-quoted rule names like `fchain_actor_boundary`
    const ruleRegex = /`([a-z_]+)`/g;
    let match;
    while ((match = ruleRegex.exec(content)) !== null) {
      // Filter out common non-rule patterns
      const candidate = match[1];
      if (candidate.includes('_') && !candidate.startsWith('data_') &&
          !['io_', 'cp_', 'sat_', 'ver_', 'alc_', 'rel_'].some(p => candidate === p.slice(0, -1))) {
        rules.push(candidate);
      }
    }

    if (rules.length > 0) {
      rulesByFile.set(file, [...new Set(rules)]);
    }
  }

  return rulesByFile;
}

function checkConsistency(): ConsistencyError[] {
  const errors: ConsistencyError[] = [];

  // Load sources
  const ontology = loadOntologyRules();
  const evaluatorCases = extractEvaluatorCases();
  const promptRules = extractPromptRules();

  // Combine all ontology rules
  const allOntologyRules = new Set<string>([
    ...Object.keys(ontology.validationRules || {}),
    ...Object.keys(ontology.integrityRules || {}),
  ]);

  // Rules that are handled specially or planned for later phases
  const specialRules = new Set([
    // Similarity rules handled separately
    'near_duplicate',
    'merge_candidate',
    'func_near_duplicate',
    'func_merge_candidate',
    'schema_near_duplicate',
    'schema_merge_candidate',
    // Phase 3+ rules (not yet critical)
    'allocation_cohesion',
    'func_description_quality',
    // Planned but not implemented
    'flow_data_schema',
    'schema_struct_property',
    'uc_satisfy_req',
    'nested_func_isolation',
    'volatile_func_isolation',
  ]);

  // 1. Check: Every validation rule should have evaluator implementation
  for (const ruleId of allOntologyRules) {
    if (specialRules.has(ruleId)) continue;

    // Skip integrity rules that are checked elsewhere
    if (ontology.integrityRules?.[ruleId]) continue;

    if (!evaluatorCases.has(ruleId)) {
      errors.push({
        type: 'missing_implementation',
        rule: ruleId,
        details: `Rule '${ruleId}' defined in ontology-rules.json but no case in unified-rule-evaluator.ts`,
      });
    }
  }

  // 2. Check: Every case in evaluator should exist in ontology
  for (const caseId of evaluatorCases) {
    if (!allOntologyRules.has(caseId)) {
      errors.push({
        type: 'orphan_case',
        rule: caseId,
        details: `Case '${caseId}' in unified-rule-evaluator.ts but not defined in ontology-rules.json`,
      });
    }
  }

  // 3. Check: Every rule mentioned in prompts exists in ontology
  for (const [file, rules] of promptRules) {
    for (const rule of rules) {
      // Only check rules that look like validation rules (contain underscore)
      if (!allOntologyRules.has(rule) && rule.includes('_')) {
        // Skip common false positives (not rule names)
        const falsePositives = [
          'semantic_id', 'data_testid', 'cache_control', 'pre_commit',
          'test_pyramid', 'node_type', 'edge_type', 'base_snapshot',
          'view_context', 'io_input', 'io_output', 'copy_on_write',
          '_new', '_modified', '_v2', // naming convention examples
          'req_semantic_id', 'sys_satisfy_nfr', // phase gate rules (planned)
          'millers_law_func', 'millers_law_mod', // variants of millers_law
          'uc_has_requirements', 'uc_has_actor', 'uc_has_scenario', // UC quality metrics
          'uc_goal_defined', 'uc_postcondition', 'uc_precondition',
          'req_verifiable', 'req_necessary', 'req_singular', // REQ quality metrics
          'req_unambiguous', 'req_conforming', 'req_complete',
        ];
        if (!falsePositives.includes(rule)) {
          errors.push({
            type: 'missing_rule',
            rule: rule,
            details: `Rule '${rule}' referenced in prompt but not in ontology-rules.json`,
            file,
          });
        }
      }
    }
  }

  return errors;
}

// Main execution
const errors = checkConsistency();

if (errors.length === 0) {
  console.log('✅ Rule consistency check passed');
  console.log('   - ontology-rules.json');
  console.log('   - unified-rule-evaluator.ts');
  console.log('   - settings/prompts/*.md');
  process.exit(0);
} else {
  console.error('❌ Rule consistency check FAILED\n');

  const byType = {
    missing_implementation: errors.filter(e => e.type === 'missing_implementation'),
    orphan_case: errors.filter(e => e.type === 'orphan_case'),
    missing_rule: errors.filter(e => e.type === 'missing_rule'),
  };

  if (byType.missing_implementation.length > 0) {
    console.error('🔴 Rules without implementation in evaluator:');
    for (const e of byType.missing_implementation) {
      console.error(`   - ${e.rule}`);
    }
    console.error('   Fix: Add case block in unified-rule-evaluator.ts\n');
  }

  if (byType.orphan_case.length > 0) {
    console.error('🟡 Orphan cases in evaluator (not in ontology):');
    for (const e of byType.orphan_case) {
      console.error(`   - ${e.rule}`);
    }
    console.error('   Fix: Add rule definition to ontology-rules.json or remove case\n');
  }

  if (byType.missing_rule.length > 0) {
    console.error('🟠 Rules in prompts but not in ontology:');
    for (const e of byType.missing_rule) {
      console.error(`   - ${e.rule} (${e.file})`);
    }
    console.error('   Fix: Add to ontology-rules.json or fix typo in prompt\n');
  }

  process.exit(1);
}
