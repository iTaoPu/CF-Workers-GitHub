# 🚂 CF-Workers-GitHub
![img](./img.png)
## 📝 简介
github release、archive以及项目文件的加速项目，支持clone，Cloudflare Workers & Pages 版本

> [!CAUTION]
> **Github.fxxk.dedyn.io 已被GFW污染，生产环境建议自行部署服务。**

> [!WARNING]
> 项目可能会触发**疑似钓鱼网站**警告或域名封禁，请通过环境变量 `URL` 赋值 **nginx** 或 `URL302` 设置302跳转域名进行伪装。

## 🚀 使用

直接在copy出来的url前加`https://github.fxxk.dedyn.io/`即可

也可以直接访问，在input输入

***大量使用请自行部署，以上域名仅为演示使用。***

访问私有仓库可以通过

`git clone https://user:TOKEN@github.fxxk.dedyn.io/https://github.com/xxxx/xxxx` [#71](https://github.com/hunshcn/gh-proxy/issues/71)

以下都是合法输入（仅示例，文件不存在）：

- 分支源码：https://github.com/hunshcn/project/archive/master.zip

- release源码：https://github.com/hunshcn/project/archive/v0.1.0.tar.gz

- release文件：https://github.com/hunshcn/project/releases/download/v0.1.0/example.zip

- 分支文件：https://github.com/hunshcn/project/blob/master/filename

- commit文件：https://github.com/hunshcn/project/blob/1111111111111111111111111111/filename

- gist：https://gist.githubusercontent.com/cielpy/351557e6e465c12986419ac5a4dd2568/raw/cmd.py

## 📄 Pages Github 部署

### 1️⃣ 部署 Cloudflare Pages：
   - 在 Github 上先 Fork 本项目，并点上 Star !!!
   - 在 Cloudflare Pages 控制台中选择 `连接到 Git`后，选中 `CF-Workers-GitHub`项目后点击 `开始设置`。
     
### 2️⃣ 给 Pages绑定 自定义域：
   - 在 Pages控制台的 `自定义域`选项卡，下方点击 `设置自定义域`。
   - 填入你的自定义次级域名，注意不要使用你的根域名，例如：
     您分配到的域名是 `fxxk.dedyn.io`，则添加自定义域填入 `github.fxxk.dedyn.io`即可；
   - 按照 Cloudflare 的要求将返回你的域名DNS服务商，添加 该自定义域 `github`的 CNAME记录 `CF-Workers-GitHub.pages.dev` 后，点击 `激活域`即可。

## 👷 Workers 部署方法
### ☁️ 部署 Cloudflare Worker：

   - 在 Cloudflare Worker 控制台中创建一个新的 Worker。
   - 将 [_worker.js](https://github.com/cmliu/CF-Workers-GitHub/blob/main/_worker.js)  的内容粘贴到 Worker 编辑器中。

## 🔧 变量说明
| 变量名 | 示例 | 必填 | 备注 |
|--|--|--|--|
| URL | `https://www.baidu.com/` |❌| 主页伪装(设为`nginx`则伪装为nginx默认页面) |
| URL302 | `https://t.me/CMLiussss` |❌| 主页302跳转 |

# 🙏 致谢
[gh-proxy](https://github.com/hunshcn/gh-proxy)、[jsproxy](https://github.com/EtherDream/jsproxy/)
