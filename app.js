const tg = window.Telegram && window.Telegram.WebApp;
const $ = (s, r = document) => r.querySelector(s);
const KEY = 'budget_free_v1';
const uid = () => Math.random().toString(36).slice(2, 9);
const CUR = { BYN: 'Br', RUB: '₽', USD: '$', EUR: '€', UAH: '₴', KZT: '₸', PLN: 'zł' };

const DEF = {
  exp: [['Продукты','🛒','#ff9f43'],['Кафе','🍔','#ff6b6b'],['Транспорт','🚌','#54a0ff'],['Дом','🏠','#5f27cd'],
        ['Здоровье','💊','#26de81'],['Одежда','👕','#f368e0'],['Развлечения','🎮','#feca57'],['Связь','📱','#48dbfb'],
        ['Подарки','🎁','#ee5253'],['Прочее','📦','#8395a7']],
  inc: [['Зарплата','💰','#26de81'],['Подработка','💼','#4b7bec'],['Подарок','🎁','#f368e0'],['Прочее','➕','#8395a7']]
};
const mkCats = k => DEF[k].map(([n, e, c]) => ({ id: uid(), n, e, c }));

function load() {
  try { const r = JSON.parse(localStorage.getItem(KEY)); if (r && r.tx) return r; } catch (e) {}
  return { tx: [], cats: { exp: mkCats('exp'), inc: mkCats('inc') }, budgets: {},
           accounts: [{ id: 'main', n: 'Наличные', start: 0 }], cur: 'BYN' };
}
let S = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(S));
const buzz = t => { try { tg.HapticFeedback.impactOccurred(t || 'light'); } catch (e) {} };

/* ---------- утилиты ---------- */
const today = () => new Date().toISOString().slice(0, 10);
const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
const money = v => nf.format(Math.round(v * 100) / 100) + ' ' + (CUR[S.cur] || S.cur);
const cat = id => [...S.cats.exp, ...S.cats.inc].find(c => c.id === id) || { n: 'Без категории', e: '❓', c: '#8395a7' };
const esc = s => String(s).replace(/[<>&"]/g, m => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[m]));

// "12+3×2" -> 18, без eval; × и ÷ считаются первыми
const OPS = /[+\-×÷]/;
function calcExpr(s) {
  const tokens = String(s).match(/\d*\.?\d+|[+\-×÷]/g) || [];
  const st = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === '×' || t === '÷') {
      const b = parseFloat(tokens[++i]);
      if (isNaN(b)) break;
      const a = st.pop() || 0;
      st.push(t === '×' ? a * b : (b === 0 ? 0 : a / b));
    } else st.push(OPS.test(t) ? t : parseFloat(t));
  }
  let total = 0, sign = 1;
  for (const x of st) {
    if (x === '+') sign = 1;
    else if (x === '-') sign = -1;
    else total += sign * x;
  }
  return isFinite(total) ? Math.round(total * 100) / 100 : 0;
}
// p: '2026-08' | '2026' | 'all'
const txIn = p => S.tx.filter(t => p === 'all' || t.date.startsWith(p));
function agg(list) {
  const r = { inc: 0, exp: 0, byCat: {} };
  for (const t of list) { r[t.type] += t.amount; r.byCat[t.cat] = (r.byCat[t.cat] || 0) + t.amount; }
  return r;
}
const balance = () => S.accounts.reduce((a, x) => a + (+x.start || 0), 0) +
  S.tx.reduce((a, t) => a + (t.type === 'inc' ? t.amount : -t.amount), 0);

const MON = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
function periodLabel(p) {
  if (p === 'all') return 'Всё время';
  if (p.length === 4) return p + ' год';
  return MON[+p.slice(5, 7) - 1] + ' ' + p.slice(0, 4);
}
function shiftPeriod(p, d) {
  if (p === 'all') return p;
  if (p.length === 4) return String(+p + d);
  let y = +p.slice(0, 4), m = +p.slice(5, 7) - 1 + d;
  y += Math.floor(m / 12); m = (m % 12 + 12) % 12;
  return y + '-' + String(m + 1).padStart(2, '0');
}
function shiftDate(d, n) { const x = new Date(d + 'T12:00'); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); }
function dayLabel(d) {
  if (d === today()) return 'Сегодня';
  if (d === shiftDate(today(), -1)) return 'Вчера';
  return +d.slice(8) + ' ' + MON[+d.slice(5, 7) - 1].toLowerCase().slice(0, 3) + '.';
}

