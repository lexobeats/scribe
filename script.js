/* Roue du Scribe — logique (v2) */
/* - Curseur à DROITE (0°), aligné précisément sur la roue
   - Pourcentages affichés dans le tableau (lecture seule)
   - Couleur par personne (modifiable via color picker)
   - Import/Export CSV (séparateur ;), libellés stroke blanc + remplissage noir
*/

const canvas = document.getElementById('wheelCanvas');
const ctx = canvas.getContext('2d');
const spinBtn = document.getElementById('spinBtn');
const rowsTbody = document.getElementById('rows');
const addRowBtn = document.getElementById('addRowBtn');
const importCsvBtn = document.getElementById('importCsvBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const importFileInput = document.getElementById('importFile');

const resultBar = document.getElementById('resultBar');
const winnerTextEl = document.getElementById('winnerText');
const pointerEl = document.querySelector('.pointer');

// Rayon dérivé du CSS (en px)
function getCssRadius() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--wheel-radius').trim();
  const m = v.match(/([\d.]+)px/);
  const r = m ? parseFloat(m[1]) : 260;
  return r;
}

function resizeCanvasToRadius() {
  const r = getCssRadius();
  const size = r * 2;
  const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

const STORAGE_KEY = 'scribe-wheel:v2';

/** @type {{name:string,last:string,color?:string}[]} */
let people = [];

// Couleurs par défaut (si non définies personellement)
function defaultColor(i, n) {
  const h = Math.round((360/n) * i + 8) % 360;
  const s = 68 + Math.round(12*Math.sin(i));
  const l = 48 + Math.round(5*Math.cos(i));
  return `hsl(${h} ${s}% ${l}%)`;
}

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify({ people })); }

function load() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { const obj = JSON.parse(raw); if (Array.isArray(obj.people)) people = obj.people; } catch {}
  }
  if (!people.length) {
    people = [ { name:'Alice', last:'', color:'' }, { name:'Benoît', last:'', color:'' }, { name:'Chloé', last:'', color:'' } ];
  }
}

// Outils temps / poids
const DAY = 24*60*60*1000;
function daysSince(iso) {
  if (!iso) return null; // null => traité comme maximum
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return null;
  const now = new Date();
  const diff = Math.floor((now - d) / DAY);
  return Math.max(0, diff);
}
function weightFor(iso, maxBoostDays) {
  const ds = daysSince(iso);
  if (ds === null) return maxBoostDays + 30; // jamais / vide => gros bonus
  return Math.max(1, ds);
}

// Parts & chances
let slices = []; // { name,startDeg,endDeg,midDeg,color,weight,percent }
function rebuildSlices() {
  const dayVals = people.map(p => daysSince(p.last)).filter(v => v !== null);
  const maxDays = dayVals.length ? Math.max(...dayVals) : 30;
  const weights = people.map(p => weightFor(p.last, maxDays));
  const total = weights.reduce((a,b)=>a+b, 0) || 1;

  let cursor = -90; // on garde le 0° de départ en haut pour le dessin
  slices = people.map((p, i) => {
    const w = weights[i];
    const ang = (w / total) * 360;
    const startDeg = cursor;
    const endDeg = cursor + ang;
    cursor = endDeg;
    const percent = (w / total) * 100;
    return { name: p.name || '—', startDeg, endDeg, midDeg: startDeg + ang/2, color: (p.color && p.color.trim()) || defaultColor(i, people.length), weight: w, percent };
  });
}

