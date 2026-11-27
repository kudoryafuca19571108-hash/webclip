/* WebClip ブックマークレット本体 v1.2.1
   短い版のブックマークレットが実行時に読み込みます。WebClip.html から tools/build-bm.js で生成しているので、直接編集しないでください。 */
(function () {
  var cs = document.currentScript, base = cs && cs.src ? cs.src.replace(/[?#].*$/, '').replace(/[^\/]*$/, '') : '';
  /* ブックマークレット本体。表示中のページの中で実行される。
     外部ファイルを読まない・<style> を挿入しない（CSP 対策）・行コメントを書かない（1行化のため）。
     完全版はこの関数をそのまま埋め込む。短い版は tools/build-bm.js で生成した bm.js を読み込む（v1.2.1）。 */
  function WC_BM(APP, VER) {
    var D = document, W = window, B = D.body, old = D.getElementById('__webclip');
    if (old) { old.remove(); return; }
    if (!B) { return; }
    var i, e, s, hid = [], ims = [], all = B.getElementsByTagName('*');
    for (i = 0; i < all.length; i++) {
      e = all[i];
      if (e.tagName === 'NOSCRIPT') { continue; }
      try { s = W.getComputedStyle(e); } catch (x) { continue; }
      if (s && (s.display === 'none' || s.visibility === 'hidden')) { e.setAttribute('data-wch', '1'); hid.push(e); }
    }
    for (i = 0; i < D.images.length; i++) {
      e = D.images[i]; s = e.currentSrc || '';
      if (s && s.indexOf('data:') !== 0) { e.setAttribute('data-wcs', s); ims.push(e); }
    }
    function abs(u) { if (!u) { return ''; } try { return new URL(u, D.baseURI).href; } catch (x) { return ''; } }
    function mt(q) { var m = D.querySelector(q); return m ? (m.getAttribute('content') || '').trim() : ''; }
    function tl(el) { return ((el.innerText || el.textContent) || '').replace(/\s+/g, '').length; }
    function tc(el) { return (el.textContent || '').replace(/\s+/g, '').length; }
    function pick() {
      var c = B.querySelectorAll('p,pre,blockquote,td,div,section,article'), M = new Map(), bx = null, bv = 0, j, k, n, t, v, cm;
      function add(x, y) { if (!x || x === D.documentElement) { return; } M.set(x, (M.get(x) || 0) + y); }
      for (j = 0; j < c.length; j++) {
        n = c[j];
        if (n.closest('[data-wch],nav,footer,aside')) { continue; }
        if (/^(P|PRE|BLOCKQUOTE)$/.test(n.tagName)) {
          t = tc(n); if (t < 20) { continue; }
          cm = ((n.textContent || '').match(/[、，,]/g) || []).length;
          v = 1 + Math.min(t / 80, 4) + Math.min(cm * 0.25, 3);
          add(n.parentElement, v);
          if (n.parentElement) { add(n.parentElement.parentElement, v / 2); if (n.parentElement.parentElement) { add(n.parentElement.parentElement.parentElement, v / 3); } }
        } else {
          t = 0;
          for (k = n.firstChild; k; k = k.nextSibling) { if (k.nodeType === 3) { t += k.nodeValue.replace(/\s+/g, '').length; } }
          if (t < 40) { continue; }
          v = 1 + Math.min(t / 80, 4);
          add(n, v); add(n.parentElement, v / 2);
        }
      }
      var r1 = /article|content|entry|post|body|main|honbun|text|story|blog/i, r2 = /comment|side|footer|nav|menu|related|rank|widget|share|sns|recommend|banner/i;
      M.forEach(function (y, x) {
        var id = (typeof x.className === 'string' ? x.className : '') + ' ' + (x.id || ''), L = tc(x) || 1, al = 0, as = x.getElementsByTagName('a'), q;
        for (q = 0; q < as.length; q++) { al += tc(as[q]); }
        y = y * (1 - Math.min(al / L, 1));
        if (/^(ARTICLE|MAIN)$/.test(x.tagName) || x.getAttribute('itemprop') === 'articleBody') { y *= 1.3; }
        if (r1.test(id)) { y *= 1.15; }
        if (r2.test(id)) { y *= 0.5; }
        if (y > bv) { bv = y; bx = x; }
      });
      if (!bx) { bx = D.querySelector('[itemprop=articleBody],article,main,[role=main]') || B; }
      var L0 = tl(bx), p = bx.parentElement;
      while (p && p !== B && p !== D.documentElement && tl(p) <= L0 * 1.3) { bx = p; p = p.parentElement; }
      var ar = bx.closest('article');
      if (ar && ar !== bx && tl(ar) <= L0 * 2) { bx = ar; }
      return bx;
    }
    function cl(root, junk) {
      var c = root.cloneNode(true), q, j, x, u, L;
      q = c.querySelectorAll('noscript');
      for (j = 0; j < q.length; j++) {
        x = q[j];
        if (/<img/i.test(x.textContent || '')) {
          try {
            var bd = new DOMParser().parseFromString(x.textContent, 'text/html').body, sp = D.createElement('span');
            while (bd.firstChild) { sp.appendChild(D.importNode(bd.firstChild, true)); bd.removeChild(bd.firstChild); }
            x.replaceWith(sp);
          } catch (y) {}
        }
      }
      q = c.querySelectorAll('[data-wch]');
      for (j = 0; j < q.length; j++) { q[j].remove(); }
      q = c.querySelectorAll('iframe');
      for (j = 0; j < q.length; j++) {
        x = q[j]; u = abs(x.getAttribute('src') || '');
        if (/^https?:/.test(u)) { var pa = D.createElement('p'), a = D.createElement('a'); a.href = u; a.textContent = '[埋め込み] ' + u; pa.appendChild(a); x.replaceWith(pa); } else { x.remove(); }
      }
      q = c.querySelectorAll('form');
      for (j = 0; j < q.length; j++) { x = q[j]; while (x.firstChild) { x.parentNode.insertBefore(x.firstChild, x); } x.remove(); }
      q = c.querySelectorAll('script,style,noscript,template,object,embed,input,button,select,textarea,svg,canvas,dialog,link,meta,source' + (junk ? ',nav,aside,footer' : ''));
      for (j = 0; j < q.length; j++) { q[j].remove(); }
      if (junk) {
        L = tc(c) || 1;
        var rj = /(^|[\s_-])(share|sns|social|related|recommend|ranking|comments?|ads?|advert\w*|promo\w*|banner|breadcrumbs?|pagination|pager|subscribe|newsletter|popup|modal|cookie\w*|widget|sidebar|follow)([\s_-]|$)/i;
        q = c.querySelectorAll('*');
        for (j = 0; j < q.length; j++) {
          x = q[j];
          if (rj.test((typeof x.className === 'string' ? x.className : '') + ' ' + (x.id || '')) && tc(x) < L * 0.3) { x.remove(); }
        }
      }
      q = c.querySelectorAll('img');
      for (j = 0; j < q.length; j++) {
        x = q[j];
        var sr = x.getAttribute('src') || '', ss = (x.getAttribute('data-srcset') || x.getAttribute('srcset') || '').trim().split(/[\s,]+/)[0];
        if (/^data:/.test(sr)) { sr = ''; }
        u = x.getAttribute('data-wcs') || x.getAttribute('data-src') || x.getAttribute('data-original') || x.getAttribute('data-lazy-src') || sr || ss || '';
        if (!u || (/^data:/.test(u) && u.length < 400) || x.getAttribute('width') === '1' || x.getAttribute('height') === '1') { x.remove(); continue; }
        x.setAttribute('src', /^data:/.test(u) ? u : abs(u));
        x.removeAttribute('srcset'); x.removeAttribute('sizes'); x.removeAttribute('data-wcs');
      }
      q = c.querySelectorAll('a[href]');
      for (j = 0; j < q.length; j++) {
        x = q[j]; u = x.getAttribute('href') || '';
        if (/^\s*javascript:/i.test(u)) { x.removeAttribute('href'); } else { x.setAttribute('href', abs(u)); }
      }
      return c;
    }
    var se = null, sl = W.getSelection();
    if (sl && sl.rangeCount && !sl.isCollapsed && String(sl).replace(/\s+/g, '').length > 0) {
      var dv = D.createElement('div');
      for (i = 0; i < sl.rangeCount; i++) { dv.appendChild(sl.getRangeAt(i).cloneContents()); }
      se = cl(dv, false);
    }
    var root = pick(), art = cl(root, true), pg = cl(B, false);
    for (i = 0; i < hid.length; i++) { hid[i].removeAttribute('data-wch'); }
    for (i = 0; i < ims.length; i++) { ims[i].removeAttribute('data-wcs'); }
    var cn = D.querySelector('link[rel=canonical]'), tm = D.querySelector('time[datetime]');
    var info = {
      url: location.href,
      canonical: cn ? abs(cn.getAttribute('href') || '') : '',
      site: mt('meta[property="og:site_name"]') || location.hostname,
      author: mt('meta[name=author]') || mt('meta[property="article:author"]'),
      published: mt('meta[property="article:published_time"]') || mt('meta[itemprop=datePublished]') || (tm ? tm.getAttribute('datetime') : ''),
      excerpt: mt('meta[name=description]') || mt('meta[property="og:description"]'),
      image: abs(mt('meta[property="og:image"]')),
      lang: D.documentElement.lang || ''
    };
    var md = se ? 'selection' : 'article';
    function el() { return md === 'selection' ? se : md === 'page' ? pg : art; }
    function ttl(x) { var h = x && x.querySelector('h1'); return mt('meta[property="og:title"]') || (h ? h.textContent.replace(/\s+/g, ' ').trim() : '') || D.title || ''; }
    var IR = {}, IP = {}, sv = null, im = null;
    function b64(bl) { return new Promise(function (res) { var f = new FileReader(); f.onload = function () { res(String(f.result || '')); }; f.onerror = function () { res(''); }; f.readAsDataURL(bl); }); }
    function shrink(bl) {
      if (bl.size <= 300000 && /^image\/(png|jpeg|gif|webp)$/.test(bl.type)) { return b64(bl); }
      if (!W.createImageBitmap) { return Promise.resolve(''); }
      return createImageBitmap(bl).then(function (bm) {
        var s = Math.min(1, 1600 / Math.max(bm.width, bm.height)), c = D.createElement('canvas'), g;
        c.width = Math.max(1, Math.round(bm.width * s)); c.height = Math.max(1, Math.round(bm.height * s));
        g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bm, 0, 0, c.width, c.height);
        return c.toDataURL('image/jpeg', 0.85);
      });
    }
    function get1(u) {
      if (IP[u]) { return IP[u]; }
      var ct = W.AbortController ? new AbortController() : null, so = false, tm = setTimeout(function () { if (ct) { ct.abort(); } }, 15000);
      try { so = new URL(u).origin === location.origin; } catch (x) {}
      IP[u] = fetch(u, { credentials: so ? 'same-origin' : 'omit', signal: ct ? ct.signal : undefined }).then(function (r) { if (!r.ok) { throw new Error('http'); } return r.blob(); }).then(shrink).then(function (d) { return /^data:image\/(png|jpeg|gif|webp);base64,/.test(d) ? d : ''; }, function () { return ''; }).then(function (d) { clearTimeout(tm); IR[u] = d; return d; });
      return IP[u];
    }
    function srcs(x) { var a = x.querySelectorAll('img'), r = [], k, u; for (k = 0; k < a.length && r.length < 80; k++) { u = a[k].getAttribute('src') || ''; if (/^https?:/.test(u) && r.indexOf(u) < 0) { r.push(u); } } return r; }
    function ist() { var us = srcs(el()), n = 0, ok = 0, k; for (k = 0; k < us.length; k++) { if (us[k] in IR) { n++; if (IR[us[k]]) { ok++; } } } return { all: us.length, done: n, ok: ok }; }
    function imgUp() {
      var s = ist(), b = sv.checked && s.done < s.all;
      im.textContent = !sv.checked ? '（URL で参照）' : !s.all ? '（画像なし）' : b ? '取得中… ' + s.done + '/' + s.all : s.ok + '/' + s.all + '枚を保存';
      cb.disabled = b; st(cb, { opacity: b ? '.5' : '1' });
      return b;
    }
    function ens() { if (!sv.checked) { return Promise.resolve(); } return Promise.all(srcs(el()).map(function (u) { return get1(u).then(imgUp); })); }
    function pay() {
      var x = el(), h = x.innerHTML, o, k, a, cx, u;
      if (sv.checked) {
        cx = x.cloneNode(true); a = cx.querySelectorAll('img');
        for (k = 0; k < a.length; k++) { u = a[k].getAttribute('src'); if (IR[u]) { a[k].setAttribute('src', IR[u]); } }
        h = cx.innerHTML;
      }
      o = { wc: 1, v: VER, mode: md, title: ttl(x), html: h, clippedAt: new Date().toISOString() };
      for (k in info) { o[k] = info[k]; }
      return o;
    }
    function st(n, o) { for (var k in o) { n.style.setProperty(k, o[k], 'important'); } return n; }
    function mk(t, o, tx) { var n = D.createElement(t); if (o) { st(n, o); } if (tx != null) { n.textContent = tx; } return n; }
    function bt(tx, pr) {
      return mk('button', { font: 'inherit', 'font-size': '14px', padding: '7px 12px', margin: '0', 'border-radius': '8px', border: '1px solid ' + (pr ? '#2563eb' : '#d9dee6'), background: pr ? '#2563eb' : '#fff', color: pr ? '#fff' : '#1d2430', cursor: 'pointer', 'line-height': '1.3' }, tx);
    }
    var H = mk('div', { all: 'initial', position: 'fixed', 'z-index': '2147483647', left: '0', right: '0', bottom: '0', display: 'block' });
    H.id = '__webclip';
    var R = H.attachShadow ? H.attachShadow({ mode: 'open' }) : H;
    var P = mk('div', { margin: '0 auto 10px', width: 'calc(100% - 16px)', 'max-width': '560px', 'box-sizing': 'border-box', background: '#fff', color: '#1d2430', border: '1px solid #d9dee6', 'border-radius': '12px', 'box-shadow': '0 8px 30px rgba(0,0,0,.25)', padding: '12px', 'font-family': 'system-ui,-apple-system,"Segoe UI","Hiragino Sans","Yu Gothic UI",Meiryo,sans-serif', 'font-size': '14px', 'line-height': '1.5', 'text-align': 'left' });
    var r1 = mk('div', { display: 'flex', 'align-items': 'center', gap: '6px', 'margin-bottom': '6px' }), mb = {}, ms = [['article', '本文'], ['page', '全体']];
    if (se) { ms.unshift(['selection', '選択']); }
    r1.appendChild(mk('b', { 'font-size': '15px', 'margin-right': '4px' }, 'WebClip'));
    ms.forEach(function (m) { var b = st(bt(m[1]), { padding: '3px 10px', 'font-size': '13px' }); b.onclick = function () { md = m[0]; up(); }; mb[m[0]] = b; r1.appendChild(b); });
    var xb = st(bt('×'), { 'margin-left': 'auto', padding: '3px 10px' });
    r1.appendChild(xb);
    var tt = mk('div', { 'font-weight': '700', overflow: 'hidden', 'text-overflow': 'ellipsis', 'white-space': 'nowrap' });
    var inf = mk('div', { color: '#5d6b7e', 'font-size': '12px' });
    var pv = mk('div', { color: '#475569', 'font-size': '12px', 'max-height': '4.5em', overflow: 'hidden', margin: '4px 0 8px', 'word-break': 'break-all' });
    var r2 = mk('div', { display: 'flex', 'flex-wrap': 'wrap', gap: '6px', 'align-items': 'center' }), cb = bt('コピー', 1), sb = APP ? bt('アプリへ送る') : null;
    var msg = mk('div', { 'font-size': '12px', color: '#15803d', 'margin-top': '6px', 'min-height': '1em' });
    var r3 = mk('label', { display: 'flex', 'align-items': 'center', gap: '6px', 'font-size': '12px', color: '#475569', margin: '0 0 8px', cursor: 'pointer' });
    sv = mk('input', { margin: '0', width: '16px', height: '16px' }); sv.type = 'checkbox'; sv.checked = true;
    im = mk('span', { color: '#5d6b7e' });
    r3.appendChild(sv); r3.appendChild(mk('span', null, '画像も保存')); r3.appendChild(im);
    sv.onchange = function () { ens(); imgUp(); };
    r2.appendChild(cb); if (sb) { r2.appendChild(sb); }
    var ol = root.style.getPropertyValue('outline'), op = root.style.getPropertyPriority('outline');
    function hl(on) { if (root === B) { return; } if (on) { root.style.setProperty('outline', '3px solid rgba(37,99,235,.7)', 'important'); } else { root.style.setProperty('outline', ol, op); } }
    function say(t, err) { msg.textContent = t; st(msg, { color: err ? '#c62828' : '#15803d' }); }
    function up() {
      var x = el(), t = (x.textContent || '').replace(/\s+/g, ' ').trim(), k;
      tt.textContent = ttl(x) || '(無題)';
      inf.textContent = '約' + t.replace(/\s/g, '').length.toLocaleString() + '字・画像' + x.querySelectorAll('img').length + '枚';
      pv.textContent = t.slice(0, 160);
      for (k in mb) { st(mb[k], { background: k === md ? '#dbe7ff' : '#fff', 'border-color': k === md ? '#9db8f5' : '#d9dee6' }); }
      hl(md === 'article'); say('');
      ens(); imgUp();
    }
    function kd(ev) { if (ev.key === 'Escape') { cls(); } }
    function cls() { hl(false); H.remove(); D.removeEventListener('keydown', kd, true); }
    function cp(t) {
      function fb() {
        var a = mk('textarea', { position: 'fixed', top: '0', left: '0', opacity: '0', width: '1px', height: '1px' }), ok = false;
        a.value = t; a.setAttribute('readonly', ''); D.documentElement.appendChild(a); a.focus(); a.select();
        try { a.setSelectionRange(0, t.length); } catch (x) {}
        try { ok = D.execCommand('copy'); } catch (x) {}
        a.remove(); return ok;
      }
      if (navigator.clipboard && W.isSecureContext) { return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return fb(); }); }
      return Promise.resolve(fb());
    }
    xb.onclick = cls;
    cb.onclick = function () {
      if (imgUp()) { return; }
      var t = 'WEBCLIP:v1\n' + JSON.stringify(pay()), kb = Math.round(t.length / 1024);
      cp(t).then(function (ok) { say(ok ? 'コピーしました（約' + (kb >= 1024 ? (kb / 1024).toFixed(1) + 'MB' : kb + 'KB') + '）。WebClip の「取込」に貼り付けてください' : 'コピーできませんでした', !ok); });
    };
    if (sb) {
      sb.onclick = function () {
        var id = String(Date.now()) + Math.random().toString(36).slice(2), w = W.open(APP + '#receive', 'webclip_app'), n = 0, dn = false, org;
        if (!w) { say('新しいタブを開けませんでした。「コピー」して貼り付けてください', 1); return; }
        try { org = new URL(APP).origin; } catch (x) { org = '*'; }
        say('送信中…');
        ens().then(function () { var t = pay();
        function om(ev) { if (ev.data && ev.data.webclipAck === id) { dn = true; W.removeEventListener('message', om); say('アプリへ送りました'); } }
        W.addEventListener('message', om);
        var iv = setInterval(function () {
          if (dn || ++n > 60) { clearInterval(iv); if (!dn) { W.removeEventListener('message', om); say('送信できませんでした。「コピー」して貼り付けてください', 1); } return; }
          try { w.postMessage({ webclip: 1, id: id, data: t }, org); } catch (x) {}
        }, 500);
        });
      };
    }
    P.appendChild(r1); P.appendChild(tt); P.appendChild(inf); P.appendChild(pv); P.appendChild(r3); P.appendChild(r2); P.appendChild(msg);
    R.appendChild(P); D.documentElement.appendChild(H);
    D.addEventListener('keydown', kd, true);
    up();
  }
  WC_BM(base ? base + 'WebClip.html' : '', "1.2.1");
})();
