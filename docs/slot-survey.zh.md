# 插槽调研：为什么选 `conversation.input.dock`

本文记录本插件选址所依赖的**实测证据**，以及被排除的候选。目的是让后来者不必重跑一遍这些实验。

> 所有实测均在 DSH Desktop 上通过客户端 Slot Inspect（`Slots.listSubTree`）完成，属于**运行时真值**，而非源码推断。

---

## 一、候选槽位全表

会话区（`main.conversation` 子树）里与本插件需求相关的槽位：

| 槽位 | kind | scope | 位置 | 适配度 |
|---|---|---|---|---|
| `conversation.input.dock` | `list` | `session` | 输入卡片**上方**，全宽 | ✅ **采用** |
| `conversation.composer.dock` | `list` | `session` | 输入卡片**下方** | ✅ 备用（案例卡片） |
| `conversation.input.overlay` | `list` | `session` | 卡片**内部**浮层 | ⚠️ 非全宽行，适合下拉而非常驻条 |
| `conversation.input.left` | `list` | `session` | 卡片工具行**左侧** | ⚠️ 空间小，只适合紧凑控件 |
| `conversation.input.right` | `list` | `session` | 提交按钮**前** | ⚠️ 同上 |
| `conversation.hero.agentPreset` | `single` | `root` | 空会话 Hero 的 preset 控件 | ❌ 见下 |
| `conversation.hero.workspace` | `single` | `root` | 空会话 Hero 的 workspace 选择器 | ❌ 见下 |

---

## 二、为什么不用 Hero 区（`conversation.hero.*`）

最初的设想是「在 agent preset 选择器**右侧**显示 persona 胶囊」。实测否定了这个方案，有两条独立理由：

### 理由 1：`hero.agentPreset` 是 `single` 且不接受子内容

实测契约：

```
conversation.hero.agentPreset
  kind: single
  scope: root
  purpose: Agent-preset control staged for a New Session.
  ownerProps: { children?: never }     ← 不接受子内容
  occupants: [ { registrant: "Z8" } ]  ← 已被壳层占用
  replaceRisk: shadows-shipped-ui      ← 覆盖会遮蔽官方 UI
```

三点推论：

1. `children?: never` —— 它**不是容器**，无法在其中并排渲染新控件；
2. 已被壳层（`Z8`）占用，且是 `single` —— 想加东西只能**替换**它；
3. `replaceRisk: shadows-shipped-ui` —— 替换意味着**自己重写整个 Hero**（含 preset 选择器、workspace picker、品牌标记、标题），并需跟随官方更新。

### 理由 2：Hero 区没有"内部兄弟槽位"

Hero 的 DOM 结构由壳层私有布局拥有，**槽位系统没有暴露"Hero 内、preset 右侧"这个位置**。因此"在 preset 旁边插一个"在现有槽位体系里无处安放。

### 结论

**不必进 Hero**。用户要的是「选完 preset 紧接着选下一步」，**垂直紧邻在体验上等价**，而 `conversation.input.dock` 正好在 preset 下方、输入框上方。

---

## 三、为什么 `conversation.input.dock` 可用（三条硬证据）

### 证据 1：它在空会话下确实渲染

最初担心 `scope: session` 意味着"没有会话就不渲染"。实测（空会话、已选 workspace、未发消息）该槽位**正常渲染**，且注入到组件的 `sessionId` 是**真实值**：

```
sessionId = session-f5f03345-c260-4de0-a047-9f1c5eef8d56
inputActions OK
```

### 证据 2：它带 `inputActions`

该槽位的 `standardProps` 包含写输入框所需的面：

```
useInput: SnapshotSelectorHook<InputState>
inputActions: InputActions          ← 写草稿
useSession: SessionSnapshotSelector ← 读会话状态
sessionId: SessionId
```

`ownerProps` 另外提供点状快照：

```ts
export interface InputZone {
  readonly session: SessionSnapshot
  readonly input: InputState
}
```

> **接线纪律**：owner 只传点状快照，需要实时数据时应走框架标准 hook（`useSession` 等），**不要在组件里自己订阅**。

### 证据 3：它是 `list`，可与内置条目共存

实测当前占用者（按 `order` 升序）：

| order | id | registrant |
|---|---|---|
| 0 | `todo` | conversation-todo-dock |
| 10 | `goal` | Z8 |
| 20 | `queue` | conversation-queue-dock |
| 45 | `dsh-miniapp-panel` | dsh-miniapp |
| 45 | `dsh-miniapp-create` | dsh-miniapp |
| 100 | `git-graph` | Z8 |

本插件取 **`order: 30`** —— 排在内置的三个（todo/goal/queue）之后、miniapp 之前。

`replaceRisk: none`，且注册文档明确：

> Use an id of your own: a fresh id is added beside the shipped entries, while reusing a shipped id puts you in THAT cell and replaces it.

**所以用自己的 id 就是纯增量，不会挤掉内置条目。**

---

## 四、代价与限制

### 它是共享槽，条目上下堆叠

`list` 语义是**全宽行列表**，不是横向容器。本插件的条会与 todo/goal/queue 等**上下排列**，无法横向抢位。因此：

- 折叠态必须**只占一行**（本插件采用逐级展开，见 `design.md`）；
- 当 todo / goal / queue 同时出现时，导航条会被挤在中间。缓解方式是只在空会话显示 —— 恰好那三种在空会话下通常都是空的。

### 全宽与居中由条目自己负责

该槽渲染为全宽行，**宽度与居中由条目自己负责**。本插件用 `--dsh-composer-max-width` 变量对齐输入卡片（与内置 `QueueDock` 一致），不写死 `max-width`：

```css
.dsgnav {
  width: 100%;
  max-width: var(--dsh-composer-max-width, 48rem);
  margin: 0 auto 6px;
}
```

### `composer.dock` 同样可用

实测该槽位在空会话下**也渲染**（`kind: list`、`scope: session`、`replaceRisk: none`，当前占用者只有 `stats`，`order: 0`）。

> 一次早期实验中，同一会话里 `input.dock` 有输出而 `composer.dock` 没有。复核后确认那是**插件版本切换的时序问题**，不是槽位不可用 —— 后续实测两个槽位都正常渲染。记录于此以免误导。

用途划分：**上方放导航链，下方放案例卡片**（尚未实现）。

---

## 五、`session.blank` 是显示时机的权威判据

两个 dock 在**非空会话也渲染**，所以"何时显示"必须自己判断。不要用"消息数组长度"这类推断，框架给了权威字段：

```ts
export interface SessionSnapshot {
  readonly blank: boolean              // 空会话
  readonly awaitingFirstTurn: boolean  // 还没开始第一轮
  readonly running: boolean            // 正在跑
  // …
}
```

本插件的判据：

```ts
if (!blank && !running) return null
```

**为什么不自己在非空会话也显示**：会话一旦产出内容，agent preset 与身份即被锁定（`agent-preset/locked`），此时再提供"选择"既无意义也会干扰。

---

## 六、复现方法

这些结论都可以用客户端 Slot Inspect 复跑：

```
Slots.listSubTree                          → 全部槽位树
Slots.listSubTree { root: "conversation.input.dock" }
                                           → 该槽位的完整契约与实时占用者
```

**注意**：Inspect 返回的 catalog 里，`list` 槽的注册字段显示为 `id`，但**运行时要求 `name`**（目标槽位键）。

```js
// catalog 说：registration: [{ name: "id", required: true }]
// 运行时要求：options need a string `name` (the target slot key)
```

**以运行时报错为准**，详见 `development.zh.md` 的坑 1。
