/**
 * 导航条：空会话输入框上方的一行逐级收窄入口。
 *
 * 设计取舍（与 WorkBuddy 对照后的结论）：
 * - WorkBuddy 把「应用 → 模式 → 胶囊 → 标签」四层**同时**铺在屏幕上（货架）；
 *   本插件改成**逐级展开**（抽屉）：未选技能时只有一行技能胶囊，选中后同一行
 *   内追加"输入模板"标签，折叠态永远只占一行，不挡路。
 * - 不做「模式/persona」层：DSH 的 persona 绑在 agent preset 上，开会话前已定，
 *   会话中途再选一次语义上是自相矛盾的。模式差异由 preset 承载。
 *
 * 数据通路：技能目录走 `ctx.remote.guideNav.listSkills(...)`——官方 Remote 服务，
 * 由 HOST 半边的 `GuideNavService` 用 `@Remote` 标注、Gateway 生成 wire 端点。
 * （不直接用 `ctx.remote.skills`：那是会话控制器的命名空间，与展示层需求耦合，
 * 且返回体更长；本插件只取 name/description 两个字段。）
 *
 * 显示时机：只在**空会话**显示。会话一旦有内容，preset 与身份都已锁定，
 * 导航条既无意义也会干扰。判据用框架权威字段 `session.blank`，不靠猜。
 *
 * @module dsh-guide-nav/client/guide-strip
 */

import React from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { SLOT_INPUT_DOCK, NAMESPACE } from './constants.ts'

/** 槽位注册的 order：排在 todo(0)/goal(10)/queue(20) 之后、miniapp(45) 之前。 */
const DOCK_ORDER = 30

/** 单个技能条目（与 HOST 半边应答的形状一致）。 */
interface SkillEntry {
  name: string
  description: string
}

/** `listSkills` 的应答。 */
interface SkillListAnswer {
  skills: SkillEntry[]
  src: string
  error?: string
}

/**
 * 组件 props：`sessionId` 由槽位注册的 inject 工厂注入；其余是框架标准面。
 *
 * 只取用得到的三个：`sessionId` 用于拉数据与判空，`inputActions` 用于写草稿，
 * `useSession` 用于读会话实时状态。其余标准 prop（useResource / useWorkspaces
 * 等）本插件不需要，刻意不解构，避免与上游改动耦合。
 */
interface GuideStripProps {
  sessionId?: string
  inputActions?: {
    /** 在光标处插入文本（不覆盖已有草稿）。 */
    insertText?: (text: string) => void
  }
  useSession?: <T>(select: (snapshot: SessionSnapshotLike | undefined) => T) => T
}

/** 会话快照里本插件关心的两个字段（框架权威判据）。 */
interface SessionSnapshotLike {
  blank?: boolean
  running?: boolean
}

/** 组件内部状态。 */
interface StripState {
  skills: SkillEntry[]
  loading: boolean
  /** 非空表示出错了，直接显示给用户，不静默失败。 */
  error: string
  /** 已选中的技能名；null 表示还没选。 */
  picked: string | null
}

/** Gateway 生成的 Remote 面：只需要 listSkills 一个方法。 */
export interface GuideNavRemote {
  listSkills: (request: { sessionId?: string }) => Promise<SkillListAnswer>
}

/**
 * apply 时捕获的 Remote 面。
 *
 * 为什么不在组件里现取 `ctx.remote.guideNav`：组件渲染发生在槽位声明之后，
 * 那时 `ctx` 已不是 apply 的作用域；而 Remote 命名空间的存在性由 inject 在
 * 加载期保证，捕获一次即可，避免每帧做属性查找与存在性判断。
 */
let guideNavRemote: GuideNavRemote | undefined

/**
 * 绑定 HOST 半边暴露的 Remote 面（在客户端 apply 时调用一次）。
 * @param remote - Gateway 生成的命名空间面；缺失时保持 undefined，组件会显示诊断。
 */
export function bindRemote(remote: GuideNavRemote | undefined): void {
  guideNavRemote = remote
}

/**
 * 在 `conversation.input.dock` 注册导航条。
 *
 * 用 `ctx.slots.inject` 包一层：该插槽由 ui-conversation 声明，若声明尚未就绪
 * （或中途收起），注册会被挂起而不是报错，声明回来后再挂上。
 *
 * @param ctx - 客户端根上下文。
 */
