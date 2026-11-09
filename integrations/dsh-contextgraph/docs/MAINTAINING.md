# 分支与发布维护

插件源码住在 ContextGraph 主仓库的 `integrations/dsh-contextgraph/`，但对外发布用的是独立仓库，因为插件市场的校验规则要求仓库名 slug 化（`^[a-z0-9]+(-[a-z0-9]+)*$`），而主仓库名 `contextGraph` 带大写字母，过不了校验。

两边的关系是单向的：**主仓库是唯一真源，发布仓库由 `git subtree split` 生成，永远不直接改动。**

## 分支模型

| 位置 | 分支 | 作用 |
|---|---|---|
| `StarDreamG/contextGraph` | `feat/dsh-contextgraph-plugin` | 插件开发与评审，跟主仓其他改动互不干扰 |
| `StarDreamG/dsh-contextgraph` | `main` | 对外安装源，只由 subtree 生成，历史独立 |

`feat/dsh-contextgraph-plugin` 是从 `feat/contextgraph-mvp` 拉出来的。插件只依赖 `integrations/dsh-contextgraph/` 这一个目录，不 import 主仓库 `src/` 下任何模块——SQLite 用 Node 内置 `node:sqlite`，所以主仓改业务代码不会牵连插件。

## 改完代码后怎么发

```bash
cd /path/to/contextGraph

# 1. 只在插件目录上提交，不要顺手带上主仓其他改动
git add integrations/dsh-contextgraph
git commit -m "fix(dsh): ..."

# 2. 推主仓的维护分支
git push origin feat/dsh-contextgraph-plugin

# 3. 把插件目录拆成独立历史并覆盖发布仓库的 main
git subtree split --prefix=integrations/dsh-contextgraph -b dsh-publish
git push --force git@github.com:StarDreamG/dsh-contextgraph.git dsh-publish:main
```

第 3 步必须 `--force`：subtree 每次都会基于当前主仓历史重新生成 commit，hash 必然和上次不同，发布仓库的历史因此是"被覆盖"而不是"被追加"的。这是 subtree 的正常用法，不是事故。

如果哪天这个覆盖式推送变成负担（比如有人在发布仓库上开了 PR），就换成让发布仓库变主源、主仓用 submodule 引用的方式；在那之前 subtree 更省事。

## 版本与发布

`package.json` 的 `version` 用手动语义化版本，当前 `0.1.0`。发版时同步做三件事：

1. 改 `package.json` 的 `version`；
2. 在 `README.md` 顶部补一句这次改了什么；
3. `git tag dsh-contextgraph-v0.1.1` 打在 subtree commit 上（发布仓库）。

插件没有构建步骤，`index.js` 和 `lib/*.js` 就是发布产物，所以打 tag 前跑一遍：

```bash
node --check index.js && for f in lib/*.js; do node --check "$f"; done
node tests/head.mjs
node tests/smoke.mjs
```

`tests/smoke.mjs` 依赖本机存在 `.contextgraph/graph.db` 的项目，在 CI 里跑不了，属于本地回归。

## 市场入口

| 市场 | 提交方式 | 状态 |
|---|---|---|
| dsh.so | https://www.dsh.so/submit/ ，填仓库 URL，检查通过后点 Submit | 已提交，审核队列 |
| dshopen.org | 在 `polang233/dsh-plugin-index` 开 `[plugin-add]` issue | #382 |
| dsh-plugin-hub | DSH 应用内图形商店，需要 GitHub Token + npm 登录 | 未提交 |
| npm | `npm publish` | 未登录，未发布 |

改完代码后如果不重新提交，dsh.so 会因为仓库带有 `dsh-plugin` topic 而自动重新索引元数据，但**安全扫描报告不会自动更新**——重大改动后建议按上面的入口再提交一次。