/* ---------- главная ---------- */
const accBalance = id => (+(S.accounts.find(x => x.id === id) || {}).start || 0) +
  S.tx.filter(t => t.acc === id).reduce((a, t) => a + (t.type === 'inc' ? t.amount : -t.amount), 0);

let homeType = 'exp';
function renderHome() {
  const m = today().slice(0, 7), a = agg(txIn(m));
  $('#s-home').innerHTML = `
    <div class="bal">
      <div class="lbl">Общий баланс</div><div class="sum">${money(balance())}</div>
      <div class="pair">
        <div><span class="lbl">Доход, ${MON[+m.slice(5, 7) - 1].toLowerCase()}</span><b>+${money(a.inc)}</b></div>
        <div><span class="lbl">Расход</span><b>−${money(a.exp)}</b></div>
      </div>
    </div>
    <div class="seg" style="margin:12px 0 4px">
      <button data-act="htype" data-v="exp" class="${homeType === 'exp' ? 'on' : ''}">Расход</button>
      <button data-act="htype" data-v="inc" class="${homeType === 'inc' ? 'on' : ''}">Доход</button>
    </div>
    <div class="hint" style="text-align:center;padding:6px 0">Удерживайте иконку и перетащите на счёт</div>
    <div class="grid4">${S.cats[homeType].map(c => `<div class="tile drag" data-kind="cat" data-id="${c.id}">
        <div class="i" style="background:${c.c}22;color:${c.c}">${c.e}</div>${esc(c.n)}</div>`).join('')}</div>
    ${budgetTop(m)}
    <div class="h2">Операции</div>
    <div class="card">${txRows() || '<div class="empty">Пока пусто.<br>Перетащите категорию на счёт</div>'}</div>
    <div class="dock">${S.accounts.map(x => `<div class="wal drag" data-kind="acc" data-id="${x.id}">
        <b>${esc(x.n)}</b><span>${money(accBalance(x.id))}</span></div>`).join('')}</div>`;
}
function txRows() {
  const list = [...S.tx].sort((x, y) => y.date < x.date ? -1 : y.date > x.date ? 1 : y.ts - x.ts).slice(0, 25);
  let rows = '', last = '';
  for (const t of list) {
    if (t.date !== last) {
      last = t.date;
      const d = agg(S.tx.filter(x => x.date === t.date));
      rows += `<div class="daysep"><span>${dayLabel(t.date)}</span><span>${d.exp ? '−' + money(d.exp) : ''}</span></div>`;
    }
    const c = cat(t.cat), acc = S.accounts.find(x => x.id === t.acc);
    rows += `<div class="tx" data-act="edit" data-v="${t.id}">
      <div class="ic" style="background:${c.c}22;color:${c.c}">${c.e}</div>
      <div class="nm"><div>${esc(c.n)}</div><div class="hint">${esc(t.note || (acc ? acc.n : ''))}</div></div>
      <div class="amt" style="color:${t.type === 'inc' ? 'var(--green)' : 'var(--text)'}">${t.type === 'inc' ? '+' : '−'}${money(t.amount)}</div></div>`;
  }
  return rows;
}
function budgetTop(m) {
  const ids = Object.keys(S.budgets).filter(k => S.budgets[k] > 0);
  if (!ids.length) return '';
  const a = agg(txIn(m));
  const lim = ids.reduce((s, k) => s + S.budgets[k], 0);
  const sp = ids.reduce((s, k) => s + (a.byCat[k] || 0), 0);
  return `<div class="card"><div class="row"><b>Бюджет месяца</b><span class="hint">${money(sp)} из ${money(lim)}</span></div>
    <div class="bar"><i style="width:${Math.min(100, lim ? sp / lim * 100 : 0)}%;background:${sp > lim ? 'var(--red)' : 'var(--green)'}"></i></div></div>`;
}

