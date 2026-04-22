// ═══════════════════════════════════════════════
//  mj.js — Logique onglet MJ
// ═══════════════════════════════════════════════

// ─────────────────────────────────────────────
//  État local MJ
// ─────────────────────────────────────────────
let mjMapActive    = null;       // nom fichier map active
let mjMapImage     = null;       // Image JS
let mjGrille       = { visible: true, nb_cases: 20, offset_x: 0, offset_y: 0, couleur: '#ffffff', opacite: 25 };
let mjJetons       = [];         // jetons sur la map  [{ def, imgObj, x, y, col, ligne, cache, id }]
let mjFormes       = [];         // formes (murs) de la map
let mjTokenDefs    = [];         // définitions de jetons disponibles
let mjPresets      = [];         // présets enregistrés
let mjMaps         = [];         // maps uploadées
let mjMapConfigs   = {};         // configs grille par map

// Fog of War & affichage
let mjFogActif     = true;
let mjFormesVisible= false;

// Zoom & déplacement canvas
let mjZoom         = 1.0;        // facteur zoom (1 = 100%)
let mjOffsetX      = 0;          // décalage de vue X
let mjOffsetY      = 0;          // décalage de vue Y
let mjModeDeplace  = false;      // mode "Se déplacer" actif
let mjDragCanvas   = { actif: false, startX: 0, startY: 0, startOX: 0, startOY: 0 };

// Placement de jeton
let mjJetonAPoser  = null;       // def du jeton en cours de placement

// Drag & drop jeton sur canvas
let mjDragJeton    = { actif: false, inst: null, offsetX: 0, offsetY: 0 };

// Menu contextuel
let mjContextJeton = null;       // jeton ciblé par le clic droit

// ─────────────────────────────────────────────
//  Canvas MJ
// ─────────────────────────────────────────────
const cvMj  = document.getElementById('canvas-mj');
const ctxMj = cvMj.getContext('2d');

function redimCanvasMj() {
    const parent  = cvMj.parentElement;
    cvMj.width    = parent.clientWidth;
    cvMj.height   = parent.clientHeight;
    redessinerMj();
}

function redessinerMj() {
    ctxMj.clearRect(0, 0, cvMj.width, cvMj.height);
    ctxMj.save();
    ctxMj.translate(mjOffsetX, mjOffsetY);
    ctxMj.scale(mjZoom, mjZoom);

    // Fond
    ctxMj.fillStyle = '#0a0a1a';
    ctxMj.fillRect(0, 0, cvMj.width, cvMj.height);

    // Map — coordonnées logiques fixes (comme dans preset.js)
    if (mjMapImage) {
        const ratio = Math.min(cvMj.width / mjMapImage.width, cvMj.height / mjMapImage.height);
        const dW    = mjMapImage.width  * ratio;
        const dH    = mjMapImage.height * ratio;
        const dX    = (cvMj.width  - dW) / 2;
        const dY    = (cvMj.height - dH) / 2;
        ctxMj.drawImage(mjMapImage, dX, dY, dW, dH);
    }

    // Grille
    if (mjGrille.visible) dessinerGrilleMj();

    // Formes (murs) — seulement si case cochée
    if (mjFormesVisible) dessinerFormesMj();

    // Jetons
    dessinerJetonsMj();

    ctxMj.restore();
}

