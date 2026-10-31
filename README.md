> Chinese version: [README.zh.md](README.zh.md) ｜ Step-by-step release notes: [docs/release-v0.2.0.md](docs/release-v0.2.0.md)

# dsh-plugin-openai-relay

**One-stop relay onboarding for [DeepSeek Harness](https://github.com/deepseek-ai/dsh).**

Install the plugin → open one page → paste three values (relay URL, chat key, image key) → save.
**No YAML, no manifest editing, no restart.**

| Capability | Provided by | What this plugin adds |
| --- | --- | --- |
| Chat (GPT etc.) | its own `openai-relay` provider (bundled adapter, OpenAI Chat Completions + SSE) | registers the provider route + stores key/endpoint |
| Images (gpt-image etc.) | [`dsh-image-gen`](https://www.npmjs.com/package/dsh-image-gen) | points its `openai-compat` channel at the same relay and stores the key |

> v0.1 was config-only. From v0.2 there is a `/relay-setup` page, so a non-technical user needs three steps.

---

## 1. Before you start

| You need | How to check |
| --- | --- |
| DSH (desktop or CLI) | the app opens; tested on desktop 0.2.1-rc.5 |
| An OpenAI-compatible relay | APIKEY.FAN, one-api, new-api, LiteLLM — anything OpenAI-compatible |
| Quota and two keys on that relay | one for chat, one for images (some relays share a single key) |
| `dsh-image-gen` installed in the profile, if you want images | chat works without it; the setup page just skips the image section |

Note your **profile name**: `desktop` for the desktop app, `web` for the CLI. Replace `web` below as needed.

---

## 2. Install the plugin (pick one of three ways)

### Option A — from GitHub (recommended, no npm account needed)

```powershell
# 1) Install into your profile (the installer appends dsh.profile.bundles for you)
dsh plugin --profile web add github:fyjvjvh555-dot/dsh-plugin-openai-relay

# 2) Restart DSH once so the plugin loads

# 3) Verify: seeing the package name means it is installed
dsh --profile web --dump-config | Select-String "dsh-plugin-openai-relay"
```

Pin a version for production:

```powershell
# The #v0.2.0 suffix locks this release; later repo changes will not affect it
dsh plugin --profile web add github:fyjvjvh555-dot/dsh-plugin-openai-relay#v0.2.0
```

> Requires `git` on PATH (Git for Windows). The first run opens a GitHub authorization window.

### Option B — from the release tarball (no git required)

```powershell
# 1) Download dsh-plugin-openai-relay-0.2.0.tgz from the release Assets
#    e.g. saved to D:\Downloads

# 2) Install from the local file
dsh plugin --profile web add D:\Downloads\dsh-plugin-openai-relay-0.2.0.tgz

# 3) Restart DSH once
```

### Option C — from npm (once this package is published)

```powershell
# One command; afterwards it is also searchable in the DSH plugin marketplace
dsh plugin --profile web add dsh-plugin-openai-relay
```

All three end up identical; to upgrade, run the same command with a newer version.

---

## 3. Configure it (three steps, all in the browser)

### Step 1 — open the setup page

Your DSH address looks like `http://127.0.0.1:63749/?token=...`; replace the query with `/relay-setup`:

```
http://127.0.0.1:63749/relay-setup
```

> The port changes between launches — use whatever your window shows.
> The startup log also prints: `openai-relay: setup page at http://127.0.0.1:<port>/relay-setup`

### Step 2 — fill in three values

| Field | What to enter | Example |
| --- | --- | --- |
| Relay URL | your gateway root, ending in `/v1` | `https://api.apikey.fan/v1` |
| Chat API key | key used for chat models | `sk-xxxx` |
| Image API key | key used for image models (may be the same) | `sk-xxxx` |

The image URL defaults to the chat URL; override it on the page if they are different gateways.

### Step 3 — test, then save

```text
1. Click "Test connection" — a model list means URL and key are right
2. Click "Save & apply"
```

Takes effect immediately, no restart:

- chat: an **OpenAI Relay** group appears in the model picker;
- images: `dsh-image-gen`'s active channel flips to `relay`, so image generation just works.

---

## 4. Verify it really works

```powershell
# (1) Is the provider mounted? You should see openai-relay
dsh --profile web --dump-config | Select-String "openai-relay"
```

```text
(2) In the UI: is there an "OpenAI Relay" group in the model picker?
(3) Images: ask for a picture, or GET /plugins/dsh-image-gen/settings-health —
    {"settings":"live","liveSchema":true} means the config is live
```

---

## 5. Uninstall / roll back

```powershell
# Recommended: let the installer remove it (also drops it from bundles)
dsh plugin --profile web remove dsh-plugin-openai-relay
```

Manual:

```powershell
# 1) Delete the plugin folder
Remove-Item "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-plugin-openai-relay" -Recurse -Force

# 2) Remove its line from both dependencies and dsh.profile.bundles
notepad "$env:USERPROFILE\.dsh\profiles\web\package.json"
```

Keys can stay in the credential store (unused once the plugin is gone). To remove them as well, delete
`APIKEY_FAN_KEY` (chat) and `DSH_IMAGE_GEN_OPENAI_COMPAT_KEY_RELAY` (images) from `~/.dsh/.credentials.yaml`.

---

## 6. FAQ

| Symptom | Cause / fix |
| --- | --- |
| `/relay-setup` returns 404 | plugin not loaded: restart DSH and check `dsh.profile.bundles` contains `dsh-plugin-openai-relay` |
| Save reports `MISSING_CREDENTIAL` | the key never reached the credential store: re-enter it and save again |
| The image section says "dsh-image-gen not installed" | that profile lacks `dsh-image-gen`; chat is unaffected |
| No "OpenAI Relay" group in the model picker | DSH was not restarted, or the URL was wrong when saving |
| "Test connection" returns 404 / 401 | URL has a missing/extra `/v1`, or the key is wrong |
| Image generation reports a channel error | the relay serves no image models; set the image model list to ones it supports (e.g. `gpt-image-2`) |

---

## Reference — where the settings live

| What | Where | Notes |
| --- | --- | --- |
| both keys | `~/.dsh/.credentials.yaml` (DSH credential store) | refs `APIKEY_FAN_KEY` (chat) and `DSH_IMAGE_GEN_OPENAI_COMPAT_KEY_RELAY` (images); no plaintext in the page or in config files |
| relay URL + model list | the profile's `cordis.patch.yml` | written through DSH's `configEditor`, hot-reloaded |
| image channel | the `image-gen` row of the same patch | only upserts a `relay` channel; your other channels (own key, other gateways) are preserved |

Manual equivalent (in the profile's `cordis.patch.yml`):

```yaml
- id: dsh-plugin-openai-relay
  name: dsh-plugin-openai-relay
  config:
    displayName: My relay
    baseURL: https://api.apikey.fan/v1
    apiKeyEnv: MY_RELAY_KEY          # credential/env ref, never plaintext here
    models:
      - id: gpt-6.1-sol
        name: GPT-6.1 Sol
        contextWindow: 500000
        maxTokens: 32768
        input: [ text ]
        reasoningEfforts: { off: , minimal: minimal, low: low, medium: medium, high: high }
```

`apiKeyEnv` may point at a DSH credential ref or at an environment variable of the same name (e.g. `setx MY_RELAY_KEY sk-...`).

## Reference — config fields

| Field | Default | Meaning |
| --- | --- | --- |
| `displayName` | `OpenAI Relay` | group name in the model picker |
| `baseURL` | `https://api.apikey.fan/v1` | OpenAI-compatible root; `/chat/completions` and `/models` are appended |
| `apiKeyEnv` | `APIKEY_FAN_KEY` | credential/env ref for the key |
| `models[].id` | — | wire model id |
| `models[].name` | same as id | display name |
| `models[].contextWindow` | `262144` | context window |
| `models[].maxTokens` | `32768` | max output tokens |
| `models[].input` | `[ text ]` | modalities; the v0.2 adapter sends text only |
| `models[].reasoningEfforts` | five levels | effort map; an empty `off` value means "do not send" |
| `models[].defaultEffort` | unset | explicit default level; unset = follow the UI |

## How it works internally

1. **It never touches `llm-pi-ai`**: reusing the built-in pi-ai with a second route fails, because every `apply` registers the whole provider catalog into `ctx.llm` (`configurable provider "amazon-bedrock" is already declared`). So this plugin ships its own `LlmAdapter` (only `stream()` is mandatory) and mounts it with `ctx.llm.registerAdapter(['openai-relay'], adapter)`.
2. **Writes go through official seams**: `ctx.credentials.set(ref, key)` for keys, `ctx.configEditor.edit(entry, change)` for URL/models/image channel — the latter writes the profile patch atomically and triggers a hot reload through the Loader.
3. **The page is just an HTTP route**: `ctx.webServer.register({ kind: 'prefix', path: '/relay-setup' })`, plain HTML plus a little vanilla JS, no frontend bundling.

## Limitations (v0.2)

- Chat supports **OpenAI Chat Completions (SSE)** only; `/responses`, Anthropic Messages and native Google protocols are out of scope (use the built-in `llm-pi-ai` "custom model API" for those).
- Chat is text-only: images pasted into a conversation are replaced by a note. Image generation goes through `dsh-image-gen` and is unaffected.
- Reasoning output depends on the relay sending `reasoning_content`; if it does not, there is nothing to show.
- The image half requires `dsh-image-gen` in the target profile; otherwise the page says so and skips it.
- Requires a runtime `fetch`; on Windows with `NODE_USE_ENV_PROXY=1`, make sure the proxy is running.

## Publishing (author side)

```bash
npm publish --access public
```

Marketplace submission rules:

- keep `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` in `package.json`;
- the plugin row's `id:` in `cordis.patch.yml` **must equal the package name**, with no trailing comment on that line (the store precheck parses that line with a regex);
- `keywords` must include at least `dsh-plugin` (add `deepseek-harness` too);
- ship a README, a LICENSE and the repository URL.

## License

MIT
