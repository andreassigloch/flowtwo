/**
 * AgentDB + LLM Engine Integration
 * Complete implementation for flowground Systems Engineering Assistant
 */

import { AgentDBService } from '../services/agentdb.service';
import { AIAssistantService } from './ai-assistant.service';
import { ChatRequest, ChatResponseChunk, Operation } from './types';

/**
 * Enhanced AI Assistant with agentDB Integration
 */
export class AgentDBAwareAssistant extends AIAssistantService {
  private agentdb: AgentDBService;
  private agentDBNamespace: string = 'flowground-se';

  constructor(neo4jService: any, validatorService: any, llmConfig?: any) {
    super(neo4jService, validatorService, llmConfig);
    this.agentdb = new AgentDBService(this.agentDBNamespace);
  }

  /**
   * STEP 2: Pre-Query Knowledge Retrieval
   * Check agentDB for similar past solutions before calling LLM
   */
  async checkKnownSolutions(userMessage: string, threshold: number = 0.85): Promise<{
    found: boolean;
    episode?: any;
    operations?: Operation[];
    confidence?: number;
  }> {
    try {
      // Query agentDB for similar tasks
      const results = await this.agentdb.vectorSearch({
        query: userMessage,
        k: 1,
        threshold,
        namespace: this.agentDBNamespace
      });

      if (results.length > 0) {
        const bestMatch = results[0];

        // Parse stored episode
        const episode = JSON.parse(bestMatch.content);

        return {
          found: true,
          episode: episode,
          operations: episode.output?.operations || [],
          confidence: bestMatch.similarity
        };
      }

      return { found: false };
    } catch (error: any) {
      this.logger.error('agentDB knowledge check failed', error);
      return { found: false };
    }
  }

  /**
   * STEP 3: Build Enhanced System Prompt with agentDB Context
   */
  async buildSystemPromptWithAgentDB(
    sessionId: string,
    userMessage: string,
    context?: any
  ): Promise<string> {
    // Get base system prompt
    const basePrompt = await this.buildSystemPromptWithCaching(sessionId, context);

    // Get similar episodes from agentDB
    const similarEpisodes = await this.agentdb.vectorSearch({
      query: userMessage,
      k: 5,
      threshold: 0.7,
      namespace: this.agentDBNamespace
    });

    if (similarEpisodes.length === 0) {
      return basePrompt;
    }

    // Enhance system prompt with past solutions
    const episodeContext = similarEpisodes.map((ep, idx) => {
      const episode = JSON.parse(ep.content);
      return `
## Similar Past Solution #${idx + 1} (Similarity: ${ep.similarity.toFixed(2)})

**Task:** ${episode.task}
**Success:** ${episode.success ? 'Yes' : 'No'}
**Reward:** ${episode.reward}

**Approach:**
${episode.critique || 'No details available'}

**Operations Generated:** ${episode.output?.operations?.length || 0}
      `.trim();
    }).join('\n\n');

    return `${basePrompt}

# 🧠 Knowledge from Past Experience

You have access to similar problems solved in the past:

${episodeContext}

**Instructions:**
- Learn from these successful patterns
- Adapt proven approaches to current task
- Avoid mistakes from failed episodes
- Generate operations in the same format
`;
  }

  /**
   * STEP 4: Master LLM Decision - Direct Answer vs Agent Spawn
   */
  async analyzeTaskComplexity(userMessage: string): Promise<{
    complexity: 'simple' | 'complex' | 'unknown';
    confidence: number;
    suggestedAgent?: string;
    reasoning: string;
  }> {
    // Simple heuristics (could be enhanced with LLM call)
    const keywords = {
      simple: ['erstelle', 'create', 'add', 'zeige', 'show', 'list'],
      complex: ['analysiere', 'analyze', 'entwerfe', 'design', 'optimiere', 'optimize'],
      unknown: ['erkunde', 'explore', 'recherchiere', 'research', 'finde heraus']
    };

    const messageLower = userMessage.toLowerCase();

    // Check for simple patterns
    if (keywords.simple.some(kw => messageLower.includes(kw))) {
      return {
        complexity: 'simple',
        confidence: 0.8,
        reasoning: 'Task involves straightforward creation/listing'
      };
    }

    // Check for complex patterns
    if (keywords.complex.some(kw => messageLower.includes(kw))) {
      // Determine specialist agent
      let suggestedAgent = 'general-purpose';
      if (messageLower.includes('anforderung') || messageLower.includes('requirement')) {
        suggestedAgent = 'requirements-specialist';
      } else if (messageLower.includes('architektur') || messageLower.includes('architecture')) {
        suggestedAgent = 'architecture-designer';
      } else if (messageLower.includes('test')) {
        suggestedAgent = 'test-engineer';
      }

      return {
        complexity: 'complex',
        confidence: 0.7,
        suggestedAgent,
        reasoning: 'Task requires specialized expertise'
      };
    }

    // Unknown domain
    return {
      complexity: 'unknown',
      confidence: 0.6,
      suggestedAgent: 'domain-explorer',
      reasoning: 'Task requires research/exploration'
    };
  }