export function registerGuideStrip(ctx: Context): void {
  ctx.slots.inject(SLOT_INPUT_DOCK, () => ctx.slots.register(
    {
      name: SLOT_INPUT_DOCK,
      id: `${NAMESPACE}-strip`,
      order: DOCK_ORDER,
      inject: (sessionId: string) => ({ sessionId }),
    },
    GuideStrip,
  ))
}

/**
 * 导航条本体。
 * @param props - 见 {@link GuideStripProps}。
 * @returns 一行导航条；非空会话返回 null（不占位）。
 */
function GuideStrip(props: GuideStripProps): React.ReactElement | null {
  const { sessionId, inputActions, useSession } = props

  // 会话状态用框架 hook 读，不自己订阅——这是模板明确要求的接线方式。
  const blank = useSession !== undefined
    ? useSession((snapshot) => (snapshot === undefined ? true : snapshot.blank !== false))
    : false
  const running = useSession !== undefined
    ? useSession((snapshot) => (snapshot === undefined ? false : snapshot.running === true))
    : false

  const [state, setState] = React.useState<StripState>({
    skills: [],
    loading: true,
    error: '',
    picked: null,
  })

  // 拉技能目录。sessionId 变化（切会话）时重拉。
  React.useEffect(() => {
    if (sessionId === undefined || sessionId === '') {
      setState({ skills: [], loading: false, error: '', picked: null })
      return undefined
    }
    let alive = true
    setState((prev) => ({ ...prev, loading: true, error: '' }))
    const remote = guideNavRemote
    if (remote === undefined) {
      setState({
        skills: [],
        loading: false,
        error: 'HOST 半边未就绪（remote.guideNav 缺失）',
        picked: null,
      })
      return undefined
    }
    remote.listSkills({ sessionId }).then(
      (value) => {
        if (!alive) return
        const answer = (value ?? {}) as Partial<SkillListAnswer>
        if (typeof answer.error === 'string' && answer.error !== '') {
          setState({ skills: [], loading: false, error: `读取失败: ${answer.error}`, picked: null })
          return
        }
        setState({
          skills: Array.isArray(answer.skills) ? answer.skills : [],
          loading: false,
          error: '',
          picked: null,
        })
      },
      (error: unknown) => {
        if (!alive) return
        const message = error instanceof Error ? error.message : String(error)
        setState({ skills: [], loading: false, error: `调用失败: ${message}`, picked: null })
      },
    )
    return () => { alive = false }
  }, [sessionId])

  // 非空会话不显示。放在所有 hook 之后，避免违反 hooks 规则。
  if (!blank && !running) return null

  const onPick = (name: string): void => {
    setState((prev) => ({ ...prev, picked: prev.picked === name ? null : name }))
    if (inputActions?.insertText === undefined) return
    // 写进草稿而不是直接发送：用户还要补细节，这是"填空比创作易"的那一步。
    inputActions.insertText(`/${name} `)
  }

  const children: React.ReactNode[] = [
    React.createElement('span', { className: 'dsgnav__label', key: 'label' }, '导航'),
    React.createElement('span', { className: 'dsgnav__sep', key: 'sep' }),
  ]

  if (state.loading) {
    children.push(React.createElement('span', { className: 'dsgnav__note', key: 'loading' }, '加载技能…'))
  } else if (state.error !== '') {
    children.push(React.createElement('span', {
      className: 'dsgnav__note dsgnav__note--warn',
      key: 'error',
    }, state.error))
  } else if (state.skills.length === 0) {
    children.push(React.createElement('span', {
      className: 'dsgnav__note',
      key: 'empty',
    }, '还没有技能 —— 在 .dsh/skills/ 下建一个 SKILL.md 即可出现'))
  } else {
    for (const skill of state.skills) {
      children.push(React.createElement('button', {
        key: skill.name,
        type: 'button',
        className: 'dsgnav__pill',
        'data-active': state.picked === skill.name ? '1' : '0',
        title: skill.description === '' ? skill.name : skill.description,
        disabled: inputActions?.insertText === undefined,
        onClick: () => onPick(skill.name),
      }, skill.name))
    }
  }

  // 选中技能后，在同一行追加"已选"提示（模板标签的落点，下一阶段展开）。
  if (state.picked !== null) {
    children.push(React.createElement('span', { className: 'dsgnav__sep', key: 'sep2' }))
    children.push(React.createElement('span', {
      className: 'dsgnav__note',
      key: 'picked',
    }, `已选 ${state.picked}`))
  }

  return React.createElement('div', { className: 'dsgnav' }, children)
}
