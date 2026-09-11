# 开发备注

本文记录本插件开发过程中实际踩到的坑与构建要点。每一节都对应一次真实失败，写在这是为了让下一个开发者少走一轮。

---

## 一、四个运行时坑

### 坑 1：`slots.register` 要 `name`，不要 `id`

**现象**

```
slots.register(options, component) needs an options object with a `name`
```

**原因**：注册签名的第一个字段是 **`name`**（目标槽位键），不是 `id`。

**最容易误导的地方**：客户端 Slot Inspect 返回的 catalog 把它显示成 `id`：

```jsonc
// Inspect catalog 说：
"registration": [
  { "name": "id",   "type": "string", "required": true },   // ← 误导
  { "name": "order","type": "number", "required": false },
  { "name": "label","type": "string", "required": false }
]
```

而运行时的真实校验（`dsh-cordis-client-runner/lib/client.js`）是：

```js
const options = { ...rawOptions }
const slot = options.name                    // ← 实际读 name
if (typeof slot !== 'string' || slot.length === 0) {
  return rejectGuard(env, 'slots.register options need a string `name` (the target slot key)')
}
```

**正确写法**

```ts
ctx.slots.register(
  { name: 'conversation.input.dock', id: 'dsh-guide-nav-strip', order: 30 },
  GuideStrip,
)
```

- **`name`** = 目标槽位键
- **`id`** = 你自己那一格的键（**必须用自己的 id**，复用官方 id 会替换官方那格）
- **`priority`** 由运行时自动分配，不用管

> **纪律**：槽位契约以**运行时报错**为准，Inspect catalog 只能当参考。

### 坑 2：`React is not defined`

**现象**：组件渲染时 `React is not defined`。

**原因**：在**动态插件**（`cordis_define` / `cordis_run`）里，`React` 是注入的全局参数；在**正式插件**里没有这个全局。

**正确写法**

```ts
import React from 'react'
```

正式插件的客户端 bundle 里，`react` 是唯一允许的运行时外部依赖（由浏览器平台模块表提供，见 `tsdown.config.ts` 的 `external`）。

### 坑 3：`cannot get property "remote.skills" without inject`

**现象**

```
cannot get property "remote.skills" without inject
```

**原因**：客户端访问服务受 **fiber 的 `inject` 声明**门控，而 `remote` 与 `remote.skills` 是**两个独立座位**，不是属性链。

Gate 的实现（`dsh-cordis-client-runner/lib/client.js`）：

```js
get(_target, prop) {
  if (prop === 'get') return (name) => readService(name, false)   // ctx.get：不检查声明
  if (CTX_VERBS.has(prop)) return ...
  return readService(prop, true)                                  // 属性访问：要求已声明
}
```

官方 `ui-skill` 插件就是这么声明的：

```js
const inject = ['inputTriggers', 'sessions', 'slots', 'locale', 'remote', 'remote.skills']
                                                                   // ↑ 独立座位
```

**三条可用路径**：

| 写法 | 是否可行 |
|---|---|
| `ctx.remote.skills` 但只声明 `remote` | ❌ 门控拦截 |
| `ctx.get('remote').skills` | ❌ `remote` 上没有 `skills` 属性 |
| 声明 `'remote.skills'` 后用 `ctx.remote.skills` | ✅ 正式插件可行 |

**本插件走的是第四条路**（更可控）：不依赖会话控制器的命名空间，而是自己注册一个 Remote 服务（见 `src/index.ts` 的 `GuideNavService`），客户端经 `ctx.remote.guideNav` 取 —— 只过线 name/description 两个字段。

### 坑 4：`harness is not defined`

**现象**：HOST 半边启动即报 `harness is not defined`。

**原因**：`harness` 只存在于**动态插件的沙箱 façade** 里 —— 由 host-runner 在求值动态包时注入参数：

```js
const parameters = ['React', 'console', 'styles', 'host', 'harness', ...traps, 'process', 'Buffer']
```

**正式插件没有这个全局**。正式插件的标准做法是注册一个 Service，用 `@Remote` 标注要过线的方法：

```ts
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

export class GuideNavService extends TypertRemoteService {
  static inject = ['skills']

  constructor(ctx: Context) {
    super(ctx, 'guideNav')
  }

  @Remote
  async listSkills(request: SkillListRequest): Promise<SkillListAnswer> {
    const raw = await this.ctx.skills.list({ sessionId: request.sessionId })
    // …
  }
}

export function apply(ctx: Context): void {
  ctx.plugin(GuideNavService)
}
```

