# 自己的电脑 + Cloudflare Tunnel

这条路线让自己的电脑运行 Couple Home 的独立 Node.js 后端，Cloudflare Tunnel 提供外网访问入口。下面以 Windows PowerShell 为例，Linux / macOS 可参考相同的端口和来源配置，并结合 [Cloudflare 官方说明](https://developers.cloudflare.com/tunnel/get-started/)调整命令。

`浏览器 → Cloudflare → cloudflared → 电脑上的 Node.js 后端 → 本机数据库和照片`

不需要阿里云服务器、D1、R2 或 ChatGPT 登录。电脑必须保持开机、联网且不休眠，并持续运行 Node 后端和 `cloudflared`；关机、断网或进程停止后，网站就不能访问。照片、记录和备份保存在电脑，电脑损坏仍可能丢失数据。Tunnel 本身可用在 Cloudflare 免费方案中；域名和其他可选服务的费用以实际情况为准。

本文基于 Cloudflare 官方文档整理；已用隔离数据模拟本机代理，验证 HTTPS 域名、首次初始化和登录。**真实 Cloudflare Tunnel 及固定域名部署尚需使用者在自己的网络和账号中验收**。直接连接同机回环地址的示例不需要 Nginx 或在电脑上额外安装源站证书，浏览器访问的 HTTPS 由 Cloudflare 提供；如果后端和 `cloudflared` 不在同一台机器，不要直接沿用本机 HTTP 示例。

## 开始前

1. 按 [README](../README.md#独立部署与本地使用)准备 Git、Node.js 22.18 或更新版本、pnpm 11.25.0，然后获取源码并构建：

   ```powershell
   git clone https://github.com/liu7866/couple-home.git
   cd couple-home
   pnpm install --frozen-lockfile
   pnpm run build:node
   pnpm run test:node
   ```

2. 从 [Cloudflare 官方下载页面](https://developers.cloudflare.com/tunnel/downloads/)安装 Windows 版 `cloudflared`，新开 PowerShell 运行 `cloudflared --version`。如果命令找不到，请检查安装路径或使用程序的完整路径。Windows 上的 `cloudflared` 需要按官方说明手动更新。
3. 下例使用本机 `127.0.0.1:3019`；如果端口被占用，请换一个空闲端口，并同时修改 Node 的 `PORT` 和 Tunnel 的服务地址。访问公开域名时，应用收到的 Host 必须和 `APP_ORIGIN` 中的域名一致。
4. 首次尝试请使用下面示例创建的**独立测试数据目录**，不要连接现有小屋、真实照片或备份。已使用的小屋应先验证备份，并确保同一数据目录不会被两个 Node 进程同时使用。
5. 检查网络可访问 Cloudflare Tunnel 的出站连接；受限网络通常需要允许 TCP 或 UDP 的 7844 端口，详见 [官方网络要求](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/)。公网发布后其他人可以访问登录页；Tunnel 不是自动的私密访问控制。

## 临时体验：Quick Tunnel

Quick Tunnel 不需要 Cloudflare 账号或域名，但网址是临时的，重启后会变化，不能当作长期服务。只用虚构测试数据；不要把生产小屋直接暴露在临时网址下。

1. 在源码目录打开第一个 PowerShell 窗口。下面的命令为每次测试创建独立数据位置，并先以本机地址启动后端：

   ```powershell
   $coupleTestRoot = Join-Path $env:LOCALAPPDATA ("CoupleHome\quick-tests\" + [guid]::NewGuid().ToString('N'))
   $env:DATA_DIR = Join-Path $coupleTestRoot 'data'
   $env:BACKUP_DIR = Join-Path $coupleTestRoot 'backups'
   $env:HOST = '127.0.0.1'
   $env:PORT = '3019'
   $env:TRUST_PROXY = '0'
   $env:APP_ORIGIN = 'http://127.0.0.1:3019'
   node .\dist-node\server.mjs
   ```

   等待启动，确认能打开 `http://127.0.0.1:3019/`；此时先不要填写真实信息。保持这个窗口打开。

2. 再打开第二个 PowerShell 窗口并运行：

   ```powershell
   cloudflared tunnel --url http://127.0.0.1:3019
   ```

   保持窗口运行，等待输出形如 `https://随机名称.trycloudflare.com` 的地址。这个地址已经公开，不要把账号密码或初始化码发到群聊。Quick Tunnel 的可用性没有保证；若有本机已有的 `cloudflared` 配置或网络限制，请先按 [官方 Quick Tunnel 文档](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)排查，不要覆盖已有 Tunnel 配置。

3. 回到**第一个窗口**，按 `Ctrl+C` 停止刚才的 Node 进程。将下面的示例改为第二个窗口给出的完整 HTTPS 地址，不带末尾斜线，再重新启动：

   ```powershell
   $env:APP_ORIGIN = 'https://替换成实际的.trycloudflare.com'
   node .\dist-node\server.mjs
   ```

   此窗口保留了上一步的端口和测试数据环境变量。网站只接受与 `APP_ORIGIN` 对应的 Host；直接把 Tunnel 指向原来的本机预览而不修改来源通常会返回 400。首次 HTTPS 创建需要初始化码，程序会在此窗口显示；由使用者私下查看并在网页中填写，不要复制到公开位置。

4. 使用第二个窗口输出的 HTTPS 地址打开测试小屋，设置虚构的测试密码并验证。测试完可分别在两个窗口按 `Ctrl+C`。如关闭 PowerShell 后重新测试，请重新按步骤创建独立数据目录；每次地址变化都必须让后端的 `APP_ORIGIN` 与之匹配。

## 固定域名：长期使用

需要自己的 Cloudflare 账号和已接入 Cloudflare 的域名，例如 `home.example.com`；下面的域名仅作示例，必须替换成自己的。Cloudflare 控制台的名称可能随版本变化。

1. 登录 Cloudflare，在 **Networking → Tunnels** 创建 Tunnel，选择 Windows 并按控制台的提示连接本机 `cloudflared`。安装为 Windows 服务可能需要管理员权限；不要卸载或覆盖已有的 Tunnel 服务。安装命令中的 Tunnel 令牌是私密凭据，不要提交仓库、发给 AI 或公开分享。参考 [Cloudflare 创建 Tunnel](https://developers.cloudflare.com/tunnel/get-started/)。
2. 在该 Tunnel 的 **Routes → Add route → Published application** 中添加网址，例如 `home.example.com`，服务地址填 `http://127.0.0.1:3019`。Cloudflare 会为该路线设置 DNS；若同名记录冲突，先检查已有用途，不要随意删除。若设置了 `HTTP Host Header`，其值应为实际公开域名 `home.example.com`，不要填 `127.0.0.1:3019`。[官方路线说明](https://developers.cloudflare.com/cloudflare-one/networks/routes/add-routes/)
3. 在源码目录打开 PowerShell。以下使用仓库外的持久目录；如果该目录已有小屋，请保留并先备份，不要重新初始化。把 `APP_ORIGIN` 改成步骤 2 的真实 HTTPS 域名：

   ```powershell
   $coupleHomeRoot = Join-Path $env:LOCALAPPDATA 'CoupleHome\home'
   $env:DATA_DIR = Join-Path $coupleHomeRoot 'data'
   $env:BACKUP_DIR = Join-Path $coupleHomeRoot 'backups'
   $env:HOST = '127.0.0.1'
   $env:PORT = '3019'
   $env:TRUST_PROXY = '0'
   $env:APP_ORIGIN = 'https://home.example.com'
   node .\dist-node\server.mjs
   ```

   如果是全新的公网小屋，按窗口中的私有初始化码提示，在自己的 HTTPS 网站中设置两位成员的密码。已有小屋使用原密码登录；更换域名后浏览器可能需要重新登录。不要在公开场所分享初始化码或登录凭据。

4. 检查 Cloudflare 中 Tunnel 已连接，再通过 `https://你的域名/healthz`、首页、两位成员登录以及虚构照片上传进行验证。关掉 Node 的 PowerShell 窗口后网站会停止；重新打开窗口时要重新设置上述环境变量并启动。电脑重启后也需确认 Node 和 Tunnel 均已运行；如设置自动启动，先核对用户权限、数据目录和运行状态。

公网 HTTPS 的初始来源、登录 Cookie 和初始化码由项目后端按 `APP_ORIGIN` 处理。由于此示例的 `cloudflared` 与应用在同机、且 `TRUST_PROXY=0`，后端看到的是本机连接，多位访问者可能共享登录和恢复码的 IP 限流额度。不要仅为获取访客 IP 就信任任意外部传入的 IP 头；只有经过安全配置并验证的可信代理才能提供此信息。

## 备份、验收与排错

- 在网站中由管理员下载完整备份，并私下保存；网页 JSON 导入上限为 1GB。服务器快照还包含密码哈希、会话和照片等敏感信息，不要放进公开仓库或 Issue。
- 固定域名示例可在另一个 PowerShell 窗口进入源码目录，重新设置与后端**相同**的 `DATA_DIR`、`BACKUP_DIR`，再运行 `node .\dist-node\backup.mjs`。命令会创建并校验快照；将其另存到电脑以外的私有位置。恢复和校验说明见 [服务器备份与恢复](node/部署说明.md#备份与恢复)。
- 用另一台设备或移动网络访问实际 HTTPS 域名，检查 `/healthz`、登录、上传、备份，以及重启后数据仍然存在。测试通过才代表当前环境可用，Cloudflare 账号中的 Tunnel 连接状态不等于所有功能都已验证。
- 遇到 400“请求地址不正确”：核对 `APP_ORIGIN`、公开域名与转发的 Host；不要把 `APP_ORIGIN` 写成回环 HTTP 地址。遇到 502：检查 Node 是否运行、端口与 Tunnel 的服务地址是否一致。Tunnel 不在线时检查 `cloudflared`、防火墙和出站网络。[Cloudflare 排错说明](https://developers.cloudflare.com/tunnel/troubleshooting/)
- 不要为登录、`/api/*` 和私人照片启用强制缓存。公网入口可另外配置 Cloudflare Access 限制访问；能否访问和额外费用以当前账号设置为准。

项目源码或本指南更新后，不会自动更新你电脑上的运行程序。更新前先确认并校验备份，再构建新版本，保留原 `DATA_DIR`；不要重新创建账号或覆盖真实数据。
