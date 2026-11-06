import { readFileSync } from 'node:fs'
import { defineConfig, type DefaultTheme } from 'vitepress'
import { withMermaid } from 'vitepress-plugin-mermaid'

const upstream = JSON.parse(readFileSync(new URL('../../upstream.json', import.meta.url), 'utf8'))
const upstreamRepo = `https://github.com/${upstream.repository}`

// GitHub Actions passes the Pages base path; locally the site is served from /.
const base = process.env.DOCS_BASE ?? '/'

const docs = [
  ['000-philosophy', '000 设计哲学', '000 Philosophy'],
  ['001-domain', '001 领域模型', '001 Domain model'],
  ['002-authorization', '002 授权', '002 Authorization'],
  ['003-execution', '003 执行', '003 Execution'],
  ['004-prompts', '004 Prompt', '004 Prompts'],
  ['005-panel', '005 面板', '005 Panel'],
  ['006-deployment', '006 部署', '006 Deployment'],
  ['007-architecture', '007 架构', '007 Architecture'],
  ['008-cookbook', '008 Cookbook：新增 Source', '008 Cookbook'],
]

const prompts = [
  'shared', 'orchestrator', 'worker', 'subscriptions', 'replies', 'dispatch', 'work',
  'admission', 'handoff', 'handoff-orchestrator', 'handoff-worker', 'cli',
  'team-communication', 'team-scope', 'team-delivery',
]
const promptName = (p: string) => (p.startsWith('team-') ? `team/${p.slice(5)}.md` : `${p}.md`)
const skills = ['dsh-superagent-github', 'dsh-superagent-feishu']

function documentSidebar(prefix: string, english: boolean): DefaultTheme.SidebarItem[] {
  return [
    {
      text: english ? 'Entry' : '入口',
      items: [
        { text: 'README', link: `${prefix}/readme` },
        { text: 'SETUP', link: `${prefix}/setup` },
      ],
    },
    {
      text: english ? 'Numbered documents' : '编号文档',
      items: docs.map(([slug, zh, en]) => ({ text: english ? en : zh, link: `${prefix}/${slug}` })),
    },
    {
      text: 'Prompts',
      collapsed: true,
      items: prompts.map((p) => ({ text: promptName(p), link: `${prefix}/prompts/${p}` })),
    },
    {
      text: 'Skills',
      collapsed: true,
      items: skills.map((s) => ({ text: s, link: `${prefix}/skills/${s}` })),
    },
  ]
}

export default withMermaid(
  defineConfig({
    base,
    lang: 'zh-CN',
    title: 'Learn Super Agent',
    description: '拆解、解释、教学 DeepSeek dsh-superagent 的设计（非官方学习项目）',
    cleanUrls: true,
    lastUpdated: true,
    head: [['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}images/deepseek-mark.svg` }]],
    markdown: { lineNumbers: true },
    themeConfig: {
      logo: { src: '/images/deepseek-mark.svg', alt: 'DeepSeek' },
      nav: [
        { text: '拆解教程', link: '/guide/', activeMatch: '^/guide/' },
        { text: '原文译文', link: '/translation/', activeMatch: '^/translation/' },
        { text: '英文原文', link: '/upstream/readme', activeMatch: '^/upstream/' },
        { text: '附录', link: '/appendix/glossary', activeMatch: '^/appendix/' },
        { text: '上游仓库', link: `${upstreamRepo}/tree/${upstream.commit}` },
      ],
      sidebar: {
        '/guide/': [
          {
            text: '开始',
            items: [
              { text: '导读：怎么读这套教程', link: '/guide/' },
              { text: '大纲与进度', link: '/guide/outline' },
            ],
          },
          {
            text: '第一部分 · 理念与模型',
            items: [
              { text: '01 设计哲学：注意力预算', link: '/guide/01-philosophy' },
              { text: '02 领域模型：十个概念', link: '/guide/02-domain-model' },
              { text: '03 一个请求的一生', link: '/guide/03-request-lifecycle' },
            ],
          },
          {
            text: '第二部分 · 机制',
            items: [
              { text: '04 授权：谁能让 agent 干活', link: '/guide/04-authorization' },
              { text: '05 执行：Ticket 如何被做完', link: '/guide/05-execution' },
              { text: '06 可靠性：持久化副作用与恢复', link: '/guide/06-reliability' },
              { text: '07 Prompt：两个角色的分工', link: '/guide/07-prompts' },
              { text: '08 面板：只显示需要人的事', link: '/guide/08-panel' },
            ],
          },
          {
            text: '第三部分 · 代码与扩展',
            items: [
              { text: '09 代码架构：Engine 与端口', link: '/guide/09-architecture' },
              { text: '10 扩展：新增一个 Source', link: '/guide/10-extending' },
              { text: '11 动手：最小复刻', link: '/guide/11-build-your-own' },
            ],
          },
        ],
        '/translation/': [
          { text: '原文译文', items: [{ text: '说明', link: '/translation/' }] },
          ...documentSidebar('/translation', false),
        ],
        '/upstream/': documentSidebar('/upstream', true),
        '/appendix/': [
          {
            text: '附录',
            items: [
              { text: '术语表', link: '/appendix/glossary' },
              { text: '源码索引', link: '/appendix/source-map' },
              { text: '被拒绝的设计', link: '/appendix/rejected-designs' },
              { text: '版本与许可', link: '/appendix/about' },
            ],
          },
        ],
      },
      outline: { level: [2, 3], label: '本页目录' },
      editLink: {
        pattern: 'https://github.com/jilinJL/learn-super-agent/edit/main/docs/:path',
        text: '在 GitHub 上编辑此页',
      },
      socialLinks: [{ icon: 'github', link: 'https://github.com/jilinJL/learn-super-agent' }],
      footer: {
        message: `非官方学习项目，与 DeepSeek 无关联。上游内容版权归 DeepSeek Harness Team，MIT 许可，版本 ${upstream.commit.slice(0, 7)}。`,
      },
      search: {
        provider: 'local',
        options: {
          translations: {
            button: { buttonText: '搜索', buttonAriaLabel: '搜索' },
            modal: {
              noResultsText: '没有结果',
              resetButtonTitle: '清除',
              footer: { selectText: '选择', navigateText: '切换', closeText: '关闭' },
            },
          },
        },
      },
      docFooter: { prev: '上一页', next: '下一页' },
      lastUpdated: { text: '最后更新' },
      returnToTopLabel: '回到顶部',
      sidebarMenuLabel: '菜单',
      darkModeSwitchLabel: '主题',
    },
    mermaid: {},
  }),
)
