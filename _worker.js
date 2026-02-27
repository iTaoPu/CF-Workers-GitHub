'use strict'

let 屏蔽爬虫UA = ['netcraft'];

// 前缀，如果自定义路由为example.com/gh/*，将PREFIX改为 '/gh/'，注意，少一个杠都会错！
const PREFIX = '/' // 路由前缀
// 分支文件使用jsDelivr镜像的开关，0为关闭，默认开启以隐藏 raw 域名
const Config = {
	jsdelivr: 1 // 配置是否使用jsDelivr镜像（1为开启）
}

const whiteList = [] // 白名单，路径中包含白名单字符的请求才会通过，例如 ['/username/']

/** @type {ResponseInit} */
const PREFLIGHT_INIT = {
	status: 204,
	headers: new Headers({
		'access-control-allow-origin': '*',
		'access-control-allow-methods': 'GET,POST,PUT,PATCH,TRACE,DELETE,HEAD,OPTIONS',
		'access-control-max-age': '1728000',
	}),
}

const exp1 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:releases|archive)\/.*$/i
const exp2 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:blob|raw)\/.*$/i
const exp3 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/(?:info|git-).*$/i
const exp4 = /^(?:https?:\/\/)?raw\.(?:githubusercontent|github)\.com\/.+/i
const exp5 = /^(?:https?:\/\/)?gist\.(?:githubusercontent|github)\.com\/.+?\/.+?\/.+$/i
const exp6 = /^(?:https?:\/\/)?github\.com\/.+?\/.+?\/tags.*$/i

function makeRes(body, status = 200, headers = {}) {
	headers['access-control-allow-origin'] = '*'
	return new Response(body, { status, headers })
}

function newUrl(urlStr) {
	try {
		return new URL(urlStr)
	} catch (err) {
		return null
	}
}

function checkUrl(u) {
	for (let i of [exp1, exp2, exp3, exp4, exp5, exp6]) {
		if (u.search(i) === 0) return true
	}
	return false
}

