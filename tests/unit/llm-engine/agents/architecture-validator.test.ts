/**
 * Architecture Validator Unit Tests
 *
 * Tests for architecture validation against INCOSE/SysML 2.0 rules.
 *
 * CR-024: Multi-Agent Architecture System
 *
 * @author andreas@siglochconsulting
 */

import { describe, it, expect } from 'vitest';
import { ArchitectureValidator } from '../../../../src/llm-engine/agents/architecture-validator.js';

describe('ArchitectureValidator', () => {
  const validator = new ArchitectureValidator();

  describe('validateFormatE', () => {
    describe('V1: No format as FUNC', () => {
      it('should detect FormatESerialization as FUNC', () => {
        const formatE = `
## Nodes
+ System|SYS|System.SY.001|Test system
+ FormatESerialization|FUNC|FormatESerialization.FN.001|Serializes to Format E

## Edges
+ System.SY.001 -cp-> FormatESerialization.FN.001
`;

        const errors = validator.validateFormatE(formatE);
        const v1Errors = errors.filter((e) => e.code === 'V1');

        expect(v1Errors.length).toBe(1);
        expect(v1Errors[0].semanticId).toBe('FormatESerialization.FN.001');
        expect(v1Errors[0].severity).toBe('error');
      });

      it('should detect Protocol as FUNC', () => {
        const formatE = `
## Nodes
+ WebSocketProtocol|FUNC|WebSocketProtocol.FN.001|Protocol definition

## Edges
`;

        const errors = validator.validateFormatE(formatE);
        const v1Errors = errors.filter((e) => e.code === 'V1');

        expect(v1Errors.length).toBe(1);
        expect(v1Errors[0].suggestion).toContain('SCHEMA');
      });

      it('should accept valid FUNC names', () => {
        const formatE = `
## Nodes
+ ProcessPayment|FUNC|ProcessPayment.FN.001|Processes payment

## Edges
`;

        const errors = validator.validateFormatE(formatE);
        const v1Errors = errors.filter((e) => e.code === 'V1');

        expect(v1Errors.length).toBe(0);
      });
    });

    describe('V2: FLOW has SCHEMA relation', () => {
      it('should detect FLOW without SCHEMA relation', () => {
        const formatE = `
## Nodes
+ PaymentData|FLOW|PaymentData.FL.001|Payment information

## Edges
`;

        const errors = validator.validateFormatE(formatE);
        const v2Errors = errors.filter((e) => e.code === 'V2');

        expect(v2Errors.length).toBe(1);
        expect(v2Errors[0].severity).toBe('warning');
      });

      it('should accept FLOW with SCHEMA relation', () => {
        const formatE = `
## Nodes
+ PaymentData|FLOW|PaymentData.FL.001|Payment information
+ PaymentSchema|SCHEMA|PaymentSchema.SC.001|Payment data structure

## Edges
+ PaymentData.FL.001 -rel-> PaymentSchema.SC.001
`;

        const errors = validator.validateFormatE(formatE);
        const v2Errors = errors.filter((e) => e.code === 'V2');

        expect(v2Errors.length).toBe(0);
      });
    });

    describe('V3: No infrastructure as FUNC', () => {
      it('should detect WebSocket as FUNC', () => {
        const formatE = `
## Nodes
+ WebSocketHandler|FUNC|WebSocketHandler.FN.001|Handles WebSocket

## Edges
`;

        const errors = validator.validateFormatE(formatE);
        const v3Errors = errors.filter((e) => e.code === 'V3');

        expect(v3Errors.length).toBe(1);
        expect(v3Errors[0].severity).toBe('error');
      });

      it('should detect HTTP as FUNC', () => {
        const formatE = `
## Nodes
+ HTTPEndpoint|FUNC|HTTPEndpoint.FN.001|HTTP endpoint

## Edges
`;

        const errors = validator.validateFormatE(formatE);
        const v3Errors = errors.filter((e) => e.code === 'V3');

        expect(v3Errors.length).toBe(1);
      });
    });

    describe('V4: Miller\'s Law', () => {
      it('should warn when too few top-level FUNCs', () => {
        const formatE = `
## Nodes
+ System|SYS|System.SY.001|Test system
+ Func1|FUNC|Func1.FN.001|Function 1
+ Func2|FUNC|Func2.FN.002|Function 2

## Edges
+ System.SY.001 -cp-> Func1.FN.001
+ System.SY.001 -cp-> Func2.FN.002
`;

        const errors = validator.validateFormatE(formatE);
        const v4Errors = errors.filter((e) => e.code === 'V4');

        expect(v4Errors.length).toBe(1);
        expect(v4Errors[0].issue).toContain('2');
        expect(v4Errors[0].severity).toBe('warning');
      });

      it('should warn when too many top-level FUNCs', () => {
        let nodes = '+ System|SYS|System.SY.001|Test system\n';
        let edges = '';
        for (let i = 1; i <= 12; i++) {
          nodes += `+ Func${i}|FUNC|Func${i}.FN.${String(i).padStart(3, '0')}|Function ${i}\n`;
          edges += `+ System.SY.001 -cp-> Func${i}.FN.${String(i).padStart(3, '0')}\n`;
        }

        const formatE = `## Nodes\n${nodes}\n## Edges\n${edges}`;
        const errors = validator.validateFormatE(formatE);
        const v4Errors = errors.filter((e) => e.code === 'V4');

        expect(v4Errors.length).toBe(1);
        expect(v4Errors[0].issue).toContain('12');
      });

      it('should accept 5-9 top-level FUNCs', () => {
        let nodes = '+ System|SYS|System.SY.001|Test system\n';
        let edges = '';
        for (let i = 1; i <= 7; i++) {
          nodes += `+ Func${i}|FUNC|Func${i}.FN.${String(i).padStart(3, '0')}|Function ${i}\n`;
          edges += `+ System.SY.001 -cp-> Func${i}.FN.${String(i).padStart(3, '0')}\n`;
        }

        const formatE = `## Nodes\n${nodes}\n## Edges\n${edges}`;
        const errors = validator.validateFormatE(formatE);
        const v4Errors = errors.filter((e) => e.code === 'V4');

        expect(v4Errors.length).toBe(0);
      });
    });

    describe('V6: Redundant SCHEMAs', () => {
      it('should detect potentially redundant schemas', () => {
        const formatE = `
## Nodes
+ OrderSchema|SCHEMA|OrderSchema.SC.001|Order structure
+ OrderTypes|SCHEMA|OrderTypes.SC.002|Order types

## Edges
`;

        const errors = validator.validateFormatE(formatE);
        const v6Errors = errors.filter((e) => e.code === 'V6');

        expect(v6Errors.length).toBe(1);
        expect(v6Errors[0].severity).toBe('info');
      });
    });

    describe('V7: Orphan SCHEMAs', () => {
      it('should detect schema without references', () => {
        const formatE = `
## Nodes
+ UnusedSchema|SCHEMA|UnusedSchema.SC.001|Not used anywhere

## Edges
`;

        const errors = validator.validateFormatE(formatE);
        const v7Errors = errors.filter((e) => e.code === 'V7');

        expect(v7Errors.length).toBe(1);
        expect(v7Errors[0].semanticId).toBe('UnusedSchema.SC.001');
      });

      it('should accept schema with FLOW reference', () => {
        const formatE = `
## Nodes
+ DataFlow|FLOW|DataFlow.FL.001|Data flow
+ UsedSchema|SCHEMA|UsedSchema.SC.001|Used by flow

## Edges
+ DataFlow.FL.001 -rel-> UsedSchema.SC.001
`;

        const errors = validator.validateFormatE(formatE);
        const v7Errors = errors.filter((e) => e.code === 'V7');

        expect(v7Errors.length).toBe(0);
      });
    });

    describe('V8: Schema variance', () => {
      it('should warn when too many schemas in same domain', () => {
        const formatE = `
## Nodes
+ Order|SCHEMA|Order.SC.001|Schema 1
+ OrderDetails|SCHEMA|OrderDetails.SC.002|Schema 2
+ OrderItems|SCHEMA|OrderItems.SC.003|Schema 3
+ OrderSummary|SCHEMA|OrderSummary.SC.004|Schema 4

## Edges
`;

        const errors = validator.validateFormatE(formatE);
        const v8Errors = errors.filter((e) => e.code === 'V8');

        expect(v8Errors.length).toBe(1);
        expect(v8Errors[0].issue).toContain('4');
      });
    });

    describe('V10: No nested SYS (subsystems)', () => {
      it('should error when SYS is composed into another SYS', () => {
        const formatE = `
## Nodes
+ DroneDefense|SYS|DroneDefense.SY.001|Main system
+ SensorSubsystem|SYS|SensorSubsystem.SY.002|Subsystem

## Edges
+ DroneDefense.SY.001 -cp-> SensorSubsystem.SY.002
`;

        const errors = validator.validateFormatE(formatE);
        const v10Errors = errors.filter((e) => e.code === 'V10');

        expect(v10Errors.length).toBeGreaterThan(0);
        expect(v10Errors[0].semanticId).toBe('SensorSubsystem.SY.002');
        expect(v10Errors[0].suggestion).toContain('FUNC');
      });

      it('should error when SYS has Subsystem in name', () => {
        const formatE = `
## Nodes
+ TrackingSubsystem|SYS|TrackingSubsystem.SY.001|Tracking

## Edges
`;

        const errors = validator.validateFormatE(formatE);
        const v10Errors = errors.filter((e) => e.code === 'V10');

        expect(v10Errors.length).toBe(1);
        expect(v10Errors[0].issue).toContain('FUNC');
      });

      it('should accept top-level SYS without subsystem pattern', () => {
        const formatE = `
## Nodes
+ DroneDefenseSystem|SYS|DroneDefenseSystem.SY.001|Main system

## Edges
`;

        const errors = validator.validateFormatE(formatE);
        const v10Errors = errors.filter((e) => e.code === 'V10');

        expect(v10Errors.length).toBe(0);
      });
    });
  });

  describe('generateCorrections', () => {
    it('should generate correction for V1 error', () => {
      const formatE = `
## Nodes
+ FormatESerialization|FUNC|FormatESerialization.FN.001|Format

## Edges
`;

      const errors = validator.validateFormatE(formatE);
      const corrections = validator.generateCorrections(errors);

      expect(corrections.length).toBeGreaterThan(0);
      expect(corrections[0].currentType).toBe('FUNC');
      expect(corrections[0].proposedType).toBe('SCHEMA');
      expect(corrections[0].operations).toContain('-');
      expect(corrections[0].operations).toContain('+');
    });
  });

  describe('classifyNewNode', () => {
    it('should classify with reasoning', () => {
      const result = validator.classifyNewNode(
        'ProcessOrder',
        'Processes customer order',
        { isTopLevel: true }
      );

      expect(result.type).toBe('FUNC');
      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.reasoning.length).toBeGreaterThan(0);
    });

    it('should return low confidence for ambiguous names', () => {
      const result = validator.classifyNewNode('Something', 'Does something');

      expect(result.confidence).toBeLessThan(0.5);
    });
  });
});
