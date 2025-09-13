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

// Désactive les actions si pas de participants ; seul "Importer CSV" reste actif.
function updateSpinDisabled() {
  const hasPeople = people.length > 0;
  const anyEmpty = people.some(p => !p.name || !p.name.trim());

  // Boutons d’action
  spinBtn.disabled = !hasPeople || anyEmpty;
  exportCsvBtn.disabled = !hasPeople;
  addRowBtn.disabled = !hasPeople; // on autorisera "+ Ajouter" après un import (au moins 1 ligne)

  // Marquage visuel des champs nom vides (si des lignes existent)
  const inputs = rowsTbody.querySelectorAll('tr input[type="text"]');
  inputs.forEach((inp, i) => {
    const empty = !people[i] || !people[i].name || !people[i].name.trim();
    inp.classList.toggle('invalid', empty);
    inp.setAttribute('aria-invalid', empty ? 'true' : 'false');
  });
}


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


/** @type {{name:string,last:string,color?:string}[]} */
let people = [];

// Couleurs par défaut (si non définies personnellement)
function defaultColor(i) {
  const golden = 137.508; // répartition uniforme
  const h = (i * golden) % 360;
  const s = 68;
  const l = 52;
  return `hsl(${h}, ${s}%, ${l}%)`;
}


function load() {
people = []; 
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
// Parts & chances
let slices = []; // { name,startDeg,endDeg,midDeg,color,weight(=prob),percent }
function rebuildSlices() {
  const N = people.length;

  // Couleurs par défaut
  people.forEach((p, i) => {
    if (!p.color || !p.color.trim()) p.color = defaultColor(i);
  });

  // Poids “bruts” basés sur la date
  const dayVals  = people.map(p => daysSince(p.last)).filter(v => v !== null);
  const maxDays  = dayVals.length ? Math.max(...dayVals) : 30;
  const raw      = people.map(p => weightFor(p.last, maxDays));
  const sumRaw   = raw.reduce((a,b)=>a+b, 0);

  // Baseline : au moins 1% chacun (si >100 personnes, fallback à 1/N)
  let epsilon = N ? 0.01 : 0;
  if (N * epsilon >= 1) epsilon = N ? 1 / N : 0; // impossible d'avoir 1% si N>100
  const reserved = N * epsilon;

  let cursor = -90;
  let accProb = 0;
  slices = people.map((p, i) => {
    // probabilité finale (somme = 1)
    const baseProb = (sumRaw > 0 && reserved < 1)
      ? epsilon + (1 - reserved) * (raw[i] / sumRaw)
      : (N ? 1 / N : 0);

    // Assure la somme exacte à 1 (corrige les arrondis sur le dernier)
    const prob = (i < N - 1) ? baseProb : Math.max(0, 1 - accProb);
    accProb += prob;

    const ang = prob * 360;
    const startDeg = cursor;
    const endDeg   = cursor + ang;
    cursor = endDeg;

    return {
      name: (p.name || ''),
      startDeg, endDeg,
      midDeg: startDeg + ang / 2,
      color: p.color,
      weight: prob,             // on stocke la probabilité normalisée
      percent: prob * 100
    };
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

    const label = (s.name && s.name.trim()) ? s.name.toUpperCase() : '';

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
let isSpinning = false;
function spin() {
  ensureAudioContext();
  // Bloque si pas de participants, si ça tourne déjà, ou si un nom est vide
  if (!people.length || isSpinning || people.some(p => !p.name || !p.name.trim())) {
    updateSpinDisabled();
    return;
  }

  isSpinning = true;
  document.body.classList.add('spinning');

  const _lockedBtns = Array.from(document.querySelectorAll('button'));
  const _lockedInputs = Array.from(document.querySelectorAll('input[type="date"], .name-input, input[type="color"]'));
  _lockedInputs.forEach(i => i.disabled = true);
  _lockedBtns.forEach(b => b.disabled = true);

  resultBar.style.display = 'none';

  const start = performance.now();
  const initial = rotationDeg;
  const target = Math.random() * 360;
  const turns = 12 + Math.floor(Math.random()*4);
  const totalDelta = turns*360 + target;
  const duration = 6800 + Math.random()*3200;

  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(function step(t){
    const p = Math.min(1, (t - start)/duration);
    const ease = (p < 1) ? suspenseEase(p) : 1;
    rotationDeg = initial + totalDelta * ease;
    drawWheel();
    if (p < 1) {
      animId = requestAnimationFrame(step);
    } else {
      const w = winnerForRotation(rotationDeg);
      showWinner(w.name);
      flashSlice(w);
      playWinSound();
      boomConfetti();
      queueSpeakWinner(chosen.name, 700);
      isSpinning = false;
      document.body.classList.remove('spinning');
      _lockedBtns.forEach(b => b.disabled = false);
      _lockedInputs.forEach(i => i.disabled = false);
      updateSpinDisabled(); // ré-applique la règle des noms requis
    }
  });
}
function suspenseEase(t){return t<=0?0:t>=1?1:t>0.999?1:1-Math.pow(1-t,3);}


function flashSlice(slice) {
  const r = getCssRadius();
  const start = performance.now();

  function step(t){
    const p = Math.min(1, (t - start)/1000);

    // On redessine toujours la roue d'abord
    drawWheel();

    if (p < 1) {
      ctx.save();
      ctx.translate(r, r);
      ctx.rotate((Math.PI/180) * rotationDeg);

      const a0 = (Math.PI/180) * slice.startDeg;
      const a1 = (Math.PI/180) * slice.endDeg;

      // Secteur annulaire (ne couvre pas le moyeu)
      const outerR = r - 6;
      const innerR = 36; // > 30 (rayon du moyeu)
      ctx.beginPath();
      ctx.arc(0, 0, outerR, a0, a1, false);
      ctx.arc(0, 0, innerR, a1, a0, true);
      ctx.closePath();

      ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + 0.25*Math.sin(p*6*Math.PI)) + ')';
      ctx.fill();

      // Remet le moyeu par-dessus
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.fillStyle = '#111827';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,.15)';
      ctx.stroke();

      ctx.restore();

      requestAnimationFrame(step);
    }
    // p === 1 : on s'arrête sur la roue "normale" (pas d'overlay)
  }

  requestAnimationFrame(step);
}



function showWinner(name){
  const n = name || '—';
  winnerTextEl.textContent = `🎉 Le prochain scribe est ${n}, félicitations ! 🎉`;
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
    const inpName = document.createElement('input'); inpName.type = 'text'; inpName.value = p.name; inpName.placeholder = 'Nom'; inpName.classList.add('name-input');
    inpName.maxLength = 18;
 inpName.addEventListener('input', () => {
  if (inpName.value.length > 18) {
    inpName.value = inpName.value.slice(0, 18);
  }
  p.name = inpName.value;
  onDataChange({ redrawTable: false });
});

    tdName.appendChild(inpName);

    // Dernier passage
    const tdDate = document.createElement('td');
    const inpDate = document.createElement('input'); inpDate.type = 'date'; inpDate.value = p.last || '';
    inpDate.addEventListener('change', () => { p.last = inpDate.value; onDataChange(); });
    tdDate.appendChild(inpDate);

    // Couleur (swatch + color input)
    const tdColor = document.createElement('td'); tdColor.className = 'color-cell';
    const sw = document.createElement('div'); sw.className = 'swatch'; sw.style.background = (p.color && p.color.trim()) || defaultColor(idx);
    const colorInput = document.createElement('input'); colorInput.type = 'color'; colorInput.value = toHexColor(sw.style.background);
    colorInput.style.display = 'none';
    sw.addEventListener('click', () => { if (isSpinning) return; colorInput.click(); });
    colorInput.addEventListener('input', () => { p.color = colorInput.value; sw.style.background = p.color; onDataChange(); });
    tdColor.appendChild(sw); tdColor.appendChild(colorInput);

    // % chance (lecture seule)
    const tdPct = document.createElement('td'); tdPct.className = 'chance-cell';
    const pct = (slices[idx]?.percent ?? 0); tdPct.textContent = pct.toFixed(1) + '%';

    // Supprimer
    const tdAct = document.createElement('td'); tdAct.className = 'action-cell';
    const del = document.createElement('button'); del.className = 'iconbtn'; del.title = 'Supprimer'; del.innerHTML = '×';
    del.addEventListener('click', () => {
  const name = (p.name || '').trim();
  if (name) {
    const ok = confirm(`Êtes-vous sûr de vouloir supprimer notre cher collègue ${name} du tableau des scribes ?`);
    if (!ok) return;
  }
  people.splice(idx, 1);
  onDataChange();
  renderTable();
});

    tdAct.appendChild(del);

    tr.appendChild(tdName); tr.appendChild(tdDate); tr.appendChild(tdColor); tr.appendChild(tdPct); tr.appendChild(tdAct);
    rowsTbody.appendChild(tr);
  });

  // Après rendu, mettre à jour l'état "noms requis"
  updateSpinDisabled();
}