function dessinerGrilleMj() {
    const { nb_cases, offset_x, offset_y, couleur, opacite } = mjGrille;
    const taille = cvMj.width / nb_cases;
    if (taille < 2) return;

    const r = parseInt(couleur.slice(1,3), 16);
    const g = parseInt(couleur.slice(3,5), 16);
    const b = parseInt(couleur.slice(5,7), 16);
    ctxMj.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacite / 100})`;
    ctxMj.lineWidth   = 1 / mjZoom;

    for (let x = offset_x % taille; x < cvMj.width; x += taille) {
        ctxMj.beginPath(); ctxMj.moveTo(x, 0); ctxMj.lineTo(x, cvMj.height); ctxMj.stroke();
    }
    for (let y = offset_y % taille; y < cvMj.height; y += taille) {
        ctxMj.beginPath(); ctxMj.moveTo(0, y); ctxMj.lineTo(cvMj.width, y); ctxMj.stroke();
    }
}

function dessinerFormesMj() {
    mjFormes.forEach(f => {
        ctxMj.save();
        if (f.type === 'carre') {
            ctxMj.strokeStyle = '#00bfff';
            ctxMj.lineWidth   = 2 / mjZoom;
            ctxMj.fillStyle   = 'rgba(0, 191, 255, 0.08)';
            ctxMj.beginPath();
            ctxMj.rect(f.x, f.y, f.w, f.h);
            ctxMj.fill(); ctxMj.stroke();
        } else if (f.type === 'cercle') {
            ctxMj.strokeStyle = '#00bfff';
            ctxMj.lineWidth   = 2 / mjZoom;
            ctxMj.fillStyle   = 'rgba(0, 191, 255, 0.08)';
            ctxMj.beginPath();
            ctxMj.ellipse(f.cx, f.cy, f.rx, f.ry, 0, 0, Math.PI * 2);
            ctxMj.fill(); ctxMj.stroke();
        } else if (f.type === 'porte') {
            ctxMj.fillStyle   = '#f0a500';
            ctxMj.strokeStyle = '#f0a500';
            ctxMj.lineWidth   = 4 / mjZoom;
            ctxMj.beginPath(); ctxMj.arc(f.x1, f.y1, 5 / mjZoom, 0, Math.PI * 2); ctxMj.fill();
            ctxMj.beginPath(); ctxMj.arc(f.x2, f.y2, 5 / mjZoom, 0, Math.PI * 2); ctxMj.fill();
            if (!f.ouverte) {
                ctxMj.beginPath(); ctxMj.moveTo(f.x1, f.y1); ctxMj.lineTo(f.x2, f.y2); ctxMj.stroke();
            }
        }
        ctxMj.restore();
    });
}

function dessinerJetonsMj() {
    mjJetons.forEach(inst => {
        const def  = inst.def;
        const img  = inst.imgObj;
        const size = tailleJetonMjPx(def.taille);

        if (!img || !img.complete) return;

        ctxMj.save();
        ctxMj.globalAlpha = inst.cache ? 0.5 : 1.0;

        // Masque
        ctxMj.beginPath();
        if (def.forme === 'cercle') {
            ctxMj.arc(inst.x + size / 2, inst.y + size / 2, size / 2, 0, Math.PI * 2);
        } else {
            ctxMj.roundRect(inst.x, inst.y, size, size, 6 / mjZoom);
        }
        ctxMj.clip();

        // Image
        const scale = size / 120;
        ctxMj.drawImage(img,
            inst.x + def.offset_x * scale,
            inst.y + def.offset_y * scale,
            img.naturalWidth  * def.zoom * scale,
            img.naturalHeight * def.zoom * scale
        );
        ctxMj.restore();

        // Bordure
        ctxMj.save();
        ctxMj.globalAlpha = inst.cache ? 0.5 : 1.0;
        ctxMj.strokeStyle = def.bordure;
        ctxMj.lineWidth   = 2 / mjZoom;
        ctxMj.beginPath();
        if (def.forme === 'cercle') {
            ctxMj.arc(inst.x + size / 2, inst.y + size / 2, size / 2, 0, Math.PI * 2);
        } else {
            ctxMj.roundRect(inst.x, inst.y, size, size, 6 / mjZoom);
        }
        ctxMj.stroke();
        ctxMj.restore();
    });
}

// ─────────────────────────────────────────────
//  Utilitaires grille MJ
// ─────────────────────────────────────────────
function tailleCaseMjPx() {
    return cvMj.width / mjGrille.nb_cases;
}

function tailleJetonMjPx(taille) {
    const c = tailleCaseMjPx();
    if (taille === 'S') return Math.max(c * 0.8, 20);
    if (taille === 'L') return c * 2;
    return c;
}

function snapGrilleMj(x, y) {
    const c    = tailleCaseMjPx();
    const offX = mjGrille.offset_x % c;
    const offY = mjGrille.offset_y % c;
    const col  = Math.round((x - offX) / c);
    const ligne= Math.round((y - offY) / c);
    return { x: col * c + offX, y: ligne * c + offY, col, ligne };
}

// Convertir coordonnées écran → canvas logique (tenant compte zoom+offset)
function screenToCanvas(sx, sy) {
    return {
        x: (sx - mjOffsetX) / mjZoom,
        y: (sy - mjOffsetY) / mjZoom
    };
}

function caseOccupeeMj(col, ligne, taille, excluId = null) {
    const cases = casesMj(col, ligne, taille);
    return mjJetons.some(inst => {
        if (inst.id === excluId) return false;
        const ic = casesMj(inst.col, inst.ligne, inst.def.taille);
        return cases.some(c => ic.some(i => i.col === c.col && i.ligne === c.ligne));
    });
}

function casesMj(col, ligne, taille) {
    if (taille === 'L') return [
        { col, ligne }, { col: col+1, ligne },
        { col, ligne: ligne+1 }, { col: col+1, ligne: ligne+1 }
    ];
    return [{ col, ligne }];
}

function jetonMjSousPoint(x, y) {
    // x, y en coordonnées canvas logiques
    return mjJetons.find(inst => {
        const size = tailleJetonMjPx(inst.def.taille);
        return x >= inst.x && x <= inst.x + size && y >= inst.y && y <= inst.y + size;
    });
}

// ─────────────────────────────────────────────
//  Resize
// ─────────────────────────────────────────────
window.addEventListener('resize', redimCanvasMj);
redimCanvasMj();

// ─────────────────────────────────────────────
//  Zoom & Navigation
// ─────────────────────────────────────────────
function majLabelZoom() {
    document.getElementById('label-zoom').textContent = Math.round(mjZoom * 100) + '%';
}

document.getElementById('btn-zoom-plus').addEventListener('click', () => {
    mjZoom = Math.min(mjZoom + 0.05, 5);
    majLabelZoom();
    redessinerMj();
    socket.emit('mj_view_updated', { zoom: mjZoom, offsetX: mjOffsetX, offsetY: mjOffsetY });
});

document.getElementById('btn-zoom-moins').addEventListener('click', () => {
    mjZoom = Math.max(mjZoom - 0.05, 0.2);
    majLabelZoom();
    redessinerMj();
    socket.emit('mj_view_updated', { zoom: mjZoom, offsetX: mjOffsetX, offsetY: mjOffsetY });
});

document.getElementById('btn-se-deplacer').addEventListener('click', () => {
    mjModeDeplace = !mjModeDeplace;
    const btn = document.getElementById('btn-se-deplacer');
    btn.classList.toggle('actif', mjModeDeplace);
    cvMj.style.cursor = mjModeDeplace ? 'grab' : 'default';
});

// ─────────────────────────────────────────────
//  Fog of War & Formes
// ─────────────────────────────────────────────
document.getElementById('toggle-fog').addEventListener('change', e => {
    mjFogActif = e.target.checked;
    socket.emit('toggle_fog', { active: mjFogActif });
});

document.getElementById('toggle-formes').addEventListener('change', e => {
    mjFormesVisible = e.target.checked;
    redessinerMj();
});

// ─────────────────────────────────────────────
//  Liste Présets & Maps
// ─────────────────────────────────────────────
function afficherListePresets() {
    const liste = document.getElementById('liste-preset-dispo');
    liste.innerHTML = '';

    // Maps simples (avec config enregistrée)
    mjMaps.forEach(filename => {
        if (!mjMapConfigs[filename]) return;
        const item = document.createElement('div');
        item.className = 'preset-mj-item' + (filename === mjMapActive ? ' actif' : '');
        item.innerHTML = `<span>🗺️</span><span class="preset-mj-item-nom">${filename}</span>`;
        item.addEventListener('click', () => chargerMapMj(filename));
        liste.appendChild(item);
    });

    // Présets
    mjPresets.forEach(p => {
        const item = document.createElement('div');
        item.className = 'preset-mj-item';
        item.innerHTML = `<span>🗂️</span><span class="preset-mj-item-nom">${p.nom}</span>`;
        item.addEventListener('click', () => chargerPresetMj(p));
        liste.appendChild(item);
    });

    if (!liste.children.length) {
        liste.innerHTML = '<span style="font-size:11px;color:#888">Aucun préset ou map</span>';
    }
}

function chargerMapMj(filename) {
    mjMapActive = filename;
    mjJetons    = [];
    mjFormes    = [];

    if (mjMapConfigs[filename]) {
        mjGrille = { ...mjGrille, ...mjMapConfigs[filename] };
    }

    mjMapImage = new Image();
    mjMapImage.onload = () => redessinerMj();
    mjMapImage.src    = `/uploads/maps/${filename}`;

    afficherListePresets();
    socket.emit('change_map', { map: filename });
    socket.emit('update_grille', mjGrille);
    diffuserEtatJetons();
}

function chargerPresetMj(p) {
    mjMapActive = p.map || null;
    mjFormes    = (p.formes || []).map(f => ({ ...f }));
    mjGrille    = p.grille ? { ...mjGrille, ...p.grille } : mjGrille;

    // Charger la map image
    if (p.map) {
        mjMapImage = new Image();
        mjMapImage.onload = () => redessinerMj();
        mjMapImage.src    = `/uploads/maps/${p.map}`;
    } else {
        mjMapImage = null;
    }

    // Replacer les jetons
    mjJetons = [];
    (p.jetons || []).forEach(inst => {
        const def = mjTokenDefs.find(d => d.id === inst.defId);
        if (!def) return;
        const imgObj = new Image();
        imgObj.src   = `/uploads/tokens/${def.image}`;
        imgObj.onload = () => redessinerMj();
        mjJetons.push({
            id:      `mj_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            def, imgObj,
            x: inst.x, y: inst.y,
            col: inst.col, ligne: inst.ligne,
            cache: inst.cache || false
        });
    });

    afficherListePresets();
    socket.emit('change_map', { map: mjMapActive });
    socket.emit('update_grille', mjGrille);
    diffuserEtatJetons();
    redessinerMj();
}

