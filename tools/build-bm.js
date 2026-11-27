// WebClip.html のブックマークレット本体（/*BM-START*/〜/*BM-END*/）から bm.js を作ります。
// 短い版のブックマークレットは、実行時にこの bm.js を読み込みます。
//   生成： node tools/build-bm.js
//   確認： node tools/build-bm.js --check   （bm.js が最新でなければ終了コード 1）
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

function build() {
  const html = fs.readFileSync(path.join(ROOT, 'WebClip.html'), 'utf8');
  const ver = (html.match(/const APP_VERSION = '([^']+)';/) || [])[1];
  const m = html.match(/\/\*BM-START\*\/\n([\s\S]*?)\/\*BM-END\*\//);
  if (!ver || !m) throw new Error('WebClip.html に APP_VERSION または BM-START/BM-END が見つかりません');
  return '/* WebClip ブックマークレット本体 v' + ver + '\n' +
    '   短い版のブックマークレットが実行時に読み込みます。WebClip.html から tools/build-bm.js で生成しているので、直接編集しないでください。 */\n' +
    '(function () {\n' +
    '  var cs = document.currentScript, base = cs && cs.src ? cs.src.replace(/[?#].*$/, \'\').replace(/[^\\/]*$/, \'\') : \'\';\n' +
    m[1].replace(/^/gm, '  ').replace(/^ +$/gm, '') +
    '  WC_BM(base ? base + \'WebClip.html\' : \'\', ' + JSON.stringify(ver) + ');\n' +
    '})();\n';
}

const out = build(), file = path.join(ROOT, 'bm.js');
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (cur !== out) { console.error('bm.js が WebClip.html と一致しません。node tools/build-bm.js を実行してください。'); process.exit(1); }
  console.log('bm.js は最新です。');
} else {
  fs.writeFileSync(file, out);
  console.log('bm.js を生成しました（' + out.length + ' 文字）。');
}