function toHexColor(cssColor){
  if (!cssColor) return '#ffffff';
  const probe = document.createElement('div');
  probe.style.display = 'none';
  document.body.appendChild(probe);

  // Essaye d'abord en background (utile quand on lit sw.style.background)
  probe.style.background = cssColor;
  let rgb = getComputedStyle(probe).backgroundColor;

  // Si ce n’est pas un rgb/rgba, tente via color
  if (!/^rgb/i.test(rgb)) {
    probe.style.background = '';
    probe.style.color = cssColor;
    rgb = getComputedStyle(probe).color;
  }

  document.body.removeChild(probe);

  const m = rgb && rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!m) return '#ffffff';

  const r = Number(m[1]).toString(16).padStart(2,'0');
  const g = Number(m[2]).toString(16).padStart(2,'0');
  const b = Number(m[3]).toString(16).padStart(2,'0');
  return `#${r}${g}${b}`;
}


function onDataChange({ redrawTable = true } = {}) {
  rebuildSlices();
  drawWheel();
  if (redrawTable) renderTable();
  // Toujours ré-appliquer la règle "noms requis"
  updateSpinDisabled();
}

addRowBtn.addEventListener('click', () => {
people.push({ name: '', last: '', color: '' });
  onDataChange();
  // Focus le champ Nom de la dernière ligne pour encourager la saisie immédiate
  requestAnimationFrame(() => {
    const lastName = rowsTbody.querySelector('tr:last-child input[type="text"]');
    if (lastName) lastName.focus();
  });
});

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
updateSpinDisabled();