function httpHandler(req, pathname) {
	const reqHdrRaw = req.headers
	if (req.method === 'OPTIONS' && reqHdrRaw.has('access-control-request-headers')) {
		return new Response(null, PREFLIGHT_INIT)
	}

	const reqHdrNew = new Headers(reqHdrRaw)
	let urlStr = pathname
	let flag = !whiteList.length
	for (let i of whiteList) {
		if (urlStr.includes(i)) {
			flag = true
			break
		}
	}
	if (!flag) return new Response("blocked", { status: 403 })

	if (urlStr.search(/^https?:\/\//) !== 0) {
		urlStr = 'https://' + urlStr
	}
	const urlObj = newUrl(urlStr)
	const reqInit = {
		method: req.method,
		headers: reqHdrNew,
		redirect: 'manual',
		body: req.body
	}
	return proxy(urlObj, reqInit)
}

async function proxy(urlObj, reqInit, redirectCount = 0) {
	const MAX_REDIRECTS = 10
	if (redirectCount > MAX_REDIRECTS) {
		return new Response('Too many redirects', { status: 508 })
	}

	let res
	try {
		res = await fetch(urlObj.href, reqInit)
	} catch (err) {
		return new Response(`Fetch failed: ${err.message}`, { status: 502 })
	}

	const resHdrOld = res.headers
	const resHdrNew = new Headers()

	// 只保留客户端可能需要的标准头，其余全部丢弃
	const allowedHeaders = [
		'content-type',
		'content-length',
		'content-disposition',
		'content-encoding',
		'content-range',
		'accept-ranges',
		'etag',
		'last-modified',
		'cache-control',
		'expires',
		'pragma',
		'set-cookie',
	]

	for (let [key, value] of resHdrOld.entries()) {
		const lowerKey = key.toLowerCase()
		if (allowedHeaders.includes(lowerKey) && lowerKey !== 'location') {
			resHdrNew.append(key, value)
		}
	}

	const status = res.status

	// 处理重定向
	if (resHdrOld.has('location')) {
		let _location = resHdrOld.get('location')
		if (checkUrl(_location)) {
			resHdrNew.set('location', PREFIX + _location)
		} else {
			reqInit.redirect = 'follow'
			return proxy(newUrl(_location), reqInit, redirectCount + 1)
		}
	}

	resHdrNew.set('access-control-expose-headers', '*')
	resHdrNew.set('access-control-allow-origin', '*')

	return new Response(res.body, {
		status,
		headers: resHdrNew,
	})
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url)
		const urlObj = new URL(request.url)

		if (env.UA) 屏蔽爬虫UA = 屏蔽爬虫UA.concat(await ADD(env.UA))
		const userAgentHeader = request.headers.get('User-Agent')
		const userAgent = userAgentHeader ? userAgentHeader.toLowerCase() : "null"
		if (屏蔽爬虫UA.some(fxxk => userAgent.includes(fxxk)) && 屏蔽爬虫UA.length > 0) {
			return new Response(await nginx(), {
				headers: { 'Content-Type': 'text/html; charset=UTF-8' }
			})
		}

		let path = urlObj.searchParams.get('q')
		if (path) {
			return Response.redirect('https://' + urlObj.host + PREFIX + path, 301)
		} else if (url.pathname.toLowerCase() == '/favicon.ico') {
			return Response.redirect('https://cdn.jsdmirror.com/gh/iTaoPu/CF-Workers-GitHub@main/jsdelivr.ico', 302)
		}

		path = urlObj.href.substr(urlObj.origin.length + PREFIX.length).replace(/^https?:\/+/, 'https://')

		// 优先处理 raw 和 blob 的 jsDelivr 重定向
		if (path.search(exp2) === 0) {
			if (Config.jsdelivr) {
				const newUrl = path.replace('/blob/', '@').replace(/^(?:https?:\/\/)?github\.com/, 'https://fastly.jsdelivr.net/gh')
				return Response.redirect(newUrl, 302)
			} else {
				path = path.replace('/blob/', '/raw/')
				return httpHandler(request, path)
			}
		} else if (path.search(exp4) === 0) {
			// 直接代理 raw 内容，不重定向到 jsDelivr
			return httpHandler(request, path)
		} else if (path.search(exp1) === 0 || path.search(exp5) === 0 || path.search(exp6) === 0 || path.search(exp3) === 0) {
			return httpHandler(request, path)
		} else {
			if (env.URL302) {
				return Response.redirect(env.URL302, 302)
			} else if (env.URL) {
				if (env.URL.toLowerCase() == 'nginx') {
					return new Response(await nginx(), {
						headers: { 'Content-Type': 'text/html; charset=UTF-8' }
					})
				} else {
					return fetch(new Request(env.URL, request))
				}
			} else {
				return new Response(await githubInterface(), {
					headers: { 'Content-Type': 'text/html; charset=UTF-8' }
				})
			}
		}
	}
}

