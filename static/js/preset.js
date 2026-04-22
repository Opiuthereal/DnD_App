// ═══════════════════════════════════════════════
//  preset.js — Logique onglet Présets
// ═══════════════════════════════════════════════

// ─────────────────────────────────────────────
//  État local Présets
// ─────────────────────────────────────────────
let presetMapActive    = null;    // map chargée sur canvas-preset
let presetMapImage     = null;    // Image JS
let presetGrille       = { visible: true, nb_cases: 20, offset_x: 0, offset_y: 0, couleur: '#ffffff', opacite: 25 };
let presetJetons       = [];      // jetons placés sur le canvas  [{ def, instanceId, col, ligne }]
let presetFormes       = [];      // formes dessinées             [{ type, params, id }]
let presetMontrerMurs  = true;    // visibilité des formes

// Outil actif : null | 'carre' | 'cercle' | 'porte' | 'deplacer' | 'suppr-forme' | 'vider-1-jeton'
let presetOutil        = null;

// Pour dessin de forme en cours (drag)
let presetDraw = { actif: false, startX: 0, startY: 0, currentX: 0, currentY: 0 };

// Pour porte : attente du 2e clic
let presetPorteStep  = 0;
let presetPorteStart = null;

// Pour déplacement
let presetDrag = { actif: false, forme: null, jeton: null, offsetX: 0, offsetY: 0 };

// Données globales reçues du serveur (partagées avec edition.js via socket)
let presetMapsDispos  = [];
let presetMapConfigs  = {};
let presetTokenDefs   = [];
let presetsSauvegardes = [];  // présets enregistrés

// ─────────────────────────────────────────────
//  Canvas Présets
// ─────────────────────────────────────────────
const cvPreset  = document.getElementById('canvas-preset');
const ctxP      = cvPreset.getContext('2d');

function redimCanvasPreset() {
    const parent     = cvPreset.parentElement;
    cvPreset.width   = parent.clientWidth;
    cvPreset.height  = parent.clientHeight;
    redessinerPreset();
}

function redessinerPreset() {
    ctxP.clearRect(0, 0, cvPreset.width, cvPreset.height);

    // Fond
    ctxP.fillStyle = '#0a0a1a';
    ctxP.fillRect(0, 0, cvPreset.width, cvPreset.height);

    // Map
    if (presetMapImage) {
        const ratio = Math.min(cvPreset.width / presetMapImage.width, cvPreset.height / presetMapImage.height);
        const dW    = presetMapImage.width  * ratio;
        const dH    = presetMapImage.height * ratio;
        const dX    = (cvPreset.width  - dW) / 2;
        const dY    = (cvPreset.height - dH) / 2;
        ctxP.drawImage(presetMapImage, dX, dY, dW, dH);
    }

    // Grille
    dessinerGrillePreset();

    // Formes (murs)
    if (presetMontrerMurs) dessinerFormesPreset();

    // Jetons
    dessinerJetonsPreset();
}

