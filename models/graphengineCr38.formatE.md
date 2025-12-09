# GraphEngine CR-038 Target Architecture Model
#
# Format E System Model
# Version: 1.0.0
# Author: andreas@siglochconsulting
# Date: 2025-12-09
#
# This model reflects the CR-038 Clean Architecture target state
# with full INCOSE-style requirements, use cases, and architecture.

<operations>
<base_snapshot>empty</base_snapshot>
<view_context>hierarchy</view_context>

## Nodes

# ============================================================
# SYSTEM ROOT
# ============================================================
+ GraphEngineCR38|SYS|GraphEngineCR38.SY.001|LLM-powered systems engineering tool with AgentDB-centric architecture

# ============================================================
# ACTORS (External Entities)
# ============================================================
+ SystemsEngineer|ACTOR|SystemsEngineer.AC.001|Human user creating/editing system models via natural language
+ Neo4jDatabase|ACTOR|Neo4jDatabase.AC.002|Cold storage for persistent graph state
+ LLMProvider|ACTOR|LLMProvider.AC.003|External LLM service (Anthropic/OpenAI/Local)
+ WebSocketClient|ACTOR|WebSocketClient.AC.004|Terminal UI viewers subscribing to graph updates

# ============================================================
# USE CASES (Phase 1)
# ============================================================

# UC-1: Graph Modeling
+ GraphModeling|UC|GraphModeling.UC.001|User describes system in natural language, multi-agent routes request, Format E operations update graph
~ GraphModeling.UC.001|goal|User transforms natural language intent into structured graph elements
~ GraphModeling.UC.001|precondition|System loaded, AgentDB initialized, LLM provider configured
~ GraphModeling.UC.001|postcondition|Graph updated with new nodes/edges, changes tracked, episode recorded
~ GraphModeling.UC.001|primaryActor|SystemsEngineer
~ GraphModeling.UC.001|scope|SessionManager

# UC-2: Validation
+ ValidationCheck|UC|ValidationCheck.UC.002|User requests validation via /analyze or /phase-gate, evaluator checks ontology rules
~ ValidationCheck.UC.002|goal|Verify graph conforms to INCOSE ontology rules for current phase
~ ValidationCheck.UC.002|precondition|Graph contains nodes, phase determined
~ ValidationCheck.UC.002|postcondition|Violation report generated, reward score calculated
~ ValidationCheck.UC.002|primaryActor|SystemsEngineer
~ ValidationCheck.UC.002|scope|SessionManager

# UC-3: Optimization
+ ArchitectureOptimization|UC|ArchitectureOptimization.UC.003|User requests optimization, system generates Pareto-front variants without polluting main graph
~ ArchitectureOptimization.UC.003|goal|Improve architecture quality via multi-objective optimization
~ ArchitectureOptimization.UC.003|precondition|Graph loaded, validation baseline established
~ ArchitectureOptimization.UC.003|postcondition|Pareto-front variants available, user can apply chosen variant
~ ArchitectureOptimization.UC.003|primaryActor|SystemsEngineer
~ ArchitectureOptimization.UC.003|scope|SessionManager

# UC-4: Change Tracking
+ ChangeTracking|UC|ChangeTracking.UC.004|System tracks all graph mutations with git-like diff indicators (+/-/~)
~ ChangeTracking.UC.004|goal|Provide visibility into what changed since baseline
~ ChangeTracking.UC.004|precondition|Baseline established on load
~ ChangeTracking.UC.004|postcondition|All viewers show change indicators, /status reports accurate counts
~ ChangeTracking.UC.004|primaryActor|SystemsEngineer
~ ChangeTracking.UC.004|scope|AgentDB

# UC-5: Session Management
+ SessionManagement|UC|SessionManagement.UC.005|User loads/saves graph state via /load, /save, /export commands
~ SessionManagement.UC.005|goal|Persist graph state to Neo4j, restore on session start
~ SessionManagement.UC.005|precondition|Neo4j connection available
~ SessionManagement.UC.005|postcondition|Graph persisted or restored, baseline reset on load
~ SessionManagement.UC.005|primaryActor|SystemsEngineer
~ SessionManagement.UC.005|scope|SessionManager

# UC-6: Self-Learning
+ SelfLearning|UC|SelfLearning.UC.006|System records episodes, calculates rewards, builds skill library from successful patterns
~ SelfLearning.UC.006|goal|Improve agent effectiveness over time through reflexion
~ SelfLearning.UC.006|precondition|AgentDB initialized with embedding support
~ SelfLearning.UC.006|postcondition|Episode stored, patterns available for future similar tasks
~ SelfLearning.UC.006|primaryActor|SystemsEngineer
~ SelfLearning.UC.006|scope|SessionManager

