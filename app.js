// LocalStorage helpers
const LS = {
    get(k, fallback) { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } },
    set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
};

// App state
const state = {
    client: LS.get('client', { name: '', contactName: '', contactEmail: '', hourlyRate: null }),
    times: LS.get('times', []),          // {id, dateISO, task, minutesRounded, startHM?, stopHM?, invoiceId?}
    invoices: LS.get('invoices', []),    // {id, number, createdAtISO, periodStartISO, periodEndISO, totalMinutesRounded, rateUsed, amountCAD, dueDateISO, sentAtISO?}
    settings: LS.get('settings', { myName: '', myEmail: '', invoicePrefix: 'GS', seq: 1 }),
    ui: { lastPrintedInvoiceId: null, showMore: false }
};
function persist() { LS.set('client', state.client); LS.set('times', state.times); LS.set('invoices', state.invoices); LS.set('settings', state.settings); }

const $ = s => document.querySelector(s); const $$ = s => Array.from(document.querySelectorAll(s));
function uid() { return Math.random().toString(36).slice(2, 10); }
function pad2(n) { return String(n).padStart(2, '0'); }
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function parseHM(s) { if (!s) return null; const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(s.trim()); if (!m) return null; return parseInt(m[1], 10) * 60 + parseInt(m[2], 10); }
function minutesDiff(startHM, stopHM) { if (startHM == null || stopHM == null) return null; let d = stopHM - startHM; if (d < 0) d += 1440; return d; }
function roundNearest15(mins) { if (mins == null) return null; const r = mins % 15; return r <= 7 ? mins - r : mins + (15 - r); }
function hours2(mins) { return (mins / 60).toFixed(2); }
function initials2(name) { const letters = (name || '').toUpperCase().replace(/[^A-Z]/g, ''); const a = letters.slice(0, 2); return a.length === 2 ? a : a + 'X'.repeat(2 - a.length); }

// Elements
const timeBody = $('#timeBody');
const invoiceBanner = $('#invoiceBanner');
const invoiceBannerText = $('#invoiceBannerText');
const bannerPrintBtn = $('#bannerPrintBtn');
const bannerCopyBtn = $('#bannerCopyBtn');
const bannerMarkBtn = $('#bannerMarkBtn');
const clientBanner = $('#clientBanner');
const newInvoiceBtn = $('#newInvoiceBtn');
const selectionSum = $('#selectionSum');
const toggleMoreBtn = $('#toggleMoreFields');

// Menu open/close
const menuBtn = $('#menuBtn'); const menuSheet = $('#menuSheet');
menuBtn.addEventListener('click', () => menuSheet.setAttribute('aria-hidden', menuSheet.getAttribute('aria-hidden') === 'false' ? 'true' : 'false'));
document.addEventListener('click', e => { if (!menuSheet.contains(e.target) && e.target !== menuBtn) menuSheet.setAttribute('aria-hidden', 'true'); });

// Tabs
$$('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
        $$('.tab').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
        btn.classList.add('active'); btn.setAttribute('aria-selected', 'true');
        const tab = btn.dataset.tab;
        if (tab === 'time') { $('#timeView').classList.remove('hidden'); $('#invoicesView').classList.add('hidden'); }
        else { $('#timeView').classList.add('hidden'); $('#invoicesView').classList.remove('hidden'); renderInvoices(); }
    });
});

