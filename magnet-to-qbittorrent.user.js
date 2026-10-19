// ==UserScript==
// @name         Magnet to Download Client
// @namespace    local.magnet-to-qbittorrent
// @version      3.0.0
// @description  Add a push button beside magnet links and configure a download client.
// @author       Local
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      192.168.1.12
// @connect      localhost
// @connect      127.0.0.1
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const STORAGE_KEY = 'magnetToDownloadSettings';
  const DEFAULTS = {
    clientType: 'qbittorrent',
    serverUrl: 'http://192.168.1.12:8080',
    username: '',
    password: '',
    savePath: '',
    httpMethod: 'POST',
    httpBody: '{"url":"{magnet}"}',
  };
  const BUTTON_CLASS = 'mtq-inline-button';
  const sent = new Set();
  let settings = loadSettings();

  function loadSettings() {
    try {
      const stored = GM_getValue(STORAGE_KEY, null);
      if (stored && typeof stored === 'object') return { ...DEFAULTS, ...stored };
      // Migrate settings made by earlier releases from the current site's local storage.
      const old = JSON.parse(localStorage.getItem('magnetToQbittorrentSettings') || 'null');
      if (old) {
        const migrated = { ...DEFAULTS, ...old };
        GM_setValue(STORAGE_KEY, migrated);
        return migrated;
      }
    } catch { /* Use defaults when storage is unavailable. */ }
    return { ...DEFAULTS };
  }

  function saveSettings(next) {
    settings = { ...settings, ...next };
    try { GM_setValue(STORAGE_KEY, settings); }
    catch { toast('保存设置失败，请确认 Tampermonkey 存储权限。'); }
  }

  function normalizeMagnet(value) {
    if (!value) return '';
    const match = String(value).match(/magnet:\?[^\s"'<>]+/i);
    if (!match) return '';
    return match[0].replace(/&amp;/gi, '&').replace(/\\u0026/gi, '&').replace(/[),.;]+$/, '');
  }

  function addStyle() {
    if (document.getElementById('mtq-style')) return;
    const style = document.createElement('style');
    style.id = 'mtq-style';
    style.textContent = `
      .${BUTTON_CLASS}{display:inline-block!important;vertical-align:middle!important;margin:0 0 0 7px!important;padding:4px 8px!important;border:0!important;border-radius:5px!important;background:#2563eb!important;color:#fff!important;font:600 12px/1.35 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;text-decoration:none!important;cursor:pointer!important;white-space:nowrap!important;box-shadow:0 1px 3px #0003!important}
      .${BUTTON_CLASS}:hover{background:#1d4ed8!important;color:#fff!important}.${BUTTON_CLASS}:disabled{opacity:.7!important;cursor:default!important}
      #mtq-toast{position:fixed;right:18px;bottom:18px;z-index:2147483647;background:#151922;color:#fff;border:1px solid #46536a;border-radius:8px;padding:10px 14px;box-shadow:0 5px 20px #0008;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      #mtq-settings-backdrop{position:fixed;inset:0;z-index:2147483646;background:#080b12aa;display:flex;align-items:center;justify-content:center;padding:16px;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#eaf0fa}
      #mtq-settings{box-sizing:border-box;width:min(520px,100%);max-height:90vh;overflow:auto;background:#151922;border:1px solid #414c60;border-radius:14px;box-shadow:0 20px 70px #0009}
      #mtq-settings *{box-sizing:border-box} .mtq-set-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px;border-bottom:1px solid #343d4c}
      .mtq-set-title{font-size:17px;font-weight:700}.mtq-set-close{border:0;background:transparent;color:#bec9d9;font-size:22px;cursor:pointer}
      .mtq-set-body{padding:16px 18px}.mtq-set-field{display:block;margin-bottom:13px;color:#c7d2e2}.mtq-set-field input,.mtq-set-field select,.mtq-set-field textarea{display:block;width:100%;margin-top:5px;padding:9px 10px;border:1px solid #465267;border-radius:7px;background:#0f131b;color:#f2f6fc;font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
      .mtq-set-field[hidden]{display:none!important}
      .mtq-set-field textarea{min-height:84px;resize:vertical;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px}.mtq-set-help{margin:-4px 0 13px;color:#9caabd;font-size:12px}
      .mtq-set-footer{display:flex;justify-content:flex-end;gap:8px;padding:13px 18px;border-top:1px solid #343d4c}.mtq-set-btn{border:0;border-radius:7px;padding:8px 13px;background:#344258;color:#fff;cursor:pointer;font:600 13px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.mtq-set-btn.primary{background:#2563eb}
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function toast(message) {
    document.getElementById('mtq-toast')?.remove();
    const el = document.createElement('div');
    el.id = 'mtq-toast'; el.textContent = message;
    (document.body || document.documentElement).appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  function request(url, method, data, headers = {}) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method, url, data, headers, timeout: 20000,
        onload: resolve,
        onerror: () => reject(new Error('无法连接下载器，请检查地址、网络和 Tampermonkey 的站点访问权限。')),
        ontimeout: () => reject(new Error('连接下载器超时。')),
      });
    });
  }

  function baseUrl() { return settings.serverUrl.trim().replace(/\/+$/, ''); }

  async function sendToQbittorrent(magnet) {
    const base = baseUrl();
    if (settings.username || settings.password) {
      const login = await request(`${base}/api/v2/auth/login`, 'POST', new URLSearchParams({ username: settings.username, password: settings.password }).toString(), {
        'Content-Type': 'application/x-www-form-urlencoded',
      });
      if (login.status < 200 || login.status >= 300 || !String(login.responseText).includes('Ok.')) {
        throw new Error('qBittorrent 登录失败，请检查用户名和密码。');
      }
    }
    const params = new URLSearchParams({ urls: magnet });
    if (settings.savePath.trim()) params.set('savepath', settings.savePath.trim());
    const result = await request(`${base}/api/v2/torrents/add`, 'POST', params.toString(), {
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    if (result.status < 200 || result.status >= 300 || /fail/i.test(result.responseText || '')) {
      throw new Error(`qBittorrent 添加任务失败（HTTP ${result.status}）。请检查 Web UI 地址、认证及跨站请求设置。`);
    }
  }

  async function sendToCustomApi(magnet) {
    const url = settings.serverUrl.trim();
    const body = settings.httpBody.replaceAll('{magnet}', magnet);
    const headers = { 'Content-Type': 'application/json' };
    if (settings.username || settings.password) {
      headers.Authorization = `Basic ${btoa(unescape(encodeURIComponent(`${settings.username}:${settings.password}`)))}`;
    }
    const result = await request(url, settings.httpMethod, body, headers);
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`下载服务返回 HTTP ${result.status}。请检查自定义 API 地址和请求正文。`);
    }
  }

  async function sendMagnet(magnet, button) {
    if (!settings.serverUrl.trim()) { toast('请先打开“下载器设置”填写 Web 地址。'); return; }
    button.disabled = true; button.textContent = '推送中…';
    try {
      if (settings.clientType === 'custom') await sendToCustomApi(magnet);
      else await sendToQbittorrent(magnet);
      sent.add(magnet); button.textContent = '已添加'; button.title = '已发送到下载器';
      toast('磁力链接已发送到下载器。');
    } catch (error) {
      button.disabled = false; button.textContent = '推送'; toast(error.message || '推送失败。');
    }
  }

  function addButtons() {
    if (!document.body) return;
    addStyle();
    document.querySelectorAll('a[href]').forEach((link) => {
      const magnet = normalizeMagnet(link.getAttribute('href') || link.href);
      if (!magnet || link.nextElementSibling?.classList.contains(BUTTON_CLASS)) return;
      const button = document.createElement('button');
      button.type = 'button'; button.className = BUTTON_CLASS;
      button.textContent = sent.has(magnet) ? '已添加' : '推送';
      button.title = `推送到下载器：${magnet.slice(0, 100)}`; button.disabled = sent.has(magnet);
      button.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); sendMagnet(magnet, button); });
      link.insertAdjacentElement('afterend', button);
    });
  }

  function field(labelText, name, type, value, placeholder = '') {
    const label = document.createElement('label'); label.className = 'mtq-set-field'; label.textContent = labelText;
    let input;
    if (type === 'select') {
      input = document.createElement('select');
      [['qbittorrent', 'qBittorrent'], ['custom', '自定义 HTTP API']].forEach(([v, text]) => {
        const option = document.createElement('option'); option.value = v; option.textContent = text; input.appendChild(option);
      });
    } else if (type === 'textarea') input = document.createElement('textarea');
    else { input = document.createElement('input'); input.type = type; }
    input.name = name; input.value = value || ''; input.placeholder = placeholder;
    label.appendChild(input); return { label, input };
  }

  function openSettings() {
    if (!document.body) return;
    document.getElementById('mtq-settings-backdrop')?.remove();
    addStyle();
    const backdrop = document.createElement('div'); backdrop.id = 'mtq-settings-backdrop';
    const panel = document.createElement('div'); panel.id = 'mtq-settings'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true');
    const head = document.createElement('div'); head.className = 'mtq-set-head';
    const title = document.createElement('div'); title.className = 'mtq-set-title'; title.textContent = '下载器设置';
    const close = document.createElement('button'); close.className = 'mtq-set-close'; close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', '关闭');
    close.addEventListener('click', () => backdrop.remove()); head.append(title, close);
    const body = document.createElement('div'); body.className = 'mtq-set-body';
    const controls = {};
    const definitions = [
      ['下载器类型', 'clientType', 'select', settings.clientType],
      ['网页端 / API 地址', 'serverUrl', 'url', settings.serverUrl, '例如 http://192.168.1.12:8080'],
      ['登录用户名（可留空）', 'username', 'text', settings.username, ''],
      ['登录密码（可留空）', 'password', 'password', settings.password, ''],
      ['默认下载目录（可选）', 'savePath', 'text', settings.savePath, '留空使用下载器默认目录'],
      ['自定义请求方法', 'httpMethod', 'select', settings.httpMethod],
      ['自定义请求正文', 'httpBody', 'textarea', settings.httpBody],
    ];
    definitions.forEach(([label, name, type, value, placeholder]) => {
      const control = field(label, name, type, value, placeholder);
      controls[name] = control.input; body.appendChild(control.label);
    });
    // The request method shares the select renderer but has its own options.
    controls.httpMethod.replaceChildren();
    ['POST', 'PUT'].forEach((method) => { const option = document.createElement('option'); option.value = method; option.textContent = method; controls.httpMethod.appendChild(option); });
    controls.httpMethod.value = settings.httpMethod || 'POST';
    const help = document.createElement('p'); help.className = 'mtq-set-help';
    help.textContent = '自定义 API 的正文中用 {magnet} 表示当前磁力链接；用户名和密码会作为 HTTP Basic Auth 发送。账号密码默认留空。';
    body.appendChild(help);
    const refreshVisibility = () => {
      const custom = controls.clientType.value === 'custom';
      controls.savePath.closest('label').hidden = custom;
      controls.httpMethod.closest('label').hidden = !custom;
      controls.httpBody.closest('label').hidden = !custom;
    };
    controls.clientType.addEventListener('change', refreshVisibility); refreshVisibility();
    const footer = document.createElement('div'); footer.className = 'mtq-set-footer';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'mtq-set-btn'; cancel.textContent = '取消'; cancel.addEventListener('click', () => backdrop.remove());
    const save = document.createElement('button'); save.type = 'button'; save.className = 'mtq-set-btn primary'; save.textContent = '保存设置';
    save.addEventListener('click', () => {
      const next = {};
      Object.entries(controls).forEach(([key, input]) => { next[key] = input.value.trim(); });
      saveSettings(next); backdrop.remove(); toast('下载器设置已保存，可在其他网页直接使用。');
    });
    footer.append(cancel, save); panel.append(head, body, footer); backdrop.appendChild(panel); document.body.appendChild(backdrop);
    backdrop.addEventListener('click', (event) => { if (event.target === backdrop) backdrop.remove(); });
  }

  GM_registerMenuCommand?.('下载器设置', openSettings);
  addButtons();
  let debounce;
  const observer = new MutationObserver(() => { clearTimeout(debounce); debounce = setTimeout(addButtons, 250); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