window.addEventListener('resize', () => { resizeCanvasToRadius(); drawWheel(); positionPointer(); });

function exportCSV() {
  const header = ['Nom', 'Dernier passage', 'Couleur'];

  const rows = people.map((p, i) => {
    const name = (p.name || '').trim();
    // date stockée en ISO (YYYY-MM-DD) -> JJ/MM/AAAA
    const dateFR = formatDateFR(p.last || '');

    // couleur effective : si pas de couleur utilisateur, on prend la couleur par défaut
    const effectiveCss = (p.color && p.color.trim()) || defaultColor(i);
    const hex = toHexColor(effectiveCss); // toujours #rrggbb

    return [name, dateFR, hex];
  });

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

function formatDateFR(iso) {
  if (!iso) return '';
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  return `${m[3]}/${m[2]}/${m[1]}`; // JJ/MM/AAAA
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
  // La rotation de la roue est gérée dans drawWheel(); la flèche reste fixe.
}

// Audio
let audioCtx = null;
function ensureAudioContext(){ if(!audioCtx){ try{ audioCtx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } }
function playWinSound(){
  if(!audioCtx) return;
  const now = audioCtx.currentTime;
  const notes = [523.25, 659.25, 783.99]; // C5 E5 G5
  notes.forEach((f,i)=>{
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    o.connect(g); g.connect(audioCtx.destination);
    g.gain.setValueAtTime(0, now+i*0.02);
    g.gain.linearRampToValueAtTime(0.12, now+0.01+i*0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, now+0.24+i*0.02);
    o.start(now+i*0.02);
    o.stop(now+0.26+i*0.02);
  });
}

// Confettis (utilise canvas-confetti si dispo)
function boomConfetti(anchor = resultBar){
  if (typeof confetti !== 'function') return;

  const vw = Math.max(1, window.innerWidth);
  const vh = Math.max(1, window.innerHeight);
  const rect = (anchor && anchor.getBoundingClientRect()) || { left: vw*0.5, right: vw*0.5, top: vh*0.3, height: 40 };

  const y = (rect.top + rect.height / 2) / vh;
  const leftX  = Math.max(0, Math.min(1, (rect.left  - 8) / vw));
  const rightX = Math.max(0, Math.min(1, (rect.right + 8) / vw));

  // angles proches de 90° (haut), légèrement inclinés vers l’intérieur
  const end = Date.now() + 600;
  (function frame(){
    confetti({ particleCount: 40, spread: 50, origin: { x: leftX,  y }, angle: 92,  startVelocity: 55 });
    confetti({ particleCount: 40, spread: 50, origin: { x: rightX, y }, angle: 88, startVelocity: 55 });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

/* === Rainbow Cursor Trail (plein écran, non bloquant) === */
(function(){
  const cvs = document.createElement('canvas');
  cvs.id = 'cursorTrail';
  Object.assign(cvs.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: 999
  });
  document.body.appendChild(cvs);

  const trailCtx = cvs.getContext('2d');
  let dpr=1, W=0, H=0;
  function resize(){
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth; H = window.innerHeight;
    cvs.width = Math.max(1, Math.round(W * dpr));
    cvs.height = Math.max(1, Math.round(H * dpr));
    trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0); // dessine en px CSS
  }
  resize();
  addEventListener('resize', resize);

  const particles = [];
  const MAX_PARTICLES = 160;     // ajuste si tu veux plus/moins dense
  const STEP = 6;                // distance en px entre spawns
  let hue = 0;
  let lastX = null, lastY = null;

  addEventListener('pointermove', (e)=>{
    const x = e.clientX, y = e.clientY;
    if (lastX == null) { lastX = x; lastY = y; }
    const dx = x - lastX, dy = y - lastY;
    const dist = Math.hypot(dx, dy) || 0;

    // on “tisse” des particules régulièrement le long du segment (last -> pos)
    for (let i = 0; i < dist; i += STEP) {
      const t = i / dist;
      spawn(lastX + dx*t, lastY + dy*t);
    }
    lastX = x; lastY = y;
  });

  function spawn(x, y){
    hue = (hue + 6) % 360; // défilement de teinte
    particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 0.6,
      vy: (Math.random() - 0.8) * 0.6 - 0.1, // légère poussée vers le haut
      size: 4 + Math.random()*3,
      life: 0,
      maxLife: 500 + Math.random()*250,      // 0.5–0.75s env.
      hue
    });
    if (particles.length > MAX_PARTICLES) {
      particles.splice(0, particles.length - MAX_PARTICLES);
    }
  }

  let raf = null;
  function tick(){
    raf = requestAnimationFrame(tick);
    trailCtx.clearRect(0, 0, W, H);
    trailCtx.globalCompositeOperation = 'lighter'; // glow additif

    // dessine du plus ancien au plus récent (ou l’inverse, peu importe ici)
    for (let i = particles.length - 1; i >= 0; i--){
      const p = particles[i];
      p.life += 16;                          // ~60 fps
      if (p.life >= p.maxLife) { particles.splice(i,1); continue; }
      p.x += p.vx; p.y += p.vy;
      const a = 1 - (p.life / p.maxLife);    // alpha décroissant 1→0

      trailCtx.beginPath();
      trailCtx.arc(p.x, p.y, p.size, 0, Math.PI*2);
      trailCtx.fillStyle = `hsla(${p.hue}, 100%, 60%, ${a})`;
      trailCtx.fill();
    }
  }
  tick();

  // pause quand l’onglet est inactif
  addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = null; }
    else if (!raf) { raf = requestAnimationFrame(tick); }
  });
})();

