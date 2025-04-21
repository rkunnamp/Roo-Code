import { Anthropic } from "@anthropic-ai/sdk"
import { ApiHandler } from "../../api"

/**
 * Default percentage of the context window to use as a buffer when deciding when to truncate
 */
export const TOKEN_BUFFER_PERCENTAGE = 0.1

/**
 * Counts tokens for user content using the provider's token counting implementation.
 *
 * @param {Array<Anthropic.Messages.ContentBlockParam>} content - The content to count tokens for
 * @param {ApiHandler} apiHandler - The API handler to use for token counting
 * @returns {Promise<number>} A promise resolving to the token count
 */
export async function estimateTokenCount(
	content: Array<Anthropic.Messages.ContentBlockParam>,
	apiHandler: ApiHandler,
): Promise<number> {
	if (!content || content.length === 0) return 0
	return apiHandler.countTokens(content)
}

/**
 * Truncates a conversation by removing a fraction of the messages.
 *
 * The first message is always retained, and a specified fraction (rounded to an even number)
 * of messages from the beginning (excluding the first) is removed.
 *
 * @param {Anthropic.Messages.MessageParam[]} messages - The conversation messages.
 * @param {number} fracToRemove - The fraction (between 0 and 1) of messages (excluding the first) to remove.
 * @returns {Anthropic.Messages.MessageParam[]} The truncated conversation messages.
 */
export function truncateConversation(
	messages: Anthropic.Messages.MessageParam[],
	fracToRemove: number,
): Anthropic.Messages.MessageParam[] {
	const truncatedMessages = [messages[0]]
	const rawMessagesToRemove = Math.floor((messages.length - 1) * fracToRemove)
	const messagesToRemove = rawMessagesToRemove - (rawMessagesToRemove % 2)
	const remainingMessages = messages.slice(messagesToRemove + 1)
	truncatedMessages.push(...remainingMessages)

	return truncatedMessages
}

/**
 * Conditionally truncates the conversation messages if the total token count
 * exceeds the model's limit, considering the size of incoming content.
 *
 * @param {Anthropic.Messages.MessageParam[]} messages - The conversation messages.
 * @param {number} totalTokens - The total number of tokens in the conversation (excluding the last user message).
 * @param {number} contextWindow - The context window size.
 * @param {number} maxTokens - The maximum number of tokens allowed.
 * @param {ApiHandler} apiHandler - The API handler to use for token counting.
 * @returns {Anthropic.Messages.MessageParam[]} The original or truncated conversation messages.
 */

type TruncateOptions = {
	messages: Anthropic.Messages.MessageParam[]
	totalTokens: number
	contextWindow: number
	maxTokens?: number | null
	apiHandler: ApiHandler
	contentSummaries?: Map<string, string> // Added to receive summaries
}

/**
 * Conditionally truncates the conversation messages if the total token count
 * exceeds the model's limit, considering the size of incoming content.
 *
 * @param {TruncateOptions} options - The options for truncation
 * @returns {Promise<Anthropic.Messages.MessageParam[]>} The original or truncated conversation messages.
 */
export async function truncateConversationIfNeeded({
	messages,
	totalTokens,
	contextWindow,
	maxTokens,
	apiHandler,
	contentSummaries, // Destructure summaries
}: TruncateOptions): Promise<Anthropic.Messages.MessageParam[]> {
	// Calculate the maximum tokens reserved for response
	const reservedTokens = maxTokens || contextWindow * 0.2

	// Estimate tokens for the last message (which is always a user message)
	const lastMessage = messages[messages.length - 1]
	const lastMessageContent = lastMessage.content
	const lastMessageTokens = Array.isArray(lastMessageContent)
		? await estimateTokenCount(lastMessageContent, apiHandler)
		: await estimateTokenCount([{ type: "text", text: lastMessageContent as string }], apiHandler)

	// Calculate total effective tokens (totalTokens never includes the last message)
	const effectiveTokens = totalTokens + lastMessageTokens

	// Calculate available tokens for conversation history
	// Truncate if we're within TOKEN_BUFFER_PERCENTAGE of the context window
	const allowedTokens = contextWindow * (1 - TOKEN_BUFFER_PERCENTAGE) - reservedTokens

	// Determine if truncation is needed
	if (effectiveTokens > allowedTokens) {
		console.log(
			`[Truncation] Need to truncate. Effective tokens ${effectiveTokens} > Allowed tokens ${allowedTokens}`,
		)
		// Attempt to summarize first, then truncate if still needed
		return summarizeAndTruncateConversation(messages, contentSummaries ?? new Map(), apiHandler, allowedTokens)
	} else {
		// No truncation needed
		return messages
	}
}