/* ---------- статистика ---------- */
let P = today().slice(0, 7), statType = 'exp';
function renderStats() {
  const list = txIn(P), a = agg(list);
  const cats = S.cats[statType]
    .map(c => ({ ...c, v: list.filter(t => t.type === statType && t.cat === c.id).reduce((s, t) => s + t.amount, 0) }))
    .filter(c => c.v > 0).sort((x, y) => y.v - x.v);
  const total = cats.reduce((s, c) => s + c.v, 0);
  let off = 0;
  const arcs = cats.map(c => {
    const p = c.v / total * 100;
    const s = `<circle cx="21" cy="21" r="15.915" fill="none" stroke="${c.c}" stroke-width="6"
      stroke-dasharray="${p.toFixed(2)} ${(100 - p).toFixed(2)}" stroke-dashoffset="${(100 - off).toFixed(2)}"/>`;
    off += p; return s;
  }).join('');

  $('#s-stats').innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <button class="btn sec" style="width:44px;margin:0" data-act="per" data-v="-1">‹</button>
      <b data-act="permode">${periodLabel(P)}</b>
      <button class="btn sec" style="width:44px;margin:0" data-act="per" data-v="1">›</button>
    </div>
    <div class="card">
      <div class="row">
        <div><div class="hint">Доходы</div><b style="color:var(--green)">+${money(a.inc)}</b></div>
        <div style="text-align:right"><div class="hint">Расходы</div><b style="color:var(--red)">−${money(a.exp)}</b></div>
      </div>
      <div class="row" style="margin-top:10px;border-top:1px solid var(--line);padding-top:10px">
        <span class="hint">Итого за период</span><b>${a.inc - a.exp >= 0 ? '+' : '−'}${money(Math.abs(a.inc - a.exp))}</b>
      </div>
    </div>
    ${chart(list)}
    <div class="seg" style="margin:14px 0 10px">
      <button data-act="stype" data-v="exp" class="${statType === 'exp' ? 'on' : ''}">Расходы</button>
      <button data-act="stype" data-v="inc" class="${statType === 'inc' ? 'on' : ''}">Доходы</button>
    </div>
    <div class="card">${total ? `
      <div class="donut">
        <div class="dc"><svg viewBox="0 0 42 42">${arcs}</svg>
          <div class="mid"><span class="hint">всего</span><b>${money(total)}</b></div></div>
        <div class="legend" style="flex:1">${cats.slice(0, 5).map(c =>
          `<div class="l"><span class="dot" style="background:${c.c}"></span><span style="flex:1">${esc(c.n)}</span><b>${(c.v / total * 100).toFixed(0)}%</b></div>`).join('')}</div>
      </div>
      <div style="border-top:1px solid var(--line);margin-top:10px">${cats.map(c =>
        `<div style="padding:9px 0"><div class="row"><span>${c.e} ${esc(c.n)}</span><b>${money(c.v)}</b></div>
         <div class="bar"><i style="width:${c.v / cats[0].v * 100}%;background:${c.c}"></i></div></div>`).join('')}</div>`
      : '<div class="empty">Нет данных за период</div>'}</div>`;
}
function chart(list) {
  let keys, label;
  if (P === 'all') {
    keys = [...new Set(S.tx.map(t => t.date.slice(0, 4)))].sort(); label = k => k.slice(2);
  } else if (P.length === 4) {
    keys = MON.map((_, i) => P + '-' + String(i + 1).padStart(2, '0')); label = k => MON[+k.slice(5, 7) - 1].slice(0, 3);
  } else {
    const n = new Date(+P.slice(0, 4), +P.slice(5, 7), 0).getDate();
    keys = Array.from({ length: n }, (_, i) => P + '-' + String(i + 1).padStart(2, '0'));
    label = k => +k.slice(8) % 5 === 0 ? +k.slice(8) : '';
  }
  if (!keys.length) return '';
  const d = keys.map(k => { const a = agg(list.filter(t => t.date.startsWith(k))); return { e: a.exp, i: a.inc }; });
  const max = Math.max(...d.map(x => Math.max(x.e, x.i)), 1);
  return `<div class="card"><div class="hint">Динамика</div>
    <div class="bars">${d.map(x => `<div><i class="g" style="height:${x.i / max * 90}px"></i><i style="height:${x.e / max * 90}px"></i></div>`).join('')}</div>
    <div class="xlab">${keys.map(k => `<div>${label(k)}</div>`).join('')}</div></div>`;
}

/* ---------- бюджеты ---------- */
function renderBudgets() {
  const m = today().slice(0, 7), a = agg(txIn(m));
  const dLeft = new Date(+m.slice(0, 4), +m.slice(5, 7), 0).getDate() - new Date().getDate() + 1;
  $('#s-budg').innerHTML = `<div class="h2">Лимиты на ${MON[+m.slice(5, 7) - 1].toLowerCase()}</div>
    <div class="hint" style="margin:0 4px 10px">Осталось дней: ${dLeft}. Пустое поле — лимит выключен.</div>
    <div class="card">${S.cats.exp.map(c => {
      const lim = +S.budgets[c.id] || 0, sp = a.byCat[c.id] || 0;
      const p = lim ? Math.min(100, sp / lim * 100) : 0, over = lim && sp > lim;
      return `<div style="padding:10px 0;border-bottom:1px solid var(--line)">
        <div class="row"><span>${c.e} ${esc(c.n)}</span>
          <input type="number" inputmode="decimal" data-lim="${c.id}" value="${lim || ''}" placeholder="0"
            style="width:82px;background:var(--bg);border-radius:8px;padding:5px;text-align:right;border:0"></div>
        ${lim ? `<div class="bar"><i style="width:${p}%;background:${over ? 'var(--red)' : 'var(--green)'}"></i></div>
        <div class="row hint" style="margin-top:4px"><span>Потрачено ${money(sp)}</span>
          <span>${over ? 'Перерасход ' + money(sp - lim) : 'В день ещё ' + money(Math.max(0, (lim - sp) / dLeft))}</span></div>` : ''}
      </div>`;
    }).join('')}</div>`;
}

/* ---------- настройки ---------- */
function renderSettings() {
  $('#s-set').innerHTML = `
    <div class="h2">Счета</div>
    <div class="card">${S.accounts.map(x => `<div class="fld">
        <input value="${esc(x.n)}" data-acc="${x.id}" data-f="n" style="text-align:left">
        <input type="number" inputmode="decimal" value="${x.start || 0}" data-acc="${x.id}" data-f="start" style="max-width:100px">
        ${S.accounts.length > 1 ? `<button class="btn dngr" style="width:auto;margin:0;padding:2px 6px" data-act="delacc" data-v="${x.id}">✕</button>` : ''}
      </div>`).join('')}
      <button class="btn sec" data-act="addacc">+ Добавить счёт</button>
      <div class="hint" style="margin-top:8px">Второе поле — стартовый баланс счёта.</div>
    </div>
    <div class="h2">Категории</div>
    <div class="card">${['exp', 'inc'].map(k => `<div class="hint" style="margin:8px 0 2px">${k === 'exp' ? 'Расходы' : 'Доходы'}</div>
      ${S.cats[k].map(c => `<div class="fld"><span>${c.e} ${esc(c.n)}</span>
        <button class="btn dngr" style="width:auto;margin:0;padding:2px 6px" data-act="delcat" data-v="${c.id}">✕</button></div>`).join('')}
      <div class="fld"><input placeholder="🙂" id="ne-${k}" style="text-align:left;max-width:44px">
        <input placeholder="Новая категория" id="nn-${k}" style="text-align:left">
        <input type="color" id="nc-${k}" value="#4b7bec">
        <button class="btn" style="width:auto;margin:0;padding:6px 12px" data-act="addcat" data-v="${k}">+</button></div>`).join('')}
    </div>
    <div class="h2">Общее</div>
    <div class="card">
      <div class="fld"><span>Валюта</span><select data-act="cur">${Object.keys(CUR).map(c => `<option ${c === S.cur ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="fld"><span>Операций сохранено</span><span class="hint">${S.tx.length}</span></div>
      <button class="btn sec" data-act="csv">Экспорт в CSV</button>
      <button class="btn sec" data-act="backup">Скачать резервную копию</button>
      <button class="btn sec" data-act="restore">Восстановить из копии</button>
      <button class="btn dngr" data-act="wipe">Удалить все данные</button>
    </div>
    <div class="hint" style="text-align:center">Данные хранятся только на этом устройстве.</div>`;
}

/* ---------- шторка операции ---------- */
let D = null;
const KEYS = ['1','2','3','÷','4','5','6','×','7','8','9','-','.','0','del','+'];
const KEY_LABEL = { del: '⌫', '-': '−' };
// нажатие клавиши -> новое выражение
function applyKey(a, k) {
  if (k === 'del') return a.slice(0, -1);
  if (OPS.test(k)) return !a ? a : (OPS.test(a.slice(-1)) ? a.slice(0, -1) + k : a + k);
  if (k === '.') {
    if (/\.\d*$/.test(a.split(OPS).pop())) return a;                 // вторая точка в одном числе
    return (!a || OPS.test(a.slice(-1)) ? a + '0' : a) + '.';        // ".5" -> "0.5"
  }
  return a + k;
}
function dispHTML() {
  const expr = OPS.test(D.amount.slice(1));
  return `${esc(D.amount || '0')} <span class="hint" style="font-size:18px">${CUR[S.cur] || S.cur}</span>` +
    (expr ? `<div class="res">= ${money(calcExpr(D.amount))}</div>` : '');
}
function openSheet(id, pre) {
  const t = id && S.tx.find(x => x.id === id);
  D = t ? { ...t, amount: String(t.amount) }
        : { id: null, type: 'exp', amount: '', cat: null, date: today(), acc: S.accounts[0].id, note: '' };
  if (pre) Object.assign(D, pre);
  drawSheet();
  $('#sheet').classList.add('on');
  if (tg && tg.BackButton) tg.BackButton.show();
}
function closeSheet() {
  $('#sheet').classList.remove('on'); D = null;
  if (tg && tg.BackButton) tg.BackButton.hide();
}
function drawSheet() {
  $('#sheet-in').innerHTML = `<div class="grab"></div>
    <div class="seg"><button data-act="dtype" data-v="exp" class="${D.type === 'exp' ? 'on' : ''}">Расход</button>
      <button data-act="dtype" data-v="inc" class="${D.type === 'inc' ? 'on' : ''}">Доход</button></div>
    <div class="disp">${dispHTML()}</div>
    <div class="cats">${S.cats[D.type].map(c => `<button data-act="dcat" data-v="${c.id}" class="${D.cat === c.id ? 'on' : ''}">
        <span>${c.e}</span>${esc(c.n)}</button>`).join('')}</div>
    <div class="card" style="margin:0">
      <div class="fld"><span>Дата</span><input type="date" data-d="date" value="${D.date}"></div>
      <div class="fld"><span>Счёт</span><select data-d="acc">${S.accounts.map(x => `<option value="${x.id}" ${x.id === D.acc ? 'selected' : ''}>${esc(x.n)}</option>`).join('')}</select></div>
      <div class="fld"><span>Заметка</span><input data-d="note" value="${esc(D.note || '')}" placeholder="необязательно"></div>
    </div>
    <div class="pad">${KEYS.map(k => `<button data-act="key" data-v="${k}"
      class="${k === 'del' ? 'del' : OPS.test(k) ? 'op' : ''}">${KEY_LABEL[k] || k}</button>`).join('')}</div>
    <button class="btn" data-act="dsave">${D.id ? 'Сохранить' : 'Добавить'}</button>
    ${D.id ? '<button class="btn dngr" data-act="ddel">Удалить операцию</button>' : ''}`;
}
function saveDraft() {
  const amount = Math.abs(calcExpr(D.amount));
  if (!amount) return alert('Введите сумму');
  const c = D.cat || S.cats[D.type][0].id;
  if (D.id) Object.assign(S.tx.find(x => x.id === D.id), { type: D.type, amount, cat: c, date: D.date, acc: D.acc, note: D.note });
  else S.tx.push({ id: uid(), ts: Date.now(), type: D.type, amount, cat: c, date: D.date, acc: D.acc, note: D.note });
  save(); closeSheet(); render(); buzz('medium');
}

/* ---------- экспорт / импорт ---------- */
function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: type || 'text/plain;charset=utf-8' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function toCSV() {
  const rows = [['Дата', 'Тип', 'Категория', 'Сумма', 'Счёт', 'Заметка']];
  for (const t of [...S.tx].sort((a, b) => a.date < b.date ? -1 : 1)) {
    const acc = S.accounts.find(x => x.id === t.acc);
    rows.push([t.date, t.type === 'inc' ? 'Доход' : 'Расход', cat(t.cat).n, t.amount, acc ? acc.n : '', t.note || '']);
  }
  return rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(';')).join('\n');
}
function restore() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    f.text().then(txt => {
      const d = JSON.parse(txt);
      if (!d || !Array.isArray(d.tx)) throw new Error('bad');
      S = d; save(); render(); alert('Данные восстановлены');
    }).catch(() => alert('Не похоже на файл резервной копии'));
  };
  inp.click();
}