// Client modal open/close
function openClientModal() {
    $('#clientName').value = state.client.name || '';
    $('#clientContact').value = state.client.contactName || '';
    $('#clientEmail').value = state.client.contactEmail || '';
    $('#clientRate').value = state.client.hourlyRate ?? '';
    $('#clientModal').classList.remove('hidden');
    $('#clientName').focus();
}
$('#openClientModalBtn').addEventListener('click', openClientModal);
$('#bannerClientBtn').addEventListener('click', openClientModal);
$$('.modal .btn.icon-btn, .modal [data-close]').forEach(b => {
    b.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-close') || e.currentTarget.closest('.modal').id;
        document.getElementById(id).classList.add('hidden');
    });
});
$('#saveClientBtn').addEventListener('click', () => {
    state.client.name = $('#clientName').value.trim();
    state.client.contactName = $('#clientContact').value.trim();
    state.client.contactEmail = $('#clientEmail').value.trim();
    const rate = parseFloat($('#clientRate').value);
    state.client.hourlyRate = isNaN(rate) ? null : rate;
    persist(); $('#clientModal').classList.add('hidden'); renderAll();
});

// Erase modal
$('#eraseBtn').addEventListener('click', () => $('#eraseModal').classList.remove('hidden'));
$('#eraseConfirm').addEventListener('input', e => $('#eraseConfirmBtn').disabled = e.target.value.trim().toUpperCase() !== 'ERASE');
$('#eraseConfirmBtn').addEventListener('click', () => {
    state.client = { name: '', contactName: '', contactEmail: '', hourlyRate: null };
    state.times = []; state.invoices = []; state.settings.seq = 1; persist();
    $('#eraseModal').classList.add('hidden'); renderAll();
});

// Export CSV
$('#exportCsvBtn').addEventListener('click', exportCSV);
function exportCSV() {
    const header = ['date', 'task', 'start', 'stop', 'minutesRounded', 'invoiceNumber'];
    const rows = [...state.times].sort((a, b) => a.dateISO.localeCompare(b.dateISO)).map(t => [
        t.dateISO, csvSafe(t.task || ''), t.startHM != null ? hmText(t.startHM) : '', t.stopHM != null ? hmText(t.stopHM) : '',
        t.minutesRounded ?? '', (state.invoices.find(inv => inv.id === t.invoiceId)?.number) || ''
    ]);
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadFile('time_entries.csv', 'text/csv', csv);
}
function csvSafe(s) { return `"${String(s).replace(/"/g, '""')}"`; }
function downloadFile(name, type, data) { const blob = new Blob([data], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function hmText(min) { const h = Math.floor(min / 60), m = min % 60; return `${pad2(h)}:${pad2(m)}`; }

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    const meta = e.metaKey || e.ctrlKey;
    if (meta && e.key === '/') { e.preventDefault(); $('#shortcutsModal').classList.remove('hidden'); }
    if (meta && e.key === '1') { e.preventDefault(); $$('.tab')[0].click(); }
    if (meta && e.key === '2') { e.preventDefault(); $$('.tab')[1].click(); }
    if (meta && e.key.toLowerCase() === 'n') { e.preventDefault(); focusTopEmptyRow(); }
    if (meta && e.key.toLowerCase() === 'p') { e.preventDefault(); triggerPrintFlow(); }
});
// Prevent page-level Ctrl+A when editing cells/inputs
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        const t = e.target;
        if (t && (t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) e.stopPropagation();
    }
}, true);

// Toggle optional Start/Stop columns
toggleMoreBtn.addEventListener('click', () => {
    state.ui.showMore = !state.ui.showMore;
    toggleMoreBtn.querySelector('span').textContent = state.ui.showMore ? 'Hide fields' : 'More fields';
    toggleMoreBtn.querySelector('i').setAttribute('data-lucide', state.ui.showMore ? 'chevron-up' : 'chevron-down');
    renderTimeTable();
});

// ---------- Time table (contenteditable cells) ----------
function renderTimeTable() {
    $$('.col-start').forEach(el => el.style.display = state.ui.showMore ? 'block' : 'none');
    $$('.col-stop').forEach(el => el.style.display = state.ui.showMore ? 'block' : 'none');

    const entries = state.times; // keep current order

    timeBody.innerHTML = '';
    for (const t of entries) timeBody.appendChild(renderRow(t));
    timeBody.appendChild(renderRow({ isNew: true })); // empty row at bottom

    lucide.createIcons();
}