# UC-7: LLM Flexibility
+ LLMProviderSwitch|UC|LLMProviderSwitch.UC.007|System supports multiple LLM backends via environment configuration
~ LLMProviderSwitch.UC.007|goal|Run with Anthropic, OpenAI, or local LLM without code changes
~ LLMProviderSwitch.UC.007|precondition|Provider credentials configured in environment
~ LLMProviderSwitch.UC.007|postcondition|LLM Engine routes requests to configured provider
~ LLMProviderSwitch.UC.007|primaryActor|SystemsEngineer
~ LLMProviderSwitch.UC.007|scope|LLMEngine

# UC-8: Context Optimization
+ ContextOptimization|UC|ContextOptimization.UC.008|LLM receives minimal relevant graph slice instead of full graph
~ ContextOptimization.UC.008|goal|Reduce token usage 5-10x while improving LLM focus
~ ContextOptimization.UC.008|precondition|Task classified, graph available
~ ContextOptimization.UC.008|postcondition|LLM receives ~3K tokens context instead of 15K
~ ContextOptimization.UC.008|primaryActor|SystemsEngineer
~ ContextOptimization.UC.008|scope|ContextManager

# ============================================================
# REQUIREMENTS - Functional (Phase 1)
# ============================================================

# FR-038.1: Single AgentDB Instance
+ SingleAgentDB|REQ|SingleAgentDB.RQ.001|The system shall maintain exactly ONE AgentDB instance per session
~ SingleAgentDB.RQ.001|text|The system shall maintain exactly ONE AgentDB instance per session, with all components receiving references rather than creating their own instances
~ SingleAgentDB.RQ.001|rationale|Multiple instances cause data inconsistency between components leading to stale validation, missing change indicators, and broken optimization

# FR-038.2: Dependency Injection
+ DependencyInjection|REQ|DependencyInjection.RQ.002|Components shall receive AgentDB via parameter or constructor injection
~ DependencyInjection.RQ.002|text|Components shall receive AgentDB via parameter or constructor injection, with no singleton factory caching
~ DependencyInjection.RQ.002|rationale|Singleton caching in factory functions creates hidden instances that diverge from the authoritative instance

# FR-038.3: Render-Ready Broadcasts
+ RenderReadyBroadcast|REQ|RenderReadyBroadcast.RQ.003|WebSocket broadcasts shall include nodeChangeStatus metadata
~ RenderReadyBroadcast.RQ.003|text|WebSocket broadcasts shall include nodeChangeStatus, workItemSummary, and validationSummary so viewers don't need direct AgentDB access
~ RenderReadyBroadcast.RQ.003|rationale|Thin terminal components should be pure display without state management

# FR-038.4: Thin Terminals
+ ThinTerminals|REQ|ThinTerminals.RQ.004|Chat Interface and Graph Viewer shall be I/O only components
~ ThinTerminals.RQ.004|text|Chat Interface shall handle user input and LLM output display only; Graph Viewer shall receive and render WebSocket data only
~ ThinTerminals.RQ.004|rationale|State management belongs in Session Manager, not in terminal components

# FR-038.5: Context Slicing
+ ContextSlicing|REQ|ContextSlicing.RQ.005|Context Manager shall slice graph by task type before LLM calls
~ ContextSlicing.RQ.005|text|Context Manager shall provide task-specific graph slices: derive-testcase→REQ only, detail-usecase→UC+neighbors, allocate-functions→FUNC+MOD, validate-phase→full subgraph
~ ContextSlicing.RQ.005|rationale|Full graph serialization wastes tokens and dilutes LLM focus

# FR-038.6: Variant Pool Isolation
+ VariantPoolIsolation|REQ|VariantPoolIsolation.RQ.006|Optimizer shall use Variant Pool with copy-on-write for what-if analysis
~ VariantPoolIsolation.RQ.006|text|Optimizer shall generate Pareto-front variants in isolated Variant Pool using copy-on-write, without modifying main graph until user explicitly applies a variant
~ VariantPoolIsolation.RQ.006|rationale|Optimization experiments must not pollute the authoritative graph state

# FR-038.7: Self-Learning Integration
+ SelfLearningIntegration|REQ|SelfLearningIntegration.RQ.007|Session Manager shall integrate ReflexionMemory and SkillLibrary into LLM request flow
~ SelfLearningIntegration.RQ.007|text|Before LLM call: load episode context and applicable patterns; After graph operations: store episode with validation, record successful patterns
~ SelfLearningIntegration.RQ.007|rationale|Self-learning components exist but are not integrated into the data flow

# ============================================================
# REQUIREMENTS - Non-Functional
# ============================================================

# NFR-038.1: Performance
+ NoPerformanceRegression|REQ|NoPerformanceRegression.RQ.101|The system shall maintain current response times after refactoring
~ NoPerformanceRegression.RQ.101|text|No single operation shall take more than 2x its current execution time after the CR-038 refactoring
~ NoPerformanceRegression.RQ.101|rationale|Architectural changes should improve maintainability without degrading user experience

