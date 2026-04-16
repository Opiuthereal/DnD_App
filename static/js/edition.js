// ═══════════════════════════════════════════════
//  edition.js - Logique onglet Édition
// ═══════════════════════════════════════════════

// -- État local --
let mapActive     = null;   // nom du fichier map affiché sur le canvas
let tokenDefs     = [];     // jetons créés
let grilleConfig  = { visible: true, nb_cases: 20, offset_x: 0, offset_y: 0, couleur: '#ffffff', opacite: 25 };

// -- Recadrage token --
let imgOffsetX = 0, imgOffsetY = 0;  // position image dans le masque
let imgZoom    = 1;                  // zoom image
let isDragging = false;
let dragStartX = 0, dragStartY = 0;

// --------------------------------------------
//  Canvas Édition
// ---------------------------------------------
const canvas  = document.getElementById('canvas-edition');
const ctx     = canvas.getContext('2d');
let mapImage  = null;  // Image JS chargée

function redimensionnerCanvas() {
    const parent  = canvas.parentElement;
    canvas.width  = parent.clientWidth;
    canvas.height = parent.clientHeight;
    dessinerCanvas();
}

function dessinerCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // -- Fond --
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // -- Map --
    if (mapImage) {
        const ratio    = Math.min(canvas.width / mapImage.width, canvas.height / mapImage.height);
        const drawW    = mapImage.width  * ratio;
        const drawH    = mapImage.height * ratio;
        const drawX    = (canvas.width  - drawW) / 2;
        const drawY    = (canvas.height - drawH) / 2;
        ctx.drawImage(mapImage, drawX, drawY, drawW, drawH);
    }

    // -- Grille --
    if (grilleConfig.visible) {
        dessinerGrille();
    }
}