// Dessin
let rotationDeg = 0;
function drawWheel() {
  const r = getCssRadius();
  const cx = r, cy = r;
  ctx.clearRect(0,0,canvas.width,canvas.height);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((Math.PI/180) * rotationDeg);

  // Anneau extérieur
  ctx.beginPath(); ctx.arc(0,0, r, 0, Math.PI*2); ctx.fillStyle = '#0b1328'; ctx.fill();

  // Secteurs + labels
  slices.forEach((s) => {
    const a0 = (Math.PI/180) * s.startDeg;
    const a1 = (Math.PI/180) * s.endDeg;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0, r-8, a0, a1); ctx.closePath();
    ctx.fillStyle = s.color; ctx.fill();

    // séparateurs
    ctx.strokeStyle = 'rgba(255,255,255,.08)'; ctx.lineWidth = 1.25; ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0, r-8, a0, a1); ctx.stroke();

    // label (texte noir avec contour blanc, sans bandeau)
    ctx.save();
    const mid = (a0 + a1)/2;
    ctx.rotate(mid);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = '800 14px system-ui, sans-serif';

    const label = (s.name || '—').toUpperCase();

    // contour blanc
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';

    // remplissage noir
    ctx.fillStyle = '#000000';

    // position: 24px à l'intérieur du bord
    ctx.strokeText(label, r - 24, 0);
    ctx.fillText(label,  r - 24, 0);

    ctx.restore();
  });

  // Moyeu
  ctx.beginPath(); ctx.arc(0,0, 30, 0, Math.PI*2); ctx.fillStyle = '#111827'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.stroke();

  ctx.restore();

  // Liseré extérieur
  ctx.save(); ctx.translate(cx, cy); ctx.beginPath(); ctx.arc(0,0, r-2, 0, Math.PI*2); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.stroke(); ctx.restore();
}

// Vainqueur : curseur à DROITE => angle 0°
function winnerForRotation(rotDeg) {
  let pointer = (0 - rotDeg) % 360; // droite
  if (pointer < 0) pointer += 360;
  return slices.find((s) => inRange(pointer, s.startDeg, s.endDeg)) || slices[slices.length-1];
}
function inRange(a, start, end) { const norm = x => (x%360+360)%360; a = norm(a); start = norm(start); end = norm(end); if (start < end) return a >= start && a < end; return a >= start || a < end; }

// Animation de spin
let animId = null;
function spin() {
  if (!people.length) return;
  resultBar.style.display = 'none';
  const start = performance.now();
  const initial = rotationDeg;
  const target = Math.random() * 360;
  const turns = 6 + Math.floor(Math.random()*3);
  const totalDelta = turns*360 + target;
  const duration = 5200 + Math.random()*1400;

  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(function step(t){
    const p = Math.min(1, (t - start)/duration);
    const ease = backOut(p);
    rotationDeg = initial + totalDelta * ease;
    drawWheel();
    if (p < 1) { animId = requestAnimationFrame(step); }
    else { const w = winnerForRotation(rotationDeg); showWinner(w.name); flashSlice(w); }
  });
}
function backOut(t) { const c1 = 1.70158; const c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }

