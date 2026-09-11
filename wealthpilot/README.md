# 知衡 WealthPilot

一个可直接运行、可发布 GitHub 的中文 AI 理财研究工作台。把 **风险测评 → 资产配置 → 压力测试 → 模拟调仓 → 操作复盘** 串成闭环，同时提供目标规划和有来源的 AI 解读。

**定位：可应用的单用户全栈 MVP。** 本地计算和模拟账本可直接使用；接入自己的模型服务后可使用大模型解读。它不是持牌投顾服务，不连接真实交易，不提供真实行情或收益保证。

## 30 秒启动

安装 **Node.js 24 或以上版本**，在项目目录运行：

```bash
node --env-file-if-exists=.env server.mjs
```

打开 [本地工作台](http://127.0.0.1:3000)。**无 npm 依赖，无需 npm install，无需模型密钥。** 数据库首次启动时自动创建，初始资产为明确标记的演示数据。

有 npm 时也可以 `npm start`；修改代码时使用 `npm run dev`。Windows 可双击 `start.cmd`。

## 已实现

### 1.1.0：GitHub 对标优化

参考 Ghostfolio 的规则体检、skfolio 的策略对照和 FinRobot 的分层工作流，新增以下能力。来源、采纳范围与许可证说明见 [GitHub 研究记录](docs/GITHUB_RESEARCH.md)。未复制或打包上游源码。

- **组合体检**：估值核对时间、现金覆盖、非现金集中度、配置偏离和负债成本，逐项显示依据和下一步。
- **策略研究**：风险规则、约束逆波动、网格最小方差三种方案；统一约束下比较风险、压力情景、成交额与费用，可切换模拟目标。
- **AI 计算依据**：按问题选择资料，展开工作台版本、规则版本、关键数值与处理步骤。

| 模块 | 能完成什么 | 实现方式 |
|---|---|---|
| 资产概览 | 查看资产、配置偏离、目标缺口、持仓结构 | 全部由当前数据计算，无伪造业绩 |
| 风险测评 | 期限、承受意愿、经验、收入、储备、负债、必要支出 | 五档透明规则，财务能力限制主观意愿 |
| 智能配置 | 对比当前和目标比例，解释规则与现金底线 | 配置模板 + 现金约束，权重归一 |
| 策略研究 | 三种方案比较、费率敏感性、切换模拟目标、方差贡献 | 同一参数、共同上限与现金约束，选择操作可审计 |
| 压力测试 | 权益急跌、利率冲击、通胀、同步下跌 | 固定情景冲击，当前和目标配置并列比较 |
| 目标规划 | 月末定投复利、目标缺口、所需月投入、通胀购买力 | 支持零收益和负收益假设，逐年数据可查看 |
| 模拟调仓 | 编辑资产、预览交易、计费、确认入账 | SQLite 事务、版本冲突检查、幂等请求 |
| AI 理财助手 | 解读风险、配置、压力和目标，附参考来源 | 默认规则模式；可选兼容 chat completions 的 HTTPS 模型接口 |
| 操作记录 | 查看修改前后值、模拟交易和费用 | 最近 100 条审计记录展示，数据库保留完整记录 |
| 数据导出 | 下载问卷、资产、分析和最近操作记录 | JSON 导出；不包含密钥或会话口令 |
| 部署 | 本机直接运行、Docker、HTTPS 反向代理 | 内置 SQLite、单用户口令、GitHub Actions CI |

## 完整演示流程

1. 打开「资产概览」，确认页面右上角的“演示数据 · 非实时行情”。
2. 在「风险测评」将投资期限改为 1 年，保存；风险等级应降至保守，目标配置同步调整。
3. 进入「智能配置」，编辑四类资产金额，保存后数据标记变为“手动录入”。
4. 进入「压力测试」，比较当前组合和规则目标在同一冲击下的变动。
5. 回到「智能配置」，设置费率并预览调仓；核对费用后确认模拟执行。
6. 在「操作记录」检查调仓前后金额和费用；重复提交同一个请求不会重复扣费。
7. 在「目标规划」设置目标与月投入，查看缺口和逐年测算。
8. 在「AI 理财助手」询问配置或目标；未配置模型时，回复明确标记“本地规则解读”。

## 配置外部 AI

复制 `.env.example` 为 `.env`，按你自己的服务填写：

```dotenv
AI_BASE_URL=https://your-provider.example/v1
AI_API_KEY=your-own-secret
AI_MODEL=your-model-name
```

`AI_BASE_URL` 是 API 前缀；服务端在其后追加 `/chat/completions`。提供方需支持 `messages`、`max_tokens`、`temperature` 请求字段，以及 `choices[0].message.content` 响应格式。不同提供方的支持情况需要实测。

重启服务后，聊天区显示“AI 可用”。**每次发送前需勾选同意外部处理**；不勾选仍使用本地规则。自动附加的上下文仅含风险等级、配置比例、偏离与压力比例，不含资产金额、问卷原文、操作记录或密钥。用户自己在问题中填写的信息仍会发送，应避免敏感信息。

模型不能执行交易，数值面板始终由计算引擎生成。模型可能解释错误；提供方超时或出错时会明确降级为规则解读。**交付时未配置真实密钥，没有验证真实模型服务的连通性和输出质量。**

## 验证

```bash
node scripts/check.mjs
node --test
```

29 项测试涵盖财务约束、非法输入、复利边界、500 组组合守恒样本、策略比较与切换、API 全流程、幂等、版本冲突、访问认证、跨站保护、AI 计算依据和失败降级。CI 配置为在 Windows 和 Linux 的 Node 24 上执行同一套检查，尚未在远程触发。

`build` 是语法与资产完整性检查：本项目直接交付原生 ES Modules，不需要前端打包。数据库使用 Node 内置 `node:sqlite`；升级 Node 主版本时应重新执行测试。

## Docker

在 `.env` 中至少填写：

```dotenv
ACCESS_TOKEN=replace-with-a-random-token-of-at-least-24-characters
PUBLIC_ORIGIN=http://localhost:3000
```

```bash
docker compose up --build -d
```

访问 [Docker 本地工作台](http://localhost:3000)，输入访问口令。Compose 仅把端口暴露在宿主机回环地址；数据库保存在命名卷。不要把示例口令原样用于部署。

面向远程使用时配置 HTTPS 反向代理，设置真实的 `PUBLIC_ORIGIN` 和 `COOKIE_SECURE=true`，并保留正确的 Host 请求头。详见 [部署与维护](docs/DEPLOYMENT.md)。Docker 文件已提供，当前交付环境未运行 Docker 构建。

## 发布到 GitHub

本项目含 MIT License、`.gitignore`、CI、贡献说明和安全说明，可作为独立仓库发布。GitHub Pages 不支持 Node/SQLite 后端，因此不能直接把完整项目部署到 Pages。

在 GitHub 创建一个**空仓库**后，在本目录执行：

```bash
# 如果尚未初始化 Git：
git init
git add .
git commit -m "feat: initial WealthPilot research workbench"
git branch -M main

# 把下面地址替换为你自己的仓库：
git remote add origin https://github.com/YOUR_NAME/wealthpilot.git
git push -u origin main
```

发布前检查 `git status`，确保 `.env`、`data/`、导出的个人资产文件没有被纳入版本控制。仓库默认不含真实用户数据。**本次交付没有创建或推送远程 GitHub 仓库，也没有在线部署。**

## 项目结构

```text
wealthpilot/
├── server.mjs              # HTTP API、认证、来源校验、限流、静态页面
├── src/
│   ├── domain.mjs          # 纯计算、验证、规则与压力情景
│   ├── storage.mjs         # SQLite 状态、版本、审计与幂等事务
│   ├── strategies.mjs      # 原创配置方法与共同约束
│   ├── evidence.mjs        # 问题主题、资料选择与计算依据
│   └── advisor.mjs         # 规则解读和可替换的大模型适配器
├── public/                # 中文响应式工作台、原生 HTML/CSS/JS
├── tests/                 # 计算、API、AI 适配器测试
├── scripts/check.mjs      # 发布前检查
├── docs/                  # 产品、架构、算法、接口、部署和验收
├── .github/workflows/     # Windows / Linux CI
├── Dockerfile
└── compose.yaml
```

## 深度文档

- [产品设计与全链路规划](docs/PRODUCT.md)：用户、价值、业务闭环、落地与迭代。
- [系统架构与数据设计](docs/ARCHITECTURE.md)：模块边界、状态、事务、认证和扩展路径。
- [算法与假设](docs/METHODOLOGY.md)：公式、权重、现金约束、费用与局限。
- [接口契约](docs/API.md)：请求、响应、错误码和调仓生命周期。
- [部署与维护](docs/DEPLOYMENT.md)：启动、Docker、反向代理、备份和故障排查。
- [验收与测试](docs/ACCEPTANCE.md)：检查结果、手动验收脚本和未验证项。
- [GitHub 项目研究](docs/GITHUB_RESEARCH.md)：查看的上游源码、已采纳设计和未实现范围。
- [安全说明](SECURITY.md)、[贡献指南](CONTRIBUTING.md)。

## 应用边界

这是有持久化、验证和部署路径的个人研究 MVP，不是可直接服务公众的金融 SaaS。尚未实现多租户隔离、SSO/MFA、实时行情、历史回测、税务处理、订单执行、合规审查或可验证的防篡改审计。不要将一个实例共享给多个不互信用户。正式商业使用前须按目标市场和具体业务补齐上述能力并完成专业评估。

基础概念参考：[Investor.gov 资产配置](https://www.investor.gov/introduction-investing/getting-started/asset-allocation)、[自动化投顾说明](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-bulletins-45)、[自动化工具局限](https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins/investor-alerts/investor-56)。它们支持基础风险教育，不证明本项目模型有效，也不是中国市场的监管结论。
