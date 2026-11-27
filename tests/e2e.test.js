// WebClip の実ブラウザ検証（Chromium + Playwright）
// 実行： node tests/e2e.test.js
// アプリを http://127.0.0.1:8765/ 、テスト用記事ページを http://127.0.0.1:8766/ で配信して操作します。
// 記事ページには厳しい CSP（style-src 'self' など）を付け、ブックマークレットの表示が崩れないことも確かめます。
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures');
const APP_PORT = 8765, SITE_PORT = 8766;
const APP = `http://127.0.0.1:${APP_PORT}/WebClip.html`;
const SITE = `http://127.0.0.1:${SITE_PORT}`;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${!cond && extra !== undefined ? '  → ' + String(extra).slice(0, 300) : ''}`);
}

function serve(dir, port, headers) {
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.gif': 'image/gif', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  const srv = http.createServer((req, res) => {
    let p = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (p.startsWith(dir) && fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');   // GitHub Pages と同じくディレクトリは index.html
    if (!p.startsWith(dir) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
      // 画像は存在しなくても 1x1 GIF を返す
      if (/\.(png|gif)$/.test(p)) { res.writeHead(200, Object.assign({ 'Content-Type': 'image/gif' }, headers)); res.end(Buffer.from('R0lGODlhAQABAAAAACw=', 'base64')); return; }
      res.writeHead(404); res.end('not found'); return;
    }
    res.writeHead(200, Object.assign({ 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }, headers));
    fs.createReadStream(p).pipe(res);
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(srv)));
}

async function bookmarkletSource(page) {
  await page.click('#btnBm');
  const href = await page.getAttribute('#bmLink', 'href');
  await page.click('#bmClose');
  return { href, code: decodeURIComponent(href.replace(/^javascript:/, '')) };
}
// ブックマークレットのパネル（shadow DOM）のボタンを押す
async function clickPanel(page, label) {
  await page.evaluate(l => {
    const r = document.getElementById('__webclip').shadowRoot;
    const b = Array.from(r.querySelectorAll('button')).find(x => x.textContent === l);
    if (!b) throw new Error('button not found: ' + l);
    b.click();
  }, label);
}
const panelText = page => page.evaluate(() => document.getElementById('__webclip').shadowRoot.textContent);
async function pasteInto(page, sel, data) {
  await page.evaluate(([s, d]) => {
    const dt = new DataTransfer();
    for (const k in d) dt.setData(k, d[k]);
    document.querySelector(s).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [sel, data]);
}

(async () => {
  const s1 = await serve(ROOT, APP_PORT, {});
  const s2 = await serve(FIX, SITE_PORT, { 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:" });
  // 日本語のダウンロードファイル名を扱うため UTF-8 ロケールで起動する（LANG 未設定だと Chromium が "download" に置き換える）
  const browser = await chromium.launch({ env: Object.assign({}, process.env, { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' }) });
  const ctx = await browser.newContext({ acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${APP_PORT}` });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: SITE });
  const errors = [];
  const app = await ctx.newPage();
  app.on('pageerror', e => errors.push('app: ' + e.message));
  await app.goto(APP);
  await app.waitForFunction(() => document.querySelector('#count').textContent !== '');

  // ---- 1. ブックマークレット生成 ----
  const bm = await bookmarkletSource(app);
  ok('1a ブックマークレットが javascript: で始まる', bm.href.startsWith('javascript:'));
  ok('1b アプリの URL が埋め込まれている', bm.code.includes(JSON.stringify(APP)));
  ok('1c サイズが 16KB 未満', bm.href.length < 16000, bm.href.length);
  console.log(`      （ブックマークレット ${bm.href.length} 文字）`);
  let syntaxOk = true; try { new Function(bm.code); } catch (e) { syntaxOk = false; }
  ok('1d コードの構文が正しい', syntaxOk);

  // ---- 2. 記事ページで実行（CSP あり） ----
  const site = await ctx.newPage();
  site.on('pageerror', e => errors.push('site: ' + e.message));
  await site.goto(SITE + '/article.html');
  await site.evaluate(bm.code);
  await site.waitForSelector('#__webclip');
  const pt = await panelText(site);
  ok('2a パネルが表示される', pt.includes('WebClip') && pt.includes('コピー') && pt.includes('アプリへ送る'), pt);
  ok('2b パネルにタイトルが出る', pt.includes('鉄筋の定着長さについて'), pt);
  const box = await site.evaluate(() => {
    const p = document.getElementById('__webclip').shadowRoot.firstElementChild.getBoundingClientRect();
    return { w: p.width, h: p.height, bottom: innerHeight - p.bottom };
  });
  ok('2c CSP 下でもパネルの書式が効いている（幅・位置）', box.w > 300 && box.w <= 560 && box.bottom >= 0 && box.bottom < 30, JSON.stringify(box));
  const outline = await site.evaluate(() => getComputedStyle(document.querySelector('article')).outlineStyle);
  ok('2d 抽出範囲（article）が枠で示される', outline === 'solid', outline);
  const leftover = await site.evaluate(() => document.querySelectorAll('[data-wch],[data-wcs]').length);
  ok('2e 元ページに作業用の属性が残らない', leftover === 0, leftover);

  // コピー
  await clickPanel(site, 'コピー');
  await site.waitForFunction(() => document.getElementById('__webclip').shadowRoot.textContent.includes('コピーしました'));
  const clip = await site.evaluate(() => navigator.clipboard.readText());
  ok('2f クリップボードに WEBCLIP:v1 形式で入る', clip.startsWith('WEBCLIP:v1\n'), clip.slice(0, 50));
  const pay = JSON.parse(clip.replace(/^WEBCLIP:v1\n/, ''));
  ok('2g mode=article', pay.mode === 'article', pay.mode);
  ok('2h 本文を含む', pay.html.includes('定着長さは、鉄筋の付着応力度') && pay.html.includes('まとめると'));
  ok('2i 見出し・表・コード・引用を含む', /<h2/.test(pay.html) && /<table/.test(pay.html) && /<pre/.test(pay.html) && /<blockquote/.test(pay.html));
  for (const [k, w] of [['SIDEBAR_TEXT', 'サイドバー'], ['FOOTER_TEXT', 'フッター'], ['HIDDEN_TEXT', '非表示要素'], ['SCRIPT_TEXT', 'script'], ['COMMENT_TEXT', 'コメント欄'], ['Xで共有', '共有ボタン'], ['関連1', '関連記事'], ['このサイトについて', 'ナビ']])
    ok(`2j ${w}を含まない`, !pay.html.includes(k));
  ok('2k 遅延読み込み画像は data-src の絶対 URL', pay.html.includes(`src="${SITE}/img/fig1.png"`), (pay.html.match(/<img[^>]*>/g) || []).join(' '));
  ok('2l 1x1 の計測用画像は除く', !pay.html.includes('pixel.gif'));
  ok('2m 相対リンクを絶対 URL に', pay.html.includes(`href="${SITE}/glossary/teichaku"`));
  ok('2n iframe はリンクに置換', pay.html.includes('[埋め込み] https://video.example/embed/123'));
  ok('2o メタ情報（URL・サイト・著者・公開日・canonical）', pay.url === SITE + '/article.html' && pay.site === 'テストメディア' && pay.author === '山田 太郎' &&
    pay.published.startsWith('2026-11-20') && pay.canonical === SITE + '/articles/anchorage?utm_source=feed', JSON.stringify({ u: pay.url, s: pay.site, a: pay.author, p: pay.published, c: pay.canonical }));

  // 全体モード
  await clickPanel(site, '全体');
  await clickPanel(site, 'コピー');
  await site.waitForFunction(() => document.getElementById('__webclip').shadowRoot.textContent.includes('コピーしました'));
  const pagePay = JSON.parse((await site.evaluate(() => navigator.clipboard.readText())).replace(/^WEBCLIP:v1\n/, ''));
  ok('2p 全体モードはサイドバー・フッターも含む（非表示・script は除く）', pagePay.mode === 'page' && pagePay.html.includes('SIDEBAR_TEXT') && pagePay.html.includes('FOOTER_TEXT') &&
    !pagePay.html.includes('HIDDEN_TEXT') && !pagePay.html.includes('SCRIPT_TEXT'));
  ok('2q 全体モードの切替で枠が消える', await site.evaluate(() => getComputedStyle(document.querySelector('article')).outlineStyle) === 'none');

  // 閉じる → 再実行で選択範囲モード
  await clickPanel(site, '×');
  ok('2r × で閉じる', await site.evaluate(() => !document.getElementById('__webclip')));
  await site.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('blockquote')); getSelection().removeAllRanges(); getSelection().addRange(r); });
  await site.evaluate(bm.code);
  ok('2s 選択があると「選択」ボタンが出る', (await panelText(site)).includes('選択'));
  await clickPanel(site, 'コピー');
  await site.waitForFunction(() => document.getElementById('__webclip').shadowRoot.textContent.includes('コピーしました'));
  const selPay = JSON.parse((await site.evaluate(() => navigator.clipboard.readText())).replace(/^WEBCLIP:v1\n/, ''));
  ok('2t 選択範囲モードは選択部分だけ', selPay.mode === 'selection' && selPay.html.includes('規準の適用範囲') && !selPay.html.includes('まとめると'), selPay.html);
  await site.evaluate(() => getSelection().removeAllRanges());
  await site.evaluate(bm.code); // 2回目の実行でパネルを閉じる
  ok('2u もう一度実行するとパネルが閉じる', await site.evaluate(() => !document.getElementById('__webclip')));

  // <p> を使わず <div> と <br> で書かれたブログ形式
  const blog = await ctx.newPage();
  blog.on('pageerror', e => errors.push('blog: ' + e.message));
  await blog.goto(SITE + '/blog.html');
  await blog.evaluate(bm.code);
  await clickPanel(blog, 'コピー');
  await blog.waitForFunction(() => document.getElementById('__webclip').shadowRoot.textContent.includes('コピーしました'));
  const blogPay = JSON.parse((await blog.evaluate(() => navigator.clipboard.readText())).replace(/^WEBCLIP:v1\n/, ''));
  ok('2v ブログ形式：本文の最初と最後を含む', blogPay.html.includes('BLOG_BODY_1') && blogPay.html.includes('BLOG_BODY_2'), blogPay.html.slice(0, 200));
  ok('2w ブログ形式：サイドバー・メニューを含まない', !blogPay.html.includes('SIDE_TEXT') && !blogPay.html.includes('プロフィール'), blogPay.html);
  ok('2x ブログ形式：相対パスの画像を絶対 URL に', blogPay.html.includes(`src="${SITE}/photo1.jpg"`));
  ok('2y ブログ形式：タイトルは document.title', blogPay.title === '週末の現場見学 - しんぶログ', blogPay.title);
  await blog.close();

  // ---- 3. アプリへ貼り付けて保存 ----
  await app.click('#btnImport');
  await pasteInto(app, '#pasteBox', { 'text/plain': clip });
  await app.waitForSelector('#pTitle');
  ok('3a 確認画面にタイトル・URL', await app.inputValue('#pTitle') === '鉄筋の定着長さについて' && await app.inputValue('#pUrl') === SITE + '/article.html');
  ok('3b 確認画面に種類・文字数', /本文・約[\d,]+字・画像1枚/.test(await app.textContent('.infoBox')), await app.textContent('.infoBox'));
  await app.fill('#pTags', '構造 鉄筋');
  await app.fill('#pMemo', '定着のメモ');
  await app.click('#iSave');
  await app.waitForSelector('.rd h1.ttl');
  ok('3c 一覧に 1 件', await app.$$eval('#list li', l => l.length) === 1);
  ok('3d 閲覧画面に本文', (await app.textContent('#rdBody')).includes('まとめると'));
  ok('3e 閲覧画面に元ページのリンク', await app.getAttribute('.rd a.url', 'href') === SITE + '/article.html');
  ok('3f 閲覧画面の本文リンクは新しいタブ・noreferrer', await app.$$eval('#rdBody a', as => as.length > 0 && as.every(a => a.target === '_blank' && a.rel.includes('noreferrer'))));
  ok('3g タグ・メモ表示', (await app.textContent('.rd')).includes('#構造') && (await app.textContent('.rd .memo')) === '定着のメモ');

  // 重複 URL
  await app.click('#btnImport');
  await pasteInto(app, '#pasteBox', { 'text/plain': clip });
  await app.waitForSelector('#pWarn .warnBox');
  ok('3h 同じ URL の警告が出る', (await app.textContent('#pWarn')).includes('保存済み'));
  await app.click('#iSave');
  await app.waitForSelector('#dlgWrap:not([hidden])');
  await app.click('#dlg button:text("上書き")');
  await app.waitForSelector('#modalWrap[hidden]', { state: 'attached' });
  ok('3i 上書き後も 1 件', await app.$$eval('#list li', l => l.length) === 1);
  ok('3j 上書きでタグを引き継ぐ', (await app.textContent('#list li')).includes('#鉄筋'));

  // canonical での重複判定（utm 除去・別 URL）
  const viaCanon = await app.evaluate(() => !!findDup('http://127.0.0.1:8766/articles/anchorage', ''));
  ok('3k canonical（utm 除去）でも重複と判定', viaCanon);

  // ---- 4. 「アプリへ送る」 ----
  await site.evaluate(bm.code);
  const [popup] = await Promise.all([ctx.waitForEvent('page'), clickPanel(site, 'アプリへ送る')]);
  popup.on('pageerror', e => errors.push('popup: ' + e.message));
  await popup.waitForSelector('#pTitle', { timeout: 15000 });
  ok('4a 新しいタブのアプリで確認画面が開く', await popup.inputValue('#pTitle') === '鉄筋の定着長さについて');
  await site.waitForFunction(() => document.getElementById('__webclip').shadowRoot.textContent.includes('アプリへ送りました'), null, { timeout: 15000 });
  ok('4b 記事ページ側に「送りました」', true);
  ok('4c 受信後に #receive が URL から消える', !popup.url().includes('#receive'), popup.url());
  ok('4d 送られたタブでも重複警告（同じ保存領域）', (await popup.textContent('#pWarn')).includes('保存済み'));
  await popup.click('#iCancel');
  await popup.close();
  await clickPanel(site, '×');

  // ---- 5. 普通の貼り付け（全選択→コピー）と XSS 対策 ----
  const evilHtml = '<html><body><!--StartFragment--><h1>貼り付け記事</h1><p onclick="alert(1)" style="color:red">本文です<script>window.__x=1</script></p>' +
    '<img src="x" onerror="window.__xss=1"><img src="https://img.example/a.png" onerror="window.__xss=2" alt="a">' +
    '<a href="javascript:alert(1)">悪いリンク</a> <a href="https://ok.example/">良いリンク</a><iframe src="https://evil.example"></iframe>' +
    '<svg><script>window.__xss=3</script></svg><!--EndFragment--></body></html>';
  await app.click('#btnImport');
  await pasteInto(app, '#pasteBox', { 'text/html': evilHtml, 'text/plain': '貼り付け記事\n本文です' });
  await app.waitForSelector('#pTitle');
  ok('5a タイトルを h1 から推定', await app.inputValue('#pTitle') === '貼り付け記事');
  ok('5b URL は空（自分で入力）', await app.inputValue('#pUrl') === '');
  const pvHtml = await app.innerHTML('#pvBody');
  ok('5c 危険な属性・要素を除去', !/onclick|onerror|style=|<script|<iframe|<svg|javascript:/i.test(pvHtml), pvHtml);
  ok('5d 相対 URL の画像（src="x"）は除去、https 画像は残す', !/src="x"/.test(pvHtml) && pvHtml.includes('https://img.example/a.png'));
  ok('5e 良いリンクは残す', pvHtml.includes('https://ok.example/'));
  // URL を貼ると URL 欄に入る
  await pasteInto(app, '#pasteBox', { 'text/plain': 'https://news.example.com/article/1' });
  ok('5f 貼り付け記事の後で URL を貼ると URL 欄に入る', await app.inputValue('#pUrl') === 'https://news.example.com/article/1');
  ok('5g サイト名をドメインから自動設定', await app.inputValue('#pSite') === 'news.example.com');
  await app.click('#iSave');
  await app.waitForSelector('#modalWrap[hidden]', { state: 'attached' });
  ok('5h 2 件目を保存', await app.$$eval('#list li', l => l.length) === 2);
  ok('5i XSS が実行されていない', await app.evaluate(() => !window.__xss && !window.__x));

  // ---- 6. リンクのみ ----
  await app.click('#btnImport');
  await pasteInto(app, '#pasteBox', { 'text/plain': 'https://www.example.org/docs/page?id=3' });
  await app.waitForSelector('#pTitle');
  ok('6a URL だけならリンクのみ', (await app.textContent('.infoBox')).includes('リンクのみ'));
  await app.fill('#pTitle', '参考リンク');
  await app.click('#iSave');
  await app.waitForSelector('#modalWrap[hidden]', { state: 'attached' });
  ok('6b 3 件目を保存・一覧に「リンク」表示', await app.$$eval('#list li', l => l.length) === 3 && (await app.textContent('#list')).includes('リンク参考リンク'));
  ok('6c リンクのみの閲覧画面', (await app.textContent('#rdBody')).includes('リンクのみ保存'));

  // ---- 7. 一覧の検索・絞り込み ----
  const listCount = () => app.$$eval('#list li', l => l.length);
  await app.fill('#q', '付着応力度'); ok('7a 本文で検索', await listCount() === 1);
  await app.fill('#q', '#鉄筋'); ok('7b タグで検索', await listCount() === 1);
  await app.fill('#q', 'example.org'); ok('7c URL で検索', await listCount() === 1);
  await app.fill('#q', '');
  const sites = await app.$$eval('#fSite option', o => o.map(x => x.value));
  ok('7d サイトの選択肢（ドメイン）', sites.includes('127.0.0.1') && sites.includes('news.example.com') && sites.includes('example.org'), sites.join(','));
  await app.selectOption('#fSite', 'example.org'); ok('7e サイトで絞り込み', await listCount() === 1);
  await app.selectOption('#fSite', '');
  await app.selectOption('#fSort', 'title');
  ok('7f タイトル順', (await app.$$eval('#list li .t', l => l.map(x => x.textContent)))[0].includes('参考リンク'));
  await app.selectOption('#fSort', 'new');

  // ---- 8. Markdown 変換 ----
  const md = await app.evaluate(() => htmlToMarkdown(
    '<h2>見出し</h2><p>文章<strong>強調</strong>と<a href="https://a.example/x(1)">リンク</a>。<br>改行</p>' +
    '<ul><li>a</li><li>b<ul><li>b1</li></ul></li></ul><ol start="3"><li>三</li><li>四</li></ol>' +
    '<blockquote>引用1<br>引用2</blockquote><pre><code>x = 1\ny = 2</code></pre>' +
    '<table><tr><th>A</th><th>B</th></tr><tr><td>1|2</td><td>3</td></tr></table><p>*星* と _下線_</p><figure><img src="https://i.example/p.png" alt="図"><figcaption>図1</figcaption></figure>'));
  const expect = ['## 見出し', '文章**強調**と[リンク](<https://a.example/x(1)>)。  \n改行', '- a\n- b\n  - b1', '3. 三\n4. 四', '> 引用1  \n> 引用2', '```\nx = 1\ny = 2\n```',
    '| A | B |\n| --- | --- |\n| 1\\|2 | 3 |', '\\*星\\* と \\_下線\\_', '![図](https://i.example/p.png)', '*図1*'];
  for (const e of expect) ok('8 Markdown: ' + e.split('\n')[0], md.includes(e), md);
  const full = await app.evaluate(async () => { const c = clips.find(x => x.title === '鉄筋の定着長さについて'); return clipToMarkdown(c, await dbGetBody(c.id)); });
  ok('8x front matter（title・source・tags）', /^---\ntitle: "鉄筋の定着長さについて"\nsource: "http:\/\/127\.0\.0\.1:8766\/article\.html"[\s\S]*tags: \["構造", "鉄筋"\]\n---/.test(full), full.slice(0, 300));
  ok('8y 本文先頭の重複した h1 を省く', (full.match(/^# 鉄筋の定着長さについて$/gm) || []).length === 1);
  ok('8z 元ページリンク・メモ', full.includes('元ページ: [テストメディア](http://127.0.0.1:8766/article.html)') && full.includes('> 定着のメモ'));

  // .md / .html 保存
  await app.click('#list li:has-text("鉄筋の定着長さ")');
  await app.waitForSelector('.rd h1.ttl:text("鉄筋の定着長さについて")');
  const [dMd] = await Promise.all([app.waitForEvent('download'), app.click('[data-act="md"]')]);
  ok('8m .md の保存', dMd.suggestedFilename() === '鉄筋の定着長さについて.md' && fs.readFileSync(await dMd.path(), 'utf8').startsWith('---\ntitle:'));
  const [dHtml] = await Promise.all([app.waitForEvent('download'), app.click('[data-act="html"]')]);
  const htmlOut = fs.readFileSync(await dHtml.path(), 'utf8');
  ok('8h .html の保存（本文と元リンク）', htmlOut.includes('<title>鉄筋の定着長さについて</title>') && htmlOut.includes('href="http://127.0.0.1:8766/article.html"') && htmlOut.includes('まとめると'));
  await app.click('[data-act="copyurl"]');
  ok('8c リンクをコピー', await app.evaluate(() => navigator.clipboard.readText()) === SITE + '/article.html');
  await app.click('[data-act="copymdlink"]');
  ok('8d Markdown リンクをコピー', await app.evaluate(() => navigator.clipboard.readText()) === `[鉄筋の定着長さについて](${SITE}/article.html)`);

  // 編集
  await app.click('[data-act="edit"]');
  await app.fill('#eTitle', '鉄筋の定着長さ（編集）');
  await app.fill('#eTags', '構造 鉄筋 配筋');
  await app.click('#eSave');
  await app.waitForSelector('.rd h1.ttl:text("鉄筋の定着長さ（編集）")');
  ok('8e 編集が反映', (await app.textContent('#list')).includes('#配筋'));

  // ---- 9. 再読み込みで保持・JSON バックアップ ----
  await app.reload();
  await app.waitForFunction(() => document.querySelectorAll('#list li').length === 3);
  ok('9a 再読み込み後も 3 件', true);
  await app.click('#btnBackup');
  const [dl] = await Promise.all([app.waitForEvent('download'), app.click('#bExport')]);
  const bkPath = path.join(os.tmpdir(), 'webclip_backup_test.json');
  await dl.saveAs(bkPath);
  const bk = JSON.parse(fs.readFileSync(bkPath, 'utf8'));
  ok('9b バックアップ形式', bk.app === 'WebClip' && bk.format === 1 && bk.clips.length === 3 && bk.clips.some(c => c.html.includes('まとめると')));
  ok('9c 最終書き出し日時を表示', !(await app.textContent('#modal')).includes('まだありません'));
  const [dLinks] = await Promise.all([app.waitForEvent('download'), app.click('#bLinksMd')]);
  const links = fs.readFileSync(await dLinks.path(), 'utf8');
  ok('9d リンク一覧 .md（サイト別）', links.includes('## example.org') && links.includes('- [参考リンク](https://www.example.org/docs/page?id=3)') && links.includes('#配筋'), links);
  await app.click('#bClose');

  // 別のブラウザ環境（空の保存領域）に読み込み
  const ctx2 = await browser.newContext();
  const app2 = await ctx2.newPage();
  app2.on('pageerror', e => errors.push('app2: ' + e.message));
  await app2.goto(APP);
  await app2.waitForFunction(() => document.querySelector('#count').textContent !== '');
  ok('9e 新しい環境は 0 件', await app2.$$eval('#list li', l => l.length) === 0);
  await app2.click('#btnBackup');
  await app2.setInputFiles('#fileIn', bkPath);
  await app2.waitForFunction(() => document.querySelectorAll('#list li').length === 3);
  ok('9f JSON 読み込みで 3 件復元', true);
  await app2.click('#list li:has-text("鉄筋の定着長さ")');
  await app2.waitForSelector('#rdBody');
  ok('9g 復元した本文を表示', (await app2.textContent('#rdBody')).includes('まとめると'));
  await app2.click('#btnBackup');
  await app2.setInputFiles('#fileIn', bkPath);
  await app2.waitForFunction(() => document.querySelector('#toast').textContent.includes('変更なし 3')).catch(() => {});
  ok('9h 同じファイルの再読み込みは変更なし', (await app2.textContent('#toast')).includes('追加 0 件・更新 0 件・変更なし 3 件'), await app2.textContent('#toast'));

  // 削除
  await app2.click('#list li:has-text("参考リンク")');
  await app2.waitForSelector('[data-act="del"]');
  await app2.click('[data-act="del"]');
  await app2.click('#dlg button:text("削除")');
  await app2.waitForFunction(() => document.querySelectorAll('#list li').length === 2);
  ok('9i 削除', true);
  await ctx2.close();

  // ---- 10. スマートフォン幅 ----
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  const ph = await ctx3.newPage();
  ph.on('pageerror', e => errors.push('phone: ' + e.message));
  await ph.goto(APP);
  await ph.waitForFunction(() => document.querySelector('#count').textContent !== '');
  await ph.click('#btnBackup');
  await ph.setInputFiles('#fileIn', bkPath);
  await ph.waitForFunction(() => document.querySelectorAll('#list li').length === 3);
  ok('10a 狭い画面：最初は一覧のみ', await ph.isVisible('#listPane') && !(await ph.isVisible('#readerPane')));
  await ph.click('#list li:has-text("鉄筋の定着長さ")');
  await ph.waitForSelector('#rdBody');
  ok('10b 記事を開くと閲覧画面に切替・戻るボタン', !(await ph.isVisible('#listPane')) && await ph.isVisible('#readerPane') && await ph.isVisible('#btnBack'));
  const sw = await ph.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  ok('10c 横スクロールが出ない', sw);
  await ph.goBack();
  await ph.waitForFunction(() => !document.body.classList.contains('reading'));
  ok('10d ブラウザの「戻る」で一覧へ', await ph.isVisible('#listPane'));
  await ph.screenshot({ path: path.join(os.tmpdir(), 'webclip_phone_list.png') });
  await ph.click('#list li:has-text("鉄筋の定着長さ")');
  await ph.waitForSelector('#rdBody');
  await ph.screenshot({ path: path.join(os.tmpdir(), 'webclip_phone_reader.png') });
  await ph.click('#btnBack');
  await ph.waitForFunction(() => !document.body.classList.contains('reading'));
  ok('10e 「‹ 一覧」で一覧へ', await ph.isVisible('#listPane'));
  await ctx3.close();

  // ---- 11. PWA（インストール・オフライン・共有メニュー） ----
  const ctx4 = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true });
  const pw = await ctx4.newPage();
  pw.on('pageerror', e => errors.push('pwa: ' + e.message));
  await pw.goto(`http://127.0.0.1:${APP_PORT}/`);
  await pw.waitForURL(/WebClip\.html$/);
  ok('11a トップ URL から WebClip.html へ転送', true);
  const mf = await pw.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
  ok('11b マニフェスト（名前・standalone・アイコン・共有）', mf.short_name === 'WebClip' && mf.display === 'standalone' &&
    mf.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable') && mf.share_target && mf.share_target.params.url === 'url');
  const iconOk = await pw.evaluate(async m => {
    for (const i of m.icons) { const r = await fetch(i.src); if (!r.ok) return i.src; const b = await createImageBitmap(await r.blob()); if (b.width + 'x' + b.height !== i.sizes) return i.src + ' ' + b.width; }
    return 'ok';
  }, mf);
  ok('11c アイコンが読め、サイズが合っている', iconOk === 'ok', iconOk);
  await pw.evaluate(() => navigator.serviceWorker.ready);
  ok('11d Service Worker が有効', await pw.evaluate(() => !!navigator.serviceWorker.controller) || (await pw.reload(), await pw.evaluate(() => !!navigator.serviceWorker.controller)));
  const cdp = await ctx4.newCDPSession(pw);
  const inst = await cdp.send('Page.getInstallabilityErrors');
  ok('11e Chromium の判定でインストール可能', inst.installabilityErrors.length === 0, JSON.stringify(inst.installabilityErrors));
  const man = await cdp.send('Page.getAppManifest');
  ok('11f マニフェストの解析エラーなし', man.errors.length === 0, JSON.stringify(man.errors));
  // オフライン起動
  await ctx4.setOffline(true);
  await pw.reload();
  await pw.waitForFunction(() => document.querySelector('#count').textContent !== '');
  ok('11g オフラインでも起動する', (await pw.textContent('.appbar')).includes('WebClip'));
  await ctx4.setOffline(false);
  // 共有メニュー：URL だけ（Android の Chrome は text に URL を入れる）
  await pw.goto(APP + '?title=' + encodeURIComponent('共有されたページ') + '&text=' + encodeURIComponent('https://share.example.com/news/1'));
  await pw.waitForSelector('#pTitle');
  ok('11h 共有（URL）→ リンクのみの確認画面', await pw.inputValue('#pTitle') === '共有されたページ' && await pw.inputValue('#pUrl') === 'https://share.example.com/news/1' &&
    (await pw.textContent('.infoBox')).includes('リンクのみ'));
  ok('11i 共有パラメータを URL から消す', !pw.url().includes('?'), pw.url());
  await pw.click('#iSave');
  await pw.waitForSelector('#modalWrap[hidden]', { state: 'attached' });
  ok('11j 共有から保存', (await pw.textContent('#list')).includes('共有されたページ'));
  // 共有メニュー：選択した文字（文字列 + #:~:text= 付き URL）
  await pw.goto(APP + '?text=' + encodeURIComponent('"かぶり厚さは重要" https://share.example.com/news/2#:~:text=abc'));
  await pw.waitForSelector('#pTitle');
  ok('11k 共有（選択文字）→ 本文つき・URL のテキスト断片を除く', await pw.inputValue('#pUrl') === 'https://share.example.com/news/2' &&
    (await pw.textContent('#pvBody')).includes('かぶり厚さは重要'));
  await ctx4.close();

  await app.screenshot({ path: path.join(os.tmpdir(), 'webclip_pc.png') });
  ok('99 ページエラーなし', errors.length === 0, errors.join(' / '));

  await browser.close(); s1.close(); s2.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
