import { BpmnNodeType, ElementBounds, FlowDefinition, NodeDefinition, PoolDefinition, Waypoint } from '../types/bpmn.js';

export interface LayoutedNode extends NodeDefinition {
  bounds: ElementBounds;
  rank: number;
  subRow: number;
}

export interface LayoutedLane {
  id: string;
  name: string;
  poolId: string;
  bounds: ElementBounds;
}

export interface LayoutedPool {
  id: string;
  name: string;
  bounds: ElementBounds;
  lanes: LayoutedLane[];
}

export interface LayoutedFlow extends FlowDefinition {
  waypoints: Waypoint[];
}

export interface DiagramLayoutResult {
  pools: LayoutedPool[];
  nodes: LayoutedNode[];
  flows: LayoutedFlow[];
  totalBounds: ElementBounds;
}

export const NODE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  startEvent: { width: 36, height: 36 },
  endEvent: { width: 36, height: 36 },
  intermediateCatchEvent: { width: 36, height: 36 },
  intermediateThrowEvent: { width: 36, height: 36 },
  exclusiveGateway: { width: 50, height: 50 },
  parallelGateway: { width: 50, height: 50 },
  inclusiveGateway: { width: 50, height: 50 },
  eventBasedGateway: { width: 50, height: 50 },
  userTask: { width: 100, height: 80 },
  serviceTask: { width: 100, height: 80 },
  scriptTask: { width: 100, height: 80 },
  manualTask: { width: 100, height: 80 },
  businessRuleTask: { width: 100, height: 80 }
};

export function getNodeDimensions(type: BpmnNodeType): { width: number; height: number } {
  return NODE_DIMENSIONS[type] || { width: 100, height: 80 };
}

/**
 * Computes topological ranks and identifies back-edges (cycles) in the process flow graph.
 */
export function computeTopologicalRanks(
  nodes: NodeDefinition[],
  flows: FlowDefinition[]
): { ranks: Map<string, number>; backEdges: Set<string> } {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();

  for (const n of nodes) {
    outgoing.set(n.id, []);
    incoming.set(n.id, []);
  }

  for (const f of flows) {
    if (outgoing.has(f.sourceRef)) {
      outgoing.get(f.sourceRef)!.push(f.targetRef);
    }
    if (incoming.has(f.targetRef)) {
      incoming.get(f.targetRef)!.push(f.sourceRef);
    }
  }

  // Detect back-edges with DFS cycle detection
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const backEdges = new Set<string>();

  function dfs(u: string) {
    visited.add(u);
    recStack.add(u);

    for (const v of outgoing.get(u) || []) {
      if (recStack.has(v)) {
        backEdges.add(`${u}->${v}`);
      } else if (!visited.has(v)) {
        dfs(v);
      }
    }
    recStack.delete(u);
  }

  // Start DFS traversal from startEvents or nodes with 0 incoming flows
  const startCandidates = nodes.filter(
    n => n.type === 'startEvent' || (incoming.get(n.id) || []).length === 0
  );

  for (const sc of startCandidates) {
    if (!visited.has(sc.id)) dfs(sc.id);
  }
  for (const n of nodes) {
    if (!visited.has(n.id)) dfs(n.id);
  }

  // Compute longest-path ranks ignoring back-edges
  const ranks = new Map<string, number>();
  for (const n of nodes) {
    ranks.set(n.id, 0);
  }

  let changed = true;
  let iterations = 0;
  const maxIterations = Math.max(nodes.length * 2, 20);

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;
    for (const f of flows) {
      if (backEdges.has(`${f.sourceRef}->${f.targetRef}`)) continue;
      const srcRank = ranks.get(f.sourceRef) ?? 0;
      const tgtRank = ranks.get(f.targetRef) ?? 0;
      if (srcRank + 1 > tgtRank) {
        ranks.set(f.targetRef, srcRank + 1);
        changed = true;
      }
    }
  }

  return { ranks, backEdges };
}

export interface LayoutOptions {
  startX?: number;
  startY?: number;
  columnWidth?: number;
  subRowHeight?: number;
  lanePaddingY?: number;
  poolHeaderWidth?: number;
}

/**
 * Production-grade auto-layout engine for BPMN 2.0 diagrams with swimlanes.
 * Calculates 2D spatial coordinates for pools, lanes, nodes, and orthogonal waypoints.
 */