function renderRow(t) {
    const row = document.createElement('div');
    row.className = 'row';
    if (t.id) row.dataset.id = t.id;
    if (t.invoiceId) row.classList.add('locked');

    // Date (contenteditable)
    const cDate = document.createElement('div'); cDate.className = 'cell col-date';
    cDate.appendChild(ceCell(t.dateISO || todayStr(), 'YYYY-MM-DD', !t.invoiceId, { key: 'dateISO', kind: 'date', isNew: t.isNew }));
    row.appendChild(cDate);

    // Task
    const cTask = document.createElement('div'); cTask.className = 'cell col-task';
    cTask.appendChild(ceCell(t.task || '', 'Describe work', !t.invoiceId, { key: 'task', kind: 'text', isNew: t.isNew }));
    row.appendChild(cTask);

    // Minutes
    const cMin = document.createElement('div'); cMin.className = 'cell col-min';
    const minCell = ceCell(Number.isFinite(t.minutesRounded) ? String(t.minutesRounded) : '', '0', !t.invoiceId, { key: 'minutesRounded', kind: 'minutes', isNew: t.isNew });
    minCell.classList.add('minutes-cell');
    cMin.appendChild(minCell); row.appendChild(cMin);

    // Optional Start/Stop (visible only if toggled)
    const show = state.ui.showMore;
    const cStart = document.createElement('div'); cStart.className = 'cell col-start opt'; cStart.style.display = show ? 'block' : 'none';
    cStart.appendChild(ceCell(t.startHM != null ? hmText(t.startHM) : '', 'HH:MM', !t.invoiceId, { key: 'startHM', kind: 'time', isNew: t.isNew }));
    row.appendChild(cStart);

    const cStop = document.createElement('div'); cStop.className = 'cell col-stop opt'; cStop.style.display = show ? 'block' : 'none';
    cStop.appendChild(ceCell(t.stopHM != null ? hmText(t.stopHM) : '', 'HH:MM', !t.invoiceId, { key: 'stopHM', kind: 'time', isNew: t.isNew }));
    row.appendChild(cStop);

    // Invoice column
    const cInv = document.createElement('div'); cInv.className = 'cell col-inv';
    if (t.invoiceId) {
        const num = state.invoices.find(i => i.id === t.invoiceId)?.number || 'Invoiced';
        cInv.innerHTML = `<span>${num}</span> <i data-lucide="lock"></i>`;
    } else {
        cInv.textContent = '';
    }
    row.appendChild(cInv);

    return row;
}

// Build a contenteditable cell
function ceCell(value, placeholder, editable, meta) {
    const el = document.createElement('div');
    el.className = 'cell-edit';
    el.contentEditable = editable ? 'true' : 'false';
    el.dataset.key = meta.key; el.dataset.kind = meta.kind; if (meta.isNew) el.dataset.isNew = '1';
    if (value) el.textContent = value; else el.textContent = '';
    el.setAttribute('data-placeholder', placeholder);

    // Save on blur
    el.addEventListener('blur', () => saveCell(el));
    // Enter/Tab move focus; keep browser undo/redo, copy/paste
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); moveFocus(el, 'next'); }
        if (e.key === 'Tab') { e.preventDefault(); moveFocus(el, e.shiftKey ? 'prev' : 'next'); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); moveFocus(el, e.key === 'ArrowDown' ? 'down' : 'up'); }
        // Minutes range selection
        if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.shiftKey && el.classList.contains('minutes-cell')) {
            // handled by moveFocus + selection; no-op here
        }
    });

    // Range selection: hook focus/keydown for minutes
    if (meta.kind === 'minutes' && editable) {
        el.addEventListener('focus', minutesSelection.onFocus);
        el.addEventListener('keydown', minutesSelection.onKey);
        el.addEventListener('blur', minutesSelection.onBlur);
    }
    return el;
}

