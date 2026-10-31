/**
 * dsh-plugin-openai-relay
 *
 * Two things in one package:
 *
 * 1. an LLM provider route ("openai-relay") that speaks the plain OpenAI Chat
 *    Completions wire protocol (SSE streaming) against any OpenAI-compatible
 *    relay / gateway endpoint, so the harness can use relay-hosted models
 *    (for example APIKEY.FAN <https://api.apikey.fan/v1>) without a second
 *    copy of the built-in `llm-pi-ai` plugin;
 * 2. a single setup page (`/relay-setup`) that stores both the chat key and the
 *    image-generation key through the credentials seam, and points
 *    `dsh-image-gen` at the same relay — so an end user pastes keys once
 *    instead of editing YAML manifests.
 *
 * The plugin owns its own adapter, so it never touches or overrides the
 * `llm-pi-ai` row a profile already uses.
 */

import {
	LlmAdapter,
	LlmError,
	ReasoningEffortId,
	assertUsableApiKey,
	attributionHeaders,
} from '@deepseek-ai/dsh-llm';
import { renderPage } from './setup-page.js';

/** Cordis plugin name; must equal the package name and the patch row id. */
const name = 'dsh-plugin-openai-relay';

/** Services this plugin needs before `apply` runs. */
const inject = ['llm'];

/** The single provider route this adapter owns. */
const PROVIDER = 'openai-relay';

/** Route of the one-page setup form. */
const SETUP_PATH = '/relay-setup';

/** Loader row id of the image plugin this setup page also configures. */
const IMAGE_ROW_ID = 'image-gen';

/** Channel id this plugin maintains inside the image plugin. */
const IMAGE_CHANNEL_ID = 'relay';

/** Credential reference the image channel resolves its key from. */
const IMAGE_KEY_REF = 'DSH_IMAGE_GEN_OPENAI_COMPAT_KEY_RELAY';

/** Image models offered when the profile declares none yet. */
const DEFAULT_IMAGE_MODELS = ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'gpt-image-2', 'gpt-image-1'];

/** Console tag for the few diagnostics that have nowhere else to go. */
const LOG_TAG = '[dsh-plugin-openai-relay]';

/** Default relay endpoint (APIKEY.FAN ships an OpenAI-compatible surface). */
const DEFAULT_BASE_URL = 'https://api.apikey.fan/v1';

/** Default credential reference; the value itself never lives in the package. */
const DEFAULT_API_KEY_ENV = 'APIKEY_FAN_KEY';

/** Selectable reasoning levels, in the order the picker shows them. */
const DEFAULT_EFFORTS = [
	{ id: 'off', name: 'Off' },
	{ id: 'minimal', name: 'Minimal' },
	{ id: 'low', name: 'Low' },
	{ id: 'medium', name: 'Medium' },
	{ id: 'high', name: 'High' },
];