/* ---------- роутинг и события ---------- */
let cur = 'home';
const SCREENS = { home: renderHome, stats: renderStats, budg: renderBudgets, set: renderSettings };
function render() { SCREENS[cur](); }

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, v = el.dataset.v;
  const A = {
    tab() {
      cur = v; buzz();
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
      $('#s-' + v).classList.add('on');
      document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
      render(); window.scrollTo(0, 0);
    },
    add() { buzz(); openSheet(null); },
    edit() { buzz(); openSheet(v); },
    htype() { homeType = v; renderHome(); buzz(); },
    dtype() { D.type = v; D.cat = null; drawSheet(); buzz(); },
    dcat() { D.cat = v; drawSheet(); buzz(); },
    key() {
      D.amount = applyKey(D.amount, v);
      $('.disp', $('#sheet-in')).innerHTML = dispHTML();
      buzz();
    },
    dsave: saveDraft,
    ddel() {
      if (!confirm('Удалить операцию?')) return;
      S.tx = S.tx.filter(x => x.id !== D.id); save(); closeSheet(); render();
    },
    per() { P = shiftPeriod(P, +v); render(); buzz(); },
    permode() { P = P === 'all' ? today().slice(0, 7) : P.length === 4 ? 'all' : P.slice(0, 4); render(); },
    stype() { statType = v; render(); },
    addacc() { S.accounts.push({ id: uid(), n: 'Новый счёт', start: 0 }); save(); render(); },
    delacc() {
      if (S.accounts.length < 2 || !confirm('Удалить счёт? Операции останутся.')) return;
      S.accounts = S.accounts.filter(x => x.id !== v); save(); render();
    },
    addcat() {
      const n = $('#nn-' + v).value.trim(); if (!n) return;
      S.cats[v].push({ id: uid(), n, e: $('#ne-' + v).value.trim() || '💸', c: $('#nc-' + v).value });
      save(); render();
    },
    delcat() {
      if (!confirm('Удалить категорию? Операции останутся без категории.')) return;
      for (const k of ['exp', 'inc']) S.cats[k] = S.cats[k].filter(c => c.id !== v);
      delete S.budgets[v]; save(); render();
    },
    csv() { download('budget-' + today() + '.csv', toCSV(), 'text/csv;charset=utf-8'); },
    backup() { download('budget-backup-' + today() + '.json', JSON.stringify(S), 'application/json'); },
    restore,
    wipe() {
      if (!confirm('Удалить все операции, счета и категории?')) return;
      localStorage.removeItem(KEY); S = load(); render();
    }
  };
  if (A[act]) A[act]();
});