function dessinerGrillePreset() {
    const { nb_cases, offset_x, offset_y, couleur, opacite, visible } = presetGrille;
    if (!visible) return;
    const taille = cvPreset.width / nb_cases;
    if (taille < 2) return;

    const r = parseInt(couleur.slice(1,3), 16);
    const g = parseInt(couleur.slice(3,5), 16);
    const b = parseInt(couleur.slice(5,7), 16);
    ctxP.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacite / 100})`;
    ctxP.lineWidth   = 1;

    for (let x = offset_x % taille; x < cvPreset.width; x += taille) {
        ctxP.beginPath(); ctxP.moveTo(x, 0); ctxP.lineTo(x, cvPreset.height); ctxP.stroke();
    }
    for (let y = offset_y % taille; y < cvPreset.height; y += taille) {
        ctxP.beginPath(); ctxP.moveTo(0, y); ctxP.lineTo(cvPreset.width, y); ctxP.stroke();
    }
}

function dessinerFormesPreset(formeEnCours = null) {
    // Formes enregistrées
    presetFormes.forEach(f => dessinerForme(ctxP, f));
    // Forme en cours de dessin (aperçu)
    if (formeEnCours) dessinerForme(ctxP, formeEnCours, true);
}

function dessinerForme(ctx2, f, apercu = false) {
    ctx2.save();
    ctx2.globalAlpha = apercu ? 0.5 : 1;

    if (f.type === 'carre') {
        ctx2.strokeStyle = '#00bfff';
        ctx2.lineWidth   = 2;
        ctx2.fillStyle   = 'rgba(0, 191, 255, 0.08)';
        ctx2.beginPath();
        ctx2.rect(f.x, f.y, f.w, f.h);
        ctx2.fill();
        ctx2.stroke();

    } else if (f.type === 'cercle') {
        ctx2.strokeStyle = '#00bfff';
        ctx2.lineWidth   = 2;
        ctx2.fillStyle   = 'rgba(0, 191, 255, 0.08)';
        ctx2.beginPath();
        ctx2.ellipse(f.cx, f.cy, f.rx, f.ry, 0, 0, Math.PI * 2);
        ctx2.fill();
        ctx2.stroke();

    } else if (f.type === 'porte') {
        const couleurPorte = '#f0a500';
        ctx2.fillStyle   = couleurPorte;
        ctx2.strokeStyle = couleurPorte;
        ctx2.lineWidth   = 4;

        // Point départ
        ctx2.beginPath();
        ctx2.arc(f.x1, f.y1, 5, 0, Math.PI * 2);
        ctx2.fill();

        // Point fin
        ctx2.beginPath();
        ctx2.arc(f.x2, f.y2, 5, 0, Math.PI * 2);
        ctx2.fill();

        // Trait si fermée
        if (!f.ouverte) {
            ctx2.beginPath();
            ctx2.moveTo(f.x1, f.y1);
            ctx2.lineTo(f.x2, f.y2);
            ctx2.stroke();
        }
    }
    ctx2.restore();
}

function dessinerJetonsPreset() {
    presetJetons.forEach(inst => {
        const def  = inst.def;
        const img  = inst.imgObj;
        const size = tailleJetonPx(def.taille);

        if (!img || !img.complete) return;

        ctxP.save();
        ctxP.globalAlpha = inst.cache ? 0.5 : 1.0;

        // Masque
        ctxP.beginPath();
        if (def.forme === 'cercle') {
            ctxP.arc(inst.x + size / 2, inst.y + size / 2, size / 2, 0, Math.PI * 2);
        } else {
            ctxP.roundRect(inst.x, inst.y, size, size, 6);
        }
        ctxP.clip();

        // Image avec offset/zoom
        const scale = size / 120;
        const dW    = img.naturalWidth  * def.zoom * scale;
        const dH    = img.naturalHeight * def.zoom * scale;
        const dX    = inst.x + def.offset_x * scale;
        const dY    = inst.y + def.offset_y * scale;
        ctxP.drawImage(img, dX, dY, dW, dH);
        ctxP.restore();

        // Bordure
        ctxP.strokeStyle = def.bordure;
        ctxP.lineWidth   = 2;
        ctxP.beginPath();
        if (def.forme === 'cercle') {
            ctxP.arc(inst.x + size / 2, inst.y + size / 2, size / 2, 0, Math.PI * 2);
        } else {
            ctxP.roundRect(inst.x, inst.y, size, size, 6);
        }
        ctxP.stroke();
    });
}

// ─────────────────────────────────────────────
//  Utilitaires grille
// ─────────────────────────────────────────────
function tailleCasePx() {
    return cvPreset.width / presetGrille.nb_cases;
}

function tailleJetonPx(taille) {
    const c = tailleCasePx();
    if (taille === 'S') return Math.max(c * 0.8, 20);
    if (taille === 'L') return c * 2;
    return c;  // M
}

function snapGrille(x, y, taille) {
    // Snapping à la case la plus proche
    const c    = tailleCasePx();
    const offX = presetGrille.offset_x % c;
    const offY = presetGrille.offset_y % c;
    const col  = Math.round((x - offX) / c);
    const ligne= Math.round((y - offY) / c);
    return {
        x:   col   * c + offX,
        y:   ligne * c + offY,
        col, ligne
    };
}

function caseOccupee(col, ligne, taille, excluId = null) {
    // Vérifie si une case est occupée par un jeton existant
    const cases = casesOccupeesParJeton(col, ligne, taille);
    return presetJetons.some(inst => {
        if (inst.id === excluId) return false;
        const instCases = casesOccupeesParJeton(inst.col, inst.ligne, inst.def.taille);
        return cases.some(c => instCases.some(ic => ic.col === c.col && ic.ligne === c.ligne));
    });
}

function casesOccupeesParJeton(col, ligne, taille) {
    if (taille === 'L') {
        return [
            { col, ligne }, { col: col+1, ligne },
            { col, ligne: ligne+1 }, { col: col+1, ligne: ligne+1 }
        ];
    }
    return [{ col, ligne }];
}

// ─────────────────────────────────────────────
//  Gestion onglet Présets (activation)
// ─────────────────────────────────────────────
document.querySelectorAll('.onglet').forEach(btn => {
    btn.addEventListener('click', () => {
        if (btn.dataset.onglet === 'presets') {
            setTimeout(redimCanvasPreset, 50);
        }
    });
});

window.addEventListener('resize', () => {
    const panneauPreset = document.getElementById('panneau-presets');
    if (panneauPreset.classList.contains('actif')) redimCanvasPreset();
});

// ─────────────────────────────────────────────
//  Liste Maps (Présets)
// ─────────────────────────────────────────────
function afficherPresetListeMaps() {
    const liste = document.getElementById('preset-liste-maps');
    liste.innerHTML = '';

    if (!presetMapsDispos.length) {
        liste.innerHTML = '<span style="font-size:11px;color:var(--texte-faible)">Aucune map enregistrée</span>';
        return;
    }

    presetMapsDispos.forEach(filename => {
        // N'afficher que les maps qui ont une config enregistrée
        if (!presetMapConfigs[filename]) return;

        const item = document.createElement('div');
        item.className = 'map-item' + (filename === presetMapActive ? ' active' : '');
        item.innerHTML = `<span class="map-item-nom" title="${filename}">${filename}</span>`;
        item.addEventListener('click', () => chargerPresetMap(filename));
        liste.appendChild(item);
    });
}

function chargerPresetMap(filename) {
    presetMapActive = filename;
    presetMapImage  = new Image();
    presetMapImage.onload = () => {
        // Appliquer la config grille enregistrée
        if (presetMapConfigs[filename]) {
            presetGrille = { ...presetGrille, ...presetMapConfigs[filename] };
        }
        redessinerPreset();
    };
    presetMapImage.src = `/uploads/maps/${filename}`;
    afficherPresetListeMaps();
}

// Vider map
document.getElementById('preset-btn-vider-map').addEventListener('click', () => {
    presetMapActive = null;
    presetMapImage  = null;
    presetGrille    = { visible: true, nb_cases: 20, offset_x: 0, offset_y: 0, couleur: '#ffffff', opacite: 25 };
    redessinerPreset();
    afficherPresetListeMaps();
});

// ─────────────────────────────────────────────
//  Liste Jetons (Présets)
// ─────────────────────────────────────────────
function afficherPresetListeJetons() {
    const liste = document.getElementById('preset-liste-jetons');
    liste.innerHTML = '';

    if (!presetTokenDefs.length) {
        liste.innerHTML = '<span style="font-size:11px;color:var(--texte-faible)">Aucun jeton créé</span>';
        return;
    }

    presetTokenDefs.forEach(def => {
        const item = document.createElement('div');
        item.className = 'preset-jeton-item';

        const miniCanvas = document.createElement('canvas');
        miniCanvas.width  = 30;
        miniCanvas.height = 30;
        item.appendChild(miniCanvas);

        const nomSpan = document.createElement('span');
        nomSpan.textContent = def.nom;
        nomSpan.style.fontSize = '12px';
        item.appendChild(nomSpan);

        const typeSpan = document.createElement('span');
        typeSpan.textContent = def.taille;
        typeSpan.style.cssText = 'font-size:10px;color:#888;margin-left:auto';
        item.appendChild(typeSpan);

        // Dessin miniature
        const img2 = new Image();
        img2.onload = () => {
            const c2 = miniCanvas.getContext('2d');
            c2.save();
            c2.beginPath();
            if (def.forme === 'cercle') {
                c2.arc(15, 15, 13, 0, Math.PI * 2);
            } else {
                c2.roundRect(1, 1, 28, 28, 4);
            }
            c2.clip();
            const scale = 30 / 120;
            c2.drawImage(img2, def.offset_x * scale, def.offset_y * scale,
                img2.naturalWidth * def.zoom * scale, img2.naturalHeight * def.zoom * scale);
            c2.restore();
            c2.strokeStyle = def.bordure;
            c2.lineWidth   = 2;
            c2.beginPath();
            if (def.forme === 'cercle') {
                c2.arc(15, 15, 13, 0, Math.PI * 2);
            } else {
                c2.roundRect(1, 1, 28, 28, 4);
            }
            c2.stroke();
        };
        img2.src = `/uploads/tokens/${def.image}`;

        // Clic = placer le jeton sur le canvas (mode placement)
        item.addEventListener('click', () => activerPlacementJeton(def));

        liste.appendChild(item);
    });
}

// ─────────────────────────────────────────────
//  Placement de Jeton sur canvas
// ─────────────────────────────────────────────
let jetonAPoser = null;  // def du jeton en cours de placement

function activerPlacementJeton(def) {
    // Désactive tout autre outil
    desactiverOutils();
    jetonAPoser = def;
    cvPreset.style.cursor = 'crosshair';
}

function placerJeton(x, y) {
    if (!jetonAPoser) return;

    let posX = x, posY = y;
    let col = 0, ligne = 0;

    // Snap à la grille toujours
    const snap = snapGrille(x, y, jetonAPoser.taille);
    posX  = snap.x;
    posY  = snap.y;
    col   = snap.col;
    ligne = snap.ligne;

    // Centrer les jetons S dans leur case
    if (jetonAPoser.taille === 'S') {
        const casePx  = tailleCasePx();
        const jetonPx = tailleJetonPx('S');
        posX += (casePx - jetonPx) / 2;
        posY += (casePx - jetonPx) / 2;
    }

    // Vérifier occupation
    if (caseOccupee(col, ligne, jetonAPoser.taille)) {
        return; // case déjà prise
    }

    // Charger l'image du jeton
    const imgObj = new Image();
    imgObj.src = `/uploads/tokens/${jetonAPoser.image}`;

    const instance = {
        id:    `inst_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        def:   jetonAPoser,
        imgObj,
        x: posX, y: posY,
        col, ligne,
        cache: false
    };

    imgObj.onload = () => redessinerPreset();
    presetJetons.push(instance);
    redessinerPreset();

    // On reste en mode placement pour poser plusieurs fois le même jeton
}

