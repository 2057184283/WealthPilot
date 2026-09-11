# API 契约

本地默认地址 `http://127.0.0.1:3000`。JSON 请求不支持跨域；修改类请求须带 `Content-Type: application/json` 和与访问地址一致的 `Origin`。设置访问口令后，通过 Cookie 会话访问，暂无 Bearer token 或第三方 API 授权。

| 方法与路径 | 用途 | 请求体 |
|---|---|---|
| GET `/api/health` | 无身份健康检查 | 无 |
| POST `/api/login` | 口令登录 | `{token}` |
| POST `/api/logout` | 退出 | `{}` |
| GET `/api/bootstrap` | 工作台、分析、策略、审计、来源与模式 | 无 |
| PUT `/api/workspace` | 保存一个分区 | `{version,section,value}` |
| POST `/api/strategies/compare` | 按费率比较，不写数据 | `{version,feeBps}` |
| POST `/api/rebalance/preview` | 预览当前策略调仓，不写数据 | `{version,feeBps}` |
| POST `/api/rebalance/execute` | 确认模拟执行 | `{version,feeBps,key,confirm:true}` |
| POST `/api/chat` | 获取解释 | `{question,externalConsent:false}` |

`section` 为 `profile`、`holdings`、`goal` 或 `strategy`。前三者字段参考 [数据设计](ARCHITECTURE.md)；`strategy` 的 value 是 `policy`、`inverse-vol` 或 `min-variance` 字符串。未知字段不会作为金额或目标权重使用。保存策略会增加版本并审计，但不会修改持仓。

## 本地读取示例

```bash
curl http://127.0.0.1:3000/api/bootstrap
curl -X POST http://127.0.0.1:3000/api/rebalance/preview \
  -H 'Origin: http://127.0.0.1:3000' \
  -H 'Content-Type: application/json' \
  -d '{"version":1,"feeBps":10}'
```

以上为 Bash 示例；Windows PowerShell 可用 `Invoke-RestMethod` 或 `curl.exe`。版本应使用最新 bootstrap 返回值，不能固定使用示例的 1。

## 主要响应

Bootstrap 返回 `state`、`analysis`、`strategies`、`audit`、`assets`、`sources`、`aiConfigured` 和 `authEnabled`。`analysis` 包含当前/目标指标、配置方案、风险画像、体检、压力情景、目标计算与规则版本。

预览返回 `{version,plan}`，plan 包含 `strategy`、`feeBps`、`fee`、`totalBefore`、`totalAfter`、`turnover`、`holdings` 和四项 `trades`（before/after/delta）。执行返回 `{state,plan}`。服务端重新计算，不使用客户端提供的交易金额。

AI 返回 `mode: rules|model`、`answer`、`sources`、`evidence`、`policyVersion`、`asOf`、`notice`，降级时附 `degraded:true`。证据记录工作台版本、主题、计算数值、数据模式和处理步骤；不声称逐句验证模型输出。无配置、未同意或超出支持范围时不会调用外部模型。

## 一致性与错误

每次修改都检查 `version`。冲突返回 409，前端刷新后重新操作。`key` 为 16–80 个字母、数字或连字符；推荐使用 UUID。重试同一执行必须复用同一个键和相同 version/feeBps，才能返回原执行结果；同键不同负载返回 409。

所有错误为 `{error: "可读错误信息"}`：400 输入错误，401 未登录或口令错误，403 来源/Host 不匹配，404 未知接口，409 版本/幂等冲突，413 超过 32 KB，415 Content-Type 错误，429 超频，500 内部异常，503 模型配置错误。

写操作每 IP 每分钟最多 90 次，聊天 12 次，登录每 5 分钟 8 次。会话与限流在进程内保存；重启清空，多个实例不共享。审计 API 仅返回最近 100 条。
