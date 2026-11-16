// 数据层：LocalBackend（本地演示）与 CloudBackend（Supabase），接口一致
(function () {
  const cfg = window.APP_CONFIG;

  // ---------- 通用工具 ----------
  function genOrderNo() {
    const d = new Date();
    const p = (n, l = 2) => String(n).padStart(l, '0');
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) +
      p(d.getMinutes()) + p(d.getSeconds()) + p(Math.floor(Math.random() * 1000), 3);
  }

  // 压缩图片：最长边 maxSize，输出 JPEG Blob
  function compressImage(file, maxSize = 800, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        let { width: w, height: h } = img;
        const s = Math.min(1, maxSize / Math.max(w, h));
        w = Math.round(w * s); h = Math.round(h * s);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? resolve(b) : reject(new Error('图片处理失败')), 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取该图片')); };
      img.src = url;
    });
  }

  function blobToDataURL(blob) {
    return new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  }

  async function sha256(s) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;
  function checkCreds(username, password) {
    if (!USERNAME_RE.test(username || '')) throw new Error('账号需为 3-20 位字母、数字或下划线');
    if (!password || password.length < 6) throw new Error('密码至少 6 位');
  }

  // ---------- 本地演示 ----------
  class LocalBackend {
    constructor() { this.mode = 'local'; this.user = null; }
    _get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }
    _set(k, v) {
      try { localStorage.setItem(k, JSON.stringify(v)); }
      catch { throw new Error('浏览器存储空间不足（演示模式图片存在本地）'); }
    }
    async init() {
      if (!this._get('dc_dishes')) {
        this._set('dc_dishes', window.SEED_DISHES.map((d, i) => ({
          id: i + 1, name: d[0], description: d[1], price: d[2], category: d[3],
          spicy: d[4], featured: d[5], emoji: d[6], image_url: null, sort: i + 1,
        })));
      }
      if (!this._get('dc_users')) {
        // 演示用管理员（仅本地演示模式存在）
        this._set('dc_users', [{
          id: 'local-admin', uid: 100000, username: 'admin', pw: await sha256('admin:123456'),
          nickname: '店长', avatar_url: null, is_admin: true,
        }]);
      }
      const sid = this._get('dc_session');
      this.user = this._pub(this._get('dc_users', []).find(u => u.id === sid));
      return this.user;
    }
    _pub(u) { if (!u) return null; const { pw, ...rest } = u; return rest; }
    async signUp({ username, password, nickname }) {
      checkCreds(username, password);
      const users = this._get('dc_users', []);
      if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) throw new Error('该账号已被注册');
      const uid = Math.max(100000, ...users.map(u => u.uid)) + 1;
      const u = {
        id: 'u' + Date.now(), uid, username, pw: await sha256(username.toLowerCase() + ':' + password),
        nickname: nickname || username, avatar_url: null, is_admin: false,
      };
      users.push(u); this._set('dc_users', users); this._set('dc_session', u.id);
      return (this.user = this._pub(u));
    }
    async signIn({ username, password }) {
      const users = this._get('dc_users', []);
      const u = users.find(x => x.username.toLowerCase() === (username || '').toLowerCase());
      if (!u || u.pw !== await sha256(u.username.toLowerCase() + ':' + password)) throw new Error('账号或密码错误');
      this._set('dc_session', u.id);
      return (this.user = this._pub(u));
    }
    async signOut() { localStorage.removeItem('dc_session'); this.user = null; }
    async changePassword(oldPw, newPw) {
      if (!newPw || newPw.length < 6) throw new Error('新密码至少 6 位');
      const users = this._get('dc_users', []);
      const u = users.find(x => x.id === this.user?.id);
      if (!u) throw new Error('请先登录');
      if (u.pw !== await sha256(u.username.toLowerCase() + ':' + oldPw)) throw new Error('当前密码不正确');
      if (oldPw === newPw) throw new Error('新密码不能与当前密码相同');
      u.pw = await sha256(u.username.toLowerCase() + ':' + newPw);
      this._set('dc_users', users);
    }
    async updateProfile({ nickname, avatarBlob }) {
      const users = this._get('dc_users', []);
      const u = users.find(x => x.id === this.user.id);
      if (nickname !== undefined) u.nickname = nickname;
      if (avatarBlob) u.avatar_url = await blobToDataURL(avatarBlob);
      this._set('dc_users', users);
      return (this.user = this._pub(u));
    }
    async listDishes() { return this._get('dc_dishes', []).sort((a, b) => a.sort - b.sort); }
    async saveDish(d, imageBlob) {
      if (!this.user?.is_admin) throw new Error('无权限');
      const list = this._get('dc_dishes', []);
      if (imageBlob) d.image_url = await blobToDataURL(imageBlob);
      if (d.id) {
        Object.assign(list.find(x => x.id === d.id), d);
      } else {
        d.id = Math.max(0, ...list.map(x => x.id)) + 1;
        d.sort = Math.max(0, ...list.map(x => x.sort)) + 1;
        list.push(d);
      }
      this._set('dc_dishes', list);
      return d;
    }
    async deleteDish(id) {
      if (!this.user?.is_admin) throw new Error('无权限');
      this._set('dc_dishes', this._get('dc_dishes', []).filter(x => x.id !== id));
    }
    async createOrder(o) {
      if (!this.user) throw new Error('请先登录');
      const orders = this._get('dc_orders', []);
      const order = { ...o, id: 'o' + Date.now(), order_no: genOrderNo(), user_id: this.user.id, created_at: new Date().toISOString() };
      orders.push(order); this._set('dc_orders', orders);
      return order;
    }
    _withUser(o) {
      const u = this._get('dc_users', []).find(x => x.id === o.user_id);
      return { ...o, profile: u ? { uid: u.uid, username: u.username, nickname: u.nickname } : null };
    }
    async listOrders() {
      if (!this.user) return [];
      let orders = this._get('dc_orders', []);
      if (!this.user.is_admin) orders = orders.filter(o => o.user_id === this.user.id);
      return orders.sort((a, b) => b.created_at.localeCompare(a.created_at)).map(o => this._withUser(o));
    }
    async getOrder(id) {
      const o = this._get('dc_orders', []).find(x => x.id === id);
      if (!o || (!this.user?.is_admin && o.user_id !== this.user?.id)) return null;
      return this._withUser(o);
    }
  }

  // ---------- Supabase 云端 ----------
  class CloudBackend {
    constructor() {
      this.mode = 'cloud'; this.user = null;
      this.sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    }
    _email(username) { return username.toLowerCase() + '@' + cfg.EMAIL_DOMAIN; }
    async _loadProfile(id) {
      const { data, error } = await this.sb.from('profiles').select('*').eq('id', id).single();
      if (error) throw error;
      return (this.user = data);
    }
    async init() {
      const { data } = await this.sb.auth.getSession();
      const s = data.session;
      if (!s) return (this.user = null);
      try { return await this._loadProfile(s.user.id); } catch { return (this.user = null); }
    }
    async signUp({ username, password, nickname }) {
      checkCreds(username, password);
      const { data, error } = await this.sb.auth.signUp({
        email: this._email(username), password,
        options: { data: { username, nickname: nickname || username } },
      });
      if (error) throw new Error(/registered|exists/i.test(error.message) ? '该账号已被注册' : error.message);
      if (!data.session) throw new Error('注册成功但未自动登录：请在 Supabase 关闭邮箱验证');
      return this._loadProfile(data.user.id);
    }
    async signIn({ username, password }) {
      const { data, error } = await this.sb.auth.signInWithPassword({ email: this._email(username || ''), password });
      if (error) throw new Error('账号或密码错误');
      return this._loadProfile(data.user.id);
    }
    async signOut() { await this.sb.auth.signOut(); this.user = null; }
    async changePassword(oldPw, newPw) {
      if (!newPw || newPw.length < 6) throw new Error('新密码至少 6 位');
      if (!this.user) throw new Error('请先登录');
      // 先用当前密码验证身份
      const { error: e1 } = await this.sb.auth.signInWithPassword({ email: this._email(this.user.username), password: oldPw });
      if (e1) throw new Error('当前密码不正确');
      if (oldPw === newPw) throw new Error('新密码不能与当前密码相同');
      const { error } = await this.sb.auth.updateUser({ password: newPw });
      if (error) {
        if (/same|different/i.test(error.message)) throw new Error('新密码不能与当前密码相同');
        if (/weak|short|characters/i.test(error.message)) throw new Error('新密码太简单，请换一个');
        throw new Error('修改失败：' + error.message);
      }
    }
    async _upload(folder, blob) {
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error } = await this.sb.storage.from('images').upload(path, blob, { contentType: 'image/jpeg' });
      if (error) throw new Error('图片上传失败：' + error.message);
      return this.sb.storage.from('images').getPublicUrl(path).data.publicUrl;
    }
    async updateProfile({ nickname, avatarBlob }) {
      const patch = {};
      if (nickname !== undefined) patch.nickname = nickname;
      if (avatarBlob) patch.avatar_url = await this._upload('avatars/' + this.user.id, avatarBlob);
      const { data, error } = await this.sb.from('profiles').update(patch).eq('id', this.user.id).select().single();
      if (error) throw new Error(error.message);
      return (this.user = data);
    }
    async listDishes() {
      const { data, error } = await this.sb.from('dishes').select('*').order('sort').order('id');
      if (error) throw new Error('菜单加载失败：' + error.message);
      return data.map(d => ({ ...d, price: Number(d.price) }));
    }
    async saveDish(d, imageBlob) {
      const row = { ...d };
      if (imageBlob) row.image_url = await this._upload('dishes', imageBlob);
      let res;
      if (row.id) {
        const { id, created_at, ...patch } = row;
        res = await this.sb.from('dishes').update(patch).eq('id', id).select().single();
      } else {
        delete row.id;
        res = await this.sb.from('dishes').insert(row).select().single();
      }
      if (res.error) throw new Error(/PGRST116|row-level security/.test(res.error.code + res.error.message) ? '无权限修改菜品' : res.error.message);
      return res.data;
    }
    async deleteDish(id) {
      const { error } = await this.sb.from('dishes').delete().eq('id', id);
      if (error) throw new Error(error.message);
    }
    async createOrder(o) {
      const { data, error } = await this.sb.from('orders')
        .insert({ ...o, order_no: genOrderNo(), user_id: this.user.id }).select().single();
      if (error) throw new Error('提交失败：' + error.message);
      return data;
    }
    _norm(o) { return { ...o, total: Number(o.total) }; }
    async listOrders() {
      if (!this.user) return [];
      const { data, error } = await this.sb.from('orders')
        .select('*, profile:profiles(uid, username, nickname)').order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data.map(o => this._norm(o));
    }
    async getOrder(id) {
      const { data } = await this.sb.from('orders')
        .select('*, profile:profiles(uid, username, nickname)').eq('id', id).maybeSingle();
      return data ? this._norm(data) : null;
    }
  }

  window.compressImage = compressImage;
  // ?local=1 强制本地演示（只用本浏览器存储，便于测试，不碰线上数据）
  const forceLocal = new URLSearchParams(location.search).get('local') === '1';
  window.backend = (!forceLocal && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) ? new CloudBackend() : new LocalBackend();
})();
