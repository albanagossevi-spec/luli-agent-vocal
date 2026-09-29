// Configuration LiveKit - valeurs uniquement via variables d'environnement.
// Ce fichier n'est pas importé par l'application (l'API token lit .env.local) ;
// il est conservé pour référence. NE PAS y coller de clés.
module.exports = {
  LIVEKIT_URL: process.env.LIVEKIT_URL || 'wss://agent-vocal-xr9dldnu.livekit.cloud',
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY || '',
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET || '',
};