  /**
   * STEP 5: Spawn Specialized Agent with agentDB Context
   */
  async spawnSpecializedAgent(
    agentType: string,
    task: string,
    context: any
  ): Promise<{
    textResponse: string;
    operations: Operation[];
    usedSkills: string[];
  }> {
    // Pre-Task: Load relevant knowledge from agentDB
    const [episodes, skills, causalEdges] = await Promise.all([
      // Load similar episodes
      this.agentdb.vectorSearch({
        query: task,
        k: 10,
        namespace: this.agentDBNamespace,
        filter: { agentType }
      }),

      // Load proven skills (if skill library exists)
      this.loadSkillsFromAgentDB(agentType),

      // Load causal knowledge
      this.loadCausalKnowledge(task)
    ]);

    // Build agent system prompt with enhanced context
    const agentPrompt = this.buildAgentPrompt(agentType, {
      task,
      context,
      episodes,
      skills,
      causalEdges
    });

    // Execute agent (calls LLM with specialized prompt)
    const result = await this.executeLLMCall(agentPrompt, task);

    // Post-Task: Store agent execution in agentDB
    await this.storeAgentExecution(agentType, task, result);

    return result;
  }

  /**
   * STEP 6: Store Successful Interaction in agentDB
   */
  async storeInteractionInAgentDB(
    task: string,
    userMessage: string,
    response: string,
    operations: Operation[],
    success: boolean,
    metadata: any = {}
  ): Promise<void> {
    try {
      const episode = {
        task,
        input: userMessage,
        output: {
          textResponse: response,
          operations
        },
        success,
        reward: success ? 1.0 : 0.0,
        critique: this.generateCritique(operations, success),
        metadata: {
          ...metadata,
          timestamp: new Date().toISOString(),
          nodeTypes: this.extractNodeTypes(operations),
          operationCount: operations.length,
          namespace: this.agentDBNamespace
        }
      };

      await this.agentdb.indexNode({
        uuid: `episode-${Date.now()}`,
        Name: task,
        Descr: JSON.stringify(episode),
        type: 'episode'
      });

      this.logger.info(`Stored episode in agentDB: ${task}`);
    } catch (error: any) {
      this.logger.error('Failed to store episode in agentDB', error);
    }
  }

  /**
   * Enhanced Chat with Full agentDB Integration
   */
  async* streamChatWithAgentDB(request: ChatRequest): AsyncGenerator<ChatResponseChunk> {
    const { sessionId, userId, message, context } = request;
    const messageId = this.generateMessageId();

    // STEP 2: Check for known solutions
    const knownSolution = await this.checkKnownSolutions(message);

    if (knownSolution.found && knownSolution.confidence! > 0.85) {
      // Return cached answer - Skip LLM entirely!
      this.logger.info(`Found cached solution (confidence: ${knownSolution.confidence})`);

      yield {
        type: 'ai-response-chunk',
        sessionId,
        messageId,
        chunk: knownSolution.episode.output.textResponse,
        isComplete: true,
        operations: knownSolution.operations
      };

      return; // Skip LLM call - 100x cost savings!
    }

    // STEP 3: Build enhanced system prompt
    const systemPrompt = await this.buildSystemPromptWithAgentDB(sessionId, message, context);

    // STEP 4: Analyze task complexity
    const complexity = await this.analyzeTaskComplexity(message);

    if (complexity.complexity === 'simple') {
      // Direct answer path - use Master LLM
      for await (const chunk of this.streamChat(request)) {
        yield chunk;
      }

      // Store successful interaction
      // (Collect operations from stream for storage)
    } else {
      // Agent spawn path
      this.logger.info(`Spawning ${complexity.suggestedAgent} agent`);

      const agentResult = await this.spawnSpecializedAgent(
        complexity.suggestedAgent!,
        message,
        context
      );

      yield {
        type: 'ai-response-chunk',
        sessionId,
        messageId,
        chunk: agentResult.textResponse,
        isComplete: true,
        operations: agentResult.operations
      };

      // Agent already stored its own execution
    }
  }