function moveFocus(from, dir) {
    const cells = $$('#timeBody .cell-edit[contenteditable="true"]');
    const idx = cells.indexOf(from);
    const cols = state.ui.showMore ? 6 : 4; // columns present
    if (dir === 'next') { (cells[idx + 1] || cells[0]).focus(); }
    else if (dir === 'prev') { (cells[idx - 1] || cells[cells.length - 1]).focus(); }
    else if (dir === 'down') { const t = cells[idx + cols]; if (t) t.focus(); }
    else if (dir === 'up') { const t = cells[idx - cols]; if (t) t.focus(); }
}

function readNewRowValues() {
    const row = $('#timeBody .row:last-child'); // new row is last
    const vals = {};
    row.querySelectorAll('.cell-edit').forEach(c => { vals[c.dataset.key] = c.textContent.trim(); });
    const dateISO = /^\d{4}-\d{2}-\d{2}$/.test(vals.dateISO) ? vals.dateISO : todayStr();
    const minutesManual = parseInt(vals.minutesRounded, 10);
    const startHM = parseHM(vals.startHM);
    const stopHM = parseHM(vals.stopHM);
    const fromTimes = roundNearest15(minutesDiff(startHM, stopHM));
    const minutes = Number.isFinite(minutesManual) ? roundNearest15(minutesManual) : fromTimes;
    return { dateISO, task: vals.task || '', minutesRounded: minutes ?? 0, startHM, stopHM };
}


function saveCell(cell) {
    const needClient = !state.client.name || !Number.isFinite(state.client.hourlyRate);
    if (needClient) { clientBanner.classList.remove('hidden'); return; }

    const key = cell.dataset.key; const kind = cell.dataset.kind; const isNew = cell.dataset.isNew === '1';
    let val = cell.textContent.trim();

    // new row becomes a saved entry once it has any content
    if (isNew) {
        const v = readNewRowValues();
        const hasContent = v.task || v.minutesRounded > 0 || (v.startHM != null && v.stopHM != null);
        if (!hasContent) { return; }
        const entry = { id: uid(), dateISO: v.dateISO, task: v.task, minutesRounded: v.minutesRounded, startHM: v.startHM ?? null, stopHM: v.stopHM ?? null, invoiceId: null };
        state.times.push(entry); persist(); renderAll(); focusTopEmptyRow(); return;
    }

    // existing row: find by data-id set on the row
    const row = cell.closest('.row');
    const id = row?.dataset?.id;
    const real = id ? state.times.find(x => x.id === id) : null;
    if (!real || real.invoiceId) return;


    if (kind === 'date') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) { cell.textContent = real.dateISO; return; }
        real.dateISO = val;
    } else if (kind === 'minutes') {
        const n = parseInt(val, 10);
        if (!Number.isFinite(n)) { cell.textContent = real.minutesRounded ?? ''; return; }
        real.minutesRounded = roundNearest15(n);
        cell.textContent = String(real.minutesRounded);
    } else if (kind === 'time') {
        if (val === '') { if (key === 'startHM') real.startHM = null; if (key === 'stopHM') real.stopHM = null; }
        else {
            const hm = parseHM(val); if (hm == null) { cell.textContent = real[key] != null ? hmText(real[key]) : ''; return; }
            real[key] = hm;
            if (!Number.isFinite(real.minutesRounded)) { const raw = minutesDiff(real.startHM, real.stopHM); real.minutesRounded = roundNearest15(raw); }
        }
    } else if (kind === 'text') {
        real.task = val;
    }

    persist(); renderBanner(); renderInvoices();
}

function focusTopEmptyRow() {
    const last = $('#timeBody .row:last-child .cell-edit');
    if (last) last.focus();
}

