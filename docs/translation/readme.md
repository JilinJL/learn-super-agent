---
title: "dsh-superagent"
upstream: "README.md"
---
# dsh-superagent {#dsh-superagent}

<UpstreamBanner kind="translation" />

> **研究原型，仅供参考，并非 DeepSeek 官方产品。** 这份代码源自我们团队的日常开发工作，大部分工程工作由 coding agent 完成。请把它当作研究代码，而不是可用于生产的软件。它可能仍有 bug，代码风格和工程实践也可能不一致。在你自己的环境中使用之前，请先审阅并加以调整。
>
> 我们为公开发布对它做了调整，因此它与我们的内部版本以及文章 *Exploring Super-agent Design: Towards a More Autonomous Agent System* 中描述的实现并不完全相同。文中讨论的部分设计是未来的发展方向，并未在这个原型中实现。

dsh-superagent 是面向单个 GitHub 仓库的主动式 coding agent，以 [DeepSeek Harness](https://www.deepseek.com/en/harness/) bundle 的形式打包。它监听 GitHub，也可以选择监听飞书。当被允许的人请 agent 做事时，它会开一个工作项，在它自己的 agent session 和目录中完成工作，并在原来的对话里答复，例如提交一个 pull request。一个 Web 面板展示需要人处理的事项。

它也是一种与 agent 协作的方式：**尽可能少占用人的注意力，尽可能多地提供价值。** 一个能代表整个团队行事的 agent，也可能浪费整个团队的注意力，所以它只在被请求时、或团队写下的规则允许时才行动，只在有人必须采取行动或能用上某个结果时才发言。[docs/000-philosophy.md](./000-philosophy) 解释了这条原则，以及它对运维者的要求。

## 安装配置 {#setup}

安装配置的步骤很多，所以由一个 agent 陪你完成。对你的 coding agent 说：

> 阅读这个仓库里的 SETUP.md，和我一起配置 dsh-superagent。

它每次只问一个简短的问题，完整的计划只展示一次，然后安装并配置好一切。它依照的就是 [SETUP.md](./setup)。

## 文档 {#documentation}

按顺序阅读编号文档；每篇只建立在前面几篇之上。

- [000 设计哲学](./000-philosophy)
- [001 领域模型](./001-domain)
- [002 授权](./002-authorization)
- [003 执行](./003-execution)
- [004 Prompt](./004-prompts)
- [005 面板](./005-panel)
- [006 部署](./006-deployment)：手动安装、配置、升级与故障排查
- [007 架构](./007-architecture)
- [008 Cookbook](./008-cookbook)：新增 Source（来源）

## 开发 {#development}

`pnpm check` 会运行类型检查、测试和构建。

## 许可证 {#license}

[MIT](https://github.com/deepseek-ai/dsh-superagent-prototype/blob/8c32a9dc5d72c033816c6a8110b37f40cf94fba4/LICENSE)