// À coller une fois (fin de script par ex.)
document.addEventListener('keydown', (e)=>{
  if (e.repeat) return;
  const tag = (e.target.tagName||'').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;
  if ((e.code === 'Space' || e.code === 'Enter') && !isSpinning) spin();
});

function preSpinCountdown(next){
  const o = document.createElement('div');
  Object.assign(o.style,{position:'fixed',inset:'0',display:'grid',placeItems:'center',background:'rgba(0,0,0,.35)',backdropFilter:'blur(2px)',font:'900 120px system-ui',color:'#fff',zIndex:1000});
  document.body.appendChild(o);
  let n=3; o.textContent=n;
  const iv = setInterval(()=>{ n--; o.textContent = n || 'GO'; if(n<0){ clearInterval(iv); o.remove(); next(); } }, 700);
}

function speakWinner(name, locale='fr-FR'){
  try{
    if (!ttsReady) loadVoices();
    if (speechSynthesis.speaking || speechSynthesis.pending) {
      speechSynthesis.cancel();
      // Chrome aime une micro-pause après cancel()
      setTimeout(()=>speakWinner(name, locale), 50);
      return;
    }
    const u = new SpeechSynthesisUtterance(`Le prochain scribe est ${name}`);
    u.lang = locale;
    u.rate = 1; u.pitch = 1; u.volume = 1;
    if (ttsVoice) u.voice = ttsVoice;
    speechSynthesis.speak(u);
  }catch{}
}


