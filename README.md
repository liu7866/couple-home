# 我们的小日子 · Couple Home

一个温馨的双人小屋，让两个人一起记录生活，也一起养一只电子宠物。

## 最近更新

- 新增可选相册 AI 整理、自动分类和语义搜索；不配置 AI 时仍可按备注搜索和按月份浏览。配置方法与数据发送范围见[相册 AI 配置](deploy/相册AI配置.md)。

最近检查修复了首次加载宠物占位数值、异常 JSON 请求提示和本地不同端口登录互相覆盖的问题；包含新增相册 AI 测试的完整回归为 124 项通过。验证过程见[验证记录](deploy/node/验证结果.md)。

- 首次使用可直接设置两位成员密码，默认身份为成员一、成员二；管理员可自定义身份名称。
- 相册可保存 2,000 张照片，每次多选最多 20 张，保留继续添加入口；重试去重，并发上传也不会突破容量上限。
- 小猫、小兔分别有幼年、少年、成年形象，达到成长值 200、500 时自动变化；喂食、玩耍、摸摸和睡眠使用对应动作。
- 睡眠倒计时与精力恢复实时更新；小屋颜色和六件装饰实时预览，保存后同步。
- 密码可设置为 6 至 128 个字符；新恢复码 12 位、每 4 位分组，兼容旧的 64 位恢复码。
- 新增独立 Node.js / SQLite / 本地照片后端，以及阿里云、Cloudflare 接入和备份部署说明。

## 功能

双人密码登录、恋爱天数、纪念日、回忆时间线、心愿、独立心情、私密相册、留言和未来信，以及共享宠物、每日问答、约会灵感、双人日历、小券、个人偏好档案和离线月度回忆册。

## 自定义与二次开发

想换网站名称、配色、宠物形象，或修改成长、装饰和相册规则，先看[自定义修改指南](自定义修改指南.md)。指南包含设置入口、源码位置、修改示例、独立测试数据预览和验证命令。

## 独立部署与本地使用

独立 Node.js 版不需要 ChatGPT 登录、D1 或 R2，适合自己的电脑及阿里云 / Linux 服务器。
需要 Node.js 22.18 或更新版本，以及 pnpm 11.25.0。

```sh
git clone https://github.com/liu7866/couple-home.git
cd couple-home
pnpm install --frozen-lockfile
pnpm run build:node
pnpm run test:node
pnpm run start:node
```

打开 http://127.0.0.1:3000，首次页面设置自己的两位成员密码。成员一拥有管理员权限，创建后自动进入小屋设置。原有小屋不能再次初始化覆盖数据。

构建得到的 `dist-node/` 可单独部署，运行时不需要安装依赖。公网 HTTPS 首次创建需要部署者提供初始化码，具体见部署说明。

- [部署方式总览](deploy/README.md)
- [阿里云 / Linux 部署](deploy/node/部署说明.md)
- [Cloudflare 接入及 Workers 限制](deploy/cloudflare.md)
- [本地使用与迁移](本地使用说明.md)
- [验证记录](deploy/node/验证结果.md)

默认 SQLite 数据库、照片和备份保存在 `dist-node/data/`、`dist-node/backups/`。正式服务器应配置独立的持久化路径并定期校验备份，不要将真实数据提交到仓库。

## Sites / Cloudflare 版本

原平台版本使用 TypeScript / Vinext / React / Cloudflare Workers / D1 / R2。管理员认证依赖 Sites 提供的可信 ChatGPT 登录网关；迁入个人 Workers 账号仍需完成独立认证适配，不能直接作为一键部署模板使用。

在 Sites 创建自己的项目时，使用该项目自己的 `.openai/hosting.json` 项目标识和 D1/R2 资源，按顺序应用 `drizzle/*.sql`，并配置自己的 `OWNER_LOGIN_EMAIL`。仓库没有预设真实项目 ID。生产环境不能信任用户伪造的身份头，详见 [SECURITY.md](SECURITY.md)。

原平台本地开发：

```sh
cp .env.example .dev.vars
pnpm dev
pnpm build
node --test tests/home-domain.test.mjs tests/home-storage.test.mjs tests/home-api.test.mjs
```

开发模拟身份只供本地使用；原平台的 `.wrangler/` 数据和独立版的 SQLite 数据相互分开。

## 可选 GitHub Pages 前端

GitHub Pages 只能托管静态前端，不能运行本仓库的数据库和后端。先部署自己的 Sites 后端，并配置 `PAGES_ORIGIN` 为自己的完整 HTTPS Pages 来源，不带项目路径。

```sh
API_ORIGIN=https://YOUR_BACKEND_HOST node scripts/export-github-pages.mjs
```

将 `outputs/github-pages/` 内容发布到自己的 Pages 仓库。导出脚本必须显式指定自己的后端地址，不会默认连接维护者的小屋。私人设备可选择记住登录 30 天，退出或改密会使会话失效。

仓库代码更新不会自动更新任何人的实际服务器；新的密码、恢复码和相册容量规则需要部署相应后端后才会生效。

## 备份、恢复与安全

完整备份由管理员下载，包含记录、照片与宠物状态，不包含登录密码、会话或恢复码。备份可能包含未到期未来信和未揭晓问答，请私下保存。恢复前先下载当前备份；照片始终合并，版本变化时会阻止覆盖，避免另一台设备的新记录丢失。

个人恢复码是备用钥匙，每次使用后轮换。新码支持小写、空格和分隔线输入；旧码仍可用，重新生成后旧码失效。原有密码不会被自动更改。密码使用随机盐与 PBKDF2-SHA256（600,000 次迭代），接口保留会话校验、来源限制与尝试次数限制。

仓库只包含源码及虚构测试数据，不包含真实回忆、照片、密码哈希、恢复码、会话或云资源配置。请勿提交环境变量、密钥、数据库导出及真实相册，也不要将这些数据贴进公开 Issue。

## 贡献与许可

欢迎提交 Issue 或 Pull Request，详见 [CONTRIBUTING.md](CONTRIBUTING.md)。原创代码采用 [MIT License](LICENSE)；第三方依赖和 vendor 文件继续适用各自许可证，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
