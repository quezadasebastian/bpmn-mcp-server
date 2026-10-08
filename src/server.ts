import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode
} from '@modelcontextprotocol/sdk/types.js';
import {
  GenerateBpmnSchema,
  ValidateBpmnSchema,
  ConvertPlantUmlSchema
} from './types/bpmn.js';
import { buildBpmnXml } from './bpmn/builder.js';
import { validateBpmnXml } from './bpmn/validator.js';
import { convertPlantUmlToBpmnDefinition } from './bpmn/plantuml.js';

export function createBpmnMcpServer(): Server {
  const server = new Server(
    {
      name: 'bpmn-mcp-server',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  // Expose MCP Tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: 'generate_bpmn_from_definition',
          description:
            'Generates a production-grade, auto-laid-out BPMN 2.0 XML file fully compatible with Bizagi Modeler and Camunda. Accepts pools, lanes, nodes, and flows, computing 2D bounds and orthogonal waypoints.',
          inputSchema: {
            type: 'object',
            properties: {
              title: {
                type: 'string',
                description: 'The title of the business process diagram'
              },
              outputPath: {
                type: 'string',
                description: 'Optional path on disk to save the .bpmn XML file. If omitted, returns the XML string.'
              },
              pools: {
                type: 'array',
                description: 'Array of pools (participants) and their swimlanes',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'Unique identifier for the pool' },
                    name: { type: 'string', description: 'Display name of the pool / participant' },
                    lanes: {
                      type: 'array',
                      description: 'Swimlanes inside this pool',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string', description: 'Unique identifier for the lane' },
                          name: { type: 'string', description: 'Display name of the lane' }
                        },
                        required: ['id', 'name']
                      }
                    }
                  },
                  required: ['id', 'name']
                }
              },
              nodes: {
                type: 'array',
                description: 'Flow nodes in the process (events, tasks, gateways)',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'Unique node identifier' },
                    name: { type: 'string', description: 'Display label of the node' },
                    type: {
                      type: 'string',
                      enum: [
                        'startEvent',
                        'endEvent',
                        'userTask',
                        'serviceTask',
                        'scriptTask',
                        'manualTask',
                        'businessRuleTask',
                        'exclusiveGateway',
                        'parallelGateway',
                        'inclusiveGateway',
                        'eventBasedGateway',
                        'intermediateCatchEvent',
                        'intermediateThrowEvent'
                      ],
                      description: 'BPMN element type'
                    },
                    poolId: { type: 'string', description: 'ID of the pool containing this node' },
                    laneId: { type: 'string', description: 'ID of the lane containing this node' },
                    documentation: { type: 'string', description: 'Optional node documentation or notes' }
                  },
                  required: ['id', 'type', 'poolId']
                }
              },
              flows: {
                type: 'array',
                description: 'Sequence flows connecting nodes',
                items: {
                  type: 'object',
                  properties: {
                    id: { type: 'string', description: 'Unique flow identifier' },
                    sourceRef: { type: 'string', description: 'Source node ID' },
                    targetRef: { type: 'string', description: 'Target node ID' },
                    name: { type: 'string', description: 'Optional flow label or decision condition name' },
                    condition: { type: 'string', description: 'Optional formal expression condition' }
                  },
                  required: ['id', 'sourceRef', 'targetRef']
                }
              }
            },
            required: ['title', 'pools', 'nodes']
          }
        },
        {
          name: 'validate_bpmn_xml',
          description:
            'Validates whether a raw BPMN 2.0 XML string complies with required XML namespaces, contains complete BPMNDI coordinates (BPMNShape bounds & BPMNEdge waypoints), and has no disconnected flows.',
          inputSchema: {
            type: 'object',
            properties: {
              xml: {
                type: 'string',
                description: 'The raw BPMN 2.0 XML content to validate'
              }
            },
            required: ['xml']
          }
        },
        {
          name: 'convert_plantuml_to_bpmn',
          description:
            'Parses PlantUML activity diagram syntax (lanes, start, stop, tasks, if/else, fork/join) into the structured JSON definition required by generate_bpmn_from_definition.',
          inputSchema: {
            type: 'object',
            properties: {
              plantuml: {
                type: 'string',
                description: 'The PlantUML activity diagram text'
              },
              title: {
                type: 'string',
                description: 'Optional process title'
              },
              poolName: {
                type: 'string',
                description: 'Optional pool name'
              }
            },
            required: ['plantuml']
          }
        }
      ]
    };
  });

  // Handle Tool Calls
  server.setRequestHandler(CallToolRequestSchema, async request => {
    const { name, arguments: args } = request.params;

    try {
      if (name === 'generate_bpmn_from_definition') {
        const validated = GenerateBpmnSchema.safeParse(args);
        if (!validated.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Validation error: ${validated.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
          );
        }

        const xml = await buildBpmnXml(validated.data);
        const validation = await validateBpmnXml(xml);

        let responseText = '';
        if (validated.data.outputPath) {
          responseText = `Successfully generated BPMN 2.0 XML and saved to: ${validated.data.outputPath}\n\n`;
          responseText += `Validation Status: ${validation.isValid ? 'VALID' : 'INVALID'}\n`;
          responseText += `Pools: ${validation.summary.poolsCount}, Lanes: ${validation.summary.lanesCount}, Nodes: ${validation.summary.nodesCount}, Flows: ${validation.summary.flowsCount}\n`;
          responseText += `BPMNDI Shapes: ${validation.summary.shapesCount}, Edges: ${validation.summary.edgesCount}\n\n`;
          responseText += `XML Preview (first 1000 chars):\n${xml.slice(0, 1000)}...`;
        } else {
          responseText = xml;
        }

        return {
          content: [
            {
              type: 'text',
              text: responseText
            }
          ]
        };
      }

      if (name === 'validate_bpmn_xml') {
        const validated = ValidateBpmnSchema.safeParse(args);
        if (!validated.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Validation error: ${validated.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
          );
        }

        const result = await validateBpmnXml(validated.data.xml);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      if (name === 'convert_plantuml_to_bpmn') {
        const validated = ConvertPlantUmlSchema.safeParse(args);
        if (!validated.success) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Validation error: ${validated.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`
          );
        }

        const definition = convertPlantUmlToBpmnDefinition(validated.data);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(definition, null, 2)
            }
          ]
        };
      }

      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    } catch (err: any) {
      if (err instanceof McpError) throw err;
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Error executing ${name}: ${err?.message || String(err)}`
          }
        ]
      };
    }
  });

  return server;
}
