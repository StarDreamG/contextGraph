import { writeFileSync } from 'node:fs'

const shell = (title, subtitle, body) => `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body { margin:0; background:#0b0f14; color:#c9d1d9;
    font: 15px/1.75 "SF Mono","Menlo","Monaco","PingFang SC","Hiragino Sans GB",monospace;
    padding:56px 64px; }
  .kicker { color:#7d8590; font-size:13px; letter-spacing:.12em; text-transform:uppercase; }
  h1 { font-size:22px; margin:10px 0 6px; color:#e6edf3; font-weight:600; }
  .sub { color:#8b949e; font-size:14px; margin-bottom:34px; }
  pre { margin:0; white-space:pre-wrap; }
  .card { background:#11161d; border:1px solid #21262d; border-radius:10px; padding:30px 34px; }
  .head { color:#e6edf3; font-weight:600; }
  .dim { color:#7d8590; }
  .ok { color:#3fb950; }
  .warn { color:#d29922; }
  .key { color:#58a6ff; }
  .quote { color:#a5d6ff; }
</style></head><body>
<div class="kicker">DeepSeek Harness · 插件 dsh-contextgraph</div>
<h1>${title}</h1>
<div class="sub">${subtitle}</div>
<div class="card"><pre>${body}</pre></div>
</body></html>`

const status = `<span class="head">ContextGraph · /Users/apple/personal/contextGraph</span>
状态：<span class="warn">可用：HEAD 已变但源码未改</span>（4 个月前索引）（可信度 <span class="ok">high</span>）
规模：40 源文件 / 411 块 / 906 节点 / 1306 边
上次索引：2026-07-07T06:29:32.418Z（4 个月前）
索引时 HEAD：<span class="key">11a750e5</span>，当前 HEAD：<span class="key">485f0dc8</span>
说明：HEAD 变了但源文件没变（切换分支/合并/变基），记忆仍然有效，无需重新索引。
<span class="dim">—— 同一条库，上游 CLI 在这里判 Stale / Low，因为它的判据是 "HEAD 动过"。</span>`

const recall = `<span class="head">ContextGraph · FirefightingAgent · 检索：“部署” · 新鲜（11 天前索引）</span>
[1] 规则 <span class="warn">P0</span> 171 部署拓扑
    来源 docs/handoff/2026-07-26-pc-coze-chunked-report-agent-handoff.md:78-86
    - 主机：<span class="quote">192.168.20.171</span>，用户 <span class="quote">sjkj</span>
    - 目录：<span class="quote">/home/sjkj/gf/FirefightingAgent</span>
    - Compose：仅 <span class="quote">-p firefighting-agent</span>，端口 <span class="quote">61202</span>→8787
    - 禁止碰 Compose <span class="quote">current</span>、端口 <span class="quote">61192</span>、<span class="quote">current_mysql_data</span>
    - 公网：<span class="key">https://180.168.178.174:61202/</span>

[2] 规则 <span class="warn">P0</span> 171 部署约束
    来源 README.md:123-145
    - 所有 Compose 命令必须显式使用 <span class="quote">docker compose -p firefighting-agent</span>
    - 不得修改智策星 Compose 的端口与数据卷

[3] 规则 <span class="warn">P0</span> 固定事实
    <span class="dim">…… 共 3 条 · 14ms</span>`

const brief = `<span class="quote">&lt;contextgraph-memory project="FirefightingAgent"&gt;</span>
这份项目记忆来自 .contextgraph（新鲜（11 天前索引））。
<span class="key">必守规则：</span>
• <span class="warn">P0</span> Global Constraints — 固定入口为 <span class="quote">https://180.168.178.174:61202</span>。不修改 171 Docker、
  Compose、端口 61202、NAT 或 <span class="quote">current</span> 项目。（docs/superpowers/plans/2026-08-11-android-fixed-server-base.md:11）
• <span class="warn">P0</span> 171 部署拓扑 — 主机 <span class="quote">192.168.20.171</span>，用户 <span class="quote">sjkj</span>，目录
  <span class="quote">/home/sjkj/gf/FirefightingAgent</span>，Compose 仅 <span class="quote">-p firefighting-agent</span>，端口 <span class="quote">61202</span>→8787。（docs/handoff/…:78）
<span class="key">环境要点：</span>
• <span class="ok">P2</span> 固定部署参数 — Docker Compose 项目名 <span class="quote">firefighting-agent</span>，171 内网地址 <span class="quote">192.168.20.171</span>。（AGENTS.md:27）
细节可用 contextgraph_recall 检索（可按 file/module）；本次结论用 contextgraph_handoff 写回。
<span class="quote">&lt;/contextgraph-memory&gt;</span>
<span class="dim">—— 889 字，会话创建时自动注入，不唤醒 agent，不占用户额度。</span>`

writeFileSync('screenshots/status.html', shell('改一个分支，记忆不该变成“不可信”', 'contextgraph_status — 三态新鲜度', status))
writeFileSync('screenshots/recall.html', shell('改代码前，先问这个项目踩过什么坑', 'contextgraph_recall — 带来源与行号', recall))
writeFileSync('screenshots/brief.html', shell('会话一开，就知道哪些线不能踩', 'agent/created — 自动注入项目记忆', brief))
console.log('html written')
