/**
 * 面板样式：注入一次，随插件卸载自动移除。
 *
 * 颜色一律用中性灰的半透明值（rgba(127,127,127,·)），这样在明暗两套主题下都
 * 有对比度，不需要为主题写两套规则；强调色只在"已选中"时叠加一层蓝。
 *
 * 布局沿用 harness 输入区 Dock 的惯例：条目自己负责全宽与居中，用
 * `--dsh-composer-*` 变量对齐输入卡片（与内置 QueueDock / GoalDock 一致），
 * 不自己写死 max-width。
 *
 * @module dsh-guide-nav/client/styles
 */

/** 样式表 id，便于在 DevTools 里定位。 */
const STYLE_ID = 'dsh-guide-nav-styles'

/**
 * 注入插件样式。重复调用幂等（已存在则跳过）。
 */
export function injectStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID) !== null) return

  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `
.dsgnav {
  box-sizing: border-box;
  width: 100%;
  max-width: var(--dsh-composer-max-width, 48rem);
  margin: 0 auto 6px;
  padding: 7px 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  border: 1px solid rgba(127, 127, 127, 0.14);
  border-radius: 8px;
  background: rgba(127, 127, 127, 0.05);
  font-size: 12px;
  line-height: 1.4;
}
.dsgnav__label {
  flex: none;
  opacity: 0.5;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
  white-space: nowrap;
}
.dsgnav__sep {
  flex: none;
  width: 1px;
  height: 14px;
  background: rgba(127, 127, 127, 0.28);
}
.dsgnav__pill {
  flex: none;
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border: 1px solid rgba(127, 127, 127, 0.28);
  border-radius: 999px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}
.dsgnav__pill:hover:not(:disabled) {
  background: rgba(127, 127, 127, 0.16);
}
.dsgnav__pill:focus-visible {
  outline: 2px solid rgba(64, 128, 255, 0.6);
  outline-offset: 1px;
}
.dsgnav__pill:disabled {
  opacity: 0.45;
  cursor: default;
}
.dsgnav__pill[data-active='1'] {
  background: rgba(64, 128, 255, 0.16);
  border-color: rgba(64, 128, 255, 0.5);
}
.dsgnav__note {
  flex: none;
  opacity: 0.5;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11px;
}
.dsgnav__note--warn {
  opacity: 0.85;
  color: #e8590c;
}
`.trim()

  document.head.appendChild(style)
}