// ─────────────────────────────────────────────
//  Enregistrer map actuelle comme préset
// ─────────────────────────────────────────────
document.getElementById('btn-sauver-preset-mj').addEventListener('click', async () => {
    const nom = document.getElementById('input-nom-preset-mj').value.trim();
    if (!nom) return alert('Donne un nom au préset.');

    const preset = {
        id:     `preset_${Date.now()}`,
        nom,
        map:    mjMapActive,
        grille: { ...mjGrille },
        jetons: mjJetons.map(inst => ({
            defId: inst.def.id,
            x: inst.x, y: inst.y,
            col: inst.col, ligne: inst.ligne,
            cache: inst.cache || false
        })),
        formes: mjFormes.map(f => ({ ...f }))
    };

    const res  = await fetch('/api/preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(preset)
    });
    const data = await res.json();
    if (data.success) {
        mjPresets = data.presets;
        afficherListePresets();
        document.getElementById('input-nom-preset-mj').value = '';
        alert(`✅ Préset "${nom}" enregistré !`);
    }
});

// ─────────────────────────────────────────────
//  Liste Jetons disponibles
// ─────────────────────────────────────────────
function afficherListeJetons() {
    const liste = document.getElementById('liste-tokens-dispo');
    liste.innerHTML = '';

    mjTokenDefs.forEach(def => {
        const item = document.createElement('div');
        item.className = 'token-mj-item' + (mjJetonAPoser && mjJetonAPoser.id === def.id ? ' selectionne' : '');

        const mini = document.createElement('canvas');
        mini.width = mini.height = 28;
        item.appendChild(mini);

        const nom = document.createElement('span');
        nom.textContent = def.nom;
        item.appendChild(nom);

        const taille = document.createElement('span');
        taille.textContent = def.taille;
        taille.style.cssText = 'font-size:10px;color:#888;margin-left:auto';
        item.appendChild(taille);

        // Mini dessin
        const img2 = new Image();
        img2.onload = () => {
            const c2 = mini.getContext('2d');
            const d  = def;
            c2.save();
            c2.beginPath();
            if (d.forme === 'cercle') c2.arc(14, 14, 13, 0, Math.PI * 2);
            else c2.roundRect(1, 1, 26, 26, 4);
            c2.clip();
            const s = 28 / 120;
            c2.drawImage(img2, d.offset_x * s, d.offset_y * s, img2.naturalWidth * d.zoom * s, img2.naturalHeight * d.zoom * s);
            c2.restore();
            c2.strokeStyle = d.bordure;
            c2.lineWidth = 2;
            c2.beginPath();
            if (d.forme === 'cercle') c2.arc(14, 14, 13, 0, Math.PI * 2);
            else c2.roundRect(1, 1, 26, 26, 4);
            c2.stroke();
        };
        img2.src = `/uploads/tokens/${def.image}`;

        item.addEventListener('click', () => {
            if (mjJetonAPoser && mjJetonAPoser.id === def.id) {
                // Annuler sélection
                mjJetonAPoser = null;
                cvMj.style.cursor = mjModeDeplace ? 'grab' : 'default';
            } else {
                mjJetonAPoser = def;
                cvMj.style.cursor = 'crosshair';
            }
            afficherListeJetons();
            afficherPrevisualisation();
        });

        liste.appendChild(item);
    });
}

