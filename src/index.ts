/**
 * HOST 半边：把"当前会话可见的技能目录"做成一个官方 Remote 服务。
 *
 * 为什么需要它：技能目录按会话解析（项目级 skill 根依赖会话 cwd），客户端要拿到
 * 它必须有一条 host→client 的数据通路。
 *
 * 为什么用 `TypertRemoteService` + `@Remote` 而不是 `harness.handle`：
 * `harness` 只存在于**动态插件**的沙箱 façade 里（动态包由 host-runner 注入参数），
 * **正式插件没有这个全局**——初次装配时正是这里报的错。正式插件的标准做法是
 * 注册一个 Service，用 `@Remote` 标注要过线的方法，由 Gateway 生成 wire 端点；
 * 客户端再经 `ctx.remote.<namespace>` 调用。
 *
 * 无状态：不缓存、不订阅。导航条只关心"当前这一个会话"，拉取时机交给 UI，
 * 这样切会话时不会拿到上一个会话的目录。
 *
 * @module dsh-guide-nav
 */

import type { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

/** 插件显示名（诊断日志中使用）。 */
export const name = 'dsh-guide-nav'

/** 依赖的服务：skills 就绪后本插件才会加载。 */
export const inject = ['skills']

/** 插件配置：部署时通过 cordis.patch.yml 覆盖。 */
export interface Config {
  /** 导航条最多显示多少个技能胶囊。 */
  maxSkills: number
  /** 是否在非空会话也显示。 */
  showOnActiveSession: boolean
}

/** 配置默认值。 */
export const Config = {
  maxSkills: 12,
  showOnActiveSession: false,
}

/** 单个技能条目：只带 UI 需要的字段，不把整个定义过线。 */
export interface SkillEntry {
  name: string
  description: string
}

/** `listSkills` 的应答：技能列表 + 一个来源标记，便于 UI 诊断。 */
export interface SkillListAnswer {
  skills: SkillEntry[]
  /** 'skills' = 读到目录；'empty' = 目录为空；'error' = 调用失败（见 error）。 */
  src: string
  error?: string
}

/** 请求体：由客户端点名会话。 */
export interface SkillListRequest {
  sessionId?: string
}

/**
 * 技能目录服务：一个方法，供浏览器半边取当前会话可见的技能清单。
 *
 * 服务键与 wire 命名空间都用 `guideNav`，客户端因此经
 * `ctx.remote.guideNav.listSkills(...)` 访问。
 */
export class GuideNavService extends TypertRemoteService {
  /** 本服务依赖的服务。 */
  static inject = ['skills']

  constructor(ctx: Context) {
    super(ctx, 'guideNav')
  }

  /**
   * 列出某会话可见的技能。
   * @param request - 含 sessionId；缺省时取全局视图。
   * @returns 精简后的技能条目；失败时返回 `src: 'error'` 与原因，不抛给 UI。
   */
  @Remote
  async listSkills(request: SkillListRequest): Promise<SkillListAnswer> {
    const sessionId = typeof request?.sessionId === 'string' && request.sessionId !== ''
      ? request.sessionId
      : undefined

    let raw: unknown
    try {
      // 有 sessionId 时按会话解析（项目级 skill 根依赖其 cwd）；没有就取全局视图。
      raw = await this.ctx.skills.list(sessionId === undefined ? {} : { sessionId })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { skills: [], src: 'error', error: message }
    }

    const list = Array.isArray(raw) ? raw : []
    const skills: SkillEntry[] = []
    for (const item of list) {
      if (item === null || typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      const skillName = typeof record.name === 'string' ? record.name : ''
      if (skillName === '') continue
      const description = typeof record.description === 'string' ? record.description : ''
      skills.push({
        name: skillName,
        description: description.length > 300 ? `${description.slice(0, 300)}…` : description,
      })
    }

    return { skills, src: skills.length === 0 ? 'empty' : 'skills' }
  }
}

export default GuideNavService

/**
 * 插件主体：把技能目录服务挂上。
 * @param ctx - HOST 根上下文。
 * @param config - 经过 schema 的配置。
 */
export function apply(ctx: Context, config: Config): void {
  ctx.plugin(GuideNavService)
  if (typeof console !== 'undefined') {
    console.log(`[${name}] 已就绪（maxSkills=${config.maxSkills}）`)
  }
}
