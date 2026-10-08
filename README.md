# Production-Grade BPMN 2.0 MCP Server for Bizagi Modeler & Process Engines

A Model Context Protocol (MCP) server written in TypeScript and Node.js that enables AI agents to design business process diagrams and compile them into valid, auto-laid-out BPMN 2.0 XML files (`.bpmn`) fully compatible with **Bizagi Modeler**, **Camunda**, and standard OMG BPMN 2.0 suites.

---

## Features

- **100% Bizagi Modeler & Camunda Compatibility:**
  - Strict OMG BPMN 2.0 semantic hierarchy: `<bpmn:collaboration>`, `<bpmn:participant>`, `<bpmn:process>`, `<bpmn:laneSet>`, and `<bpmn:lane>`.
  - Full Diagram Interchange (BPMNDI): `<bpmndi:BPMNDiagram>`, `<bpmndi:BPMNPlane>`, `<bpmndi:BPMNShape>` (with `dc:Bounds` and `isHorizontal="true"` for pools and swimlanes), and `<bpmndi:BPMNEdge>` with orthogonal `<di:waypoint>` coordinates.
- **Production-Grade Swimlane Auto-Layout Engine:**
  - Automatic topological rank leveling (DAG layering).
  - Back-edge and cycle detection for loops (e.g. ticket reopening, rework loops).
  - Dynamic sub-row allocation per swimlane to prevent shape overlap during parallel splits.
  - Orthogonal Manhattan waypoint routing with collision avoidance.
- **3 Native MCP Tools:**
  1. `generate_bpmn_from_definition`: Compiles declarative JSON into auto-laid-out BPMN 2.0 XML.
  2. `validate_bpmn_xml`: Audits XML namespaces, BPMNDI coordinates, shape coverage, and flow connectivity.
  3. `convert_plantuml_to_bpmn`: Converts PlantUML activity diagram code (`|lanes|`, `if/else`, `fork/join`) into structured JSON definition.

---

## Architecture

```
bpmn-mcp-server/
├── src/
│   ├── index.ts               # Stdio MCP entry point
│   ├── server.ts              # MCP Server instance and tool handlers
│   ├── types/
│   │   ├── bpmn.ts            # Zod validation schemas and TypeScript types
│   │   └── modules.d.ts       # Module declarations
│   ├── bpmn/
│   │   ├── builder.ts         # AST generation using bpmn-moddle and BPMNDI injection
│   │   ├── layout.ts          # 2D swimlane coordinates & orthogonal waypoint engine
│   │   ├── validator.ts       # XML namespace, DI bounds, and connectivity validator
│   │   └── plantuml.ts        # PlantUML activity diagram syntax parser
├── tests/
│   ├── builder.test.ts        # XML generation tests
│   ├── layout.test.ts         # Topological ranking & sub-row placement tests
│   ├── validator.test.ts      # Namespace & connectivity validation tests
│   ├── plantuml.test.ts       # PlantUML parser tests
│   ├── incident-management.test.ts # 4-lane incident management benchmark test
│   └── server.test.ts         # MCP protocol handler tests
├── examples/
│   ├── incident-management.bpmn # Auto-generated multi-lane benchmark BPMN file
│   └── incident-management.puml # PlantUML source code benchmark
├── package.json
└── tsconfig.json
```

---

## MCP Tools Reference

### Tool 1: `generate_bpmn_from_definition`
Accepts a declarative definition of pools, lanes, nodes, and flows, arranges them onto a 2D canvas, and generates the `.bpmn` XML.

#### Input Schema:
```typescript
{
  title: string,                 // Title of the diagram
  outputPath?: string,           // Optional file path to save .bpmn on disk
  pools: Array<{
    id: string,
    name: string,
    lanes?: Array<{
      id: string,
      name: string
    }>
  }>,
  nodes: Array<{
    id: string,
    name: string,
    type: "startEvent" | "endEvent" | "userTask" | "serviceTask" | "scriptTask" | "manualTask" | "businessRuleTask" | "exclusiveGateway" | "parallelGateway" | "inclusiveGateway" | "eventBasedGateway" | "intermediateCatchEvent" | "intermediateThrowEvent",
    poolId: string,
    laneId?: string,
    documentation?: string
  }>,
  flows: Array<{
    id: string,
    sourceRef: string,
    targetRef: string,
    name?: string,
    condition?: string
  }>
}
```

---

### Tool 2: `validate_bpmn_xml`
Validates whether a raw BPMN 2.0 XML string contains all standard namespaces, has complete BPMNDI shapes for every node, edges for every flow, and checks for orphan/disconnected elements.

#### Input Schema:
```json
{
  "xml": "<bpmn:definitions ...> ... </bpmn:definitions>"
}
```

#### Output Example:
```json
{
  "isValid": true,
  "errors": [],
  "warnings": [],
  "summary": {
    "namespaces": {
      "bpmn": true,
      "bpmndi": true,
      "dc": true,
      "di": true
    },
    "hasCollaboration": true,
    "poolsCount": 1,
    "lanesCount": 4,
    "nodesCount": 11,
    "flowsCount": 13,
    "shapesCount": 16,
    "edgesCount": 13,
    "allNodesHaveShapes": true,
    "allFlowsHaveEdges": true,
    "disconnectedNodes": []
  }
}
```

---

### Tool 3: `convert_plantuml_to_bpmn`
Parses PlantUML activity diagrams (including swimlanes, `if/else`, and `fork/join`) into structured JSON ready for `generate_bpmn_from_definition`.

#### Input Schema:
```json
{
  "plantuml": "@startuml\n|Solicitante|\nstart\n:Reportar Incidencia;\n|N1|\n:Revisar Ticket;\nstop\n@enduml",
  "title": "Incident Process",
  "poolName": "Helpdesk"
}
```

---

## MCP Server Configuration Guide

### 1. Claude Desktop
Add to your `claude_desktop_config.json` (on Windows: `%APPDATA%\Claude\claude_desktop_config.json`, on macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "bpmn-server": {
      "command": "node",
      "args": [
        your rute of project + "/bpmn-mcp-server/dist/index.js"
      ]
    }
  }
}
```

### 2. Cursor IDE
Add to `.cursor/mcp.json` or Global Cursor Settings:

```json
{
  "mcpServers": {
    "bpmn-server": {
      "command": "node",
      "args": [
        you rute of project "/bpmn-mcp-server/dist/index.js"
      ]
    }
  }
}
```

### 3. Antigravity / Windsurf / CLI MCP Clients
Run directly via standard npx or node:
```bash
node dist/index.js
```

---

## Development & Testing

```bash
# Install dependencies
npm install

# Build TypeScript to dist/
npm run build

# Run Vitest test suite (17 tests covering all modules & benchmarks)
npm test

# Run directly in development mode
npm run dev
```

---

## License
MIT