/** Models shipped as defaults; a profile may replace the whole list in its own patch. */
const DEFAULT_MODELS = [
	{ id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', contextWindow: 500000, maxTokens: 32768 },
	{ id: 'gpt-6.1-terra', name: 'GPT-6.1 Terra', contextWindow: 500000, maxTokens: 32768 },
	{ id: 'gpt-6-sol', name: 'GPT-6 Sol', contextWindow: 272000, maxTokens: 32768 },
	{ id: 'gpt-6-astra', name: 'GPT-6 Astra', contextWindow: 272000, maxTokens: 32768 },
	{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', contextWindow: 272000, maxTokens: 32768 },
	{ id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', contextWindow: 272000, maxTokens: 32768 },
];

/**
 * Normalize the deployment configuration into one detached snapshot.
 * The row config is plain YAML, so every field is optional here.
 * @param {object | undefined} raw - live plugin configuration.
 * @returns {{ baseURL: string, apiKeyEnv: string, displayName: string, models: Array<object> }}
 */
function readConfig(raw) {
	const config = raw ?? {};
	const baseURL = String(config.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
	const apiKeyEnv = String(config.apiKeyEnv ?? DEFAULT_API_KEY_ENV);
	const displayName = String(config.displayName ?? 'OpenAI Relay');
	const declared = Array.isArray(config.models) && config.models.length > 0 ? config.models : DEFAULT_MODELS;
	const models = declared.map((model) => ({
		id: String(model.id),
		name: String(model.name ?? model.id),
		contextWindow: Number(model.contextWindow ?? 262144),
		maxTokens: Number(model.maxTokens ?? 32768),
		input: Array.isArray(model.input) ? model.input.map(String) : ['text'],
		efforts: effortList(model),
		defaultEffort: model.defaultEffort === undefined ? undefined : String(model.defaultEffort),
	}));
	return { baseURL, apiKeyEnv, displayName, models };
}

/**
 * Read the configured reasoning levels of one model.
 * @param {object} model - one declared model profile.
 * @returns {Array<{ id: string, name: string }>}
 */
function effortList(model) {
	const declared = model.reasoningEfforts;
	if (declared === undefined || declared === null) return DEFAULT_EFFORTS;
	if (Array.isArray(declared)) {
		return declared.map((entry) =>
			typeof entry === 'string'
				? { id: entry, name: entry.charAt(0).toUpperCase() + entry.slice(1) }
				: { id: String(entry.id), name: String(entry.name ?? entry.id) },
		);
	}
	return Object.keys(declared).map((id) => ({
		id,
		name: id.charAt(0).toUpperCase() + id.slice(1),
	}));
}

/**
 * Escape the *content* of a path segment only as far as the relay needs.
 * @param {unknown} value - raw identifier.
 * @returns {string} the trimmed identifier.
 */
function asId(value) {
	return String(value ?? '').trim();
}

/**
 * Project harness text blocks into one plain string.
 * @param {readonly object[]} content - message content blocks.
 * @returns {string}
 */
function textOf(content) {
	return (content ?? [])
		.filter((block) => block !== null && typeof block === 'object' && block.type === 'text')
		.map((block) => block.text)
		.join('');
}

/**
 * Project harness user content into an OpenAI `content` value.
 * Images and files are not uploaded by this adapter; they are named inline so
 * the model at least learns that something was attached.
 * @param {readonly object[]} content - message content blocks.
 * @returns {string | object[]}
 */
function userContent(content) {
	const parts = [];
	for (const block of content ?? []) {
		if (block === null || typeof block !== 'object') continue;
		if (block.type === 'text') parts.push({ type: 'text', text: block.text });
		else if (block.type === 'image') parts.push({ type: 'text', text: '[an image was attached but this provider route is text-only]' });
		else if (block.type === 'file') parts.push({ type: 'text', text: '[a file was attached but this provider route is text-only]' });
	}
	if (parts.length === 1) return parts[0].text;
	return parts;
}

/**
 * Build the `messages` array of one Chat Completions request.
 * @param {object} options - harness generate options.
 * @returns {object[]}
 */
function wireMessages(options) {
	const wire = [];
	if (typeof options.system === 'string' && options.system.length > 0) {
		wire.push({ role: 'system', content: options.system });
	}
	for (const message of options.messages ?? []) {
		if (message === null || typeof message !== 'object') continue;
		if (message.role === 'system') {
			const text = textOf(message.content);
			if (text.length > 0) wire.push({ role: 'system', content: text });
			continue;
		}
		if (message.role === 'user') {
			wire.push({ role: 'user', content: userContent(message.content) });
			continue;
		}
		if (message.role === 'assistant') {
			const text = textOf(message.content);
			const calls = (message.content ?? []).filter((block) => block !== null && typeof block === 'object' && block.type === 'tool-call');
			const entry = { role: 'assistant', content: text.length > 0 ? text : null };
			if (calls.length > 0) {
				entry.tool_calls = calls.map((call) => ({
					id: asId(call.id),
					type: 'function',
					function: { name: String(call.name), arguments: String(call.arguments ?? '{}') },
				}));
			}
			wire.push(entry);
			continue;
		}
		if (message.role === 'tool') {
			wire.push({
				role: 'tool',
				tool_call_id: asId(message.toolCallId),
				content: textOf(message.content) || (message.isError === true ? 'tool failed' : ''),
			});
		}
	}
	return wire;
}

/**
 * Build the request body of one Chat Completions call.
 * @param {object} config - normalized deployment configuration.
 * @param {object} options - harness generate options.
 * @returns {object}
 */
function requestBody(config, options) {
	const body = {
		model: String(options.model),
		messages: wireMessages(options),
		stream: true,
		stream_options: { include_usage: true },
	};
	if (typeof options.maxTokens === 'number' && options.maxTokens > 0) body.max_tokens = options.maxTokens;
	if (typeof options.temperature === 'number') body.temperature = options.temperature;
	if (Array.isArray(options.stop) && options.stop.length > 0) body.stop = options.stop;
	const tools = Array.isArray(options.tools) ? options.tools : [];
	if (tools.length > 0) {
		body.tools = tools.map((tool) => ({
			type: 'function',
			function: {
				name: String(tool.name),
				description: String(tool.description ?? ''),
				parameters: tool.parameters ?? { type: 'object', properties: {} },
			},
		}));
		body.tool_choice = 'auto';
	}
	const effort = options.reasoningEffort === undefined ? undefined : String(options.reasoningEffort);
	if (effort !== undefined && effort.length > 0 && effort !== 'off') body.reasoning_effort = effort;
	return body;
}

/**
 * Map one provider `finish_reason` onto the harness vocabulary.
 * @param {string | null | undefined} reason - provider value.
 * @param {boolean} sawToolCalls - whether the turn produced tool calls.
 * @returns {object} one entry of the harness finish-reason union.
 */
function finishKindOf(reason, sawToolCalls) {
	if (reason === 'length') return { kind: 'max-tokens' };
	if (reason === 'tool_calls' || reason === 'function_call') return { kind: 'tool-calls' };
	if (reason === 'content_filter') {
		return { kind: 'error', failure: { message: 'the relay refused the response (content_filter)', code: 'CONTENT_FILTER' } };
	}
	if (reason === null || reason === undefined) return sawToolCalls ? { kind: 'tool-calls' } : { kind: 'stop' };
	return { kind: 'stop' };
}

/**
 * Read the HTTP failure of one request as a harness error.
 * @param {Response} response - failed response.
 * @returns {Promise<LlmError>}
 */
async function httpError(response) {
	let detail = '';
	try {
		detail = (await response.text()).slice(0, 500);
	} catch {
		detail = '';
	}
	const code = response.status === 401 || response.status === 403
		? 'AUTH'
		: response.status === 429
			? 'RATE_LIMIT'
			: response.status >= 500
				? 'PROVIDER_UNAVAILABLE'
				: 'PROVIDER_ERROR';
	const message = `openai-relay: HTTP ${response.status}${detail.length > 0 ? ` — ${detail}` : ''}`;
	return new LlmError(message, code, { status: response.status });
}

/**
 * Adapter over the Chat Completions SSE protocol.
 */
class RelayAdapter extends LlmAdapter {
	/** @type {() => ReturnType<typeof readConfig>} */
	#config;

	/** @type {(ref: string) => Promise<string>} */
	#apiKey;

	/** @type {() => string | undefined} */
	#setupUrl;

	/**
	 * @param {() => ReturnType<typeof readConfig>} config - live configuration snapshot.
	 * @param {(ref: string) => Promise<string>} apiKey - credential resolver.
	 * @param {() => string | undefined} setupUrl - where a user can paste the key.
	 */
	constructor(config, apiKey, setupUrl) {
		super();
		this.#config = config;
		this.#apiKey = apiKey;
		this.#setupUrl = setupUrl;
	}

	/**
	 * Display metadata of the owned route.
	 * @param {string} provider - registered route.
	 * @returns {{ id: string, name: string }}
	 */
	providerInfo(provider) {
		return { id: provider, name: this.#config().displayName };
	}

	/**
	 * Advertise the configured catalog.
	 * @param {string} provider - registered route.
	 * @returns {Promise<object[]>}
	 */
	listModels(provider) {
		return Promise.resolve(this.#config().models.map((model) => ({
			provider,
			id: model.id,
			name: model.name,
			inputModalities: model.input,
		})));
	}

	/**
	 * Describe one configured model.
	 * @param {string} provider - registered route.
	 * @param {string} model - exact model id.
	 * @returns {Promise<object>}
	 */
	resolveModel(provider, model) {
		const config = this.#config();
		const entry = config.models.find((candidate) => candidate.id === model);
		const efforts = entry?.efforts ?? DEFAULT_EFFORTS;
		const resolved = {
			provider,
			id: model,
			name: entry?.name ?? model,
			inputModalities: entry?.input ?? ['text'],
		};
		if (entry !== undefined) {
			resolved.context = { contextWindow: entry.contextWindow };
			resolved.defaultMaxTokens = entry.maxTokens;
		}
		if (efforts.length > 0) {
			resolved.reasoning = { efforts: efforts.map((effort) => ({ id: ReasoningEffortId(effort.id), name: effort.name })) };
			// Only preselect an effort the deployment asked for: an implicit
			// "highest" default would make every turn think at full budget.
			if (entry?.defaultEffort !== undefined) resolved.reasoning.defaultEffort = ReasoningEffortId(entry.defaultEffort);
		}
		return Promise.resolve(resolved);
	}

	/**
	 * Stream one Chat Completions turn.
	 * @param {object} options - harness generate options.
	 * @returns {AsyncGenerator<object>}
	 */
	async *stream(options) {
		const config = this.#config();
		const apiKey = await this.#apiKey(config.apiKeyEnv);
		const headers = {
			'content-type': 'application/json',
			accept: 'text/event-stream',
			authorization: `Bearer ${apiKey}`,
			...attributionHeaders(),
		};
		let response;
		try {
			response = await fetch(`${config.baseURL}/chat/completions`, {
				method: 'POST',
				headers,
				body: JSON.stringify(requestBody(config, options)),
				signal: options.signal,
			});
		} catch (error) {
			if (options.signal?.aborted === true) throw error;
			throw new LlmError(`openai-relay: the request to ${config.baseURL} failed — ${String(error?.message ?? error)}`, 'NETWORK');
		}
		if (!response.ok) throw await httpError(response);
		if (response.body === null) throw new LlmError('openai-relay: the relay returned an empty body', 'PROVIDER_ERROR');

		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';
		let nextIndex = 0;
		/** @type {{ index: number, text: string } | null} */
		let textBlock = null;
		/** @type {{ index: number, text: string } | null} */
		let reasoningBlock = null;
		/** @type {Map<number, { index: number, id: string, name: string, arguments: string }>} */
		const toolBlocks = new Map();
		let sawToolCalls = false;
		let finishReason = null;
		/** @type {object | null} */
		let usage = null;
		let finished = false;

		try {
			while (!finished) {
				const chunk = await reader.read();
				if (chunk.done === true) break;
				buffer += decoder.decode(chunk.value, { stream: true });
				let boundary = buffer.indexOf('\n\n');
				while (boundary >= 0) {
					const event = buffer.slice(0, boundary);
					buffer = buffer.slice(boundary + 2);
					boundary = buffer.indexOf('\n\n');
					for (const line of event.split('\n')) {
						if (!line.startsWith('data:')) continue;
						const payload = line.slice(5).trim();
						if (payload === '[DONE]') {
							finished = true;
							break;
						}
						if (payload.length === 0) continue;
						let parsed;
						try {
							parsed = JSON.parse(payload);
						} catch {
							continue;
						}
						if (parsed.usage !== undefined && parsed.usage !== null) usage = parsed.usage;
						const choice = Array.isArray(parsed.choices) ? parsed.choices[0] : undefined;
						if (choice === undefined || choice === null) continue;
						const delta = choice.delta ?? {};
						const reasoningText = typeof delta.reasoning_content === 'string'
							? delta.reasoning_content
							: typeof delta.reasoning === 'string' ? delta.reasoning : undefined;
						if (typeof reasoningText === 'string' && reasoningText.length > 0) {
							if (reasoningBlock === null) {
								reasoningBlock = { index: nextIndex++, text: '' };
								yield { type: 'block-start', index: reasoningBlock.index, blockType: 'reasoning' };
							}
							reasoningBlock.text += reasoningText;
							yield { type: 'reasoning-delta', index: reasoningBlock.index, text: reasoningText };
						}
						if (typeof delta.content === 'string' && delta.content.length > 0) {
							if (textBlock === null) {
								textBlock = { index: nextIndex++, text: '' };
								yield { type: 'block-start', index: textBlock.index, blockType: 'text' };
							}
							textBlock.text += delta.content;
							yield { type: 'text-delta', index: textBlock.index, text: delta.content };
						}
						if (Array.isArray(delta.tool_calls)) {
							for (const call of delta.tool_calls) {
								const key = Number(call.index ?? 0);
								let block = toolBlocks.get(key);
								if (block === undefined) {
									block = { index: nextIndex++, id: '', name: '', arguments: '' };
									toolBlocks.set(key, block);
									sawToolCalls = true;
									yield { type: 'block-start', index: block.index, blockType: 'tool-call' };
								}
								const callId = typeof call.id === 'string' && call.id.length > 0 ? call.id : undefined;
								const callName = typeof call.function?.name === 'string' && call.function.name.length > 0 ? call.function.name : undefined;
								if (callId !== undefined) block.id = callId;
								if (callName !== undefined) block.name = callName;
								const argumentsDelta = typeof call.function?.arguments === 'string' ? call.function.arguments : '';
								block.arguments += argumentsDelta;
								yield {
									type: 'tool-call-delta',
									index: block.index,
									id: block.id.length > 0 ? block.id : `tool-${key}`,
									...(block.name.length > 0 ? { name: block.name } : {}),
									argumentsDelta,
								};
							}
						}
						if (typeof choice.finish_reason === 'string') finishReason = choice.finish_reason;
					}
				}
			}
		} finally {
			try {
				await reader.cancel();
			} catch {
				/* the peer may already have closed the stream */
			}
		}

		if (reasoningBlock !== null) {
			yield { type: 'block-end', index: reasoningBlock.index, block: { type: 'reasoning', text: reasoningBlock.text } };
		}
		if (textBlock !== null) {
			yield { type: 'block-end', index: textBlock.index, block: { type: 'text', text: textBlock.text } };
		}
		for (const block of toolBlocks.values()) {
			yield {
				type: 'block-end',
				index: block.index,
				block: {
					type: 'tool-call',
					id: block.id.length > 0 ? block.id : `tool-${block.index}`,
					name: block.name,
					arguments: block.arguments.length > 0 ? block.arguments : '{}',
				},
			};
		}
		if (usage !== null) {
			yield {
				type: 'usage',
				usage: {
					inputTokens: Number(usage.prompt_tokens ?? 0),
					outputTokens: Number(usage.completion_tokens ?? 0),
					...(typeof usage.total_tokens === 'number' ? { totalTokens: usage.total_tokens } : {}),
					...(typeof usage.completion_tokens_details?.reasoning_tokens === 'number'
						? { reasoningTokens: usage.completion_tokens_details.reasoning_tokens }
						: {}),
					...(typeof usage.prompt_tokens_details?.cached_tokens === 'number'
						? { cacheReadTokens: usage.prompt_tokens_details.cached_tokens }
						: {}),
				},
			};
		}
		yield { type: 'finish', reason: finishKindOf(finishReason, sawToolCalls) };
	}
}

/**
 * Resolve one credential reference through the credentials seam, then the
 * launching environment. The value never leaves this function except as a
 * request header.
 * @param {object} ctx - plugin context.
 * @param {string} ref - environment-variable-style reference.
 * @param {() => string | undefined} setupUrl - where a key can be entered.
 * @returns {Promise<string>}
 */
async function resolveApiKey(ctx, ref, setupUrl) {
	const credentials = ctx.get?.('credentials');
	if (credentials !== undefined && credentials !== null) {
		try {
			const hit = await credentials.resolve(ref);
			if (hit !== undefined && hit !== null && typeof hit.value === 'string' && hit.value.length > 0) {
				return assertUsableApiKey(hit.value, 'dsh-plugin-openai-relay', ref);
			}
		} catch (error) {
			if (error instanceof LlmError) throw error;
			console.warn(LOG_TAG, `credentials.resolve(${ref}) failed:`, error?.message ?? error);
		}
	}
	const ambient = process.env[ref];
	if (typeof ambient === 'string' && ambient.trim().length > 0) {
		return assertUsableApiKey(ambient, 'dsh-plugin-openai-relay', ref);
	}
	const where = setupUrl();
	throw new LlmError(
		`dsh-plugin-openai-relay: no API key for provider route "${PROVIDER}"; open ${where ?? `${SETUP_PATH} on the harness web server`} and paste it (or set ${ref} in the launching environment)`,
		'MISSING_CREDENTIAL',
	);
}

/* ------------------------------------------------------------------ *
 * Setup page: one form, both keys, no YAML editing.
 * ------------------------------------------------------------------ */

/**
 * Accept only absolute http(s) URLs; return them without a trailing slash.
 * @param {unknown} value - user input.
 * @returns {string | undefined}
 */
function normalizeBaseURL(value) {
	const text = String(value ?? '').trim();
	if (text.length === 0) return undefined;
	let parsed;
	try {
		parsed = new URL(text);
	} catch {
		return undefined;
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
	return text.replace(/\/+$/, '');
}

/**
 * Split a comma-separated model list.
 * @param {unknown} value - user input.
 * @returns {string[]}
 */
function parseList(value) {
	return String(value ?? '')
		.split(',')
		.map((entry) => entry.trim())
		.filter((entry) => entry.length > 0);
}

/**
 * Find one addressable loader row by id.
 * @param {object | undefined} editor - config editor service.
 * @param {string} id - loader row id.
 * @returns {object | undefined}
 */
function findEntry(editor, id) {
	if (editor === undefined || editor === null) return undefined;
	try {
		return editor.entries().find((entry) => entry.options?.id === id);
	} catch {
		return undefined;
	}
}

/**
 * Read the loader view of the image plugin, if it is installed.
 * @param {object['ctx']} ctx - plugin context.
 * @returns {object} image section of the setup page state.
 */
async function describeImage(ctx) {
	const editor = ctx.get?.('configEditor');
	const entry = findEntry(editor, IMAGE_ROW_ID);
	if (entry === undefined) {
		return { available: false, activeChannel: undefined, channels: [], models: '' };
	}
	const config = entry.options.config ?? {};
	const channels = (Array.isArray(config.openaiCompatChannels) ? config.openaiCompatChannels : []).map((channel) => ({
		id: String(channel.id ?? ''),
		label: String(channel.label ?? channel.id ?? ''),
		keyRef: String(channel.keyRef ?? ''),
		baseURL: String(channel.baseURL ?? ''),
		models: (Array.isArray(channel.models) ? channel.models : []).map(String),
		keyConfigured: false,
	}));
	const credentials = ctx.get?.('credentials');
	for (const channel of channels) {
		if (credentials === undefined || credentials === null || channel.keyRef.length === 0) continue;
		try {
			const status = await credentials.describe(channel.keyRef);
			channel.keyConfigured = status?.configured === true;
		} catch {
			channel.keyConfigured = false;
		}
	}
	const active = config.openaiCompatActiveChannel === undefined ? undefined : String(config.openaiCompatActiveChannel);
	return {
		available: true,
		activeChannel: active,
		channels,
		models: (Array.isArray(config.openaiCompatModels) ? config.openaiCompatModels : []).map(String).join(', '),
	};
}

/**
 * Collect what the setup page renders.
 * @param {object} ctx - plugin context.
 * @param {() => ReturnType<typeof readConfig>} snapshot - live chat configuration.
 * @param {object | null} flash - result of the last save.
 * @param {string} action - absolute path of the form target.
 * @returns {Promise<object>}
 */
async function describeState(ctx, snapshot, flash, action) {
	const chat = snapshot();
	const credentials = ctx.get?.('credentials');
	let keyConfigured = false;
	if (credentials !== undefined && credentials !== null) {
		try {
			keyConfigured = (await credentials.describe(chat.apiKeyEnv))?.configured === true;
		} catch {
			keyConfigured = false;
		}
	} else {
		keyConfigured = typeof process.env[chat.apiKeyEnv] === 'string' && String(process.env[chat.apiKeyEnv]).length > 0;
	}
	return {
		action,
		flash,
		chat: {
			provider: PROVIDER,
			baseURL: chat.baseURL,
			apiKeyEnv: chat.apiKeyEnv,
			keyConfigured,
			models: chat.models.map((model) => model.id).join(', '),
		},
		image: await describeImage(ctx),
	};
}

/**
 * Merge the image channel this plugin owns into one image-plugin config.
 * Every other field of that row is preserved verbatim.
 * @param {object} current - current image plugin config.
 * @param {string} baseURL - relay endpoint for images.
 * @param {string[]} models - declared image models.
 * @returns {object}
 */
function buildImageConfig(current, baseURL, models) {
	const channels = (Array.isArray(current.openaiCompatChannels) ? current.openaiCompatChannels : []).map((channel) => ({ ...channel }));
	let channel = channels.find((candidate) => candidate.id === IMAGE_CHANNEL_ID);
	if (channel === undefined) {
		channel = { id: IMAGE_CHANNEL_ID, label: '中转站' };
		channels.push(channel);
	}
	const existing = Array.isArray(channel.models) ? channel.models.map(String).filter((id) => id.length > 0) : [];
	const list = models.length > 0 ? models : existing.length > 0 ? existing : DEFAULT_IMAGE_MODELS;
	Object.assign(channel, {
		id: IMAGE_CHANNEL_ID,
		label: channel.label ?? '中转站',
		keyRef: IMAGE_KEY_REF,
		baseURL,
		model: list[0],
		// A fresh array on both sides: sharing one reference would make the YAML
		// writer emit anchors/aliases, which reads as noise in the patch file.
		models: [...list],
	});
	return {
		...current,
		provider: 'openai-compat',
		openaiCompatChannels: channels,
		openaiCompatActiveChannel: IMAGE_CHANNEL_ID,
		openaiCompatBaseURL: baseURL,
		openaiCompatModel: list[0],
		openaiCompatModels: [...list],
	};
}

/**
 * Apply one submitted form: keys go to the credentials store, endpoints and
 * channel lists go through the profile config editor (which hot-reloads).
 * @param {object} ctx - plugin context.
 * @param {() => ReturnType<typeof readConfig>} snapshot - live chat configuration.
 * @param {Record<string, string>} form - submitted fields.
 * @returns {Promise<{ ok: boolean, notes: string[], errors: string[] }>}
 */
async function saveSettings(ctx, snapshot, form) {
	const notes = [];
	const errors = [];
	const chat = snapshot();
	const credentials = ctx.get?.('credentials');
	const editor = ctx.get?.('configEditor');

	const baseURL = normalizeBaseURL(form.baseURL ?? chat.baseURL);
	if (baseURL === undefined) errors.push('对话中转站地址不是合法的 http(s) URL。');
	const chatKey = String(form.chatKey ?? '').trim();
	const imageBaseURL = normalizeBaseURL(form.imageBaseURL ?? baseURL ?? chat.baseURL) ?? baseURL;
	const imageKey = String(form.imageKey ?? '').trim();
	const imageModels = parseList(form.imageModels);

	if (chatKey.length > 0) {
		if (credentials === undefined || credentials === null) {
			errors.push('当前运行环境没有 credentials 服务，无法保存密钥；请改用环境变量。');
		} else {
			try {
				await credentials.set(chat.apiKeyEnv, chatKey);
				notes.push(`对话密钥已保存（引用名 ${chat.apiKeyEnv}）。`);
			} catch (error) {
				errors.push(`对话密钥保存失败：${error?.message ?? error}`);
			}
		}
	}

	if (baseURL !== undefined && baseURL !== chat.baseURL) {
		if (editor === undefined || editor === null) {
			errors.push('当前运行环境没有 configEditor 服务，无法更新中转站地址。');
		} else {
			try {
				const entry = findEntry(editor, name);
				if (entry === undefined) throw new Error(`找不到插件配置行 "${name}"`);
				await editor.edit(entry, (current) => ({ ...current, baseURL }));
				notes.push(`对话中转站地址已更新为 ${baseURL}。`);
			} catch (error) {
				errors.push(`对话地址更新失败：${error?.message ?? error}`);
			}
		}
	}

	if (imageKey.length > 0 && (credentials === undefined || credentials === null)) {
		errors.push('当前运行环境没有 credentials 服务，无法保存生图密钥。');
	}
	if (imageBaseURL !== undefined && imageKey.length === 0 && imageModels.length === 0) {
		// Nothing submitted for the image side: leave dsh-image-gen exactly as it is.
	} else if (imageBaseURL !== undefined) {
		if (editor === undefined || editor === null) {
			errors.push('当前运行环境没有 configEditor 服务，无法配置生图通道。');
		} else {
			const entry = findEntry(editor, IMAGE_ROW_ID);
			if (entry === undefined) {
				notes.push('没有检测到 dsh-image-gen，生图部分已跳过。');
			} else {
				try {
					await editor.edit(entry, (current) => buildImageConfig(current ?? {}, imageBaseURL, imageModels));
					notes.push(`生图通道已指向 ${imageBaseURL}（通道 ${IMAGE_CHANNEL_ID}）。`);
				} catch (error) {
					errors.push(`生图通道配置失败：${error?.message ?? error}`);
				}
			}
		}
	}

	if (imageKey.length > 0 && credentials !== undefined && credentials !== null) {
		if (findEntry(editor, IMAGE_ROW_ID) === undefined) {
			notes.push('生图密钥未保存：没有检测到 dsh-image-gen。');
		} else {
			try {
				await credentials.set(IMAGE_KEY_REF, imageKey);
				notes.push(`生图密钥已保存（引用名 ${IMAGE_KEY_REF}）。`);
			} catch (error) {
				errors.push(`生图密钥保存失败：${error?.message ?? error}`);
			}
		}
	}

	if (notes.length === 0 && errors.length === 0) notes.push('没有需要修改的内容。');
	return { ok: errors.length === 0, notes, errors };
}

/**
 * Read one request body (form-encoded or JSON) with a hard size cap.
 * @param {import('node:http').IncomingMessage} req - request.
 * @returns {Promise<Record<string, string>>}
 */
function readForm(req) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		req.on('data', (chunk) => {
			size += chunk.length;
			if (size > 65536) {
				reject(new Error('request body too large'));
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on('error', reject);
		req.on('end', () => {
			const text = Buffer.concat(chunks).toString('utf8');
			const type = String(req.headers['content-type'] ?? '');
			if (type.includes('application/json')) {
				try {
					const parsed = JSON.parse(text);
					resolve(parsed !== null && typeof parsed === 'object' ? parsed : {});
				} catch {
					reject(new Error('invalid JSON body'));
				}
				return;
			}
			const fields = {};
			for (const [key, value] of new URLSearchParams(text)) fields[key] = value;
			resolve(fields);
		});
	});
}

/**
 * Send one HTML response.
 * @param {import('node:http').ServerResponse} res - response.
 * @param {number} status - HTTP status.
 * @param {string} html - document.
 */
function sendHtml(res, status, html) {
	const body = Buffer.from(html, 'utf8');
	res.writeHead(status, {
		'content-type': 'text/html; charset=utf-8',
		'content-length': String(body.length),
		'cache-control': 'no-store',
	});
	res.end(body);
}

/**
 * Send one JSON response.
 * @param {import('node:http').ServerResponse} res - response.
 * @param {number} status - HTTP status.
 * @param {unknown} value - payload.
 */
function sendJson(res, status, value) {
	const body = Buffer.from(JSON.stringify(value), 'utf8');
	res.writeHead(status, {
		'content-type': 'application/json; charset=utf-8',
		'content-length': String(body.length),
		'cache-control': 'no-store',
	});
	res.end(body);
}

/**
 * Probe a relay endpoint for its model list, reusing the saved chat key when
 * the caller did not type a new one.
 * @param {object} ctx - plugin context.
 * @param {() => ReturnType<typeof readConfig>} snapshot - live chat configuration.
 * @param {{ baseURL?: string, apiKey?: string }} input - typed values.
 * @returns {Promise<{ ok: boolean, models: string[], error?: string }>}
 */
async function testRelay(ctx, snapshot, input) {
	const chat = snapshot();
	const baseURL = normalizeBaseURL(input.baseURL ?? chat.baseURL) ?? chat.baseURL;
	const typed = String(input.apiKey ?? '').trim();
	let key = typed;
	if (key.length === 0) {
		try {
			key = await resolveApiKey(ctx, chat.apiKeyEnv, () => undefined);
		} catch {
			return { ok: false, models: [], error: '还没有保存密钥，请先填写再测试。' };
		}
	}
	try {
		const response = await fetch(`${baseURL}/models`, {
			headers: { accept: 'application/json', authorization: `Bearer ${key}`, ...attributionHeaders() },
		});
		if (!response.ok) return { ok: false, models: [], error: `HTTP ${response.status}` };
		const payload = await response.json();
		const models = (Array.isArray(payload?.data) ? payload.data : [])
			.map((entry) => String(entry?.id ?? ''))
			.filter((id) => id.length > 0)
			.slice(0, 50);
		return { ok: true, models };
	} catch (error) {
		return { ok: false, models: [], error: String(error?.message ?? error) };
	}
}

/**
 * Serve `/relay-setup` (page) and `/relay-setup/test` (probe).
 * @param {object} ctx - plugin context.
 * @param {() => ReturnType<typeof readConfig>} snapshot - live chat configuration.
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
function createSetupHandler(ctx, snapshot) {
	return async (req, res) => {
		const url = new URL(String(req.url ?? SETUP_PATH), 'http://localhost');
		const path = url.pathname.replace(/\/+$/, '') || '/';
		const sub = path === SETUP_PATH ? '' : path.startsWith(`${SETUP_PATH}/`) ? path.slice(SETUP_PATH.length) : undefined;
		try {
			if (sub === undefined || (sub !== '' && sub !== '/test')) {
				sendJson(res, 404, { ok: false, error: 'not found' });
				return;
			}
			if (sub === '/test') {
				if (req.method !== 'POST') {
					sendJson(res, 405, { ok: false, error: 'use POST' });
					return;
				}
				const form = await readForm(req);
				sendJson(res, 200, await testRelay(ctx, snapshot, form));
				return;
			}
			if (req.method === 'GET' || req.method === 'HEAD') {
				sendHtml(res, 200, renderPage(await describeState(ctx, snapshot, null, SETUP_PATH)));
				return;
			}
			if (req.method === 'POST') {
				const form = await readForm(req);
				const flash = await saveSettings(ctx, snapshot, form);
				sendHtml(res, flash.ok ? 200 : 400, renderPage(await describeState(ctx, snapshot, flash, SETUP_PATH)));
				return;
			}
			sendJson(res, 405, { ok: false, error: 'method not allowed' });
		} catch (error) {
			console.warn(LOG_TAG, 'setup request failed:', error?.message ?? error);
			sendJson(res, 500, { ok: false, error: String(error?.message ?? error) });
		}
	};
}

/**
 * Mount the adapter on the `llm` service and the setup page on the web server.
 * @param {object} ctx - plugin context.
 * @param {object | undefined} config - row configuration.
 */
function apply(ctx, config) {
	let current = readConfig(config);
	const snapshot = () => current;
	/** Absolute URL of the setup page, known once the web server exists. */
	let setupUrl;
	const whereSetup = () => setupUrl;
	// Re-read on every loader update so a profile patch edit reaches the next
	// request without a restart; the adapter itself stays one instance.
	ctx.on?.('loader/volatile-update', () => {
		try {
			current = readConfig(config);
		} catch (error) {
			console.warn(LOG_TAG, 'configuration reload rejected:', error?.message ?? error);
		}
	});
	const adapter = new RelayAdapter(snapshot, (ref) => resolveApiKey(ctx, ref, whereSetup), whereSetup);
	ctx.llm.registerAdapter([PROVIDER], adapter);
	ctx.logger?.info?.('openai-relay: registered provider "%s" (%s)', PROVIDER, snapshot().baseURL);

	ctx.inject?.(['webServer'], (webCtx) => {
		const handler = createSetupHandler(ctx, snapshot);
		// A prefix route so `/relay-setup/test` reaches the same handler; the
		// handler itself answers 404 for anything else under the prefix.
		webCtx.effect(() => webCtx.webServer.register({ kind: 'prefix', path: SETUP_PATH, handler }), 'dsh-plugin-openai-relay: setup page');
		try {
			const origin = webCtx.webServer.getOrigin?.() ?? `http://127.0.0.1:${webCtx.webServer.port}`;
			setupUrl = `${origin}${SETUP_PATH}`;
			ctx.logger?.info?.('openai-relay: setup page at %s', setupUrl);
		} catch {
			setupUrl = undefined;
		}
	});
}

export { apply, inject, name };
