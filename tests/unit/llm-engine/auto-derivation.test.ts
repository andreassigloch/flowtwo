/**
 * Architecture Derivation Agent - Unit Tests
 *
 * Test Category: Unit (70% of test pyramid)
 * Purpose: Validate UC → FUNC derivation logic following SE principles
 *
 * @author andreas@siglochconsulting
 * @version 2.0.0
 */

import { describe, it, expect } from 'vitest';
import {
  ArchitectureDerivationAgent,
  ArchitectureDerivationRequest,
  getUCtoFuncDerivationRule,
} from '../../../src/llm-engine/auto-derivation.js';

describe('ArchitectureDerivationAgent', () => {
  const agent = new ArchitectureDerivationAgent();

  describe('buildArchitecturePrompt', () => {
    it('should include ALL Use Cases in prompt', () => {
      const request: ArchitectureDerivationRequest = {
        useCases: [
          { semanticId: 'UC1.UC.001', name: 'UserAuth', description: 'User authentication' },
          { semanticId: 'UC2.UC.001', name: 'OrderProcess', description: 'Order processing' },
          { semanticId: 'UC3.UC.001', name: 'Payment', description: 'Payment handling' },
        ],
        actors: [
          { semanticId: 'User.AC.001', name: 'User', description: 'End user' },
        ],
        existingFunctions: [],
        existingFChains: [],
        canvasState: '## Nodes\n+ System|SYS|System.SY.001|Test system',
        systemId: 'System.SY.001',
      };

      const prompt = agent.buildArchitecturePrompt(request);

      // Should include ALL UCs
      expect(prompt).toContain('UserAuth');
      expect(prompt).toContain('UC1.UC.001');
      expect(prompt).toContain('OrderProcess');
      expect(prompt).toContain('UC2.UC.001');
      expect(prompt).toContain('Payment');
      expect(prompt).toContain('UC3.UC.001');
      expect(prompt).toContain('All Use Cases');
    });

    it('should include SE principles in prompt', () => {
      const request: ArchitectureDerivationRequest = {
        useCases: [{ semanticId: 'Test.UC.001', name: 'TestUC', description: 'Test' }],
        actors: [],
        existingFunctions: [],
        existingFChains: [],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildArchitecturePrompt(request);

      expect(prompt).toContain('Observable');
      expect(prompt).toContain('Verifiable');
      expect(prompt).toContain('interface boundary');
      expect(prompt).toContain('Decompose');
      expect(prompt).toContain('SE Compliance');
    });

    it('should include existing functions for compliance check', () => {
      const request: ArchitectureDerivationRequest = {
        useCases: [{ semanticId: 'Test.UC.001', name: 'TestUC', description: 'Test' }],
        actors: [],
        existingFunctions: [
          { semanticId: 'Func1.FN.001', name: 'ProcessData', description: 'Processes data', parentId: 'Chain.FC.001' },
          { semanticId: 'Func2.FN.001', name: 'ValidateInput', description: 'Validates input' },
        ],
        existingFChains: [
          { semanticId: 'Chain.FC.001', name: 'DataChain', parentUC: 'Test.UC.001' },
        ],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildArchitecturePrompt(request);

      expect(prompt).toContain('ProcessData');
      expect(prompt).toContain('Func1.FN.001');
      expect(prompt).toContain('in Chain.FC.001');
      expect(prompt).toContain('ValidateInput');
      expect(prompt).toContain('CHECK SE COMPLIANCE');
    });

    it('should handle empty Use Cases', () => {
      const request: ArchitectureDerivationRequest = {
        useCases: [],
        actors: [],
        existingFunctions: [],
        existingFChains: [],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildArchitecturePrompt(request);

      expect(prompt).toContain('No Use Cases defined yet');
    });

    it('should include Format E output instructions', () => {
      const request: ArchitectureDerivationRequest = {
        useCases: [{ semanticId: 'Test.UC.001', name: 'TestUC', description: 'Test' }],
        actors: [],
        existingFunctions: [],
        existingFChains: [],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildArchitecturePrompt(request);

      expect(prompt).toContain('<operations>');
      expect(prompt).toContain('Format E Diff');
      expect(prompt).toContain('FCHAIN');
      expect(prompt).toContain('FUNC');
      expect(prompt).toContain('FLOW');
      expect(prompt).toContain('-cp->');
      expect(prompt).toContain('-io->');
      // Should NOT have custom derivation format
      expect(prompt).not.toContain('<derivation>');
    });

    it('should include all actors', () => {
      const request: ArchitectureDerivationRequest = {
        useCases: [{ semanticId: 'Test.UC.001', name: 'TestUC', description: 'Test' }],
        actors: [
          { semanticId: 'Admin.AC.001', name: 'Admin', description: 'System administrator' },
          { semanticId: 'Customer.AC.001', name: 'Customer', description: 'End customer' },
        ],
        existingFunctions: [],
        existingFChains: [],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildArchitecturePrompt(request);

      expect(prompt).toContain('Admin');
      expect(prompt).toContain('Admin.AC.001');
      expect(prompt).toContain('Customer');
      expect(prompt).toContain('Customer.AC.001');
    });

    it('should include system ID for base_snapshot', () => {
      const request: ArchitectureDerivationRequest = {
        useCases: [{ semanticId: 'Test.UC.001', name: 'TestUC', description: 'Test' }],
        actors: [],
        existingFunctions: [],
        existingFChains: [],
        canvasState: '',
        systemId: 'MySystem.SY.001',
      };

      const prompt = agent.buildArchitecturePrompt(request);

      expect(prompt).toContain('MySystem.SY.001');
      expect(prompt).toContain('<base_snapshot>MySystem.SY.001</base_snapshot>');
    });
  });

  describe('extractOperations', () => {
    it('should extract operations block from response', () => {
      const response = `Analyzing the Use Cases...

Here's my analysis of the architecture.

<operations>
<base_snapshot>System.SY.001</base_snapshot>

## Nodes
+ AuthChain|FCHAIN|AuthChain.FC.001|Authentication chain
+ ValidateUser|FUNC|ValidateUser.FN.001|Validates user credentials

## Edges
+ UserAuth.UC.001 -cp-> AuthChain.FC.001
+ AuthChain.FC.001 -cp-> ValidateUser.FN.001
</operations>

Architecture derived successfully.`;

      const operations = agent.extractOperations(response);

      expect(operations).not.toBeNull();
      expect(operations).toContain('AuthChain.FC.001');
      expect(operations).toContain('ValidateUser.FN.001');
      expect(operations).toContain('-cp->');
    });

    it('should return null when no operations block', () => {
      const response = `I analyzed the system but no changes are needed.
The architecture is already SE-compliant.`;

      const operations = agent.extractOperations(response);

      expect(operations).toBeNull();
    });

    it('should handle multiple operations blocks (use first)', () => {
      const response = `<operations>
## First block
+ Node1|FUNC|Node1.FN.001|First
</operations>

Some text

<operations>
## Second block
+ Node2|FUNC|Node2.FN.001|Second
</operations>`;

      const operations = agent.extractOperations(response);

      expect(operations).toContain('Node1.FN.001');
      // First match wins
    });
  });

  describe('extractAnalysisText', () => {
    it('should extract text outside operations block', () => {
      const response = `This is my analysis.

<operations>
## Nodes
+ Test|FUNC|Test.FN.001|Test
</operations>

And this is my conclusion.`;

      const text = agent.extractAnalysisText(response);

      expect(text).toContain('This is my analysis');
      expect(text).toContain('And this is my conclusion');
      expect(text).not.toContain('<operations>');
      expect(text).not.toContain('Test.FN.001');
    });

    it('should return full text when no operations', () => {
      const response = 'No changes needed. Architecture is compliant.';

      const text = agent.extractAnalysisText(response);

      expect(text).toBe('No changes needed. Architecture is compliant.');
    });
  });
});

describe('getUCtoFuncDerivationRule', () => {
  it('should return correct derivation rule', () => {
    const rule = getUCtoFuncDerivationRule();

    expect(rule.sourceType).toBe('UC');
    expect(rule.targetTypes).toContain('FCHAIN');
    expect(rule.targetTypes).toContain('FUNC');
    expect(rule.targetTypes).toContain('FLOW');
    expect(rule.strategy).toBe('decompose');
  });
});
