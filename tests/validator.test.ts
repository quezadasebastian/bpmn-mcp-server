import { describe, it, expect } from 'vitest';
import { validateBpmnXml } from '../src/bpmn/validator.js';
import { buildBpmnXml } from '../src/bpmn/builder.js';
import { GenerateBpmnInput } from '../src/types/bpmn.js';

describe('BPMN Validator', () => {
  it('validates a well-formed BPMN 2.0 XML with full BPMNDI successfully', async () => {
    const input: GenerateBpmnInput = {
      title: 'Valid Process',
      pools: [{ id: 'P1', name: 'Pool 1' }],
      nodes: [
        { id: 'S1', name: 'Start', type: 'startEvent', poolId: 'P1' },
        { id: 'T1', name: 'Task', type: 'userTask', poolId: 'P1' },
        { id: 'E1', name: 'End', type: 'endEvent', poolId: 'P1' }
      ],
      flows: [
        { id: 'F1', sourceRef: 'S1', targetRef: 'T1' },
        { id: 'F2', sourceRef: 'T1', targetRef: 'E1' }
      ]
    };

    const xml = await buildBpmnXml(input);
    const result = await validateBpmnXml(xml);

    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.summary.allNodesHaveShapes).toBe(true);
    expect(result.summary.allFlowsHaveEdges).toBe(true);
    expect(result.summary.disconnectedNodes).toEqual([]);
  });

  it('detects missing namespaces', async () => {
    const brokenXml = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1">
      <bpmn:process id="Process_1" />
    </bpmn:definitions>`;

    const result = await validateBpmnXml(brokenXml);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('bpmndi'))).toBe(true);
    expect(result.errors.some(e => e.includes('dc'))).toBe(true);
    expect(result.errors.some(e => e.includes('di'))).toBe(true);
  });

  it('detects missing Diagram Interchange (BPMNDI)', async () => {
    const noDiXml = `<?xml version="1.0" encoding="UTF-8"?>
    <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                      xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                      xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                      xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                      id="Definitions_1">
      <bpmn:process id="Process_1">
        <bpmn:startEvent id="Start_1" />
      </bpmn:process>
    </bpmn:definitions>`;

    const result = await validateBpmnXml(noDiXml);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('Diagram Interchange missing'))).toBe(true);
  });

  it('detects disconnected nodes', async () => {
    const input: GenerateBpmnInput = {
      title: 'Disconnected Node Process',
      pools: [{ id: 'P1', name: 'Pool 1' }],
      nodes: [
        { id: 'S1', name: 'Start', type: 'startEvent', poolId: 'P1' },
        { id: 'E1', name: 'End', type: 'endEvent', poolId: 'P1' },
        { id: 'Orphan_Task', name: 'Orphan', type: 'userTask', poolId: 'P1' }
      ],
      flows: [
        { id: 'F1', sourceRef: 'S1', targetRef: 'E1' }
      ]
    };

    const xml = await buildBpmnXml(input);
    const result = await validateBpmnXml(xml);

    expect(result.isValid).toBe(false);
    expect(result.summary.disconnectedNodes).toContain('Orphan_Task');
    expect(result.errors.some(e => e.includes('Orphan_Task'))).toBe(true);
  });
});