function flashSlice(slice) {
  const r = getCssRadius();
  const start = performance.now();
  function step(t){
    const p = Math.min(1, (t - start)/1000);
    drawWheel();
    ctx.save(); ctx.translate(r, r); ctx.rotate((Math.PI/180) * rotationDeg);
    const a0 = (Math.PI/180) * slice.startDeg; const a1 = (Math.PI/180) * slice.endDeg;
    ctx.beginPath(); ctx.moveTo(0,0); ctx.arc(0,0, r-6, a0, a1); ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + 0.25*Math.sin(p*6*Math.PI)) + ')'; ctx.fill();
    ctx.restore();
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function showWinner(name){
  const n = name || '—';
  winnerTextEl.textContent = `Le prochain scribe est ${n}, félicitations ! 🎉`;
  resultBar.style.display = 'flex';
}

// --- Tableau ---
function renderTable() {
  rowsTbody.innerHTML = '';
  // recalculer les pourcentages pour affichage
  const dayVals = people.map(p => daysSince(p.last)).filter(v => v !== null);
  const maxDays = dayVals.length ? Math.max(...dayVals) : 30;
  const weights = people.map(p => weightFor(p.last, maxDays));
  const total = weights.reduce((a,b)=>a+b, 0) || 1;

  people.forEach((p, idx) => {
    const tr = document.createElement('tr');

    // Nom
    const tdName = document.createElement('td');
    const inpName = document.createElement('input'); inpName.type = 'text'; inpName.value = p.name; inpName.placeholder = 'Nom';
    inpName.addEventListener('input', () => { p.name = inpName.value; onDataChange({ rerenderTable: false });});
    tdName.appendChild(inpName);

    // Dernier passage
    const tdDate = document.createElement('td');
    const inpDate = document.createElement('input'); inpDate.type = 'date'; inpDate.value = p.last || '';
    inpDate.addEventListener('change', () => { p.last = inpDate.value; onDataChange(); });
    tdDate.appendChild(inpDate);

    // Couleur (swatch + color input)
    const tdColor = document.createElement('td'); tdColor.className = 'color-cell';
    const sw = document.createElement('div'); sw.className = 'swatch'; sw.style.background = (p.color && p.color.trim()) || defaultColor(idx, people.length);
colorInput.addEventListener('input', () => { 
  p.color = colorInput.value; 
  sw.style.background = p.color; 
  onDataChange({ rerenderTable: false }); // pas de re-render table pour garder le focus
});
    tdColor.appendChild(sw); tdColor.appendChild(colorInput);

    // % chance (lecture seule)
    const tdPct = document.createElement('td'); tdPct.className = 'chance-cell';
    const w = weights[idx]; const pct = (w / total) * 100; tdPct.textContent = pct.toFixed(1) + '%';

    // Supprimer
    const tdAct = document.createElement('td'); tdAct.className = 'action-cell';
    const del = document.createElement('button'); del.className = 'iconbtn'; del.title = 'Supprimer'; del.innerHTML = '×';
    del.addEventListener('click', () => { people.splice(idx,1); onDataChange(); renderTable(); });
    tdAct.appendChild(del);

    tr.appendChild(tdName); tr.appendChild(tdDate); tr.appendChild(tdColor); tr.appendChild(tdPct); tr.appendChild(tdAct);
    rowsTbody.appendChild(tr);
  });
}

function toHexColor(cssColor){
  // Convertit hsl()/rgb() éventuels en #rrggbb pour input[type=color]
  const c = document.createElement('canvas'); const x = c.getContext('2d'); x.fillStyle = cssColor; const computed = x.fillStyle; // normalisé en rgb(a)
  const m = computed.match(/rgb[a]?\((\d+),\s*(\d+),\s*(\d+)/i); if(!m) return '#ffffff';
  const r = Number(m[1]).toString(16).padStart(2,'0'); const g = Number(m[2]).toString(16).padStart(2,'0'); const b = Number(m[3]).toString(16).padStart(2,'0');
  return `#${r}${g}${b}`;
}

function onDataChange(opts = { rerenderTable: true }) {
  rebuildSlices();
  save();
  drawWheel();
  if (opts.rerenderTable) renderTable();
}


addRowBtn.addEventListener('click', () => { people.push({ name: '', last: '', color: '' }); onDataChange(); });

spinBtn.addEventListener('click', spin);
exportCsvBtn.addEventListener('click', exportCSV);
importCsvBtn.addEventListener('click', () => importFileInput.click());
importFileInput.addEventListener('change', handleImportCSV);

// Boot
resizeCanvasToRadius();
load();
rebuildSlices();
drawWheel();
renderTable();
positionPointer();
window.addEventListener('resize', () => { resizeCanvasToRadius(); drawWheel(); positionPointer(); });

/* === Import/Export CSV (séparateur ;) === */
function exportCSV() {
  const header = ['Nom', 'Dernier passage', 'Couleur'];
  const rows = people.map(p => [
    p.name || '',
    p.last || '',
    (p.color && p.color.trim()) || ''
  ]);
  const csv = [header, ...rows].map(r => r.map(csvEscape).join(';')).join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'participants.csv';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}

function csvEscape(val) {
  val = String(val ?? '');
  return /[;"\n\r]/.test(val) ? '"' + val.replace(/"/g, '""') + '"' : val;
}

function handleImportCSV(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result);
      const rows = parseCSV(text, ';');
      if (!rows.length) return;

      let startIdx = 0;
      let nameIdx = 0, dateIdx = 1, colorIdx = 2;

      // Détection d'en-têtes éventuels
      const header = rows[0].map(h => h.trim().toLowerCase());
      if (header.some(h => ['nom', 'dernier passage', 'couleur'].some(k => h.includes(k)))) {
        startIdx = 1;
        nameIdx = header.findIndex(h => h.startsWith('nom'));       if (nameIdx < 0) nameIdx = 0;
        dateIdx = header.findIndex(h => h.startsWith('dernier'));   if (dateIdx < 0) dateIdx = 1;
        colorIdx = header.findIndex(h => h.startsWith('couleur'));  if (colorIdx < 0) colorIdx = 2;
      }

      const imported = [];
      for (let i = startIdx; i < rows.length; i++) {
        const r = rows[i];
        if (!r || !r.length) continue;
        const name = (r[nameIdx] || '').trim();
        const last = (r[dateIdx] || '').trim();
        const color = (r[colorIdx] || '').trim();
        if (!name) continue;
        imported.push({ name, last: normalizeDate(last), color });
      }

      if (imported.length) {
        people = imported;
        onDataChange();
        renderTable();
      }
    } finally {
      importFileInput.value = '';
    }
  };
  reader.readAsText(file, 'utf-8');
}