// Minutes range selection + sum
const minutesSelection = {
    anchor: null, last: null,
    onFocus(e) { const idx = minutesIndexFromCell(e.target); this.anchor = idx; this.last = idx; updateSelectionSum(); },
    onKey(e) {
        const idx = minutesIndexFromCell(e.target);
        if (e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault(); const dir = e.key === 'ArrowDown' ? 1 : -1; this.last = clampIndex(idx + dir); updateSelectionSum(this.anchor, this.last);
        }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault(); this.last = e.key === 'ArrowDown' ? lastMinutesIndex() : 0; updateSelectionSum(this.anchor, this.last);
        }
    },
    onBlur() { this.anchor = null; this.last = null; selectionSum.classList.add('hidden'); }
};
function minutesInputs() {
    return $$('#timeBody .row:not(:last-child) .minutes-cell');
}

function minutesIndexFromCell(cell) { return Math.max(0, minutesInputs().indexOf(cell)); }
function lastMinutesIndex() { return Math.max(0, minutesInputs().length - 1); }
function clampIndex(i) { const max = lastMinutesIndex(); return Math.min(Math.max(0, i), max); }
function updateSelectionSum(a = minutesSelection.anchor, b = minutesSelection.last) {
    if (a == null || b == null) return;
    const cells = minutesInputs(); const [s, e] = a <= b ? [a, b] : [b, a];
    let sum = 0;
    for (let i = s; i <= e; i++) { const v = parseInt(cells[i].textContent.trim(), 10); if (Number.isFinite(v)) sum += v; }
    const h = Math.floor(sum / 60), m = sum % 60; selectionSum.textContent = `Sum: ${h}h ${pad2(m)}m`; selectionSum.classList.remove('hidden');
}

// ---------- Invoices ----------
newInvoiceBtn.addEventListener('click', triggerPrintFlow);
bannerPrintBtn.addEventListener('click', triggerPrintFlow);
bannerCopyBtn.addEventListener('click', copyEmailBody);
bannerMarkBtn.addEventListener('click', markJustPrintedAsSent);

function triggerPrintFlow() {
    const needClient = !state.client.name || !Number.isFinite(state.client.hourlyRate);
    if (needClient) { openClientModal(); return; }

    const slice = nextInvoiceSlice();
    if (!slice) { alert('No 14 day window to invoice.'); return; }

    const elig = eligibleEntriesFor(slice);
    const totalMins = elig.reduce((a, t) => a + (t.minutesRounded || 0), 0);
    if (totalMins === 0) { alert('Nothing to invoice in this period.'); return; }

    const number = buildInvoiceNumber();
    const createdAtISO = new Date().toISOString();
    const dueDateISO = new Date(Date.now() + 14 * 86400000).toISOString();
    const rate = state.client.hourlyRate;
    const amount = (totalMins / 60) * rate;

    const invoice = {
        id: uid(),
        number,
        createdAtISO,
        periodStartISO: slice.start.toISOString().slice(0, 10),
        periodEndISO: slice.end.toISOString().slice(0, 10),
        totalMinutesRounded: totalMins,
        rateUsed: rate,
        amountCAD: Number(amount.toFixed(2)),
        dueDateISO
    };
    state.invoices.push(invoice);
    state.ui.lastPrintedInvoiceId = invoice.id;
    persist();

    openInvoicePrintWindow(invoice);
    renderInvoices();
    renderBanner();
    bannerCopyBtn.disabled = false;
    bannerMarkBtn.disabled = false;
}

function buildInvoiceNumber() {
    const prefix = state.settings.invoicePrefix || 'GS';
    const aa = initials2(state.client.name);
    const n = state.settings.seq++; persist();
    return `#${prefix}${aa}-${String(n).padStart(3, '0')}`;
}