function afficherPrevisualisation() {
    const zone = document.getElementById('token-previsualisation');
    zone.innerHTML = '';
    if (!mjJetonAPoser) return;

    const mini = document.createElement('canvas');
    mini.width = mini.height = 50;
    zone.appendChild(mini);

    const img2 = new Image();
    img2.onload = () => {
        const c2  = mini.getContext('2d');
        const def = mjJetonAPoser;
        c2.save();
        c2.beginPath();
        if (def.forme === 'cercle') c2.arc(25, 25, 24, 0, Math.PI * 2);
        else c2.roundRect(1, 1, 48, 48, 6);
        c2.clip();
        const s = 50 / 120;
        c2.drawImage(img2, def.offset_x * s, def.offset_y * s, img2.naturalWidth * def.zoom * s, img2.naturalHeight * def.zoom * s);
        c2.restore();
        c2.strokeStyle = def.bordure;
        c2.lineWidth = 2;
        c2.beginPath();
        if (def.forme === 'cercle') c2.arc(25, 25, 24, 0, Math.PI * 2);
        else c2.roundRect(1, 1, 48, 48, 6);
        c2.stroke();
    };
    img2.src = `/uploads/tokens/${mjJetonAPoser.image}`;
}

// ─────────────────────────────────────────────
//  Placer un jeton sur la map
// ─────────────────────────────────────────────
function placerJetonMj(cx, cy) {
    if (!mjJetonAPoser) return;

    const snap = snapGrilleMj(cx, cy);
    let posX = snap.x, posY = snap.y;
    const { col, ligne } = snap;

    if (mjJetonAPoser.taille === 'S') {
        const c = tailleCaseMjPx();
        const s = tailleJetonMjPx('S');
        posX += (c - s) / 2;
        posY += (c - s) / 2;
    }

    if (caseOccupeeMj(col, ligne, mjJetonAPoser.taille)) return;

    const imgObj = new Image();
    imgObj.src   = `/uploads/tokens/${mjJetonAPoser.image}`;
    imgObj.onload = () => redessinerMj();

    const inst = {
        id:    `mj_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        def:   mjJetonAPoser,
        imgObj,
        x: posX, y: posY,
        col, ligne,
        cache: false
    };

    mjJetons.push(inst);
    redessinerMj();
    diffuserEtatJetons();
}

// ─────────────────────────────────────────────
//  Diffuser l'état des jetons vers Joueur
// ─────────────────────────────────────────────
function diffuserEtatJetons() {
    socket.emit('sync_jetons_mj', {
        jetons: mjJetons.map(inst => ({
            id:    inst.id,
            defId: inst.def.id,
            x:     inst.x,
            y:     inst.y,
            col:   inst.col,
            ligne: inst.ligne,
            cache: inst.cache,
            def:   inst.def
        })),
        formes:    mjFormes,
        grille:    mjGrille,
        map:       mjMapActive,
        fog_actif: mjFogActif
    });
}

// ─────────────────────────────────────────────
//  Interactions Canvas MJ
// ─────────────────────────────────────────────
function posMj(e) {
    const rect = cvMj.getBoundingClientRect();
    return { sx: e.clientX - rect.left, sy: e.clientY - rect.top };
}

// ── MouseDown ──
cvMj.addEventListener('mousedown', e => {
    const { sx, sy } = posMj(e);
    const { x, y }   = screenToCanvas(sx, sy);

    // Clic droit → menu contextuel
    if (e.button === 2) {
        const inst = jetonMjSousPoint(x, y);
        if (inst) {
            mjContextJeton = inst;
            afficherMenuContextuel(sx, sy);
        }
        return;
    }

    // Mode déplacement canvas
    if (mjModeDeplace) {
        mjDragCanvas = { actif: true, startX: sx, startY: sy, startOX: mjOffsetX, startOY: mjOffsetY };
        cvMj.style.cursor = 'grabbing';
        return;
    }

    // Placement de jeton
    if (mjJetonAPoser) {
        placerJetonMj(x, y);
        return;
    }

    // Drag & drop jeton existant
    const inst = jetonMjSousPoint(x, y);
    if (inst) {
        mjDragJeton = { actif: true, inst, offsetX: x - inst.x, offsetY: y - inst.y };
        cvMj.style.cursor = 'grabbing';
    }
});

// ── MouseMove ──
cvMj.addEventListener('mousemove', e => {
    const { sx, sy } = posMj(e);
    const { x, y }   = screenToCanvas(sx, sy);

    // Déplacer le canvas
    if (mjDragCanvas.actif) {
        mjOffsetX = mjDragCanvas.startOX + (sx - mjDragCanvas.startX);
        mjOffsetY = mjDragCanvas.startOY + (sy - mjDragCanvas.startY);
        redessinerMj();
        return;
    }

    // Déplacer un jeton
    if (mjDragJeton.actif) {
        const inst = mjDragJeton.inst;
        const newX = x - mjDragJeton.offsetX;
        const newY = y - mjDragJeton.offsetY;
        const snap = snapGrilleMj(newX, newY);

        if (!caseOccupeeMj(snap.col, snap.ligne, inst.def.taille, inst.id)) {
            let px = snap.x, py = snap.y;
            if (inst.def.taille === 'S') {
                const c = tailleCaseMjPx();
                const s = tailleJetonMjPx('S');
                px += (c - s) / 2;
                py += (c - s) / 2;
            }
            inst.x    = px;
            inst.y    = py;
            inst.col  = snap.col;
            inst.ligne= snap.ligne;
        }
        redessinerMj();
        return;
    }

    // Tooltip au survol
    const inst = jetonMjSousPoint(x, y);
    const tooltip = document.getElementById('tooltip-token');
    if (inst) {
        tooltip.style.display = 'block';
        tooltip.style.left    = (sx + 12) + 'px';
        tooltip.style.top     = (sy - 4)  + 'px';
        tooltip.textContent   = inst.def.nom + (inst.cache ? ' (caché)' : '');
    } else {
        tooltip.style.display = 'none';
    }
});

// ── MouseUp ──
cvMj.addEventListener('mouseup', () => {
    if (mjDragCanvas.actif) {
        mjDragCanvas.actif = false;
        cvMj.style.cursor  = mjModeDeplace ? 'grab' : 'default';
        socket.emit('mj_view_updated', { zoom: mjZoom, offsetX: mjOffsetX, offsetY: mjOffsetY });
    }
    if (mjDragJeton.actif) {
        mjDragJeton.actif = false;
        cvMj.style.cursor = 'default';
        diffuserEtatJetons();
    }
});

// Empêcher menu contextuel navigateur
cvMj.addEventListener('contextmenu', e => e.preventDefault());

// ─────────────────────────────────────────────
//  Menu contextuel
// ─────────────────────────────────────────────
function afficherMenuContextuel(sx, sy) {
    const menu = document.getElementById('menu-contextuel');
    menu.classList.remove('hidden');
    menu.style.left = sx + 'px';
    menu.style.top  = sy + 'px';
}

function cacherMenuContextuel() {
    document.getElementById('menu-contextuel').classList.add('hidden');
    mjContextJeton = null;
}

document.getElementById('ctx-visibilite').addEventListener('click', () => {
    if (!mjContextJeton) return;
    mjContextJeton.cache = !mjContextJeton.cache;
    cacherMenuContextuel();
    redessinerMj();
    diffuserEtatJetons();
});

document.getElementById('ctx-supprimer').addEventListener('click', () => {
    if (!mjContextJeton) return;
    mjJetons = mjJetons.filter(i => i.id !== mjContextJeton.id);
    cacherMenuContextuel();
    redessinerMj();
    diffuserEtatJetons();
});

document.addEventListener('click', e => {
    const menu = document.getElementById('menu-contextuel');
    if (!menu.classList.contains('hidden') && !menu.contains(e.target)) {
        cacherMenuContextuel();
    }
});

// ─────────────────────────────────────────────
//  Sauvegarde / Chargement session
// ─────────────────────────────────────────────
document.getElementById('btn-sauver').addEventListener('click', async () => {
    const nom = document.getElementById('input-nom-save').value.trim();
    if (!nom) return alert('Donne un nom à la sauvegarde.');

    const res  = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nom })
    });
    const data = await res.json();
    if (data.success) alert(`✅ Session "${nom}" sauvegardée !`);
});

document.getElementById('input-charger-save').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    await fetch('/api/load', { method: 'POST', body: formData });
});

// ─────────────────────────────────────────────
//  WebSocket — écoute serveur
// ─────────────────────────────────────────────
socket.on('state_reloaded', data => {
    mjTokenDefs  = data.token_defs   || [];
    mjPresets    = data.presets      || [];
    mjMaps       = data.maps         || [];
    mjMapConfigs = data.map_configs  || {};
    mjFogActif   = data.fog_of_war !== undefined ? data.fog_of_war : true;

    document.getElementById('toggle-fog').checked = mjFogActif;

    if (data.grille) mjGrille = { ...mjGrille, ...data.grille };
    if (data.map_active && data.map_active !== mjMapActive) {
        chargerMapMj(data.map_active);
    }

    afficherListePresets();
    afficherListeJetons();
});

socket.on('maps_updated', data => {
    mjMaps       = data.maps        || [];
    mjMapConfigs = data.map_configs || {};
    afficherListePresets();
});

socket.on('map_configs_updated', data => {
    mjMapConfigs = data.map_configs || {};
    afficherListePresets();
});

socket.on('token_defs_updated', data => {
    mjTokenDefs = data.token_defs || [];
    afficherListeJetons();
});

socket.on('presets_updated', data => {
    mjPresets = data.presets || [];
    afficherListePresets();
});

socket.on('grille_updated', data => {
    mjGrille = data;
    redessinerMj();
});

socket.on('map_changed', data => {
    if (data.map && data.map !== mjMapActive) {
        chargerMapMj(data.map);
    }
});

socket.on('fog_updated', data => {
    mjFogActif = data.fog_of_war;
    document.getElementById('toggle-fog').checked = mjFogActif;
});

console.log('[MJ] Page MJ chargée ✅');