import os
import json
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit

# ---------------------------------------------
#  Configuration
# ---------------------------------------------
BASE_DIR        = os.path.dirname(os.path.abspath(__file__))
UPLOAD_MAPS     = os.path.join(BASE_DIR, 'static', 'uploads', 'maps')
UPLOAD_TOKENS   = os.path.join(BASE_DIR, 'static', 'uploads', 'tokens')
DATA_DIR        = os.path.join(BASE_DIR, 'data')
STATE_FILE      = os.path.join(DATA_DIR, 'state.json')
SAVES_DIR       = os.path.join(DATA_DIR, 'saves')
ALLOWED_EXT     = {'png', 'jpg', 'jpeg', 'webp'}

for folder in [UPLOAD_MAPS, UPLOAD_TOKENS, DATA_DIR, SAVES_DIR]:
    os.makedirs(folder, exist_ok=True)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'dnd-secret-00'
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024

socketio = SocketIO(app, cors_allowed_origins="*")

# ---------------------------------------------
#  État global
# ---------------------------------------------
DEFAULT_STATE = {
    "map_active": None,
    "fog_of_war": True,
    "grille": {
        "visible":  True,
        "nb_cases": 20,
        "offset_x": 0,
        "offset_y": 0,
        "couleur":  "#ffffff",
        "opacite":  25
    },
    "tokens": [],
    "groupes": [],
    "maps": [],
    "map_configs": {},           # config grille par map  { "donjon.png": { grille... } }
    "token_defs": [],
    "objets_interactifs": []
}

def load_state():
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE, 'r', encoding='utf-8') as f:
            contenu = f.read().strip()
            if not contenu:
                print("Aucun state enregistré")
                return DEFAULT_STATE.copy()
            s = json.loads(contenu)
            # Migration : ajouter map_configs si absent (ancien state.json)
            if 'map_configs' not in s:
                s['map_configs'] = {}
            return s
    return DEFAULT_STATE.copy()

def save_state(state):
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False, indent=2)

state = load_state()

# ---------------------------------------------
#  Utilitaires
# ---------------------------------------------
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXT

# ---------------------------------------------
#  Routes - Pages principales
# ---------------------------------------------
@app.route('/')
def index():
    return render_template('mj.html')

@app.route('/mj')
def mj():
    return render_template('mj.html')

@app.route('/joueur')
def joueur():
    return render_template('joueur.html')

@app.route('/edition')
def edition():
    return render_template('edition.html')

# ---------------------------------------------
#  Routes - API REST
# ---------------------------------------------

@app.route('/api/state', methods=['GET'])
def get_state():
    return jsonify(state)