function nextInvoiceSlice() {
    if (state.times.length === 0) return null;
    let start;
    if (state.invoices.length === 0) {
        const earliest = [...state.times].map(t => t.dateISO).sort()[0];
        start = new Date(`${earliest}T00:00:00`);
    } else {
        const last = state.invoices[state.invoices.length - 1];
        const d = new Date(`${last.periodEndISO}T00:00:00`); d.setDate(d.getDate() + 1); start = d;
    }
    const end = new Date(start); end.setDate(end.getDate() + 13);
    return { start, end };
}
function eligibleEntriesFor(slice) {
    const s = slice.start.toISOString().slice(0, 10);
    const e = slice.end.toISOString().slice(0, 10);
    return state.times.filter(t => !t.invoiceId && t.dateISO >= s && t.dateISO <= e && Number.isFinite(t.minutesRounded) && t.minutesRounded > 0);
}

function openInvoicePrintWindow(inv) {
    const hours = hours2(inv.totalMinutesRounded);
    const c = state.client; const today = inv.createdAtISO.slice(0, 10); const due = inv.dueDateISO.slice(0, 10); const total = inv.amountCAD.toFixed(2);
    const html = `
  <!doctype html><html><head>
  <meta charset="utf-8"><title>Invoice ${inv.number}</title>
  <link href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap" rel="stylesheet">
  <style>
  :root{--green:#0D2F01;--soft:#EDF7D2}
  *{box-sizing:border-box} body{font-family:Satoshi,system-ui; margin:40px; color:#1e1e1e}
  .top{display:flex; justify-content:space-between; align-items:flex-start}
  .title{font-size:32px; font-weight:700}
  .rightName{font-weight:700}
  .ref{color:#6b6b6b; font-size:13px}
  hr{border:none; border-top:1px solid #e5e5e5; margin:20px 0}
  .grid{display:grid; grid-template-columns: 1fr 1fr; gap:20px}
  .muted{color:#6b6b6b}
  table{width:100%; border-collapse:collapse; margin-top:16px}
  th,td{text-align:left; padding:10px 0; border-bottom:1px solid #e5e5e5}
  th:last-child, td:last-child{text-align:right}
  .footer{margin-top:40px; background:var(--green); color:#fff; padding:24px; border-radius:12px; display:flex; justify-content:space-between; align-items:center}
  .footer .total{font-size:28px; font-weight:700}
  .cad{opacity:.9}
  @media print { body{margin:14mm} }
  </style></head><body>
  <div class="top">
    <div>
      <div class="title">Invoice</div>
      <div>${c.name}</div>
      <div class="ref">Reference ${inv.number}</div>
    </div>
    <div class="rightName">GAURAV<br/>SHAH</div>
  </div>
  <hr>
  <div class="grid">
    <div>
      <div><b>Billing Date:</b> ${today}</div>
      <div><b>Due Date:</b> ${due}</div>
      <div class="muted" style="margin-top:10px"><b>Period:</b> ${inv.periodStartISO} to ${inv.periodEndISO}</div>
    </div>
    <div>
      <div><b>Billed To:</b></div>
      <div>${c.contactName || ''}</div>
      <div>${c.contactEmail || ''}</div>
    </div>
  </div>
  <table>
    <thead><tr><th>Description</th><th>Hours</th><th>Rate</th><th>Subtotal</th></tr></thead>
    <tbody><tr><td>Design services</td><td>${hours}</td><td>$${c.hourlyRate}/hr</td><td>$${total}</td></tr></tbody>
  </table>
  <div class="footer">
    <div>Preferred payment method: Interac e-transfer to <b>${state.settings.myEmail || 'your-email@example.com'}</b></div>
    <div class="total">$${total}</div>
    <div class="cad">$CAD</div>
  </div>
  </body></html>`;
    const w = window.open('', '_blank'); w.document.open(); w.document.write(html); w.document.close(); w.focus();
}

