# dsh-plugin-openai-relay 0.2.0 发布说明

一句话：**在 DeepSeek Harness 里接中转站，不用改配置文件——装好插件、打开一个网页、填三样东西就完事。**

- 对话：插件自带一个 OpenAI Relay 模型分组（走 OpenAI 的对话补全协议），**不会覆盖**你已有的 DeepSeek、ChatGPT 订阅等配置；
- 生图：自动把生图插件（dsh-image-gen）的活动通道指到同一个中转站；
- 密钥存进 DeepSeek Harness 的凭据库，配置文件里只留引用名，不存明文。

---

## 一、安装前先确认

| 需要什么 | 怎么检查 |
| --- | --- |
| DeepSeek Harness（桌面版或命令行版） | 能打开窗口就行，实测桌面版 0.2.1-rc.5 |
| 一个兼容 OpenAI 协议的中转站 | 爱克发（APIKEY.FAN）、one-api、new-api、LiteLLM 都行 |
| 中转站里有余额，并准备好两个密钥 | 对话一个、生图一个（有的中转站两者共用一个） |
| 想用生图功能的话：生图插件已装 | 不装也能用对话，配置页只是跳过生图那一段 |

先记住你的**配置档名字**：桌面版叫 `desktop`，命令行版默认叫 `web`。
下面的命令里写的是 `web`，请按你自己的实际情况替换。

---

## 二、安装插件（三种方式，任选一种）

### 方式一：从 GitHub 仓库直接装（推荐，不需要 npm 账号）

```powershell
# 1) 把插件装进配置档（安装器会自动登记到加载清单里，不用手工改任何文件）
dsh plugin --profile web add github:fyjvjvh555-dot/dsh-plugin-openai-relay

# 2) 重启一次 DeepSeek Harness（第一次加载插件必须重启）

# 3) 验证：这条命令能搜到插件名，就说明装好了
dsh --profile web --dump-config | Select-String "dsh-plugin-openai-relay"
```

想固定版本（正式使用推荐这么做）：

```powershell
# 末尾的 #v0.2.0 表示锁定 0.2.0 这一版，以后仓库有新提交也不会自动变
dsh plugin --profile web add github:fyjvjvh555-dot/dsh-plugin-openai-relay#v0.2.0
```

> 机器上要有 git（装了 Windows 版 Git 就有）。第一次会弹出 GitHub 授权窗口，点允许即可。

### 方式二：下载压缩包安装（机器上没有 git 也能用）

```powershell
# 1) 在本发布页最下方的附件区，下载 dsh-plugin-openai-relay-0.2.0.tgz
#    假设你存到了 D:\Downloads 目录

# 2) 用本地文件路径安装
dsh plugin --profile web add D:\Downloads\dsh-plugin-openai-relay-0.2.0.tgz

# 3) 重启一次 DeepSeek Harness
```

### 方式三：从 npm 安装（等本插件发布到 npm 之后可用）

```powershell
# 一条命令搞定；这之后在插件市场里也能直接搜到
dsh plugin --profile web add dsh-plugin-openai-relay
```

三种方式装完效果完全一样；以后升级，用同一条命令加上新的版本号即可。

---

## 三、配置（三步，全在网页里点，不用碰配置文件）

### 第 1 步：打开配置页

DeepSeek Harness 的地址栏通常长这样：`http://127.0.0.1:63749/?token=...`
把它后面那段问号参数换成 `/relay-setup`，也就是：

```
http://127.0.0.1:63749/relay-setup
```

> 端口每次启动都可能变，以你窗口地址栏里显示的为准。
> 插件启动时也会在日志里打一行：`openai-relay: setup page at http://127.0.0.1:<端口>/relay-setup`

### 第 2 步：填三个值

| 页面上的字段 | 填什么 | 举例 |
| --- | --- | --- |
| 中转站地址 | 你的网关根地址（一般以 `/v1` 结尾） | `https://api.apikey.fan/v1` |
| 对话密钥 | 用来聊天的那个密钥 | `sk-xxxx` |
| 生图密钥 | 用来画图的那个密钥（可以与上面相同） | `sk-xxxx` |

生图地址默认与对话地址一致；如果两者不是同一个网关，页面上可以单独填。

### 第 3 步：先测试，再保存

```text
① 点「测试连接」——页面列出模型列表，说明地址和密钥都对
② 点「保存并生效」
```

保存后**立即生效，不用重启**：

- 对话：模型选择器里多出「OpenAI Relay」分组，选中就能聊；
- 生图：生图插件的活动通道自动切到中转站，直接让它画图就行。

---

## 四、怎么确认真的装好了

```powershell
# ① 插件是否挂载成功（能看到 openai-relay 这个模型来源就对了）
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
# 推荐：用安装器卸载（会自动从加载清单里移除）
dsh plugin --profile web remove dsh-plugin-openai-relay
```

手工方式：

```powershell
# 1) 删掉插件目录
Remove-Item "$env:USERPROFILE\.dsh\profiles\web\node_modules\dsh-plugin-openai-relay" -Recurse -Force

# 2) 打开配置档里的清单文件，从依赖项和加载清单里各删掉一行
notepad "$env:USERPROFILE\.dsh\profiles\web\package.json"
```

密钥可以留在凭据库里（卸载插件后不会再被读取）；想一起清掉，删除凭据库里这两个引用：
`APIKEY_FAN_KEY`（对话）、`DSH_IMAGE_GEN_OPENAI_COMPAT_KEY_RELAY`（生图）。

---

## 六、常见问题

| 现象 | 原因与处理 |
| --- | --- |
| 打开配置页返回 404 | 插件没加载：确认已经重启，且加载清单里有 dsh-plugin-openai-relay |
| 保存后提示缺少密钥（`MISSING_CREDENTIAL`） | 密钥没写进凭据库：重新填一次密钥再保存 |
| 页面里生图那段显示「未安装生图插件」 | 这个配置档没装 dsh-image-gen，先装它；对话功能不受影响 |
| 模型列表里找不到「OpenAI Relay」 | 没重启，或保存时地址填错；重启后再看一次 |
| 「测试连接」报 404 或 401 | 地址少了或多了 `/v1`，或者密钥不对 |
| 画图时报通道错误 | 中转站没有生图模型；在配置页把生图模型填成网关实际支持的（例如 `gpt-image-2`） |

---

## 七、0.2.0 相对 0.1.0 的改动

- 新增 `/relay-setup` 配置页：一个表单同时配好对话和生图，还能「测试连接」；
- 密钥改存到凭据库，配置文件里不再需要手填密钥；
- 生图侧自动接管中转站通道（你原有的其它通道原样保留）；
- 对话侧模型改为纯文本声明，不再谎报支持图片输入；
- 默认推理档位改为「不强制」，只有配置里显式写了才生效。

## 八、已知限制

- 对话只支持 OpenAI 的对话补全协议（流式返回）；`/responses`、Anthropic、Google 原生协议不在支持范围内，那类需求请用内置的「自定义模型接口」；
- 对话侧只发文本：贴进去的图片会被替换成一句说明文字（生图走生图插件，不受影响）；
- 思考过程是否显示，取决于中转站有没有下发推理内容；
- 生图部分要求目标配置档已装生图插件，没装时页面会提示并跳过；
- 需要运行环境里可用的网络请求能力；Windows 上如果设置了走系统代理，请保证代理正在运行。

---

完整文档见仓库根目录的中文说明（README.zh.md）。