// закрыть шторку кликом по фону
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

/* ---------- перетаскивание иконок ---------- */
// категорию тащим на счёт или счёт на категорию — оба варианта дают операцию
const validDrop = (a, b) => (a === 'cat' && b === 'acc') || (a === 'acc' && b === 'cat');
const typeOfCat = id => S.cats.exp.some(c => c.id === id) ? 'exp' : 'inc';
let G = null;                                  // текущее перетаскивание

function tileAt(x, y) {
  const el = document.elementFromPoint(x, y);
  return el && el.closest('.drag');
}
function startGhost(el, x, y) {
  const g = el.cloneNode(true);
  g.className = 'ghost ' + (el.classList.contains('wal') ? 'wal' : 'tile');
  const r = el.getBoundingClientRect();
  g.style.width = r.width + 'px';
  document.body.appendChild(g);
  el.classList.add('dragging');
  moveGhost(g, x, y, { width: r.width / 2 });
  return g;
}
function moveGhost(g, x, y, r) {
  g.style.transform = `translate(${x - (r ? r.width : 27)}px,${y - 27}px)`;
}
document.addEventListener('pointerdown', e => {
  const el = e.target.closest('.drag');
  if (!el || D) return;
  G = { el, kind: el.dataset.kind, id: el.dataset.id, x: e.clientX, y: e.clientY, ready: false, ghost: null,
        w: el.getBoundingClientRect().width / 2 };
  // удержание 180 мс включает перетаскивание, быстрый свайп остаётся прокруткой
  G.timer = setTimeout(() => { if (G) { G.ready = true; el.classList.add('hold'); buzz('medium'); } }, 180);
});
document.addEventListener('pointermove', e => {
  if (!G) return;
  if (!G.ready) {
    if (Math.hypot(e.clientX - G.x, e.clientY - G.y) > 10) { clearTimeout(G.timer); G.el.classList.remove('hold'); G = null; }
    return;
  }
  if (!G.ghost) G.ghost = startGhost(G.el, e.clientX, e.clientY);
  moveGhost(G.ghost, e.clientX, e.clientY, { width: G.w });
  const t = tileAt(e.clientX, e.clientY);
  document.querySelectorAll('.over').forEach(n => n.classList.remove('over'));
  if (t && validDrop(G.kind, t.dataset.kind)) t.classList.add('over');
});
document.addEventListener('pointerup', e => {
  if (!G) return;
  const g = G; G = null;
  clearTimeout(g.timer);
  g.el.classList.remove('hold', 'dragging');
  if (g.ghost) g.ghost.remove();
  document.querySelectorAll('.over').forEach(n => n.classList.remove('over'));
  const t = g.ready && g.ghost && tileAt(e.clientX, e.clientY);
  if (t && validDrop(g.kind, t.dataset.kind)) {
    const cat = g.kind === 'cat' ? g.id : t.dataset.id;
    const acc = g.kind === 'acc' ? g.id : t.dataset.id;
    buzz('medium');
    openSheet(null, { type: typeOfCat(cat), cat, acc });
  } else if (!g.ghost) {                       // короткий тап по иконке — то же окно
    if (g.kind === 'cat') openSheet(null, { type: typeOfCat(g.id), cat: g.id });
    else openSheet(null, { acc: g.id });
  }
});
document.addEventListener('pointercancel', () => {
  if (!G) return;
  clearTimeout(G.timer); G.el.classList.remove('hold', 'dragging');
  if (G.ghost) G.ghost.remove();
  G = null;
});
// пока тащим — страница не прокручивается
document.addEventListener('touchmove', e => { if (G && G.ready) e.preventDefault(); }, { passive: false });

