> 英文版见 [README.md](README.md) ｜ 逐条发布说明见 [docs/release-v0.2.0.md](docs/release-v0.2.0.md)

# dsh-plugin-openai-relay

给 [DeepSeek Harness](https://github.com/deepseek-ai/dsh) 用的**中转站一键接入**插件。

装好插件 → 打开一个网页 → 填三样东西（中转站地址、对话 key、生图 key）→ 保存完成。
**不用改 YAML，不用改 manifest，不用重启。**

| 能力 | 由谁提供 | 这个插件做了什么 |
| --- | --- | --- |
| 对话（GPT 等模型） | 插件自带 `openai-relay` provider（自写 adapter，OpenAI Chat Completions + SSE） | 注册 provider 路由 + 提供密钥/地址配置 |
| 生图（gpt-image 等） | [`dsh-image-gen`](https://www.npmjs.com/package/dsh-image-gen) | 把它的 `openai-compat` 通道指到同一个中转站，并写好密钥 |

> v0.1 只能手改配置；v0.2 起有 `/relay-setup` 页面，三步就能用。

---

## 一、安装前先确认

| 需要什么 | 怎么检查 |
| --- | --- |
| DSH（桌面版或 CLI 版） | 能打开 DSH 窗口即可，实测桌面版 0.2.1-rc.5 |
| 一个 OpenAI 兼容中转站 | APIKEY.FAN、one-api、new-api、LiteLLM 等都可以 |
| 中转站的额度和两个 key | 对话一个、生图一个（有些中转站两者共用一个 key） |
| 想用生图的话：`dsh-image-gen` 已安装 | 不装也能用对话，只是配置页会跳过生图那段 |

先记住你的 **profile 名**：桌面版是 `desktop`，CLI 默认是 `web`。下面命令里的 `web` 请按需替换。

---

## 二、安装插件（三种方式，任选一种）

### 方式 A：从 GitHub 安装（推荐，不需要 npm 账号）

```powershell
# 1) 把插件装进 profile（安装器会自动写入 dsh.profile.bundles，不用手工改 manifest）
dsh plugin --profile web add github:fyjvjvh555-dot/dsh-plugin-openai-relay

# 2) 重启一次 DSH（首次加载插件必须重启）

# 3) 验证：能搜到插件名就说明装好了
dsh --profile web --dump-config | Select-String "dsh-plugin-openai-relay"
```

想固定版本（推荐生产用）：

```powershell
# 尾巴上的 #v0.2.0 表示锁定 0.2.0 这一版，仓库以后更新也不会自动变
dsh plugin --profile web add github:fyjvjvh555-dot/dsh-plugin-openai-relay#v0.2.0
```

> 需要机器上有 `git`（装了 Git for Windows 就有）。第一次会弹 GitHub 授权窗口。

### 方式 B：下载 tgz 安装（没有 git 也能用）

```powershell
# 1) 从 Release 页的 Assets 下载 dsh-plugin-openai-relay-0.2.0.tgz
#    假设存到了 D:\Downloads 目录

# 2) 用本地文件路径安装
dsh plugin --profile web add D:\Downloads\dsh-plugin-openai-relay-0.2.0.tgz

# 3) 重启一次 DSH
```

### 方式 C：npm 安装（等本插件发布到 npm 之后可用）

```powershell
# 一条命令，之后也能在 DSH 插件市场里直接搜到
dsh plugin --profile web add dsh-plugin-openai-relay
```

三种方式装完效果完全一样；升级时用同一条命令加新版本号即可。

---

## 三、配置（三步，全在网页里点）

### 第 1 步：打开配置页

DSH 的地址栏长这样：`http://127.0.0.1:63749/?token=...`
把 `?token=...` 换成 `/relay-setup`：

```
http://127.0.0.1:63749/relay-setup
```

> 端口每次启动可能变，以你窗口地址栏里的为准。
> 启动日志里也会打印：`openai-relay: setup page at http://127.0.0.1:<端口>/relay-setup`

### 第 2 步：填三个值

| 页面上的字段 | 填什么 | 举例 |
| --- | --- | --- |
| 中转站地址 | 你的网关根地址（以 `/v1` 结尾） | `https://api.apikey.fan/v1` |
| 对话 API 密钥 | 用于聊天的 key | `sk-xxxx` |
| 生图 API 密钥 | 用于画图的 key（可与上面相同） | `sk-xxxx` |

生图地址默认与对话地址相同；两者不是同一个网关时，页面上可以单独改。

### 第 3 步：测试后保存

```text
① 点「测试连接」→ 页面列出模型列表，说明地址和 key 都对了
② 点「保存并生效」
```

保存后**立即生效，不需要重启**：

- 对话：模型选择器里多出 **OpenAI Relay** 分组，选中即可聊；
- 生图：`dsh-image-gen` 的活动通道自动切到 `relay`，直接让助手画图即可。

---

## 四、怎么确认真的配好了

```powershell
# ① 插件是否挂载成功（应该能看到 openai-relay 这个 provider）
dsh --profile web --dump-config | Select-String "openai-relay"
```

```text
② 界面自查：模型选择器里有没有「OpenAI Relay」分组
③ 生图自查：让它画一张图；或访问 /plugins/dsh-image-gen/settings-health，
   返回 {"settings":"live","liveSchema":true} 表示配置已生效
```

---

## 五、卸载与回滚

```powershell
# 推荐：用安装器卸载（会自动从 bundles 里移除）
dsh plugin --profile web remove dsh-plugin-openai-relay
```

手工方式：

```powershell
# 1) 删掉插件目录
Remove-Item "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-plugin-openai-relay" -Recurse -Force

# 2) 打开 profile 的 package.json，从 dependencies 和 dsh.profile.bundles 里各删掉一行
notepad "$env:USERPROFILE\.dsh\profiles\web\package.json"
```

密钥可以留在凭据库里（卸载插件后不会再被读取）；想一并清掉，删除 `~/.dsh/.credentials.yaml` 里这两个引用：
`APIKEY_FAN_KEY`（对话）、`DSH_IMAGE_GEN_OPENAI_COMPAT_KEY_RELAY`（生图）。

---

## 六、常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 打开 `/relay-setup` 返回 404 | 插件没加载：确认已重启，且 `dsh.profile.bundles` 里有 `dsh-plugin-openai-relay` |
| 保存后提示 `MISSING_CREDENTIAL` | 密钥没写进凭据库：重填一次密钥字段再保存 |
| 页面里生图那段显示「未安装 dsh-image-gen」 | 该 profile 没装 `dsh-image-gen`，先装它；对话功能不受影响 |
| 模型列表里找不到「OpenAI Relay」 | 没重启 DSH，或保存时地址填错；重启后再看一次 |
| 「测试连接」报 404 / 401 | 地址少了或多了 `/v1`，或 key 不对 |
| 画图时报通道错误 | 中转站没有生图模型；在配置页把生图模型列表填成网关实际支持的（如 `gpt-image-2`） |

---

## 参考：配置存在哪里

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

## 参考：配置字段

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
