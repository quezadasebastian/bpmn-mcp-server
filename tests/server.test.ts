import { describe, it, expect } from 'vitest';
import { createBpmnMcpServer } from '../src/server.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema
} from '@modelcontextprotocol/sdk/types.js';

describe('MCP Server Protocol Handlers', () => {
  it('exposes the 3 required tools with valid JSON schemas', async () => {
    const server = createBpmnMcpServer();

    // Trigger ListTools request handler
    const handler = (server as any)._requestHandlers?.get(ListToolsRequestSchema.shape.method.value);
    expect(handler).toBeDefined();

    const result = await handler({
      method: 'tools/list',
      params: {}
    });

    expect(result.tools).toHaveLength(3);
    const toolNames = result.tools.map((t: any) => t.name);
    expect(toolNames).toContain('generate_bpmn_from_definition');
    expect(toolNames).toContain('validate_bpmn_xml');
    expect(toolNames).toContain('convert_plantuml_to_bpmn');
  });

  it('executes generate_bpmn_from_definition tool call successfully', async () => {
    const server = createBpmnMcpServer();
    const handler = (server as any)._requestHandlers?.get(CallToolRequestSchema.shape.method.value);
    expect(handler).toBeDefined();

    const callResult = await handler({
      method: 'tools/call',
      params: {
        name: 'generate_bpmn_from_definition',
        arguments: {
          title: 'Invoice Processing',
          pools: [
            {
              id: 'Pool_Finance',
              name: 'Finance Department',
              lanes: [{ id: 'Lane_Accountant', name: 'Accountant' }]
            }
          ],
          nodes: [
            { id: 'S1', name: 'Receive Invoice', type: 'startEvent', poolId: 'Pool_Finance', laneId: 'Lane_Accountant' },
            { id: 'T1', name: 'Pay Invoice', type: 'serviceTask', poolId: 'Pool_Finance', laneId: 'Lane_Accountant' },
            { id: 'E1', name: 'Invoice Paid', type: 'endEvent', poolId: 'Pool_Finance', laneId: 'Lane_Accountant' }
          ],
          flows: [
            { id: 'F1', sourceRef: 'S1', targetRef: 'T1' },
            { id: 'F2', sourceRef: 'T1', targetRef: 'E1' }
          ]
        }
      }
    });

    expect(callResult.content[0].type).toBe('text');
    const xml = callResult.content[0].text;
    expect(xml).toContain('<bpmn:definitions');
    expect(xml).toContain('Pool_Finance');
    expect(xml).toContain('Lane_Accountant');
    expect(xml).toContain('<bpmndi:BPMNDiagram');
  });

  it('executes validate_bpmn_xml tool call and returns validation report', async () => {
    const server = createBpmnMcpServer();
    const handler = (server as any)._requestHandlers?.get(CallToolRequestSchema.shape.method.value);

    // Call generate first to get valid XML
    const genResult = await handler({
      method: 'tools/call',
      params: {
        name: 'generate_bpmn_from_definition',
        arguments: {
          title: 'Quick Test',
          pools: [{ id: 'P1', name: 'Pool 1' }],
          nodes: [
            { id: 'S1', name: 'Start', type: 'startEvent', poolId: 'P1' },
            { id: 'E1', name: 'End', type: 'endEvent', poolId: 'P1' }
          ],
          flows: [{ id: 'F1', sourceRef: 'S1', targetRef: 'E1' }]
        }
      }
    });

    const xml = genResult.content[0].text;

    // Validate through tool
    const valResult = await handler({
      method: 'tools/call',
      params: {
        name: 'validate_bpmn_xml',
        arguments: { xml }
      }
    });

    const parsedReport = JSON.parse(valResult.content[0].text);
    expect(parsedReport.isValid).toBe(true);
    expect(parsedReport.summary.allNodesHaveShapes).toBe(true);
  });

  it('executes convert_plantuml_to_bpmn tool call', async () => {
    const server = createBpmnMcpServer();
    const handler = (server as any)._requestHandlers?.get(CallToolRequestSchema.shape.method.value);

    const result = await handler({
      method: 'tools/call',
      params: {
        name: 'convert_plantuml_to_bpmn',
        arguments: {
          plantuml: `
          @startuml
          title Support Flow
          |Support|
          start
          :Resolve Ticket;
          stop
          @enduml
          `
        }
      }
    });

    const definition = JSON.parse(result.content[0].text);
    expect(definition.title).toBe('Support Flow');
    expect(definition.pools[0].lanes[0].name).toBe('Support');
    expect(definition.nodes).toHaveLength(3);
  });
});