// Vider tous les jetons
document.getElementById('preset-btn-vider-jetons').addEventListener('click', () => {
    presetJetons = [];
    redessinerPreset();
});

// Vider 1 jeton (mode toggle)
document.getElementById('preset-btn-vider-1-jeton').addEventListener('click', () => {
    toggleOutil('vider-1-jeton', document.getElementById('preset-btn-vider-1-jeton'));
});

// Cacher/montrer 1 jeton (mode toggle)
document.getElementById('preset-btn-cacher-jeton').addEventListener('click', () => {
    toggleOutil('cacher-jeton', document.getElementById('preset-btn-cacher-jeton'));
});

// ─────────────────────────────────────────────
//  Outils Formes
// ─────────────────────────────────────────────
function toggleOutil(nom, btn) {
    if (presetOutil === nom) {
        // Désactiver
        presetOutil = null;
        jetonAPoser = null;
        cvPreset.style.cursor = 'default';
        document.querySelectorAll('.preset-btn-forme, #preset-btn-deplacer, #preset-btn-suppr-forme, #preset-btn-vider-1-jeton, #preset-btn-cacher-jeton')
            .forEach(b => b.classList.remove('actif'));
    } else {
        desactiverOutils();
        presetOutil = nom;
        if (btn) btn.classList.add('actif');
        cvPreset.style.cursor = nom === 'deplacer' ? 'grab' : 'crosshair';
    }
}

