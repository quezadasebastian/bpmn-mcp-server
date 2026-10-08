import { BpmnModdle } from 'bpmn-moddle';
import * as fs from 'fs';
import * as path from 'path';
import { GenerateBpmnInput, NodeDefinition, BpmnNodeType } from '../types/bpmn.js';
import { layoutBpmnDiagram, LayoutOptions } from './layout.js';

const MODDLE_TYPE_MAP: Record<BpmnNodeType, string> = {
  startEvent: 'bpmn:StartEvent',
  endEvent: 'bpmn:EndEvent',
  intermediateCatchEvent: 'bpmn:IntermediateCatchEvent',
  intermediateThrowEvent: 'bpmn:IntermediateThrowEvent',
  userTask: 'bpmn:UserTask',
  serviceTask: 'bpmn:ServiceTask',
  scriptTask: 'bpmn:ScriptTask',
  manualTask: 'bpmn:ManualTask',
  businessRuleTask: 'bpmn:BusinessRuleTask',
  exclusiveGateway: 'bpmn:ExclusiveGateway',
  parallelGateway: 'bpmn:ParallelGateway',
  inclusiveGateway: 'bpmn:InclusiveGateway',
  eventBasedGateway: 'bpmn:EventBasedGateway'
};

export interface BpmnBuilderOptions extends LayoutOptions {
  idPrefix?: string;
}

/**
 * Builds a production-grade BPMN 2.0 XML string conforming to Bizagi Modeler & Camunda requirements.
 */
