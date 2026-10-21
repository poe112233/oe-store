/**
 * 404 页面模板（内联在 Function 里，不放 public/404.html）。
 *
 * 为什么内联：Root 目录一旦存在 404.html，CF Pages 对「未命中任何资源」的请求
 * 会改走它自己的 404 流程，导致 /admin、/zzz 这类客户端路由被 308 踢回首页。
 * 内联后兜底行为保持原样，只有真正的「内容页不存在」才返回这张页面。
 */
export const NOT_FOUND_HTML = `
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, follow">
<title>Page not found — Oriental Essence</title>
<meta name="description" content="This page is no longer available. Contact our team and we will help you find the piece.">
<link rel="icon" href="/favicon.ico">
<style>
  :root{
    --paper:#faf8f5; --paper2:#f2ede6; --ink:#0b0b0c; --muted:#7a7570;
    --gold:#c8a96a; --line:#e6e0d6;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:var(--paper);color:var(--ink)}
  body{
    font-family:"Jost","Helvetica Neue",Arial,sans-serif;
    min-height:100vh;display:flex;align-items:center;justify-content:center;
    padding:32px 20px;
  }
  .card{max-width:660px;width:100%;text-align:center}
  .eyebrow{
    font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:var(--gold);
    margin-bottom:18px;
  }
  .brand{
    font-size:12px;letter-spacing:.42em;text-transform:uppercase;color:var(--muted);
    margin-bottom:44px;
  }
  h1{
    font-family:"Cormorant Garamond",Georgia,serif;
    font-weight:500;font-size:clamp(30px,5vw,46px);line-height:1.15;
    margin:0 0 18px;
  }
  h1 em{font-style:italic;color:var(--gold)}
  p{color:var(--muted);font-size:15px;line-height:1.75;margin:0 auto 10px;max-width:520px}
  .zh{font-size:14px;color:var(--muted);margin-top:2px}
  .rule{height:1px;background:var(--line);margin:34px auto;max-width:120px}
  .contacts{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin:26px 0 8px}
  .contacts a{
    display:inline-block;padding:11px 20px;border:1px solid var(--ink);
    color:var(--ink);text-decoration:none;font-size:12px;letter-spacing:.16em;
    text-transform:uppercase;transition:.18s;
  }
  .contacts a:hover{background:var(--ink);color:#fff}
  .contacts a.ghost{border-color:var(--line);color:var(--muted)}
  .contacts a.ghost:hover{background:var(--paper2);color:var(--ink)}
  .countdown{margin-top:26px;font-size:12px;letter-spacing:.14em;color:var(--muted)}
  .countdown b{color:var(--ink)}
  .home-link{
    display:inline-block;margin-top:14px;font-size:13px;color:var(--ink);
    border-bottom:1px solid var(--gold);text-decoration:none;padding-bottom:2px;
  }
  @media (max-width:520px){ .brand{margin-bottom:30px} }
</style>
</head>
<body>
  <div class="card">
    <div class="brand">Oriental Essence</div>
    <div class="eyebrow">Error 404 · Index not found</div>
    <h1>This piece has <em>left the gallery</em></h1>
    <p>
      The page you were looking for doesn’t exist — it may have been sold, or the link is out of date.
      Tell us what you’re after and our team will source it for you.
    </p>
    <p class="zh">该索引不存在或商品已下架。如需寻找同款，请联系网站下方的工作人员，我们会亲自为您服务。</p>

    <div class="rule"></div>

    <div class="contacts" id="contacts">
      <a class="ghost" href="/">Return to homepage</a>
    </div>

    <div class="countdown" id="countdown"></div>
    <a class="home-link" href="/">Back to ores.cc home →</a>
  </div>

<script>
(function () {
  var SECONDS = 10;
  var wrap = document.getElementById('contacts');
  var cd = document.getElementById('countdown');

  /* 联系渠道：从站点设置实时读取（与页脚「Follow us」同一份数据），取不到就只留首页按钮 */
  fetch('/site-contact.json', { credentials: 'omit' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (c) {
      if (!c) return;
      var items = [
        ['Telegram', c.telegram],
        ['WhatsApp', c.whatsapp],
        ['Discord', c.discord || c.discord_profile],
        ['Email', c.email ? 'mailto:' + c.email : ''],
        ['Instagram', c.instagram],
        ['TikTok', c.tiktok]
      ];
      items.forEach(function (it) {
        if (!it[1]) return;
        var a = document.createElement('a');
        a.href = it[1];
        a.textContent = 'Contact via ' + it[0];
        if (it[1].indexOf('http') === 0) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        wrap.appendChild(a);
      });
    })
    .catch(function () { /* 静默：联系渠道不是必需 */ });

  /* 自动跳回首页，同时保留可见的返回链接（爬虫与用户都能看懂） */
  var left = SECONDS;
  function tick() {
    cd.innerHTML = 'Returning to the homepage in <b>' + left + '</b>s';
    if (left <= 0) { location.replace('/'); return; }
    left -= 1;
    setTimeout(tick, 1000);
  }
  tick();
})();
</script>
</body>
</html>
`
