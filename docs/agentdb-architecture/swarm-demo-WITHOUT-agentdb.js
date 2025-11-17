#!/usr/bin/env node
/**
 * Swarm Demo WITHOUT agentDB
 * Same task as agentDB version, but using FILE-BASED coordination
 * Measures: Time, Complexity
 */

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = '/tmp/agentdb-demo/no-agentdb-output';
const NAMESPACE = 'swarm-demo-no-agentdb-1763215920';

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function logWithTimestamp(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
}

async function main() {
  const startTime = Date.now();

  console.log('\n🚀 SWARM DEMO WITHOUT AGENTDB - File-Based Coordination\n');
  console.log('=' .repeat(60));

  // ============================================================
  // AGENT 1: RESEARCHER - Stores in FILES
  // ============================================================
  console.log('\n📚 AGENT 1: RESEARCHER');
  console.log('-'.repeat(60));

  const researchFindings = {
    agent: 'researcher',
    task: 'analyze_rest_api_best_practices',
    timestamp: new Date().toISOString(),
    content: 'REST API Best Practices: 1) Use nouns for resources (e.g., /users not /getUsers), 2) HTTP methods define actions (GET=read, POST=create, PUT=update, DELETE=remove), 3) Proper status codes (200 OK, 201 Created, 404 Not Found, 500 Server Error), 4) Consistent error format with message and code, 5) Versioning via URL path (/api/v1/users)',
    type: 'findings'
  };

  const findingsPath = path.join(OUTPUT_DIR, 'researcher_findings.json');
  fs.writeFileSync(findingsPath, JSON.stringify(researchFindings, null, 2));
  logWithTimestamp(`✅ Stored: API Best Practices → ${findingsPath}`);

  const designPatterns = {
    agent: 'researcher',
    task: 'identify_design_patterns',
    timestamp: new Date().toISOString(),
    content: 'Common REST Design Patterns: Resource-oriented architecture, HATEOAS for discoverability, Pagination for large datasets, Filtering and sorting via query params, Authentication via Bearer tokens, Rate limiting for API protection',
    type: 'patterns'
  };

  const patternsPath = path.join(OUTPUT_DIR, 'researcher_patterns.json');
  fs.writeFileSync(patternsPath, JSON.stringify(designPatterns, null, 2));
  logWithTimestamp(`✅ Stored: Design Patterns → ${patternsPath}`);

  // ============================================================
  // AGENT 2: CODER - Reads from FILES (manual search)
  // ============================================================
  console.log('\n💻 AGENT 2: CODER');
  console.log('-'.repeat(60));

  logWithTimestamp('🔍 Searching for researcher findings in files...');

  // Manual file search (no semantic search!)
  const files = fs.readdirSync(OUTPUT_DIR);
  const researcherFiles = files.filter(f => f.startsWith('researcher_'));

  logWithTimestamp(`✅ Found ${researcherFiles.length} files from researcher:`);

  const foundData = [];
  researcherFiles.forEach((file, idx) => {
    const filePath = path.join(OUTPUT_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    console.log(`   ${idx + 1}. ${file}`);
    console.log(`      "${data.content.substring(0, 60)}..."`);
    foundData.push(data);
  });

  // NOTE: No vector similarity scores - just found files or not!

  const implementation = {
    agent: 'coder',
    task: 'implement_users_api_endpoint',
    timestamp: new Date().toISOString(),
    content: 'Implementation: /api/v1/users endpoint - GET: paginated user list (200), POST: create new user (201), PUT /:id: update user (200), DELETE /:id: remove user (204). Error format: {error: {code, message}}. Bearer token required in Authorization header. Applied researcher best practices from FILES: resource nouns, proper HTTP methods, status codes, versioning.',
    type: 'implementation',
    references: researcherFiles  // File names, not semantic references
  };

  const implPath = path.join(OUTPUT_DIR, 'coder_implementation.json');
  fs.writeFileSync(implPath, JSON.stringify(implementation, null, 2));
  logWithTimestamp(`✅ Stored: API Implementation → ${implPath}`);
  console.log('   References:', implementation.references.join(', '));

  // ============================================================
  // AGENT 3: REVIEWER - Reads ALL FILES
  // ============================================================
  console.log('\n🔍 AGENT 3: REVIEWER');
  console.log('-'.repeat(60));

  logWithTimestamp('🔍 Searching for ALL agent files...');
  const allFiles = fs.readdirSync(OUTPUT_DIR);

  logWithTimestamp(`✅ Found ${allFiles.length} total files:`);
  const allData = [];
  allFiles.forEach((file, idx) => {
    const filePath = path.join(OUTPUT_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    console.log(`   ${idx + 1}. [${data.agent.toUpperCase()}] ${file}`);
    allData.push(data);
  });

  const review = {
    agent: 'reviewer',
    task: 'validate_api_implementation',
    timestamp: new Date().toISOString(),
    content: 'Code Review: Coder correctly applied ALL 5 best practices from researcher: ✓ Resource nouns (/users), ✓ HTTP methods (GET/POST/PUT/DELETE), ✓ Status codes (200/201/204), ✓ Error format standardized, ✓ Versioning (/v1/). Implementation matches design patterns: resource-oriented, Bearer auth. APPROVED. Cross-referenced researcher files from disk.',
    type: 'review',
    status: 'approved',
    reviewed_files: ['coder_implementation.json'],
    validated_against_files: researcherFiles
  };

  const reviewPath = path.join(OUTPUT_DIR, 'reviewer_validation.json');
  fs.writeFileSync(reviewPath, JSON.stringify(review, null, 2));
  logWithTimestamp(`✅ Stored: Code Review → ${reviewPath}`);
  console.log('   Status:', review.status.toUpperCase());
  console.log('   Validated against:', review.validated_against_files.length, 'files');

  // ============================================================
  // FINAL PROOF
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('📊 FINAL PROOF: File-Based Coordination');
  console.log('='.repeat(60));

  const finalFiles = fs.readdirSync(OUTPUT_DIR);
  console.log(`\n✅ Total files created: ${finalFiles.length}`);
  console.log(`✅ Output directory: ${OUTPUT_DIR}`);

  console.log('\n📋 File Contents:');
  finalFiles.forEach((file, idx) => {
    const filePath = path.join(OUTPUT_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    console.log(`\n${idx + 1}. Agent: ${data.agent.toUpperCase()}`);
    console.log(`   Task: ${data.task}`);
    console.log(`   Type: ${data.type || 'N/A'}`);
    console.log(`   File: ${file}`);
    console.log(`   Content: "${data.content.substring(0, 100)}..."`);
  });

  // ============================================================
  // METRICS
  // ============================================================
  const endTime = Date.now();
  const duration = endTime - startTime;

  console.log('\n' + '='.repeat(60));
  console.log('⏱️  PERFORMANCE METRICS (WITHOUT AGENTDB)');
  console.log('='.repeat(60));
  console.log(`\n⏱️  Total Time: ${duration}ms`);
  console.log(`📁 Files Created: ${finalFiles.length}`);
  console.log(`📂 Directory Size: ${getDirectorySize(OUTPUT_DIR)} bytes`);
  console.log(`🔍 Search Method: Manual file system scan (no semantic search)`);
  console.log(`📊 Similarity Scores: ❌ Not available`);
  console.log(`🧠 Context Synthesis: ❌ Not available`);
  console.log(`💾 Persistence: File system only`);

  console.log('\n❌ LIMITATIONS:');
  console.log('   • No semantic vector search');
  console.log('   • No similarity scores');
  console.log('   • Manual file naming conventions required');
  console.log('   • No automatic context synthesis');
  console.log('   • No causal edge discovery');
  console.log('   • No learning system');
  console.log('   • File system I/O overhead');
  console.log('   • No cross-session memory without file management\n');

  return {
    duration,
    filesCreated: finalFiles.length,
    directorySize: getDirectorySize(OUTPUT_DIR),
    method: 'file-based'
  };
}

function getDirectorySize(dirPath) {
  let totalSize = 0;
  const files = fs.readdirSync(dirPath);
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);
    totalSize += stats.size;
  });
  return totalSize;
}

main()
  .then(metrics => {
    console.log('\n✅ Benchmark completed\n');
    // Save metrics for comparison
    fs.writeFileSync(
      '/tmp/agentdb-demo/metrics-without-agentdb.json',
      JSON.stringify(metrics, null, 2)
    );
  })
  .catch(console.error);
