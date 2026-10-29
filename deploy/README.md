# 部署方式

更新：2026-10-25。

| 方式 | 使用的代码和数据 | 当前状态 | 说明 |
| --- | --- | --- | --- |
| 阿里云 / 普通 Linux 服务器 | `dist-node/`，SQLite，本地照片，独立成员密码 | 本地构建及接口验证通过，待服务器验收 | [阿里云部署](node/部署说明.md) |
| Cloudflare DNS/代理 + 阿里云后端 | 同上，Cloudflare 负责域名与代理 | 配置方法已说明，未实网验证 | [Cloudflare 接入](cloudflare.md#方式一cloudflare-域名代理--阿里云后端) |
| 原 Sites 托管的 Cloudflare Workers + D1 + R2 | `worker/`、`app/api/`，原平台身份入口 | 现有原站的托管方式 | [原托管版本维护](cloudflare.md#方式二原托管平台上的-workers--d1--r2) |
| 自己账号下完全独立的 Workers + D1 + R2 | 需补账号初始化和可信管理员认证，再绑定自己的云资源 | 尚未完成独立部署适配，不能宣称一键可用 | [独立 Workers 的限制](cloudflare.md#方式三迁到自己的-cloudflare-workers-账号当前未完成) |

`dist-node/` 是 Node 服务器程序，不能上传到 Cloudflare Pages 当作后端。
`pnpm start` 启动的是旧版 Wrangler 本地开发服务；独立版使用 `pnpm start:node`。
`node admin.mjs init` 与 SQLite 文件快照工具只适用于独立 Node 部署包。
原站真实记录与照片不会随源码一起移动；迁移前先由管理员下载完整备份。

本仓库根目录保存完整源码。可选 Pages 前端通过导出脚本连接使用者自己的 HTTPS 后端。
更新仓库或部署文档不会自动更新任何实际服务器。

可选相册 AI 搜索与自动分类无需另建 AI 服务器，部署者可接入兼容服务。配置、迁移、模型能力和数据发送范围见[相册 AI 配置](相册AI配置.md)。

希望让 Qoder、WorkBuddy、豆包或 Trae 协助安装与部署，可先看 [AI 工具部署指南](AI工具部署指南.md)。