# NFR-038.2: Test Coverage
+ AllTestsPass|REQ|AllTestsPass.RQ.102|All existing tests shall pass after each phase
~ AllTestsPass.RQ.102|text|The system shall maintain 100% pass rate on existing unit, integration, and E2E tests throughout implementation
~ AllTestsPass.RQ.102|rationale|Refactoring must not break existing functionality

# NFR-038.3: Command Compatibility
+ CommandCompatibility|REQ|CommandCompatibility.RQ.103|All existing commands shall work without interface changes
~ CommandCompatibility.RQ.103|text|Users shall be able to use /load, /save, /analyze, /optimize, /status, /commit, /view commands with identical syntax and behavior
~ CommandCompatibility.RQ.103|rationale|Internal refactoring should be transparent to users

# NFR-038.4: Memory Efficiency
+ MemoryEfficiency|REQ|MemoryEfficiency.RQ.104|Variant Pool shall use O(changes) memory per variant, not O(n)
~ MemoryEfficiency.RQ.104|text|Copy-on-write variants shall share base snapshot, storing only modified nodes, achieving O(changes) memory instead of O(n) per variant
~ MemoryEfficiency.RQ.104|rationale|10 variants × 1000 nodes = 10,000 copies is unacceptable; COW enables 10 × ~50 = 500 copies

# NFR-038.5: Token Efficiency
+ TokenEfficiency|REQ|TokenEfficiency.RQ.105|LLM context shall be reduced to ~3K tokens per typical task
~ TokenEfficiency.RQ.105|text|Context Manager shall achieve 5-10x token reduction: from ~15K (full 500-node graph) to ~1.5K-3K (task-specific slice)
~ TokenEfficiency.RQ.105|rationale|Token savings reduce cost and improve LLM response quality through focused context

# ============================================================
# FUNCTIONS (Phase 2 - Logical Architecture)
# ============================================================

# Session Manager Functions
+ InitializeSession|FUNC|InitializeSession.FN.001|Create AgentDB instance, load graph from Neo4j, establish baseline
~ InitializeSession.FN.001|volatility|low
+ BroadcastGraphUpdate|FUNC|BroadcastGraphUpdate.FN.002|Send Format E deltas with metadata to WebSocket subscribers
~ BroadcastGraphUpdate.FN.002|volatility|low
+ HandleCommand|FUNC|HandleCommand.FN.003|Route command to appropriate handler based on ownership matrix
~ HandleCommand.FN.003|volatility|medium
+ PersistSession|FUNC|PersistSession.FN.004|Write dirty nodes/edges to Neo4j, update audit log
~ PersistSession.FN.004|volatility|low

# Context Manager Functions
+ ClassifyTask|FUNC|ClassifyTask.FN.010|Determine task type from user message (derive-testcase, detail-usecase, etc.)
~ ClassifyTask.FN.010|volatility|high
+ SliceGraph|FUNC|SliceGraph.FN.011|Extract minimal subgraph for task type with depth control
~ SliceGraph.FN.011|volatility|medium
+ EstimateTokens|FUNC|EstimateTokens.FN.012|Calculate approximate token count for serialized slice
~ EstimateTokens.FN.012|volatility|low
+ PruneToFit|FUNC|PruneToFit.FN.013|Reduce slice depth until within token budget
~ PruneToFit.FN.013|volatility|low

# LLM Engine Functions
+ RouteToAgent|FUNC|RouteToAgent.FN.020|Select appropriate agent based on task and phase
~ RouteToAgent.FN.020|volatility|medium
+ ExecuteAgent|FUNC|ExecuteAgent.FN.021|Send request to LLM provider, stream response
~ ExecuteAgent.FN.021|volatility|low
+ ParseOperations|FUNC|ParseOperations.FN.022|Extract Format E operations from LLM response
~ ParseOperations.FN.022|volatility|low

# Validation Functions
+ EvaluateRules|FUNC|EvaluateRules.FN.030|Check graph against ontology rules for current phase
~ EvaluateRules.FN.030|volatility|low
+ CalculateReward|FUNC|CalculateReward.FN.031|Compute reward score from validation results
~ CalculateReward.FN.031|volatility|low
+ GenerateCritique|FUNC|GenerateCritique.FN.032|Produce human-readable critique from violations
~ GenerateCritique.FN.032|volatility|low

# Optimizer Functions
+ CreateVariant|FUNC|CreateVariant.FN.040|Create COW variant from base snapshot
~ CreateVariant.FN.040|volatility|low
+ ApplyMoveOperator|FUNC|ApplyMoveOperator.FN.041|Apply SPLIT/MERGE/LINK/REALLOC/CREATE/DELETE to variant
~ ApplyMoveOperator.FN.041|volatility|medium
+ ScoreVariant|FUNC|ScoreVariant.FN.042|Calculate multi-objective scores for variant
~ ScoreVariant.FN.042|volatility|low
+ ComputeParetoFront|FUNC|ComputeParetoFront.FN.043|Find non-dominated variants
~ ComputeParetoFront.FN.043|volatility|low