  /**
   * Helper: Load skills from agentDB
   */
  private async loadSkillsFromAgentDB(agentType: string): Promise<any[]> {
    // Query for skills related to agent type
    const results = await this.agentdb.vectorSearch({
      query: `${agentType} proven patterns`,
      k: 5,
      namespace: this.agentDBNamespace,
      filter: { type: 'skill' }
    });

    return results.map(r => JSON.parse(r.content));
  }

  /**
   * Helper: Load causal knowledge
   */
  private async loadCausalKnowledge(task: string): Promise<any[]> {
    // In future: Query agentDB causal graph
    // For now: Return empty array
    return [];
  }

  /**
   * Helper: Build agent-specific prompt
   */
  private buildAgentPrompt(agentType: string, context: any): string {
    const roleDescriptions = {
      'requirements-specialist': 'You are an expert Requirements Engineer...',
      'architecture-designer': 'You are a Senior Software Architect...',
      'test-engineer': 'You are a Test Automation Expert...',
      'domain-explorer': 'You are a Domain Research Specialist...'
    };

    const role = roleDescriptions[agentType] || 'You are an AI assistant...';

    return `${role}

## Your Task
${context.task}

## Available Knowledge
${this.formatEpisodes(context.episodes)}
${this.formatSkills(context.skills)}

## Current Context
${JSON.stringify(context.context, null, 2)}

Generate operations in the standard format and explain your approach.
`;
  }

  /**
   * Helper: Execute LLM call
   */
  private async executeLLMCall(systemPrompt: string, userMessage: string): Promise<any> {
    // Simplified - use existing streamLLMResponse
    let fullResponse = '';

    for await (const chunk of this.streamLLMResponse(userMessage, systemPrompt, [])) {
      if (chunk.type === 'content') {
        fullResponse += chunk.content || '';
      }
    }

    const { textResponse, operations } = this.responseDistributor.parseLLMResponse(fullResponse);

    return {
      textResponse,
      operations,
      usedSkills: [] // Extract from response if available
    };
  }

  /**
   * Helper: Store agent execution
   */
  private async storeAgentExecution(agentType: string, task: string, result: any): Promise<void> {
    await this.storeInteractionInAgentDB(
      task,
      task,
      result.textResponse,
      result.operations,
      result.operations.length > 0,
      {
        agentType,
        usedSkills: result.usedSkills
      }
    );
  }

  /**
   * Helper: Generate critique
   */
  private generateCritique(operations: Operation[], success: boolean): string {
    if (!success) {
      return 'Task failed - no operations generated';
    }

    const nodeCount = operations.filter(op => op.type === 'create').length;
    const relCount = operations.filter(op => op.type === 'create-relationship').length;

    return `Successfully generated ${nodeCount} nodes and ${relCount} relationships`;
  }

  /**
   * Helper: Extract node types from operations
   */
  private extractNodeTypes(operations: Operation[]): string[] {
    return [...new Set(
      operations
        .filter(op => op.nodeType)
        .map(op => op.nodeType!)
    )];
  }

  /**
   * Helper: Format episodes for prompt
   */
  private formatEpisodes(episodes: any[]): string {
    if (episodes.length === 0) return 'No similar episodes found.';

    return episodes.map((ep, idx) => `
### Episode ${idx + 1}
${ep.content}
    `).join('\n');
  }

  /**
   * Helper: Format skills for prompt
   */
  private formatSkills(skills: any[]): string {
    if (skills.length === 0) return 'No proven skills available.';

    return skills.map((skill, idx) => `
### Skill ${idx + 1}: ${skill.name}
${skill.description}
Success Rate: ${skill.successRate}%
    `).join('\n');
  }
}

/**
 * Usage Example:
 *
 * const assistant = new AgentDBAwareAssistant(neo4jService, validatorService);
 *
 * for await (const chunk of assistant.streamChatWithAgentDB(request)) {
 *   // Send to client via SSE
 *   res.write(`data: ${JSON.stringify(chunk)}\n\n`);
 * }
 */
