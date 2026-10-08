# BPMN 2.0 MCP Server - Contexto y Convenciones del Workspace

Este proyecto provee un Servidor MCP (Model Context Protocol) en TypeScript/Node.js especializado en la generación, maquetación automática (auto-layout) y validación de diagramas BPMN 2.0 para **Bizagi Modeler**, **Camunda** y motores estándar BPMN 2.0.

## Herramientas MCP Registradas

1. `generate_bpmn_from_definition`:
   - Genera archivos `.bpmn` con la capa semántica completa (`bpmn:collaboration`, `bpmn:laneSet`, `bpmn:lane`) y Diagram Interchange (`bpmndi:BPMNShape`, `bpmndi:BPMNEdge` con waypoints ortogonales).
   - Soporta guardado directo a disco con `outputPath` o retorno de cadena XML.
2. `validate_bpmn_xml`:
   - Audita cumplimiento de namespaces OMG, coordenadas de formas, waypoints ortogonales y conectividad sin elementos huérfanos.
3. `convert_plantuml_to_bpmn`:
   - Convierte sintaxis de diagramas de actividad PlantUML (`|carriles|`, `if/else`, `fork/join`, estereotipos) a la estructura JSON esperada por `generate_bpmn_from_definition`.

## Instrucción para los Agentes en este Workspace

Cuando el usuario pida diseñar o crear un proceso BPMN:
1. Traduce los requisitos del proceso a la estructura de pools, carriles (lanes), nodos y sequence flows.
2. Invoca la herramienta `generate_bpmn_from_definition` indicando una ruta de salida clara (por ejemplo `examples/<nombre_proceso>.bpmn` o la ruta solicitada).
3. Invoca `validate_bpmn_xml` sobre el resultado para asegurar compatibilidad total con Bizagi Modeler.
