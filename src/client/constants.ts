/**
 * 本插件的共享常量。
 * @module dsh-guide-nav/client/constants
 */

/** 插件命名空间：同时用作插槽条目的 id 前缀与样式命名前缀。 */
export const NAMESPACE = 'dsh-guide-nav'

/**
 * 导航条挂载的槽位：输入卡片**上方**的全宽条目列表。
 *
 * 选它的依据（实测）：该槽位 `kind: 'list'`、`scope: 'session'`，
 * 空会话下即渲染（sessionId 为真实值），且 props 带 `inputActions`——
 * 想往输入框写内容，这是唯一既在正确位置、又能拿到写入面的槽位。
 */
export const SLOT_INPUT_DOCK = 'conversation.input.dock'
