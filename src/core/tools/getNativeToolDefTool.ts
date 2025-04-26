import { Cline } from "../Cline"
import { ToolUse, AskApproval, HandleError, PushToolResult, RemoveClosingTag } from "../../shared/tools"
import { formatResponse } from "../prompts/responses"
import { ClineAskNativeToolDef } from "../../shared/ExtensionMessage"
import * as fs from "fs"
import * as path from "path"

export async function getNativeToolDefTool(
	cline: Cline,
	block: ToolUse,
	askApproval: AskApproval,
	handleError: HandleError,
	pushToolResult: PushToolResult,
	removeClosingTag: RemoveClosingTag,
) {
	const tool_name: string | undefined = block.params.tool_name

	try {
		if (block.partial) {
			const partialMessage = JSON.stringify({
				type: "get_native_tool_def" as ClineAskNativeToolDef["type"],
				toolName: removeClosingTag("tool_name", tool_name),
			})

			await cline.ask("tool", partialMessage, block.partial).catch(() => {})
			return
		} else {
			if (!tool_name) {
				cline.consecutiveMistakeCount++
				cline.recordToolError("get_native_tool_def")
				pushToolResult(await cline.sayAndCreateMissingParamError("get_native_tool_def", "tool_name"))
				return
			}

			cline.consecutiveMistakeCount = 0

			// Convert tool name from snake_case to kebab-case for file lookup
			const kebabCaseToolName = tool_name.replace(/_/g, "-")

			// Path to the tool definition file
			const toolsDir = path.join(__dirname, "../prompts/tools")
			const toolFilePath = path.join(toolsDir, `${kebabCaseToolName}.ts`)

			// Check if the tool file exists
			if (!fs.existsSync(toolFilePath)) {
				const errorMessage = `Native tool definition not found for '${tool_name}'.`
				await cline.say("error", errorMessage)
				pushToolResult(formatResponse.toolError(errorMessage))
				return
			}

			try {
				// Import the tool description function dynamically
				const toolModule = require(toolFilePath)

				// Find the appropriate function
				// The function name follows the pattern: get[PascalCase]Description
				const funcName = `get${tool_name
					.split("_")
					.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
					.join("")}Description`

				if (typeof toolModule[funcName] !== "function") {
					const errorMessage = `Description function not found for '${tool_name}'.`
					await cline.say("error", errorMessage)
					pushToolResult(formatResponse.toolError(errorMessage))
					return
				}

				// Call the function to get the description
				// Try first without arguments, then with minimal arguments if needed
				let description = toolModule[funcName]()

				// If the function requires arguments, try with minimal args
				if (!description) {
					const minimalArgs = {
						cwd: cline.cwd || process.cwd(),
						supportsComputerUse: true,
						// Provide mcpHub only if it's needed and available
						mcpHub: cline.providerRef.deref()?.getMcpHub(),
					}
					description = toolModule[funcName](minimalArgs)
				}

				if (!description) {
					const errorMessage = `Could not generate description for '${tool_name}'.`
					await cline.say("error", errorMessage)
					pushToolResult(formatResponse.toolError(errorMessage))
					return
				}

				const resultText = `Tool definition for ${tool_name}:\n\n${description}`

				await cline.say("text", resultText)
				pushToolResult(formatResponse.toolResult(resultText))
				return
			} catch (error) {
				const errorMessage = `Error loading tool definition for '${tool_name}': ${error instanceof Error ? error.message : String(error)}`
				await cline.say("error", errorMessage)
				pushToolResult(formatResponse.toolError(errorMessage))
				return
			}
		}
	} catch (error) {
		await handleError("retrieving native tool definition", error)
		return
	}
}
