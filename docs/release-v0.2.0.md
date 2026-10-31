# dsh-plugin-openai-relay 0.2.0

一句话：**在 DSH 里接中转站，不用改配置文件——装好插件、打开一个网页、填三样东西就完事。**

- 对话：插件自带 `openai-relay` provider（OpenAI Chat Completions 协议），不会覆盖你已有的 DeepSeek / Codex 配置；
- 生图：自动把 `dsh-image-gen` 的活动通道指到同一个中转站；
- 密钥存进 DSH 凭据库，配置文件里只留引用名，不存明文。

---

## 一、安装前先确认

| 需要什么 | 怎么检查 |
| --- | --- |
| DSH（桌面版或 CLI 版） | 能打开 DSH 窗口即可，实测桌面版 0.2.1-rc.5 |
| 一个 OpenAI 兼容中转站 | APIKEY.FAN、one-api、new-api、LiteLLM 等都可以 |
| 中转站的额度和两个 key | 对话一个、生图一个（有些中转站两者共用一个 key） |
| 想用生图功能的话：`dsh-image-gen` 已安装 | 不装也能用对话，只是配置页会跳过生图那段 |

先记住你的 **profile 名**：桌面版是 `desktop`，CLI 默认是 `web`。下面命令里的 `web` 请按需替换。

---

## 二、安装插件（三种方式，任选一种）

### 方式 A：从 GitHub 安装（推荐，不需要 npm 账号）

```powershell
# 1) 把插件装进 profile（会自动写入 dsh.profile.bundles，不用手工改 manifest）
dsh plugin --profile web add github:fyjvjvh555-dot/dsh-plugin-openai-relay

# 2) 重启一次 DSH（首次加载插件必须重启）

# 3) 验证：这条命令能搜到插件名就说明装好了
dsh --profile web --dump-config | Select-String "dsh-plugin-openai-relay"
```

想固定版本（推荐生产用）：

```powershell
# 尾巴上的 #v0.2.0 表示锁定 0.2.0 这一版，以后仓库更新也不会自动变
dsh plugin --profile web add github:fyjvjvh555-dot/dsh-plugin-openai-relay#v0.2.0
```

> 需要机器上有 `git`（Windows 装了 Git for Windows 就有）。第一次会弹 GitHub 授权窗口。

### 方式 B：下载 tgz 安装（没有 git 也能用）

```powershell
# 1) 在本页最下面的 Assets 里下载 dsh-plugin-openai-relay-0.2.0.tgz
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

三种方式装完效果完全一样，后续升级也各自用同一条命令加新版本号即可。

---

## 三、配置（三步，全在网页里点，不用碰 YAML）

### 第 1 步：找到配置页地址

DSH 的地址栏长这样：`http://127.0.0.1:63749/?token=...`
把 `?token=...` 换成 `/relay-setup`，即：

```
http://127.0.0.1:63749/relay-setup
```

> 端口每次启动可能变，以你窗口地址栏里的为准。
> 插件启动时也会在日志里打印：`openai-relay: setup page at http://127.0.0.1:<端口>/relay-setup`

### 第 2 步：填三个值

| 页面上的字段 | 填什么 | 举例 |
| --- | --- | --- |
| 中转站地址 | 你的网关根地址（以 `/v1` 结尾） | `https://api.apikey.fan/v1` |
| 对话 API 密钥 | 用于聊天的 key | `sk-xxxx` |
| 生图 API 密钥 | 用于画图的 key（可与上面相同） | `sk-xxxx` |

生图地址默认与对话地址相同；如果两者不是同一个网关，页面上可以单独改。

### 第 3 步：测试后保存

```text
① 点「测试连接」→ 页面列出模型列表，说明地址和 key 都对了
② 点「保存并生效」
```

保存后**立即生效，不需要重启**：

- 对话：模型选择器里多出 **OpenAI Relay** 分组，选中即可聊；
- 生图：`dsh-image-gen` 的活动通道自动切到 `relay`，直接让它画图就行。

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

## 七、0.2.0 相对 0.1.0 的改动

- 新增 `/relay-setup` 配置页：一个表单同时配好对话与生图，支持「测试连接」；
- 密钥改存 DSH 凭据库（`~/.dsh/.credentials.yaml`），配置文件不再需要手填 key；
- 生图侧自动接管 `dsh-image-gen` 的 `relay` 通道（保留你原有的其他通道）；
- 对话侧模型改为纯文本声明（`input: [ text ]`），不再谎报图像输入；
- 默认推理档位改为“不强制”，只有配置里显式写 `defaultEffort` 才生效。

## 八、已知限制

- 对话只支持 **OpenAI Chat Completions（SSE）**；`/responses`、Anthropic Messages、Google 原生协议不支持（那类用 DSH 内置的「自定义模型 API」更合适）；
- 对话侧只发文本：贴图会被替换成一句说明文字（生图走 `dsh-image-gen`，不受影响）；
- 推理过程取决于中转站是否下发 `reasoning_content`，不下发就没有；
- 需要运行时可用的 `fetch`；Windows 上若设置了 `NODE_USE_ENV_PROXY=1`，请保证代理在运行。

---

完整文档见仓库根目录的 [README.zh.md](../README.zh.md)（英文版 [README.md](../README.md)）。
