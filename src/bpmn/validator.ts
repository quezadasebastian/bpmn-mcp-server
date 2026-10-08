import { BpmnModdle } from 'bpmn-moddle';

export interface ValidationSummary {
  namespaces: {
    bpmn: boolean;
    bpmndi: boolean;
    dc: boolean;
    di: boolean;
  };
  hasCollaboration: boolean;
  poolsCount: number;
  lanesCount: number;
  nodesCount: number;
  flowsCount: number;
  shapesCount: number;
  edgesCount: number;
  allNodesHaveShapes: boolean;
  allFlowsHaveEdges: boolean;
  disconnectedNodes: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  summary: ValidationSummary;
}

const REQUIRED_NAMESPACES = {
  bpmn: 'http://www.omg.org/spec/BPMN/20100524/MODEL',
  bpmndi: 'http://www.omg.org/spec/BPMN/20100524/DI',
  dc: 'http://www.omg.org/spec/DD/20100524/DC',
  di: 'http://www.omg.org/spec/DD/20100524/DI'
};

/**
 * Validates a raw BPMN 2.0 XML string for Bizagi Modeler & Camunda compatibility:
 * - Namespace compliance (bpmn, bpmndi, dc, di)
 * - Complete Diagram Interchange coordinates (BPMNShape dc:Bounds, BPMNEdge waypoints)
 * - Flow connectivity and disconnected elements
 */
