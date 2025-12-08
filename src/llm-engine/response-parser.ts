/**
 * Response Parser
 *
 * Parses LLM responses to extract operations and text
 *
 * Pattern:
 * - LLM response contains text + <operations>...</operations> block
 * - Operations block contains Format E Diff
 * - Text response is everything except operations block
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

/**
 * Response Parser
 *
 * Extracts operations from LLM response text
 *
 * TEST: tests/unit/llm-engine/response-parser.test.ts
 */
export class ResponseParser {
  /**
   * Parse LLM response
   *
   * Extracts operations block and returns clean text + operations
   *
   * @param response - Raw LLM response text
   * @returns Parsed response with text and operations separated
   */
  parseResponse(response: string): {
    textResponse: string;
    operations: string | null;
  } {
    // Extract ALL complete operations blocks
    const allOperations = this.extractAllOperationsBlocks(response);

    // Combine ALL operations blocks into one (CR-034: support multi-block LLM responses)
    // This handles models that generate multiple <operations>...</operations> sections
    let combinedOperations: string | null = null;
    if (allOperations.length > 0) {
      // Extract content from each block and combine
      const allContent: string[] = [];
      for (const block of allOperations) {
        const content = this.extractOperationsContent(block);
        if (content) {
          allContent.push(content);
        }
      }
      if (allContent.length > 0) {
        combinedOperations = `<operations>\n${allContent.join('\n')}\n</operations>`;
      }
    }

    // Remove ALL operations blocks from text
    let textResponse = response;
    for (const ops of allOperations) {
      textResponse = textResponse.replace(ops, '');
    }

    // Clean up whitespace
    textResponse = textResponse
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n') // Max 2 consecutive newlines
      .trim();

    return {
      textResponse,
      operations: combinedOperations,
    };
  }

  /**
   * Extract ALL complete operations blocks from text (CR-034)
   * Returns array of complete blocks for incremental processing
   */
  extractAllCompleteBlocks(text: string): string[] {
    return this.extractAllOperationsBlocks(text);
  }

  /**
   * Extract operations block from text
   *
   * Finds <operations>...</operations> block (case-insensitive)
   *
   * @param text - Text to search
   * @returns Operations block or null
   */
  extractOperationsBlock(text: string): string | null {
    // Match <operations>...</operations> (case-insensitive, multiline)
    const regex = /<operations>[\s\S]*?<\/operations>/i;
    const match = text.match(regex);

    return match ? match[0] : null;
  }

  /**
   * Extract all operations blocks from text
   *
   * @param text - Text to search
   * @returns Array of operations blocks
   */
  private extractAllOperationsBlocks(text: string): string[] {
    // Match ALL <operations>...</operations> blocks (case-insensitive, multiline, global)
    const regex = /<operations>[\s\S]*?<\/operations>/gi;
    const matches = text.match(regex);

    return matches || [];
  }

  /**
   * Extract content from an operations block (without the tags)
   *
   * @param block - Operations block including tags
   * @returns Content without tags, or null if invalid
   */
  private extractOperationsContent(block: string): string | null {
    const match = block.match(/<operations>([\s\S]*?)<\/operations>/i);
    if (match && match[1]) {
      return match[1].trim();
    }
    return null;
  }
}
