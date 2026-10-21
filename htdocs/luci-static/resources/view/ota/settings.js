'use strict';
'require view';
'require form';

return view.extend({
	render: function() {
		let m, s, o;

		// Mirrors offered in the dropdown of the acceleration site field.
		const presets = [
			'https://gh-proxy.kejizero.xyz',
			'https://gh-proxy.com',
			'https://gh.acmsz.top',
			'https://ghp.keleyaa.com',
			'https://git.yylx.win',
			'https://xsadwsd.kdns.fr',
			'https://fastly.jsdelivr.net',
			'https://testingcf.jsdelivr.net',
			'https://cdn.jsdelivr.net'
		];

		m = new form.Map('ota', _('OTA Firmware Update'),
			_('Configure where LuCI looks for firmware updates and how they are handled.'));

		// /etc/config/ota declares "config ota 'config'", so the section
		// *type* is "ota" and the section name is "config".
		s = m.section(form.TypedSection, 'ota', _('Settings'));
		s.anonymous = true;
		s.description = _('The update index is a small JSON file that lists the firmware images available for each device. It is published by whoever builds the firmware.');

		o = s.option(form.Value, 'api_url', _('Update index URL'),
			_('URL of the JSON update index. It has to be reachable from the router itself, not from the browser.'));
		o.placeholder = 'https://example.com/ota.json';
		o.rmempty = false;
		o.validate = function(section_id, value) {
			if (!value)
				return _('An update index URL is required.');

			if (!/^https?:\/\/.+/i.test(value))
				return _('The URL has to start with http:// or https://.');

			return true;
		};

		o = s.option(form.Value, 'download_proxy', _('Download acceleration site'),
			_('Choose the GitHub proxy acceleration site.'));
		o.placeholder = presets[0];
		o.default = presets[0];
		o.rmempty = true;
		o.validate = function(section_id, value) {
			if (!value)
				return true;

			if (!/^https?:\/\/[^\s]+$/i.test(value))
				return _('The acceleration site has to be a URL starting with http:// or https://.');

			return true;
		};

		o = s.option(form.Value, 'device', _('Device key'),
			_('Key that identifies this device in the update index. Leave empty to detect it automatically from the running firmware.'));
		o.placeholder = _('detect automatically');
		o.rmempty = true;

		o = s.option(form.Flag, 'auto_check', _('Check on page load'),
			_('Look for a new firmware when the overview page is opened and the last check is older than ten minutes.'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Flag, 'keep_settings', _('Keep settings by default'),
			_('Preselect the "keep settings" option before installing a firmware.'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Flag, 'verify_image', _('Validate the image before installing'),
			_('Let sysupgrade check the downloaded image for this device right after the download. A rejected image is discarded.'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Flag, 'ipv4_only', _('Use IPv4 only'),
			_('Restrict the index and firmware downloads to IPv4. Helps on networks with broken IPv6 connectivity.'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Flag, 'allow_insecure', _('Allow insecure connections'),
			_('Allow plain http:// URLs and skip TLS certificate verification. Only enable this if you really have to.'));
		o.default = '0';
		o.rmempty = false;

		const rendered = m.render();

		return Promise.resolve(rendered).then((node) => {
			const input = node.querySelector('input[id$="download_proxy"]');

			if (!input)
				return node;

			const reference = node.querySelector('input[id$="api_url"]');
			const width = reference ? Math.round(reference.getBoundingClientRect().width) : 0;
			const field = input.parentNode;

			// Same widget as the mosdns DNS picker: a box that opens a panel
			// with the known mirrors and, at the bottom of that panel, a field
			// to type your own value. Enter turns it into a selected entry.
			const combo = E('div', { 'class': 'ota-combo' });
			const control = E('div', { 'class': 'ota-combo-box', 'tabindex': '0' });
			const caption = E('span', { 'class': 'ota-combo-caption' }, '');
			const caret = E('span', { 'class': 'ota-combo-caret' });
			const panel = E('div', { 'class': 'ota-combo-panel', 'style': 'display:none' });

			control.appendChild(caption);
			control.appendChild(caret);
			combo.appendChild(control);
			combo.appendChild(panel);

			const values = presets.slice();
			const current = (input.value || '').trim() || presets[0];

			if (values.indexOf(current) < 0)
				values.unshift(current);

			const setValue = (value) => {
				input.value = value;
				caption.textContent = value;
			};

			const close = () => {
				panel.style.display = 'none';
			};

			const commitCustom = (raw) => {
				const value = (raw || '').trim();

				if (value === '') {
					close();
					return;
				}

				if (values.indexOf(value) < 0)
					values.push(value);

				setValue(value);
				close();
			};

			const buildPanel = () => {
				while (panel.firstChild)
					panel.removeChild(panel.firstChild);

				values.forEach((value) => {
					const row = E('div', {
						'class': 'ota-combo-option' + (value === input.value ? ' ota-combo-selected' : '')
					}, value);

					row.addEventListener('mousedown', (ev) => {
						ev.preventDefault();
						setValue(value);
						close();
					});

					panel.appendChild(row);
				});

				const custom = E('input', {
					'type': 'text',
					'class': 'ota-combo-custom',
					'placeholder': '－ ' + _('Custom') + ' －'
				});

				custom.addEventListener('keydown', (ev) => {
					if (ev.key === 'Enter') {
						ev.preventDefault();
						commitCustom(custom.value);
					}
					else if (ev.key === 'Escape') {
						close();
					}
				});

				panel.appendChild(custom);
				return custom;
			};

			let customField = null;

			control.addEventListener('mousedown', (ev) => {
				ev.preventDefault();

				if (panel.style.display === 'none') {
					customField = buildPanel();
					panel.style.display = 'block';
					control.focus();
				}
				else {
					close();
				}
			});

			document.addEventListener('mousedown', (ev) => {
				if (panel.style.display !== 'none' && !combo.contains(ev.target))
					close();
			});

			setValue(current);

			// render() runs on a detached node, so the width has to be measured
			// once LuCI has inserted it into the page.
			window.setTimeout(() => {
				const ref = node.querySelector('input[id$="api_url"]');

				if (!ref)
					return;

				const w = Math.round(ref.getBoundingClientRect().width);

				if (w > 0) {
					combo.style.width = w + 'px';
					control.style.width = w + 'px';
				}
			}, 0);

			if (width > 0) {
				combo.style.width = width + 'px';
				control.style.width = width + 'px';
			}

			input.style.display = 'none';
			input.removeAttribute('list');
			input.removeAttribute('autocomplete');

			field.style.display = 'block';

			node.insertBefore(E('style', {}, [
				'.ota-combo { position: relative; }',
				'.ota-combo-box { display: flex; align-items: center; justify-content: space-between; gap: .5em;' +
					' min-height: 38px; padding: 0 .75em; box-sizing: border-box; cursor: pointer;' +
					' border: 1px solid rgba(128,128,128,.45); border-radius: 6px;' +
					' background: var(--background-color-high, #fff); color: inherit; }',
				'.ota-combo-box:focus { outline: none; border-color: #2e9d72; }',
				'.ota-combo-caption { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
				'.ota-combo-caret { flex: none; width: 0; height: 0; border-left: 5px solid transparent;' +
					' border-right: 5px solid transparent; border-top: 6px solid #999; }',
				'.ota-combo-panel { position: absolute; z-index: 1200; left: 0; right: 0; top: calc(100% + 4px);' +
					' max-height: 640px; overflow: auto; padding: 6px;' +
					' background: var(--background-color-high, #fff); color: var(--text-color, inherit);' +
					' border: 1px solid rgba(128,128,128,.35); border-radius: 8px;' +
					' box-shadow: 0 10px 28px rgba(0,0,0,.18); }',
				'.ota-combo-option { padding: .45em .6em; border-radius: 6px; cursor: pointer;' +
					' white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
				'.ota-combo-option:hover { background: rgba(46,157,114,.12); }',
				'.ota-combo-selected { background: rgba(46,157,114,.16); font-weight: 600; }',
				'.ota-combo-custom { width: 100%; box-sizing: border-box; margin-top: 6px; padding: .45em .6em;' +
					' font: inherit; border: 1px solid rgba(128,128,128,.45); border-radius: 6px;' +
					' background: var(--background-color-high, #fff); color: inherit; }'
			].join('\n')), node.firstChild);

			field.appendChild(combo);
			field.appendChild(input);

			return node;
		});
	}
});
