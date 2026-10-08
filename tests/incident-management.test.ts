import { describe, it, expect } from 'vitest';
import { buildBpmnXml } from '../src/bpmn/builder.js';
import { layoutBpmnDiagram } from '../src/bpmn/layout.js';
import { validateBpmnXml } from '../src/bpmn/validator.js';
import { GenerateBpmnInput } from '../src/types/bpmn.js';

describe('Incident Management Multi-Lane Process (Bizagi Modeler Benchmark)', () => {
  const incidentProcessDef: GenerateBpmnInput = {
    title: 'Proceso de Gestión de Incidentes de TI',
    pools: [
      {
        id: 'Pool_Incidentes',
        name: 'Mesa de Servicio y Soporte TI',
        lanes: [
          { id: 'Lane_Solicitante', name: 'Solicitante' },
          { id: 'Lane_N1', name: 'N1 (Mesa de Ayuda)' },
          { id: 'Lane_SLAMotor', name: 'SLA Motor' },
          { id: 'Lane_N2N3', name: 'N2/N3 (Especialistas)' }
        ]
      }
    ],
    nodes: [
      // Lane: Solicitante
      {
        id: 'Start_Incidencia',
        name: 'Reportar Incidencia',
        type: 'startEvent',
        poolId: 'Pool_Incidentes',
        laneId: 'Lane_Solicitante',
        documentation: 'El usuario registra una incidencia o falla en el portal de autoservicio.'
      },
      // Lane: N1
      {
        id: 'Task_Registrar',
        name: 'Registrar y Clasificar Ticket',
        type: 'userTask',
        poolId: 'Pool_Incidentes',
        laneId: 'Lane_N1',
        documentation: 'Agente N1 valida prioridad, impacto y categoría del servicio.'
      },
      {
        id: 'Fork_Paralelo',
        name: 'Split Paralelo',
        type: 'parallelGateway',
        poolId: 'Pool_Incidentes',
        laneId: 'Lane_N1'
      },
      {
        id: 'Task_DiagnosticoN1',
        name: 'Diagnóstico Inicial N1',
        type: 'userTask',
        poolId: 'Pool_Incidentes',
        laneId: 'Lane_N1'
      },
      // Lane: SLA Motor
      {
        id: 'Task_TimerSLA',
        name: 'Iniciar Temporizador SLA',
        type: 'serviceTask',
        poolId: 'Pool_Incidentes',
        laneId: 'Lane_SLAMotor',
        documentation: 'Servicio automático que activa conteo regresivo de SLA según prioridad.'
      },
      // Lane: N1
      {
        id: 'Join_Paralelo',
        name: 'Sincronizar Diagnóstico y SLA',
        type: 'parallelGateway',
        poolId: 'Pool_Incidentes',
        laneId: 'Lane_N1'
      },
      {
        id: 'Gateway_ResueltoN1',
        name: '¿Resuelto en N1?',
        type: 'exclusiveGateway',
        poolId: 'Pool_Incidentes',
        laneId: 'Lane_N1'
      },
      // Lane: N2/N3
      {
        id: 'Task_EspecialistaN2N3',
        name: 'Resolver Incidente Complejo',
        type: 'userTask',
        poolId: 'Pool_Incidentes',
        laneId: 'Lane_N2N3',
        documentation: 'Ingeniero especialista analiza logs y aplica corrección técnica.'
      },
      // Lane: Solicitante
      {
        id: 'Task_ConfirmarSolucion',
        name: 'Confirmar Solución del Servicio',
        type: 'userTask',
        poolId: 'Pool_Incidentes',
        laneId: 'Lane_Solicitante'
      },
      {
        id: 'Gateway_AceptaSolucion',
        name: '¿Conforme con Solución?',
        type: 'exclusiveGateway',
        poolId: 'Pool_Incidentes',
        laneId: 'Lane_Solicitante'
      },
      {
        id: 'End_IncidenciaCerrada',
        name: 'Incidencia Cerrada con Éxito',
        type: 'endEvent',
        poolId: 'Pool_Incidentes',
        laneId: 'Lane_Solicitante'
      }
    ],
    flows: [
      { id: 'Flow_1', sourceRef: 'Start_Incidencia', targetRef: 'Task_Registrar' },
      { id: 'Flow_2', sourceRef: 'Task_Registrar', targetRef: 'Fork_Paralelo' },
      { id: 'Flow_3', sourceRef: 'Fork_Paralelo', targetRef: 'Task_DiagnosticoN1', name: 'Atención Técnica' },
      { id: 'Flow_4', sourceRef: 'Fork_Paralelo', targetRef: 'Task_TimerSLA', name: 'Control Tiempo' },
      { id: 'Flow_5', sourceRef: 'Task_DiagnosticoN1', targetRef: 'Join_Paralelo' },
      { id: 'Flow_6', sourceRef: 'Task_TimerSLA', targetRef: 'Join_Paralelo' },
      { id: 'Flow_7', sourceRef: 'Join_Paralelo', targetRef: 'Gateway_ResueltoN1' },
      { id: 'Flow_8', sourceRef: 'Gateway_ResueltoN1', targetRef: 'Task_ConfirmarSolucion', name: 'Sí' },
      { id: 'Flow_9', sourceRef: 'Gateway_ResueltoN1', targetRef: 'Task_EspecialistaN2N3', name: 'No (Escalar)' },
      { id: 'Flow_10', sourceRef: 'Task_EspecialistaN2N3', targetRef: 'Task_ConfirmarSolucion', name: 'Solución Especialista' },
      { id: 'Flow_11', sourceRef: 'Task_ConfirmarSolucion', targetRef: 'Gateway_AceptaSolucion' },
      { id: 'Flow_12', sourceRef: 'Gateway_AceptaSolucion', targetRef: 'End_IncidenciaCerrada', name: 'Conforme' },
      // Loopback: Solicitante rechaza solución y reabre el ticket hacia N1
      { id: 'Flow_13', sourceRef: 'Gateway_AceptaSolucion', targetRef: 'Task_Registrar', name: 'Rechazado (Reabrir)' }
    ]
  };

  it('calculates spatial layout respecting lane boundaries and preventing overlaps', () => {
    const layout = layoutBpmnDiagram(
      incidentProcessDef.pools,
      incidentProcessDef.nodes,
      incidentProcessDef.flows
    );

    expect(layout.pools.length).toBe(1);
    expect(layout.pools[0].lanes.length).toBe(4);

    const laneMap = new Map(layout.pools[0].lanes.map(l => [l.id, l]));

    // Check that lanes are stacked vertically in sequence
    let prevLaneBottom = 0;
    for (let i = 0; i < layout.pools[0].lanes.length; i++) {
      const lane = layout.pools[0].lanes[i];
      if (i > 0) {
        expect(lane.bounds.y).toBe(prevLaneBottom);
      }
      prevLaneBottom = lane.bounds.y + lane.bounds.height;
    }

    // 1. Verify every node is geometrically inside its assigned lane
    for (const node of layout.nodes) {
      const lane = laneMap.get(node.laneId!)!;
      expect(lane).toBeDefined();

      // Node X must be inside lane X boundaries
      expect(node.bounds.x).toBeGreaterThanOrEqual(lane.bounds.x);
      expect(node.bounds.x + node.bounds.width).toBeLessThanOrEqual(lane.bounds.x + lane.bounds.width);

      // Node Y must be strictly inside lane vertical band
      expect(node.bounds.y).toBeGreaterThanOrEqual(lane.bounds.y);
      expect(node.bounds.y + node.bounds.height).toBeLessThanOrEqual(lane.bounds.y + lane.bounds.height);
    }

    // 2. Verify no two nodes overlap each other
    for (let i = 0; i < layout.nodes.length; i++) {
      for (let j = i + 1; j < layout.nodes.length; j++) {
        const a = layout.nodes[i].bounds;
        const b = layout.nodes[j].bounds;

        const overlaps = !(
          a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y
        );

        if (overlaps) {
          console.error(`Collision detected between ${layout.nodes[i].id} and ${layout.nodes[j].id}`);
        }
        expect(overlaps).toBe(false);
      }
    }

    // 3. Verify loopback edge has backward routing waypoints
    const loopFlow = layout.flows.find(f => f.id === 'Flow_13')!;
    expect(loopFlow.waypoints.length).toBeGreaterThanOrEqual(3);
  });

  it('generates 100% valid Bizagi-compatible BPMN 2.0 XML with full BPMNDI coordinates', async () => {
    const xml = await buildBpmnXml(incidentProcessDef);

    // Validate the generated XML with our validator
    const validation = await validateBpmnXml(xml);

    expect(validation.isValid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.summary.hasCollaboration).toBe(true);
    expect(validation.summary.poolsCount).toBe(1);
    expect(validation.summary.lanesCount).toBe(4);
    expect(validation.summary.nodesCount).toBe(11);
    expect(validation.summary.flowsCount).toBe(13);
    expect(validation.summary.allNodesHaveShapes).toBe(true);
    expect(validation.summary.allFlowsHaveEdges).toBe(true);
    expect(validation.summary.disconnectedNodes).toEqual([]);

    // Check specific Bizagi XML requirements
    expect(xml).toContain('isHorizontal="true"');
    expect(xml).toContain('<bpmndi:BPMNShape id="Pool_Incidentes_di" bpmnElement="Pool_Incidentes" isHorizontal="true">');
    expect(xml).toContain('<bpmndi:BPMNShape id="Lane_Solicitante_di" bpmnElement="Lane_Solicitante" isHorizontal="true">');
    expect(xml).toContain('<bpmndi:BPMNShape id="Lane_N1_di" bpmnElement="Lane_N1" isHorizontal="true">');
    expect(xml).toContain('<bpmndi:BPMNShape id="Lane_SLAMotor_di" bpmnElement="Lane_SLAMotor" isHorizontal="true">');
    expect(xml).toContain('<bpmndi:BPMNShape id="Lane_N2N3_di" bpmnElement="Lane_N2N3" isHorizontal="true">');
    expect(xml).toContain('bpmnElement="Start_Incidencia"');
    expect(xml).toContain('bpmnElement="Fork_Paralelo"');
    expect(xml).toContain('bpmnElement="Gateway_ResueltoN1"');
    expect(xml).toContain('bpmnElement="Task_EspecialistaN2N3"');
  });
});
