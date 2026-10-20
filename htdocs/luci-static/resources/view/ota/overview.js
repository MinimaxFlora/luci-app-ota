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
		return L.resolveDefault(callInfo(), null);
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

		return container;
	},

	renderStyle: function() {
		return E('style', {}, [
			'.ota-table { width: 100%; border-collapse: collapse; }',
			'.ota-table td { padding: .25em .5em; vertical-align: top; }',
			'.ota-table td.ota-key { width: 33%; color: #666; white-space: nowrap; }',
			'.ota-changelog { border: 1px solid rgba(128,128,128,.35); border-radius: 6px; padding: .25em 1em; margin: .5em 0; max-height: 26em; overflow-y: auto; }',
			'.ota-changelog h3, .ota-changelog h4, .ota-changelog h5 { margin: .6em 0 .3em; }',
			'.ota-changelog p { margin: .35em 0; }',
			'.ota-changelog ul, .ota-changelog ol { margin: .35em 0; padding-left: 1.6em; }',
			'.ota-changelog pre { overflow-x: auto; padding: .5em; background: rgba(128,128,128,.12); border-radius: 6px; }',
			'.ota-changelog code { background: rgba(128,128,128,.15); padding: 0 .2em; border-radius: 3px; }',
			'.ota-changelog blockquote { border-left: 3px solid rgba(128,128,128,.4); margin: .5em 0; padding-left: .75em; color: #666; }',
			'.ota-ok { color: #2e7d32; }',
			'.ota-warn { color: #ef6c00; }',
			'.ota-mono { font-family: monospace; word-break: break-all; }',
			'.ota-actions { margin-top: .75em; display: flex; gap: .5em; flex-wrap: wrap; }',
			'.ota-muted { color: #666; font-size: 95%; }'
		].join('\n'));
	},

	renderLocalSection: function() {
		const local = (this.info && this.info.local) ? this.info.local : {};
		const config = (this.info && this.info.config) ? this.info.config : {};

		const rows = [
			[ _('Model'), local.product || local.board || '—' ],
			[ _('Firmware version'), local.version || local.version_id || '—' ],
			[ _('Build date'), fmtDate(local.build_date) ],
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

		const rows = [
			[ _('Installed version'), local.version || '—' ],
			[ _('Available version'), remote.version || '—' ],
			[ _('Installed build'), fmtDate(local.build_date) ],
			[ _('Available build'), fmtDate(remote.build_date) ],
			[ _('Size'), remote.size ? fmtBytes(remote.size) : '—' ],
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
			bar: E('div', { 'class': 'cbi-progressbar', 'title': '0%' }),
			info: E('p', { 'class': 'ota-muted' }, _('Starting download…'))
		};

		const card = E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, _('Downloading firmware')),
			this.progressRefs.bar,
			this.progressRefs.info,
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

		const bar = this.progressRefs.bar;

		bar.setAttribute('title', pct != null ? pct.toFixed(1) + '%' : fmtBytes(received));
		setChildren(bar, [ E('div', { 'style': 'width:' + (pct != null ? pct.toFixed(1) : '100') + '%' }) ]);

		let text;

		if (pct != null)
			text = fmtBytes(received) + ' / ' + fmtBytes(total) + ' (' + pct.toFixed(1) + '%)';
		else
			text = fmtBytes(received);

		if (this.speed > 0) {
			text += ' · ' + fmtBytes(this.speed) + '/s';

			if (total > 0 && received < total)
				text += ' · ' + _('about %s left').format(fmtDuration((total - received) / this.speed));
		}
		else {
			text += ' · ' + _('downloading…');
		}

		this.progressRefs.info.textContent = text;
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
			E('label', { 'class': 'cbi-input-checkbox', 'style': 'display:block;margin:.75em 0;' }, [
				keep,
				' ',
				_('Keep settings and retain the current configuration')
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
			setChildren(section, [ E('p', { 'class': 'spinning' }, _('Checking for updates…')) ]);

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
			E('p', {}, _('Firmware version %s will be written to the device.').format(remote.version || '—')),
			E('ul', {}, [
				E('li', {}, keep ? _('The current configuration will be kept.') : _('The current configuration will be erased.')),
				E('li', {}, _('The device reboots automatically, do not power it off during the process.')),
				E('li', {}, _('The update takes a few minutes. The network may be unreachable during that time.'))
			]),
			E('div', { 'class': 'right' }, [
				E('button', {
					'class': 'cbi-button',
					'click': ui.hideModal
				}, _('Cancel')),
				' ',
				E('button', {
					'class': 'cbi-button cbi-button-negative important',
					'click': ui.createHandlerFn(this, () => {
						ui.hideModal();
						this.startInstall(keep);
					})
				}, _('Start installation'))
			])
		]);
	},

	startInstall: function(keep) {
		this.stopPolling();

		return callApply(keep).then((res) => {
			if (!res || !res.ok) {
				addError(res);
				this.renderState();

				return;
			}

			this.status = { state: 'installing' };
			this.showFlashing();

			window.addEventListener('beforeunload', (e) => {
				e.preventDefault();
				e.returnValue = _('The firmware is being written, please do not leave this page.');
				return e.returnValue;
			});
		}).catch((err) => {
			ui.addNotification(null, E('p', {}, _('Could not start the installation: %s').format(err.message || err)), 'danger');
			this.renderState();
		});
	},

	showFlashing: function() {
		const status = E('p', { 'class': 'spinning' }, _('Writing firmware, the device will reboot…'));

		ui.showModal(_('Installing firmware'), [
			status,
			E('p', {}, _('Do not power off the device and do not close the browser.')),
			E('p', { 'class': 'ota-muted' }, _('The page reconnects automatically once the device is back.'))
		], '');

		let waited = 0;

		const tick = () => {
			waited += 5;

			if (waited < 120) {
				status.textContent = _('Waiting for the device to reboot…') + ' (' + waited + 's)';
				window.setTimeout(tick, 5000);
				return;
			}

			this.waitForDevice();
		};

		window.setTimeout(tick, 5000);
	},

	waitForDevice: function() {
		const target = window.location.protocol + '//' + window.location.host;
		const probe = () => {
			const img = new Image();

			img.onload = () => {
				window.location.replace(target + L.url('admin/system/ota/overview'));
			};

			img.onerror = () => {
				window.setTimeout(probe, 5000);
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
