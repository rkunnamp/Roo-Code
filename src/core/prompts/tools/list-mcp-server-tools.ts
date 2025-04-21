import { ToolArgs } from "./types"

export function getListMcpServerToolsDescription(args: ToolArgs): string | undefined {
	if (!args.mcpHub) {
		return undefined
	}
	return `## list_mcp_server_tools
Description: Request a list of all tools provided by a connected MCP server.
Parameters:
- server_name: (required) The name of the MCP server to get tools from
Usage:
<list_mcp_server_tools>
<server_name>server name here</server_name>
</list_mcp_server_tools>

Example: Requesting to list tools from an MCP server

<list_mcp_server_tools>
<server_name>weather-server</server_name>
</list_mcp_server_tools>`
}