# Canvas Controller Functions
+ HandleViewCommand|FUNC|HandleViewCommand.FN.050|Update current view state on /view command
~ HandleViewCommand.FN.050|volatility|low
+ HandleFilterCommand|FUNC|HandleFilterCommand.FN.051|Update filter configuration on /filter command
~ HandleFilterCommand.FN.051|volatility|low
+ HandleViewRequest|FUNC|HandleViewRequest.FN.052|Respond to viewer pull request with rendered data
~ HandleViewRequest.FN.052|volatility|low

# Canvas Renderer Functions
+ RenderSlice|FUNC|RenderSlice.FN.060|Transform graph slice + view config into render data
~ RenderSlice.FN.060|volatility|low
+ GenerateFormatE|FUNC|GenerateFormatE.FN.061|Convert user edit into Format E operations
~ GenerateFormatE.FN.061|volatility|low

# Self-Learning Functions
+ LoadEpisodeContext|FUNC|LoadEpisodeContext.FN.070|Retrieve lessons and patterns for similar tasks
~ LoadEpisodeContext.FN.070|volatility|low
+ StoreEpisode|FUNC|StoreEpisode.FN.071|Record episode with validation results and critique
~ StoreEpisode.FN.071|volatility|low
+ RecordPattern|FUNC|RecordPattern.FN.072|Add successful operation pattern to skill library
~ RecordPattern.FN.072|volatility|low
+ FindApplicablePatterns|FUNC|FindApplicablePatterns.FN.073|Match current task to stored patterns
~ FindApplicablePatterns.FN.073|volatility|low

# ============================================================
# DATA FLOWS (Phase 2)
# ============================================================

# Session flows
+ UserCommand|FLOW|UserCommand.FL.001|Command string from terminal input
+ GraphState|FLOW|GraphState.FL.002|Current graph nodes/edges from AgentDB
+ BroadcastPayload|FLOW|BroadcastPayload.FL.003|Format E deltas + metadata for WebSocket

# Context flows
+ TaskDescription|FLOW|TaskDescription.FL.010|User message describing intended action
+ TaskType|FLOW|TaskType.FL.011|Classified task category
+ GraphSlice|FLOW|GraphSlice.FL.012|Minimal subgraph for LLM context

# LLM flows
+ AgentPrompt|FLOW|AgentPrompt.FL.020|System prompt with context for selected agent
+ LLMResponse|FLOW|LLMResponse.FL.021|Streamed response with embedded operations
+ FormatEOps|FLOW|FormatEOps.FL.022|Parsed Format E operations

# Validation flows
+ ValidationResult|FLOW|ValidationResult.FL.030|Rule violations, counts, reward score
+ Critique|FLOW|Critique.FL.031|Human-readable violation explanations

# Optimizer flows
+ Variant|FLOW|Variant.FL.040|COW graph variant with overrides
+ MultiObjectiveScores|FLOW|MultiObjectiveScores.FL.041|Scores per objective dimension
+ ParetoFront|FLOW|ParetoFront.FL.042|Non-dominated variant set

# Canvas flows
+ ViewConfig|FLOW|ViewConfig.FL.050|Current view + filters
+ RenderData|FLOW|RenderData.FL.051|Terminal-ready visualization data
+ ViewRequest|FLOW|ViewRequest.FL.052|Viewer pull request for specific view

# Learning flows
+ EpisodeContext|FLOW|EpisodeContext.FL.070|Lessons learned + successful patterns
+ Episode|FLOW|Episode.FL.071|Task, operations, success, reward, critique
+ SkillPattern|FLOW|SkillPattern.FL.072|Stored successful operation pattern

# ============================================================
# SCHEMAS (Global Definitions)
# ============================================================

+ NodeSchema|SCHEMA|NodeSchema.SC.001|Structure for graph nodes
~ NodeSchema.SC.001|struct|{ semanticId: string, type: NodeType, name: string, descr: string, properties: Record<string, any> }

+ EdgeSchema|SCHEMA|EdgeSchema.SC.002|Structure for graph edges
~ EdgeSchema.SC.002|struct|{ source: string, target: string, edgeType: EdgeType }

+ FormatEOperation|SCHEMA|FormatEOperation.SC.003|Structure for Format E operation
~ FormatEOperation.SC.003|struct|{ op: '+' | '-' | '~', nodeOrEdge: Node | Edge }

+ GraphSliceSchema|SCHEMA|GraphSliceSchema.SC.004|Structure for context slice
~ GraphSliceSchema.SC.004|struct|{ nodes: Map<string, Node>, edges: Map<string, Edge>, focusNodeId: string, depth: number, estimatedTokens: number }

