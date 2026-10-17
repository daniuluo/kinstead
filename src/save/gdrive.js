// Google Drive cloud saves using Google Identity Services (OAuth token flow)
// and the Drive v3 REST API. Uses the narrow `drive.file` scope, so the game
// can only see files it created itself, kept in a "Hearthvale Saves" folder.

import { CONFIG } from '../config.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const FOLDER = 'Hearthvale Saves';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const CLIENT_KEY = 'hearthvale.googleClientId';

export class Drive {
  constructor() {
    this.token = null;
    this.expiresAt = 0;
    this.folder = null;
    this.tokenClient = null;
    this._gis = null;
  }

  get clientId() {
    let stored = '';
    try { stored = localStorage.getItem(CLIENT_KEY) || ''; } catch {}
    return (CONFIG.GOOGLE_CLIENT_ID || stored || '').trim();
  }
  setClientId(id) {
    try { localStorage.setItem(CLIENT_KEY, (id || '').trim()); } catch {}
    this.tokenClient = null;
  }
  get configured() { return !!this.clientId; }
  get connected() { return !!this.token && Date.now() < this.expiresAt; }

  _loadGis() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (this._gis) return this._gis;
    this._gis = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { this._gis = null; reject(new Error('Could not load Google sign-in. Check your connection.')); };
      document.head.appendChild(s);
    });
    return this._gis;
  }

  async connect(interactive = true) {
    if (!this.configured) throw new Error('No Google OAuth Client ID configured.');
    await this._loadGis();
    if (!this.tokenClient) {
      this.tokenClient = google.accounts.oauth2.initTokenClient({ client_id: this.clientId, scope: SCOPE, callback: () => {} });
    }
    const resp = await new Promise((resolve, reject) => {
      this.tokenClient.callback = (r) => (r.error ? reject(new Error(r.error_description || r.error)) : resolve(r));
      this.tokenClient.error_callback = (e) => reject(new Error(e.message || e.type || 'Sign-in was cancelled.'));
      this.tokenClient.requestAccessToken({ prompt: interactive && !this.token ? 'consent' : '' });
    });
    this.token = resp.access_token;
    this.expiresAt = Date.now() + (Number(resp.expires_in || 3600) - 60) * 1000;
    return true;
  }

  disconnect() {
    if (this.token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(this.token, () => {});
    this.token = null;
    this.expiresAt = 0;
    this.folder = null;
  }

  async _req(url, opts = {}, retry = true) {
    if (!this.connected) await this.connect(false);
    const res = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: `Bearer ${this.token}` } });
    if (res.status === 401 && retry) {
      this.token = null;
      await this.connect(false);
      return this._req(url, opts, false);
    }
    if (!res.ok) {
      let msg = `Google Drive error ${res.status}`;
      try { const j = await res.json(); msg = j.error?.message || msg; } catch {}
      throw new Error(msg);
    }
    return res;
  }

  async _folderId() {
    if (this.folder) return this.folder;
    const q = encodeURIComponent(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const res = await this._req(`${API}/files?q=${q}&fields=files(id,name)&spaces=drive`);
    const j = await res.json();
    if (j.files && j.files.length) { this.folder = j.files[0].id; return this.folder; }
    const mk = await this._req(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }),
    });
    this.folder = (await mk.json()).id;
    return this.folder;
  }

  async list() {
    const folder = await this._folderId();
    const q = encodeURIComponent(`'${folder}' in parents and trashed=false`);
    const res = await this._req(`${API}/files?q=${q}&orderBy=modifiedTime desc&pageSize=50&fields=files(id,name,modifiedTime,appProperties)`);
    return (await res.json()).files || [];
  }

  async save(data, existingId = null) {
    const folder = await this._folderId();
    const meta = {
      name: `${data.name} — Day ${data.meta.day}.hearthvale.json`,
      mimeType: 'application/json',
      appProperties: { town: String(data.name).slice(0, 60), day: String(data.meta.day), pop: String(data.meta.pop), money: String(data.meta.money) },
    };
    if (!existingId) meta.parents = [folder];
    const boundary = 'hv' + Math.random().toString(36).slice(2);
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`;
    const url = existingId
      ? `${UPLOAD}/files/${existingId}?uploadType=multipart&fields=id,name,modifiedTime`
      : `${UPLOAD}/files?uploadType=multipart&fields=id,name,modifiedTime`;
    const res = await this._req(url, { method: existingId ? 'PATCH' : 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
    return res.json();
  }

  async load(id) {
    const res = await this._req(`${API}/files/${id}?alt=media`);
    return res.json();
  }

  async remove(id) {
    await this._req(`${API}/files/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) });
  }
}