// поля: черновик, лимиты, счета, валюта
document.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.d && D) D[t.dataset.d] = t.value;
  else if (t.dataset.lim !== undefined && t.dataset.lim) {
    const v = parseFloat(t.value) || 0;
    if (v > 0) S.budgets[t.dataset.lim] = v; else delete S.budgets[t.dataset.lim];
    save();
  } else if (t.dataset.acc) {
    const a = S.accounts.find(x => x.id === t.dataset.acc);
    a[t.dataset.f] = t.dataset.f === 'start' ? (parseFloat(t.value) || 0) : t.value;
    save();
  }
});
document.addEventListener('change', e => {
  if (e.target.dataset.act === 'cur') { S.cur = e.target.value; save(); render(); }
  if (e.target.dataset.lim) renderBudgets();
});

if (tg) {
  tg.ready(); tg.expand();
  if (tg.BackButton) tg.BackButton.onClick(closeSheet);
  if (tg.disableVerticalSwipes) tg.disableVerticalSwipes();
}
render();

/* ---------- самопроверка: index.html?test=1 ---------- */
if (location.search.includes('test=1')) {
  const eq = (a, b, m) => console.assert(JSON.stringify(a) === JSON.stringify(b), m, a, b);
  eq(calcExpr('12+3.5'), 15.5, 'сложение');
  eq(calcExpr('20-4.25-1'), 14.75, 'вычитание');
  eq(calcExpr(''), 0, 'пусто');
  eq(calcExpr('7'), 7, 'одно число');
  eq(calcExpr('2+3×4'), 14, 'умножение раньше сложения');
  eq(calcExpr('10÷4'), 2.5, 'деление');
  eq(calcExpr('10÷0'), 0, 'деление на ноль не ломает');
  eq(calcExpr('100-2×3+6÷2'), 97, 'смешанный приоритет');
  eq(calcExpr('12+'), 12, 'висящий оператор');
  eq(calcExpr('3×'), 3, 'висящее умножение');
  eq(applyKey('', '+'), '', 'оператор первым не вводится');
  eq(applyKey('12', '+'), '12+', 'оператор после числа');
  eq(applyKey('12+', '×'), '12×', 'оператор подряд заменяется');
  eq(applyKey('12.5', '.'), '12.5', 'вторая точка не проходит');
  eq(applyKey('12+', '.'), '12+0.', 'точка после оператора -> 0.');
  eq(applyKey('', '.'), '0.', 'точка первой -> 0.');
  eq(applyKey('12.5+3', '.'), '12.5+3.', 'точка во втором числе');
  eq(applyKey('123', 'del'), '12', 'стирание');
  eq(calcExpr(['1','2','+','3','×','4'].reduce(applyKey, '')), 15, 'полный набор с клавиатуры');
  const back = S;
  S = { ...load(), tx: [
    { id: 'a', ts: 1, type: 'exp', amount: 10, cat: 'c1', date: '2026-08-05', acc: 'main' },
    { id: 'b', ts: 2, type: 'inc', amount: 30, cat: 'c2', date: '2026-08-06', acc: 'main' },
    { id: 'c', ts: 3, type: 'exp', amount: 5, cat: 'c1', date: '2026-07-30', acc: 'main' }],
    accounts: [{ id: 'main', n: 'x', start: 100 }] };
  eq(txIn('2026-08').length, 2, 'фильтр по месяцу');
  eq(txIn('2026').length, 3, 'фильтр по году');
  eq(agg(txIn('2026-08')), { inc: 30, exp: 10, byCat: { c1: 10, c2: 30 } }, 'агрегация');
  eq(balance(), 115, 'баланс = 100 + 30 - 15');
  eq(shiftPeriod('2026-01', -1), '2025-12', 'месяц назад');
  eq(shiftPeriod('2026-12', 1), '2027-01', 'месяц вперёд');
  eq([validDrop('cat', 'acc'), validDrop('acc', 'cat')], [true, true], 'категория ↔ счёт');
  eq([validDrop('cat', 'cat'), validDrop('acc', 'acc')], [false, false], 'одинаковые не соединяются');
  eq(typeOfCat(S.cats.inc[0].id), 'inc', 'тип категории дохода');
  eq(typeOfCat(S.cats.exp[0].id), 'exp', 'тип категории расхода');
  S = back;
  console.log('тесты выполнены — ошибок нет, если выше нет Assertion failed');
}
