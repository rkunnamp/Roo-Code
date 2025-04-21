import { Cline } from "../Cline"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"
import { formatResponse } from "../prompts/responses"
import { ClineAskUseMcpServer } from "../../shared/ExtensionMessage"

export async function listMcpServerToolsTool(
	cline: Cline,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const server_name: string | undefined = block.params.server_name
	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				type: "list_mcp_server_tools" as ClineAskUseMcpServer["type"],
				serverName: removeClosingTag("server_name", server_name),
			})

			await cline.ask("use_mcp_server", partialMessage, block.partial).catch(() => {})
			return
		} else {
			if (!server_name) {
				cline.consecutiveMistakeCount++
				cline.recordToolError("list_mcp_server_tools")
				pushToolResult(await cline.sayAndCreateMissingParamError("list_mcp_server_tools", "server_name"))
				return
			}

			cline.consecutiveMistakeCount = 0

			const completeMessage = JSON.stringify({
				type: "list_mcp_server_tools" as ClineAskUseMcpServer["type"],
				serverName: server_name,
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

			// Format the tools list
			const toolsList =
				server.tools?.map((tool) => `- ${tool.name}: ${tool.description}`).join("\n") ||
				"No tools available for this server."

			const resultText = `Available tools for ${server_name}:\n\n${toolsList}`

			await cline.say("mcp_server_response", resultText)
			pushToolResult(formatResponse.toolResult(resultText))

			return
		}
	} catch (error) {
		await handleError("listing MCP server tools", error)
		return
	}
}