+ ValidationResultSchema|SCHEMA|ValidationResultSchema.SC.005|Structure for validation output
~ ValidationResultSchema.SC.005|struct|{ violations: Violation[], errorCount: number, warningCount: number, rewardScore: number }

+ BroadcastPayloadSchema|SCHEMA|BroadcastPayloadSchema.SC.006|Structure for WebSocket broadcast
~ BroadcastPayloadSchema.SC.006|struct|{ type: string, version: number, operations: FormatEOperation[], nodeChangeStatus: Record<string, ChangeStatus>, workItemSummary: WorkItemSummary, validationSummary: ValidationSummary }

# ============================================================
# MODULES (Phase 3 - Physical Architecture)
# ============================================================

+ SessionManagerMod|MOD|SessionManagerMod.MD.001|Orchestrator owning AgentDB, coordinating all components
+ ContextManagerMod|MOD|ContextManagerMod.MD.002|Task classification and graph slicing for LLM
+ LLMEngineMod|MOD|LLMEngineMod.MD.003|Multi-agent routing and LLM provider abstraction
+ ValidationMod|MOD|ValidationMod.MD.004|Rule evaluation, scoring, critique generation
+ OptimizerMod|MOD|OptimizerMod.MD.005|Variant pool, move operators, Pareto computation
+ CanvasControllerMod|MOD|CanvasControllerMod.MD.006|View/filter state, user interaction handling
+ CanvasRendererMod|MOD|CanvasRendererMod.MD.007|Stateless graph-to-render transformation
+ SelfLearningMod|MOD|SelfLearningMod.MD.008|ReflexionMemory and SkillLibrary integration
+ AgentDBMod|MOD|AgentDBMod.MD.009|Unified data service with graph store, change tracker, embedding store

## Edges

# ============================================================
# HIERARCHY (compose edges)
# ============================================================

# System contains actors, UCs, REQs
+ GraphEngineCR38.SY.001 -cp-> SystemsEngineer.AC.001
+ GraphEngineCR38.SY.001 -cp-> Neo4jDatabase.AC.002
+ GraphEngineCR38.SY.001 -cp-> LLMProvider.AC.003
+ GraphEngineCR38.SY.001 -cp-> WebSocketClient.AC.004

+ GraphEngineCR38.SY.001 -cp-> GraphModeling.UC.001
+ GraphEngineCR38.SY.001 -cp-> ValidationCheck.UC.002
+ GraphEngineCR38.SY.001 -cp-> ArchitectureOptimization.UC.003
+ GraphEngineCR38.SY.001 -cp-> ChangeTracking.UC.004
+ GraphEngineCR38.SY.001 -cp-> SessionManagement.UC.005
+ GraphEngineCR38.SY.001 -cp-> SelfLearning.UC.006
+ GraphEngineCR38.SY.001 -cp-> LLMProviderSwitch.UC.007
+ GraphEngineCR38.SY.001 -cp-> ContextOptimization.UC.008

# Functional requirements under system
+ GraphEngineCR38.SY.001 -cp-> SingleAgentDB.RQ.001
+ GraphEngineCR38.SY.001 -cp-> DependencyInjection.RQ.002
+ GraphEngineCR38.SY.001 -cp-> RenderReadyBroadcast.RQ.003
+ GraphEngineCR38.SY.001 -cp-> ThinTerminals.RQ.004
+ GraphEngineCR38.SY.001 -cp-> ContextSlicing.RQ.005
+ GraphEngineCR38.SY.001 -cp-> VariantPoolIsolation.RQ.006
+ GraphEngineCR38.SY.001 -cp-> SelfLearningIntegration.RQ.007

# Non-functional requirements under system
+ GraphEngineCR38.SY.001 -cp-> NoPerformanceRegression.RQ.101
+ GraphEngineCR38.SY.001 -cp-> AllTestsPass.RQ.102
+ GraphEngineCR38.SY.001 -cp-> CommandCompatibility.RQ.103
+ GraphEngineCR38.SY.001 -cp-> MemoryEfficiency.RQ.104
+ GraphEngineCR38.SY.001 -cp-> TokenEfficiency.RQ.105