# Upload d'une map
@app.route('/api/upload/map', methods=['POST'])
def upload_map():
    if 'file' not in request.files:
        return jsonify({'error': 'Aucun fichier'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Fichier invalide'}), 400

    filename = file.filename
    filepath = os.path.join(UPLOAD_MAPS, filename)
    file.save(filepath)

    if filename not in state['maps']:
        state['maps'].append(filename)
        save_state(state)

    socketio.emit('maps_updated', {'maps': state['maps'], 'map_configs': state['map_configs']})
    return jsonify({'success': True, 'filename': filename})

# Enregistrer la config grille d'une map
@app.route('/api/map_config', methods=['POST'])
def save_map_config():
    data     = request.json
    filename = data.get('filename')
    grille   = data.get('grille')
    if not filename or not grille:
        return jsonify({'error': 'Données manquantes'}), 400

    state['map_configs'][filename] = grille
    save_state(state)
    socketio.emit('map_configs_updated', {'map_configs': state['map_configs']})
    return jsonify({'success': True})

# Supprimer une map et sa config
@app.route('/api/map/<filename>', methods=['DELETE'])
def delete_map(filename):
    # Retirer de la liste
    if filename in state['maps']:
        state['maps'].remove(filename)
    # Retirer la config
    if filename in state['map_configs']:
        del state['map_configs'][filename]
    # Supprimer le fichier
    filepath = os.path.join(UPLOAD_MAPS, filename)
    if os.path.exists(filepath):
        os.remove(filepath)
    # Si c'était la map active, on la remet à None
    if state['map_active'] == filename:
        state['map_active'] = None
    save_state(state)
    socketio.emit('maps_updated', {'maps': state['maps'], 'map_configs': state['map_configs']})
    return jsonify({'success': True})

# Upload d'un token
@app.route('/api/upload/token', methods=['POST'])
def upload_token():
    if 'file' not in request.files:
        return jsonify({'error': 'Aucun fichier'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'Fichier invalide'}), 400

    filename = file.filename
    filepath = os.path.join(UPLOAD_TOKENS, filename)
    file.save(filepath)
    return jsonify({'success': True, 'filename': filename})

# Créer/modifier une définition de token
@app.route('/api/token_def', methods=['POST'])
def create_token_def():
    data = request.json
    existing = next((t for t in state['token_defs'] if t['id'] == data['id']), None)
    if existing:
        state['token_defs'].remove(existing)
    state['token_defs'].append(data)
    save_state(state)
    socketio.emit('token_defs_updated', {'token_defs': state['token_defs']})
    return jsonify({'success': True})

# Supprimer une définition de token
@app.route('/api/token_def/<token_id>', methods=['DELETE'])
def delete_token_def(token_id):
    state['token_defs'] = [t for t in state['token_defs'] if t['id'] != token_id]
    save_state(state)
    socketio.emit('token_defs_updated', {'token_defs': state['token_defs']})
    return jsonify({'success': True})

@app.route('/api/maps', methods=['GET'])
def get_maps():
    return jsonify({'maps': state['maps'], 'map_configs': state['map_configs']})

# Sauvegarder la session
@app.route('/api/save', methods=['POST'])
def save_session():
    data = request.json
    name = data.get('name', 'save') + '.json'
    path = os.path.join(SAVES_DIR, name)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
    return jsonify({'success': True, 'filename': name})

# Charger une sauvegarde
@app.route('/api/load', methods=['POST'])
def load_session():
    global state
    if 'file' not in request.files:
        return jsonify({'error': 'Aucun fichier'}), 400
    file = request.files['file']
    content = json.loads(file.read().decode('utf-8'))
    state = content
    if 'map_configs' not in state:
        state['map_configs'] = {}
    save_state(state)
    socketio.emit('state_reloaded', state)
    return jsonify({'success': True})

# Servir les fichiers uploadés
@app.route('/uploads/maps/<filename>')
def serve_map(filename):
    return send_from_directory(UPLOAD_MAPS, filename)

@app.route('/uploads/tokens/<filename>')
def serve_token(filename):
    return send_from_directory(UPLOAD_TOKENS, filename)

# ---------------------------------------------
#  WebSocket - Événements temps réel
# ---------------------------------------------

@socketio.on('connect')
def on_connect():
    emit('state_reloaded', state)
    print(f"[WS] Client connecté : {request.sid}")

@socketio.on('disconnect')
def on_disconnect():
    print(f"[WS] Client déconnecté : {request.sid}")

@socketio.on('change_map')
def on_change_map(data):
    state['map_active'] = data.get('map')
    save_state(state)
    emit('map_changed', {'map': state['map_active']}, broadcast=True)

@socketio.on('update_grille')
def on_update_grille(data):
    state['grille'].update(data)
    save_state(state)
    emit('grille_updated', state['grille'], broadcast=True)

@socketio.on('toggle_fog')
def on_toggle_fog(data):
    state['fog_of_war'] = data.get('active', True)
    save_state(state)
    emit('fog_updated', {'fog_of_war': state['fog_of_war']}, broadcast=True)

@socketio.on('place_token')
def on_place_token(data):
    existing = next((t for t in state['tokens'] if t['instance_id'] == data['instance_id']), None)
    if existing:
        state['tokens'].remove(existing)
    state['tokens'].append(data)
    save_state(state)
    emit('token_placed', data, broadcast=True)

@socketio.on('move_token')
def on_move_token(data):
    token = next((t for t in state['tokens'] if t['instance_id'] == data['instance_id']), None)
    if token:
        token['x'] = data['x']
        token['y'] = data['y']
        save_state(state)
        emit('token_moved', data, broadcast=True)

@socketio.on('remove_token')
def on_remove_token(data):
    state['tokens'] = [t for t in state['tokens'] if t['instance_id'] != data['instance_id']]
    save_state(state)
    emit('token_removed', data, broadcast=True)

@socketio.on('toggle_token_visibility')
def on_toggle_visibility(data):
    token = next((t for t in state['tokens'] if t['instance_id'] == data['instance_id']), None)
    if token:
        token['visible_joueur'] = data['visible']
        save_state(state)
        emit('token_visibility_changed', data, broadcast=True)

@socketio.on('save_groupe')
def on_save_groupe(data):
    existing = next((g for g in state['groupes'] if g['nom'] == data['nom']), None)
    if existing:
        state['groupes'].remove(existing)
    state['groupes'].append(data)
    save_state(state)
    emit('groupes_updated', {'groupes': state['groupes']}, broadcast=True)

@socketio.on('load_groupe')
def on_load_groupe(data):
    groupe = next((g for g in state['groupes'] if g['nom'] == data['nom']), None)
    if groupe:
        emit('groupe_loaded', groupe, broadcast=True)

@socketio.on('reveal_objet')
def on_reveal_objet(data):
    emit('objet_revealed', data, broadcast=True)

# ---------------------------------------------
#  Lancement
# ---------------------------------------------
if __name__ == '__main__':
    print("=" * 50)
    print("  🎲 DnD App - Serveur local démarré")
    print("=" * 50)
    print("  MJ      →  http://localhost:5000/mj")
    print("  Joueur  →  http://localhost:5000/joueur")
    print("  Édition →  http://localhost:5000/edition")
    print("=" * 50)
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)