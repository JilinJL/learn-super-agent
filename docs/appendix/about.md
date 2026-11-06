# 版本与许可

## 这是什么

Learn Super Agent 是一个**非官方**学习项目，用来拆解、解释和教学 [deepseek-ai/dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype) 的设计。它与 DeepSeek 没有关联，也没有得到 DeepSeek 的审阅或认可。

上游自己的声明是：这是研究原型，仅供参考，不是 DeepSeek 的官方产品；代码大量由 coding agent 编写，可能有 bug；公开版本与 DeepSeek 内部版本、以及文章 *Exploring Super-agent Design: Towards a More Autonomous Agent System* 描述的实现不完全一致。本教程讲的是**公开仓库里的代码和文档**，不是那篇文章。

## 锁定的上游版本

| | |
| --- | --- |
| 仓库 | [deepseek-ai/dsh-superagent-prototype](https://github.com/deepseek-ai/dsh-superagent-prototype) |
| Commit | [`8c32a9d`](https://github.com/deepseek-ai/dsh-superagent-prototype/tree/8c32a9dc5d72c033816c6a8110b37f40cf94fba4)（2026-10-31） |
| 许可 | MIT，Copyright (c) 2026 DeepSeek Harness Team |

站点里的所有源码链接、"英文原文"和"原文译文"都对应这个 commit。版本记录在仓库根目录的 `upstream.json` 里。

## 内容来源与许可

| 部分 | 来源 | 许可 |
| --- | --- | --- |
| [英文原文](/upstream/readme) | 上游文档原样复制。只改了两处：相对链接改成站内链接或 GitHub permalink；正文里的 `<` 转义，避免被 Vue 当作标签解析 | MIT，版权归 DeepSeek Harness Team |
| [原文译文](/translation/) | 上游文档的中文翻译，属于衍生作品 | MIT，原文版权归 DeepSeek Harness Team |
| [拆解教程](/guide/)、附录 | 本项目原创 | MIT |

上游的 MIT 许可全文和版权声明保存在本仓库的 `NOTICE` 文件里。

站点使用的 DeepSeek logo 取自 [DeepSeek 官方仓库的标识文件](https://github.com/deepseek-ai/DeepSeek-V2/blob/main/figures/logo.svg)，导航栏和浏览器图标使用其中的鲸鱼图形。标识归其权利人所有，仅用于标识本教程研究的项目来源。

## 同步上游更新

上游更新后：

1. 在本地克隆里切到新的 commit。
2. 更新 `upstream.json` 里的 `commit` 和 `committedAt`。
3. 运行 `npm run sync`，重新生成 `docs/upstream/`。
4. 用 `git diff docs/upstream/` 看原文改了什么，同步修改对应的译文和教程。教程里的源码行号也要逐一核对。

同步脚本会检查本地克隆的 HEAD 是否等于 `upstream.json` 里的 commit，不一致时拒绝运行。

## 参与

发现翻译或讲解有误，欢迎在 [GitHub](https://github.com/jilinJL/learn-super-agent) 提 Issue 或 PR。教程里关于系统行为的每条断言都应该能在上游文档或源码里找到依据；提出修正时请附上依据的位置。
