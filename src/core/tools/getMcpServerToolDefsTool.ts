import { Cline } from "../Cline"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"
import { formatResponse } from "../prompts/responses"
import { ClineAskUseMcpServer } from "../../shared/ExtensionMessage"

export async function getMcpServerToolDefsTool(
	cline: Cline,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const server_name: string | undefined = block.params.server_name
	const tool_names: string | undefined = block.params.tool_names

	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				type: "get_mcp_server_tool_defs" as ClineAskUseMcpServer["type"],
				serverName: removeClosingTag("server_name", server_name),
				toolNames: removeClosingTag("tool_names", tool_names),
			})

			await cline.ask("use_mcp_server", partialMessage, block.partial).catch(() => {})
			return
		} else {
			if (!server_name) {
				cline.consecutiveMistakeCount++
				cline.recordToolError("get_mcp_server_tool_defs")
				pushToolResult(await cline.sayAndCreateMissingParamError("get_mcp_server_tool_defs", "server_name"))
				return
			}

			cline.consecutiveMistakeCount = 0

			const completeMessage = JSON.stringify({
				type: "get_mcp_server_tool_defs" as ClineAskUseMcpServer["type"],
				serverName: server_name,
				toolNames: tool_names,
			})

			const didApprove = await askApproval("use_mcp_server", completeMessage)

			if (!didApprove) {
				return
			}

			// Get tools list from the server
			await cline.say("mcp_server_request_started")

			// Get the MCP Hub and find the server
			const mcpHub = cline.providerRef.deref()?.getMcpHub()
			const server = mcpHub?.getServers().find((s) => s.name === server_name)

			if (!server) {
				await cline.say("error", `Server '${server_name}' not found or not connected.`)
				pushToolResult(formatResponse.toolError(`Server '${server_name}' not found or not connected.`))
				return
			}

			// Parse tool_names into an array if provided
			let toolNamesArray: string[] | undefined
			if (tool_names) {
				toolNamesArray = tool_names.split(",").map((name) => name.trim())
			}

			// Format the tools definitions in XML format
			let toolsXml = ""

			if (server.tools && server.tools.length > 0) {
				// Filter tools if toolNamesArray is defined
				const filteredTools = toolNamesArray
					? server.tools.filter((tool) => toolNamesArray!.includes(tool.name || ""))
					: server.tools

				if (toolNamesArray && filteredTools.length === 0) {
					const message = `No matching tools found for the specified names: ${tool_names}`
					await cline.say("error", message)
					pushToolResult(formatResponse.toolError(message))
					return
				}

				toolsXml = filteredTools
					.map((tool) => {
						return `<tool>
  <name>${escapeXml(tool.name || "")}</name>
  <description>${escapeXml(tool.description || "")}</description>
</tool>`
					})
					.join("\n")

				toolsXml = `<tools>\n${toolsXml}\n</tools>`
			} else {
				toolsXml = "<tools></tools>"
			}

			const resultText = `Tool definitions for ${server_name}${toolNamesArray ? ` (filtered to: ${toolNamesArray.join(", ")})` : ""}:\n\n${toolsXml}`

			await cline.say("mcp_server_response", resultText)
			pushToolResult(formatResponse.toolResult(resultText))

			return
		}
	} catch (error) {
		await handleError("retrieving MCP server tool definitions", error)
		return
	}
}

// Helper function to escape XML special characters
function escapeXml(unsafe: string): string {
	return unsafe
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;")
}
