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
			const custom = '__custom__';

			// A real select is the primary control: click, pick, done. Only
			// when "custom" is chosen does a text field appear below it.
			const select = E('select', { 'class': 'cbi-input-select' });

			presets.forEach((url) => select.appendChild(E('option', { 'value': url }, url)));
			select.appendChild(E('option', { 'value': custom }, _('Custom')));

			field.style.display = 'block';

			if (width > 0) {
				field.style.width = width + 'px';
				select.style.width = width + 'px';
				input.style.width = width + 'px';
			}

			select.style.boxSizing = 'border-box';
			select.style.display = 'block';
			input.style.boxSizing = 'border-box';
			input.style.marginTop = '.4em';
			input.style.display = 'none';
			input.removeAttribute('list');
			input.removeAttribute('autocomplete');

			const showCustom = (focus) => {
				select.value = custom;
				input.style.display = 'block';

				if (focus)
					input.focus();
			};

			const showPreset = (url) => {
				select.value = url;
				input.value = url;
				input.style.display = 'none';
			};

			select.addEventListener('change', () => {
				if (select.value === custom)
					showCustom(true);
				else
					showPreset(select.value);
			});

			field.insertBefore(select, input);

			const current = (input.value || '').trim();

			if (presets.indexOf(current) >= 0)
				showPreset(current);
			else if (current === '')
				showPreset(presets[0]);
			else
				showCustom(false);

			return node;
		});
	}
});
