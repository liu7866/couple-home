# 我们的小日子 · Couple Home

一个温馨的双人小屋，让两个人一起记录生活，也一起养一只电子宠物。

## 功能

- 双人身份与独立密码登录，另一半无需 ChatGPT 账号
- 恋爱天数、纪念日、回忆时间线、心愿与独立心情
- 私密相册、留言与到期才能打开的未来信
- 共享电子宠物：喂食、玩耍、抚摸、睡觉与照顾记录
- D1 云端同步、R2 照片存储、操作去重与并发冲突保护
- 可选 GitHub Pages 前端；私人设备可选记住登录 30 天

## 技术与部署范围

TypeScript / Vinext / React / Cloudflare Workers / D1 / R2。

**当前版本是 Sites 平台项目源码，不是一键部署到任意 Cloudflare 账号的模板。** 老大首次设置密码和找回密码依赖 Sites 提供的可信 ChatGPT 登录网关。GitHub Pages 只能托管前端，完整功能需要后端。尚未提供通用邮箱注册、独立管理员初始化或第三方 OAuth 部署适配。

## 在 Sites 中部署自己的小屋

1. Fork 或下载源码，在 Sites 中创建一个属于自己的新项目，并导入这些源码。
2. 由 Sites 为新项目生成自己的 `.openai/hosting.json` 中的 `project_id`，保留 D1 绑定 `DB` 和 R2 绑定 `BUCKET`。本仓库没有预设项目 ID；请勿复用其他人的项目。
3. 为该项目配置自己的 D1、R2，按顺序应用 `drizzle/*.sql` 中的三份迁移。可以让 Sites 完成资源绑定和迁移。
4. 在平台中设置 `OWNER_LOGIN_EMAIL` 为老大的 ChatGPT 登录邮箱。需要外部密码登录时，站点访问范围应允许公开访问；小屋数据由应用自身的会话鉴权保护。
5. 构建并发布，点击「我是老大」通过可信平台登录，在「双人小屋设置」分别设置两位成员密码。
6. 两人使用各自身份和密码登录，数据保存到自己项目的数据库和图片存储。

各账号的 Sites 资源权限与发布能力可能不同，资源创建及部署由平台管理。迁移已有数据前请自行备份。

## 本地开发

需要 Node.js >= 22.13 和 package.json 指定的 pnpm。运行于 Sites 开发环境时使用平台提供的依赖与绑定。

```sh
pnpm install --frozen-lockfile
cp .env.example .dev.vars
pnpm dev
```

本地模拟身份仅供开发。生产必须由可信网关提供身份；详见 [SECURITY.md](SECURITY.md)。

```sh
pnpm build
node --test tests/home-domain.test.mjs tests/home-storage.test.mjs tests/home-api.test.mjs
```

API 测试启动隔离的 Worker、D1 和 R2，不访问线上小屋。修改数据库结构后再运行 `pnpm db:generate`，不要改写已应用的迁移。

## 可选 GitHub Pages 前端

先部署自己的 Sites 后端，再在后端配置 `PAGES_ORIGIN` 为 Pages 的完整来源，例如 `https://YOUR_NAME.github.io`（不带项目路径）。

```sh
API_ORIGIN=https://YOUR_BACKEND_HOST node scripts/export-github-pages.mjs
```

将 `outputs/github-pages/` 内容放到自己的 Pages 仓库根目录，设置 Pages 从 main 分支根目录发布。导出脚本必须显式指定自己的后端地址。跨站登录默认仅在页面内存；可在私人设备上选择保存最多 30 天，退出或改密即失效。

## 安全与隐私

仓库仅包含源码和虚构测试数据，不包含用户回忆、照片、真实登录密码或线上资源配置。密码使用随机盐和 PBKDF2-SHA256（600,000 次迭代）；照片和数据接口均验证会话。请勿提交 `.dev.vars`、密钥、数据库导出或真实相册。

## 贡献与许可

欢迎通过 Issue 反馈问题，或提交 Pull Request。请参阅 [CONTRIBUTING.md](CONTRIBUTING.md)。本项目原创代码采用 [MIT License](LICENSE)；第三方依赖及保留的 vendor 文件继续适用其各自许可证，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 备份、恢复与个人恢复码

完整备份由老大下载，包含未到期未来信原文、照片数据和宠物状态，不包含密码、会话和恢复码。手机可通过生成后的保存链接或系统分享保存到文件。确认文件已保存后，页面记录本设备的备份日期，并在超过一周或新增较多回忆时提醒。

导入前会展示数量和宠物成长值，并校验新版备份照片的 SHA-256。默认合并文字、心情和照片，保留当前宠物；老大可输入「恢复小屋」，将文字、设置、心情和宠物恢复到备份。照片始终合并，不删除当前照片。预览后小屋版本变化会阻止恢复，要求重新预览。恢复前建议先下载当前完整备份。

在「双人设置 → 密码与恢复码」中，老大可为已设置密码的成员生成个人恢复码。请各自私下保存；登录页可用它重设密码，无需 ChatGPT 账号。恢复码仅显示一次、使用后轮换、老大重新设置密码时失效。正式部署必须应用全部 drizzle 迁移，包括 recovery_codes 表。

宠物成长分幼年、少年、成年，照顾偏好由共享日记计算。双人小游戏需两位成员在 5 分钟内先后回应才增加成长值，操作仍使用服务器去重和冷却。