// --- TTS robuste (Chrome/Firefox) ---
let ttsVoice = null;

// Attendre que les voix soient prêtes (Chrome charge de façon asynchrone)
function waitForVoicesReady(timeout = 2000){
  return new Promise(resolve => {
    const have = speechSynthesis.getVoices();
    if (have && have.length) { resolve(have); return; }
    let done = false;
    const onV = () => {
      if (done) return;
      done = true;
      speechSynthesis.removeEventListener('voiceschanged', onV);
      resolve(speechSynthesis.getVoices() || []);
    };
    speechSynthesis.addEventListener('voiceschanged', onV);
    // Déclenche le chargement
    speechSynthesis.getVoices();
    // Fallback timeout
    setTimeout(() => {
      if (done) return;
      done = true;
      speechSynthesis.removeEventListener('voiceschanged', onV);
      resolve(speechSynthesis.getVoices() || []);
    }, timeout);
  });
}

function pickVoice(voices, locale='fr-FR'){
  return voices.find(v => /google.*fr/i.test(v.name))
      || voices.find(v => v.lang === locale)
      || voices.find(v => (v.lang||'').toLowerCase().startsWith('fr'))
      || voices[0]
      || null;
}

// Prime TTS sur la 1ère interaction (débloque l’autoplay)
document.addEventListener('pointerdown', () => {
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0; // inaudible
    speechSynthesis.speak(u);
  } catch {}
}, { once:true });

// File l’annonce après un délai (ex: confettis), en attendant les voix si nécessaire
function queueSpeakWinner(name, delayMs = 0){
  setTimeout(() => {
    waitForVoicesReady().then(voices => {
      try {
        if (!ttsVoice && voices.length) ttsVoice = pickVoice(voices, 'fr-FR');
        // Évite les superpositions
        if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();

        const u = new SpeechSynthesisUtterance(`Le prochain scribe est ${name}`);
        u.lang = 'fr-FR';
        u.rate = 1; u.pitch = 1; u.volume = 1;
        if (ttsVoice) u.voice = ttsVoice;
        speechSynthesis.speak(u);
      } catch {}
    });
  }, delayMs);
}

