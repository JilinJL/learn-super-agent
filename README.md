# Learn Super Agent

拆解、解释、教学 [deepseek-ai/dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype) 的设计。非官方学习项目，与 DeepSeek 无关联。

**预期发布地址（待上线）：** https://jilinjl.github.io/learn-super-agent/

## 内容

| 目录 | 内容 |
| --- | --- |
| `docs/guide/` | 拆解教程，原创，共 11 章：理念与模型、机制、代码与扩展 |
| `docs/translation/` | 上游 README、SETUP、九篇编号文档、全部 prompt 和 skill 的中文翻译 |
| `docs/upstream/` | 上游文档原样收录，由 `npm run sync` 生成，不要手改 |
| `docs/appendix/` | 术语表、源码索引、被拒绝的设计、版本与许可 |

所有内容对应上游 commit [`8c32a9d`](https://github.com/deepseek-ai/dsh-superagent-prototype/tree/8c32a9dc5d72c033816c6a8110b37f40cf94fba4)，记录在 `upstream.json`。

## 当前进度

- 导读和 11 章正文、四篇附录已完成；`examples/mini-superagent/` 有一个可运行的最小复刻（9 个测试）。
- 28 篇上游文档已有英文收录和对应中文译文。
- [最小示例](examples/mini-superagent/README.md)已有核心模型、GitHub 评论收发和 9 项测试；任务判断与执行使用 stub，尚未接入真实编码 agent、worktree 和 PR 创建。
- GitHub Actions 已配置文档构建和 Pages 部署；示例测试尚未接入 CI。
- 首次提交、配置 Git remote 和验证 Pages 上线仍待完成。

完整说明见站点的[大纲与进度](docs/guide/outline.md)。

## 本地运行

文档站点需要 Node.js 22 或更高版本；运行最小示例需要 Node.js 24 或更高版本。

```bash
npm install
npm run dev
```

## 同步上游

上游克隆默认放在本仓库的同级目录 `../dsh-superagent-prototype`。

```bash
npm run sync
```

换 commit 的步骤见站点的[版本与许可](https://jilinjl.github.io/learn-super-agent/appendix/about)页。

## 写作约定

站点提供两个组件，用于在教程里引用上游：

```md
<Doc page="002-authorization" anchor="strength">Strength</Doc>   <!-- 译文链接 + EN 原文链接 -->
<Src path="src/core/stage.ts" lines="9-21" />                      <!-- 锁定 commit 的源码链接 -->
```

译文的每个标题都带 `{#英文锚点}`，所以同一个锚点在译文和原文里都能用。更多约定见站点的[大纲与进度](https://jilinjl.github.io/learn-super-agent/guide/outline)页。

## 许可

本项目的原创内容采用 [MIT](LICENSE) 许可。上游内容的版权归 DeepSeek Harness Team 所有，同样以 MIT 许可使用，见 [NOTICE](NOTICE)。
