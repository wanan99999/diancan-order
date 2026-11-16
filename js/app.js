(function () {
  const cfg = window.APP_CONFIG;
  const api = window.backend;
  const $app = document.getElementById('app');
  const $float = document.getElementById('float-root');
  const $tabbar = document.getElementById('tabbar');
  const params = new URLSearchParams(location.search);
  const FONTS = ['kuaile', 'mashanzheng', 'zhimangxing', 'huangyou', 'longcang'];
  const font = FONTS.includes(params.get('font')) ? params.get('font') : cfg.BRAND_FONT;
  const cartStyle = ['float', 'bar'].includes(params.get('cart')) ? params.get('cart') : cfg.CART_STYLE;
  document.documentElement.dataset.font = font;
  document.documentElement.dataset.cart = cartStyle;
  const brandBg = /^[0-7]$/.test(params.get('bg') || '') ? params.get('bg') : String(cfg.BRAND_BG || '0');

  const S = { dishes: [], cat: 'all', cart: loadCart(), cartOpen: false };

  // ---------- 工具 ----------
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => (Math.round(Number(n) * 100) / 100).toFixed(2).replace(/\.00$/, '');
  const spicy = n => n > 0 ? `<span class="spicy" title="${['', '微辣', '中辣', '特辣'][n]}">${'🌶️'.repeat(n)}</span>` : '';
  const fmtTime = iso => {
    const d = new Date(iso), p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const isAdmin = () => !!api.user?.is_admin;
  const catName = k => (window.CATEGORIES.find(c => c.key === k) || {}).name || '';

  function dishImg(d, cls = 'dish-img-inner') {
    if (d.image_url) return `<img class="${cls}" src="${esc(d.image_url)}" alt="${esc(d.name)}" loading="lazy">`;
    return `<div class="${cls} ph ph-${esc(d.category)}"><span>${esc(d.emoji || '🍽️')}</span></div>`;
  }
  function avatar(u, size = '') {
    if (u?.avatar_url) return `<img class="avatar ${size}" src="${esc(u.avatar_url)}" alt="头像">`;
    const ch = u ? esc((u.nickname || u.username || '?').slice(0, 1)) : '👤';
    return `<div class="avatar ${size} avatar-ph">${ch}</div>`;
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 1800);
  }

  function modal(html, onMount) {
    const m = document.createElement('div');
    m.className = 'modal-mask';
    m.innerHTML = `<div class="modal">${html}</div>`;
    document.body.appendChild(m);
    document.body.classList.add('no-scroll');
    const close = () => { m.remove(); if (!document.querySelector('.modal-mask')) document.body.classList.remove('no-scroll'); };
    m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) close(); });
    onMount && onMount(m.querySelector('.modal'), close);
    return close;
  }
  function confirmBox(text, okText = '确定') {
    return new Promise(res => {
      modal(`<div class="confirm"><p>${esc(text)}</p><div class="btn-row">
        <button class="btn ghost" data-close>取消</button><button class="btn primary" data-ok>${esc(okText)}</button></div></div>`,
        (el, close) => {
          el.querySelector('[data-ok]').onclick = () => { close(); res(true); };
          el.parentElement.addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target === el.parentElement) res(false); });
        });
    });
  }
  // 1:1 裁剪：拖动平移，滑块/滚轮/双指缩放；返回 JPEG Blob，取消返回 null
  function cropImage(file, { outSize = 800, round = false, title = '裁剪图片' } = {}) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('无法读取该图片')); };
      img.onload = () => {
        const m = document.createElement('div');
        m.className = 'crop-mask';
        m.innerHTML = `
          <div class="crop-top"><button data-c="cancel">取消</button><b>${esc(title)}</b><button class="crop-ok" data-c="ok">完成</button></div>
          <div class="crop-stage"><div class="crop-box ${round ? 'round' : ''}"><div class="grid"></div></div></div>
          <div class="crop-bottom">
            <div class="crop-zoom"><span>－</span><input type="range" min="1" max="4" step="0.01" value="1" aria-label="缩放"><span>＋</span></div>
            <div class="crop-tip">拖动调整位置，双指或滑块缩放</div>
          </div>`;
        document.body.appendChild(m);
        document.body.classList.add('no-scroll');
        const box = m.querySelector('.crop-box'), slider = m.querySelector('input');
        box.prepend(img);
        const W = img.naturalWidth, H = img.naturalHeight, S = box.clientWidth;
        const minScale = Math.max(S / W, S / H);
        let scale = minScale, tx = (S - W * scale) / 2, ty = (S - H * scale) / 2;
        const clamp = () => {
          tx = Math.min(0, Math.max(S - W * scale, tx));
          ty = Math.min(0, Math.max(S - H * scale, ty));
        };
        const draw = () => { clamp(); img.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; slider.value = scale / minScale; };
        const zoomTo = (ns, px = S / 2, py = S / 2) => {
          ns = Math.min(minScale * 4, Math.max(minScale, ns));
          tx = px - (px - tx) * ns / scale; ty = py - (py - ty) * ns / scale; scale = ns; draw();
        };
        img.style.width = W + 'px'; img.style.height = H + 'px';
        draw();

        // 拖动 / 双指缩放
        const pts = new Map(); let last = null;
        const rel = e => { const r = box.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
        const snapshot = () => {
          const p = [...pts.values()];
          if (p.length === 1) return { x: p[0][0], y: p[0][1] };
          const [a, b] = p;
          return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, d: Math.hypot(a[0] - b[0], a[1] - b[1]) };
        };
        box.addEventListener('pointerdown', e => { box.setPointerCapture(e.pointerId); pts.set(e.pointerId, rel(e)); last = snapshot(); });
        box.addEventListener('pointermove', e => {
          if (!pts.has(e.pointerId)) return;
          pts.set(e.pointerId, rel(e));
          const cur = snapshot();
          if (last && cur.d && last.d) zoomTo(scale * cur.d / last.d, cur.x, cur.y);
          if (last) { tx += cur.x - last.x; ty += cur.y - last.y; draw(); }
          last = cur;
        });
        const up = e => { pts.delete(e.pointerId); last = pts.size ? snapshot() : null; };
        box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
        box.addEventListener('wheel', e => { e.preventDefault(); const [x, y] = rel(e); zoomTo(scale * (e.deltaY < 0 ? 1.1 : 1 / 1.1), x, y); }, { passive: false });
        slider.addEventListener('input', () => zoomTo(minScale * Number(slider.value)));

        const done = blob => {
          m.remove(); URL.revokeObjectURL(url);
          if (!document.querySelector('.modal-mask')) document.body.classList.remove('no-scroll');
          resolve(blob);
        };
        m.querySelector('[data-c=cancel]').onclick = () => done(null);
        m.querySelector('[data-c=ok]').onclick = () => {
          const c = document.createElement('canvas');
          const out = Math.min(outSize, Math.round(S / scale)) || outSize; // 不放大到超过原图分辨率
          c.width = c.height = out;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, out, out);
          ctx.drawImage(img, -tx / scale, -ty / scale, S / scale, S / scale, 0, 0, out, out);
          c.toBlob(b => b ? done(b) : reject(new Error('图片处理失败')), 'image/jpeg', 0.86);
        };
      };
      img.src = url;
    });
  }

  function pickImage() {
    return new Promise(res => {
      const i = document.createElement('input');
      i.type = 'file'; i.accept = 'image/*';
      i.onchange = () => res(i.files[0] || null);
      i.click();
    });
  }

  // ---------- 购物车 ----------
  function loadCart() { try { return JSON.parse(localStorage.getItem('dc_cart')) || {}; } catch { return {}; } }
  function saveCart() { try { localStorage.setItem('dc_cart', JSON.stringify(S.cart)); } catch { } }
  function cartLines() {
    return Object.entries(S.cart)
      .map(([id, qty]) => ({ dish: S.dishes.find(d => String(d.id) === id), qty }))
      .filter(l => l.dish && l.qty > 0);
  }
  function cartSummary() {
    const lines = cartLines();
    return { lines, count: lines.reduce((s, l) => s + l.qty, 0), total: lines.reduce((s, l) => s + l.qty * l.dish.price, 0) };
  }
  function changeQty(id, delta) {
    const k = String(id);
    const q = Math.max(0, (S.cart[k] || 0) + delta);
    if (q) S.cart[k] = Math.min(q, 99); else delete S.cart[k];
    saveCart();
    refreshCartUI(id);
  }
  function qtyCtl(id) {
    const q = S.cart[String(id)] || 0;
    if (!q) return `<button class="qbtn add" data-act="inc" data-id="${id}" aria-label="加入购物车">+</button>`;
    return `<div class="qty"><button class="qbtn minus" data-act="dec" data-id="${id}" aria-label="减少">−</button>
      <span class="qnum">${q}</span><button class="qbtn add" data-act="inc" data-id="${id}" aria-label="增加">+</button></div>`;
  }
  function refreshCartUI(changedId) {
    if (changedId !== undefined) {
      document.querySelectorAll(`.ctl[data-for="${changedId}"]`).forEach(el => el.innerHTML = qtyCtl(changedId));
    } else {
      document.querySelectorAll('.ctl[data-for]').forEach(el => el.innerHTML = qtyCtl(el.dataset.for));
    }
    // 分类角标
    document.querySelectorAll('.cat[data-cat]').forEach(el => {
      const n = cartLines().filter(l => inCat(l.dish, el.dataset.cat)).reduce((s, l) => s + l.qty, 0);
      const b = el.querySelector('.cat-badge');
      b.textContent = n; b.hidden = !n || el.dataset.cat === 'all';
    });
    renderFloat();
  }
  const inCat = (d, cat) => cat === 'all' || (cat === 'featured' ? d.featured : d.category === cat);

  // ---------- 悬浮购物车/结账 ----------
  function renderFloat() {
    if (currentRoute().name !== 'menu') { $float.innerHTML = ''; return; }
    const { lines, count, total } = cartSummary();
    const panel = S.cartOpen ? `
      <div class="cart-mask" data-act="close-cart"></div>
      <div class="cart-panel">
        <div class="cart-head"><b>已选菜品</b><span class="muted">共 ${count} 件</span>
          <button class="link danger" data-act="clear-cart">🗑 一键清空</button></div>
        <div class="cart-list">${lines.length ? lines.map(l => `
          <div class="cart-line">
            ${dishImg(l.dish, 'cart-thumb')}
            <div class="cart-info"><div class="cart-name">${esc(l.dish.name)}${spicy(l.dish.spicy)}</div>
              <div class="price">¥${money(l.dish.price)}</div></div>
            <div class="ctl" data-for="${l.dish.id}">${qtyCtl(l.dish.id)}</div>
          </div>`).join('') : '<div class="empty small">购物车还是空的，去挑几道菜吧~</div>'}
        </div>
        <div class="cart-foot"><span>合计 <b class="price big">¥${money(total)}</b></span>
          <button class="btn primary" data-act="checkout" ${count ? '' : 'disabled'}>去结账</button></div>
      </div>` : '';

    const badge = count ? `<span class="badge">${count > 99 ? '99+' : count}</span>` : '';
    const cartIcon = `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.4a1 1 0 0 0 1 .8h9.7a1 1 0 0 0 1-.8L21 7H6"/></svg>`;
    let ctrls;
    if (cartStyle === 'bar') {
      ctrls = `<div class="cart-bar ${S.cartOpen ? 'open' : ''}">
        <button class="bar-cart" data-act="toggle-cart" aria-label="购物车">${cartIcon}${badge}</button>
        <div class="bar-total" data-act="toggle-cart">${count ? `<b>¥${money(total)}</b>` : '<span class="muted">未选购菜品</span>'}</div>
        <button class="bar-go" data-act="checkout" ${count ? '' : 'disabled'}>去结账</button></div>`;
    } else {
      ctrls = `<button class="fab-cart ${S.cartOpen ? 'open' : ''}" data-act="toggle-cart" aria-label="购物车">${cartIcon}${badge}</button>
        <button class="fab-checkout" data-act="checkout">去结账${count ? ` ¥${money(total)}` : ''}</button>`;
    }
    $float.innerHTML = panel + ctrls;
    document.body.classList.toggle('no-scroll', S.cartOpen);
  }

  // ---------- 页面：点餐 ----------
  function viewMenu() {
    const cats = window.CATEGORIES;
    const list = S.dishes.filter(d => inCat(d, S.cat));
    $app.innerHTML = `
      <header class="brand bg-${brandBg}">
        <h1 class="brand-name">家家点餐咯</h1>
        <p class="brand-slogan">吃好喝好每天都好~</p>
        ${api.mode === 'local' ? '<span class="mode-tag">演示模式</span>' : ''}
      </header>
      <div class="menu">
        <aside class="cats">${cats.map(c => `
          <button class="cat ${c.key === S.cat ? 'active' : ''}" data-cat="${c.key}">
            <span>${esc(c.name)}</span><i class="cat-badge" hidden></i></button>`).join('')}
        </aside>
        <main class="dishes">
          <div class="cat-title">${esc(catName(S.cat))}<span class="muted"> · ${list.length} 道</span></div>
          <div class="grid">
            ${list.map(d => `
              <div class="dish">
                <div class="dish-img">${dishImg(d)}
                  ${d.featured && S.cat !== 'featured' ? '<span class="tag-hot">招牌</span>' : ''}
                  ${isAdmin() ? `<button class="edit-btn" data-act="edit" data-id="${d.id}" aria-label="编辑">✎</button>` : ''}</div>
                <div class="dish-body">
                  <div class="dish-name">${esc(d.name)}${spicy(d.spicy)}</div>
                  <div class="dish-desc">${esc(d.description)}</div>
                  <div class="dish-foot"><span class="price">¥<b>${money(d.price)}</b></span>
                    <div class="ctl" data-for="${d.id}">${qtyCtl(d.id)}</div></div>
                </div>
              </div>`).join('')}
            ${isAdmin() ? `<button class="dish add-dish" data-act="new"><span>+</span><small>新增菜品</small></button>` : ''}
          </div>
          ${!list.length && !isAdmin() ? '<div class="empty">该分类暂无菜品</div>' : ''}
        </main>
      </div>`;
    refreshCartUI();
  }

  function editDish(d) {
    const isNew = !d;
    d = d ? { ...d } : { name: '', description: '', price: '', category: S.cat === 'all' || S.cat === 'featured' ? 'hot' : S.cat, spicy: 0, featured: S.cat === 'featured', emoji: '🍽️', image_url: null };
    let blob = null;
    modal(`
      <div class="form">
        <h3>${isNew ? '新增菜品' : '编辑菜品'}</h3>
        <div class="img-pick" data-pick>${dishImg(d, 'pick-inner')}<span class="pick-tip">点击更换图片</span></div>
        <label>名称<input name="name" maxlength="20" value="${esc(d.name)}" placeholder="如：红烧肉"></label>
        <label>简介<input name="description" maxlength="30" value="${esc(d.description)}" placeholder="一句话介绍"></label>
        <div class="row2">
          <label>价格（元）<input name="price" type="number" inputmode="decimal" min="0" step="0.5" value="${esc(d.price)}"></label>
          <label>分类<select name="category">${window.CATEGORIES.filter(c => !['all', 'featured'].includes(c.key))
            .map(c => `<option value="${c.key}" ${c.key === d.category ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        </div>
        <div class="field-label">辣度</div>
        <div class="seg" data-spicy>${['不辣', '微辣', '中辣', '特辣']
          .map((t, i) => `<button type="button" data-v="${i}" class="${i === d.spicy ? 'on' : ''}"><span class="seg-pep">${'🌶️'.repeat(i) || '—'}</span>${t}</button>`).join('')}</div>
        <label class="check"><input type="checkbox" name="featured" ${d.featured ? 'checked' : ''}> 设为🔥招牌推荐</label>
        <div class="btn-row">
          ${isNew ? '<button class="btn ghost" data-close>取消</button>' : '<button class="btn ghost danger" data-del>删除</button>'}
          <button class="btn primary" data-save>保存</button>
        </div>
      </div>`, (el, close) => {
      el.querySelector('[data-pick]').onclick = async () => {
        const f = await pickImage(); if (!f) return;
        try {
          const cropped = await cropImage(f, { outSize: 800, title: '裁剪菜品图片' });
          if (!cropped) return;
          blob = cropped;
          el.querySelector('.pick-inner').outerHTML = `<img class="pick-inner" src="${URL.createObjectURL(blob)}">`;
        } catch (e) { toast(e.message); }
      };
      el.querySelectorAll('[data-spicy] button').forEach(b => b.onclick = () => {
        el.querySelectorAll('[data-spicy] button').forEach(x => x.classList.remove('on'));
        b.classList.add('on'); d.spicy = Number(b.dataset.v);
      });
      el.querySelector('[data-save]').onclick = async e => {
        const f = n => el.querySelector(`[name="${n}"]`);
        const row = {
          ...d, name: f('name').value.trim(), description: f('description').value.trim(),
          price: Number(f('price').value), category: f('category').value, featured: f('featured').checked,
        };
        if (!row.name) return toast('请填写菜品名称');
        if (!(row.price >= 0) || f('price').value === '') return toast('请填写正确的价格');
        e.target.disabled = true; e.target.textContent = '保存中…';
        try { await api.saveDish(row, blob); close(); await reloadDishes(); toast('已保存'); }
        catch (err) { toast(err.message); e.target.disabled = false; e.target.textContent = '保存'; }
      };
      const del = el.querySelector('[data-del]');
      if (del) del.onclick = async () => {
        if (!await confirmBox(`确定删除「${d.name}」吗？`, '删除')) return;
        try { await api.deleteDish(d.id); close(); delete S.cart[String(d.id)]; saveCart(); await reloadDishes(); toast('已删除'); }
        catch (err) { toast(err.message); }
      };
    });
  }

  async function reloadDishes() {
    S.dishes = await api.listDishes();
    if (currentRoute().name === 'menu') viewMenu();
  }

  // ---------- 页面：结账 ----------
  let people = 1, remark = '';
  function viewCheckout() {
    const { lines, count, total } = cartSummary();
    if (!count) {
      $app.innerHTML = `${subHeader('确认订单', '#/menu')}<div class="empty">购物车是空的<br><a class="btn primary" href="#/menu">去点餐</a></div>`;
      return;
    }
    $app.innerHTML = `${subHeader('确认订单', '#/menu')}
      <div class="page checkout">
        ${api.user ? '' : `<div class="card notice">提交订单需要先登录 <a class="btn small primary" href="#/login?next=checkout">去登录</a></div>`}
        <div class="card">
          <div class="card-title">已选菜品 <span class="muted">共 ${count} 件</span></div>
          ${lines.map(l => `
            <div class="co-line">${dishImg(l.dish, 'co-thumb')}
              <div class="co-info"><div>${esc(l.dish.name)}${spicy(l.dish.spicy)}</div><div class="muted">¥${money(l.dish.price)} × ${l.qty}</div></div>
              <div class="co-sub">¥${money(l.dish.price * l.qty)}</div></div>`).join('')}
          <div class="co-total">小计 <b class="price big">¥${money(total)}</b></div>
        </div>
        <div class="card">
          <div class="field-row"><span>用餐人数</span>
            <div class="qty stepper"><button class="qbtn minus" data-act="ppl-" ${people <= 1 ? 'disabled' : ''}>−</button>
              <span class="qnum">${people} 人</span><button class="qbtn add" data-act="ppl+">+</button></div></div>
          <label class="field-col">备注<textarea id="remark" maxlength="100" rows="3" placeholder="口味、忌口等要求（选填）">${esc(remark)}</textarea></label>
        </div>
        <div class="card muted small-text">本站为演示点餐，不涉及真实支付，提交即下单成功。</div>
      </div>
      <div class="submit-bar"><span>合计 <b class="price big">¥${money(total)}</b></span>
        <button class="btn primary" data-act="submit">提交订单</button></div>`;
    document.getElementById('remark').oninput = e => remark = e.target.value;
  }

  async function submitOrder(btn) {
    if (!api.user) { location.hash = '#/login?next=checkout'; return; }
    const { lines, count, total } = cartSummary();
    if (!count) return;
    btn.disabled = true; btn.textContent = '提交中…';
    try {
      await api.createOrder({
        items: lines.map(l => ({ id: l.dish.id, name: l.dish.name, price: l.dish.price, qty: l.qty, image_url: l.dish.image_url, emoji: l.dish.emoji, category: l.dish.category, spicy: l.dish.spicy })),
        item_count: count, total: Math.round(total * 100) / 100, people, remark: remark.trim(),
      });
      S.cart = {}; saveCart(); people = 1; remark = '';
      toast('下单成功！');
      location.hash = '#/orders';
    } catch (e) { toast(e.message); btn.disabled = false; btn.textContent = '提交订单'; }
  }

  // ---------- 页面：订单 ----------
  async function viewOrders() {
    $app.innerHTML = `<div class="page-title">${isAdmin() ? '全部订单' : '我的订单'}</div>`;
    if (!api.user) {
      $app.innerHTML += `<div class="empty">登录后查看历史订单<br><a class="btn primary" href="#/login?next=orders">去登录</a></div>`;
      return;
    }
    $app.innerHTML += '<div class="empty muted">加载中…</div>';
    let orders;
    try { orders = await api.listOrders(); } catch (e) { $app.querySelector('.empty').textContent = e.message; return; }
    if (currentRoute().name !== 'orders') return;
    $app.innerHTML = `<div class="page-title">${isAdmin() ? '全部订单' : '我的订单'}<span class="muted"> · ${orders.length} 单</span></div>
      <div class="page">${orders.length ? orders.map(o => {
        const items = o.items || [];
        return `<a class="card order-card" href="#/order/${o.id}">
          <div class="oc-top"><span>订单号 ${esc(o.order_no)}</span><span class="muted">${fmtTime(o.created_at)}</span></div>
          ${isAdmin() ? `<div class="oc-user">👤 ${esc(o.profile?.nickname || '未知')} <span class="muted">ID ${esc(o.profile?.uid ?? '-')}</span></div>` : ''}
          <div class="oc-thumbs">${items.slice(0, 4).map(i => `<div class="oc-thumb">${dishImg(i, 'oc-img')}<span>${esc(i.name)}</span></div>`).join('')}
            ${items.length > 4 ? `<div class="oc-more">+${items.length - 4}</div>` : ''}</div>
          <div class="oc-bottom"><span class="muted">共 ${o.item_count} 件</span><span>实付 <b class="price">¥${money(o.total)}</b> ›</span></div>
        </a>`;
      }).join('') : `<div class="empty">还没有订单<br><a class="btn primary" href="#/menu">去点餐</a></div>`}</div>`;
  }

  async function viewOrderDetail(id) {
    $app.innerHTML = `${subHeader('订单详情', '#/orders')}<div class="empty muted">加载中…</div>`;
    const o = api.user ? await api.getOrder(id) : null;
    if (currentRoute().name !== 'order') return;
    if (!o) { $app.innerHTML = `${subHeader('订单详情', '#/orders')}<div class="empty">订单不存在或无权查看</div>`; return; }
    $app.innerHTML = `${subHeader('订单详情', '#/orders')}
      <div class="page">
        <div class="card done-card"><div class="done-icon">✓</div><div><b>下单成功</b><div class="muted">${fmtTime(o.created_at)}</div></div></div>
        <div class="card">
          <div class="card-title">菜品明细 <span class="muted">共 ${o.item_count} 件</span></div>
          ${(o.items || []).map(i => `
            <div class="co-line">${dishImg(i, 'co-thumb')}
              <div class="co-info"><div>${esc(i.name)}${spicy(i.spicy)}</div><div class="muted">¥${money(i.price)} × ${i.qty}</div></div>
              <div class="co-sub">¥${money(i.price * i.qty)}</div></div>`).join('')}
          <div class="co-total">合计 <b class="price big">¥${money(o.total)}</b></div>
        </div>
        <div class="card kv">
          <div><span>订单编号</span><span>${esc(o.order_no)}</span></div>
          <div><span>下单时间</span><span>${fmtTime(o.created_at)}</span></div>
          <div><span>用餐人数</span><span>${esc(o.people)} 人</span></div>
          <div><span>下单账户</span><span>${esc(o.profile?.nickname || '-')}（ID ${esc(o.profile?.uid ?? '-')}）</span></div>
          <div><span>备注</span><span>${esc(o.remark || '无')}</span></div>
        </div>
        <a class="btn primary block" href="#/menu">再来一单</a>
      </div>`;
  }

  // ---------- 页面：我的 ----------
  function viewMe() {
    const u = api.user;
    if (!u) {
      $app.innerHTML = `<div class="me-head" onclick="location.hash='#/login?next=me'">
          ${avatar(null, 'lg')}<div class="me-info"><div class="me-name">未登录</div><div class="me-sub">点击登录 / 注册</div></div><span class="chev">›</span></div>
        ${modeNote()}`;
      return;
    }
    $app.innerHTML = `
      <div class="me-head">
        <button class="avatar-btn" data-act="avatar" aria-label="更换头像">${avatar(u, 'lg')}<span class="cam">📷</span></button>
        <div class="me-info">
          <button class="me-name" data-act="rename">${esc(u.nickname)} <span class="pen">✎</span></button>
          <div class="me-sub">ID：${esc(u.uid)}${u.is_admin ? ' <span class="admin-tag">管理员</span>' : ''}</div>
          <div class="me-sub">账号：${esc(u.username)}</div>
        </div>
      </div>
      <div class="page">
        <div class="card list">
          <a href="#/orders">📋 ${u.is_admin ? '全部订单' : '我的订单'}<span class="chev">›</span></a>
          ${u.is_admin ? '<a href="#/menu">🍳 管理菜单（在点餐页点 ✎ 编辑 / 末尾 + 新增）<span class="chev">›</span></a>' : ''}
        </div>
        <button class="btn ghost block" data-act="logout">退出登录</button>
      </div>
      ${modeNote()}`;
  }
  const modeNote = () => api.mode === 'local'
    ? '<p class="mode-note">当前为本地演示模式：数据只保存在本浏览器。<br>演示管理员账号 admin / 123456</p>' : '';

  async function changeAvatar() {
    const f = await pickImage(); if (!f) return;
    try {
      const b = await cropImage(f, { outSize: 400, round: true, title: '裁剪头像' });
      if (!b) return;
      await api.updateProfile({ avatarBlob: b }); viewMe(); toast('头像已更新'); }
    catch (e) { toast(e.message); }
  }
  function renameDialog() {
    modal(`<div class="form"><h3>修改名称</h3>
      <label><input name="nick" maxlength="16" value="${esc(api.user.nickname)}"></label>
      <div class="btn-row"><button class="btn ghost" data-close>取消</button><button class="btn primary" data-save>保存</button></div></div>`,
      (el, close) => {
        const inp = el.querySelector('input'); inp.focus(); inp.select();
        el.querySelector('[data-save]').onclick = async () => {
          const v = inp.value.trim(); if (!v) return toast('名称不能为空');
          try { await api.updateProfile({ nickname: v }); close(); viewMe(); toast('已修改'); } catch (e) { toast(e.message); }
        };
      });
  }

  // ---------- 页面：登录/注册 ----------
  let loginTab = 'login';
  function viewLogin(next) {
    const reg = loginTab === 'reg';
    $app.innerHTML = `${subHeader(reg ? '注册' : '登录', '#/' + (next === 'checkout' ? 'checkout' : 'me'))}
      <div class="page login">
        <div class="login-brand brand-name">家家点餐咯</div>
        <div class="tabs"><button class="${reg ? '' : 'on'}" data-tab="login">登录</button><button class="${reg ? 'on' : ''}" data-tab="reg">注册</button></div>
        <form class="form" id="auth-form" autocomplete="on">
          <label>账号<input name="username" autocomplete="username" placeholder="3-20 位字母、数字或下划线" required></label>
          ${reg ? '<label>昵称<input name="nickname" maxlength="16" placeholder="选填，默认同账号"></label>' : ''}
          <label>密码<input name="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" placeholder="至少 6 位" required></label>
          ${reg ? '<label>确认密码<input name="password2" type="password" autocomplete="new-password" required></label>' : ''}
          <button class="btn primary block" type="submit">${reg ? '注册并登录' : '登录'}</button>
        </form>
        ${modeNote()}
      </div>`;
    document.getElementById('auth-form').onsubmit = async e => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      fd.username = (fd.username || '').trim();
      if (reg && fd.password !== fd.password2) return toast('两次密码不一致');
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        if (reg) await api.signUp(fd); else await api.signIn(fd);
        toast(reg ? '注册成功' : '登录成功');
        location.hash = '#/' + (next || 'me');
      } catch (err) { toast(err.message); btn.disabled = false; }
    };
  }

  const subHeader = (title, back) => `<div class="sub-header"><a class="back" href="${back}" aria-label="返回">‹</a><span>${esc(title)}</span></div>`;

  // ---------- 路由 ----------
  function currentRoute() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, q] = h.split('?');
    const parts = path.split('/');
    return { name: parts[0] || 'menu', arg: parts[1], query: new URLSearchParams(q || '') };
  }
  function route() {
    const r = currentRoute();
    if (r.name !== 'menu') S.cartOpen = false;
    const tab = { menu: 'menu', orders: 'orders', order: 'orders', me: 'me' }[r.name];
    $tabbar.hidden = !['menu', 'orders', 'me'].includes(r.name);
    document.body.dataset.route = r.name;
    $tabbar.querySelectorAll('a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
    document.body.classList.remove('no-scroll');
    if (r.name !== 'menu') window.scrollTo(0, 0);
    switch (r.name) {
      case 'checkout': viewCheckout(); break;
      case 'orders': viewOrders(); break;
      case 'order': viewOrderDetail(r.arg); break;
      case 'me': viewMe(); break;
      case 'login': if (api.user) { location.hash = '#/me'; return; } viewLogin(r.query.get('next')); break;
      default: viewMenu();
    }
    renderFloat();
  }

  // ---------- 事件委托 ----------
  document.addEventListener('click', async e => {
    const cat = e.target.closest('.cat[data-cat]');
    if (cat) {
      S.cat = cat.dataset.cat; viewMenu();
      const top = document.querySelector('.menu').offsetTop;
      if (window.scrollY > top) window.scrollTo(0, top);
      return;
    }
    const tabBtn = e.target.closest('[data-tab]');
    if (tabBtn && tabBtn.tagName === 'BUTTON') { loginTab = tabBtn.dataset.tab; viewLogin(currentRoute().query.get('next')); return; }
    const t = e.target.closest('[data-act]');
    if (!t) return;
    const id = t.dataset.id;
    switch (t.dataset.act) {
      case 'inc': changeQty(id, 1); break;
      case 'dec': changeQty(id, -1); if (S.cartOpen && !cartSummary().count) renderFloat(); break;
      case 'toggle-cart': S.cartOpen = !S.cartOpen; renderFloat(); break;
      case 'close-cart': S.cartOpen = false; renderFloat(); break;
      case 'clear-cart':
        if (cartSummary().count && await confirmBox('确定清空购物车吗？', '清空')) { S.cart = {}; saveCart(); refreshCartUI(); }
        break;
      case 'checkout':
        if (!cartSummary().count) { toast('购物车还是空的~'); break; }
        S.cartOpen = false; location.hash = '#/checkout'; break;
      case 'edit': editDish(S.dishes.find(d => String(d.id) === id)); break;
      case 'new': editDish(null); break;
      case 'ppl-': people = Math.max(1, people - 1); viewCheckout(); break;
      case 'ppl+': people = Math.min(50, people + 1); viewCheckout(); break;
      case 'submit': submitOrder(t); break;
      case 'avatar': changeAvatar(); break;
      case 'rename': renameDialog(); break;
      case 'logout':
        if (await confirmBox('确定退出登录吗？', '退出')) { await api.signOut(); viewMe(); toast('已退出'); }
        break;
    }
  });
  window.addEventListener('hashchange', route);

  // ---------- 启动 ----------
  (async function boot() {
    try {
      await api.init();
      S.dishes = await api.listDishes();
    } catch (e) {
      $app.innerHTML = `<div class="empty">加载失败：${esc(e.message)}<br><button class="btn primary" onclick="location.reload()">重试</button></div>`;
      return;
    }
    route();
  })();
})();
