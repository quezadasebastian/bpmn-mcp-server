import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { buildBpmnXml } from '../src/bpmn/builder.js';
import { GenerateBpmnInput } from '../src/types/bpmn.js';

describe('BPMN Builder', () => {
  it('generates a valid BPMN 2.0 XML string with collaboration, process, laneSet, and BPMNDI', async () => {
    const input: GenerateBpmnInput = {
      title: 'Simple Approval Process',
      pools: [
        {
          id: 'Pool_Order',
          name: 'Order Department',
          lanes: [
            { id: 'Lane_Clerk', name: 'Clerk' },
            { id: 'Lane_Manager', name: 'Manager' }
          ]
        }
      ],
      nodes: [
        { id: 'Start_1', name: 'Order Placed', type: 'startEvent', poolId: 'Pool_Order', laneId: 'Lane_Clerk' },
        { id: 'Task_Review', name: 'Review Order', type: 'userTask', poolId: 'Pool_Order', laneId: 'Lane_Clerk', documentation: 'Check customer credit' },
        { id: 'Task_Approve', name: 'Approve Order', type: 'userTask', poolId: 'Pool_Order', laneId: 'Lane_Manager' },
        { id: 'End_1', name: 'Order Processed', type: 'endEvent', poolId: 'Pool_Order', laneId: 'Lane_Manager' }
      ],
      flows: [
        { id: 'F1', sourceRef: 'Start_1', targetRef: 'Task_Review' },
        { id: 'F2', sourceRef: 'Task_Review', targetRef: 'Task_Approve', condition: 'orderTotal > 1000' },
        { id: 'F3', sourceRef: 'Task_Approve', targetRef: 'End_1' }
      ]
    };

    const xml = await buildBpmnXml(input);

    expect(xml).toContain('xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"');
    expect(xml).toContain('xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"');
    expect(xml).toContain('xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"');
    expect(xml).toContain('xmlns:di="http://www.omg.org/spec/DD/20100524/DI"');

    expect(xml).toContain('<bpmn:collaboration');
    expect(xml).toContain('<bpmn:participant id="Pool_Order"');
    expect(xml).toContain('<bpmn:laneSet');
    expect(xml).toContain('<bpmn:lane id="Lane_Clerk"');
    expect(xml).toContain('<bpmn:lane id="Lane_Manager"');

    expect(xml).toContain('<bpmndi:BPMNDiagram');
    expect(xml).toContain('<bpmndi:BPMNPlane');
    expect(xml).toContain('id="Pool_Order_di"');
    expect(xml).toContain('id="Lane_Clerk_di"');
    expect(xml).toContain('id="Lane_Manager_di"');
    expect(xml).toContain('id="Task_Review_di"');
    expect(xml).toContain('id="F1_di"');
    expect(xml).toContain('<di:waypoint');
  });

  it('writes BPMN XML to disk when outputPath is supplied', async () => {
    const testOutPath = path.join(process.cwd(), 'dist', 'test-output', 'test-process.bpmn');

    const input: GenerateBpmnInput = {
      title: 'Disk Write Test',
      outputPath: testOutPath,
      pools: [{ id: 'P1', name: 'Pool 1' }],
      nodes: [
        { id: 'S1', name: 'Start', type: 'startEvent', poolId: 'P1' },
        { id: 'E1', name: 'End', type: 'endEvent', poolId: 'P1' }
      ],
      flows: [{ id: 'F1', sourceRef: 'S1', targetRef: 'E1' }]
    };

    const xml = await buildBpmnXml(input);

    expect(fs.existsSync(testOutPath)).toBe(true);
    const savedXml = fs.readFileSync(testOutPath, 'utf8');
    expect(savedXml).toEqual(xml);

    // Clean up
    fs.unlinkSync(testOutPath);
  });
});
