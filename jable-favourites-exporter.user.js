// ==UserScript==
// @name         Jable Favourites Exporter
// @namespace    shane.tools
// @version      1.0.0
// @description  Export titles, URLs, views, and likes from Jable favourites pages by simulating pagination clicks (no direct crawling).
// @license      MIT
// @author       shane
// @match        https://jable.tv/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  /* ---------------------------------------
   * Configuration
   * ------------------------------------- */
  // 可選：'json' 或 'csv'
  var EXPORT_FORMAT = 'json';

  /* ---------------------------------------
   * Selectors
   * ------------------------------------- */
  var SEL_SETTINGS = 'nav.profile-nav a.right';             // 設定按鈕
  var SEL_LIST_CONTAINER = '#list_videos_my_favourite_videos'; // 清單容器
  var SEL_TITLES = 'div.detail h6.title a';                 // 標題 <a>
  var SEL_PAGER = 'ul.pagination';                          // 分頁容器
  var SEL_PAGER_LINKS = 'ul.pagination a.page-link';        // 可點擊的分頁
  var BTN_ID = 'fav-export-all-btn';                        // 匯出按鈕 ID

  /* ---------------------------------------
   * File naming by current path
   * ------------------------------------- */
  function fileBaseByPath() {
    var url = location.pathname.replace(/[?#].*$/, '');
    if (/\/my\/favourites\/videos-watch-later\/?$/.test(url)) return 'watch_later_list';
    if (/\/my\/favourites\/videos\/?$/.test(url)) return 'favourites_list';
    return 'export_list';
  }

  /* ---------------------------------------
   * Utilities
   * ------------------------------------- */
  function log() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[FavExporter]');
    console.log.apply(console, args);
  }

  function escCsv(s) {
    s = (s == null ? '' : String(s));
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function uniqByUrl(rows) {
    var seen = {};
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var u = rows[i].url;
      if (!u) continue;
      if (!seen[u]) {
        seen[u] = 1;
        out.push(rows[i]);
      }
    }
    return out;
  }

  function toCSV(rows) {
    var lines = ['title,url,views,likes'];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      lines.push(
        escCsv(r.title) + ',' +
        escCsv(r.url) + ',' +
        (r.views || '') + ',' +
        (r.likes || '')
      );
    }
    return lines.join('\n');
  }

  function downloadBlob(name, blob) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function downloadCsv(name, text) {
    downloadBlob(name, new Blob([text], { type: 'text/csv;charset=utf-8;' }));
  }

  function downloadJson(name, data) {
    downloadBlob(name, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  }

  function absUrl(href, base) {
    try {
      return new URL(href, base || location.href).href;
    } catch (e) {
      return href;
    }
  }

  /* ---------------------------------------
   * Scraping helpers
   * ------------------------------------- */
  // 擷取當前頁面 { title, url, views, likes }
  function scrapeCurrentPage() {
    var out = [];
    var boxes = document.querySelectorAll('div.video-img-box');

    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      var a = box.querySelector('div.detail h6.title a');
      if (!a) continue;

      var title = (a.textContent || '').replace(/\s+/g, ' ').trim();
      var href = a.getAttribute('href') || '';

      var views = null;
      var likes = null;

      var sub = box.querySelector('div.detail p.sub-title');
      if (sub) {
        var texts = [];
        for (var n = 0; n < sub.childNodes.length; n++) {
          var node = sub.childNodes[n];
          if (node.nodeType === Node.TEXT_NODE) {
            var t = node.textContent.replace(/\s+/g, ' ').trim();
            if (t) texts.push(t);
          }
        }
        if (texts.length >= 1) {
          views = parseInt(texts[0].replace(/[^\d]/g, ''), 10) || null;
        }
        if (texts.length >= 2) {
          likes = parseInt(texts[1].replace(/[^\d]/g, ''), 10) || null;
        }
      }

      if (!href) continue;
      out.push({
        title: title,
        url: absUrl(href),
        views: views,
        likes: likes
      });
    }

    return out;
  }

  /* ---------------------------------------
   * Pagination helpers
   * ------------------------------------- */
  function signature() {
    var list = document.querySelectorAll(SEL_TITLES);
    var count = list.length;
    var first = count ? (list[0].getAttribute('href') || '') : '';
    return count + '|' + first;
  }

  function waitForContainerChange(oldSig, timeoutMs) {
    if (!timeoutMs) timeoutMs = 12000;
    var target = document.querySelector(SEL_LIST_CONTAINER) || document.body;
    var deadline = Date.now() + timeoutMs;

    return new Promise(function (resolve) {
      var done = false;

      function check() {
        var cur = signature();
        if (cur && cur !== oldSig) {
          done = true;
          resolve(true);
        } else if (Date.now() > deadline) {
          done = true;
          resolve(false);
        }
      }

      var mo = new MutationObserver(function () { check(); });
      mo.observe(target, { childList: true, subtree: true });

      (function poll() {
        if (done) { mo.disconnect(); return; }
        check();
        if (!done) setTimeout(poll, 300);
        else mo.disconnect();
      })();
    });
  }

  function readPagerLinks() {
    var pager = document.querySelector(SEL_PAGER);
    if (!pager) return [];

    var anchors = pager.querySelectorAll(SEL_PAGER_LINKS);
    var out = [];

    for (var i = 0; i < anchors.length; i++) {
      var a = anchors[i];
      var txt = (a.textContent || '').replace(/\s+/g, ' ').trim();

      var params = a.getAttribute('data-parameters') || '';
      var m = params.match(/(?:^|;)from(?:_my_fav_videos)?:\s*(\d+)/);

      var pid = null;
      if (m) pid = m[1];
      else if (/^\d+$/.test(txt)) pid = txt;
      else pid = txt || ('a_' + i);

      out.push({ el: a, id: pid, label: txt });
    }

    return out;
  }

  /* ---------------------------------------
   * Main flow
   * ------------------------------------- */
  function exportAllByClick() {
    setBtnBusy(true, '準備中…');

    var all = uniqByUrl(scrapeCurrentPage());
    var visited = {};
    var safety = 100;

    var active = document.querySelector('ul.pagination span.page-link.active');
    if (active) {
      var t = (active.textContent || '').trim();
      if (t) visited[t] = true;
    }

    function step() {
      if (safety-- <= 0) return finish();

      var links = readPagerLinks();
      var candidates = [];

      for (var i = 0; i < links.length; i++) {
        if (!visited[links[i].id]) candidates.push(links[i]);
      }

      if (!candidates.length) return finish();

      candidates.sort(function (a, b) {
        var na = parseInt(a.id, 10);
        var nb = parseInt(b.id, 10);
        if (isFinite(na) && isFinite(nb)) return na - nb;
        return String(a.id).localeCompare(String(b.id));
      });

      var next = candidates[0];
      var oldSig = signature();

      try { next.el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}

      setTimeout(function () {
        log('click page', next.id, '(' + next.label + ')');
        try { next.el.click(); } catch (e) {}

        waitForContainerChange(oldSig, 15000).then(function () {
          var rows = scrapeCurrentPage();
          all = uniqByUrl(all.concat(rows));
          visited[next.id] = true;

          log('page', next.id, 'rows', rows.length, 'total', all.length);
          setBtnBusy(true, '已擷取 ' + all.length + ' 筆，前往下一頁…');
          setTimeout(step, 500 + Math.random() * 500);
        });
      }, 200);
    }

    function finish() {
      setBtnBusy(false, '完成，匯出中…');
      var base = fileBaseByPath();

      if (EXPORT_FORMAT === 'csv') {
        downloadCsv(base + '.csv', toCSV(all));
      } else {
        downloadJson(base + '.json', all);
      }

      log('done, total:', all.length);
    }

    step();
  }

  /* ---------------------------------------
   * UI: add export button
   * ------------------------------------- */
  function setBtnBusy(busy, text) {
    var btn = document.getElementById(BTN_ID);
    if (!btn) return;

    if (!btn.getAttribute('data-label')) {
      btn.setAttribute('data-label', btn.textContent);
    }

    btn.disabled = !!busy;
    btn.textContent = busy ? (text || '處理中…') : btn.getAttribute('data-label');
    btn.style.opacity = busy ? '0.7' : '1';
  }

  function addNavButton() {
    if (document.getElementById(BTN_ID)) return true;

    var settings = document.querySelector(SEL_SETTINGS);
    if (settings) {
      var btn = document.createElement('a');
      btn.id = BTN_ID;
      btn.href = 'javascript:void(0)';
      btn.textContent = '匯出全部';
      btn.className = (settings.className || '').replace(/\bright\b/, '').trim();
      btn.style.marginRight = '12px';
      btn.addEventListener('click', exportAllByClick);

      settings.parentNode.insertBefore(btn, settings);
      log('inserted before settings');
      return true;
    }

    // 後備浮動按鈕
    var f = document.createElement('button');
    f.id = BTN_ID;
    f.textContent = '📦 匯出所有分頁影片';
    f.style.position = 'fixed';
    f.style.right = '16px';
    f.style.bottom = '16px';
    f.style.zIndex = '99999';
    f.style.background = '#f36';
    f.style.color = '#fff';
    f.style.border = 'none';
    f.style.borderRadius = '8px';
    f.style.padding = '8px 12px';
    f.style.cursor = 'pointer';
    f.style.fontSize = '14px';
    f.addEventListener('click', exportAllByClick);

    document.body.appendChild(f);
    log('fallback floating button inserted');
    return true;
  }

  // 嘗試插入按鈕
  (function waitAndInsert() {
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      if (addNavButton()) clearInterval(t);
      else if (tries > 40) {
        clearInterval(t);
        addNavButton();
      }
    }, 500);
  })();

  // SPA 變動時補插
  var mo = new MutationObserver(function () {
    if (!document.getElementById(BTN_ID)) addNavButton();
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
