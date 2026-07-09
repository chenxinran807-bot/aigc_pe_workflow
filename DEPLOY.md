# AI 试穿 Prompt 自优化台部署说明

## 启动

```bash
npm install
PORT=5241 HOST=0.0.0.0 node server.mjs
```

访问入口：

```text
http://服务器内网IP:5241
```

## 说明

- `public/` 是前端页面。
- `server.mjs` 和 `src/` 提供上传表格、保存实验、Coze 自动复跑、导出结果等接口。
- 只部署静态文件会导致上传表格、保存记录、Coze 自动化等功能不可用。

## Coze 远程复跑 Runner

Coze 自动复跑依赖 Chrome DevTools Protocol。线上服务默认会连接服务所在环境的 `127.0.0.1:9222`；如果服务部署在容器中，需要单独准备一台可访问 Coze 且已登录的 runner 机器。

在 runner 机器上启动 Chrome：

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-address=0.0.0.0 \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/coze-runner-profile
```

然后在该 Chrome 中打开并登录 Coze 工作流页面，确认能手动点开“试运行”。

在线上服务中配置：

```bash
COZE_DEBUG_HOST=<runner内网IP或域名>
COZE_DEBUG_PORT=9222
PORT=5001
HOST=0.0.0.0
node server.mjs
```

注意：

- runner 的 9222 端口必须只对可信内网开放，不能暴露公网。
- Chrome `/json` 返回的 websocket 地址可能是 `127.0.0.1`，服务会自动改写为 `COZE_DEBUG_HOST`。
- 如果未配置 runner，线上页面仍可用于看板、上传、侦查、导出，但 Coze 自动复跑会失败。

## 表格能力

读取 Excel 依赖 Python `openpyxl`。如果部署环境没有内置 Python runtime，请安装：

```bash
python3 -m pip install openpyxl
TRYON_PYTHON=/path/to/python3 PORT=5241 HOST=0.0.0.0 node server.mjs
```

CSV/TSV 不依赖 Python。
