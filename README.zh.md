# dsh-plugin-openai-relay

给 [DeepSeek Harness](https://github.com/deepseek-ai/dsh) 用的**中转站一键接入**插件：装好后打开一个页面，把**对话 key**、**生图 key** 和**中转站地址**填进去，点保存就全部配好——不用改 YAML、不用改 manifest、不用重启。

一个包同时干两件事：

| 能力 | 由谁提供 | 这个插件做了什么 |
| --- | --- | --- |
| 对话（GPT 等模型） | 插件自带 `openai-relay` provider（自写 adapter，OpenAI Chat Completions + SSE） | 注册 provider 路由 + 提供密钥/地址配置 |
| 生图（gpt-image 等） | [`dsh-image-gen`](https://www.npmjs.com/package/dsh-image-gen) | 把它的 `openai-compat` 通道指到同一个中转站，并写好密钥 |

> v0.1 只能手改配置；v0.2 起有 `/relay-setup` 页面，普通人三步就能用。

---

## 三步上手（终端用户）

1. **安装插件**（任选一种）
   - DSH 插件市场里搜 `dsh-plugin-openai-relay` 点安装；
   - 或命令行：`dsh plugin --profile <你的 profile> add dsh-plugin-openai-relay`；
   - 安装器会自动把 `dsh-plugin-openai-relay` 写进 profile 的 `dsh.profile.bundles`（只有手工拷 `node_modules` 时才需要自己加）。
2. **重启 DSH**（首次加载插件需要）。
3. **打开配置页**：在浏览器里把 DSH 的地址后面接上 `/relay-setup`，例如
   `http://127.0.0.1:63749/relay-setup`。
   启动日志里也会打印一行 `openai-relay: setup page at http://127.0.0.1:<端口>/relay-setup`。

页面上填三样东西：

- 中转站地址（默认 `https://api.apikey.fan/v1`，任何 OpenAI 兼容网关都行）
- 对话 API 密钥
- 生图 API 密钥（生图地址默认与上面一致，可单独改）

点「测试连接」可以立刻看到这个中转站有哪些模型；点「保存并生效」后：

- 对话侧：模型选择器里出现 **OpenAI Relay** 分组，选中即可聊；
- 生图侧：`dsh-image-gen` 的活动通道被切到 `relay`，直接让助手画图即可。

全程不需要重启。

---

## 配置存在哪里

| 内容 | 位置 | 说明 |
| --- | --- | --- |
| 两个密钥 | `~/.dsh/.credentials.yaml`（DSH 凭据库） | 引用名 `APIKEY_FAN_KEY`（对话）与 `DSH_IMAGE_GEN_OPENAI_COMPAT_KEY_RELAY`（生图）；页面与配置文件里都不会出现明文 |
| 中转站地址、模型列表 | profile 的 `cordis.patch.yml` | 由 DSH 的 `configEditor` 写入并热重载 |
| 生图通道 | 同一份 patch 的 `image-gen` 行 | 只增/改 `relay` 通道，其它通道（你自己的 key、别的网关）原样保留 |

不想用页面时也可以手改（写进 profile 的 `cordis.patch.yml`）：

```yaml
- id: dsh-plugin-openai-relay
  name: dsh-plugin-openai-relay
  config:
    displayName: 我的中转站
    baseURL: https://api.apikey.fan/v1
    apiKeyEnv: MY_RELAY_KEY          # 密钥引用名，不写明文
    models:
      - id: gpt-6.1-sol
        name: GPT-6.1 Sol
        contextWindow: 500000
        maxTokens: 32768
        input: [ text ]
        reasoningEfforts: { off: , minimal: minimal, low: low, medium: medium, high: high }
```

`apiKeyEnv` 既可以指向 DSH 凭据库里的引用名，也可以指向启动环境里已有的同名环境变量（例如 `setx MY_RELAY_KEY sk-...`）。

## 配置字段

| 字段 | 默认 | 说明 |
| --- | --- | --- |
| `displayName` | `OpenAI Relay` | 模型选择器里显示的分组名 |
| `baseURL` | `https://api.apikey.fan/v1` | OpenAI 兼容根地址，自动补 `/chat/completions`、`/models` |
| `apiKeyEnv` | `APIKEY_FAN_KEY` | 密钥引用名（凭据库或环境变量） |
| `models[].id` | — | 线上模型 id |
| `models[].name` | 同 id | 界面显示名 |
| `models[].contextWindow` | `262144` | 上下文窗口 |
| `models[].maxTokens` | `32768` | 单次输出上限 |
| `models[].input` | `[ text ]` | 模态；v0.2 的 adapter 只发文本 |
| `models[].reasoningEfforts` | 五档 | 推理档位表；`off` 的值留空表示不下发 |
| `models[].defaultEffort` | 不设 | 显式指定默认档；不设则跟随界面选择 |

## 它内部怎么做的

1. **不碰 `llm-pi-ai`**：早期方案想复用内置 pi-ai 再挂一条路由，但 pi-ai 每次 `apply` 都会把整份 provider 目录注册进 `ctx.llm`，第二个实例必然撞名（`configurable provider "amazon-bedrock" is already declared`）。所以本插件自带一个 `LlmAdapter`（最小实现只需 `stream()`），用 `ctx.llm.registerAdapter(['openai-relay'], adapter)` 挂上去。
2. **配置写入走官方 seam**：`ctx.credentials.set(ref, key)` 存密钥，`ctx.configEditor.edit(entry, change)` 改地址/模型/生图通道——后者会原子写 patch 并触发 Loader 热重载。
3. **页面就是一个 HTTP 路由**：`ctx.webServer.register({ kind: 'prefix', path: '/relay-setup' })`，纯 HTML + 少量原生 JS，不依赖前端打包。

## 限制（v0.2）

- 对话只支持 **OpenAI Chat Completions（SSE）**；`/responses`、Anthropic Messages、Google 原生协议不在范围内（那些用内置 `llm-pi-ai` 的「自定义模型 API」更合适）。
- 对话侧只发文本：贴图会被替换成一句说明文字。生图走 `dsh-image-gen`，不受此限制。
- 推理内容（`reasoning_content`）取决于中转站是否下发；不下发就没有思考过程可显示。
- 生图部分要求目标 profile 已装 `dsh-image-gen`；没装时页面会提示并跳过。
- 需要运行时可用的 `fetch`；Windows 上若配了 `NODE_USE_ENV_PROXY=1`，请保证代理在跑。

## 发布给别人（作者侧）

```bash
npm publish --access public
```

上架 DSH 商店还有几条硬性约定：

- `package.json` 里保留 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`；
- `cordis.patch.yml` 里插件行 `id:` **必须等于包名**，且该行不能写行尾注释（商店预检用正则抓这一行）；
- `keywords` 至少含 `dsh-plugin`（建议再加 `deepseek-harness`）；
- 建议提供 README + LICENSE + 仓库地址。

## License

MIT
