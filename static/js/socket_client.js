// socket_client.js — connexion WebSocket partagée entre toutes les pages
const socket = io();

socket.on('connect', () => {
    console.log('[WS] Connecté au serveur — id :', socket.id);
});

socket.on('disconnect', () => {
    console.log('[WS] Déconnecté du serveur');
});