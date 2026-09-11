# 部署与维护

## 本机启动

安装 Node.js 24+。项目不需要 npm install；在项目目录运行 `node --env-file-if-exists=.env server.mjs`。可复制 `.env.example` 为 `.env` 调整端口、数据目录和模型配置。启动日志显示准确地址。按 Ctrl+C 正常退出。

默认 `HOST=127.0.0.1`、`PORT=3000`、`DATA_DIR=./data`。相对 DATA_DIR 以项目目录解析；数据库不应放在 Git 跟踪目录或公开静态目录中。

## Docker 与远程访问

`docker compose up --build -d` 需要设置 24 字符以上随机 `ACCESS_TOKEN`。默认通过 `http://localhost:3000` 访问，PUBLIC_ORIGIN 必须完全一致，包括协议、主机和端口。

Compose 把服务端口绑定宿主机 `127.0.0.1`，数据库使用命名卷。远程访问时，在宿主机设置 HTTPS 反向代理到 `127.0.0.1:3000`，配置：

```dotenv
PUBLIC_ORIGIN=https://wealth.example.com
COOKIE_SECURE=true
ACCESS_TOKEN=your-long-random-access-token
```

反向代理必须保留 `Host: wealth.example.com`，并只对外开放 HTTPS。不要随意将 PUBLIC_ORIGIN 改成 `*`，本服务也不支持通配来源。容器内 HOST 为 `0.0.0.0`；若直接在宿主机绑定非回环地址，应由防火墙限制后端端口。

创建随机口令可以使用：

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

不要提交生成的口令或真实 `.env`。修改环境变量后需重启进程；修改 ACCESS_TOKEN 后重启会清空所有已有会话。

## SQLite 备份

最简单的备份方式是停止服务后，复制完整 DATA_DIR 或备份 Docker 数据卷，然后重启。不要在 WAL 模式运行期间只复制主 `.sqlite` 文件，这可能遗漏尚未 checkpoint 的数据。备份含财务档案和操作记录，应按敏感数据保管。

恢复时停止服务，将已验证的完整备份放回原数据目录，再启动并检查 bootstrap 和最近审计记录。本项目没有自动备份任务或恢复演练记录；部署者需安排与验证。

## 发布检查

1. `node scripts/check.mjs` 和 `node --test` 通过。
2. 检查 `git status`，确保真实 `.env`、数据库和个人导出文件未被跟踪。
3. 确认 Node 版本和持久磁盘，检查访问口令、PUBLIC_ORIGIN 与 TLS。
4. 在真实目标环境测试登录、保存、重启后数据保留和备份恢复。
5. 如启用外部 AI，以测试问题验证提供方协议、超时和费用，避免发送敏感内容。

## 故障排查

| 现象 | 检查 |
|---|---|
| `node:sqlite` 不存在 | Node 版本过旧，使用 24+ |
| `EADDRINUSE` | 端口已占用；更改 PORT，不要随意结束其他进程 |
| 来源无效 / Host 不匹配 | 浏览器地址、PUBLIC_ORIGIN、反向代理 Host 是否一致 |
| 401 | 口令/会话问题；进程重启后重新登录 |
| 409 | 页面持有旧版本，刷新后重新预览 |
| 429 | 稍后重试；反向代理下多客户端共享 socket IP 限流 |
| AI 降级 | 检查 API 前缀、模型、密钥、HTTPS 和提供方协议 |
| 重启数据消失 | DATA_DIR 是否改变，容器是否使用持久卷 |

此架构适合单进程、单用户部署。GitHub Pages 和无持久文件系统的静态托管不适合直接运行完整项目。当前交付未执行 Docker 构建、远程部署或真实模型调用。
