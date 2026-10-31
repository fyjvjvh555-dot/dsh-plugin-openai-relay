# dsh-plugin-openai-relay

**One-stop relay onboarding for [DeepSeek Harness](https://github.com/deepseek-ai/dsh)**: install it, open one page, paste your chat key, your image key and your relay endpoint — done. No YAML, no manifest editing, no restart.

One package does both halves:

| Capability | Provided by | What this plugin adds |
| --- | --- | --- |
| Chat (GPT etc.) | its own `openai-relay` provider (bundled adapter, OpenAI Chat Completions + SSE) | registers the provider route + stores key/endpoint |
| Images (gpt-image etc.) | [`dsh-image-gen`](https://www.npmjs.com/package/dsh-image-gen) | points its `openai-compat` channel at the same relay and stores the key |

> v0.1 was config-only. From v0.2 there is a `/relay-setup` page, so a non-technical user needs three steps.

---

## Three steps (end user)

1. **Install** — pick one:
   - from the DSH plugin marketplace, search `dsh-plugin-openai-relay`;
   - or `dsh plugin --profile <your profile> add dsh-plugin-openai-relay`;
   - the installer appends `dsh-plugin-openai-relay` to `dsh.profile.bundles` automatically (only a manual `node_modules` copy needs it done by hand).
2. **Restart DSH** once, so the plugin loads.
3. **Open the setup page** — take the DSH address from your browser and append `/relay-setup`, e.g.
   `http://127.0.0.1:63749/relay-setup`.
   The startup log also prints `openai-relay: setup page at http://127.0.0.1:<port>/relay-setup`.

Fill in three values:

- relay base URL (default `https://api.apikey.fan/v1` — any OpenAI-compatible gateway works)
- chat API key
- image API key (same URL by default; can be overridden)

"Test connection" lists the models the relay actually serves. "Save" then:

- chat: an **OpenAI Relay** group appears in the model picker;
- images: `dsh-image-gen`'s active channel flips to `relay`, so image generation just works.

No restart needed.

---

## Where the settings live

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

## Settings reference

| Field | Default | Meaning |
| --- | --- | --- |
| `displayName` | `OpenAI Relay` | group name in the model picker |
| `baseURL` | `https://api.apikey.fan/v1` | OpenAI-compatible root; `/chat/completions` and `/models` are appended |
| `apiKeyEnv` | `APIKEY_FAN_KEY` | credential/env ref holding the key |
| `models[].id` | — | wire model id |
| `models[].name` | same as id | display name |
| `models[].contextWindow` | `262144` | context window |
| `models[].maxTokens` | `32768` | output token cap |
| `models[].input` | `[ text ]` | modalities; the v0.2 adapter sends text only |
| `models[].reasoningEfforts` | five levels | effort table; an empty `off` value means "do not send the field" |
| `models[].defaultEffort` | unset | pins a default effort; unset means "follow the UI" |

## How it works

1. **It leaves `llm-pi-ai` alone.** Mounting a second pi-ai row looked easy but pi-ai registers the *whole* built-in provider directory on every `apply`, so a second instance collides (`configurable provider "amazon-bedrock" is already declared`). The plugin therefore ships its own minimal `LlmAdapter` (only `stream()` is mandatory) and mounts it with `ctx.llm.registerAdapter(['openai-relay'], adapter)`.
2. **Config writes go through official seams**: `ctx.credentials.set(ref, key)` for secrets, `ctx.configEditor.edit(entry, change)` for URL/model/image-channel — the latter writes the patch atomically and lets the loader hot-reload.
3. **The page is just an HTTP route**: `ctx.webServer.register({ kind: 'prefix', path: '/relay-setup' })`, plain HTML plus a little vanilla JS, no frontend build.

## Limitations (v0.2)

- Chat speaks **OpenAI Chat Completions (SSE)** only. `/responses`, Anthropic Messages and Google-native protocols are out of scope — use the built-in `llm-pi-ai` "custom model API" form for those.
- Chat is text-only: images in the prompt are replaced with a note. Image generation goes through `dsh-image-gen` and is unaffected.
- Reasoning output depends on the relay forwarding `reasoning_content`; if it does not, no reasoning is shown.
- The image half needs `dsh-image-gen` in the target profile; the page says so and skips it otherwise.
- Requires a runtime `fetch`. On Windows with `NODE_USE_ENV_PROXY=1`, keep your proxy running.

## Publishing (author side)

```bash
npm publish --access public
```

Marketplace submission rules:

- keep `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }` in `package.json`;
- the plugin row's `id:` in `cordis.patch.yml` **must equal the package name**, and that line must not have a trailing comment (the store precheck parses it with a regex);
- include `dsh-plugin` in `keywords` (plus `deepseek-harness` by convention);
- ship a README, a LICENSE and a repository URL.

## License

MIT