function copyEmailBody() {
    const inv = state.invoices.find(i => i.id === state.ui.lastPrintedInvoiceId); if (!inv) return;
    const first = (state.client.contactName || '').split(' ')[0] || 'there';
    const body = `Subject: Invoice ${inv.number}
  
  Hi ${first},
  
  Please find the invoice attached for design services during ${inv.periodStartISO} to ${inv.periodEndISO}.
  The due date is ${inv.dueDateISO.slice(0, 10)}. Thank you.
  
  Best,
  ${state.settings.myName || 'Gaurav'}`;
    navigator.clipboard.writeText(body).then(() => alert('Email copied'));
}
function markJustPrintedAsSent() {
    const inv = state.invoices.find(i => i.id === state.ui.lastPrintedInvoiceId); if (!inv) { alert('No invoice in this session.'); return; }
    inv.sentAtISO = new Date().toISOString();
    // Link entries
    const slice = { start: new Date(`${inv.periodStartISO}T00:00:00`), end: new Date(`${inv.periodEndISO}T00:00:00`) };
    eligibleEntriesFor(slice).forEach(t => t.invoiceId = inv.id);
    persist(); renderAll();
}

// Invoices list
function renderInvoices() {
    const list = $('#invoicesList'); list.innerHTML = '';
    const items = [...state.invoices];
    if (items.length === 0) {
        list.innerHTML = `<div class="card"><div>No invoices yet.</div><button class="btn btn-primary" onclick="triggerPrintFlow()"><i data-lucide="printer"></i><span>Print invoice</span></button></div>`;
        lucide.createIcons(); return;
    }
    for (const inv of items) {
        const card = document.createElement('div'); card.className = 'card';
        const hours = hours2(inv.totalMinutesRounded);
        card.innerHTML = `
        <div><div><b>${inv.number}</b></div><div class="muted">${inv.periodStartISO} to ${inv.periodEndISO}</div></div>
        <div>${hours} h</div>
        <div>$${inv.amountCAD.toFixed(2)} CAD</div>
        <div>${inv.sentAtISO ? '<span class="badge sent">Sent</span>' : '<span class="badge">Draft</span>'}</div>
        <div><button class="btn" data-open="${inv.id}"><i data-lucide="external-link"></i><span>Open</span></button></div>`;
        card.querySelector('[data-open]').addEventListener('click', () => {
            openInvoicePrintWindow(inv);
            state.ui.lastPrintedInvoiceId = inv.id;
            bannerCopyBtn.disabled = false; bannerMarkBtn.disabled = false;
        });
        list.appendChild(card);
    }
    lucide.createIcons();
}

// Banner logic
function renderBanner() {
    const needClient = !state.client.name || !Number.isFinite(state.client.hourlyRate);
    clientBanner.classList.toggle('hidden', !needClient);

    const slice = nextInvoiceSlice();
    if (!slice) { invoiceBanner.classList.add('hidden'); return; }
    const elig = eligibleEntriesFor(slice); const total = elig.reduce((a, t) => a + (t.minutesRounded || 0), 0);
    const periodText = `${slice.start.toISOString().slice(0, 10)} to ${slice.end.toISOString().slice(0, 10)}`;
    invoiceBannerText.textContent = `Next period ${periodText}. ${total > 0 ? 'Looks good.' : 'No minutes yet.'}`;
    invoiceBanner.classList.remove('hidden'); bannerCopyBtn.disabled = true; bannerMarkBtn.disabled = true;
    lucide.createIcons();
}

// Search (task, date, invoice number)
$('#quickSearch').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    const rows = $$('#timeBody .row');
    rows.forEach((r, idx) => {
        if (idx === 0) return; // new row stays
        const task = r.querySelector('.col-task .cell-edit')?.textContent.toLowerCase() || '';
        const date = r.querySelector('.col-date .cell-edit')?.textContent.toLowerCase() || '';
        const inv = r.querySelector('.col-inv')?.textContent.toLowerCase() || '';
        r.style.display = (task.includes(q) || date.includes(q) || inv.includes(q)) ? '' : 'none';
    });
});

// Render all
function renderAll() { renderTimeTable(); renderBanner(); if ($('.tab.active').dataset.tab === 'invoices') renderInvoices(); lucide.createIcons(); }
renderAll();