export async function buildBpmnXml(
  definition: GenerateBpmnInput,
  options: BpmnBuilderOptions = {}
): Promise<string> {
  const moddle = new BpmnModdle();
  const idPrefix = options.idPrefix || 'BPMN_';

  // 1. Calculate 2D layout coordinates and waypoints
  const layout = layoutBpmnDiagram(
    definition.pools,
    definition.nodes,
    definition.flows,
    options
  );

  // 2. Create Root Definitions
  const definitions = moddle.create('bpmn:Definitions', {
    id: `${idPrefix}Definitions`,
    name: definition.title,
    targetNamespace: 'http://bpmn.io/schema/bpmn',
    exporter: 'BPMN 2.0 MCP Server for Bizagi Modeler',
    exporterVersion: '1.0.0'
  });

  const collaboration = moddle.create('bpmn:Collaboration', {
    id: `${idPrefix}Collaboration`
  });

  const processesMap = new Map<string, any>();
  const laneObjectsMap = new Map<string, any>();
  const nodeObjectsMap = new Map<string, any>();
  const flowObjectsMap = new Map<string, any>();
  const participantObjectsMap = new Map<string, any>();

  // 3. Create Processes and Participants for each Pool
  for (const pool of definition.pools) {
    const processId = `Process_${pool.id}`;
    const process = moddle.create('bpmn:Process', {
      id: processId,
      name: pool.name,
      isExecutable: false
    });

    const participant = moddle.create('bpmn:Participant', {
      id: pool.id,
      name: pool.name,
      processRef: process
    });

    collaboration.get('participants').push(participant);
    participantObjectsMap.set(pool.id, participant);
    processesMap.set(pool.id, process);

    // Create LaneSet and Lanes if defined
    if (pool.lanes && pool.lanes.length > 0) {
      const laneSet = moddle.create('bpmn:LaneSet', {
        id: `LaneSet_${pool.id}`
      });

      for (const laneDef of pool.lanes) {
        const lane = moddle.create('bpmn:Lane', {
          id: laneDef.id,
          name: laneDef.name
        });
        laneSet.get('lanes').push(lane);
        laneObjectsMap.set(laneDef.id, lane);
      }

      process.get('laneSets').push(laneSet);
    }
  }

  // 4. Create Nodes and assign to Processes & Lanes
  for (const nodeDef of definition.nodes) {
    const moddleType = MODDLE_TYPE_MAP[nodeDef.type] || 'bpmn:Task';
    const nodeObj = moddle.create(moddleType, {
      id: nodeDef.id,
      name: nodeDef.name || ''
    });

    if (nodeDef.documentation) {
      const doc = moddle.create('bpmn:Documentation', {
        text: nodeDef.documentation
      });
      nodeObj.get('documentation').push(doc);
    }

    nodeObjectsMap.set(nodeDef.id, nodeObj);

    // Assign to corresponding process
    const process = processesMap.get(nodeDef.poolId) || processesMap.values().next().value;
    if (process) {
      process.get('flowElements').push(nodeObj);
    }

    // Assign to lane if specified
    if (nodeDef.laneId && laneObjectsMap.has(nodeDef.laneId)) {
      const lane = laneObjectsMap.get(nodeDef.laneId);
      lane.get('flowNodeRef').push(nodeObj);
    }
  }

  // 5. Create Sequence Flows
  for (const flowDef of definition.flows) {
    const sourceNode = nodeObjectsMap.get(flowDef.sourceRef);
    const targetNode = nodeObjectsMap.get(flowDef.targetRef);

    const flowObj = moddle.create('bpmn:SequenceFlow', {
      id: flowDef.id,
      name: flowDef.name || '',
      sourceRef: sourceNode,
      targetRef: targetNode
    });

    if (flowDef.condition) {
      const condExpr = moddle.create('bpmn:FormalExpression', {
        body: flowDef.condition
      });
      flowObj.conditionExpression = condExpr;
    }

    if (sourceNode) {
      sourceNode.get('outgoing').push(flowObj);
    }
    if (targetNode) {
      targetNode.get('incoming').push(flowObj);
    }

    flowObjectsMap.set(flowDef.id, flowObj);

    // Add to source node's process
    const srcNodeDef = definition.nodes.find(n => n.id === flowDef.sourceRef);
    const poolId = srcNodeDef?.poolId || definition.pools[0]?.id;
    const process = processesMap.get(poolId) || processesMap.values().next().value;
    if (process) {
      process.get('flowElements').push(flowObj);
    }
  }

  // Add collaboration and processes to root elements
  definitions.get('rootElements').push(collaboration, ...processesMap.values());

  // 6. Build Diagram Interchange (BPMNDI)
  const plane = moddle.create('bpmndi:BPMNPlane', {
    id: `${idPrefix}Plane`,
    bpmnElement: collaboration
  });

  // Shapes for Pools (Participants)
  for (const poolLayout of layout.pools) {
    const participantObj = participantObjectsMap.get(poolLayout.id);
    if (participantObj) {
      const poolShape = moddle.create('bpmndi:BPMNShape', {
        id: `${poolLayout.id}_di`,
        bpmnElement: participantObj,
        isHorizontal: true,
        bounds: moddle.create('dc:Bounds', poolLayout.bounds)
      });
      plane.get('planeElement').push(poolShape);
    }

    // Shapes for Lanes
    for (const laneLayout of poolLayout.lanes) {
      const laneObj = laneObjectsMap.get(laneLayout.id);
      if (laneObj) {
        const laneShape = moddle.create('bpmndi:BPMNShape', {
          id: `${laneLayout.id}_di`,
          bpmnElement: laneObj,
          isHorizontal: true,
          bounds: moddle.create('dc:Bounds', laneLayout.bounds)
        });
        plane.get('planeElement').push(laneShape);
      }
    }
  }

  // Shapes for Nodes
  for (const nodeLayout of layout.nodes) {
    const nodeObj = nodeObjectsMap.get(nodeLayout.id);
    if (nodeObj) {
      const nodeShape = moddle.create('bpmndi:BPMNShape', {
        id: `${nodeLayout.id}_di`,
        bpmnElement: nodeObj,
        bounds: moddle.create('dc:Bounds', nodeLayout.bounds)
      });
      plane.get('planeElement').push(nodeShape);
    }
  }

  // Edges for Flows
  for (const flowLayout of layout.flows) {
    const flowObj = flowObjectsMap.get(flowLayout.id);
    if (flowObj) {
      const edge = moddle.create('bpmndi:BPMNEdge', {
        id: `${flowLayout.id}_di`,
        bpmnElement: flowObj
      });

      for (const wp of flowLayout.waypoints) {
        edge.get('waypoint').push(
          moddle.create('dc:Point', { x: wp.x, y: wp.y })
        );
      }

      plane.get('planeElement').push(edge);
    }
  }

  const diagram = moddle.create('bpmndi:BPMNDiagram', {
    id: `${idPrefix}Diagram`,
    plane: plane
  });

  definitions.get('diagrams').push(diagram);

  // 7. Serialize to XML
  const { xml } = await moddle.toXML(definitions, { format: true });

  // 8. Write to disk if outputPath is provided
  if (definition.outputPath) {
    const targetDir = path.dirname(path.resolve(definition.outputPath));
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.writeFileSync(path.resolve(definition.outputPath), xml, 'utf8');
  }

  return xml;
}
