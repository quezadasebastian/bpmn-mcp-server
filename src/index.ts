#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createBpmnMcpServer } from './server.js';

async function main() {
  const server = createBpmnMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('BPMN 2.0 MCP Server running on stdio');
}

main().catch(err => {
  console.error('Fatal error running BPMN MCP Server:', err);
  process.exit(1);
});