async function githubInterface() {
	const html = `
		<!DOCTYPE html>
		<html lang="zh-CN">
		<head>
			<title>GitHub 文件加速</title>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<style>
				:root {
					--primary-color: #0d1117;
					--secondary-color: #161b22;
					--text-color: #f0f6fc;
					--accent-color: #58a6ff;
					--gradient-start: #24292e;
					--gradient-end: #0d1117;
					--shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
					--border-color: rgba(255, 255, 255, 0.1);
					--github-corner-bg: #f0f6fc;
					--github-corner-fg: rgb(21,26,31);
				}

				* { box-sizing: border-box; margin: 0; padding: 0; }

				body {
					font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
					min-height: 100vh;
					background: linear-gradient(135deg, var(--gradient-start) 0%, var(--gradient-end) 100%);
					color: var(--text-color);
					display: flex;
					justify-content: center;
					align-items: center;
					padding: 20px;
				}

				.container {
					width: 100%;
					max-width: 800px;
					padding: 40px 20px;
					text-align: center;
				}

				.title {
					font-size: 2.5rem;
					font-weight: 600;
					margin-bottom: 1.5rem;
					color: var(--text-color);
					font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Apple Color Emoji", "Segoe UI Emoji", sans-serif;
					letter-spacing: -0.5px;
				}

				.title .emoji {
					display: inline-block;
					color: #f1fa8c;
					margin-right: 8px;
				}

				.tips a {
					color: var(--accent-color);
					text-decoration: none;
					border-bottom: 1px dashed rgba(88, 166, 255, 0.5);
					transition: all 0.2s ease;
				}

				.tips a:hover {
					color: #a2d2ff;
					border-bottom-color: #a2d2ff;
				}

				.search-container {
					position: relative;
					max-width: 600px;
					margin: 2rem auto;
				}

				.search-input {
					width: 100%;
					height: 56px;
					padding: 0 60px 0 24px;
					font-size: 1rem;
					color: #1f2937;
					background: rgba(255, 255, 255, 0.95);
					border: 2px solid transparent;
					border-radius: 12px;
					box-shadow: var(--shadow);
					transition: all 0.3s ease;
				}

				.search-input:focus {
					border-color: var(--accent-color);
					background: white;
					outline: none;
					box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.3);
				}

				.search-button {
					position: absolute;
					right: 8px;
					top: 50%;
					transform: translateY(-50%);
					width: 44px;
					height: 44px;
					border: none;
					border-radius: 8px;
					background: var(--accent-color);
					color: white;
					cursor: pointer;
					transition: all 0.2s ease;
				}

				.search-button:hover {
					background: #4187d7;
					transform: translateY(-50%) scale(1.05);
				}

				.tips {
					margin-top: 2rem;
					color: rgba(240, 246, 252, 0.8);
					line-height: 1.6;
					text-align: left;
					padding-left: 1.8rem;
				}

				.example-title {
					color: var(--accent-color);
					margin-bottom: 1.5rem;
					font-size: 1.1rem;
					font-weight: 600;
					position: relative;
					padding-bottom: 0.8rem;
					border-bottom: 1px solid var(--border-color);
				}

				.example p {
					margin: 0.9rem 0;
					font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
					font-size: 0.95rem;
					color: rgba(240, 246, 252, 0.9);
					padding-left: 1.5rem;
					line-height: 1.4;
					word-wrap: break-word;
					word-break: break-all;
					overflow-wrap: break-word;
				}

				.example {
					margin-top: 2.5rem;
					padding: 1.8rem;
					background: rgba(255, 255, 255, 0.05);
					border-radius: 12px;
					text-align: left;
					border: 1px solid var(--border-color);
					box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
					overflow-x: auto;
				}

				.url-part { color: var(--accent-color); }

				.github-corner {
					position: fixed;
					top: 0;
					right: 0;
					z-index: 999;
				}

				.github-corner svg {
					fill: var(--github-corner-bg);
					color: var(--github-corner-fg);
					position: absolute;
					top: 0;
					border: 0;
					right: 0;
					width: 80px;
					height: 80px;
				}

				.github-corner a,
				.github-corner a:visited {
					color: var(--github-corner-fg) !important;
					text-decoration: none !important;
				}

				.github-corner .octo-body,
				.github-corner .octo-arm {
					fill: var(--github-corner-fg) !重要;
				}

				.github-corner:hover .octo-arm {
					animation: octocat-wave 560ms ease-in-out;
				}

				@keyframes octocat-wave {
					0%, 100% { transform: rotate(0); }
					20%, 60% { transform: rotate(-25deg); }
					40%, 80% { transform: rotate(10deg); }
				}

				@media (max-width: 640px) {
					.container { padding: 20px; }
					.title { font-size: 2rem; }
					.search-input { height: 50px; font-size: 0.9rem; }
					.search-button { width: 38px; height: 38px; }
					.example { padding: 1rem; }
					.example p { font-size: 0.85rem; padding-left: 0.8rem; margin: 0.7rem 0; }
					.example-title { font-size: 0.95rem; padding-bottom: 0.6rem; }
					.github-corner svg { width: 60px; height: 60px; }

					/* 移动端：按钮在输入框下方左侧，间距调整为1rem（与标题下边距一致） */
					.link-box {
						flex-direction: column !important;
						align-items: flex-start !important;
						gap: 1rem;
					}
					.link-box input {
						width: 100% !important;
						height: 44px !important;
						flex: none !important;
					}
					.copy-btn {
						height: 40px;
						padding: 0 16px;
						font-size: 0.85rem;
						align-self: flex-start !important;
						margin-left: 0 !important;
					}
					.copy-btn svg {
						width: 14px;
						height: 14px;
					}
				}

				.converted-link-container {
					margin-top: 2.5rem;
					padding: 1.5rem;
					background: rgba(255, 255, 255, 0.05);
					border-radius: 12px;
					border: 1px solid var(--border-color);
					text-align: left;
				}

				.converted-link-title {
					color: var(--accent-color);
					font-size: 1.1rem;
					font-weight: 600;
					margin-bottom: 1rem;
				}

				.link-box {
					display: flex;
					gap: 10px;
					align-items: center;
				}

				.link-box input {
					flex: 1;
					height: 44px;
					padding: 0 15px;
					background: rgba(255, 255, 255, 0.1);
					border: 1px solid var(--border-color);
					border-radius: 8px;
					color: var(--text-color);
					font-size: 0.9rem;
					font-family: monospace;
					cursor: default;
				}

				.link-box input:focus {
					outline: none;
					border-color: var(--accent-color);
				}

				.copy-btn {
					height: 44px;
					padding: 0 20px;
					background: linear-gradient(135deg, #f72585 0%, #7209b7 100%);
					border: none;
					border-radius: 8px;
					color: white;
					font-size: 0.9rem;
					font-weight: 500;
					cursor: pointer;
					transition: all 0.2s ease;
					display: flex;
					align-items: center;
					gap: 6px;
				}

				.copy-btn:hover {
					background: linear-gradient(135deg, #f8489a 0%, #8a1ccd 100%);
					transform: scale(1.02);
				}

				/* 确保图标和文字大小一致且水平排列 */
				.copy-btn svg {
					width: 16px;
					height: 16px;
					fill: currentColor;
				}

				/* 版权样式 - 增加上边距，使版权信息更靠下 */
				.copyright {
					text-align: center;
					margin-top: 4rem;
					margin-bottom: 1rem;
					color: rgba(240, 246, 252, 0.6);
					font-size: 0.9rem;
				}
			</style>
		</head>
		<body>
			<a target="_blank" class="github-corner" aria-label="View source on Github">
				<svg viewBox="0 0 250 250" aria-hidden="true">
					<path d="M0,0 L115,115 L130,115 L142,142 L250,250 L250,0 Z"></path>
					<path d="M128.3,109.0 C113.8,99.7 119.0,89.6 119.0,89.6 C122.0,82.7 120.5,78.6 120.5,78.6 C119.2,72.0 123.4,76.3 123.4,76.3 C127.3,80.9 125.5,87.3 125.5,87.3 C122.9,97.6 130.6,101.9 134.4,103.2" fill="currentColor" style="transform-origin: 130px 106px;" class="octo-arm"></path>
					<path d="M115.0,115.0 C114.9,115.1 118.7,116.5 119.8,115.4 L133.7,101.6 C136.9,99.2 139.9,98.4 142.2,98.6 C133.8,88.0 127.5,74.4 143.8,58.0 C148.5,53.4 154.0,51.2 159.7,51.0 C160.3,49.4 163.2,43.6 171.4,40.1 C171.4,40.1 176.1,42.5 178.8,56.2 C183.1,58.6 187.2,61.8 190.9,65.4 C194.5,69.0 197.7,73.2 200.1,77.6 C213.8,80.2 216.3,84.9 216.3,84.9 C212.7,93.1 206.9,96.0 205.4,96.6 C205.1,102.4 203.0,107.8 198.3,112.5 C181.9,128.9 168.3,122.5 157.7,114.1 C157.9,116.9 156.7,120.9 152.7,124.9 L141.0,136.5 C139.8,137.7 141.6,141.9 141.8,141.8 Z" fill="currentColor" class="octo-body"></path>
				</svg>
			</a>

			<div class="container">
				<h1 class="title"><span class="emoji">🚂</span>GitHub 文件加速 · 公益服务</h1>

				<form onsubmit="toSubmit(event)" class="search-container">
					<input 
						type="text" 
						class="search-input"
						id="github-url"
						name="q" 
						placeholder="请输入 GitHub 文件链接"
						required
					>
					<button type="submit" class="search-button">
						<svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
							<path d="M13 5l7 7-7 7M5 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>
						</svg>
					</button>
				</form>

				<div class="tips">
					<p>✨ 支持带协议头(https://)或者不带协议头的GitHub链接</p>
					<p>🚀 release、archive 使用 Cloudflare 加速，文件会跳转至 JsDelivr</p>
					<p>⚠️ 注意：暂不支持文件夹下载</p>
				</div>

				<div class="converted-link-container">
					<div class="converted-link-title">🔗 转换后的加速链接</div>
					<div class="link-box">
						<input type="text" id="converted-link" readonly placeholder="输入上方链接后自动生成">
						<button class="copy-btn" id="copy-btn" onclick="copyLink()">
							<svg viewBox="0 0 24 24">
								<path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
							</svg>
							复制链接
						</button>
					</div>
				</div>

				<!-- 版权信息 - 已增加上边距，视觉上更靠下 -->
				<div class="copyright">
					&copy; 2022-<span id="current-year"></span> 蜂巢·隱曜
				</div>
			</div>

			<script>
				const prefix = '${PREFIX}';
				const inputField = document.getElementById('github-url');
				const convertedInput = document.getElementById('converted-link');
				let copyTimer = null; // 复制按钮恢复定时器

				inputField.addEventListener('input', function() {
					let url = this.value.trim();
					if (url === '') {
						convertedInput.value = '';
						return;
					}
					if (!url.startsWith('http://') && !url.startsWith('https://')) {
						url = 'https://' + url;
					}
					const baseUrl = window.location.origin;
					const proxyUrl = baseUrl + prefix + url;
					convertedInput.value = proxyUrl;
				});

				function copyLink() {
					const copyBtn = document.getElementById('copy-btn');
					if (!convertedInput.value) return;

					convertedInput.select();
					convertedInput.setSelectionRange(0, 99999);
					navigator.clipboard.writeText(convertedInput.value).then(() => {
						// 清除之前的定时器
						if (copyTimer) clearTimeout(copyTimer);

						// 保存原始内容（仅第一次）
						if (!copyBtn.hasAttribute('data-original')) {
							copyBtn.setAttribute('data-original', copyBtn.innerHTML);
						}
						// 改为绿色渐变背景
						copyBtn.style.background = 'linear-gradient(135deg, #00b894 0%, #00a085 100%)';
						// 保留图标，文字改为“已复制!”
						const originalSvg = copyBtn.querySelector('svg').outerHTML;
						copyBtn.innerHTML = originalSvg + ' 已复制✨';

						// 设置定时器恢复原状（2秒后）
						copyTimer = setTimeout(() => {
							copyBtn.style.background = ''; // 清除内联样式，恢复CSS默认
							copyBtn.innerHTML = copyBtn.getAttribute('data-original');
							copyTimer = null;
						}, 2000);
					}).catch(err => {
						alert('复制失败，请手动复制');
					});
				}

				function toSubmit(e) {
					e.preventDefault();
					const input = document.getElementsByName('q')[0];
					const baseUrl = location.href.substr(0, location.href.lastIndexOf('/') + 1);
					window.open(baseUrl + input.value);
				}

				// 更新版权年份
				document.getElementById('current-year').textContent = new Date().getFullYear();
			</script>
		</body>
		</html>
	`
	return html
}

async function ADD(envadd) {
	return envadd.split(',').map(s => s.trim()).filter(s => s.length > 0)
}

async function nginx() {
	return `<!DOCTYPE html>
	<html>
	<head>
	<title>Welcome to nginx!</title>
	<style>
		body { width: 35em; margin: 0 auto; font-family: Tahoma, Verdana, Arial, sans-serif; }
	</style>
	</head>
	<body>
	<h1>Welcome to nginx!</h1>
	<p>If you see this page, the nginx web server is successfully installed and
	working. Further configuration is required.</p>
	<p>For online documentation and support please refer to
	<a href="http://nginx.org/">nginx.org</a>.<br/>
	Commercial support is available at
	<a href="http://nginx.com/">nginx.com</a>.</p>
	<p><em>Thank you for using nginx.</em></p>
	</body>
	</html>`
}
