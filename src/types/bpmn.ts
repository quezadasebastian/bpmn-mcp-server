import { z } from 'zod';

export const BpmnNodeTypeSchema = z.enum([
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
]);

export type BpmnNodeType = z.infer<typeof BpmnNodeTypeSchema>;

export const LaneDefinitionSchema = z.object({
  id: z.string().min(1, 'Lane id is required'),
  name: z.string().min(1, 'Lane name is required')
});

export type LaneDefinition = z.infer<typeof LaneDefinitionSchema>;

export const PoolDefinitionSchema = z.object({
  id: z.string().min(1, 'Pool id is required'),
  name: z.string().min(1, 'Pool name is required'),
  lanes: z.array(LaneDefinitionSchema).optional().default([])
});

export type PoolDefinition = z.infer<typeof PoolDefinitionSchema>;

export const NodeDefinitionSchema = z.object({
  id: z.string().min(1, 'Node id is required'),
  name: z.string().default(''),
  type: BpmnNodeTypeSchema,
  poolId: z.string().min(1, 'poolId is required'),
  laneId: z.string().optional(),
  documentation: z.string().optional()
});

export type NodeDefinition = z.infer<typeof NodeDefinitionSchema>;

export const FlowDefinitionSchema = z.object({
  id: z.string().min(1, 'Flow id is required'),
  sourceRef: z.string().min(1, 'sourceRef is required'),
  targetRef: z.string().min(1, 'targetRef is required'),
  name: z.string().optional(),
  condition: z.string().optional()
});

export type FlowDefinition = z.infer<typeof FlowDefinitionSchema>;

export const GenerateBpmnSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  outputPath: z.string().optional(),
  pools: z.array(PoolDefinitionSchema).min(1, 'At least one pool is required'),
  nodes: z.array(NodeDefinitionSchema).min(1, 'At least one node is required'),
  flows: z.array(FlowDefinitionSchema).default([])
});

export type GenerateBpmnInput = z.infer<typeof GenerateBpmnSchema>;

export const ValidateBpmnSchema = z.object({
  xml: z.string().min(1, 'BPMN XML string is required')
});

export type ValidateBpmnInput = z.infer<typeof ValidateBpmnSchema>;

export const ConvertPlantUmlSchema = z.object({
  plantuml: z.string().min(1, 'PlantUML content is required'),
  title: z.string().optional(),
  poolName: z.string().optional()
});

export type ConvertPlantUmlInput = z.infer<typeof ConvertPlantUmlSchema>;

export interface ElementBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Waypoint {
  x: number;
  y: number;
}