export function layoutBpmnDiagram(
  pools: PoolDefinition[],
  nodes: NodeDefinition[],
  flows: FlowDefinition[],
  options: LayoutOptions = {}
): DiagramLayoutResult {
  const startX = options.startX ?? 120;
  const startY = options.startY ?? 80;
  const columnWidth = options.columnWidth ?? 170;
  const subRowHeight = options.subRowHeight ?? 110;
  const lanePaddingY = options.lanePaddingY ?? 30;
  const poolHeaderWidth = options.poolHeaderWidth ?? 30;

  const { ranks, backEdges } = computeTopologicalRanks(nodes, flows);

  // Group nodes by pool and lane
  const nodePoolMap = new Map<string, string>();
  const nodeLaneMap = new Map<string, string>();

  // Ensure every node belongs to a pool and lane
  const defaultPoolId = pools[0]?.id || 'Default_Pool';
  for (const node of nodes) {
    const poolId = node.poolId || defaultPoolId;
    nodePoolMap.set(node.id, poolId);

    const pool = pools.find(p => p.id === poolId);
    let laneId = node.laneId;
    if (!laneId && pool && pool.lanes && pool.lanes.length > 0) {
      laneId = pool.lanes[0].id;
    }
    nodeLaneMap.set(node.id, laneId || 'Default_Lane');
  }

  // Determine sub-rows for nodes sharing the same lane and rank
  // To avoid any overlap, each (laneId, rank) slot maintains an index
  const laneRankCounts = new Map<string, number>();
  const nodeSubRows = new Map<string, number>();
  const laneMaxSubRows = new Map<string, number>();

  for (const node of nodes) {
    const laneId = nodeLaneMap.get(node.id)!;
    const rank = ranks.get(node.id) ?? 0;
    const key = `${laneId}:${rank}`;
    const currentSubRow = laneRankCounts.get(key) ?? 0;
    nodeSubRows.set(node.id, currentSubRow);
    laneRankCounts.set(key, currentSubRow + 1);

    const maxSoFar = laneMaxSubRows.get(laneId) ?? 1;
    if (currentSubRow + 1 > maxSoFar) {
      laneMaxSubRows.set(laneId, currentSubRow + 1);
    }
  }

  // Calculate vertical metrics for pools and lanes
  let currentY = startY;
  const layoutedPools: LayoutedPool[] = [];
  const laneBoundsMap = new Map<string, ElementBounds>();

  // Find maximum rank to size pool width properly
  let maxRank = 0;
  for (const [, rank] of ranks.entries()) {
    if (rank > maxRank) maxRank = rank;
  }
  const poolContentWidth = Math.max((maxRank + 1) * columnWidth + 120, 700);
  const totalPoolWidth = poolContentWidth + poolHeaderWidth;

  for (const pool of pools) {
    const poolStartY = currentY;
    const layoutedLanes: LayoutedLane[] = [];

    const effectiveLanes = (pool.lanes && pool.lanes.length > 0)
      ? pool.lanes
      : [{ id: `${pool.id}_Lane_Default`, name: pool.name }];

    for (const lane of effectiveLanes) {
      const subRows = laneMaxSubRows.get(lane.id) ?? 1;
      const calculatedHeight = Math.max(130, subRows * subRowHeight + lanePaddingY);

      const laneBounds: ElementBounds = {
        x: startX + poolHeaderWidth,
        y: currentY,
        width: totalPoolWidth - poolHeaderWidth,
        height: calculatedHeight
      };

      laneBoundsMap.set(lane.id, laneBounds);
      layoutedLanes.push({
        id: lane.id,
        name: lane.name,
        poolId: pool.id,
        bounds: laneBounds
      });

      currentY += calculatedHeight;
    }

    const poolTotalHeight = currentY - poolStartY;
    const poolBounds: ElementBounds = {
      x: startX,
      y: poolStartY,
      width: totalPoolWidth,
      height: poolTotalHeight
    };

    layoutedPools.push({
      id: pool.id,
      name: pool.name,
      bounds: poolBounds,
      lanes: layoutedLanes
    });

    currentY += 40; // Spacing between pools if multiple
  }

  // Layout Nodes
  const layoutedNodes: LayoutedNode[] = [];
  const nodeBoundsMap = new Map<string, ElementBounds>();

  for (const node of nodes) {
    const rank = ranks.get(node.id) ?? 0;
    const subRow = nodeSubRows.get(node.id) ?? 0;
    const laneId = nodeLaneMap.get(node.id)!;
    const laneBounds = laneBoundsMap.get(laneId) || {
      x: startX + poolHeaderWidth,
      y: startY,
      width: totalPoolWidth - poolHeaderWidth,
      height: 140
    };

    const dims = getNodeDimensions(node.type);

    // X coordinate: centered within column
    const colLeft = laneBounds.x + rank * columnWidth + 40;
    const nodeX = Math.round(colLeft + (columnWidth - 40 - dims.width) / 2);

    // Y coordinate: centered within the assigned sub-row inside the lane
    const subRowCenterY = laneBounds.y + (lanePaddingY / 2) + (subRow * subRowHeight) + (subRowHeight / 2);
    const nodeY = Math.round(subRowCenterY - (dims.height / 2));

    const bounds: ElementBounds = {
      x: nodeX,
      y: nodeY,
      width: dims.width,
      height: dims.height
    };

    nodeBoundsMap.set(node.id, bounds);
    layoutedNodes.push({
      ...node,
      bounds,
      rank,
      subRow
    });
  }

  // Layout Flows with Orthogonal Manhattan Waypoints
  const layoutedFlows: LayoutedFlow[] = [];

  for (const flow of flows) {
    const src = nodeBoundsMap.get(flow.sourceRef);
    const tgt = nodeBoundsMap.get(flow.targetRef);

    if (!src || !tgt) {
      layoutedFlows.push({
        ...flow,
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 100 }
        ]
      });
      continue;
    }

    const srcRight = { x: src.x + src.width, y: Math.round(src.y + src.height / 2) };
    const srcLeft = { x: src.x, y: Math.round(src.y + src.height / 2) };
    const srcBottom = { x: Math.round(src.x + src.width / 2), y: src.y + src.height };
    const srcTop = { x: Math.round(src.x + src.width / 2), y: src.y };

    const tgtRight = { x: tgt.x + tgt.width, y: Math.round(tgt.y + tgt.height / 2) };
    const tgtLeft = { x: tgt.x, y: Math.round(tgt.y + tgt.height / 2) };
    const tgtBottom = { x: Math.round(tgt.x + tgt.width / 2), y: tgt.y + tgt.height };
    const tgtTop = { x: Math.round(tgt.x + tgt.width / 2), y: tgt.y };

    const isBackEdge = backEdges.has(`${flow.sourceRef}->${flow.targetRef}`) || tgt.x < src.x;
    const waypoints: Waypoint[] = [];

    if (isBackEdge) {
      // Loopback route: exit bottom/top of source, route backwards, enter target
      const routeBelow = src.y >= tgt.y;
      if (routeBelow) {
        const dropY = Math.round(src.y + src.height + 25);
        const backX = Math.round(tgt.x - 35);
        waypoints.push(
          srcBottom,
          { x: srcBottom.x, y: dropY },
          { x: backX, y: dropY },
          { x: backX, y: tgtLeft.y },
          tgtLeft
        );
      } else {
        const riseY = Math.round(src.y - 25);
        const backX = Math.round(tgt.x - 35);
        waypoints.push(
          srcTop,
          { x: srcTop.x, y: riseY },
          { x: backX, y: riseY },
          { x: backX, y: tgtLeft.y },
          tgtLeft
        );
      }
    } else if (tgt.x >= src.x + src.width) {
      // Standard forward progression: Target is to the right
      if (Math.abs(srcRight.y - tgtLeft.y) <= 4) {
        // Direct straight horizontal connection
        waypoints.push(srcRight, tgtLeft);
      } else {
        // Orthogonal 2-bend step
        const midX = Math.round((srcRight.x + tgtLeft.x) / 2);
        waypoints.push(
          srcRight,
          { x: midX, y: srcRight.y },
          { x: midX, y: tgtLeft.y },
          tgtLeft
        );
      }
    } else {
      // Same column or overlapping horizontal segment
      if (tgt.y > src.y + src.height) {
        // Target is straight below
        const midY = Math.round((srcBottom.y + tgtTop.y) / 2);
        if (Math.abs(srcBottom.x - tgtTop.x) <= 4) {
          waypoints.push(srcBottom, tgtTop);
        } else {
          waypoints.push(
            srcBottom,
            { x: srcBottom.x, y: midY },
            { x: tgtTop.x, y: midY },
            tgtTop
          );
        }
      } else if (tgt.y + tgt.height < src.y) {
        // Target is straight above
        const midY = Math.round((srcTop.y + tgtBottom.y) / 2);
        if (Math.abs(srcTop.x - tgtBottom.x) <= 4) {
          waypoints.push(srcTop, tgtBottom);
        } else {
          waypoints.push(
            srcTop,
            { x: srcTop.x, y: midY },
            { x: tgtBottom.x, y: midY },
            tgtBottom
          );
        }
      } else {
        // Fallback step
        const midX = Math.round((srcRight.x + tgtLeft.x) / 2);
        waypoints.push(
          srcRight,
          { x: midX, y: srcRight.y },
          { x: midX, y: tgtLeft.y },
          tgtLeft
        );
      }
    }

    layoutedFlows.push({
      ...flow,
      waypoints
    });
  }

  // Calculate total diagram bounding box
  let minX = startX;
  let minY = startY;
  let maxX = startX + totalPoolWidth;
  let maxY = currentY;

  for (const pool of layoutedPools) {
    minX = Math.min(minX, pool.bounds.x);
    minY = Math.min(minY, pool.bounds.y);
    maxX = Math.max(maxX, pool.bounds.x + pool.bounds.width);
    maxY = Math.max(maxY, pool.bounds.y + pool.bounds.height);
  }

  return {
    pools: layoutedPools,
    nodes: layoutedNodes,
    flows: layoutedFlows,
    totalBounds: {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY
    }
  };
}