# Functions under system
+ GraphEngineCR38.SY.001 -cp-> InitializeSession.FN.001
+ GraphEngineCR38.SY.001 -cp-> BroadcastGraphUpdate.FN.002
+ GraphEngineCR38.SY.001 -cp-> HandleCommand.FN.003
+ GraphEngineCR38.SY.001 -cp-> PersistSession.FN.004
+ GraphEngineCR38.SY.001 -cp-> ClassifyTask.FN.010
+ GraphEngineCR38.SY.001 -cp-> SliceGraph.FN.011
+ GraphEngineCR38.SY.001 -cp-> EstimateTokens.FN.012
+ GraphEngineCR38.SY.001 -cp-> PruneToFit.FN.013
+ GraphEngineCR38.SY.001 -cp-> RouteToAgent.FN.020
+ GraphEngineCR38.SY.001 -cp-> ExecuteAgent.FN.021
+ GraphEngineCR38.SY.001 -cp-> ParseOperations.FN.022
+ GraphEngineCR38.SY.001 -cp-> EvaluateRules.FN.030
+ GraphEngineCR38.SY.001 -cp-> CalculateReward.FN.031
+ GraphEngineCR38.SY.001 -cp-> GenerateCritique.FN.032
+ GraphEngineCR38.SY.001 -cp-> CreateVariant.FN.040
+ GraphEngineCR38.SY.001 -cp-> ApplyMoveOperator.FN.041
+ GraphEngineCR38.SY.001 -cp-> ScoreVariant.FN.042
+ GraphEngineCR38.SY.001 -cp-> ComputeParetoFront.FN.043
+ GraphEngineCR38.SY.001 -cp-> HandleViewCommand.FN.050
+ GraphEngineCR38.SY.001 -cp-> HandleFilterCommand.FN.051
+ GraphEngineCR38.SY.001 -cp-> HandleViewRequest.FN.052
+ GraphEngineCR38.SY.001 -cp-> RenderSlice.FN.060
+ GraphEngineCR38.SY.001 -cp-> GenerateFormatE.FN.061
+ GraphEngineCR38.SY.001 -cp-> LoadEpisodeContext.FN.070
+ GraphEngineCR38.SY.001 -cp-> StoreEpisode.FN.071
+ GraphEngineCR38.SY.001 -cp-> RecordPattern.FN.072
+ GraphEngineCR38.SY.001 -cp-> FindApplicablePatterns.FN.073

# Flows under system
+ GraphEngineCR38.SY.001 -cp-> UserCommand.FL.001
+ GraphEngineCR38.SY.001 -cp-> GraphState.FL.002
+ GraphEngineCR38.SY.001 -cp-> BroadcastPayload.FL.003
+ GraphEngineCR38.SY.001 -cp-> TaskDescription.FL.010
+ GraphEngineCR38.SY.001 -cp-> TaskType.FL.011
+ GraphEngineCR38.SY.001 -cp-> GraphSlice.FL.012
+ GraphEngineCR38.SY.001 -cp-> AgentPrompt.FL.020
+ GraphEngineCR38.SY.001 -cp-> LLMResponse.FL.021
+ GraphEngineCR38.SY.001 -cp-> FormatEOps.FL.022
+ GraphEngineCR38.SY.001 -cp-> ValidationResult.FL.030
+ GraphEngineCR38.SY.001 -cp-> Critique.FL.031
+ GraphEngineCR38.SY.001 -cp-> Variant.FL.040
+ GraphEngineCR38.SY.001 -cp-> MultiObjectiveScores.FL.041
+ GraphEngineCR38.SY.001 -cp-> ParetoFront.FL.042
+ GraphEngineCR38.SY.001 -cp-> ViewConfig.FL.050
+ GraphEngineCR38.SY.001 -cp-> RenderData.FL.051
+ GraphEngineCR38.SY.001 -cp-> ViewRequest.FL.052
+ GraphEngineCR38.SY.001 -cp-> EpisodeContext.FL.070
+ GraphEngineCR38.SY.001 -cp-> Episode.FL.071
+ GraphEngineCR38.SY.001 -cp-> SkillPattern.FL.072

# Schemas under system
+ GraphEngineCR38.SY.001 -cp-> NodeSchema.SC.001
+ GraphEngineCR38.SY.001 -cp-> EdgeSchema.SC.002
+ GraphEngineCR38.SY.001 -cp-> FormatEOperation.SC.003
+ GraphEngineCR38.SY.001 -cp-> GraphSliceSchema.SC.004
+ GraphEngineCR38.SY.001 -cp-> ValidationResultSchema.SC.005
+ GraphEngineCR38.SY.001 -cp-> BroadcastPayloadSchema.SC.006

# Modules under system
+ GraphEngineCR38.SY.001 -cp-> SessionManagerMod.MD.001
+ GraphEngineCR38.SY.001 -cp-> ContextManagerMod.MD.002
+ GraphEngineCR38.SY.001 -cp-> LLMEngineMod.MD.003
+ GraphEngineCR38.SY.001 -cp-> ValidationMod.MD.004
+ GraphEngineCR38.SY.001 -cp-> OptimizerMod.MD.005
+ GraphEngineCR38.SY.001 -cp-> CanvasControllerMod.MD.006
+ GraphEngineCR38.SY.001 -cp-> CanvasRendererMod.MD.007
+ GraphEngineCR38.SY.001 -cp-> SelfLearningMod.MD.008
+ GraphEngineCR38.SY.001 -cp-> AgentDBMod.MD.009

# ============================================================
# SATISFY EDGES (UC→REQ, FUNC→REQ)
# ============================================================