// Parse CSV simple avec guillemets et séparateur configurable (par défaut ;)
function parseCSV(text, delimiter = ';') {
  const rows = [];
  let cur = '', row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(cur); cur = '';
      } else if (ch === '\n') {
        row.push(cur); rows.push(row); row = []; cur = '';
      } else if (ch === '\r') {
        // ignore CR
      } else {
        cur += ch;
      }
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur); rows.push(row);
  }
  return rows;
}

// Normalise quelques formats de date vers YYYY-MM-DD (vide si non reconnu)
function normalizeDate(s) {
  if (!s) return '';
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return s;
  const fr = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (fr) {
    const d = String(fr[1]).padStart(2, '0');
    const m = String(fr[2]).padStart(2, '0');
    const y = fr[3];
    return `${y}-${m}-${d}`;
  }
  return '';
}

function positionPointer() {
  const areaRect = document.querySelector('.wheel-area').getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const triangleWidth = 30; // doit correspondre au border-right ci-dessus

  // Tip de la flèche au bord droit de la roue
  pointerEl.style.left = (canvasRect.right - areaRect.left - triangleWidth) + 'px';
  // Alignement vertical sur le centre exact du canvas
  pointerEl.style.top = (canvasRect.top - areaRect.top + canvasRect.height / 2) + 'px';
  pointerEl.style.transform = 'translateY(-50%)';
}

// Polyfill roundRect (pas indispensable ici mais gardé si besoin futur)
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    if (typeof r === 'number') r = {tl:r, tr:r, br:r, bl:r};
    const {tl=0,tr=0,br=0,bl=0} = r||{};
    this.beginPath(); this.moveTo(x+tl, y); this.lineTo(x+w-tr, y); this.quadraticCurveTo(x+w, y, x+w, y+tr);
    this.lineTo(x+w, y+h-br); this.quadraticCurveTo(x+w, y+h, x+w-br, y+h);
    this.lineTo(x+bl, y+h); this.quadraticCurveTo(x, y+h, x, y+h-bl);
    this.lineTo(x, y+tl); this.quadraticCurveTo(x, y, x+tl, y); this.closePath(); return this;
  }
}