function dessinerGrille() {
    const { nb_cases, offset_x, offset_y, couleur, opacite } = grilleConfig;
    const taille = canvas.width / nb_cases;

    // Convertir couleur hex en rgb pour appliquer l'opacité
    const r = parseInt(couleur.slice(1,3), 16);
    const g = parseInt(couleur.slice(3,5), 16);
    const b = parseInt(couleur.slice(5,7), 16);
    ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${opacite / 100})`;
    ctx.lineWidth   = 1;

    // Lignes verticales
    for (let x = offset_x % taille; x < canvas.width; x += taille) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    // Lignes horizontales
    for (let y = offset_y % taille; y < canvas.height; y += taille) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}

window.addEventListener('resize', redimensionnerCanvas);
redimensionnerCanvas();

// ---------------------------------------------
//  Onglets (Maps / Tokens)
// ---------------------------------------------
document.querySelectorAll('.onglet').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.onglet').forEach(b => b.classList.remove('actif'));
        document.querySelectorAll('.panneau-edition').forEach(p => p.classList.remove('actif'));
        btn.classList.add('actif');
        document.getElementById('panneau-' + btn.dataset.onglet).classList.add('actif');
        if (btn.dataset.onglet === 'maps') redimensionnerCanvas();
    });
});

// ---------------------------------------------
//  Upload Map
// ---------------------------------------------
document.getElementById('btn-upload-map').addEventListener('click', () => {
    const input = document.getElementById('input-upload-map');
    if (!input.files.length) return alert('Choisis un fichier image.');

    const formData = new FormData();
    formData.append('file', input.files[0]);

    fetch('/api/upload/map', { method: 'POST', body: formData })
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                chargerMapSurCanvas(data.filename);
                alert(`Map "${data.filename}" uploadée !`);
            }
        });
});

function chargerMapSurCanvas(filename) {
    mapActive = filename;
    mapImage  = new Image();
    mapImage.onload = () => dessinerCanvas();
    mapImage.src    = `/uploads/maps/${filename}`;
}

// ---------------------------------------------
//  Sliders Grille
// ---------------------------------------------
document.getElementById('grille-visible').addEventListener('change', e => {
    grilleConfig.visible = e.target.checked;
    dessinerCanvas();
    socket.emit('update_grille', grilleConfig);
});

function majNbCases(val) {
    const v = parseFloat(val);
    if (isNaN(v) || v <= 0) return;
    grilleConfig.nb_cases = v;
    document.getElementById('slider-nb-cases').value  = v;
    document.getElementById('input-nb-cases').value   = v;
    dessinerCanvas();
    socket.emit('update_grille', grilleConfig);
}

document.getElementById('slider-nb-cases').addEventListener('input', e => majNbCases(e.target.value));
document.getElementById('input-nb-cases').addEventListener('input', e => majNbCases(e.target.value));

document.getElementById('slider-offset-x').addEventListener('input', e => {
    grilleConfig.offset_x = parseInt(e.target.value);
    document.getElementById('val-offset-x').textContent = e.target.value;
    dessinerCanvas();
    socket.emit('update_grille', grilleConfig);
});

document.getElementById('slider-offset-y').addEventListener('input', e => {
    grilleConfig.offset_y = parseInt(e.target.value);
    document.getElementById('val-offset-y').textContent = e.target.value;
    dessinerCanvas();
    socket.emit('update_grille', grilleConfig);
});

document.getElementById('grille-couleur').addEventListener('input', e => {
    grilleConfig.couleur = e.target.value;
    dessinerCanvas();
    socket.emit('update_grille', grilleConfig);
});

document.getElementById('slider-opacite').addEventListener('input', e => {
    grilleConfig.opacite = parseInt(e.target.value);
    document.getElementById('val-opacite').textContent = e.target.value;
    dessinerCanvas();
    socket.emit('update_grille', grilleConfig);
});

// ---------------------------------------------
//  Création de Token - Recadrage style Instagram
// ---------------------------------------------
const masque       = document.getElementById('token-masque');
const imgPreview   = document.getElementById('token-image-preview');
const sliderZoom   = document.getElementById('token-zoom');
const selectType   = document.getElementById('token-type');

// -- Changer la forme du masque selon le type --
function mettreAJourMasque() {
    const type    = selectType.value;
    const bordure = document.getElementById('token-bordure');
    if (type === 'joueur') {
        masque.classList.remove('forme-carre');
        masque.style.borderColor = bordure.value;
    } else {
        masque.classList.add('forme-carre');
        masque.style.borderColor = type === 'ennemi' ? '#e94560' : '#f0a500';
    }
}

selectType.addEventListener('change', mettreAJourMasque);

// -- Couleur de bordure en temps réel (joueur uniquement) --
document.getElementById('token-bordure').addEventListener('input', mettreAJourMasque);

// -- Upload image du token --
document.getElementById('token-image-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
        imgPreview.src     = ev.target.result;
        imgPreview.style.display = 'block';
        imgOffsetX = 0;
        imgOffsetY = 0;
        imgZoom    = 1;
        sliderZoom.value = 100;
        appliquerTransform();

        // Attendre que l'image soit chargée pour centrer
        imgPreview.onload = () => centrerImage();
    };
    reader.readAsDataURL(file);
});

function centrerImage() {
    const mW = masque.clientWidth;
    const mH = masque.clientHeight;
    const iW = imgPreview.naturalWidth  * imgZoom;
    const iH = imgPreview.naturalHeight * imgZoom;
    imgOffsetX = (mW - iW) / 2;
    imgOffsetY = (mH - iH) / 2;
    appliquerTransform();
}

function appliquerTransform() {
    imgPreview.style.width     = (imgPreview.naturalWidth  * imgZoom) + 'px';
    imgPreview.style.height    = (imgPreview.naturalHeight * imgZoom) + 'px';
    imgPreview.style.left      = imgOffsetX + 'px';
    imgPreview.style.top       = imgOffsetY  + 'px';
}

// -- Drag de l'image dans le masque --
masque.addEventListener('mousedown', e => {
    if (!imgPreview.src) return;
    isDragging = true;
    dragStartX = e.clientX - imgOffsetX;
    dragStartY = e.clientY - imgOffsetY;
    e.preventDefault();
});

window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    imgOffsetX = e.clientX - dragStartX;
    imgOffsetY = e.clientY - dragStartY;
    appliquerTransform();
});

window.addEventListener('mouseup', () => { isDragging = false; });

// -- Zoom slider --
sliderZoom.addEventListener('input', e => {
    const ancienZoom = imgZoom;
    imgZoom = parseInt(e.target.value) / 100;

    // Calcul offset pour zoomer depuis le centre du masque
    const mW = masque.clientWidth;
    const mH = masque.clientHeight;
    const ratio = imgZoom / ancienZoom;
    imgOffsetX = mW / 2 - (mW / 2 - imgOffsetX) * ratio;
    imgOffsetY = mH / 2 - (mH / 2 - imgOffsetY) * ratio;
    appliquerTransform();
});

// ---------------------------------------------
//  Créer le Token (valider)
// ---------------------------------------------
document.getElementById('btn-creer-token').addEventListener('click', async () => {
    const nom     = document.getElementById('token-nom').value.trim();
    const type    = document.getElementById('token-type').value;
    const bordure = document.getElementById('token-bordure').value;
    const taille  = document.getElementById('token-taille').value;
    const fileInput = document.getElementById('token-image-input');

    if (!nom)              return alert('Donne un nom au jeton.');
    if (!fileInput.files.length) return alert('Choisis une image.');

    // Upload de l'image brute
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    const uploadRes  = await fetch('/api/upload/token', { method: 'POST', body: formData });
    const uploadData = await uploadRes.json();
    if (!uploadData.success) return alert('Erreur upload image.');

    // Créer la définition du token
    const tokenDef = {
        id:       `token_${Date.now()}`,
        nom,
        type,
        forme:    type === 'joueur' ? 'cercle' : 'carre',
        image:    uploadData.filename,
        offset_x: imgOffsetX,
        offset_y: imgOffsetY,
        zoom:     imgZoom,
        bordure:  type === 'joueur' ? bordure : (type === 'ennemi' ? '#e94560' : '#f0a500'),
        taille
    };

    // Envoyer au serveur
    const res  = await fetch('/api/token_def', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(tokenDef)
    });
    const data = await res.json();

    if (data.success) {
        // Reset formulaire uniquement, afficherTokens() sera appelé par token_defs_updated
        document.getElementById('token-nom').value = '';
        fileInput.value = '';
        imgPreview.src  = '';
        imgPreview.style.display = 'none';
        alert(`Jeton "${nom}" créé !`);
    }
});

// ---------------------------------------------
//  Afficher la liste des tokens créés
// ---------------------------------------------
function afficherTokens() {
    const grille = document.getElementById('grille-tokens');
    grille.innerHTML = '';

    tokenDefs.forEach(t => {
        const carte = document.createElement('div');
        carte.className = 'token-carte';
        carte.innerHTML = `
            <canvas width="60" height="60" id="preview-${t.id}"></canvas>
            <span class="token-nom">${t.nom}</span>
            <span style="font-size:10px;color:#888">${t.type} - ${t.taille}</span>
            <div class="token-actions">
                <button class="btn-suppr" onclick="supprimerToken('${t.id}')">🗑️</button>
            </div>
        `;
        grille.appendChild(carte);
        dessinerMiniToken(t);
    });
}

function dessinerMiniToken(t) {
    const c   = document.getElementById(`preview-${t.id}`);
    if (!c) return;
    const ctx2 = c.getContext('2d');
    const img  = new Image();
    img.onload = () => {
        ctx2.clearRect(0, 0, 60, 60);
        ctx2.save();

        // Masque forme
        ctx2.beginPath();
        if (t.forme === 'cercle') {
            ctx2.arc(30, 30, 28, 0, Math.PI * 2);
        } else {
            ctx2.roundRect(2, 2, 56, 56, 8);
        }
        ctx2.clip();
        ctx2.drawImage(img, 0, 0, 60, 60);
        ctx2.restore();

        // Bordure
        ctx2.strokeStyle = t.bordure;
        ctx2.lineWidth   = 3;
        ctx2.beginPath();
        if (t.forme === 'cercle') {
            ctx2.arc(30, 30, 28, 0, Math.PI * 2);
        } else {
            ctx2.roundRect(2, 2, 56, 56, 8);
        }
        ctx2.stroke();
    };
    img.src = `/uploads/tokens/${t.image}`;
}

async function supprimerToken(id) {
    await fetch(`/api/token_def/${id}`, { method: 'DELETE' });
    tokenDefs = tokenDefs.filter(t => t.id !== id);
    afficherTokens();
}

// ---------------------------------------------
//  WebSocket - écoute les mises à jour
// ---------------------------------------------
socket.on('state_reloaded', data => {
    tokenDefs    = data.token_defs || [];
    grilleConfig = data.grille     || grilleConfig;

    // Sync sliders
    document.getElementById('slider-nb-cases').value = grilleConfig.nb_cases;
    document.getElementById('slider-offset-x').value = grilleConfig.offset_x;
    document.getElementById('slider-offset-y').value = grilleConfig.offset_y;
    document.getElementById('input-nb-cases').value   = grilleConfig.nb_cases;
    document.getElementById('val-offset-x').textContent = grilleConfig.offset_x;
    document.getElementById('val-offset-y').textContent = grilleConfig.offset_y;
    document.getElementById('grille-visible').checked   = grilleConfig.visible;
    document.getElementById('grille-couleur').value     = grilleConfig.couleur  || '#ffffff';
    document.getElementById('slider-opacite').value     = grilleConfig.opacite  || 25;
    document.getElementById('val-opacite').textContent  = grilleConfig.opacite  || 25;

    if (data.map_active) chargerMapSurCanvas(data.map_active);
    afficherTokens();
});

socket.on('token_defs_updated', data => {
    tokenDefs = data.token_defs;
    afficherTokens();
});

console.log('[Edition] Page Édition chargée');