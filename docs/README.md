# 文档

本目录记录 `dsh-guide-nav` 的**设计依据**与**开发须知**。README 讲怎么用，这里讲为什么这么做、以及怎么改。

| 文档 | 回答什么 |
|---|---|
| [`design.zh.md`](design.zh.md) | 形态从哪来：与 WorkBuddy 提示词分级链路的对照，以及四个关键取舍（逐级展开、不做 persona 层、写草稿、不做场景标签） |
| [`slot-survey.zh.md`](slot-survey.zh.md) | 为什么选 `conversation.input.dock`：候选槽位全表、被排除的 Hero 区（含实测契约）、三条可用性硬证据、代价与限制 |
| [`development.zh.md`](development.zh.md) | 怎么改：四个运行时坑（`name` vs `id`、React、inject 门控、`harness`）、动态插件与正式插件的差异、构建要点、profile 安装的坑、验证清单 |

---

## 阅读顺序建议

**第一次接触这个插件** → `design.zh.md`（先理解形态，再看代码）

**要改 UI 或换槽位** → `slot-survey.zh.md`（里面有实测契约与复现方法）

**要动代码、或者遇到启动报错** → `development.zh.md`（四个坑对应四次真实失败）

---

## 一句话总结

**DSH 缺的不是机制，是发现层。** preset / persona / skill / `@` 引用 / mention 机制全都有，缺的是"让用户知道有什么可用" —— 本插件补的就是这一格。

详见 `design.zh.md` 第四节。
