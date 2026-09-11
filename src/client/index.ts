/**
 * 客户端半边入口：注入样式、注册导航条。
 *
 * 客户端 bundle 由 dsh 的 client-modules 分发，产物是 `__ModuleLoader__.load`
 * 握手格式（见 tsdown.config.ts 的 banner/footer）。本文件只做组装，
 * 具体 UI 面各自一个模块，便于后续加「最佳案例」等新面而不动入口。
 *
 * @module dsh-guide-nav/client
 */

import type { Context } from '@deepseek-ai/cordis'
import { injectStyles } from './styles.ts'
import { registerGuideStrip, bindRemote } from './guide-strip.ts'

/**
 * 依赖的服务：slots 就绪后本插件才会加载。
 *
 * `remote` 是硬依赖——导航条没有技能目录就只剩一个空壳，因此声明它，
 * 让运行时在 Gateway 缺失时把本包挂起，而不是渲染一个永远转圈的条。
 */
export const inject = ['slots', 'remote']

/**
 * 客户端插件主体。
 * @param ctx - 客户端根上下文。
 */
export function apply(ctx: Context): void {
  // Remote 面在 apply 时确实存在（inject 已保证），但具体命名空间要等插件
  // 两半都挂载后才可用，故在此把面交给组件闭包持有，而不是在组件里现取。
  bindRemote(ctx.remote.guideNav)
  injectStyles()
  registerGuideStrip(ctx)
}