function desactiverOutils() {
    presetOutil   = null;
    jetonAPoser   = null;
    presetPorteStep = 0;
    presetPorteStart = null;
    cvPreset.style.cursor = 'default';
    document.querySelectorAll('.preset-btn-forme, #preset-btn-deplacer, #preset-btn-suppr-forme, #preset-btn-vider-1-jeton, #preset-btn-cacher-jeton')
        .forEach(b => b.classList.remove('actif'));
}

document.getElementById('preset-outil-carre').addEventListener('click', () => {
    if (!presetMapActive) return alert('Charge une map d\'abord.');
    toggleOutil('carre', document.getElementById('preset-outil-carre'));
});

document.getElementById('preset-outil-cercle').addEventListener('click', () => {
    if (!presetMapActive) return alert('Charge une map d\'abord.');
    toggleOutil('cercle', document.getElementById('preset-outil-cercle'));
});

document.getElementById('preset-outil-porte').addEventListener('click', () => {
    if (!presetMapActive) return alert('Charge une map d\'abord.');
    toggleOutil('porte', document.getElementById('preset-outil-porte'));
    presetPorteStep  = 0;
    presetPorteStart = null;
});

document.getElementById('preset-btn-deplacer').addEventListener('click', () => {
    toggleOutil('deplacer', document.getElementById('preset-btn-deplacer'));
});

