/* 记账小工具：只有「不登录」模式，数据存在当前浏览器（localStorage） */
(function () {
  'use strict';

  var KEY = 'ledger.v1';
  var DEF_EXP = ['餐饮', '交通', '购物', '住房', '娱乐', '医疗', '其他'];
  var DEF_INC = ['工资', '奖金', '理财', '其他'];
  var WEEK = ['日', '一', '二', '三', '四', '五', '六'];

  /* ---------- 小工具 ---------- */
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function ym(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function shiftYM(s, delta) {
    var p = s.split('-').map(Number);
    return ym(new Date(p[0], p[1] - 1 + delta, 1));
  }
  function ymLabel(s) { var p = s.split('-'); return p[0] + '年' + Number(p[1]) + '月'; }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function str(x, n) { return String(x == null ? '' : x).trim().slice(0, n); }
  function money(c) {
    var v = Math.abs(c) / 100;
    return (c < 0 ? '-' : '') + '¥' + v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function parseAmount(t) {
    t = String(t).replace(/[¥￥,\s]/g, '');
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
    var c = Math.round(parseFloat(t) * 100);
    return c > 0 && c <= 9999999999 ? c : null;
  }
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var SVGNS = 'http://www.w3.org/2000/svg';
  function append(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(function (x) { append(el, x); });
    else if (c.nodeType) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
  function h(tag, attrs) {
    var el = document.createElement(tag);
    var value;
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'value') value = v;
        else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    if (value !== undefined) el.value = value;
    return el;
  }
  function svgEl(tag, attrs) {
    var el = document.createElementNS(SVGNS, tag);
    Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
    return el;
  }

  /* ---------- 数据 ---------- */
  function defaults() {
    return {
      app: 'ledger', version: 1, name: '',
      categories: { expense: DEF_EXP.slice(), income: DEF_INC.slice() },
      records: [], budget: { total: 0, byCat: {} }, recurring: [],
      lastRecurringMonth: '', lastBackupMonth: '', mascotOn: true
    };
  }
  var YM_RE = /^\d{4}-\d{2}$/;
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  function cents(x) { x = Math.round(Number(x)); return isFinite(x) && x > 0 && x <= 9999999999 ? x : 0; }

  /* 把任意对象整理成合法的账本数据；strict 用于导入，格式不对直接抛错 */
  function normalize(o, strict) {
    if (!o || typeof o !== 'object') throw new Error('这不是有效的账本备份');
    if (strict && (o.app !== 'ledger' || !Array.isArray(o.records))) throw new Error('这不是本工具导出的备份文件');
    var d = defaults();
    d.name = str(o.name, 30);
    ['expense', 'income'].forEach(function (k) {
      var arr = o.categories && Array.isArray(o.categories[k]) ? o.categories[k] : [];
      var seen = {};
      var list = [];
      arr.forEach(function (x) {
        x = str(x, 12);
        if (x && !seen[x]) { seen[x] = 1; list.push(x); }
      });
      if (!list.length) list = (k === 'expense' ? DEF_EXP : DEF_INC).slice();
      if (list.indexOf('其他') < 0) list.push('其他');
      d.categories[k] = list;
    });
    (Array.isArray(o.records) ? o.records : []).forEach(function (r) {
      if (!r || (r.type !== 'income' && r.type !== 'expense')) return;
      var a = cents(r.amount);
      if (!a || !DATE_RE.test(String(r.date))) return;
      var cat = str(r.cat, 12) || '其他';
      var list = d.categories[r.type];
      if (list.indexOf(cat) < 0) list.push(cat);
      var rec = { id: str(r.id, 30) || uid(), type: r.type, amount: a, cat: cat, date: String(r.date), note: str(r.note, 200) };
      if (r.rec) rec.rec = 1;
      d.records.push(rec);
    });
    if (o.budget) {
      d.budget.total = cents(o.budget.total);
      var bc = o.budget.byCat || {};
      Object.keys(bc).forEach(function (k) { var v = cents(bc[k]); if (v && k) d.budget.byCat[str(k, 12)] = v; });
    }
    (Array.isArray(o.recurring) ? o.recurring : []).forEach(function (r) {
      if (!r) return;
      var a = cents(r.amount);
      var day = Math.round(Number(r.day));
      var name = str(r.name, 20);
      if (!a || !name || !(day >= 1 && day <= 31)) return;
      var cat = str(r.cat, 12) || '其他';
      if (d.categories.expense.indexOf(cat) < 0) d.categories.expense.push(cat);
      d.recurring.push({ id: str(r.id, 30) || uid(), name: name, amount: a, cat: cat, day: day });
    });
    d.lastRecurringMonth = YM_RE.test(String(o.lastRecurringMonth)) ? o.lastRecurringMonth : '';
    d.lastBackupMonth = YM_RE.test(String(o.lastBackupMonth)) ? o.lastBackupMonth : '';
    d.mascotOn = o.mascotOn !== false;
    return d;
  }

  var storageOK = true;
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) return normalize(JSON.parse(raw), false);
    } catch (e) { /* 读不到就当作新账本 */ }
    return defaults();
  }
  var S = load();
  var warnedStorage = false;
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
      storageOK = true;
    } catch (e) {
      storageOK = false;
      if (!warnedStorage) {
        warnedStorage = true;
        toast('浏览器不允许保存数据（可能是隐私模式），请及时备份');
      }
    }
  }
  function exportData() {
    return {
      app: 'ledger', version: 1, exportedAt: new Date().toISOString(),
      name: S.name, categories: S.categories, records: S.records,
      budget: S.budget, recurring: S.recurring, lastRecurringMonth: S.lastRecurringMonth
    };
  }

  /* 每月第一次打开时补记固定支出 */
  function applyRecurring() {
    var cur = ym(new Date());
    if (S.lastRecurringMonth === cur) return 0;
    var p = cur.split('-').map(Number);
    var dim = new Date(p[0], p[1], 0).getDate();
    var n = 0;
    S.recurring.forEach(function (r) {
      S.records.push({ id: uid(), type: 'expense', amount: r.amount, cat: r.cat, date: cur + '-' + pad(Math.min(r.day, dim)), note: r.name, rec: 1 });
      n++;
    });
    S.lastRecurringMonth = cur;
    persist();
    return n;
  }

  function backupDue() {
    var d = new Date();
    var dim = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    return d.getDate() >= dim - 2 && S.lastBackupMonth !== ym(d) && S.records.length > 0;
  }

  /* ---------- 界面状态（不保存） ---------- */
  var ui = {
    ym: ym(new Date()),
    filter: { q: '', type: '', cat: '', from: '', to: '' },
    showFilter: false, donut: 'expense', limit: 40, bannerHidden: false, lastBal: 0
  };
  var M = null;
  var mascotBox = h('div', { class: 'mascot-box' });

  function catIndex(type, cat) {
    var i = S.categories[type].indexOf(cat);
    return i < 0 ? 7 : i % 8;
  }
  function monthRecords(s) { return S.records.filter(function (r) { return r.date.slice(0, 7) === s; }); }
  function sums(recs) {
    var inc = 0, exp = 0;
    recs.forEach(function (r) { if (r.type === 'income') inc += r.amount; else exp += r.amount; });
    return { inc: inc, exp: exp };
  }

  /* 预算状态：level 0 正常，1 用到 80%，2 超支 */
  function budgetState(s) {
    var recs = monthRecords(s).filter(function (r) { return r.type === 'expense'; });
    var total = 0;
    var by = {};
    recs.forEach(function (r) { total += r.amount; by[r.cat] = (by[r.cat] || 0) + r.amount; });
    var items = [];
    if (S.budget.total) items.push({ key: 'total', name: '本月总预算', spent: total, limit: S.budget.total });
    Object.keys(S.budget.byCat).forEach(function (c) {
      items.push({ key: c, name: c, spent: by[c] || 0, limit: S.budget.byCat[c] });
    });
    var level = 0, text = '';
    items.forEach(function (it) {
      it.ratio = Math.floor(it.spent * 100 / it.limit);
      it.level = it.spent > it.limit ? 2 : (it.ratio >= 80 ? 1 : 0);
      if (it.level > level) {
        level = it.level;
        var nm = it.key === 'total' ? '总预算' : '「' + it.name + '」预算';
        text = it.level === 2 ? nm + '超支 ' + money(it.spent - it.limit) + ' 了。' : nm + '已用 ' + it.ratio + '%，快到上限了。';
      }
    });
    return { level: level, text: text, items: items };
  }

  /* ---------- 提示与弹层 ---------- */
  var toastTimer;
  function toast(msg) {
    var old = document.querySelector('.toast');
    if (old) old.remove();
    var t = h('div', { class: 'toast', role: 'status', text: msg });
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, 2600);
  }

  var layers = [];
  function openLayer(content, opts) {
    opts = opts || {};
    var dismiss = opts.dismiss !== false;
    var L = {};
    var bd = h('div', {
      class: 'backdrop' + (opts.dialog ? ' dialog' : ''),
      onclick: function (e) { if (e.target === bd && dismiss) L.close(); }
    }, content);
    L.dismiss = dismiss;
    L.close = function () {
      var i = layers.indexOf(L);
      if (i < 0) return;
      layers.splice(i, 1);
      bd.remove();
      if (!layers.length) document.body.classList.remove('lock');
      if (opts.onClose) opts.onClose();
    };
    layers.push(L);
    document.body.appendChild(bd);
    document.body.classList.add('lock');
    return L;
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && layers.length) {
      var L = layers[layers.length - 1];
      if (L.dismiss) L.close();
    }
  });

  function askConfirm(msg, okLabel, cb) {
    var L = openLayer(h('div', { class: 'sheet', role: 'dialog' },
      h('div', { class: 'dlg-body', style: 'padding-top:18px' },
        h('p', { text: msg }),
        h('div', { class: 'btns' },
          h('button', { class: 'btn', type: 'button', text: '取消', onclick: function () { L.close(); } }),
          h('button', { class: 'btn danger', type: 'button', text: okLabel, onclick: function () { L.close(); cb(); } })
        ))), { dialog: true });
  }

  function textBox(title, text, note) {
    var ta = h('textarea', { class: 'box', readonly: true, rows: 8 });
    ta.value = text;
    var L = openLayer(h('div', { class: 'sheet', role: 'dialog' },
      h('div', { class: 'dlg-title', text: title }),
      h('div', { class: 'dlg-body' },
        note ? h('p', { class: 'hint', text: note }) : null,
        ta,
        h('div', { class: 'btns' },
          h('button', { class: 'btn', type: 'button', text: '全选', onclick: function () { ta.focus(); ta.select(); } }),
          h('button', { class: 'btn primary', type: 'button', text: '复制', onclick: function () { copyText(text, ta); } }),
          h('button', { class: 'btn', type: 'button', text: '关闭', onclick: function () { L.close(); } })
        ))), { dialog: true });
    setTimeout(function () { ta.focus(); ta.select(); }, 30);
  }

  function copyText(text, ta) {
    function fallback() {
      try {
        if (ta) { ta.focus(); ta.select(); }
        if (ta && document.execCommand && document.execCommand('copy')) { toast('已复制'); return; }
      } catch (e) { /* 忽略 */ }
      toast('没能自动复制，请长按选中后手动复制');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('已复制'); }, fallback);
    } else fallback();
  }

  function download(text, name, mime) {
    try {
      var blob = new Blob([text], { type: mime });
      var url = URL.createObjectURL(blob);
      var a = h('a', { href: url, download: name });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return true;
    } catch (e) { return false; }
  }

  /* ---------- 导出 / 备份 / 导入 ---------- */
  function csvCell(v) {
    v = String(v);
    if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
    return '"' + v.replace(/"/g, '""') + '"';
  }
  function doCSV() {
    var rows = S.records.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var lines = ['日期,类型,分类,金额(元),备注'];
    rows.forEach(function (r) {
      lines.push([r.date, r.type === 'income' ? '收入' : '支出', r.cat, (r.amount / 100).toFixed(2), r.note].map(csvCell).join(','));
    });
    var text = '﻿' + lines.join('\r\n');
    if (download(text, '记账-' + ymd(new Date()) + '.csv', 'text/csv;charset=utf-8')) toast('已导出 CSV，请到下载文件夹查看');
    else textBox('CSV 文本', lines.join('\n'), '这台设备不允许下载文件。复制后粘贴到记事本，保存为 .csv 即可。');
  }
  function markBackup() { S.lastBackupMonth = ym(new Date()); persist(); render(); refreshMood(); }
  function doBackup() {
    var json = JSON.stringify(exportData(), null, 2);
    if (download(json, '账本备份-' + ymd(new Date()) + '.json', 'application/json')) {
      markBackup();
      toast('备份文件已生成。没看到下载的话，用「复制备份文本」');
    } else {
      textBox('备份文本', json, '这台设备不允许下载文件。请复制下面的文本，存到备忘录或发给自己。');
      markBackup();
    }
  }
  function doCopyBackup() {
    var json = JSON.stringify(exportData());
    copyText(json, null);
    markBackup();
  }
  function importText(text) {
    var data;
    try { data = normalize(JSON.parse(text), true); } catch (e) {
      toast(e instanceof SyntaxError ? '内容不是有效的备份（JSON 格式错误）' : e.message);
      return;
    }
    askConfirm('导入会覆盖当前账本（现有 ' + S.records.length + ' 笔记录），备份里有 ' + data.records.length + ' 笔。确定导入吗？', '覆盖并导入', function () {
      data.lastBackupMonth = S.lastBackupMonth;
      data.mascotOn = S.mascotOn;
      S = data;
      persist();
      closeAll();
      render();
      refreshMood();
      toast('已恢复备份');
    });
  }
  function closeAll() { while (layers.length) layers[layers.length - 1].close(); }

  /* ---------- 账本名 ---------- */
  function nameDialog(first) {
    var input = h('input', { id: 'name-in', type: 'text', maxlength: '30', placeholder: '例如：小明的账本', value: S.name, autocomplete: 'off' });
    function done() {
      S.name = str(input.value, 30) || '我的账本';
      persist();
      L.close();
      render();
      if (first) refreshMood();
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') done(); });
    var L = openLayer(h('div', { class: 'sheet', role: 'dialog' },
      h('div', { class: 'dlg-title', text: first ? '给你的账本起个名字' : '修改账本名' }),
      h('div', { class: 'dlg-body' },
        h('p', { class: 'hint', text: first ? '不需要手机号和邮箱，数据只存在这个浏览器里。名字之后可以随时改。' : '' }),
        h('div', { class: 'field' }, input),
        h('div', { class: 'btns' },
          first ? null : h('button', { class: 'btn', type: 'button', text: '取消', onclick: function () { L.close(); } }),
          h('button', { class: 'btn primary', type: 'button', text: '确定', onclick: done })
        ))), { dialog: true, dismiss: !first });
    setTimeout(function () { input.focus(); input.select(); }, 30);
  }

  /* ---------- 记一笔 ---------- */
  function openForm(rec) {
    var type = rec ? rec.type : 'expense';
    var cat = rec ? rec.cat : null;
    var amt = h('input', { id: 'f-amount', type: 'text', inputmode: 'decimal', placeholder: '0.00', autocomplete: 'off', value: rec ? (rec.amount / 100).toFixed(2) : '' });
    var date = h('input', { id: 'f-date', type: 'date', value: rec ? rec.date : ymd(new Date()) });
    var note = h('input', { id: 'f-note', type: 'text', maxlength: '200', placeholder: '备注（可不填）', value: rec ? rec.note : '', autocomplete: 'off' });
    var err = h('div', { class: 'err', role: 'alert' });
    var seg = h('div', { class: 'seg', role: 'group', 'aria-label': '收支类型' });
    var chips = h('div', { class: 'chips', role: 'group', 'aria-label': '分类' });
    var delArmed = false;

    function drawSeg() {
      seg.textContent = '';
      [['expense', '支出'], ['income', '收入']].forEach(function (p) {
        seg.appendChild(h('button', {
          type: 'button', text: p[1], 'aria-pressed': String(type === p[0]),
          onclick: function () { type = p[0]; cat = null; drawSeg(); drawChips(); }
        }));
      });
    }
    function drawChips() {
      var list = S.categories[type];
      if (!cat || list.indexOf(cat) < 0) cat = list[0];
      chips.textContent = '';
      list.forEach(function (c) {
        chips.appendChild(h('button', {
          type: 'button', class: 'chip', text: c, 'aria-pressed': String(cat === c),
          onclick: function () { cat = c; drawChips(); }
        }));
      });
    }
    function save() {
      var a = parseAmount(amt.value);
      if (!a) { err.textContent = '请输入大于 0 的金额，最多两位小数'; amt.focus(); return; }
      if (!DATE_RE.test(date.value)) { err.textContent = '请选择日期'; return; }
      var r = { id: rec ? rec.id : uid(), type: type, amount: a, cat: cat, date: date.value, note: str(note.value, 200) };
      if (rec && rec.rec) r.rec = 1;
      if (rec) S.records[S.records.indexOf(rec)] = r; else S.records.push(r);
      persist();
      L.close();
      ui.ym = r.date.slice(0, 7);
      render();
      reactSaved(r, !!rec);
    }
    amt.addEventListener('keydown', function (e) { if (e.key === 'Enter') save(); });
    note.addEventListener('keydown', function (e) { if (e.key === 'Enter') save(); });

    var delBtn = rec ? h('button', {
      class: 'btn danger', type: 'button', text: '删除这笔',
      onclick: function () {
        if (!delArmed) { delArmed = true; delBtn.textContent = '再点一次确认删除'; return; }
        S.records.splice(S.records.indexOf(rec), 1);
        persist(); L.close(); render(); refreshMood(); toast('已删除');
      }
    }) : null;

    drawSeg(); drawChips();
    var L = openLayer(h('div', { class: 'sheet', role: 'dialog', 'aria-label': rec ? '修改记录' : '记一笔' },
      h('div', { class: 'sheet-head' }, h('span', { text: rec ? '修改记录' : '记一笔' }),
        h('button', { class: 'iconbtn', type: 'button', text: '关闭', onclick: function () { L.close(); } })),
      h('div', { class: 'sheet-scroll' },
        seg,
        h('div', { class: 'field' }, h('label', { for: 'f-amount', text: '金额' }),
          h('div', { class: 'amount-in' }, h('span', { class: 'num', text: '¥' }), amt)),
        h('div', { class: 'field' }, h('span', { class: 'lab', text: '分类' }), chips),
        h('div', { class: 'field' }, h('label', { for: 'f-date', text: '日期' }), date),
        h('div', { class: 'field' }, h('label', { for: 'f-note', text: '备注' }), note),
        err,
        h('div', { class: 'btns' }, delBtn, h('button', { class: 'btn primary block', type: 'button', text: '保存', onclick: save }))
      )));
    setTimeout(function () { amt.focus(); }, 40);
  }

  function reactSaved(r, edited) {
    if (!M) return;
    if (edited) { M.react('nod', '✻ 已更新'); return; }
    var b = budgetState(r.date.slice(0, 7));
    if (r.type === 'income') { M.react('happy', '✻ 进账 ' + money(r.amount) + '，不错！'); return; }
    if (b.level > 0) { M.mood('worry', '✻ 已记录 ' + r.cat + ' ' + money(r.amount) + '。' + b.text); return; }
    M.react('nod', '✻ 已记录 ' + r.cat + ' ' + money(r.amount));
  }

  /* ---------- 设置 ---------- */
  var settingsBox = null;
  function openSettings(scrollToId) {
    settingsBox = h('div', { class: 'sheet-scroll' });
    var L = openLayer(h('div', { class: 'sheet', role: 'dialog', 'aria-label': '设置' },
      h('div', { class: 'sheet-head' }, h('span', { text: '设置' }),
        h('button', { class: 'iconbtn', type: 'button', text: '完成', onclick: function () { L.close(); } })),
      settingsBox), { onClose: function () { settingsBox = null; render(); refreshMood(); } });
    renderSettings();
    if (scrollToId) {
      var t = document.getElementById(scrollToId);
      if (t) settingsBox.scrollTop = t.offsetTop - 8;
    }
  }

  function renderSettings() {
    if (!settingsBox) return;
    var keep = settingsBox.scrollTop;
    settingsBox.textContent = '';

    /* 账本名 */
    settingsBox.appendChild(h('div', { class: 'sec' },
      h('h3', { text: '账本名' }),
      h('div', { class: 'inline' },
        h('span', { text: S.name || '（未命名）', style: 'align-self:center;overflow-wrap:anywhere' }),
        h('button', { class: 'btn', type: 'button', text: '修改', onclick: function () { nameDialog(false); } }))));

    /* 预算 */
    var totalIn = h('input', { id: 's-budget-total', type: 'text', inputmode: 'decimal', placeholder: '不限', value: S.budget.total ? (S.budget.total / 100).toFixed(2) : '' });
    var catIns = {};
    var budSec = h('div', { class: 'sec', id: 's-budget' },
      h('h3', { text: '每月预算' }),
      h('p', { class: 'hint', text: '每个月都按这里的上限算。留空表示不设。用到 80% 会提醒，超过 100% 标为超支。' }),
      h('div', { class: 'bud-in' }, h('label', { for: 's-budget-total', text: '总预算（元）' }), totalIn));
    S.categories.expense.forEach(function (c, i) {
      var inp = h('input', { id: 's-budget-' + i, type: 'text', inputmode: 'decimal', placeholder: '不限', value: S.budget.byCat[c] ? (S.budget.byCat[c] / 100).toFixed(2) : '' });
      catIns[c] = inp;
      budSec.appendChild(h('div', { class: 'bud-in' }, h('label', { for: 's-budget-' + i, text: c }), inp));
    });
    var budErr = h('div', { class: 'err', role: 'alert' });
    budSec.appendChild(budErr);
    budSec.appendChild(h('button', {
      class: 'btn primary', type: 'button', text: '保存预算',
      onclick: function () {
        var total = 0;
        var by = {};
        var tv = totalIn.value.trim();
        if (tv) { total = parseAmount(tv); if (!total) { budErr.textContent = '总预算金额格式不对'; return; } }
        for (var c in catIns) {
          var v = catIns[c].value.trim();
          if (!v) continue;
          var a = parseAmount(v);
          if (!a) { budErr.textContent = '「' + c + '」的金额格式不对'; return; }
          by[c] = a;
        }
        S.budget = { total: total, byCat: by };
        persist(); render(); toast('预算已保存');
      }
    }));
    settingsBox.appendChild(budSec);

    /* 分类 */
    var catSec = h('div', { class: 'sec' }, h('h3', { text: '分类' }));
    [['expense', '支出分类'], ['income', '收入分类']].forEach(function (p) {
      var kind = p[0];
      var chips = h('div', { class: 'chips' });
      S.categories[kind].forEach(function (c) {
        if (c === '其他') { chips.appendChild(h('span', { class: 'chip', text: c })); return; }
        chips.appendChild(h('button', {
          type: 'button', class: 'chip', 'aria-label': '删除分类 ' + c,
          onclick: function () {
            var n = S.records.filter(function (r) { return r.type === kind && r.cat === c; }).length;
            askConfirm('删除「' + c + '」？' + (n ? '它下面的 ' + n + ' 笔记录会归入「其他」。' : ''), '删除', function () {
              S.records.forEach(function (r) { if (r.type === kind && r.cat === c) r.cat = '其他'; });
              S.categories[kind] = S.categories[kind].filter(function (x) { return x !== c; });
              if (kind === 'expense') {
                delete S.budget.byCat[c];
                S.recurring.forEach(function (r) { if (r.cat === c) r.cat = '其他'; });
              }
              persist(); render(); renderSettings();
            });
          }
        }, c, h('span', { class: 'x', text: '×', 'aria-hidden': 'true' })));
      });
      var inp = h('input', { id: 's-cat-' + kind, type: 'text', maxlength: '12', placeholder: '新分类名', autocomplete: 'off' });
      function add() {
        var v = str(inp.value, 12);
        if (!v) return;
        if (S.categories[kind].indexOf(v) >= 0) { toast('已经有这个分类了'); return; }
        S.categories[kind].splice(S.categories[kind].length - 1, 0, v);
        persist(); render(); renderSettings();
      }
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
      catSec.appendChild(h('div', { class: 'field' }, h('span', { class: 'lab', text: p[1] }), chips,
        h('div', { class: 'inline' }, inp, h('button', { class: 'btn', type: 'button', text: '添加', onclick: add }))));
    });
    settingsBox.appendChild(catSec);

    /* 固定支出 */
    var recSec = h('div', { class: 'sec' },
      h('h3', { text: '固定支出' }),
      h('p', { class: 'hint', text: '房租、订阅等。每月第一次打开页面时自动记入当月；新添加的从下个月开始记。' }));
    if (!S.recurring.length) recSec.appendChild(h('p', { class: 'hint', text: '还没有固定支出。' }));
    S.recurring.forEach(function (r) {
      recSec.appendChild(h('div', { class: 'rec' },
        h('span', { text: r.name + ' · ' + r.cat + ' · 每月' + r.day + '号' }),
        h('span', { class: 'num', text: money(r.amount) }),
        h('button', {
          class: 'x', type: 'button', text: '删除', 'aria-label': '删除固定支出 ' + r.name,
          onclick: function () { S.recurring = S.recurring.filter(function (x) { return x !== r; }); persist(); renderSettings(); }
        })));
    });
    var rn = h('input', { id: 's-rec-name', type: 'text', maxlength: '20', placeholder: '名称，如 房租', autocomplete: 'off' });
    var ra = h('input', { id: 's-rec-amt', type: 'text', inputmode: 'decimal', placeholder: '金额' });
    var rd = h('input', { id: 's-rec-day', type: 'number', min: '1', max: '31', placeholder: '几号', value: '1' });
    var rc = h('select', { id: 's-rec-cat', value: S.categories.expense.indexOf('住房') >= 0 ? '住房' : S.categories.expense[0] },
      S.categories.expense.map(function (c) { return h('option', { value: c, text: c }); }));
    rc.value = S.categories.expense.indexOf('住房') >= 0 ? '住房' : S.categories.expense[0];
    var recErr = h('div', { class: 'err', role: 'alert' });
    recSec.appendChild(h('div', { class: 'inline three' }, rn, ra, rd));
    recSec.appendChild(h('div', { class: 'inline' }, rc,
      h('button', {
        class: 'btn', type: 'button', text: '添加',
        onclick: function () {
          var name = str(rn.value, 20);
          var a = parseAmount(ra.value);
          var day = Math.round(Number(rd.value));
          if (!name) { recErr.textContent = '请填名称'; return; }
          if (!a) { recErr.textContent = '金额格式不对'; return; }
          if (!(day >= 1 && day <= 31)) { recErr.textContent = '日期请填 1 到 31'; return; }
          S.recurring.push({ id: uid(), name: name, amount: a, cat: rc.value, day: day });
          persist(); renderSettings();
        }
      })));
    recSec.appendChild(recErr);
    settingsBox.appendChild(recSec);

    /* 数据 */
    var ta = h('textarea', { id: 's-import-text', class: 'box', rows: 4, placeholder: '把复制的备份文本粘贴到这里' });
    var file = h('input', {
      id: 's-import-file', type: 'file', accept: '.json,application/json', hidden: true,
      onchange: function () {
        var f = file.files && file.files[0];
        if (!f) return;
        var fr = new FileReader();
        fr.onload = function () { importText(String(fr.result)); file.value = ''; };
        fr.onerror = function () { toast('读取文件失败'); };
        fr.readAsText(f);
      }
    });
    settingsBox.appendChild(h('div', { class: 'sec', id: 's-backup' },
      h('h3', { text: '导出与备份' }),
      h('p', { class: 'hint', text: S.lastBackupMonth ? '上次备份：' + ymLabel(S.lastBackupMonth) : '还没有备份过。数据只存在这个浏览器，换设备或清理浏览器数据会丢失。' }),
      h('div', { class: 'btns' },
        h('button', { class: 'btn primary', type: 'button', text: '备份（JSON 文件）', onclick: doBackup }),
        h('button', { class: 'btn', type: 'button', text: '复制备份文本', onclick: doCopyBackup })),
      h('div', { class: 'btns' },
        h('button', { class: 'btn', type: 'button', text: '导出 CSV（Excel / WPS）', onclick: doCSV })),
      h('h3', { text: '导入恢复' }),
      h('div', { class: 'btns' },
        h('button', { class: 'btn', type: 'button', text: '选择备份文件', onclick: function () { file.click(); } })),
      file, ta,
      h('button', {
        class: 'btn', type: 'button', text: '从粘贴的文本导入',
        onclick: function () { if (!ta.value.trim()) { toast('先粘贴备份文本'); return; } importText(ta.value); }
      })));

    /* 显示与清空 */
    settingsBox.appendChild(h('div', { class: 'sec' },
      h('h3', { text: '其他' }),
      h('label', { class: 'check' },
        h('input', {
          type: 'checkbox', id: 's-mascot', checked: S.mascotOn,
          onchange: function (e) { S.mascotOn = e.target.checked; persist(); mascotBox.hidden = !S.mascotOn; }
        }), h('span', { text: '显示 Claude Code 小伙伴' })),
      h('button', {
        class: 'btn danger', type: 'button', text: '清空全部数据',
        onclick: function () {
          askConfirm('这会删除所有记录、分类、预算和固定支出，且无法恢复。建议先备份。', '全部清空', function () {
            var keepMascot = S.mascotOn;
            S = defaults();
            S.mascotOn = keepMascot;
            S.lastRecurringMonth = ym(new Date());
            persist(); closeAll(); render(); nameDialog(true);
          });
        }
      })));

    settingsBox.scrollTop = keep;
  }

  /* ---------- 主页面 ---------- */
  function setBalance(el, to) {
    var from = ui.lastBal;
    ui.lastBal = to;
    if (reduceMotion || from === to) { el.textContent = money(to); return; }
    var t0 = performance.now();
    function step(t) {
      var k = Math.min(1, (t - t0) / 450);
      var e = 1 - Math.pow(1 - k, 3);
      el.textContent = money(Math.round(from + (to - from) * e));
      if (k < 1 && el.isConnected) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function dayLabel(d) {
    var p = d.split('-').map(Number);
    var dt = new Date(p[0], p[1] - 1, p[2]);
    var s = p[1] + '月' + p[2] + '日 周' + WEEK[dt.getDay()];
    var today = ymd(new Date());
    var y = new Date(); y.setDate(y.getDate() - 1);
    if (d === today) s += ' · 今天';
    else if (d === ymd(y)) s += ' · 昨天';
    return s;
  }

  var listBox = null;
  function filteredRecords() {
    var f = ui.filter;
    var active = !!(f.q || f.type || f.cat || f.from || f.to);
    var q = f.q.trim().toLowerCase();
    var recs = active ? S.records : monthRecords(ui.ym);
    recs = recs.filter(function (r) {
      if (f.type && r.type !== f.type) return false;
      if (f.cat && r.cat !== f.cat) return false;
      if (f.from && r.date < f.from) return false;
      if (f.to && r.date > f.to) return false;
      if (q && (r.note + ' ' + r.cat).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    recs.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.id < b.id ? 1 : -1); });
    return { recs: recs, active: active };
  }

  function renderList() {
    if (!listBox) return;
    var res = filteredRecords();
    listBox.textContent = '';
    if (res.active) {
      var s = sums(res.recs);
      listBox.appendChild(h('p', { class: 'hint', text: '筛选结果（全部月份）：' + res.recs.length + ' 笔 · 收入 ' + money(s.inc) + ' · 支出 ' + money(s.exp) }));
    }
    if (!res.recs.length) {
      listBox.appendChild(h('div', { class: 'empty', text: res.active ? '没有符合条件的记录' : ymLabel(ui.ym) + '还没有记录，点下面的「记一笔」' }));
      return;
    }
    var shown = res.recs.slice(0, ui.limit);
    var groups = [];
    shown.forEach(function (r) {
      var g = groups[groups.length - 1];
      if (!g || g.date !== r.date) { g = { date: r.date, items: [] }; groups.push(g); }
      g.items.push(r);
    });
    groups.forEach(function (g) {
      var exp = 0;
      g.items.forEach(function (r) { if (r.type === 'expense') exp += r.amount; });
      listBox.appendChild(h('div', { class: 'group' },
        h('div', { class: 'grp-head' }, h('span', { text: dayLabel(g.date) }), exp ? h('span', { class: 'num', text: '支出 ' + money(exp) }) : null),
        g.items.map(function (r) {
          return h('button', { class: 'row', type: 'button', onclick: function () { openForm(r); } },
            h('span', { class: 'ico', style: 'background:var(--c' + catIndex(r.type, r.cat) + ')', text: r.cat.slice(0, 1) }),
            h('span', { class: 'mid' },
              h('b', null, r.cat, r.rec ? h('span', { class: 'tag', text: '固定' }) : null),
              h('span', { text: r.note || ' ' })),
            h('span', { class: 'amt num ' + (r.type === 'income' ? 'inc' : ''), text: (r.type === 'income' ? '+' : '-') + money(r.amount).replace('¥', '¥') }));
        })));
    });
    if (res.recs.length > shown.length) {
      listBox.appendChild(h('button', {
        class: 'btn', type: 'button', text: '显示更多（还有 ' + (res.recs.length - shown.length) + ' 笔）',
        onclick: function () { ui.limit += 40; renderList(); }
      }));
    }
  }

  function budgetCard() {
    var b = budgetState(ui.ym);
    var card = h('section', { class: 'card', 'aria-label': '预算' },
      h('h2', null, '预算', h('button', { class: 'linkbtn', type: 'button', text: S.budget.total || Object.keys(S.budget.byCat).length ? '修改' : '去设置', onclick: function () { openSettings('s-budget'); } })));
    if (!b.items.length) {
      card.appendChild(h('p', { class: 'hint', text: '设一个每月预算，用到 80% 我会提醒你。' }));
      return card;
    }
    b.items.forEach(function (it) {
      var cls = it.level === 2 ? 'over' : it.level === 1 ? 'warn' : '';
      var pct = Math.min(100, it.spent * 100 / it.limit);
      var right = it.level === 2 ? '超支 ' + money(it.spent - it.limit) : '剩余 ' + money(it.limit - it.spent);
      card.appendChild(h('div', { class: 'bud' + (it.key === 'total' ? '' : ' sub') },
        h('div', { class: 'meta' },
          h('span', null, h('span', { class: 'name', text: it.name }),
            it.level === 2 ? h('span', { class: 'pill over', text: '超支' }) : it.level === 1 ? h('span', { class: 'pill warn', text: '已用 ' + it.ratio + '%' }) : null),
          h('span', { class: 'num muted', text: money(it.spent) + ' / ' + money(it.limit) })),
        h('div', { class: 'bar ' + cls, role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.min(100, it.ratio)), 'aria-label': it.name }, h('i', { style: 'width:' + pct.toFixed(1) + '%' })),
        h('div', { class: 'hint num', text: right })));
    });
    return card;
  }

  function donutCard(recs) {
    var mode = ui.donut;
    var byCat = {};
    var total = 0;
    recs.forEach(function (r) {
      if (r.type !== mode) return;
      byCat[r.cat] = (byCat[r.cat] || 0) + r.amount;
      total += r.amount;
    });
    var items = Object.keys(byCat).map(function (c) { return { cat: c, sum: byCat[c] }; }).sort(function (a, b) { return b.sum - a.sum; });
    var svg = svgEl('svg', { viewBox: '0 0 42 42', class: 'donut', role: 'img', 'aria-label': ymLabel(ui.ym) + (mode === 'expense' ? '支出' : '收入') + '分类占比' });
    svg.appendChild(svgEl('circle', { cx: 21, cy: 21, r: 15.9155, fill: 'none', 'stroke-width': 5, class: 'donut-track' }));
    var acc = 0;
    items.forEach(function (it) {
      var p = it.sum / total * 100;
      var gap = items.length > 1 ? Math.min(0.7, p / 3) : 0;
      svg.appendChild(svgEl('circle', {
        cx: 21, cy: 21, r: 15.9155, fill: 'none', 'stroke-width': 5,
        style: 'stroke:var(--c' + catIndex(mode, it.cat) + ')',
        'stroke-dasharray': (p - gap).toFixed(3) + ' ' + (100 - p + gap).toFixed(3),
        'stroke-dashoffset': (-acc).toFixed(3),
        transform: 'rotate(-90 21 21)'
      }));
      acc += p;
    });
    var legend = h('ul', { class: 'legend' });
    items.forEach(function (it) {
      legend.appendChild(h('li', null, h('button', {
        type: 'button', 'aria-label': '只看 ' + it.cat,
        onclick: function () {
          ui.filter = { q: '', type: mode, cat: it.cat, from: '', to: '' };
          ui.showFilter = true; ui.limit = 40;
          render();
          var t = document.getElementById('recent');
          if (t) t.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        }
      },
        h('span', { class: 'dot', style: 'background:var(--c' + catIndex(mode, it.cat) + ')' }),
        h('span', { text: it.cat }),
        h('span', { class: 'num', text: money(it.sum) }),
        h('span', { class: 'pct num', text: (it.sum / total * 100).toFixed(1) + '%' }))));
    });
    return h('section', { class: 'card', 'aria-label': '分类汇总' },
      h('h2', null, ymLabel(ui.ym) + '分类',
        h('span', { class: 'seg' }, [['expense', '支出'], ['income', '收入']].map(function (p) {
          return h('button', { type: 'button', text: p[1], 'aria-pressed': String(mode === p[0]), onclick: function () { ui.donut = p[0]; render(); } });
        }))),
      h('div', { class: 'donut-wrap' }, svg,
        h('div', { class: 'donut-mid' },
          h('span', { class: 'lbl', text: (mode === 'expense' ? '总支出' : '总收入') }),
          h('span', { class: 'val num', text: total ? money(total) : '暂无' }))),
      items.length ? legend : h('div', { class: 'empty', text: ymLabel(ui.ym) + '还没有' + (mode === 'expense' ? '支出' : '收入') }));
  }

  function recentCard() {
    var f = ui.filter;
    var q = h('input', {
      id: 'flt-q', type: 'search', placeholder: '搜索备注或分类', value: f.q, 'aria-label': '搜索备注或分类',
      oninput: function (e) { ui.filter.q = e.target.value; ui.limit = 40; renderList(); }
    });
    var allCats = [];
    S.categories.expense.concat(S.categories.income).forEach(function (c) { if (allCats.indexOf(c) < 0) allCats.push(c); });
    var typeSel = h('select', {
      id: 'flt-type', value: f.type, 'aria-label': '类型',
      onchange: function (e) { ui.filter.type = e.target.value; ui.limit = 40; renderList(); }
    }, h('option', { value: '', text: '全部类型' }), h('option', { value: 'expense', text: '支出' }), h('option', { value: 'income', text: '收入' }));
    var catSel = h('select', {
      id: 'flt-cat', value: f.cat, 'aria-label': '分类',
      onchange: function (e) { ui.filter.cat = e.target.value; ui.limit = 40; renderList(); }
    }, h('option', { value: '', text: '全部分类' }), allCats.map(function (c) { return h('option', { value: c, text: c }); }));
    var from = h('input', { id: 'flt-from', type: 'date', value: f.from, 'aria-label': '开始日期', onchange: function (e) { ui.filter.from = e.target.value; renderList(); } });
    var to = h('input', { id: 'flt-to', type: 'date', value: f.to, 'aria-label': '结束日期', onchange: function (e) { ui.filter.to = e.target.value; renderList(); } });
    var active = !!(f.q || f.type || f.cat || f.from || f.to);
    listBox = h('div', { class: 'list' });
    var card = h('section', { class: 'card', id: 'recent', 'aria-label': '最近记录' },
      h('h2', null, '最近记录', h('span', null,
        active ? h('button', { class: 'linkbtn', type: 'button', text: '清除筛选', onclick: function () { ui.filter = { q: '', type: '', cat: '', from: '', to: '' }; render(); } }) : null,
        h('button', { class: 'linkbtn', type: 'button', text: ui.showFilter ? '收起筛选' : '筛选', 'aria-expanded': String(ui.showFilter), onclick: function () { ui.showFilter = !ui.showFilter; render(); } }))),
      h('div', { class: 'filters' }, q,
        ui.showFilter ? h('div', { class: 'grid' }, typeSel, catSel, from, to) : null),
      listBox);
    return card;
  }

  function render() {
    var root = document.getElementById('app');
    var recs = monthRecords(ui.ym);
    var s = sums(recs);
    var bal = s.inc - s.exp;
    var curYM = ym(new Date());
    root.textContent = '';

    root.appendChild(h('header', { class: 'top' },
      h('button', { class: 'acct', type: 'button', 'aria-label': '修改账本名', onclick: function () { nameDialog(false); } },
        h('span', { text: S.name || '我的账本' }), h('span', { class: 'edit', text: '改名' })),
      h('button', { class: 'iconbtn', type: 'button', text: '设置', onclick: function () { openSettings(); } })));

    if (!ui.bannerHidden && backupDue()) {
      root.appendChild(h('div', { class: 'banner', role: 'status' },
        h('span', { text: '本月账本还没备份' }),
        h('span', null,
          h('button', { type: 'button', text: '去备份', onclick: function () { openSettings('s-backup'); } }),
          ' ',
          h('button', { type: 'button', text: '稍后', style: 'background:none;color:inherit;border:1px solid currentColor', onclick: function () { ui.bannerHidden = true; render(); } }))));
    }

    root.appendChild(h('nav', { class: 'monthnav', 'aria-label': '切换月份' },
      h('button', { type: 'button', text: '‹', 'aria-label': '上个月', onclick: function () { ui.ym = shiftYM(ui.ym, -1); ui.limit = 40; render(); refreshMood(); } }),
      h('span', { class: 'label', text: ymLabel(ui.ym) }),
      h('button', { type: 'button', text: '›', 'aria-label': '下个月', disabled: ui.ym >= curYM, onclick: function () { ui.ym = shiftYM(ui.ym, 1); ui.limit = 40; render(); refreshMood(); } })));

    var big = h('div', { class: 'big num' });
    root.appendChild(h('section', { class: 'hero', 'aria-label': '本月概览' },
      mascotBox,
      h('div', { class: 'balance' }, h('div', { class: 'lbl', text: (ui.ym === curYM ? '本月' : ymLabel(ui.ym)) + '结余' }), big),
      h('div', { class: 'io' },
        h('div', { class: 'tile inc' }, h('div', { class: 'lbl' }, h('span', { class: 'arrow', 'aria-hidden': 'true', text: '▲' }), '收入'), h('div', { class: 'val num', text: money(s.inc) })),
        h('div', { class: 'tile exp' }, h('div', { class: 'lbl' }, h('span', { class: 'arrow', 'aria-hidden': 'true', text: '▼' }), '支出'), h('div', { class: 'val num', text: money(s.exp) })))));
    setBalance(big, bal);

    root.appendChild(budgetCard());
    root.appendChild(donutCard(recs));
    root.appendChild(recentCard());
    root.appendChild(h('button', { class: 'fab', type: 'button', text: '＋ 记一笔', onclick: function () { openForm(null); } }));
    mascotBox.hidden = !S.mascotOn;
    renderList();
  }

  function refreshMood() {
    if (!M) return;
    var cur = ym(new Date());
    var mm = Number(ui.ym.split('-')[1]);
    if (!S.records.length) { M.mood('wave', '嗨，我是你的记账搭档。点下面的「记一笔」开始吧。'); return; }
    if (ui.ym === cur && backupDue()) { M.mood('backup', '本月账本还没备份，去设置里点「备份」吧。'); return; }
    var b = budgetState(ui.ym);
    if (b.level > 0) { M.mood('worry', b.text); return; }
    var s = sums(monthRecords(ui.ym));
    if (s.exp > 0 && s.inc - s.exp > 0) { M.mood('proud', mm + '月结余 ' + money(s.inc - s.exp) + '，继续保持。'); return; }
    M.mood('idle', ui.ym === cur ? '今天花了什么？' : '这是' + mm + '月的账本。');
  }

  /* ---------- 启动 ---------- */
  function init() {
    if (window.Mascot) M = window.Mascot.mount(mascotBox);
    var added = applyRecurring();
    render();
    refreshMood();
    if (added && M) M.react('nod', '✻ 已自动记入 ' + added + ' 笔固定支出');
    if (!S.name) nameDialog(true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