# Use Cases satisfy Requirements
+ GraphModeling.UC.001 -sat-> SingleAgentDB.RQ.001
+ GraphModeling.UC.001 -sat-> DependencyInjection.RQ.002
+ ValidationCheck.UC.002 -sat-> SingleAgentDB.RQ.001
+ ArchitectureOptimization.UC.003 -sat-> VariantPoolIsolation.RQ.006
+ ArchitectureOptimization.UC.003 -sat-> MemoryEfficiency.RQ.104
+ ChangeTracking.UC.004 -sat-> RenderReadyBroadcast.RQ.003
+ SessionManagement.UC.005 -sat-> SingleAgentDB.RQ.001
+ SelfLearning.UC.006 -sat-> SelfLearningIntegration.RQ.007
+ LLMProviderSwitch.UC.007 -sat-> CommandCompatibility.RQ.103
+ ContextOptimization.UC.008 -sat-> ContextSlicing.RQ.005
+ ContextOptimization.UC.008 -sat-> TokenEfficiency.RQ.105

# Functions satisfy Requirements
+ InitializeSession.FN.001 -sat-> SingleAgentDB.RQ.001
+ BroadcastGraphUpdate.FN.002 -sat-> RenderReadyBroadcast.RQ.003
+ BroadcastGraphUpdate.FN.002 -sat-> ThinTerminals.RQ.004
+ HandleCommand.FN.003 -sat-> CommandCompatibility.RQ.103
+ SliceGraph.FN.011 -sat-> ContextSlicing.RQ.005
+ SliceGraph.FN.011 -sat-> TokenEfficiency.RQ.105
+ EstimateTokens.FN.012 -sat-> TokenEfficiency.RQ.105
+ PruneToFit.FN.013 -sat-> TokenEfficiency.RQ.105
+ EvaluateRules.FN.030 -sat-> SingleAgentDB.RQ.001
+ CreateVariant.FN.040 -sat-> VariantPoolIsolation.RQ.006
+ CreateVariant.FN.040 -sat-> MemoryEfficiency.RQ.104
+ RenderSlice.FN.060 -sat-> ThinTerminals.RQ.004
+ LoadEpisodeContext.FN.070 -sat-> SelfLearningIntegration.RQ.007
+ StoreEpisode.FN.071 -sat-> SelfLearningIntegration.RQ.007

# ============================================================
# IO EDGES (Function Data Flow)
# ============================================================

# Session Manager flow
+ SystemsEngineer.AC.001 -io-> UserCommand.FL.001
+ UserCommand.FL.001 -io-> HandleCommand.FN.003
+ HandleCommand.FN.003 -io-> GraphState.FL.002
+ GraphState.FL.002 -io-> BroadcastGraphUpdate.FN.002
+ BroadcastGraphUpdate.FN.002 -io-> BroadcastPayload.FL.003
+ BroadcastPayload.FL.003 -io-> WebSocketClient.AC.004

# Context Manager flow
+ HandleCommand.FN.003 -io-> TaskDescription.FL.010
+ TaskDescription.FL.010 -io-> ClassifyTask.FN.010
+ ClassifyTask.FN.010 -io-> TaskType.FL.011
+ TaskType.FL.011 -io-> SliceGraph.FN.011
+ SliceGraph.FN.011 -io-> GraphSlice.FL.012
+ GraphSlice.FL.012 -io-> EstimateTokens.FN.012
+ EstimateTokens.FN.012 -io-> PruneToFit.FN.013
+ PruneToFit.FN.013 -io-> GraphSlice.FL.012

# LLM Engine flow
+ GraphSlice.FL.012 -io-> RouteToAgent.FN.020
+ RouteToAgent.FN.020 -io-> AgentPrompt.FL.020
+ AgentPrompt.FL.020 -io-> ExecuteAgent.FN.021
+ ExecuteAgent.FN.021 -io-> LLMResponse.FL.021
+ LLMResponse.FL.021 -io-> ParseOperations.FN.022
+ ParseOperations.FN.022 -io-> FormatEOps.FL.022

# Validation flow
+ GraphState.FL.002 -io-> EvaluateRules.FN.030
+ EvaluateRules.FN.030 -io-> ValidationResult.FL.030
+ ValidationResult.FL.030 -io-> CalculateReward.FN.031
+ ValidationResult.FL.030 -io-> GenerateCritique.FN.032
+ GenerateCritique.FN.032 -io-> Critique.FL.031

# Optimizer flow
+ GraphState.FL.002 -io-> CreateVariant.FN.040
+ CreateVariant.FN.040 -io-> Variant.FL.040
+ Variant.FL.040 -io-> ApplyMoveOperator.FN.041
+ ApplyMoveOperator.FN.041 -io-> Variant.FL.040
+ Variant.FL.040 -io-> ScoreVariant.FN.042
+ ScoreVariant.FN.042 -io-> MultiObjectiveScores.FL.041
+ MultiObjectiveScores.FL.041 -io-> ComputeParetoFront.FN.043
+ ComputeParetoFront.FN.043 -io-> ParetoFront.FL.042