document.getElementById('preset-btn-suppr-forme').addEventListener('click', () => {
    toggleOutil('suppr-forme', document.getElementById('preset-btn-suppr-forme'));
});

// Montrer/cacher murs
document.getElementById('preset-montrer-murs').addEventListener('change', e => {
    presetMontrerMurs = e.target.checked;
    redessinerPreset();
});

// ─────────────────────────────────────────────
//  Interactions Canvas Présets
// ─────────────────────────────────────────────
function posCanvas(e) {
    const rect = cvPreset.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

// ── MouseDown ──
cvPreset.addEventListener('mousedown', e => {
    const { x, y } = posCanvas(e);

    // Placement jeton
    if (jetonAPoser) {
        placerJeton(x, y);
        return;
    }

    // Vider 1 jeton
    if (presetOutil === 'vider-1-jeton') {
        const idx = presetJetons.findIndex(inst => jetonSousPoint(inst, x, y));
        if (idx !== -1) {
            presetJetons.splice(idx, 1);
            redessinerPreset();
        }
        desactiverOutils();
        return;
    }

    // Cacher/montrer 1 jeton
    if (presetOutil === 'cacher-jeton') {
        const inst = presetJetons.find(inst => jetonSousPoint(inst, x, y));
        if (inst) {
            inst.cache = !inst.cache;
            redessinerPreset();
        }
        desactiverOutils();
        return;
    }

    // Supprimer forme(s)
    if (presetOutil === 'suppr-forme') {
        presetFormes = presetFormes.filter(f => !formeSousPoint(f, x, y));
        redessinerPreset();
        desactiverOutils();
        return;
    }

    // Porte — 2 clics
    if (presetOutil === 'porte') {
        if (presetPorteStep === 0) {
            // Vérifier pas de superposition avec autre porte ou mur
            const conflit = presetFormes.some(f =>
                (f.type === 'porte' && distPoint(f.x1, f.y1, x, y) < 10) ||
                (f.type === 'carre' && x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) ||
                (f.type === 'cercle' && ((x - f.cx) / Math.max(f.rx,1)) ** 2 + ((y - f.cy) / Math.max(f.ry,1)) ** 2 <= 1)
            );
            if (!conflit) {
                presetPorteStart = { x, y };
                presetPorteStep  = 1;
            }
        } else {
            // 2e clic — créer la porte
            const conflit = presetFormes.some(f =>
                (f.type === 'porte' && distPoint(f.x2, f.y2, x, y) < 10) ||
                (f.type === 'carre' && x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) ||
                (f.type === 'cercle' && ((x - f.cx) / Math.max(f.rx,1)) ** 2 + ((y - f.cy) / Math.max(f.ry,1)) ** 2 <= 1)
            );
            if (!conflit) {
                presetFormes.push({
                    id:     `forme_${Date.now()}`,
                    type:   'porte',
                    x1:     presetPorteStart.x,
                    y1:     presetPorteStart.y,
                    x2:     x,
                    y2:     y,
                    ouverte: false
                });
                redessinerPreset();
            }
            presetPorteStep  = 0;
            presetPorteStart = null;
            desactiverOutils();
        }
        return;
    }

    // Clic sur porte existante — toggle ouvert/fermé
    if (!presetOutil && !jetonAPoser) {
        const porte = presetFormes.find(f => f.type === 'porte' && porteSousPoint(f, x, y));
        if (porte) {
            porte.ouverte = !porte.ouverte;
            redessinerPreset();
            return;
        }
    }

    // Début dessin carré/cercle
    if (presetOutil === 'carre' || presetOutil === 'cercle') {
        presetDraw = { actif: true, startX: x, startY: y, currentX: x, currentY: y };
        return;
    }

    // Début déplacement
    if (presetOutil === 'deplacer') {
        // Chercher jeton sous le clic
        const jeton = presetJetons.find(inst => jetonSousPoint(inst, x, y));
        if (jeton) {
            presetDrag = { actif: true, jeton, forme: null, offsetX: x - jeton.x, offsetY: y - jeton.y };
            cvPreset.style.cursor = 'grabbing';
            return;
        }
        // Chercher forme sous le clic
        const forme = presetFormes.find(f => formeSousPoint(f, x, y));
        if (forme) {
            presetDrag = { actif: true, forme, jeton: null, offsetX: x, offsetY: y };
            cvPreset.style.cursor = 'grabbing';
        }
    }
});

// ── MouseMove ──
cvPreset.addEventListener('mousemove', e => {
    const { x, y } = posCanvas(e);

    // Aperçu dessin
    if (presetDraw.actif) {
        presetDraw.currentX = x;
        presetDraw.currentY = y;
        redessinerPreset();
        // Dessiner aperçu
        const formeApercu = construireForme(presetOutil, presetDraw);
        if (formeApercu && presetMontrerMurs) dessinerForme(ctxP, formeApercu, true);
        return;
    }

    // Déplacement
    if (presetDrag.actif) {
        if (presetDrag.jeton) {
            const inst = presetDrag.jeton;
            let newX = x - presetDrag.offsetX;
            let newY = y - presetDrag.offsetY;

            if (presetMapActive) {
                const snap = snapGrille(newX, newY, inst.def.taille);
                if (!caseOccupee(snap.col, snap.ligne, inst.def.taille, inst.id)) {
                    inst.x    = snap.x;
                    inst.y    = snap.y;
                    inst.col  = snap.col;
                    inst.ligne= snap.ligne;
                }
            } else {
                inst.x = newX;
                inst.y = newY;
            }
        } else if (presetDrag.forme) {
            const dx = x - presetDrag.offsetX;
            const dy = y - presetDrag.offsetY;
            const f  = presetDrag.forme;
            if (f.type === 'carre') { f.x += dx; f.y += dy; }
            else if (f.type === 'cercle') { f.cx += dx; f.cy += dy; }
            else if (f.type === 'porte') {
                f.x1 += dx; f.y1 += dy;
                f.x2 += dx; f.y2 += dy;
            }
            presetDrag.offsetX = x;
            presetDrag.offsetY = y;
        }
        redessinerPreset();
    }
});

// ── MouseUp ──
cvPreset.addEventListener('mouseup', e => {
    const { x, y } = posCanvas(e);

    if (presetDraw.actif) {
        presetDraw.currentX = x;
        presetDraw.currentY = y;
        const f = construireForme(presetOutil, presetDraw);
        if (f && (Math.abs(f.w || f.rx * 2 || 1) > 5)) {
            presetFormes.push(f);
        }
        presetDraw.actif = false;
        redessinerPreset();
    }

    if (presetDrag.actif) {
        presetDrag = { actif: false, forme: null, jeton: null, offsetX: 0, offsetY: 0 };
        cvPreset.style.cursor = presetOutil === 'deplacer' ? 'grab' : 'default';
    }
});

// ─────────────────────────────────────────────
//  Utilitaires formes
// ─────────────────────────────────────────────
function construireForme(type, draw) {
    const x = Math.min(draw.startX, draw.currentX);
    const y = Math.min(draw.startY, draw.currentY);
    const w = Math.abs(draw.currentX - draw.startX);
    const h = Math.abs(draw.currentY - draw.startY);
    if (type === 'carre') {
        return { id: `forme_${Date.now()}`, type: 'carre', x, y, w, h };
    } else if (type === 'cercle') {
        return { id: `forme_${Date.now()}`, type: 'cercle', cx: x + w/2, cy: y + h/2, rx: w/2, ry: h/2 };
    }
    return null;
}

function jetonSousPoint(inst, x, y) {
    const size = tailleJetonPx(inst.def.taille);
    return x >= inst.x && x <= inst.x + size && y >= inst.y && y <= inst.y + size;
}

function formeSousPoint(f, x, y) {
    if (f.type === 'carre') {
        return x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h;
    } else if (f.type === 'cercle') {
        return ((x - f.cx) / f.rx) ** 2 + ((y - f.cy) / f.ry) ** 2 <= 1;
    } else if (f.type === 'porte') {
        return porteSousPoint(f, x, y);
    }
    return false;
}

function porteSousPoint(f, x, y) {
    // Proche d'un des deux points
    return distPoint(f.x1, f.y1, x, y) < 12 || distPoint(f.x2, f.y2, x, y) < 12;
}

function distPoint(x1, y1, x2, y2) {
    return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// ─────────────────────────────────────────────
//  Enregistrer / Charger Présets
// ─────────────────────────────────────────────
document.getElementById('preset-btn-enregistrer').addEventListener('click', async () => {
    const nom = document.getElementById('preset-nom').value.trim();
    if (!nom) return alert('Donne un nom au préset.');

    const preset = {
        id:      `preset_${Date.now()}`,
        nom,
        map:     presetMapActive,
        grille:  { ...presetGrille },
        jetons:  presetJetons.map(inst => ({
            defId:  inst.def.id,
            x:      inst.x,
            y:      inst.y,
            col:    inst.col,
            ligne:  inst.ligne,
            cache:  inst.cache || false
        })),
        formes:  presetFormes.map(f => ({ ...f }))
    };

    const res  = await fetch('/api/preset', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(preset)
    });
    const data = await res.json();
    if (data.success) {
        presetsSauvegardes = data.presets;
        afficherPresetsSauvegardes();
        document.getElementById('preset-nom').value = '';
        alert(`✅ Préset "${nom}" enregistré !`);
    }
});

function afficherPresetsSauvegardes() {
    const liste = document.getElementById('preset-liste-presets');
    liste.innerHTML = '';

    if (!presetsSauvegardes.length) {
        liste.innerHTML = '<span style="font-size:11px;color:var(--texte-faible)">Aucun préset</span>';
        return;
    }

    presetsSauvegardes.forEach(p => {
        const item = document.createElement('div');
        item.className = 'preset-item';
        item.innerHTML = `
            <span class="preset-item-nom" title="${p.nom}">${p.nom}</span>
            <button class="preset-item-suppr" onclick="supprimerPreset('${p.id}', event)">🗑️</button>
        `;
        item.addEventListener('click', () => chargerPreset(p));
        liste.appendChild(item);
    });
}

function chargerPreset(p) {
    // Vider le canvas
    presetJetons = [];
    presetFormes = p.formes.map(f => ({ ...f }));

    // Charger la map
    if (p.map) {
        chargerPresetMap(p.map);
    } else {
        presetMapActive = null;
        presetMapImage  = null;
        presetGrille    = { ...p.grille };
        redessinerPreset();
    }

    // Replacer les jetons
    p.jetons.forEach(inst => {
        const def = presetTokenDefs.find(d => d.id === inst.defId);
        if (!def) return;
        const imgObj = new Image();
        imgObj.src   = `/uploads/tokens/${def.image}`;
        imgObj.onload = () => redessinerPreset();
        presetJetons.push({ id: `inst_${Date.now()}_${Math.random().toString(36).slice(2)}`, def, imgObj, x: inst.x, y: inst.y, col: inst.col, ligne: inst.ligne, cache: inst.cache || false });
    });
}

async function supprimerPreset(id, e) {
    e.stopPropagation();
    if (!confirm('Supprimer ce préset ?')) return;
    const res  = await fetch(`/api/preset/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
        presetsSauvegardes = data.presets;
        afficherPresetsSauvegardes();
    }
}

// ─────────────────────────────────────────────
//  WebSocket — sync données globales
// ─────────────────────────────────────────────
socket.on('state_reloaded', data => {
    presetMapsDispos       = data.maps         || [];
    presetMapConfigs       = data.map_configs  || {};
    presetTokenDefs        = data.token_defs   || [];
    presetsSauvegardes     = data.presets      || [];
    afficherPresetListeMaps();
    afficherPresetListeJetons();
    afficherPresetsSauvegardes();
});

socket.on('maps_updated', data => {
    presetMapsDispos = data.maps        || [];
    presetMapConfigs = data.map_configs || {};
    afficherPresetListeMaps();
});

socket.on('map_configs_updated', data => {
    presetMapConfigs = data.map_configs || {};
    afficherPresetListeMaps();
});

socket.on('token_defs_updated', data => {
    presetTokenDefs = data.token_defs || [];
    afficherPresetListeJetons();
});

socket.on('presets_updated', data => {
    presetsSauvegardes = data.presets || [];
    afficherPresetsSauvegardes();
});

console.log('[Présets] Module chargé ✅');