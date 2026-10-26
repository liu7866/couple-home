# Cloudflare 接入、原托管部署与独立 Workers 限制

更新：2026-10-25。先选清楚部署方式，三种方式的数据和登录入口不同。

## 方式一：Cloudflare 域名代理 + 阿里云后端

这条路径使用已经完成适配的独立 Node.js 版本，不依赖 ChatGPT 登录。
Cloudflare 管理域名或转发 HTTPS，阿里云仍负责运行后端和保存数据。

1. 按 [阿里云部署说明](node/部署说明.md) 构建 `dist-node/`，配置服务、账号、Nginx 与 HTTPS。
2. 在 Cloudflare 接入自己的域名，并按控制台要求完成域名的 Nameserver 设置。
3. 在 DNS 中添加网站域名的 A 记录，指向服务器公网 IPv4。若配置 AAAA，
   必须确认服务器 IPv6 和防火墙可用；不要留下指向旧服务器的记录。
4. 可以先选择 DNS only 验证源站。需要代理时再开启该记录的 Proxied 状态。
5. Nginx 必须配置与网站域名匹配的有效 HTTPS 证书。开启代理后，在 Cloudflare
   SSL/TLS 设置中选择 **Full (strict)**。不要用 Flexible 去连接本项目的 HTTPS 重定向源站。
6. 应用环境中的 `APP_ORIGIN` 设置为最终浏览器来源，如 `https://home.example.com`，
   不带路径或末尾斜线。Nginx 保留 Host；Node 端口 3000 只监听本机。
7. 不要为 `/api/*`、登录页或私人照片添加 Cache Everything 等缓存覆盖规则。
   本项目已经返回 `no-store`，私人内容应按该响应策略处理。
8. 依次验收首页、两位成员登录、照片上传、密码修改、备份和服务重启后的数据。

默认 Nginx 配置传给 Node 的 X-Real-IP 是 Nginx 的直接连接地址。
Cloudflare 代理开启后，它通常是 Cloudflare 节点地址，因此多人可能共用登录限流额度。
若需要还原真实访客 IP，需由服务器管理员仅信任 Cloudflare 官方公布的网段，
再在 Nginx 配置 Real IP 模块；不要直接信任任意客户端提供的 CF-Connecting-IP。

此方式不需要创建 D1 或 R2，也不把 `dist-node/data/` 上传到 Cloudflare。
部署位置、网络与域名手续按实际服务器和账号要求另行确认；本仓库没有完成实网验收。

## 方式二：原托管平台上的 Workers + D1 + R2

原站使用此方式：

- Worker 入口为 `worker/index.ts`，后端接口位于 `app/api/`。
- D1 绑定名必须是 `DB`，R2 绑定名必须是 `BUCKET`。
- `.openai/hosting.json` 保存原站项目身份和绑定声明；它不是个人 Cloudflare 账号的 Wrangler 配置。
- `OWNER_LOGIN_EMAIL` 是原平台可信身份中的管理员邮箱；`PAGES_ORIGIN` 是允许的静态前端完整 HTTPS 来源。
- 管理员登录依赖平台验证后注入的身份头。`/signin-with-chatgpt` 是平台入口，不是本仓库自行实现的普通接口。

维护已有原站时：

1. 先确认目标是同一个原站项目及同一份 D1/R2 数据，保存当前完整备份。
2. 从本仓库取得源码，使用项目锁定的 Node/pnpm 环境安装依赖。
3. 运行 `pnpm run build`，检查 Worker 构建与 `dist/server/wrangler.json`。
4. 执行 `node --test tests/home-domain.test.mjs tests/home-storage.test.mjs tests/home-api.test.mjs`。
   后两项会使用隔离的本地 Worker/D1/R2，不把测试数据写入原站。
5. 通过原托管平台的源码同步、保存版本、发布流程更新已有项目，保持原项目 ID 与访问范围。
   资源绑定及正式环境变量由平台管理，不替换成示例 ID，也不重新创建一个空站覆盖原站。
6. 确认全部 `drizzle/*.sql` 已应用到目标数据库，尤其是 `member_passwords` 和 `recovery_codes`。
   已应用的迁移不可改写；若出现“表已存在”，先查迁移记录，不删除现有表重来。
7. 发布完成后验证管理员入口、两位成员密码、照片读写和备份。构建成功不等于这些功能已通过。

本地开发可运行 `node scripts/local-dev.mjs`。端口为 5173，数据保存在 `.wrangler/`，
使用回环地址上的模拟身份。这不是生产部署，也不会自动同步云端记录。

## 方式三：迁到自己的 Cloudflare Workers 账号（当前未完成）

**当前仓库没有完成可直接迁入个人 Cloudflare 账号的独立认证配套。**
Worker 能构建、D1/R2 能创建，并不代表管理员可以安全登录和首次设置密码。
目前 `vite.config.ts` 中的数据库 ID `00000000-0000-4000-8000-000000000000`
和 `site-creator-r2` 都是本地开发占位配置，不能作为生产资源使用。

还需完成以下事项后，才能给出完整可执行的独立 Workers 发布方案：

1. 为 Workers 实现不依赖原平台的管理员认证和首次账号初始化。
2. 保留现有成员密码、会话撤销、恢复码和备份权限验证。
3. 将自己的真实 D1 ID、R2 名称写入可维护的 Wrangler/Vite 配置，且构建不会覆盖它们。
4. 在自己账号的 Worker 中验证跨站来源、HTTPS、照片权限、迁移和备份恢复。

以下只说明云资源准备方法，**不是已经验证可用的完整部署命令序列**：

```sh
pnpm exec wrangler login
pnpm exec wrangler whoami
pnpm exec wrangler d1 create little-days-db
pnpm exec wrangler r2 bucket create little-days-photos
```

运行后复制账号实际返回的资源标识。D1 配置应使用 `binding: "DB"`，
R2 使用 `binding: "BUCKET"`；D1 的 `migrations_dir` 指向本仓库的 `drizzle/`，
并按配置文件位置计算相对路径。确认资源与迁移历史后，才对指定配置执行：

```sh
pnpm exec wrangler d1 migrations list DB --config YOUR_CONFIG_PATH --remote
pnpm exec wrangler d1 migrations apply DB --config YOUR_CONFIG_PATH --remote
```

`YOUR_CONFIG_PATH` 必须替换成已完成真实资源与认证适配的配置文件。
远程命令会访问自己的云资源，不能把它指向原托管站而假定有相同权限。
R2 保持私有，照片通过已验证会话的 API 读取。

不要在公网 Worker 中直接信任用户发送的 `oai-authenticated-user-*` 头，
也不要用本地模拟登录替代正式认证。`OWNER_LOGIN_EMAIL` 本身不会生成可信登录身份。
Node 版的 `admin.mjs`、`home.sqlite` 和文件快照也不能当作 D1 初始化命令直接使用。

## 官方参考

- [Cloudflare DNS 记录管理](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/)
- [Full (strict) HTTPS](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)
- [D1 Wrangler 命令](https://developers.cloudflare.com/d1/wrangler-commands/)
- [D1 迁移目录与迁移记录](https://developers.cloudflare.com/d1/reference/migrations/)
- [R2 桶创建与私有访问](https://developers.cloudflare.com/r2/buckets/create-buckets/)

此文档整理了现有代码的实际能力，没有在你的 Cloudflare 账号中创建资源或发布新 Worker。
