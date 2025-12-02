/**
 * Auto-Derivation Engine - Unit Tests
 *
 * Test Category: Unit (70% of test pyramid)
 * Purpose: Validate all derivation agents following SE principles
 * - UC → FUNC (Architecture derivation)
 * - REQ → TEST (Verification derivation)
 * - FUNC → FLOW (Interface derivation)
 * - FUNC → MOD (Allocation derivation)
 *
 * @author andreas@siglochconsulting
 * @version 3.0.0 - CR-005 complete derivation support
 */

import { describe, it, expect } from 'vitest';
import {
  ArchitectureDerivationAgent,
  ArchitectureDerivationRequest,
  getUCtoFuncDerivationRule,
  ReqToTestDerivationAgent,
  ReqToTestDerivationRequest,
  getReqToTestDerivationRule,
  FuncToFlowDerivationAgent,
  FuncToFlowDerivationRequest,
  getFuncToFlowDerivationRule,
  FuncToModDerivationAgent,
  FuncToModDerivationRequest,
  getFuncToModDerivationRule,
  getAllDerivationRules,
  getDerivationRule,
  DerivationType,
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

// ============================================================================
// REQ → TEST Derivation Agent Tests
// ============================================================================

describe('ReqToTestDerivationAgent', () => {
  const agent = new ReqToTestDerivationAgent();

  describe('buildTestDerivationPrompt', () => {
    it('should include all requirements in prompt', () => {
      const request: ReqToTestDerivationRequest = {
        requirements: [
          { semanticId: 'ValidEmail.RQ.001', name: 'ValidEmail', description: 'System shall validate email format', type: 'functional' },
          { semanticId: 'ResponseTime.RQ.002', name: 'ResponseTime', description: 'Response time < 200ms', type: 'non-functional' },
        ],
        existingTests: [],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildTestDerivationPrompt(request);

      expect(prompt).toContain('ValidEmail');
      expect(prompt).toContain('ValidEmail.RQ.001');
      expect(prompt).toContain('[functional]');
      expect(prompt).toContain('ResponseTime');
      expect(prompt).toContain('[non-functional]');
    });

    it('should include acceptance criteria', () => {
      const request: ReqToTestDerivationRequest = {
        requirements: [
          {
            semanticId: 'EmailFormat.RQ.001',
            name: 'EmailFormat',
            description: 'Validate email',
            acceptanceCriteria: ['Contains @ symbol', 'Has domain part'],
          },
        ],
        existingTests: [],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildTestDerivationPrompt(request);

      expect(prompt).toContain('Contains @ symbol');
      expect(prompt).toContain('Has domain part');
    });

    it('should include existing tests to avoid duplicates', () => {
      const request: ReqToTestDerivationRequest = {
        requirements: [{ semanticId: 'Req.RQ.001', name: 'Req', description: 'Requirement' }],
        existingTests: [
          { semanticId: 'TestEmail.TC.001', name: 'TestEmail', verifies: 'EmailFormat.RQ.001' },
        ],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildTestDerivationPrompt(request);

      expect(prompt).toContain('TestEmail');
      expect(prompt).toContain('verifies EmailFormat.RQ.001');
      expect(prompt).toContain('avoid duplicates');
    });

    it('should include verification principles', () => {
      const request: ReqToTestDerivationRequest = {
        requirements: [{ semanticId: 'Req.RQ.001', name: 'Req', description: 'Test' }],
        existingTests: [],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildTestDerivationPrompt(request);

      expect(prompt).toContain('Verification Engineer');
      expect(prompt).toContain('INCOSE');
      expect(prompt).toContain('Positive tests');
      expect(prompt).toContain('Negative tests');
      expect(prompt).toContain('Boundary tests');
      expect(prompt).toContain('verify edge');
    });

    it('should include Format E output instructions', () => {
      const request: ReqToTestDerivationRequest = {
        requirements: [{ semanticId: 'Req.RQ.001', name: 'Req', description: 'Test' }],
        existingTests: [],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildTestDerivationPrompt(request);

      expect(prompt).toContain('<operations>');
      expect(prompt).toContain('Format E Diff');
      expect(prompt).toContain('TEST');
      expect(prompt).toContain('-ver->');
    });

    it('should handle empty requirements', () => {
      const request: ReqToTestDerivationRequest = {
        requirements: [],
        existingTests: [],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildTestDerivationPrompt(request);

      expect(prompt).toContain('No requirements to derive tests from');
    });
  });

  describe('extractOperations', () => {
    it('should extract operations block from response', () => {
      const response = `Test analysis...

<operations>
<base_snapshot>Test.SY.001</base_snapshot>

## Nodes
+ TestEmailValid|TEST|TestEmailValid.TC.001|Verify valid email accepted

## Edges
+ ValidEmail.RQ.001 -ver-> TestEmailValid.TC.001
</operations>`;

      const operations = agent.extractOperations(response);

      expect(operations).not.toBeNull();
      expect(operations).toContain('TestEmailValid.TC.001');
      expect(operations).toContain('-ver->');
    });

    it('should return null when no operations block', () => {
      const response = 'All requirements already have tests.';
      const operations = agent.extractOperations(response);
      expect(operations).toBeNull();
    });
  });
});

describe('getReqToTestDerivationRule', () => {
  it('should return correct derivation rule', () => {
    const rule = getReqToTestDerivationRule();

    expect(rule.sourceType).toBe('REQ');
    expect(rule.targetTypes).toContain('TEST');
    expect(rule.strategy).toBe('verify');
  });
});

// ============================================================================
// FUNC → FLOW Derivation Agent Tests
// ============================================================================

describe('FuncToFlowDerivationAgent', () => {
  const agent = new FuncToFlowDerivationAgent();

  describe('buildFlowDerivationPrompt', () => {
    it('should include functions with I/O status', () => {
      const request: FuncToFlowDerivationRequest = {
        functions: [
          { semanticId: 'Process.FN.001', name: 'ProcessData', description: 'Processes data', hasInputFlow: true, hasOutputFlow: false },
          { semanticId: 'Validate.FN.002', name: 'ValidateInput', description: 'Validates input', hasInputFlow: false, hasOutputFlow: false },
        ],
        existingFlows: [],
        existingSchemas: [],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildFlowDerivationPrompt(request);

      expect(prompt).toContain('ProcessData');
      expect(prompt).toContain('[MISSING OUTPUT]');
      expect(prompt).toContain('ValidateInput');
      expect(prompt).toContain('[MISSING INPUT, MISSING OUTPUT]');
    });

    it('should show OK status for functions with complete I/O', () => {
      const request: FuncToFlowDerivationRequest = {
        functions: [
          { semanticId: 'Complete.FN.001', name: 'CompleteFunc', description: 'Has both', hasInputFlow: true, hasOutputFlow: true },
        ],
        existingFlows: [],
        existingSchemas: [],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildFlowDerivationPrompt(request);

      expect(prompt).toContain('[OK]');
    });

    it('should include existing flows', () => {
      const request: FuncToFlowDerivationRequest = {
        functions: [{ semanticId: 'Func.FN.001', name: 'Func', description: 'Function' }],
        existingFlows: [
          { semanticId: 'DataFlow.FL.001', name: 'DataFlow', connectedTo: ['Func.FN.001'] },
        ],
        existingSchemas: [],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildFlowDerivationPrompt(request);

      expect(prompt).toContain('DataFlow');
      expect(prompt).toContain('Func.FN.001');
    });

    it('should include existing schemas for relations', () => {
      const request: FuncToFlowDerivationRequest = {
        functions: [{ semanticId: 'Func.FN.001', name: 'Func', description: 'Function' }],
        existingFlows: [],
        existingSchemas: [
          { semanticId: 'OrderSchema.SC.001', name: 'OrderSchema', category: 'data' },
          { semanticId: 'JsonProtocol.SC.002', name: 'JsonProtocol', category: 'protocol' },
        ],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildFlowDerivationPrompt(request);

      expect(prompt).toContain('OrderSchema');
      expect(prompt).toContain('[data]');
      expect(prompt).toContain('JsonProtocol');
      expect(prompt).toContain('[protocol]');
    });

    it('should include 3-layer interface model', () => {
      const request: FuncToFlowDerivationRequest = {
        functions: [{ semanticId: 'Func.FN.001', name: 'Func', description: 'Function' }],
        existingFlows: [],
        existingSchemas: [],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildFlowDerivationPrompt(request);

      expect(prompt).toContain('3-Layer Interface Model');
      expect(prompt).toContain('Layer 1');
      expect(prompt).toContain('Layer 2');
      expect(prompt).toContain('Layer 3');
      expect(prompt).toContain('FLOW→SCHEMA');
    });

    it('should include Format E output with io and rel edges', () => {
      const request: FuncToFlowDerivationRequest = {
        functions: [{ semanticId: 'Func.FN.001', name: 'Func', description: 'Function' }],
        existingFlows: [],
        existingSchemas: [],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildFlowDerivationPrompt(request);

      expect(prompt).toContain('<operations>');
      expect(prompt).toContain('-io->');
      expect(prompt).toContain('-rel->');
      expect(prompt).toContain('FLOW');
      expect(prompt).toContain('SCHEMA');
    });
  });

  describe('extractOperations', () => {
    it('should extract operations block', () => {
      const response = `<operations>
## Nodes
+ InputData|FLOW|InputData.FL.001|Input data

## Edges
+ InputData.FL.001 -io-> Process.FN.001
</operations>`;

      const operations = agent.extractOperations(response);

      expect(operations).not.toBeNull();
      expect(operations).toContain('InputData.FL.001');
    });
  });
});

describe('getFuncToFlowDerivationRule', () => {
  it('should return correct derivation rule', () => {
    const rule = getFuncToFlowDerivationRule();

    expect(rule.sourceType).toBe('FUNC');
    expect(rule.targetTypes).toContain('FLOW');
    expect(rule.targetTypes).toContain('SCHEMA');
    expect(rule.strategy).toBe('decompose');
  });
});

// ============================================================================
// FUNC → MOD Derivation Agent Tests
// ============================================================================

describe('FuncToModDerivationAgent', () => {
  const agent = new FuncToModDerivationAgent();

  describe('buildAllocationPrompt', () => {
    it('should include functions with allocation status', () => {
      const request: FuncToModDerivationRequest = {
        functions: [
          { semanticId: 'Process.FN.001', name: 'ProcessOrder', description: 'Processes orders', allocatedTo: 'OrderModule.MD.001' },
          { semanticId: 'Validate.FN.002', name: 'ValidateOrder', description: 'Validates orders' },
        ],
        existingModules: [
          { semanticId: 'OrderModule.MD.001', name: 'OrderModule', description: 'Order processing', allocatedFuncs: ['Process.FN.001'] },
        ],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildAllocationPrompt(request);

      expect(prompt).toContain('ProcessOrder');
      expect(prompt).toContain('→ OrderModule.MD.001');
      expect(prompt).toContain('ValidateOrder');
      expect(prompt).toContain('[UNALLOCATED]');
    });

    it('should include volatility information', () => {
      const request: FuncToModDerivationRequest = {
        functions: [
          { semanticId: 'LLM.FN.001', name: 'LLMIntegration', description: 'AI integration', volatility: 'high' },
          { semanticId: 'Core.FN.002', name: 'CoreLogic', description: 'Core business', volatility: 'low' },
        ],
        existingModules: [],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildAllocationPrompt(request);

      expect(prompt).toContain('[volatility: high]');
      expect(prompt).toContain('[volatility: low]');
      expect(prompt).toContain('High-volatility functions:** 1');
    });

    it('should include connected functions for cohesion analysis', () => {
      const request: FuncToModDerivationRequest = {
        functions: [
          { semanticId: 'A.FN.001', name: 'FuncA', description: 'A', connectedFuncs: ['B.FN.001', 'C.FN.001'] },
        ],
        existingModules: [],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildAllocationPrompt(request);

      expect(prompt).toContain('connects: B.FN.001, C.FN.001');
    });

    it('should include existing modules with allocated functions', () => {
      const request: FuncToModDerivationRequest = {
        functions: [{ semanticId: 'Func.FN.001', name: 'Func', description: 'Function' }],
        existingModules: [
          {
            semanticId: 'UserModule.MD.001',
            name: 'UserModule',
            description: 'User management',
            allocatedFuncs: ['AuthUser.FN.001', 'CreateUser.FN.002'],
          },
        ],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildAllocationPrompt(request);

      expect(prompt).toContain('UserModule');
      expect(prompt).toContain('contains: AuthUser.FN.001, CreateUser.FN.002');
    });

    it('should include allocation principles', () => {
      const request: FuncToModDerivationRequest = {
        functions: [{ semanticId: 'Func.FN.001', name: 'Func', description: 'Function' }],
        existingModules: [],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildAllocationPrompt(request);

      expect(prompt).toContain('Cohesion');
      expect(prompt).toContain('Coupling');
      expect(prompt).toContain('Volatility Isolation');
      expect(prompt).toContain("Miller's Law");
      expect(prompt).toContain('5-9');
    });

    it('should include Format E output with allocate edges', () => {
      const request: FuncToModDerivationRequest = {
        functions: [{ semanticId: 'Func.FN.001', name: 'Func', description: 'Function' }],
        existingModules: [],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildAllocationPrompt(request);

      expect(prompt).toContain('<operations>');
      expect(prompt).toContain('MOD');
      expect(prompt).toContain('-all->');
      expect(prompt).toContain('-cp->');
    });

    it('should count unallocated functions', () => {
      const request: FuncToModDerivationRequest = {
        functions: [
          { semanticId: 'A.FN.001', name: 'A', description: 'A' },
          { semanticId: 'B.FN.002', name: 'B', description: 'B' },
          { semanticId: 'C.FN.003', name: 'C', description: 'C', allocatedTo: 'Mod.MD.001' },
        ],
        existingModules: [],
        canvasState: '',
        systemId: 'Test.SY.001',
      };

      const prompt = agent.buildAllocationPrompt(request);

      expect(prompt).toContain('Unallocated functions:** 2');
    });
  });

  describe('extractOperations', () => {
    it('should extract operations block', () => {
      const response = `<operations>
## Nodes
+ OrderModule|MOD|OrderModule.MD.001|Order processing

## Edges
+ System.SY.001 -cp-> OrderModule.MD.001
+ OrderModule.MD.001 -all-> ProcessOrder.FN.001
</operations>`;

      const operations = agent.extractOperations(response);

      expect(operations).not.toBeNull();
      expect(operations).toContain('OrderModule.MD.001');
      expect(operations).toContain('-all->');
    });
  });
});

describe('getFuncToModDerivationRule', () => {
  it('should return correct derivation rule', () => {
    const rule = getFuncToModDerivationRule();

    expect(rule.sourceType).toBe('FUNC');
    expect(rule.targetTypes).toContain('MOD');
    expect(rule.strategy).toBe('allocate');
  });
});

// ============================================================================
// Unified Derivation Controller Tests
// ============================================================================

describe('getAllDerivationRules', () => {
  it('should return all 4 derivation rules', () => {
    const rules = getAllDerivationRules();

    expect(rules).toHaveLength(4);
    expect(rules.map(r => r.sourceType)).toContain('UC');
    expect(rules.map(r => r.sourceType)).toContain('REQ');
    expect(rules.map(r => r.sourceType).filter(t => t === 'FUNC')).toHaveLength(2);
  });

  it('should cover all strategies', () => {
    const rules = getAllDerivationRules();
    const strategies = rules.map(r => r.strategy);

    expect(strategies).toContain('decompose');
    expect(strategies).toContain('verify');
    expect(strategies).toContain('allocate');
  });
});

describe('getDerivationRule', () => {
  it('should return correct rule for uc-to-func', () => {
    const rule = getDerivationRule('uc-to-func');
    expect(rule.sourceType).toBe('UC');
    expect(rule.strategy).toBe('decompose');
  });

  it('should return correct rule for req-to-test', () => {
    const rule = getDerivationRule('req-to-test');
    expect(rule.sourceType).toBe('REQ');
    expect(rule.strategy).toBe('verify');
  });

  it('should return correct rule for func-to-flow', () => {
    const rule = getDerivationRule('func-to-flow');
    expect(rule.sourceType).toBe('FUNC');
    expect(rule.targetTypes).toContain('FLOW');
  });

  it('should return correct rule for func-to-mod', () => {
    const rule = getDerivationRule('func-to-mod');
    expect(rule.sourceType).toBe('FUNC');
    expect(rule.targetTypes).toContain('MOD');
    expect(rule.strategy).toBe('allocate');
  });
});
