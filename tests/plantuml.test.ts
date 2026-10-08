import { describe, it, expect } from 'vitest';
import { convertPlantUmlToBpmnDefinition } from '../src/bpmn/plantuml.js';
import { buildBpmnXml } from '../src/bpmn/builder.js';
import { validateBpmnXml } from '../src/bpmn/validator.js';

describe('PlantUML to BPMN Converter', () => {
  it('converts basic PlantUML activity diagram to BPMN definition', () => {
    const puml = `
    @startuml
    title Simple Service Flow
    start
    :Fetch User Data; <<service>>
    :Send Confirmation Email;
    stop
    @enduml
    `;

    const result = convertPlantUmlToBpmnDefinition({ plantuml: puml });

    expect(result.title).toBe('Simple Service Flow');
    expect(result.nodes.length).toBe(4); // start, 2 tasks, stop
    expect(result.nodes[0].type).toBe('startEvent');
    expect(result.nodes[1].type).toBe('serviceTask');
    expect(result.nodes[2].type).toBe('userTask');
    expect(result.nodes[3].type).toBe('endEvent');
    expect(result.flows.length).toBe(3);
  });

  it('converts PlantUML with swimlanes, if/else, and forks into valid BPMN XML', async () => {
    const puml = `
    @startuml
    title Multi-Lane Ticket Process
    |Client|
    start
    :Submit Request;

    |Support|
    :Review Ticket;
    if (Needs Approval?) then (yes)
      :Manager Approval;
    else (no)
      :Direct Fix;
    endif

    |Support|
    :Close Ticket;
    stop
    @enduml
    `;

    const def = convertPlantUmlToBpmnDefinition({ plantuml: puml });

    expect(def.pools[0].lanes?.length).toBe(2);
    expect(def.pools[0].lanes?.map(l => l.name)).toEqual(['Client', 'Support']);

    // Build XML from the converted definition
    const xml = await buildBpmnXml(def);
    const validation = await validateBpmnXml(xml);

    expect(validation.isValid).toBe(true);
    expect(validation.summary.allNodesHaveShapes).toBe(true);
    expect(validation.summary.allFlowsHaveEdges).toBe(true);
  });
});
