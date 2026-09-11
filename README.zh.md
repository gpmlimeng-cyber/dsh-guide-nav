# dsh-guide-nav

[English](README.md) | **简体中文**

DeepSeek Harness（`dsh`）插件：在**空会话**的输入框上方放一行"导购条"——把当前会话可用的技能排成可点的胶囊，点一下写进输入框，把「不知道从哪开始」引导到「按回车」。

- **HOST 半边**：一个 Remote 服务（`guideNav`），暴露当前会话可见的技能目录
- **CLIENT 半边**：在 `conversation.input.dock` 注册一行技能胶囊，点击经 `inputActions` 写入草稿
- **会话感知**：只 `session.blank` 为真时显示——会话有内容后 agent preset 与身份已锁定，此时给"选择"既无意义也干扰
- **无状态**：不缓存技能目录，切换会话即重拉，避免短暂显示上一个会话的目录

## 目录结构

```
dsh-guide-nav/
├── package.json          # npm 包清单 + dsh.bundle / dsh.client 声明
├── tsconfig.json         # 严格模式类型检查配置（tsc --noEmit）
├── tsdown.config.ts      # 构建：HOST 库（lib/）+ 客户端 bundle（lib/client.js）
├── cordis.patch.yml      # bundle 配置层：插入插件行
├── README.md             # 英文自述
├── README.zh.md          # 中文自述（本文件）
├── docs/                 # 设计与开发文档（见 docs/README.md）
└── src/
    ├── index.ts          # HOST 半边：GuideNavService（@Remote 暴露技能目录）
    └── client/           # 浏览器半边
        ├── index.ts      # client 入口：inject + apply，组装注册
        ├── constants.ts  # 槽位常量与选址依据
        ├── guide-strip.ts# 导航条组件（本插件核心）
        └── styles.ts     # 一次性注入的 <style>（中性灰，明暗自适应）
```

## 快速开始

### 作为 bundle 安装（给用户用）

```sh
# 本地目录
dsh plugin --profile web add /path/to/dsh-guide-nav

# 或直接从 GitHub 安装（替换为你自己的仓库）
dsh plugin --profile web add github:you/dsh-guide-nav
```

GitHub 安装拉取的是**源码**，pnpm 会运行 `prepare`（即 `tsdown`）构建 `lib/`；pnpm ≥10 首次会拒绝执行 git 依赖的 prepare，把 pnpm 打印的包名加进 profile 的 `pnpm-workspace.yaml` 后重试：

```yaml
allowBuilds:
  dsh-guide-nav: true
```

> 该 allowlist 相当于授权在安装时执行该包的代码，只应允许你信任的源码，并建议锁定 commit：`github:you/dsh-guide-nav#<sha>`。

验证配置层并启动：

```sh
dsh --profile web --dump-config   # 应看到 "# == dsh-guide-nav" 层
dsh --profile web
```

### 手动装进已有 profile

若 profile 不是由 `dsh plugin add` 管理的（例如 `~/.dsh/profiles/desktop`），三处都要改：

```jsonc
// ~/.dsh/profiles/<name>/package.json
"dependencies": { "dsh-guide-nav": "link:/abs/path/to/dsh-guide-nav" },
"dsh": { "profile": { "bundles": [ /* …, */ "dsh-guide-nav" ] } }
```

```yaml
# ~/.dsh/profiles/<name>/pnpm-lock.yaml —— importers.dependencies 下
dsh-guide-nav:
  specifier: link:/abs/path/to/dsh-guide-nav
  version: link:../../../abs/path/to/dsh-guide-nav
```

> ⚠️ **lockfile 条目不能省**：`pnpm install` 会把不在 lockfile 里的依赖回滚，只改 `package.json` 会被静默撤销（输出仍是 "Already up to date"）。

**`dsh.profile.bundles` 变更不是热更新，必须重启 DSH。**

### 本地开发

```sh
npm install
npm run build      # 产物 lib/index.js + lib/client.js
npm run typecheck
```

开发循环内验证浏览器半边：改完 `src/client/` 重新 `npm run build`，然后重启 DSH（或刷新页面，取决于 profile 的 `patchReload`）。

## 配置

```yaml
# cordis.patch.yml
- insert:
    - id: dsh-guide-nav
      name: dsh-guide-nav
      config:
        maxSkills: 12              # 导航条最多显示多少个技能胶囊
        showOnActiveSession: false # 是否在非空会话也显示
```

| 字段 | 默认值 | 含义 |
|---|---|---|
| `maxSkills` | `12` | 胶囊数量上限，超出截断（当前实现由 HOST 侧返回全量、UI 侧截断） |
| `showOnActiveSession` | `false` | 是否在非空会话也显示。默认只在空会话显示 |

## 浏览器半边（client）是怎么工作的