# Canvas flow
+ UserCommand.FL.001 -io-> HandleViewCommand.FN.050
+ HandleViewCommand.FN.050 -io-> ViewConfig.FL.050
+ UserCommand.FL.001 -io-> HandleFilterCommand.FN.051
+ HandleFilterCommand.FN.051 -io-> ViewConfig.FL.050
+ ViewRequest.FL.052 -io-> HandleViewRequest.FN.052
+ HandleViewRequest.FN.052 -io-> RenderSlice.FN.060
+ GraphSlice.FL.012 -io-> RenderSlice.FN.060
+ ViewConfig.FL.050 -io-> RenderSlice.FN.060
+ RenderSlice.FN.060 -io-> RenderData.FL.051

# Self-learning flow
+ TaskDescription.FL.010 -io-> LoadEpisodeContext.FN.070
+ LoadEpisodeContext.FN.070 -io-> EpisodeContext.FL.070
+ EpisodeContext.FL.070 -io-> RouteToAgent.FN.020
+ FormatEOps.FL.022 -io-> StoreEpisode.FN.071
+ ValidationResult.FL.030 -io-> StoreEpisode.FN.071
+ StoreEpisode.FN.071 -io-> Episode.FL.071
+ Episode.FL.071 -io-> RecordPattern.FN.072
+ RecordPattern.FN.072 -io-> SkillPattern.FL.072
+ TaskDescription.FL.010 -io-> FindApplicablePatterns.FN.073
+ FindApplicablePatterns.FN.073 -io-> SkillPattern.FL.072

# ============================================================
# ALLOCATE EDGES (FUNC→MOD)
# ============================================================

# Session Manager Module
+ InitializeSession.FN.001 -alloc-> SessionManagerMod.MD.001
+ BroadcastGraphUpdate.FN.002 -alloc-> SessionManagerMod.MD.001
+ HandleCommand.FN.003 -alloc-> SessionManagerMod.MD.001
+ PersistSession.FN.004 -alloc-> SessionManagerMod.MD.001

# Context Manager Module
+ ClassifyTask.FN.010 -alloc-> ContextManagerMod.MD.002
+ SliceGraph.FN.011 -alloc-> ContextManagerMod.MD.002
+ EstimateTokens.FN.012 -alloc-> ContextManagerMod.MD.002
+ PruneToFit.FN.013 -alloc-> ContextManagerMod.MD.002

# LLM Engine Module
+ RouteToAgent.FN.020 -alloc-> LLMEngineMod.MD.003
+ ExecuteAgent.FN.021 -alloc-> LLMEngineMod.MD.003
+ ParseOperations.FN.022 -alloc-> LLMEngineMod.MD.003

# Validation Module
+ EvaluateRules.FN.030 -alloc-> ValidationMod.MD.004
+ CalculateReward.FN.031 -alloc-> ValidationMod.MD.004
+ GenerateCritique.FN.032 -alloc-> ValidationMod.MD.004

# Optimizer Module
+ CreateVariant.FN.040 -alloc-> OptimizerMod.MD.005
+ ApplyMoveOperator.FN.041 -alloc-> OptimizerMod.MD.005
+ ScoreVariant.FN.042 -alloc-> OptimizerMod.MD.005
+ ComputeParetoFront.FN.043 -alloc-> OptimizerMod.MD.005

# Canvas Controller Module
+ HandleViewCommand.FN.050 -alloc-> CanvasControllerMod.MD.006
+ HandleFilterCommand.FN.051 -alloc-> CanvasControllerMod.MD.006
+ HandleViewRequest.FN.052 -alloc-> CanvasControllerMod.MD.006

# Canvas Renderer Module
+ RenderSlice.FN.060 -alloc-> CanvasRendererMod.MD.007
+ GenerateFormatE.FN.061 -alloc-> CanvasRendererMod.MD.007

# Self-Learning Module
+ LoadEpisodeContext.FN.070 -alloc-> SelfLearningMod.MD.008
+ StoreEpisode.FN.071 -alloc-> SelfLearningMod.MD.008
+ RecordPattern.FN.072 -alloc-> SelfLearningMod.MD.008
+ FindApplicablePatterns.FN.073 -alloc-> SelfLearningMod.MD.008

# ============================================================
# RELATION EDGES (FLOW→SCHEMA)
# ============================================================

+ GraphState.FL.002 -rel-> NodeSchema.SC.001
+ GraphState.FL.002 -rel-> EdgeSchema.SC.002
+ FormatEOps.FL.022 -rel-> FormatEOperation.SC.003
+ GraphSlice.FL.012 -rel-> GraphSliceSchema.SC.004
+ ValidationResult.FL.030 -rel-> ValidationResultSchema.SC.005
+ BroadcastPayload.FL.003 -rel-> BroadcastPayloadSchema.SC.006

</operations>