/**
 * Tries to reduce token count by replacing tagged content with summaries.
 * If still over the limit after summarization, performs standard truncation.
 *
 * @param messages The full message history.
 * @param contentSummaries A map of content IDs to their summaries.
 * @param apiHandler API handler for token counting.
 * @param allowedTokens The maximum allowed tokens for the context.
 * @returns The potentially summarized and/or truncated messages.
 */
async function summarizeAndTruncateConversation(
	messages: Anthropic.Messages.MessageParam[],
	contentSummaries: Map<string, string>,
	apiHandler: ApiHandler,
	allowedTokens: number,
): Promise<Anthropic.Messages.MessageParam[]> {
	if (messages.length <= 2) {
		// Cannot summarize or truncate further
		return messages
	}

	const firstMessage = messages[0]
	const lastMessage = messages[messages.length - 1]
	const middleMessages = messages.slice(1, -1)

	let summarizationApplied = false
	const summarizedMiddleMessages: Anthropic.Messages.MessageParam[] = []

	const tagRegex = /(<tagged_content id="([^"]+)">)([\s\S]*?)(<\/tagged_content>)/g

	for (const message of middleMessages) {
		let modifiedMessage = { ...message } // Create a copy to modify
		if (message.role === "user" && Array.isArray(message.content)) {
			const newContent: Anthropic.Messages.ContentBlock[] = []
			let messageModified = false
			for (const block of message.content) {
				if (block.type === "text") {
					let originalText = block.text
					const replacedText = originalText.replace(
						tagRegex,
						(match, openingTag, id, _content, closingTag) => {
							const summary = contentSummaries.get(id)
							if (summary) {
								summarizationApplied = true
								messageModified = true
								console.log(`[Summarization] Applying summary for ID: ${id}`)
								return `[Content for part ${id} was summarized: ${summary}]`
							}
							return match // Return original match if no summary found
						},
					)
					// Ensure we create a new block object if text changed and cast appropriately
					newContent.push(
						(replacedText !== originalText
							? { ...block, text: replacedText }
							: block) as Anthropic.Messages.ContentBlock,
					)
				} else {
					newContent.push(block as Anthropic.Messages.ContentBlock) // Keep non-text blocks as is, cast type
				}
			}
			if (messageModified) {
				// Ensure we create a new message object if content changed
				modifiedMessage.content = newContent
			}
		}
		summarizedMiddleMessages.push(modifiedMessage)
	}

	if (!summarizationApplied) {
		// No summaries could be applied, perform standard truncation
		console.log("[Truncation] No summaries applied, performing standard truncation.")
		return truncateConversation(messages, 0.5)
	}

	const summarizedMessages = [firstMessage, ...summarizedMiddleMessages, lastMessage]

	// Recalculate total tokens for the summarized conversation
	let summarizedTokens = 0
	for (const msg of summarizedMessages) {
		const content = msg.content
		try {
			summarizedTokens += Array.isArray(content)
				? await estimateTokenCount(content, apiHandler)
				: await estimateTokenCount([{ type: "text", text: content as string }], apiHandler)
		} catch (error) {
			console.error("[Summarization] Error estimating token count for message:", msg, error)
			// If counting fails for a message, add a high penalty or handle appropriately
			summarizedTokens += 1000 // Add arbitrary penalty
		}
	}

	console.log(`[Summarization] Tokens after summarization: ${summarizedTokens}`)

	// If still over the limit after summarization, apply standard truncation
	if (summarizedTokens > allowedTokens) {
		console.log("[Truncation] Still over limit after summarization, performing standard truncation.")
		return truncateConversation(summarizedMessages, 0.5)
	} else {
		console.log("[Summarization] Summarization sufficient, no further truncation needed.")
		return summarizedMessages // Summarization was enough
	}
}