- `package.json` 声明 `dsh.client: { platform: "web" }` + `exports["./client"]` → dsh 的 client-modules 扫描到后，把 `lib/client.js` 作为浏览器插件加载；
- client 入口（`src/client/index.ts`）声明 `inject = ['slots', 'remote']`，在 `apply` 里注入样式并注册导航条；
- 注册目标是 `conversation.input.dock`——会话级 `list` 槽位，渲染在输入卡片**上方**，props 带 `inputActions`（写草稿）与 `useSession`（读会话状态）。`order: 30` 排在内置 `todo`(0) / `goal`(10) / `queue`(20) 之后；
- 用 `ctx.slots.inject(...)` 包一层注册，使插槽声明尚未就绪时挂起而不是报错；
- HOST 侧数据经 `ctx.remote.guideNav.listSkills(...)` 获取——Gateway 由 HOST 半边的 `@Remote` 自动生成 wire 端点；
- 运行时 client 半边只依赖 `react`（浏览器平台模块表提供），其余一律走 ctx 服务，**不 import 任何 `@deepseek-ai` 客户端包**——改本插件时请保持这个纪律。

## 设计取舍

**为什么逐级展开而不是五层堆叠**：WorkBuddy 的输入链路是五层同时铺开（应用 → 模式 → 胶囊 → 标签 → 案例），因为它的用户不知道自己想要什么；DSH 的用户是开发者，知道自己要什么、只想知道有没有。所以本插件折叠态**只占一行**。

**为什么不提供「模式/persona」层**：DSH 的 persona 绑在 agent preset 上，开会话前已定，且会话一旦产出内容即 `agent-preset/locked`。会话中途再选一次身份，语义上是自相矛盾的。模式差异由 preset 承载。

**为什么写草稿而不是直接发送**：用户选中技能后还要补自己的细节。写进输入框是**填空**，直接发送是**替他决定**。

**为什么用 `session.blank` 而不自己数消息**：这是框架给出的权威判据（`SessionSnapshot.blank`），比"消息数组长度为 0"更可靠——后者会把刚创建但已有系统事件的会话算成非空。

## 开发备注

以下四个坑各花了一轮才发现，记录在此：

| 现象 | 真相 |
|---|---|
| `slots.register` 报 `needs an options object with a name` | 注册签名第一个字段是 **`name`**（目标槽位键），不是 `id`。Inspector 的 catalog 把它显示成 `id`，与运行时不一致——**以运行时报错为准** |
| `React is not defined` | 动态插件里 `React` 是注入的全局；**正式插件必须 `import React from 'react'`** |
| `cannot get property "remote.skills" without inject` | 客户端访问服务受 fiber 的 `inject` 声明门控；`remote` 与 `remote.skills` 是**两个独立座位**，不能靠属性链取 |
| `harness is not defined` | `harness` 只存在于**动态插件沙箱**（由 host-runner 注入参数）。正式插件用 `TypertRemoteService` + `@Remote`，没有这个全局 |

**共同教训**：动态插件（`cordis_define` / `cordis_run`）与正式插件走**不同的加载路径**，前者的经验不能直接搬。

另一个构建侧的坑：`@deepseek-ai/*` 依赖必须保持 **external**（见 `tsdown.config.ts`）。内联会把 cordis 与服务基类复制一份，`instanceof` 与装饰器元数据在两个副本间失配，Remote 端点会因此注册不上。

## 当前状态

**已实现**：技能胶囊行、点击写入草稿、只在空会话显示、加载 / 无技能 / 出错三态。

**未实现**：

- 选中技能后展开「输入模板」标签（需约定 `SKILL.md` 中的模板段）
- 最佳案例卡片（计划挂在 `conversation.composer.dock`）
- `maxSkills` / `showOnActiveSession` 目前由 HOST 侧返回全量、UI 侧决定展示；尚未接到配置读取路径

## 发布

- **npm**：`npm publish`（`files` 已含构建产物与补丁）
- **tarball**：`npm pack`，用户 `dsh plugin --profile web add ./dsh-guide-nav-0.1.0.tgz`
- **git**：`dsh plugin --profile web add github:you/dsh-guide-nav`（配合上面的 `allowBuilds`）

## 相关文档

**本仓库内**：

- 设计依据与取舍：[docs/design.zh.md](docs/design.zh.md)
- 槽位选址与实测证据：[docs/slot-survey.zh.md](docs/slot-survey.zh.md)
- 开发备注（四个坑与构建要点）：[docs/development.zh.md](docs/development.zh.md)

**官方文档**：

- 插件开发入门：[basic/index.zh.md](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/index.zh.md)
- 插件配置：[basic/config.zh.md](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/config.zh.md)
- 打包与安装：[basic/publish.zh.md](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/basic/publish.zh.md)
- 服务与依赖：[framework/service.zh.md](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/framework/service.zh.md)
- 事件系统：[framework/events.zh.md](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/user/develop/framework/events.zh.md)

## 许可

MIT
