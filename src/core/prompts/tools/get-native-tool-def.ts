import { ToolArgs } from "./types"

export function getGetNativeToolDefDescription(args: ToolArgs): string | undefined {
	return `## get_native_tool_def
Description: Get usage instructions for a native tool defined in the system.
Parameters:
- tool_name: (required) The name of the native tool to get instructions for.

Usage:
<get_native_tool_def>
<tool_name>tool name here</tool_name>
</get_native_tool_def>

Example: Get instructions for the read_file tool

<get_native_tool_def>
<tool_name>read_file</tool_name>
</get_native_tool_def>`
}
