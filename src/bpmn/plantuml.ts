import { ConvertPlantUmlInput, GenerateBpmnInput, FlowDefinition, NodeDefinition, PoolDefinition, BpmnNodeType } from '../types/bpmn.js';

interface BranchContext {
  type: 'if' | 'fork';
  splitId: string;
  joinId?: string;
  conditionName?: string;
  branchExits: { tailId: string; label?: string }[];
  currentBranchLabel?: string;
}

/**
 * Converts PlantUML activity diagram syntax (lanes, if/else, fork/join, start/stop)
 * into a structured GenerateBpmnInput JSON object.
 */
export function convertPlantUmlToBpmnDefinition(input: ConvertPlantUmlInput): GenerateBpmnInput {
  const lines = input.plantuml
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('\'') && !l.startsWith('/\''));

  let title = input.title || 'Process Diagram';
  const poolName = input.poolName || 'Main Process';
  const poolId = 'Pool_1';

  const lanesMap = new Map<string, string>(); // name -> id
  const nodes: NodeDefinition[] = [];
  const flows: FlowDefinition[] = [];

  let currentLaneId: string | undefined = undefined;
  let currentTails: string[] = [];
  const branchStack: BranchContext[] = [];

  let nodeCounter = 1;
  let flowCounter = 1;

  function getNextNodeId(prefix: string): string {
    return `${prefix}_${nodeCounter++}`;
  }

  function getNextFlowId(): string {
    return `Flow_${flowCounter++}`;
  }

  function ensureLane(name: string): string {
    const cleanName = name.replace(/^[|#\w\s]+[|]/, '').replace(/\|/g, '').trim() || name;
    if (!lanesMap.has(cleanName)) {
      const id = `Lane_${lanesMap.size + 1}`;
      lanesMap.set(cleanName, id);
    }
    return lanesMap.get(cleanName)!;
  }

  function addFlow(sourceRef: string, targetRef: string, name?: string) {
    if (sourceRef && targetRef && sourceRef !== targetRef) {
      flows.push({
        id: getNextFlowId(),
        sourceRef,
        targetRef,
        name: name || undefined
      });
    }
  }

  function connectTailsTo(targetId: string, label?: string) {
    for (const tail of currentTails) {
      addFlow(tail, targetId, label);
    }
    currentTails = [targetId];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Ignore start/end uml
    if (line.startsWith('@startuml') || line.startsWith('@enduml')) {
      continue;
    }

    // Title directive
    if (line.toLowerCase().startsWith('title ')) {
      title = line.substring(6).trim();
      continue;
    }

    // Lane definition: |#Color|Lane Name| or |Lane Name|
    const laneMatch = line.match(/^\|(?:#[a-zA-Z0-9_-]+\|)?([^|]+)\|$/);
    if (laneMatch) {
      const rawLaneName = laneMatch[1].trim();
      currentLaneId = ensureLane(rawLaneName);
      continue;
    }

    // Start event
    if (line === 'start') {
      const startId = getNextNodeId('StartEvent');
      nodes.push({
        id: startId,
        name: 'Inicio',
        type: 'startEvent',
        poolId,
        laneId: currentLaneId
      });
      currentTails = [startId];
      continue;
    }

    // End / Stop event
    if (line === 'stop' || line === 'end') {
      const endId = getNextNodeId('EndEvent');
      nodes.push({
        id: endId,
        name: 'Fin',
        type: 'endEvent',
        poolId,
        laneId: currentLaneId
      });
      connectTailsTo(endId);
      currentTails = [];
      continue;
    }

    // Fork (parallel split)
    if (line === 'fork') {
      const splitId = getNextNodeId('ParallelSplit');
      nodes.push({
        id: splitId,
        name: 'Fork',
        type: 'parallelGateway',
        poolId,
        laneId: currentLaneId
      });
      connectTailsTo(splitId);

      branchStack.push({
        type: 'fork',
        splitId,
        branchExits: []
      });

      // Active branch starts from splitId
      currentTails = [splitId];
      continue;
    }

    // Fork again
    if (line === 'fork again') {
      const topBranch = branchStack[branchStack.length - 1];
      if (topBranch && topBranch.type === 'fork') {
        for (const tail of currentTails) {
          topBranch.branchExits.push({ tailId: tail });
        }
        currentTails = [topBranch.splitId];
      }
      continue;
    }

    // End fork
    if (line === 'end fork' || line === 'end merge') {
      const topBranch = branchStack.pop();
      if (topBranch && topBranch.type === 'fork') {
        for (const tail of currentTails) {
          topBranch.branchExits.push({ tailId: tail });
        }

        const joinId = getNextNodeId('ParallelJoin');
        nodes.push({
          id: joinId,
          name: 'Join',
          type: 'parallelGateway',
          poolId,
          laneId: currentLaneId
        });

        for (const exit of topBranch.branchExits) {
          addFlow(exit.tailId, joinId);
        }

        currentTails = [joinId];
      }
      continue;
    }

    // If decision: if (condition) then (yes label)
    const ifMatch = line.match(/^if\s*\((.*?)\)\s*then(?:\s*\((.*?)\))?$/);
    if (ifMatch) {
      const condition = ifMatch[1].trim();
      const branchLabel = ifMatch[2]?.trim() || 'Sí';

      const splitId = getNextNodeId('Decision');
      nodes.push({
        id: splitId,
        name: condition || '¿Decisión?',
        type: 'exclusiveGateway',
        poolId,
        laneId: currentLaneId
      });

      connectTailsTo(splitId);

      branchStack.push({
        type: 'if',
        splitId,
        conditionName: condition,
        branchExits: [],
        currentBranchLabel: branchLabel
      });

      currentTails = [splitId];
      continue;
    }

    // Else branch: else (no label)
    const elseMatch = line.match(/^else(?:\s*\((.*?)\))?$/);
    if (elseMatch) {
      const topBranch = branchStack[branchStack.length - 1];
      if (topBranch && topBranch.type === 'if') {
        for (const tail of currentTails) {
          topBranch.branchExits.push({ tailId: tail });
        }
        topBranch.currentBranchLabel = elseMatch[1]?.trim() || 'No';
        currentTails = [topBranch.splitId];
      }
      continue;
    }

    // Endif
    if (line === 'endif') {
      const topBranch = branchStack.pop();
      if (topBranch && topBranch.type === 'if') {
        for (const tail of currentTails) {
          topBranch.branchExits.push({ tailId: tail });
        }

        const joinId = getNextNodeId('Merge');
        nodes.push({
          id: joinId,
          name: 'Merge',
          type: 'exclusiveGateway',
          poolId,
          laneId: currentLaneId
        });

        for (const exit of topBranch.branchExits) {
          addFlow(exit.tailId, joinId);
        }

        currentTails = [joinId];
      }
      continue;
    }

    // Task / Action: :Task description; or :Task description] or with stereotypes
    if (line.startsWith(':')) {
      let rawText = line.substring(1).replace(/(?:;|\])$/, '').trim();
      let stereotype = '';
      const stereoMatch = rawText.match(/<<([a-zA-Z0-9_]+)>>/);
      if (stereoMatch) {
        stereotype = stereoMatch[1].toLowerCase();
        rawText = rawText.replace(/<<[a-zA-Z0-9_]+>>/g, '').replace(/;$/, '').trim();
      }
      let taskName = rawText.replace(/;$/, '').trim();
      let nodeType: BpmnNodeType = 'userTask';

      // Infer task type from stereotypes or keywords
      if (stereotype === 'service' || taskName.includes('<<service>>') || taskName.toLowerCase().startsWith('service:')) {
        nodeType = 'serviceTask';
        taskName = taskName.replace(/<<service>>/gi, '').replace(/^service:\s*/i, '').trim();
      } else if (stereotype === 'script' || taskName.includes('<<script>>') || taskName.toLowerCase().startsWith('script:')) {
        nodeType = 'scriptTask';
        taskName = taskName.replace(/<<script>>/gi, '').replace(/^script:\s*/i, '').trim();
      } else if (stereotype === 'manual' || taskName.includes('<<manual>>') || taskName.toLowerCase().startsWith('manual:')) {
        nodeType = 'manualTask';
        taskName = taskName.replace(/<<manual>>/gi, '').replace(/^manual:\s*/i, '').trim();
      } else if (stereotype === 'rule' || taskName.includes('<<rule>>') || taskName.toLowerCase().startsWith('rule:')) {
        nodeType = 'businessRuleTask';
        taskName = taskName.replace(/<<rule>>/gi, '').replace(/^rule:\s*/i, '').trim();
      }

      const taskId = getNextNodeId('Task');
      nodes.push({
        id: taskId,
        name: taskName,
        type: nodeType,
        poolId,
        laneId: currentLaneId
      });

      // Check if this task is entering a branch from a split gateway
      const topBranch = branchStack[branchStack.length - 1];
      const isEnteringBranch = topBranch && currentTails.length === 1 && currentTails[0] === topBranch.splitId;
      const label = isEnteringBranch ? topBranch.currentBranchLabel : undefined;

      connectTailsTo(taskId, label);
      continue;
    }
  }

  // Construct Pools & Lanes definitions
  const lanesList = Array.from(lanesMap.entries()).map(([name, id]) => ({
    id,
    name
  }));

  const pools: PoolDefinition[] = [
    {
      id: poolId,
      name: poolName,
      lanes: lanesList
    }
  ];

  return {
    title,
    pools,
    nodes,
    flows
  };
}
