'use strict';
/* ZeroWrt firmware page.
 *
 * The page is static: it reads ota.json (the same file the LuCI plugin uses)
 * and history.json (kept for this page only) from its own directory.
 * Nothing here is generated at build time, so the page never goes stale.
 */
(function () {
	/* ------------------------------------------------------------ config */

	var CONFIG = {
		dist: 'ZeroWrt',
		repo: 'MinimaxFlora/ZeroWrt',
		// Shown when an index entry has no "label" field.
		labels: {
			'ruijie_rg-x60-new': 'Ruijie RG-X60'
		}
	};

	var I18N = {
		zh: {
			'html.lang': 'zh-CN',
			skip: '跳到下载',
			'nav.download': '下载',
			'nav.ota': '在线升级',
			'nav.changelog': '更新日志',
			'nav.faq': '常见问题',
			'hero.eyebrow': '基于 LEDE 的定制固件',
			'hero.title': 'ZeroWrt 固件',
			'hero.titleAccent': '在线升级',
			'hero.sub': '按设备下载最新构建，或直接在 LuCI 里一键升级。每个镜像都提供 SHA256 校验值与完整更新日志。',
			'hero.cta': '下载最新固件',
			'hero.ctaSecondary': '如何在线升级',
			'meta.latest': '最新构建',
			'meta.built': '构建时间',
			'meta.devices': '个设备',
			'meta.updated': '数据更新',
			'meta.none': '暂无构建',
			'download.title': '下载',
			'download.sub': '每台设备的固件是独立构建的，请选择与你的机器一致的一项。',
			'download.releases': '在 GitHub 查看全部版本',
			'download.empty': '还没有发布任何固件构建。',
			'download.emptyHint': '第一次构建完成后，这里会自动出现对应设备的下载项。',
			'card.download': '下载',
			'card.size': '大小',
			'card.build': '构建时间',
			'card.version': '版本',
			'card.sha': 'SHA256',
			'card.target': '目标平台',
			'card.latest': '最新',
			'card.copy': '复制',
			'card.copied': '已复制',
			'variant.router': '路由器',
			'variant.bios': '传统 BIOS',
			'variant.efi': 'UEFI',
			'ota.title': '通过 OTA 升级（推荐）',
			'ota.sub': '固件内置 luci-app-ota：在 LuCI 的「系统 → 在线升级」里检查、下载并安装，无需电脑。',
			'ota.step1.title': '确认更新源',
			'ota.step1.body': '插件默认已指向本页的索引地址，一般无需修改。若你手动装过插件，可以在「在线升级 → 配置」里填写：',
			'ota.step2.title': '检查更新',
			'ota.step2.body': '打开「系统 → 在线升级」，点击「检查更新」，会显示新版本的构建时间与更新日志。',
			'ota.step3.title': '下载并安装',
			'ota.step3.body': '下载会在后台进行，完成后自动校验 SHA256 并预检镜像是否属于本机，然后调用 sysupgrade 写入。默认保留当前配置。',
			'ota.note': '升级过程中设备会重启，耗时几分钟，请不要断电。安装后配置文件保持不变，管理地址与 WiFi 也不变。',
			'changelog.title': '更新日志',
			'changelog.sub': '每次构建都会记录在案。',
			'changelog.count': '共 %s 条发布记录',
			'changelog.all': '全部设备',
			'changelog.latest': '最新',
			'changelog.empty': '还没有更新日志。',
			'changelog.download': '下载',
			'changelog.release': 'GitHub',
			'faq.title': '常见问题',
			'faq.q1': '怎么知道该下载哪个镜像？',
			'faq.a1': '以路由器为例，型号是 Ruijie RG-X60 就选对应那张卡片；x86 设备分传统 BIOS 与 UEFI 两种，机器以 UEFI 启动就选 UEFI 镜像，否则选 BIOS 镜像。选错会导致无法启动。',
			'faq.q2': 'OTA 和手动刷机有什么区别？',
			'faq.a2': 'OTA 只替换系统分区并保留配置，速度更快、更不容易出错；手动刷机适合首次安装或系统已经无法启动的情况。',
			'faq.q3': '为什么要提供 SHA256？',
			'faq.a3': '插件在下载完成后会强制校验 SHA256，值不匹配就丢弃镜像。你也可以手动核对：下载后计算文件哈希，与本页显示的值比较。',
			'faq.q4': '更新日志里的版本号是什么？',
			'faq.a4': 'ZeroWrt 用构建日期作为版本号（例如 20261020 表示 2026-10-20 的构建），排序与比较都以镜像内的构建时间戳为准。',
			'faq.q5': '页面多久更新一次？',
			'faq.a5': '每次构建发布后自动更新一次，数据直接来自固件仓库的发布流程，无需人工维护。',
			'footer.note': '本页随每次构建自动更新',
			'footer.releases': '发布页',
			'footer.updated': '数据更新时间：%s',
			'noscript.text': '本页需要 JavaScript 才能列出固件。你也可以直接查看索引文件或 GitHub 发布页。',
			'error.load': '读取固件索引失败：%s'
		},
		en: {
			'html.lang': 'en',
			skip: 'Skip to downloads',
			'nav.download': 'Download',
			'nav.ota': 'OTA',
			'nav.changelog': 'Changelog',
			'nav.faq': 'FAQ',
			'hero.eyebrow': 'Custom firmware based on LEDE',
			'hero.title': 'ZeroWrt firmware',
			'hero.titleAccent': 'upgrade online',
			'hero.sub': 'Download the latest build for your device, or upgrade straight from LuCI. Every image ships with a SHA256 checksum and a full changelog.',
			'hero.cta': 'Download latest firmware',
			'hero.ctaSecondary': 'How OTA works',
			'meta.latest': 'Latest build',
			'meta.built': 'Built',
			'meta.devices': 'devices',
			'meta.updated': 'Index updated',
			'meta.none': 'No builds yet',
			'download.title': 'Download',
			'download.sub': 'Each device is built separately. Pick the entry that matches your hardware.',
			'download.releases': 'All releases on GitHub',
			'download.empty': 'No firmware build has been published yet.',
			'download.emptyHint': 'The first successful build will show up here automatically.',
			'card.download': 'Download',
			'card.size': 'Size',
			'card.build': 'Built',
			'card.version': 'Version',
			'card.sha': 'SHA256',
			'card.target': 'Target',
			'card.latest': 'Latest',
			'card.copy': 'Copy',
			'card.copied': 'Copied',
			'variant.router': 'Router',
			'variant.bios': 'Legacy BIOS',
			'variant.efi': 'UEFI',
			'ota.title': 'Upgrade over OTA (recommended)',
			'ota.sub': 'The firmware ships with luci-app-ota: check, download and install from System → OTA Firmware Update, no computer needed.',
			'ota.step1.title': 'Point it at this index',
			'ota.step1.body': 'The plugin already uses the index on this page. If you installed it manually, set it under OTA Firmware Update → Configuration:',
			'ota.step2.title': 'Check for updates',
			'ota.step2.body': 'Open System → OTA Firmware Update and press "Check for updates". The build time and changelog are shown.',
			'ota.step3.title': 'Download and install',
			'ota.step3.body': 'The download runs in the background, verifies SHA256, checks the image against this device and then calls sysupgrade. Your settings are kept by default.',
			'ota.note': 'The device reboots during the upgrade and takes a few minutes. Do not power it off. Settings, management IP and WiFi stay untouched.',
			'changelog.title': 'Changelog',
			'changelog.sub': 'Every build is recorded here.',
			'changelog.count': '%s releases',
			'changelog.all': 'All devices',
			'changelog.latest': 'latest',
			'changelog.empty': 'No changelog yet.',
			'changelog.download': 'Download',
			'changelog.release': 'GitHub',
			'faq.title': 'FAQ',
			'faq.q1': 'Which image should I pick?',
			'faq.a1': 'For routers, pick the card matching your model. x86 devices come in two flavours: choose the UEFI image when the machine boots via UEFI, otherwise the legacy BIOS image. Picking the wrong one leaves the device unbootable.',
			'faq.q2': 'How is OTA different from flashing manually?',
			'faq.a2': 'OTA only replaces the system partition and keeps your configuration, which is faster and less error prone. Manual flashing is for first installs or a system that no longer boots.',
			'faq.q3': 'Why publish a SHA256?',
			'faq.a3': 'The plugin refuses an image whose checksum does not match. You can verify by hand as well: hash the downloaded file and compare it with the value on this page.',
			'faq.q4': 'What is the version number?',
			'faq.a4': 'ZeroWrt uses the build date as its version (20261020 means a build from 2026-10-20). Ordering and comparisons use the build timestamp inside the image.',
			'faq.q5': 'How often is this page updated?',
			'faq.a5': 'After every published build, straight from the firmware pipeline. Nothing here is maintained by hand.',
			'footer.note': 'This page updates itself on every build',
			'footer.releases': 'Releases',
			'footer.updated': 'Data updated %s',
			'noscript.text': 'This page needs JavaScript to list the firmware. You can also open the index file or the GitHub releases.',
			'error.load': 'Could not read the firmware index: %s'
		}
	};

	/* ------------------------------------------------------------ helpers */

	var state = {
		lang: 'zh',
		theme: 'auto',
		index: null,
		history: null,
		filter: 'all'
	};

	function $(id) {
		return document.getElementById(id);
	}

	function t(key) {
		var table = I18N[state.lang] || I18N.zh;
		return (key in table) ? table[key] : (key in I18N.zh ? I18N.zh[key] : key);
	}

	function tf(key, value) {
		return t(key).replace('%s', value);
	}

	function str(value) {
		return (value == null) ? '' : String(value);
	}

	function num(value) {
		var n = parseInt(value, 10);
		return isFinite(n) ? n : 0;
	}

	function el(tag, attrs, children) {
		var node = document.createElement(tag);
		if (attrs) {
			Object.keys(attrs).forEach(function (key) {
				var value = attrs[key];
				if (value == null || value === false)
					return;
				if (key === 'class')
					node.className = value;
				else if (key === 'html')
					node.innerHTML = value;
				else if (key === 'text')
					node.textContent = value;
				else
					node.setAttribute(key, value);
			});
		}
		if (children) {
			(Array.isArray(children) ? children : [children]).forEach(function (child) {
				if (child == null || child === '')
					return;
				node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
			});
		}
		return node;
	}

	function fmtBytes(bytes) {
		if (!bytes || bytes < 0)
			return '—';
		var units = [ 'B', 'KiB', 'MiB', 'GiB' ];
		var value = bytes;
		var unit = 0;
		while (value >= 1024 && unit < units.length - 1) {
			value /= 1024;
			unit++;
		}
		return (unit === 0 ? String(Math.round(value)) : value.toFixed(1)) + ' ' + units[unit];
	}

	function fmtDate(epoch) {
		if (!epoch)
			return '—';
		var d = new Date(epoch * 1000);
		if (isNaN(d.getTime()))
			return '—';
		var pad = function (n) { return (n < 10 ? '0' : '') + n; };
		return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
			' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
	}

	function fileNameOf(url) {
		var clean = str(url).split('?')[0].split('#')[0];
		var parts = clean.split('/');
		return parts[parts.length - 1] || '';
	}

	function variantFromKey(key) {
		if (key.slice(-4) === '+efi') return 'efi';
		if (key.slice(-5) === '+bios') return 'bios';
		return '';
	}

	function deviceFromKey(key) {
		return key.replace(/\+(efi|bios)$/, '');
	}

	function variantLabel(variant) {
		if (variant === 'efi') return t('variant.efi');
		if (variant === 'bios') return t('variant.bios');
		return t('variant.router');
	}

	function deviceLabel(entry) {
		if (entry.label)
			return entry.label;
		if (CONFIG.labels[entry.device])
			return CONFIG.labels[entry.device];
		if (/x86/i.test(entry.device) || /x86/i.test(entry.target))
			return 'x86_64';
		return entry.device || '—';
	}

	function escapeHtml(value) {
		return str(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')
			.replace(/>/g, '&gt;').replace(/"/g, '&quot;');
	}

	function inlineMd(text) {
		return text
			.replace(/`([^`]+)`/g, '<code>$1</code>')
			.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
			.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
			.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
				'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
	}

	/* Small markdown subset. Everything is escaped before formatting, so the
	 * result is safe to assign to innerHTML. */
	function renderMarkdown(source) {
		if (!source)
			return '';

		var lines = str(source).replace(/\r\n/g, '\n').split('\n');
		var html = '';
		var inCode = false;
		var list = null;

		function closeList() {
			if (list) {
				html += '</' + list + '>';
				list = null;
			}
		}

		lines.forEach(function (raw) {
			var line = raw.trim();

			if (line.indexOf('```') === 0) {
				if (inCode) {
					html += '</code></pre>';
					inCode = false;
				} else {
					closeList();
					html += '<pre><code>';
					inCode = true;
				}
				return;
			}

			if (inCode) {
				html += escapeHtml(raw) + '\n';
				return;
			}

			if (!line) {
				closeList();
				return;
			}

			var match;
			if ((match = line.match(/^(#{1,6})\s+(.*)$/))) {
				closeList();
				var level = Math.min(match[1].length + 2, 6);
				html += '<h' + level + '>' + inlineMd(escapeHtml(match[2])) + '</h' + level + '>';
			} else if ((match = line.match(/^\s*[-*+]\s+(.*)$/))) {
				if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; }
				html += '<li>' + inlineMd(escapeHtml(match[1])) + '</li>';
			} else if ((match = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
				if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; }
				html += '<li>' + inlineMd(escapeHtml(match[1])) + '</li>';
			} else if ((match = line.match(/^>\s?(.*)$/))) {
				closeList();
				html += '<blockquote>' + inlineMd(escapeHtml(match[1])) + '</blockquote>';
			} else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
				closeList();
				html += '<hr />';
			} else {
				closeList();
				html += '<p>' + inlineMd(escapeHtml(line)) + '</p>';
			}
		});

		if (inCode)
			html += '</code></pre>';

		closeList();

		return html;
	}

	/* --------------------------------------------------------------- data */

	function getJSON(path) {
		if (typeof fetch !== 'function')
			return Promise.resolve(null);

		return fetch(path, { cache: 'no-cache' }).then(function (response) {
			if (!response.ok)
				return null;
			return response.json().catch(function () { return null; });
		}).catch(function () {
			return null;
		});
	}

	function normalizeEntry(raw, key) {
		if (!raw || typeof raw !== 'object')
			return null;
		if (!raw.url)
			return null;

		var variant = str(raw.variant) || variantFromKey(key);

		return {
			key: key,
			device: str(raw.device) || deviceFromKey(key),
			variant: variant,
			label: str(raw.label),
			version: str(raw.version),
			buildDate: num(raw.build_date),
			size: num(raw.size),
			sha256: str(raw.sha256 || raw.sha256sum),
			url: str(raw.url),
			file: str(raw.file || raw.filename) || fileNameOf(raw.url),
			target: str(raw.target),
			changelog: str(raw.changelog || raw.logs)
		};
	}

	function normalizeIndex(raw) {
		var out = { devices: [], generated: 0, dist: CONFIG.dist };

		if (!raw || typeof raw !== 'object')
			return out;

		var source = (raw.devices && typeof raw.devices === 'object') ? raw.devices : raw;
		var seen = {};

		out.generated = num(raw.generated);
		out.dist = str(raw.dist) || CONFIG.dist;

		Object.keys(source).forEach(function (key) {
			var value = source[key];

			if (Array.isArray(value)) {
				value = value.slice().sort(function (a, b) {
					return num(b && b.build_date) - num(a && a.build_date);
				})[0];
			}

			var entry = normalizeEntry(value, key);
			if (!entry)
				return;

			// The index repeats the same image under several device aliases.
			var fingerprint = [ entry.device, entry.variant, entry.sha256 || entry.url ].join('|');
			if (seen[fingerprint])
				return;

			seen[fingerprint] = true;
			out.devices.push(entry);
		});

		out.devices.sort(function (a, b) {
			if (b.buildDate !== a.buildDate)
				return b.buildDate - a.buildDate;
			return a.device.localeCompare(b.device) || a.variant.localeCompare(b.variant);
		});

		return out;
	}

	function normalizeHistory(raw) {
		var releases = [];

		if (raw && Array.isArray(raw.releases)) {
			raw.releases.forEach(function (item) {
				var entry = normalizeEntry(item, str(item && item.device));
				if (!entry)
					return;
				entry.key = entry.device;
				releases.push(entry);
			});
		}

		releases.sort(function (a, b) {
			return (b.buildDate - a.buildDate) || a.device.localeCompare(b.device);
		});

		return {
			generated: num(raw && raw.generated),
			releases: releases
		};
	}

	/* ------------------------------------------------------------- render */

	function applyI18n() {
		document.documentElement.lang = t('html.lang');

		document.querySelectorAll('[data-i18n]').forEach(function (node) {
			node.textContent = t(node.getAttribute('data-i18n'));
		});

		var toggle = $('lang-toggle');
		if (toggle)
			toggle.textContent = (state.lang === 'zh') ? 'EN' : '中文';

		var brand = $('brand-name');
		if (brand)
			brand.textContent = CONFIG.dist;

		var footerBrand = $('footer-brand');
		if (footerBrand)
			footerBrand.textContent = CONFIG.dist;

		var repoLink = $('repo-link');
		if (repoLink)
			repoLink.href = 'https://github.com/' + CONFIG.repo;

		var releases = $('link-releases');
		if (releases)
			releases.href = 'https://github.com/' + CONFIG.repo + '/releases';

		var indexUrl = otaJsonUrl();
		var otaCode = $('ota-json-url');
		if (otaCode)
			otaCode.textContent = indexUrl;

		if (state.index)
			renderHero();
		if (state.index)
			renderDevices();
		if (state.history)
			renderChangelog();
		renderFooter();
	}

	function otaJsonUrl() {
		var href = window.location.href.split('?')[0].split('#')[0];
		return href.replace(/[^/]*$/, '') + 'ota.json';
	}

	function uniqueDeviceCount(devices) {
		var seen = {};
		devices.forEach(function (device) { seen[device.device] = true; });
		return Object.keys(seen).length;
	}

	function renderHero() {
		var container = $('hero-meta');
		if (!container)
			return;

		container.textContent = '';

		var devices = state.index.devices;
		var newest = devices[0];

		if (!newest) {
			container.appendChild(el('span', { class: 'chip' }, [
				el('span', { class: 'dot' }),
				t('meta.none')
			]));
			return;
		}

		container.appendChild(el('span', { class: 'chip' }, [
			el('span', { class: 'dot' }),
			t('meta.latest') + ' ',
			el('b', { text: newest.version || fmtDate(newest.buildDate) })
		]));

		container.appendChild(el('span', { class: 'chip' }, [
			t('meta.built') + ' ',
			el('b', { text: fmtDate(newest.buildDate) })
		]));

		container.appendChild(el('span', { class: 'chip' }, [
			el('b', { text: String(uniqueDeviceCount(devices)) }),
			' ' + t('meta.devices')
		]));

		var updated = state.index.generated || (state.history && state.history.generated);
		if (updated) {
			container.appendChild(el('span', { class: 'chip' }, [
				t('meta.updated') + ' ',
				el('b', { text: fmtDate(updated) })
			]));
		}
	}

	function copyButton(text, labelNode) {
		var button = el('button', {
			class: 'copy-button',
			type: 'button',
			text: t('card.copy')
		});

		button.addEventListener('click', function () {
			var done = function () {
				button.textContent = t('card.copied');
				window.setTimeout(function () { button.textContent = t('card.copy'); }, 1600);
			};

			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(text).then(done).catch(function () {
					fallbackCopy(text, done);
				});
			} else {
				fallbackCopy(text, done);
			}
		});

		return button;
	}

	function fallbackCopy(text, done) {
		var area = el('textarea', { style: 'position:fixed;left:-9999px;top:0' });
		area.value = text;
		document.body.appendChild(area);
		area.select();
		try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
		document.body.removeChild(area);
	}

	function renderDevices() {
		var grid = $('device-grid');
		if (!grid)
			return;

		grid.textContent = '';

		var devices = state.index.devices;

		if (!devices.length) {
			grid.appendChild(el('div', { class: 'empty' }, [
				el('p', { text: t('download.empty') }),
				el('p', { class: 'card-key', text: t('download.emptyHint') })
			]));
			return;
		}

		var newestDate = devices[0].buildDate;

		devices.forEach(function (device) {
			var facts = el('dl', { class: 'card-facts' });

			if (device.version) {
				facts.appendChild(el('dt', { text: t('card.version') }));
				facts.appendChild(el('dd', { text: device.version }));
			}

			facts.appendChild(el('dt', { text: t('card.build') }));
			facts.appendChild(el('dd', { text: fmtDate(device.buildDate) }));

			facts.appendChild(el('dt', { text: t('card.size') }));
			facts.appendChild(el('dd', { text: fmtBytes(device.size) }));

			if (device.target) {
				facts.appendChild(el('dt', { text: t('card.target') }));
				facts.appendChild(el('dd', { class: 'mono', text: device.target }));
			}

			var head = el('div', { class: 'card-head' }, [
				el('div', {}, [
					el('h3', { class: 'card-title', text: deviceLabel(device) }),
					el('p', { class: 'card-key', text: device.device })
				]),
				el('div', { class: 'badges' }, [
					el('span', { class: 'badge', text: variantLabel(device.variant) }),
					device.buildDate === newestDate
						? el('span', { class: 'badge accent', text: t('card.latest') })
						: null
				])
			]);

			var shaRow = el('div', { class: 'sha-row' }, [
				el('span', { class: 'sha-text', text: device.sha256 || '—' })
			]);

			if (device.sha256)
				shaRow.appendChild(copyButton(device.sha256));

			var download = el('a', {
				class: 'button primary',
				href: device.url,
				target: '_blank',
				rel: 'noopener noreferrer',
				text: t('card.download')
			});

			var card = el('div', { class: 'card' }, [
				head,
				el('p', { class: 'card-file', text: device.file }),
				facts,
				el('div', {}, [
					el('p', { class: 'card-key', text: t('card.sha') }),
					shaRow
				]),
				el('div', { class: 'card-actions' }, [ download ])
			]);

			grid.appendChild(card);
		});
	}

	function renderChangelog() {
		var list = $('changelog-list');
		var filters = $('changelog-filters');
		var sub = $('changelog-sub');
		if (!list || !filters)
			return;

		var releases = state.history.releases.slice();

		if (sub && releases.length)
			sub.textContent = tf('changelog.count', String(releases.length));

		// Device chips, ordered by the newest release of each device.
		var devices = [];
		releases.forEach(function (release) {
			if (devices.indexOf(release.device) < 0)
				devices.push(release.device);
		});

		if (state.filter !== 'all' && devices.indexOf(state.filter) < 0)
			state.filter = 'all';

		filters.textContent = '';

		var makeFilter = function (value, label) {
			var button = el('button', {
				class: 'filter',
				type: 'button',
				text: label
			});
			button.setAttribute('aria-pressed', String(state.filter === value));
			button.addEventListener('click', function () {
				state.filter = value;
				renderChangelog();
			});
			return button;
		};

		filters.appendChild(makeFilter('all', t('changelog.all')));
		devices.forEach(function (device) {
			var entry = releases.filter(function (r) { return r.device === device; })[0];
			var name = deviceLabel(entry) + (entry.variant ? ' · ' + variantLabel(entry.variant) : '');
			filters.appendChild(makeFilter(device, name));
		});

		var visible = releases.filter(function (release) {
			return state.filter === 'all' || release.device === state.filter;
		});

		list.textContent = '';

		if (!visible.length) {
			list.appendChild(el('div', { class: 'empty' }, el('p', { text: t('changelog.empty') })));
			return;
		}

		var newest = releases[0];

		visible.forEach(function (release) {
			var isLatest = (release === newest) ||
				(release.buildDate === newest.buildDate && release.device === newest.device);

			var head = el('div', { class: 'release-head' }, [
				el('span', { class: 'release-version', text: release.version || fmtDate(release.buildDate) }),
				el('span', {
					class: 'release-meta',
					text: deviceLabel(release) + (release.variant ? ' · ' + variantLabel(release.variant) : '')
				}),
				el('span', { class: 'release-meta', text: fmtDate(release.buildDate) }),
				el('span', { class: 'release-meta', text: fmtBytes(release.size) })
			]);

			if (isLatest)
				head.appendChild(el('span', { class: 'badge accent', text: t('changelog.latest') }));

			var links = el('span', { class: 'release-links' }, [
				el('a', {
					href: release.url,
					target: '_blank',
					rel: 'noopener noreferrer',
					text: t('changelog.download')
				}),
				el('a', {
					href: 'https://github.com/' + CONFIG.repo + '/releases/tag/' + encodeURIComponent(release.tagged || release.device),
					target: '_blank',
					rel: 'noopener noreferrer',
					text: t('changelog.release')
				})
			]);

			head.appendChild(links);

			var body = el('div', { class: 'release-body' });
			body.innerHTML = renderMarkdown(release.changelog);

			list.appendChild(el('div', {
				class: isLatest ? 'release latest' : 'release'
			}, [ head, body ]));
		});
	}

	function renderFooter() {
		var node = $('footer-updated');
		if (!node)
			return;

		var updated = (state.index && state.index.generated) ||
			(state.history && state.history.generated) || 0;

		node.textContent = updated ? tf('footer.updated', fmtDate(updated)) : '';
	}

	function renderError(message) {
		var grid = $('device-grid');
		if (!grid)
			return;

		grid.textContent = '';
		grid.appendChild(el('div', { class: 'empty' }, el('p', { text: message })));
	}

	/* -------------------------------------------------------------- theme */

	function storedTheme() {
		try {
			var value = window.localStorage.getItem('zerowrt-theme');
			return (value === 'light' || value === 'dark' || value === 'auto') ? value : 'auto';
		} catch (e) {
			return 'auto';
		}
	}

	function applyTheme(theme) {
		state.theme = theme;
		document.documentElement.setAttribute('data-theme', theme);
		try { window.localStorage.setItem('zerowrt-theme', theme); } catch (e) { /* ignore */ }
	}

	function cycleTheme() {
		applyTheme(state.theme === 'auto' ? 'light' : (state.theme === 'light' ? 'dark' : 'auto'));
	}

	function storedLang() {
		// ?lang=en / ?lang=zh wins, so a link can force a language.
		var match = /[?&]lang=(zh|en)\b/.exec(window.location.search);
		if (match)
			return match[1];

		try {
			var value = window.localStorage.getItem('zerowrt-lang');
			if (value === 'zh' || value === 'en')
				return value;
		} catch (e) { /* ignore */ }

		var nav = (navigator.language || '').toLowerCase();
		return nav.indexOf('zh') === 0 ? 'zh' : 'en';
	}

	function applyLang(lang) {
		state.lang = lang;
		try { window.localStorage.setItem('zerowrt-lang', lang); } catch (e) { /* ignore */ }
		applyI18n();
	}

	/* --------------------------------------------------------------- init */

	function load() {
		return Promise.all([ getJSON('ota.json'), getJSON('history.json') ])
			.then(function (results) {
				state.index = normalizeIndex(results[0]);
				state.history = normalizeHistory(results[1]);

				if (!state.history.releases.length && state.index.devices.length) {
					state.history.releases = state.index.devices.map(function (device) {
						return Object.assign({}, device, { tagged: device.device });
					});
					state.history.generated = state.index.generated;
				}

				applyI18n();
			})
			.catch(function (error) {
				renderError(tf('error.load', error && error.message ? error.message : 'unknown error'));
			});
	}

	function init() {
		applyTheme(storedTheme());

		var themeToggle = $('theme-toggle');
		if (themeToggle)
			themeToggle.addEventListener('click', cycleTheme);

		var langToggle = $('lang-toggle');
		if (langToggle)
			langToggle.addEventListener('click', function () {
				applyLang(state.lang === 'zh' ? 'en' : 'zh');
			});

		state.lang = storedLang();
		applyI18n();
		load();
	}

	if (document.readyState === 'loading')
		document.addEventListener('DOMContentLoaded', init);
	else
		init();
})();
