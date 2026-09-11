# GitHub 项目研究与本次改进

研究日期：2026-09-10。以下结论来自公开仓库的 README、具体实现和官方文档；分支链接会随上游变化。未运行上游系统、未评估其投资业绩，也不以 Star 数作为代码质量或收益证明。

## 研究对象与证据

| 项目 | 实際查看的内容 | 对当前项目的启发 |
|---|---|---|
| [Ghostfolio](https://github.com/ghostfolio/ghostfolio) | [PortfolioService / getReport](https://github.com/ghostfolio/ghostfolio/blob/main/apps/api/src/app/portfolio/portfolio.service.ts)：现金、应急资金、资产类别集中度等规则分组 | 将资产体检做成独立、可解释的规则清单 |
| [skfolio](https://github.com/skfolio/skfolio) | [Naive estimators](https://github.com/skfolio/skfolio/blob/main/src/skfolio/optimization/naive/_naive.py)：逆波动权重与归一；[Portfolio 文档](https://github.com/skfolio/skfolio/blob/main/docs/user_guide/portfolio.rst)：组合计算考虑成本 | 为不同配置方法提供统一约束、指标、费用和对照 |
| [FinRobot](https://github.com/AI4Finance-Foundation/FinRobot) | [workflow.py](https://github.com/AI4Finance-Foundation/FinRobot/blob/master/finrobot/agents/workflow.py)：代理工作流与角色组织；README 的数据、模型与应用分层 | 把计算结果、资料和模型解释分开，保留可检查的任务证据 |

## 已落到代码中的变化

### 1. 组合体检

新增估值核对、现金覆盖、非现金集中度、配置偏离和负债成本五项检查，每项显示状态、数值、规则解释与下一步入口。原有金额没有核对时间时显示“未知”；模拟调仓不会刷新估值时间。实现于 `src/domain.mjs` 的 `diagnostics()`。

### 2. 策略研究

新增风险规则、约束逆波动和网格最小方差三种方案。比较固定现金、权益上限、黄金上限下的假设波动、假设收益、最不利内置情景、双边成交额和一次费用。用户可改变费率重新比较，再显式选择模拟目标；实际持仓仍通过原来的预览与确认流程调整。

逆波动是通用数学方法。本项目的受约束分配和网格搜索是自行实现，未移植 skfolio；固定参数不能代表从历史数据拟合出来的模型，也未实现 skfolio 的交叉验证或完整优化库。

### 3. AI 计算依据

增加问题主题分类与规则资料选择。每次回答可展开数据版本、规则版本、计算时间、关键数值和实际处理步骤。修复“现金目标比例”误入储蓄计算的问题；模型上下文补入目标规划的比例结果，但不自动发送绝对金额。

本版没有实现 FinRobot 的多代理框架，也没有向量检索。这里采用简单、可测试的主题路由，模型不能更改资产或执行交易。

### 4. 工程修正

补充扣费后的绝对现金底线、策略变更审计、策略与调仓一致性测试，修复目标输入的 HTML 步长。源码仍无第三方运行依赖。

## 许可证与代码来源

上游公开仓库显示 Ghostfolio 使用 AGPL-3.0、skfolio 使用 BSD-3-Clause、FinRobot 使用 Apache-2.0。本次只研究架构、数学概念与产品组织，**未复制或打包上游源文件、UI 资产、模型权重或数据集**。当前源码采用 MIT；未来若引入上游代码或依赖，需要根据具体内容另行处理许可证和归属，不能沿用本次“仅参考”的结论。

参考许可证：[Ghostfolio](https://github.com/ghostfolio/ghostfolio/blob/main/LICENSE)、[skfolio](https://github.com/skfolio/skfolio/blob/main/LICENSE)、[FinRobot](https://github.com/AI4Finance-Foundation/FinRobot/blob/master/LICENSE)。

## 下一阶段的优先级

1. 证券主数据与合法可用的价格数据：来源、更新时间、币种、复权和质量状态。
2. 历史回测与样本外验证：基准、成本、滑点、再平衡、前视偏差和生存者偏差。
3. 多用户身份和账户隔离，再开展共享部署。

以上为后续方向，本次没有将它们标记为已实现。
