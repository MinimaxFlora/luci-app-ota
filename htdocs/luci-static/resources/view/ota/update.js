'use strict';
'require view';
'require ui';
'require rpc';

const callInfo = rpc.declare({
	object: 'luci.ota',
	method: 'info',
	expect: { '': {} }
});

const callCheck = rpc.declare({
	object: 'luci.ota',
	method: 'check',
	expect: { '': {} }
});

const callStatus = rpc.declare({
	object: 'luci.ota',
	method: 'status',
	expect: { '': {} }
});

const callDownload = rpc.declare({
	object: 'luci.ota',
	method: 'download',
	expect: { '': {} }
});

const callCancel = rpc.declare({
	object: 'luci.ota',
	method: 'cancel',
	expect: { '': {} }
});

const callApply = rpc.declare({
	object: 'luci.ota',
	method: 'apply',
	params: [ 'keep' ],
	expect: { '': {} }
});

/* ------------------------------------------------------------------ */
/* formatting helpers                                                  */
/* ------------------------------------------------------------------ */

function str(value) {
	return (value == null) ? '' : String(value);
}

function fmtDate(ts) {
	if (!ts)
		return '—';

	try {
		return new Date(ts * 1000).toLocaleString();
	}
	catch (e) {
		return String(ts);
	}
}

function fmtBytes(bytes) {
	if (!bytes || bytes < 0)
		return '0 B';

	const units = [ 'B', 'KiB', 'MiB', 'GiB' ];
	let value = bytes;
	let unit = 0;

	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}

	return (unit === 0 ? String(Math.round(value)) : value.toFixed(1)) + ' ' + units[unit];
}

function fmtDuration(seconds) {
	if (!isFinite(seconds) || seconds <= 0)
		return '—';

	const total = Math.round(seconds);
	const hours = Math.floor(total / 3600);
	const minutes = Math.floor((total % 3600) / 60);
	const secs = total % 60;

	if (hours > 0)
		return hours + ':' + String(minutes).padStart(2, '0') + ':' + String(secs).padStart(2, '0');

	return minutes + ':' + String(secs).padStart(2, '0');
}

function dateFromVersion(version) {
	var match = /^(\d{4})(\d{2})(\d{2})$/.exec(str(version));

	if (match)
		return match[1] + '-' + match[2] + '-' + match[3];

	return null;
}

/* Build date cell. Some firmwares (LEDE style trees that leave
 * OPENWRT_BUILD_DATE as "%B") do not record a timestamp; in that case we say
 * so instead of showing a misleading dash, and fall back to a date encoded in
 * the version string when there is one. */
function buildDateCell(entry) {
	if (entry && entry.build_date > 0)
		return fmtDate(entry.build_date);

	var derived = dateFromVersion(entry && entry.version);

	if (derived) {
		return E('span', {}, [
			derived,
			' ',
			E('span', {
				'class': 'ota-hint',
				'title': _('This firmware does not record a build timestamp, the date is derived from the version string.')
			}, _('(from version)'))
		]);
	}

	return E('span', { 'class': 'ota-hint' }, _('not recorded'));
}

