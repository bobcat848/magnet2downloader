# Magnet to Download Client

一个 Tampermonkey 用户脚本：在网页里的磁力链接旁添加一个推送按钮，点击即可把链接发送到 qBittorrent 或任意自定义 HTTP API。

## 功能

- 自动识别页面中的 `magnet:` 链接，并在旁边注入推送按钮
- **qBittorrent**：自动登录 Web UI 并添加任务，支持自定义保存路径
- **自定义 HTTP API**：可配置请求方法、请求体模板（用 `{magnet}` 占位）、保存路径
- 设置保存在脚本管理器的存储中，通过脚本菜单「下载器设置」修改
- 发送结果以页面内提示（toast）反馈，并避免重复发送同一链接

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)（或兼容的脚本管理器）
2. 打开脚本的原始文件并安装：
   <https://raw.githubusercontent.com/bobcat848/magnet2downloader/main/magnet-to-qbittorrent.user.js>

## 配置

点击脚本管理器菜单中的「下载器设置」，填写：

| 项目 | 说明 |
| --- | --- |
| 下载器类型 | `qBittorrent` 或 `自定义 HTTP API` |
| 服务器地址 | Web UI 地址，例如 `http://192.168.1.12:8080` |
| 用户名 / 密码 | qBittorrent Web UI 登录凭据 |
| 保存路径 | 可选，留空使用下载器默认路径 |
| HTTP 方法 / 请求体 | 仅自定义 API 使用，请求体中用 `{magnet}` 代表磁力链接 |

## 说明

- 脚本通过 `GM_xmlhttpRequest` 请求下载器，需要在脚本管理器中允许跨域访问。
- 默认服务器地址仅为示例，请改成你自己的地址。
- 若 qBittorrent 开启了「对本地主机以外的地址禁用 Host header 校验」等跨站保护，请按需调整。

## 文件

- `magnet-to-qbittorrent.user.js` — 用户脚本本体
