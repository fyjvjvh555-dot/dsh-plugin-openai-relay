/**
 * The one-page setup form served at `/relay-setup`.
 *
 * The page is plain HTML + inline CSS + a little vanilla JS: the plugin ships no
 * client bundle, so nothing here may depend on the harness web client.
 */

/**
 * Escape text for HTML text nodes and attribute values.
 * @param {unknown} value - raw value.
 * @returns {string}
 */
function escapeHtml(value) {
	return String(value ?? '')
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

/**
 * Render one status chip.
 * @param {boolean} ok - whether the thing is configured.
 * @param {string} yes - label when configured.
 * @param {string} no - label when missing.
 * @returns {string}
 */
function chip(ok, yes, no) {
	return `<span class="chip ${ok ? 'chip-ok' : 'chip-missing'}">${escapeHtml(ok ? yes : no)}</span>`;
}

/**
 * Render the whole setup page.
 * @param {object} state - current deployment state plus optional flash result.
 * @returns {string} full HTML document.
 */
export function renderPage(state) {
	const { chat, image, flash } = state;
	const flashHtml = flash === undefined || flash === null ? '' : renderFlash(flash);
	const imageSection = image.available
		? renderImageForm(image, flash?.imageBaseURL)
		: `<p class="note">没有检测到 <code>dsh-image-gen</code> 插件，生图配置已跳过。装上它以后回到本页刷新即可填写。</p>`;

	return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>中转站一键配置 · DeepSeek Harness</title>
<style>
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body { margin: 0; padding: 32px 16px 64px; font: 15px/1.6 -apple-system, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif; background: #f6f7f9; color: #1d2129; }
@media (prefers-color-scheme: dark) { body { background: #16181d; color: #e6e8eb; } .card { background: #1f2229 !important; border-color: #2c313a !important; } input { background: #15171c !important; color: #e6e8eb !important; border-color: #333a45 !important; } .note { color: #a9b0ba !important; } }
main { max-width: 760px; margin: 0 auto; }
h1 { font-size: 22px; margin: 0 0 6px; }
.sub { margin: 0 0 24px; color: #6b7280; }
.card { background: #fff; border: 1px solid #e3e6ea; border-radius: 12px; padding: 20px; margin-bottom: 18px; }
.card h2 { font-size: 16px; margin: 0 0 4px; display: flex; align-items: center; gap: 10px; }
.card p.hint { margin: 0 0 16px; color: #6b7280; font-size: 13px; }
label { display: block; font-size: 13px; font-weight: 600; margin: 14px 0 6px; }
input { width: 100%; padding: 9px 11px; border: 1px solid #d5d9df; border-radius: 8px; font: inherit; }
.chip { font-size: 12px; font-weight: 600; padding: 2px 9px; border-radius: 999px; }
.chip-ok { background: #e6f5ea; color: #17743a; }
.chip-missing { background: #fdecec; color: #a4262c; }
@media (prefers-color-scheme: dark) { .chip-ok { background: #16331f; color: #7ad18f; } .chip-missing { background: #3a1d1f; color: #f08c8c; } }
.row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
@media (max-width: 620px) { .row { grid-template-columns: 1fr; } }
button { font: inherit; font-weight: 600; border-radius: 9px; padding: 10px 18px; cursor: pointer; border: 1px solid transparent; }
button.primary { background: #2563eb; color: #fff; }
button.primary:hover { background: #1d4ed8; }
button.ghost { background: transparent; border-color: #cfd4db; color: inherit; margin-left: 10px; }
.note { color: #6b7280; font-size: 13px; }
code { background: #eceef1; padding: 1px 5px; border-radius: 4px; font-size: 12.5px; }
@media (prefers-color-scheme: dark) { code { background: #2a2f38; } }
.flash { border-radius: 10px; padding: 12px 14px; margin-bottom: 18px; font-size: 14px; }
.flash-ok { background: #e6f5ea; color: #14532d; border: 1px solid #b7e2c4; }
.flash-err { background: #fdecec; color: #7f1d1d; border: 1px solid #f3bdbd; }
@media (prefers-color-scheme: dark) { .flash-ok { background: #16331f; color: #a7e3b8; border-color: #245234; } .flash-err { background: #3a1d1f; color: #f5b5b5; border-color: #5c2a2d; } }
.flash ul { margin: 6px 0 0; padding-left: 20px; }
footer { margin-top: 22px; font-size: 12.5px; color: #6b7280; }
</style>
</head>
<body>
<main>
<h1>中转站一键配置</h1>
<p class="sub">填一次，对话模型和生图通道一起配好。之后在对话里选中 <strong>OpenAI Relay</strong> 或生图通道即可使用，不需要改任何 YAML。</p>
${flashHtml}

<form method="post" action="${escapeHtml(state.action)}">
<div class="card">
<h2>① 对话（GPT 模型）${chip(chat.keyConfigured, '已配置密钥', '未配置密钥')}</h2>
<p class="hint">注册的 provider 路由：<code>${escapeHtml(chat.provider)}</code> · 可用模型：${escapeHtml(chat.models)}</p>
<label for="baseURL">中转站地址</label>
<input id="baseURL" name="baseURL" value="${escapeHtml(chat.baseURL)}" placeholder="https://api.apikey.fan/v1" autocomplete="off" spellcheck="false">
<label for="chatKey">对话 API 密钥${chat.keyConfigured ? '（留空＝保持不变）' : ''}</label>
<input id="chatKey" name="chatKey" type="password" placeholder="sk-..." autocomplete="off" spellcheck="false">
<p class="note">密钥存进 DSH 的凭据库（<code>~/.dsh/.credentials.yaml</code>），引用名 <code>${escapeHtml(chat.apiKeyEnv)}</code>；不会写进插件配置，也不会出现在任何文件明文里。</p>
</div>
${imageSection}
<div>
<button class="primary" type="submit">保存并生效</button>
<button class="ghost" type="button" id="test">测试连接</button>
<span class="note" id="testResult"></span>
</div>
</form>

<footer>
保存后无需重启：对话 provider 立即可用；生图通道会热更新到 <code>dsh-image-gen</code>。<br>
本页由 <code>dsh-plugin-openai-relay</code> 提供，只在 127.0.0.1 上可达。
</footer>
</main>
<script>
const test = document.getElementById('test');
const result = document.getElementById('testResult');
test?.addEventListener('click', async () => {
	result.textContent = ' 正在请求模型列表…';
	try {
		const response = await fetch('${escapeHtml(state.action)}/test', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ baseURL: document.getElementById('baseURL').value, apiKey: document.getElementById('chatKey').value }),
		});
		const data = await response.json();
		result.textContent = data.ok ? ' 连接成功：' + data.models.slice(0, 8).join(', ') + (data.models.length > 8 ? ' …' : '') : ' 失败：' + data.error;
	} catch (error) {
		result.textContent = ' 失败：' + error.message;
	}
});
</script>
</body>
</html>`;
}

/**
 * Render the image-generation card.
 * @param {object} image - current image-gen state.
 * @param {string | undefined} fallbackBaseURL - value to re-fill after a failed save.
 * @returns {string}
 */
function renderImageForm(image, fallbackBaseURL) {
	const channel = image.channels.find((candidate) => candidate.id === image.activeChannel) ?? image.channels[0];
	const baseURL = fallbackBaseURL ?? channel?.baseURL ?? '';
	const models = (channel?.models ?? []).join(', ');
	return `<div class="card">
<h2>② 生图${chip(channel?.keyConfigured === true, '已配置密钥', '未配置密钥')}</h2>
<p class="hint">由 <code>dsh-image-gen</code> 提供 · 当前通道：<code>${escapeHtml(image.activeChannel ?? '(未设置)')}</code> · 模型：${escapeHtml(image.models)}</p>
<label for="imageBaseURL">生图中转站地址</label>
<input id="imageBaseURL" name="imageBaseURL" value="${escapeHtml(baseURL)}" placeholder="https://api.apikey.fan/v1" autocomplete="off" spellcheck="false">
<label for="imageKey">生图 API 密钥${channel?.keyConfigured === true ? '（留空＝保持不变）' : ''}</label>
<input id="imageKey" name="imageKey" type="password" placeholder="sk-..." autocomplete="off" spellcheck="false">
<label for="imageModels">可用生图模型（逗号分隔，第一个为默认）</label>
<input id="imageModels" name="imageModels" value="${escapeHtml(models)}" autocomplete="off" spellcheck="false">
</div>`;
}

/**
 * Render the result banner of one save.
 * @param {{ ok: boolean, notes: string[], errors: string[] }} flash - save result.
 * @returns {string}
 */
function renderFlash(flash) {
	if (flash.ok && flash.errors.length === 0) {
		return `<div class="flash flash-ok">已保存并生效。${flash.notes.length > 0 ? `<ul>${flash.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>` : ''}</div>`;
	}
	const lines = [...flash.errors, ...flash.notes];
	return `<div class="flash flash-err">${flash.ok ? '部分完成' : '未保存'}<ul>${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul></div>`;
}