客户端则通过 `ctx.remote.guideNav.listSkills(...)` 调用，Gateway 自动生成 wire 端点。

---

## 二、共同教训

> **动态插件与正式插件走不同的加载路径，前者的经验不能直接搬。**

| | 动态插件 | 正式插件 |
|---|---|---|
| 定义方式 | `cordis_define` / `cordis_run` | 源码 + `tsdown` 构建 + 装进 profile |
| 沙箱 | 有（services 门控、全局注入） | 无 |
| `harness` | ✅ 有 | ❌ 无 |
| `React` | ✅ 注入的全局 | ❌ 需 `import` |
| 服务访问 | 受 fiber 门控，点分名难用 | 正常 `inject` |
| 适合做 | 临时实验、验证可行性 | 交付 |

**本插件的四个坑里有三个（1、3、4）都是在用动态插件的思路写正式插件时踩的。** 建议：先用动态插件验证想法，确认后立刻转正式插件重写，不要试图把动态插件的代码搬过来。

---

## 三、构建要点

### `@deepseek-ai/*` 必须保持 external

```ts
const HOST_EXTERNALS = [/^@deepseek-ai\//]
```

**内联的后果**：会把 cordis 与服务基类复制一份，`instanceof` 判断与装饰器元数据在两个副本间失配 —— **Remote 端点会因此注册不上**。

构建产物检查：

```bash
head -1 lib/index.js
# 应为：import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
# 若看到 Protocol 的源码被内联进来，说明 external 没生效
```

### 客户端 bundle 的握手格式

浏览器半边必须是 `__ModuleLoader__.load` 握手格式（见 `tsdown.config.ts` 的 `banner` / `footer`），以 CJS 输出：

```js
window.__ModuleLoader__.load({
  id: "dsh-guide-nav",
  factory: (require) => { /* … */ return module.exports; }
});
```

**`id` 必须与包名一致**，否则客户端模块表解析不到。

### 包名一致性

改包名时四处要同步：

1. `package.json` 的 `name`
2. `src/index.ts` 的 `name`
3. `cordis.patch.yml` 的 `id` 与 `name`
4. `tsdown.config.ts` 里 client bundle 的 `id`，以及 `src/client/constants.ts` 的 `NAMESPACE`

---

## 四、安装到 profile 的坑

### `pnpm install` 会静默回滚不在 lockfile 的依赖

只改 `profile/package.json` 就跑 `pnpm install`，条目会被**悄悄删掉**，而输出仍然显示：

```
Already up to date
```

**正确做法**：三处一起改 —— `package.json` 的 `dependencies` 与 `dsh.profile.bundles`，以及 `pnpm-lock.yaml` 的 `importers.dependencies`：

```yaml
dsh-guide-nav:
  specifier: link:/abs/path/to/dsh-guide-nav
  version: link:../../../abs/path/to/dsh-guide-nav
```

### `dsh.profile.bundles` 变更不是热更新

**必须重启 DSH。**

---

## 五、开发循环

```bash
npm install
npm run build      # 产物 lib/index.js + lib/client.js
npm run typecheck
```

改 `src/client/` 后需要重新 `build`，然后重启 DSH 或刷新页面（取决于 profile 的 `patchReload`）。

**`lib/` 不入库**（见 `.gitignore`），因为 `package.json` 有 `"prepare": "tsdown"` —— 别人 `npm install` 或 `dsh plugin add github:...` 时会自动构建。

---

## 六、验证清单

改完插件后按这个顺序验：

1. **HOST 加载**：启动日志应出现 `[dsh-guide-nav] 已就绪（maxSkills=12）`
2. **客户端注册**：浏览器控制台应出现 `[guide-nav] …`
3. **控件渲染**：开一个空会话，输入框上方应出现 `导航 ┃ [技能胶囊]`
4. **交互**：点胶囊，输入框应出现 `/技能名 `
5. **显示时机**：发一条消息后，导航条应消失

若第 3 步不出现，先看第 1、2 步的日志；若第 4 步无效，检查 `inputActions` 是否为 `undefined`（组件此时会把胶囊置为禁用态而非报错）。
