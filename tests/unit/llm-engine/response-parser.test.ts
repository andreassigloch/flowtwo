/**
 * Response Parser - Unit Tests
 *
 * Test Category: Unit (70% of test pyramid)
 * Purpose: Validate LLM response parsing (extract operations)
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { describe, it, expect } from 'vitest';
import { ResponseParser } from '../../../src/llm-engine/response-parser.js';

describe('ResponseParser', () => {
  describe('parseResponse', () => {
    it('should extract operations from response', () => {
      const response = `I've added a payment function to your system.

<operations>
<base_snapshot>TestSystem.SY.001@v1</base_snapshot>

## Nodes
+ ProcessPayment|FUNC|ProcessPayment.FN.001|Process customer payment

## Edges
+ OrderProcessing.FC.001 -cp-> ProcessPayment.FN.001
</operations>

The function is now part of the OrderProcessing chain.`;

      const parser = new ResponseParser();
      const result = parser.parseResponse(response);

      expect(result.textResponse).toBe(
        "I've added a payment function to your system.\n\nThe function is now part of the OrderProcessing chain."
      );
      expect(result.operations).toContain('<operations>');
      expect(result.operations).toContain('ProcessPayment|FUNC|ProcessPayment.FN.001');
    });

    it('should handle response without operations', () => {
      const response = 'I can help you with that. What would you like to add?';

      const parser = new ResponseParser();
      const result = parser.parseResponse(response);

      expect(result.textResponse).toBe(response);
      expect(result.operations).toBeNull();
    });

    it('should handle multiple operations blocks (use first)', () => {
      const response = `Here's the first change:

<operations>
<base_snapshot>Test.SY.001@v1</base_snapshot>
## Nodes
+ Node1|FUNC|Node1.FN.001|First node
</operations>

And here's another:

<operations>
<base_snapshot>Test.SY.001@v2</base_snapshot>
## Nodes
+ Node2|FUNC|Node2.FN.002|Second node
</operations>`;

      const parser = new ResponseParser();
      const result = parser.parseResponse(response);

      // Should use first operations block
      expect(result.operations).toContain('Node1.FN.001');
      expect(result.textResponse).not.toContain('<operations>');
    });

    it('should strip operations from text response', () => {
      const response = `Text before

<operations>
Operations here
</operations>

Text after`;

      const parser = new ResponseParser();
      const result = parser.parseResponse(response);

      expect(result.textResponse).toBe('Text before\n\nText after');
      expect(result.textResponse).not.toContain('<operations>');
    });

    it('should handle operations at start of response', () => {
      const response = `<operations>
<base_snapshot>Test.SY.001@v1</base_snapshot>
## Nodes
+ Node|FUNC|Node.FN.001|Test
</operations>

I've added the node.`;

      const parser = new ResponseParser();
      const result = parser.parseResponse(response);

      expect(result.textResponse).toBe("I've added the node.");
      expect(result.operations).toContain('Node.FN.001');
    });

    it('should handle operations at end of response', () => {
      const response = `I've added the node.

<operations>
<base_snapshot>Test.SY.001@v1</base_snapshot>
## Nodes
+ Node|FUNC|Node.FN.001|Test
</operations>`;

      const parser = new ResponseParser();
      const result = parser.parseResponse(response);

      expect(result.textResponse).toBe("I've added the node.");
      expect(result.operations).toContain('Node.FN.001');
    });

    it('should preserve newlines in text response', () => {
      const response = `Line 1

Line 2

Line 3`;

      const parser = new ResponseParser();
      const result = parser.parseResponse(response);

      expect(result.textResponse).toBe('Line 1\n\nLine 2\n\nLine 3');
    });

    it('should handle empty response', () => {
      const parser = new ResponseParser();
      const result = parser.parseResponse('');

      expect(result.textResponse).toBe('');
      expect(result.operations).toBeNull();
    });

    it('should handle malformed operations block (no closing tag)', () => {
      const response = `Text

<operations>
Invalid XML here
No closing tag`;

      const parser = new ResponseParser();
      const result = parser.parseResponse(response);

      // Should NOT extract (malformed - missing closing tag)
      expect(result.operations).toBeNull();
      expect(result.textResponse).toContain('Text');
    });
  });

  describe('extractOperationsBlock', () => {
    it('should extract operations block with correct boundaries', () => {
      const text = `Before <operations>ops</operations> After`;

      const parser = new ResponseParser();
      const ops = parser.extractOperationsBlock(text);

      expect(ops).toBe('<operations>ops</operations>');
    });

    it('should return null if no operations block', () => {
      const text = 'No operations here';

      const parser = new ResponseParser();
      const ops = parser.extractOperationsBlock(text);

      expect(ops).toBeNull();
    });

    it('should handle case-insensitive tags', () => {
      const text = '<OPERATIONS>test</OPERATIONS>';

      const parser = new ResponseParser();
      const ops = parser.extractOperationsBlock(text);

      expect(ops).toBe('<OPERATIONS>test</OPERATIONS>');
    });
  });
});
