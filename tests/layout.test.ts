import { describe, it, expect } from 'vitest';
import { layoutBpmnDiagram, computeTopologicalRanks, getNodeDimensions } from '../src/bpmn/layout.js';
import { NodeDefinition, FlowDefinition, PoolDefinition } from '../src/types/bpmn.js';

describe('BPMN Layout Engine', () => {
  it('correctly computes node dimensions for different BPMN types', () => {
    expect(getNodeDimensions('startEvent')).toEqual({ width: 36, height: 36 });
    expect(getNodeDimensions('endEvent')).toEqual({ width: 36, height: 36 });
    expect(getNodeDimensions('exclusiveGateway')).toEqual({ width: 50, height: 50 });
    expect(getNodeDimensions('parallelGateway')).toEqual({ width: 50, height: 50 });
    expect(getNodeDimensions('userTask')).toEqual({ width: 100, height: 80 });
    expect(getNodeDimensions('serviceTask')).toEqual({ width: 100, height: 80 });
  });

  it('detects back-edges and assigns topological ranks', () => {
    const nodes: NodeDefinition[] = [
      { id: 'start', name: 'Start', type: 'startEvent', poolId: 'p1' },
      { id: 'task1', name: 'Task 1', type: 'userTask', poolId: 'p1' },
      { id: 'gw', name: 'Check', type: 'exclusiveGateway', poolId: 'p1' },
      { id: 'end', name: 'End', type: 'endEvent', poolId: 'p1' }
    ];

    const flows: FlowDefinition[] = [
      { id: 'f1', sourceRef: 'start', targetRef: 'task1' },
      { id: 'f2', sourceRef: 'task1', targetRef: 'gw' },
      { id: 'f3', sourceRef: 'gw', targetRef: 'end', name: 'Pass' },
      { id: 'f4', sourceRef: 'gw', targetRef: 'task1', name: 'Retry' } // Cycle/loopback
    ];

    const { ranks, backEdges } = computeTopologicalRanks(nodes, flows);

    expect(backEdges.has('gw->task1')).toBe(true);
    expect(ranks.get('start')).toBe(0);
    expect(ranks.get('task1')).toBe(1);
    expect(ranks.get('gw')).toBe(2);
    expect(ranks.get('end')).toBe(3);
  });

  it('separates nodes onto sub-rows when they share the same lane and rank', () => {
    const pools: PoolDefinition[] = [
      {
        id: 'p1',
        name: 'Pool 1',
        lanes: [{ id: 'lane1', name: 'Lane 1' }]
      }
    ];

    const nodes: NodeDefinition[] = [
      { id: 'start', name: 'Start', type: 'startEvent', poolId: 'p1', laneId: 'lane1' },
      { id: 'fork', name: 'Fork', type: 'parallelGateway', poolId: 'p1', laneId: 'lane1' },
      { id: 't1', name: 'Task 1', type: 'userTask', poolId: 'p1', laneId: 'lane1' },
      { id: 't2', name: 'Task 2', type: 'userTask', poolId: 'p1', laneId: 'lane1' },
      { id: 'join', name: 'Join', type: 'parallelGateway', poolId: 'p1', laneId: 'lane1' }
    ];

    const flows: FlowDefinition[] = [
      { id: 'f1', sourceRef: 'start', targetRef: 'fork' },
      { id: 'f2', sourceRef: 'fork', targetRef: 't1' },
      { id: 'f3', sourceRef: 'fork', targetRef: 't2' },
      { id: 'f4', sourceRef: 't1', targetRef: 'join' },
      { id: 'f5', sourceRef: 't2', targetRef: 'join' }
    ];

    const result = layoutBpmnDiagram(pools, nodes, flows);

    const node1 = result.nodes.find(n => n.id === 't1')!;
    const node2 = result.nodes.find(n => n.id === 't2')!;

    // Both should have same rank
    expect(node1.rank).toBe(node2.rank);
    // But different sub-rows
    expect(node1.subRow).not.toBe(node2.subRow);
    // Y positions must not overlap
    expect(Math.abs(node1.bounds.y - node2.bounds.y)).toBeGreaterThanOrEqual(80);
  });
});