function escapeHtml(text) {
	return String(text).replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function inlineMarkdown(text) {
	return text
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
		.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
			'<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

/* Small markdown subset renderer. All input is HTML escaped before any
 * formatting is applied, links are restricted to http(s), so the result is
 * safe to assign to innerHTML. */
function renderMarkdown(text) {
	if (!text)
		return '';

	const lines = String(text).replace(/\r\n/g, '\n').split('\n');
	let html = '';
	let inCode = false;
	let list = null;

	const closeList = () => {
		if (list) {
			html += '</' + list + '>';
			list = null;
		}
	};

	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i];
		const line = raw.trim();

		if (line.startsWith('```')) {
			if (inCode) {
				html += '</code></pre>';
				inCode = false;
			}
			else {
				closeList();
				html += '<pre><code>';
				inCode = true;
			}
			continue;
		}

		if (inCode) {
			html += escapeHtml(raw) + '\n';
			continue;
		}

		if (line === '') {
			closeList();
			continue;
		}

		let match;

		if ((match = line.match(/^(#{1,6})\s+(.*)$/))) {
			closeList();
			const level = Math.min(match[1].length + 2, 6);
			html += '<h' + level + '>' + inlineMarkdown(escapeHtml(match[2])) + '</h' + level + '>';
		}
		else if ((match = line.match(/^\s*[-*+]\s+(.*)$/))) {
			if (list !== 'ul') {
				closeList();
				html += '<ul>';
				list = 'ul';
			}
			html += '<li>' + inlineMarkdown(escapeHtml(match[1])) + '</li>';
		}
		else if ((match = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
			if (list !== 'ol') {
				closeList();
				html += '<ol>';
				list = 'ol';
			}
			html += '<li>' + inlineMarkdown(escapeHtml(match[1])) + '</li>';
		}
		else if ((match = line.match(/^>\s?(.*)$/))) {
			closeList();
			html += '<blockquote>' + inlineMarkdown(escapeHtml(match[1])) + '</blockquote>';
		}
		else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
			closeList();
			html += '<hr />';
		}
		else {
			closeList();
			html += '<p>' + inlineMarkdown(escapeHtml(line)) + '</p>';
		}
	}

	if (inCode)
		html += '</code></pre>';

	closeList();

	return html;
}

function setChildren(node, children) {
	while (node.firstChild)
		node.removeChild(node.firstChild);

	const list = Array.isArray(children) ? children : [ children ];

	for (let i = 0; i < list.length; i++) {
		const child = list[i];

		if (child == null || child === '')
			continue;

		node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
	}

	return node;
}

function configUrl() {
	if (typeof L.url === 'function')
		return L.url('admin/system/ota/configuration');

	const base = (L.env && L.env.scriptname) ? L.env.scriptname : '/cgi-bin/luci';

	return base + '/admin/system/ota/configuration';
}

function settingsLink() {
	return E('a', {
		'href': configUrl()
	}, _('Open the configuration page'));
}

/* ------------------------------------------------------------------ */
/* error rendering                                                     */
/* ------------------------------------------------------------------ */

function errorText(res) {
	const map = {
		no_api: _('No update index URL is configured yet.'),
		insecure_url: _('The update index URL must use HTTPS. Enable "Allow insecure connections" in the configuration to allow plain HTTP.'),
		network: _('Could not download the update index. Please check the network connection.'),
		no_downloader: _('Neither curl nor uclient-fetch is installed on this device.'),
		bad_json: _('The update index is not valid JSON.'),
		no_device: _('The update index does not contain a firmware image for this device.'),
		unknown_version: _('Cannot tell whether a newer firmware is available: the index entry has neither a build date nor a version.'),
		not_checked: _('Please check for updates first.'),
		no_sha256: _('The index entry has no SHA256 checksum. The download was blocked for safety reasons.'),
		no_space: _('Not enough free space in /tmp to download this firmware.'),
		not_downloaded: _('The firmware is not completely downloaded yet.'),
		no_sysupgrade: _('/sbin/sysupgrade is not available on this system.'),
		checksum: _('The downloaded image failed the SHA256 verification and was discarded.'),
		image_invalid: _('sysupgrade rejected the downloaded image (wrong device or broken file).'),
		download: _('The download failed.'),
		move: _('The downloaded image could not be moved into place.'),
		exec: _('The OTA backend could not be executed.'),
		unknown: _('Unknown error.')
	};

	let text = map[res && res.code];

	if (!text) {
		text = (res && res.msg) ? String(res.msg) : _('Unknown error.');
	}

	if (res && res.msg && map[res.code]) {
		const detail = String(res.msg);

		if (detail && detail !== text)
			text += ' ' + detail.substr(0, 300);
	}

	if (res && res.code === 'no_device') {
		if (Array.isArray(res.keys) && res.keys.length)
			text += ' ' + _('Looked up key(s): %s').format(res.keys.join(', '));

		if (Array.isArray(res.available) && res.available.length)
			text += ' ' + _('Keys in the index: %s').format(res.available.join(', '));
	}

	return text;
}

function addError(res) {
	ui.addNotification(null, E('p', {}, errorText(res)), 'danger');
}

/* ------------------------------------------------------------------ */
/* view                                                               */
/* ------------------------------------------------------------------ */

/* A firmware flash kills the web server that served this page. Remember that
 * one was started, so the overlay survives a reload or a browser that lost the
 * Wi-Fi link and does not leave the user staring at a stale update page. */
var FLASH_KEY = 'ota-flash-started';
var FLASH_MAX_MS = 15 * 60 * 1000;

function flashStartedAt() {
	try {
		var raw = window.sessionStorage.getItem(FLASH_KEY);
		var when = raw ? parseInt(raw, 10) : 0;

		if (when > 0 && (Date.now() - when) < FLASH_MAX_MS)
			return when;
	}
	catch (e) { }

	return 0;
}

function clearFlashMark() {
	try {
		window.sessionStorage.removeItem(FLASH_KEY);
	}
	catch (e) { }
}

return view.extend({
	info: null,
	check: null,
	status: { state: 'idle' },
	body: null,
	progressRefs: null,
	timer: null,
	speed: 0,
	lastSample: null,
	busy: false,

	load: function() {
		// rpcd is restarted by a settings save and is briefly unavailable right
		// after a reboot, so a single failed call used to leave the page with
		// "the OTA backend did not respond" until the user reloaded by hand.
		const attempt = (left) => callInfo().catch(() => {
			if (left <= 1)
				return null;

			return new Promise((resolve) => window.setTimeout(resolve, 1200))
				.then(() => attempt(left - 1));
		});

		return attempt(4);
	},

	render: function(info) {
		if (info && info.ok) {
			this.info = info;
			this.check = info.check || null;
			this.status = info.status || { state: 'idle' };
		}

		this.body = E('div', { 'id': 'ota-body' });

		const container = E('div', {}, [
			E('h2', {}, _('OTA Firmware Update')),
			E('p', {}, _('Check for new firmware, download it and install it with sysupgrade.')),
			this.renderStyle(),
			this.renderLocalSection(),
			this.body
		]);

		// Other LuCI pages show a refresh chip in the header while they poll;
		// this page loads its data once, so put the same chip there manually.
		const indicators = document.querySelector('#indicators');

		if (indicators && !indicators.querySelector('[data-ota-refresh]')) {
			const chip = E('span', {
				'data-indicator': 'poll-status',
				'data-clickable': 'true',
				'data-style': 'active',
				'data-ota-refresh': '1',
				'title': _('Refresh')
			}, _('Refresh'));

			chip.addEventListener('click', () => window.location.reload());
			indicators.appendChild(chip);
		}

		if (!this.info) {
			this.body.appendChild(E('div', { 'class': 'cbi-section' }, [
				E('p', {}, _('The OTA backend did not respond.')),
				E('button', {
					'class': 'cbi-button cbi-button-action',
					'click': ui.createHandlerFn(this, 'handleReload')
				}, _('Retry'))
			]));

			return container;
		}

		this.renderState();

		const config = this.info.config;
		const stale = !this.check || !this.check.checked_at ||
			((Date.now() / 1000) - this.check.checked_at > 600);

		if (this.status.state === 'downloading') {
			this.startPolling();
		}
		else if (config.auto_check == 1 && this.status.state === 'idle' && stale) {
			window.setTimeout(() => this.handleCheck(null, true), 100);
		}

		this.resumeFlashing();

		return container;
	},

	/* The flash started in an earlier page load: keep showing the overlay and
	 * go straight to "wait for the device", instead of pretending nothing is
	 * happening while the router reboots. */
	resumeFlashing: function() {
		var startedAt = flashStartedAt();

		if (!startedAt || this.flashNode)
			return;

		this.unloadGuard = (e) => {
			e.preventDefault();
			e.returnValue = _('The firmware is being written, please do not leave this page.');
			return e.returnValue;
		};

		window.addEventListener('beforeunload', this.unloadGuard);
		this.showFlashing(startedAt, true);
	},

	renderStyle: function() {
		return E('style', {}, [
			'.ota-table { width: 100%; border-collapse: collapse; }',
			'.ota-table td { padding: .4em .5em; vertical-align: top; }',
			'.ota-table td.ota-key { width: 34%; color: #666; white-space: nowrap; }',
			'.ota-hint { color: #8a8a8a; font-size: 92%; }',
			'.ota-changelog { border: 1px solid rgba(128,128,128,.35); border-radius: 6px; padding: .25em 1em; margin: .5em 0; max-height: 26em; overflow-y: auto; }',
			'.ota-changelog h3, .ota-changelog h4, .ota-changelog h5 { margin: .8em 0 .3em; }',
			'.ota-changelog p { margin: .35em 0; }',
			'.ota-changelog ul { margin: .35em 0; padding-left: 1.6em; }',
			'.ota-changelog ol { margin: .35em 0; padding-left: 1.8em; }',
			'.ota-changelog ul > li { list-style: disc outside; margin: .2em 0; }',
			'.ota-changelog ol > li { list-style: decimal outside; margin: .2em 0; }',
			'.ota-changelog pre { overflow-x: auto; padding: .5em; background: rgba(128,128,128,.12); border-radius: 6px; }',
			'.ota-changelog code { background: rgba(128,128,128,.15); padding: 0 .2em; border-radius: 3px; }',
			'.ota-changelog blockquote { border-left: 3px solid rgba(128,128,128,.4); margin: .5em 0; padding-left: .75em; color: #666; }',
			'.ota-checking { margin: .5em 0 .9em 20px; padding: 0; }',
			'.ota-ok { color: #2e7d32; }',
			'.ota-warn { color: #ef6c00; }',
			'.ota-mono { font-family: monospace; word-break: break-all; }',
			/* bottom padding, not margin: a margin on the last child collapses
			 * out of the section and the button ends up flush with the edge */
			'.ota-actions { margin: .9em 0 0; padding: 0 0 1.2em 1.4em; display: flex; gap: .5em; flex-wrap: wrap; }',
			'.cbi-section > .ota-muted { padding-left: 1.1em; }',
			'.ota-muted { color: #666; font-size: 95%; }',

			/* keep-settings row: aligned with the table columns */
			'.ota-option { display: flex; align-items: center; gap: .6em; padding: .75em .5em .25em 1.1em; }',
			'.ota-option input[type="checkbox"] { margin: 0; flex: none; }',
			'.ota-option label { margin: 0; cursor: pointer; }',

			/* 1.4em matches the theme's heading inset, so the track lines up
			 * with the title above it and keeps the same gap on both sides */
			'.ota-progress { margin: .5em 0 1.1em; padding: 0 1.4em; box-sizing: border-box; }',
			'.ota-track { position: relative; height: 18px; border-radius: 999px; background: rgba(128,128,128,.16); overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,.10); }',
			'.ota-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0; border-radius: 999px;' +
				' background-image: linear-gradient(90deg, #2e9d72, #3fbb8b 45%, #6fd3a8); background-size: 200% 100%;' +
				' transition: width .35s cubic-bezier(.4,0,.2,1); animation: otaFlow 3s linear infinite; }',
			'.ota-fill::after { content: ""; position: absolute; inset: 0; transform: translateX(-100%);' +
				' background: linear-gradient(90deg, transparent, rgba(255,255,255,.45), transparent);' +
				' animation: otaSheen 1.8s ease-in-out infinite; }',
			'@keyframes otaFlow { to { background-position: 200% 0; } }',
			'@keyframes otaSheen { 55%, 100% { transform: translateX(120%); } }',
			'.ota-pct { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;' +
				' font-size: 11px; font-weight: 700; letter-spacing: .02em; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.35); }',
			'.ota-progress-head { display: flex; align-items: baseline; justify-content: space-between; gap: 1em;' +
				' margin-bottom: .5em; color: #666; font-size: 94%; }',
			'.ota-pct-text { font-weight: 700; color: #2e9d72; font-variant-numeric: tabular-nums; }',
			'.ota-stats { display: flex; flex-wrap: wrap; gap: .35em 1.6em; color: #666; font-size: 94%; }',
			'.ota-stats b { font-weight: 600; }',

			/* install confirmation */
			'.ota-confirm-head { text-align: center; margin-bottom: 6px; }',
			'.ota-confirm-icon { width: 54px; height: 54px; margin: 0 auto 10px; border-radius: 50%; display: flex;' +
				' align-items: center; justify-content: center; font-size: 26px; font-weight: 700;' +
				' background: rgba(239,108,0,.14); color: #ef6c00; }',
			'.ota-kv { display: grid; grid-template-columns: auto 1fr; gap: .35em 1em; margin: 14px 0 4px; font-size: 14px; text-align: left; }',
			'.ota-kv dt { color: #888; white-space: nowrap; }',
			'.ota-kv dd { margin: 0; word-break: break-all; }',

			/* full screen flashing overlay */
			'.ota-overlay { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center;' +
				' justify-content: center; padding: 24px; background: rgba(8,16,12,.74);' +
				' -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); animation: otaFade .25s ease; }',
			'@keyframes otaFade { from { opacity: 0; } }',
			'.ota-overlay-card { width: min(540px, 100%); padding: 34px 32px 26px; border-radius: 18px; text-align: center;' +
				' color: #f3f8f5; background: rgba(20,29,24,.94); border: 1px solid rgba(255,255,255,.12);' +
				' box-shadow: 0 28px 70px rgba(0,0,0,.5); }',
			'.ota-ring { width: 72px; height: 72px; margin: 0 auto 20px; border-radius: 50%;' +
				' border: 6px solid rgba(255,255,255,.14); border-top-color: #6fd3a8; border-right-color: #3fbb8b;' +
				' animation: otaSpin 1s linear infinite; }',
			'@keyframes otaSpin { to { transform: rotate(360deg); } }',
			/* GitHub badge: the mark stays upright, the ring around it spins */
			'.ota-gh { position: relative; width: 78px; height: 78px; margin: 0 auto 20px; display: flex;' +
				' align-items: center; justify-content: center; border-radius: 50%;' +
				' background: rgba(255,255,255,.07); box-shadow: 0 0 0 6px rgba(111,211,168,.06); }',
			'.ota-gh svg { width: 42px; height: 42px; display: block; fill: #fff; }',
			'.ota-gh::before { content: ""; position: absolute; inset: -4px; border-radius: 50%;' +
				' border: 3px solid rgba(255,255,255,.14); border-top-color: #6fd3a8; border-right-color: #3fbb8b;' +
				' animation: otaSpin 1.1s linear infinite; }',
			'.ota-overlay-card h2 { margin: 0 0 6px; padding: 0; font-size: 1.35rem; color: #fff;' +
				' background: none; border: 0; box-shadow: none; }',
			'.ota-overlay-sub { margin: 0; color: rgba(255,255,255,.7); font-size: 14px; }',
			'.ota-steps { list-style: none; margin: 20px 0 0; padding: 0; text-align: left; font-size: 14px; }',
			'.ota-steps li { position: relative; padding: .38em 0 .38em 1.9em; color: rgba(255,255,255,.55); }',
			'.ota-steps li::before { content: ""; position: absolute; left: .35em; top: .95em; width: 8px; height: 8px; border-radius: 50%; background: rgba(255,255,255,.22); }',
			'.ota-steps li.done { color: rgba(255,255,255,.9); }',
			'.ota-steps li.done::before { background: #6fd3a8; }',
			'.ota-steps li.active { color: #fff; }',
			'.ota-steps li.active::before { background: #6fd3a8; box-shadow: 0 0 0 4px rgba(111,211,168,.22); animation: otaPulse 1.5s ease-in-out infinite; }',
			'@keyframes otaPulse { 50% { box-shadow: 0 0 0 9px rgba(111,211,168,.04); } }',
			'.ota-overlay-foot { margin-top: 18px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,.1);' +
				' color: rgba(255,255,255,.55); font-size: 12.5px; }',
			'.ota-overlay-foot b { color: rgba(255,255,255,.85); font-weight: 600; }',
			'.ota-danger { color: #ffb4a2; }',
			'body.ota-flashing { overflow: hidden; }',
			'@media (prefers-reduced-motion: reduce) { .ota-ring, .ota-fill, .ota-fill::after, .ota-steps li.active::before { animation: none; } }'
		].join('\n'));
	},

	renderLocalSection: function() {
		const local = (this.info && this.info.local) ? this.info.local : {};
		const config = (this.info && this.info.config) ? this.info.config : {};

		const rows = [
			[ _('Model'), local.model_name || local.board_name || local.board || '—' ],
			[ _('Firmware version'), local.version || local.version_id || '—' ],
			[ _('Build date'), buildDateCell(local) ],
			[ _('Target'), local.target || local.board || '—' ],
			[ _('Architecture'), local.arch || '—' ],
			[ _('Device key'), (this.info && this.info.device_key) ? this.info.device_key : '—' ],
			[ _('Update index'), config.api_url ? E('span', { 'class': 'ota-mono' }, config.api_url) : _('not configured') ]
		];

		const table = E('table', { 'class': 'ota-table' });

		rows.forEach((row) => {
			table.appendChild(E('tr', {}, [
				E('td', { 'class': 'ota-key' }, row[0]),
				E('td', {}, row[1])
			]));
		});

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Current firmware')),
			table
		]);
	},

	/* -------------------------------------------------------------- */

	renderState: function() {
		if (!this.body)
			return;

		this.progressRefs = null;

		const state = (this.status && this.status.state) ? this.status.state : 'idle';

		if (state === 'downloading')
			setChildren(this.body, this.renderDownloading(this.status));
		else if (state === 'downloaded')
			setChildren(this.body, this.renderDownloaded(this.status));
		else if (state === 'failed')
			setChildren(this.body, this.renderFailed(this.status));
		else if (this.check && this.check.newer === true)
			setChildren(this.body, this.renderAvailable());
		else if (this.check && this.check.newer === false)
			setChildren(this.body, this.renderLatest());
		else
			setChildren(this.body, this.renderIdle());
	},

	checkButton: function(label, handler) {
		return E('button', {
			'class': 'cbi-button cbi-button-reload',
			'click': ui.createHandlerFn(this, handler)
		}, label);
	},

	renderIdle: function() {
		const config = (this.info && this.info.config) ? this.info.config : {};

		const nodes = [
			E('h3', {}, _('Firmware update')),
			E('p', {}, config.api_url
				? _('Press "Check for updates" to look for a new firmware.')
				: _('No update index has been configured for this firmware yet.')),
			E('div', { 'class': 'ota-actions' }, [
				this.checkButton(_('Check for updates'), 'handleCheck')
			])
		];

		if (!config.api_url)
			nodes.push(E('p', { 'class': 'ota-muted' }, [ settingsLink() ]));

		return E('div', { 'class': 'cbi-section' }, nodes);
	},

	renderLatest: function() {
		const check = this.check || {};
		const remote = check.remote || {};

		return E('div', { 'class': 'cbi-section' }, [
			E('h3', { 'class': 'ota-ok' }, _('This firmware is up to date')),
			E('p', {}, _('Installed version: %s').format(remote.version || (check.local && check.local.version) || '—')),
			E('p', { 'class': 'ota-muted' }, _('Last checked: %s').format(fmtDate(check.checked_at))),
			E('div', { 'class': 'ota-actions' }, [
				this.checkButton(_('Check again'), 'handleCheck')
			])
		]);
	},

	renderAvailable: function() {
		const check = this.check || {};
		const remote = check.remote || {};
		const local = check.local || (this.info ? this.info.local : {}) || {};
		const config = (this.info && this.info.config) ? this.info.config : {};

		const rows = [
			[ _('Installed version'), local.version || '—' ],
			[ _('Available version'), remote.version || '—' ],
			[ _('Installed build'), buildDateCell(local) ],
			[ _('Available build'), buildDateCell(remote) ],
			[ _('Size'), remote.size ? fmtBytes(remote.size) : '—' ],
			[ _('Download site'), config.download_proxy
				? E('span', { 'class': 'ota-mono' }, config.download_proxy)
				: _('direct (GitHub)') ],
			[ _('File'), remote.file || _('unknown') ],
			[ _('SHA256'), E('span', { 'class': 'ota-mono' }, remote.sha256 || '—') ]
		];

		const table = E('table', { 'class': 'ota-table' });

		rows.forEach((row) => {
			table.appendChild(E('tr', {}, [
				E('td', { 'class': 'ota-key' }, row[0]),
				E('td', {}, row[1])
			]));
		});

		const nodes = [
			E('h3', { 'class': 'ota-warn' }, _('A new firmware is available')),
			table,
			E('div', { 'class': 'ota-actions' }, [
				E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': ui.createHandlerFn(this, 'handleDownload')
				}, _('Download firmware')),
				this.checkButton(_('Check again'), 'handleCheck')
			]),
			E('p', { 'class': 'ota-muted' }, _('Last checked: %s').format(fmtDate(check.checked_at)))
		];

		if (remote.changelog)
			nodes.push(E('h4', {}, _('Changelog')));
		if (remote.changelog) {
			const box = E('div', { 'class': 'ota-changelog' });
			box.innerHTML = renderMarkdown(remote.changelog);
			nodes.push(box);
		}

		return E('div', { 'class': 'cbi-section' }, nodes);
	},

	renderDownloading: function(status) {
		this.progressRefs = {
			fill: E('div', { 'class': 'ota-fill' }),
			pct: E('span', { 'class': 'ota-pct-text' }, '0%'),
			size: E('span', {}, _('Starting download…')),
			speed: E('span', {}),
			eta: E('span', {})
		};

		const card = E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Downloading firmware')),
			E('div', { 'class': 'ota-progress' }, [
				E('div', { 'class': 'ota-progress-head' }, [ this.progressRefs.size, this.progressRefs.pct ]),
				E('div', { 'class': 'ota-track' }, [ this.progressRefs.fill ]),
				E('div', { 'class': 'ota-stats', 'style': 'margin-top:.6em' }, [
					E('span', {}, [ _('Speed') + ': ', this.progressRefs.speed ]),
					E('span', {}, [ _('Remaining') + ': ', this.progressRefs.eta ])
				])
			]),
			E('div', { 'class': 'ota-actions' }, [
				E('button', {
					'class': 'cbi-button cbi-button-reset',
					'click': ui.createHandlerFn(this, 'handleCancel')
				}, _('Cancel download'))
			])
		]);

		this.updateProgress(status);

		return card;
	},

	updateProgress: function(status) {
		if (!this.progressRefs)
			return;

		const received = status.received || 0;
		const total = status.total || 0;
		const pct = (total > 0) ? Math.max(0, Math.min(100, (received / total) * 100)) : null;

		const refs = this.progressRefs;

		refs.fill.style.width = (pct != null ? pct : 100) + '%';
		refs.pct.textContent = pct != null ? pct.toFixed(pct < 10 ? 1 : 0) + '%' : fmtBytes(received);
		refs.size.textContent = pct != null
			? fmtBytes(received) + ' / ' + fmtBytes(total)
			: fmtBytes(received);

		if (this.speed > 0) {
			refs.speed.textContent = fmtBytes(this.speed) + '/s';

			if (total > 0 && received < total)
				refs.eta.textContent = fmtDuration((total - received) / this.speed);
			else
				refs.eta.textContent = _('verifying…');
		}
		else {
			refs.speed.textContent = '—';
			refs.eta.textContent = _('downloading…');
		}
	},

	renderDownloaded: function(status) {
		const check = this.check || {};
		const remote = check.remote || {};
		const config = (this.info && this.info.config) ? this.info.config : {};

		const keep = E('input', {
			'type': 'checkbox',
			'id': 'ota-keep'
		});

		keep.checked = (config.keep_settings == 1);

		const nodes = [
			E('h3', { 'class': 'ota-ok' }, _('Firmware downloaded and verified')),
			E('table', { 'class': 'ota-table' }, [
				E('tr', {}, [
					E('td', { 'class': 'ota-key' }, _('Version')),
					E('td', {}, remote.version || '—')
				]),
				E('tr', {}, [
					E('td', { 'class': 'ota-key' }, _('Size')),
					E('td', {}, fmtBytes(status.image_size || remote.size))
				]),
				E('tr', {}, [
					E('td', { 'class': 'ota-key' }, _('SHA256')),
					E('td', {}, [
						E('span', { 'class': 'ota-mono' }, remote.sha256 || ''),
						' ',
						E('span', { 'class': 'ota-ok' }, '✓')
					])
				])
			]),
			E('div', { 'class': 'ota-option' }, [
				keep,
				E('label', { 'for': 'ota-keep' }, _('Keep settings and retain the current configuration'))
			]),
			E('div', { 'class': 'ota-actions' }, [
				E('button', {
					'class': 'cbi-button cbi-button-apply',
					'click': ui.createHandlerFn(this, () => this.handleInstall(keep))
				}, _('Install firmware')),
				E('button', {
					'class': 'cbi-button cbi-button-reset',
					'click': ui.createHandlerFn(this, 'handleCancel')
				}, _('Discard download'))
			]),
			E('p', { 'class': 'ota-muted' }, _('The device will reboot after the firmware has been written.'))
		];

		return E('div', { 'class': 'cbi-section' }, nodes);
	},

	renderFailed: function(status) {
		return E('div', { 'class': 'cbi-section' }, [
			E('h3', { 'class': 'ota-warn' }, _('Update failed')),
			E('p', {}, errorText({ code: status.code, msg: status.msg })),
			status.msg
				? E('pre', {
					'class': 'ota-mono',
					'style': 'white-space:pre-wrap;max-height:10em;overflow:auto;'
				}, status.msg)
				: '',
			E('div', { 'class': 'ota-actions' }, [
				E('button', {
					'class': 'cbi-button cbi-button-action',
					'click': ui.createHandlerFn(this, 'handleDownload')
				}, _('Download again')),
				this.checkButton(_('Check again'), 'handleCheck')
			])
		]);
	},

	/* -------------------------------------------------------------- */

	handleReload: function() {
		window.location.reload();
	},

	handleCheck: function(ev, silent) {
		if (this.busy)
			return;

		this.busy = true;

		const section = this.body ? this.body.firstChild : null;

		if (section && !silent)
			setChildren(section, [ E('p', { 'class': 'spinning ota-checking' }, _('Checking for updates…')) ]);

		return callCheck().then((res) => {
			this.busy = false;

			if (res && res.ok && res.check) {
				this.check = res.check;
				this.status = { state: 'idle' };
				this.renderState();

				if (res.check.newer === true)
					ui.addNotification(null, E('p', {}, _('A new firmware is available.')), 'info');

				return;
			}

			if (res && res.check) {
				this.check = res.check;
				this.status = { state: 'idle' };
				this.renderState();
			}

			if (!silent)
				addError(res);
			else
				this.renderState();
		}).catch((err) => {
			this.busy = false;
			ui.addNotification(null, E('p', {}, _('Check failed: %s').format(err.message || err)), 'danger');
			this.renderState();
		});
	},

	handleDownload: function() {
		if (this.busy)
			return;

		this.busy = true;

		return callDownload().then((res) => {
			this.busy = false;

			if (!res || !res.ok) {
				addError(res);
				this.renderState();

				return;
			}

			this.status = res.status || { state: 'downloading' };
			this.lastSample = null;
			this.speed = 0;
			this.renderState();
			this.startPolling();
		}).catch((err) => {
			this.busy = false;
			ui.addNotification(null, E('p', {}, _('Download failed: %s').format(err.message || err)), 'danger');
			this.renderState();
		});
	},

	handleCancel: function() {
		this.stopPolling();

		return callCancel().then(() => {
			this.status = { state: 'idle' };
			this.renderState();
			ui.addNotification(null, E('p', {}, _('Download canceled.')), 'info');
		}).catch((err) => {
			ui.addNotification(null, E('p', {}, _('Cancel failed: %s').format(err.message || err)), 'danger');
			this.renderState();
		});
	},

	handleInstall: function(keepInput) {
		const keep = keepInput && keepInput.checked ? 1 : 0;
		const remote = (this.check && this.check.remote) ? this.check.remote : {};

		ui.showModal(_('Install firmware'), [
			E('div', { 'class': 'ota-confirm-head' }, [
				E('div', { 'class': 'ota-confirm-icon' }, '!'),
				E('p', { 'class': 'ota-muted' }, _('The device will be flashed and rebooted. This takes a few minutes.'))
			]),
			E('dl', { 'class': 'ota-kv' }, [
				E('dt', {}, _('Version')),
				E('dd', {}, remote.version || '—'),
				E('dt', {}, _('Size')),
				E('dd', {}, fmtBytes(remote.size)),
				E('dt', {}, _('Build date')),
				E('dd', {}, buildDateCell(remote)),
				E('dt', {}, _('Configuration')),
				E('dd', {}, keep ? _('kept') : _('erased'))
			]),
			E('div', { 'class': 'ota-actions', 'style': 'justify-content:flex-end' }, [
				E('button', { 'class': 'cbi-button', 'click': ui.hideModal }, _('Cancel')),
				E('button', {
					'class': 'cbi-button cbi-button-apply important',
					'click': ui.createHandlerFn(this, () => {
						// Start first: if hideModal() throws, the installation
						// must still be requested and the overlay still shown.
						this.startInstall(keep);

						try {
							ui.hideModal();
						}
						catch (e) {
							/* the overlay covers the dialog anyway */
						}
					})
				}, _('Start installation'))
			])
		]);
	},

	startInstall: function(keep) {
		this.stopPolling();

		// Show the overlay before talking to the backend. The apply call can
		// take a moment, and a failure used to leave the page with no feedback
		// at all, which made it look like nothing had started.
		this.showFlashing();

		this.unloadGuard = (e) => {
			e.preventDefault();
			e.returnValue = _('The firmware is being written, please do not leave this page.');
			return e.returnValue;
		};

		window.addEventListener('beforeunload', this.unloadGuard);

		return callApply(keep).then((res) => {
			if (!res || !res.ok) {
				// Nothing was written, so drop both the overlay and the mark
				// that would bring it back after a reload.
				clearFlashMark();
				this.hideFlashing();
				addError(res);
				this.renderState();

				return;
			}

			this.status = { state: 'installing' };
		}).catch(() => {
			// sysupgrade replaces the running system, so the request that
			// started it often dies without an answer. That is the normal
			// path, not a failure: keep the overlay and wait for the reboot.
			this.status = { state: 'installing' };
		});
	},

	githubBadge: function() {
		const badge = E('div', { 'class': 'ota-gh' });

		// Written as markup: document.createElement() cannot build SVG children.
		badge.innerHTML =
			'<svg viewBox="0 0 16 16" role="img" aria-label="GitHub">' +
			'<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 ' +
			'0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 ' +
			'1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 ' +
			'0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 ' +
			'0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>' +
			'</svg>';

		return badge;
	},

	showFlashing: function(startedAt, resume) {
		const steps = {
			write: E('li', {}, _('Writing the system partition')),
			verify: E('li', {}, _('Verifying the image')),
			reboot: E('li', {}, _('Rebooting the device')),
			reconnect: E('li', {}, _('Reconnecting to the web interface'))
		};
		const order = [ 'write', 'verify', 'reboot', 'reconnect' ];

		const elapsed = E('b', {}, '0:00');
		const card = E('div', { 'class': 'ota-overlay-card' }, [
			this.githubBadge(),
			E('h2', {}, _('Installing firmware')),
			E('p', { 'class': 'ota-overlay-sub' }, [
				E('span', { 'class': 'ota-danger' }, _('Do not power off the device.')),
				' ',
				_('The page reconnects automatically once it is back.')
			]),
			E('ol', { 'class': 'ota-steps' }, order.map((key) => steps[key])),
			E('p', { 'class': 'ota-overlay-foot' }, [
				_('Elapsed') + ' ',
				elapsed,
				' · ',
				_('Usually takes 1-3 minutes.')
			])
		]);

		this.flashNode = E('div', { 'class': 'ota-overlay' }, card);

		document.body.classList.add('ota-flashing');
		document.body.appendChild(this.flashNode);

		const setPhase = (index) => {
			order.forEach((key, i) => {
				steps[key].className = (i < index) ? 'done' : (i === index ? 'active' : '');
			});
		};

		const phaseFor = (seconds) => {
			if (seconds < 20)
				return 0;
			if (seconds < 40)
				return 1;
			if (seconds < 55)
				return 2;

			return 3;
		};

		if (!startedAt) {
			startedAt = Date.now();

			try {
				window.sessionStorage.setItem(FLASH_KEY, String(startedAt));
			}
			catch (e) { }
		}

		let waited = Math.max(0, Math.round((Date.now() - startedAt) / 1000));

		setPhase(phaseFor(waited));
		elapsed.textContent = fmtDuration(waited);

		const startWaiting = () => {
			this.stopFlashTimer();
			this.waitForDevice(steps.reconnect, card, resume);
		};

		if (waited >= 65) {
			startWaiting();

			return;
		}

		this.flashTimer = window.setInterval(() => {
			waited++;
			elapsed.textContent = fmtDuration(waited);
			setPhase(phaseFor(waited));

			if (waited >= 65)
				startWaiting();
		}, 1000);
	},

	stopFlashTimer: function() {
		if (this.flashTimer) {
			window.clearInterval(this.flashTimer);
			this.flashTimer = null;
		}
	},

	/* Tear the overlay down again when the backend refused to start, so the
	 * user is not left staring at a spinner that will never finish. */
	hideFlashing: function() {
		this.stopFlashTimer();

		if (this.flashNode && this.flashNode.parentNode)
			this.flashNode.parentNode.removeChild(this.flashNode);

		this.flashNode = null;

		if (this.unloadGuard) {
			window.removeEventListener('beforeunload', this.unloadGuard);
			this.unloadGuard = null;
		}

		document.body.classList.remove('ota-flashing');
	},

	/* Leave the overlay for good and hand the browser over to the device.
	 * The beforeunload guard has to go first, otherwise the browser asks for
	 * confirmation and the automatic redirect never happens. */
	finishFlash: function(url) {
		clearFlashMark();

		if (this.unloadGuard) {
			window.removeEventListener('beforeunload', this.unloadGuard);
			this.unloadGuard = null;
		}

		window.location.replace(url);
	},

	/* Wait for the device to go away and come back, then hand the browser
	 * over to it. A successful probe alone means nothing: the web server keeps
	 * answering while sysupgrade is still writing the image, which is exactly
	 * how the overlay used to disappear after a couple of minutes. */
	waitForDevice: function(stepNode, card, resume) {
		// After a reboot the LuCI session is gone, so land on the device root:
		// the browser follows it to the login page instead of a dead view.
		const target = window.location.protocol + '//' + window.location.host;
		const url = target;
		const hint = E('p', { 'class': 'ota-overlay-foot' }, [
			_('If the page does not come back, open this address manually:') + ' ',
			E('a', { 'href': url }, url)
		]);

		if (card)
			card.appendChild(hint);

		const started = Date.now();
		let wentDown = false;

		const giveUp = () => {
			clearFlashMark();
			this.hideFlashing();
			ui.addNotification(null, E('p', {}, _('The device did not come back. Check it and open the web interface manually.')), 'warning');
		};

		const probe = () => {
			if ((Date.now() - started) > FLASH_MAX_MS) {
				giveUp();

				return;
			}

			const img = new Image();

			img.onload = () => {
				if (resume || wentDown) {
					if (stepNode)
						stepNode.className = 'done';

					this.finishFlash(url);

					return;
				}

				// The old system (or the still running write) answers: keep
				// showing the overlay and look again in a moment.
				window.setTimeout(probe, 3000);
			};

			img.onerror = () => {
				wentDown = true;
				window.setTimeout(probe, 3000);
			};

			img.src = target + L.resource('icons/loading.svg') + '?t=' + Date.now();
		};

		probe();
	},

	startPolling: function() {
		this.stopPolling();

		const tick = () => {
			if (!this.body || !document.body.contains(this.body))
				return;

			return callStatus().then((res) => {
				const status = (res && res.ok && res.status) ? res.status : { state: 'idle' };

				this.trackSpeed(status);

				const previous = this.status ? this.status.state : null;

				this.status = status;

				if (status.state === 'downloading' && previous === 'downloading' && this.progressRefs) {
					this.updateProgress(status);
				}
				else {
					this.renderState();
				}

				if (status.state === 'downloading') {
					this.timer = window.setTimeout(tick, 1000);
				}
				else if (status.state === 'downloaded') {
					ui.addNotification(null, E('p', {}, _('Firmware downloaded and verified.')), 'info');
				}
				else if (status.state === 'failed') {
					addError({ code: status.code, msg: '' });
				}
				else if (status.state === 'idle' && previous === 'downloading') {
					ui.addNotification(null, E('p', {}, _('Download canceled.')), 'info');
				}
			}).catch(() => {
				this.timer = window.setTimeout(tick, 2000);
			});
		};

		this.timer = window.setTimeout(tick, 1000);
	},

	stopPolling: function() {
		if (this.timer) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}

		this.lastSample = null;
		this.speed = 0;
	},

	trackSpeed: function(status) {
		const now = Date.now();

		if (status.state !== 'downloading') {
			this.lastSample = null;
			this.speed = 0;
			return;
		}

		if (this.lastSample && now - this.lastSample.t >= 500) {
			const dt = (now - this.lastSample.t) / 1000;
			const delta = (status.received || 0) - this.lastSample.bytes;

			if (delta >= 0) {
				const instant = delta / dt;

				this.speed = this.speed > 0 ? (this.speed * 0.6 + instant * 0.4) : instant;
			}

			this.lastSample = { t: now, bytes: status.received || 0 };
		}
		else if (!this.lastSample) {
			this.lastSample = { t: now, bytes: status.received || 0 };
		}
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null,

	addFooter: function() {
		return E('div', {});
	}
});