export async function validateBpmnXml(xml: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Check Namespace Declarations
  const namespaces = {
    bpmn: xml.includes(REQUIRED_NAMESPACES.bpmn),
    bpmndi: xml.includes(REQUIRED_NAMESPACES.bpmndi),
    dc: xml.includes(REQUIRED_NAMESPACES.dc),
    di: xml.includes(REQUIRED_NAMESPACES.di)
  };

  if (!namespaces.bpmn) {
    errors.push(`Missing standard BPMN 2.0 namespace (bpmn): "${REQUIRED_NAMESPACES.bpmn}"`);
  }
  if (!namespaces.bpmndi) {
    errors.push(`Missing standard BPMNDI namespace (bpmndi): "${REQUIRED_NAMESPACES.bpmndi}"`);
  }
  if (!namespaces.dc) {
    errors.push(`Missing standard DC namespace (dc): "${REQUIRED_NAMESPACES.dc}"`);
  }
  if (!namespaces.di) {
    errors.push(`Missing standard DI namespace (di): "${REQUIRED_NAMESPACES.di}"`);
  }

  // 2. Parse XML via bpmn-moddle
  const moddle = new BpmnModdle();
  let rootElement: any;
  let elementsById: Record<string, any> = {};

  try {
    const parseResult = await moddle.fromXML(xml);
    rootElement = parseResult.rootElement;
    elementsById = parseResult.elementsById || {};

    if (parseResult.warnings && parseResult.warnings.length > 0) {
      for (const w of parseResult.warnings) {
        warnings.push(`BPMN-Moddle warning: ${w.message}`);
      }
    }
  } catch (parseErr: any) {
    errors.push(`XML Parsing failed: ${parseErr.message || String(parseErr)}`);
    return {
      isValid: false,
      errors,
      warnings,
      summary: {
        namespaces,
        hasCollaboration: false,
        poolsCount: 0,
        lanesCount: 0,
        nodesCount: 0,
        flowsCount: 0,
        shapesCount: 0,
        edgesCount: 0,
        allNodesHaveShapes: false,
        allFlowsHaveEdges: false,
        disconnectedNodes: []
      }
    };
  }

  if (!rootElement) {
    errors.push('No root element found in BPMN XML');
    return {
      isValid: false,
      errors,
      warnings,
      summary: {
        namespaces,
        hasCollaboration: false,
        poolsCount: 0,
        lanesCount: 0,
        nodesCount: 0,
        flowsCount: 0,
        shapesCount: 0,
        edgesCount: 0,
        allNodesHaveShapes: false,
        allFlowsHaveEdges: false,
        disconnectedNodes: []
      }
    };
  }

  // 3. Inspect Semantic Elements
  const rootElements: any[] = rootElement.rootElements || [];
  const collaboration = rootElements.find(el => el.$instanceOf('bpmn:Collaboration'));
  const hasCollaboration = !!collaboration;

  const participants: any[] = collaboration ? collaboration.participants || [] : [];
  const poolsCount = participants.length;

  const processes: any[] = rootElements.filter(el => el.$instanceOf('bpmn:Process'));

  let lanesCount = 0;
  const flowNodes: any[] = [];
  const sequenceFlows: any[] = [];

  for (const proc of processes) {
    const laneSets = proc.laneSets || [];
    for (const ls of laneSets) {
      lanesCount += (ls.lanes || []).length;
    }

    const flowElements = proc.flowElements || [];
    for (const fe of flowElements) {
      if (fe.$instanceOf('bpmn:SequenceFlow')) {
        sequenceFlows.push(fe);
      } else if (fe.$instanceOf('bpmn:FlowNode')) {
        flowNodes.push(fe);
      }
    }
  }

  // 4. Inspect Diagram Interchange (BPMNDI)
  const diagrams: any[] = rootElement.diagrams || [];
  if (diagrams.length === 0) {
    errors.push('Diagram Interchange missing: No <bpmndi:BPMNDiagram> found (diagram will open blank in Bizagi)');
  }

  const shapesByElementId = new Map<string, any>();
  const edgesByElementId = new Map<string, any>();
  let shapesCount = 0;
  let edgesCount = 0;

  for (const diag of diagrams) {
    const plane = diag.plane;
    if (!plane) {
      errors.push('Diagram missing <bpmndi:BPMNPlane>');
      continue;
    }

    const planeElements = plane.planeElement || [];
    for (const pe of planeElements) {
      if (pe.$instanceOf('bpmndi:BPMNShape')) {
        shapesCount++;
        const targetId = pe.bpmnElement?.id || pe.bpmnElement;
        if (targetId) {
          shapesByElementId.set(targetId, pe);
        }

        // Validate shape bounds
        const bounds = pe.bounds;
        if (!bounds || typeof bounds.x !== 'number' || typeof bounds.y !== 'number' ||
            typeof bounds.width !== 'number' || typeof bounds.height !== 'number' ||
            bounds.width <= 0 || bounds.height <= 0) {
          errors.push(`BPMNShape "${pe.id}" has invalid or missing dc:Bounds`);
        }
      } else if (pe.$instanceOf('bpmndi:BPMNEdge')) {
        edgesCount++;
        const targetId = pe.bpmnElement?.id || pe.bpmnElement;
        if (targetId) {
          edgesByElementId.set(targetId, pe);
        }

        // Validate edge waypoints
        const waypoints = pe.waypoint || [];
        if (waypoints.length < 2) {
          errors.push(`BPMNEdge "${pe.id}" has fewer than 2 waypoints`);
        } else {
          for (const wp of waypoints) {
            if (typeof wp.x !== 'number' || typeof wp.y !== 'number') {
              errors.push(`BPMNEdge "${pe.id}" has waypoint with invalid coordinates`);
              break;
            }
          }
        }
      }
    }
  }

  // Verify all flow nodes have corresponding shapes
  let allNodesHaveShapes = true;
  for (const node of flowNodes) {
    if (!shapesByElementId.has(node.id)) {
      allNodesHaveShapes = false;
      errors.push(`Semantic node "${node.id}" (${node.name || node.$type}) is missing a <bpmndi:BPMNShape>`);
    }
  }

  // Verify all sequence flows have corresponding edges
  let allFlowsHaveEdges = true;
  for (const flow of sequenceFlows) {
    if (!edgesByElementId.has(flow.id)) {
      allFlowsHaveEdges = false;
      errors.push(`SequenceFlow "${flow.id}" is missing a <bpmndi:BPMNEdge>`);
    }
  }

  // 5. Connectivity & Disconnected Nodes Check
  const disconnectedNodes: string[] = [];
  const nodeOutgoingCount = new Map<string, number>();
  const nodeIncomingCount = new Map<string, number>();

  for (const node of flowNodes) {
    nodeOutgoingCount.set(node.id, 0);
    nodeIncomingCount.set(node.id, 0);
  }

  for (const flow of sequenceFlows) {
    const srcId = flow.sourceRef?.id || flow.sourceRef;
    const tgtId = flow.targetRef?.id || flow.targetRef;

    if (!srcId || !elementsById[srcId]) {
      errors.push(`SequenceFlow "${flow.id}" has invalid or missing sourceRef "${srcId}"`);
    } else {
      nodeOutgoingCount.set(srcId, (nodeOutgoingCount.get(srcId) || 0) + 1);
    }

    if (!tgtId || !elementsById[tgtId]) {
      errors.push(`SequenceFlow "${flow.id}" has invalid or missing targetRef "${tgtId}"`);
    } else {
      nodeIncomingCount.set(tgtId, (nodeIncomingCount.get(tgtId) || 0) + 1);
    }
  }

  for (const node of flowNodes) {
    const incoming = nodeIncomingCount.get(node.id) || 0;
    const outgoing = nodeOutgoingCount.get(node.id) || 0;

    if (incoming === 0 && outgoing === 0) {
      disconnectedNodes.push(node.id);
      errors.push(`Node "${node.id}" (${node.name || node.$type}) is completely disconnected (0 incoming, 0 outgoing)`);
    } else if (node.$instanceOf('bpmn:StartEvent') && outgoing === 0) {
      warnings.push(`StartEvent "${node.id}" has no outgoing sequence flows`);
    } else if (node.$instanceOf('bpmn:EndEvent') && incoming === 0) {
      warnings.push(`EndEvent "${node.id}" has no incoming sequence flows`);
    } else if (!node.$instanceOf('bpmn:StartEvent') && incoming === 0) {
      warnings.push(`Node "${node.id}" (${node.name || node.$type}) has no incoming flows`);
    } else if (!node.$instanceOf('bpmn:EndEvent') && outgoing === 0) {
      warnings.push(`Node "${node.id}" (${node.name || node.$type}) has no outgoing flows`);
    }
  }

  const isValid = errors.length === 0;

  return {
    isValid,
    errors,
    warnings,
    summary: {
      namespaces,
      hasCollaboration,
      poolsCount,
      lanesCount,
      nodesCount: flowNodes.length,
      flowsCount: sequenceFlows.length,
      shapesCount,
      edgesCount,
      allNodesHaveShapes,
      allFlowsHaveEdges,
      disconnectedNodes
    }
  };
}
