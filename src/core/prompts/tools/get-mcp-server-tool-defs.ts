import { ToolArgs } from "./types"

export function getGetMcpServerToolDefsDescription(args: ToolArgs): string | undefined {
	if (!args.mcpHub) {
		return undefined
	}
	return `## get_mcp_server_tool_defs
Description: Request detailed XML definitions of all tools provided by a connected MCP server.
Parameters:
- server_name: (required) The name of the MCP server to get tool definitions from
- tool_names: (optional) Comma-separated list of specific tool names to get definitions for. If not provided, all tools will be returned.
Usage:
<get_mcp_server_tool_defs>
<server_name>server name here</server_name>
<tool_names>tool1,tool2,tool3</tool_names>
</get_mcp_server_tool_defs>

Example: Requesting tool definitions from an MCP server

<get_mcp_server_tool_defs>
<server_name>weather-server</server_name>
</get_mcp_server_tool_defs>

Example: Requesting specific tool definitions from an MCP server

<get_mcp_server_tool_defs>
<server_name>weather-server</server_name>
<tool_names>get_weather,get_forecast</tool_names>
</get_mcp_server_tool_defs>`
}
