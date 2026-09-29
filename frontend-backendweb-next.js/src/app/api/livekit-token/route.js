import { AccessToken, RoomServiceClient, AgentDispatchClient } from 'livekit-server-sdk';
import { NextResponse } from 'next/server';

async function ensureRoomAndAgent(roomName, livekitUrl, apiKey, apiSecret) {
  const roomClient = new RoomServiceClient(livekitUrl, apiKey, apiSecret);
  const agentClient = new AgentDispatchClient(livekitUrl, apiKey, apiSecret);

  // 1. Créer la room si elle n'existe pas encore (idempotent)
  try {
    await roomClient.createRoom({ name: roomName });
    console.log(`[livekit] Room créée: ${roomName}`);
  } catch (err) {
    // La room existe déjà (LiveKit renvoie une erreur "already exists")
    console.log(`[livekit] Room déjà existante: ${roomName}`);
  }

  // 2. Vérifier la PRÉSENCE RÉELLE de l'agent dans la salle.
  //    Un dispatch peut rester "actif" (job JS_RUNNING) après la mort de son
  //    worker (ex: redémarrage) : côté Cloud le job existe, mais AUCUN agent
  //    n'est connecté → personne ne répond. Seule la présence d'un
  //    participant agent-* dans la salle est fiable.
  const ZOMBIE_GRACE_MS = 60000; // délai de grâce pendant le boot de l'agent
  // L'API renvoie les statuts d'un job en NUMERIQUE (JS_SUCCESS=2,
  // JS_FAILED=3) ET/OU en texte selon le chemin JSON utilisé : on couvre
  // les deux formes pour ne jamais confondre un job terminé avec un actif.
  const TERMINAL = new Set([2, 3, 'JS_FAILED', 'JS_SUCCESS']);

  let agentPresent = false;
  try {
    const participants = await roomClient.listParticipants(roomName);
    agentPresent = participants.some((p) => (p.identity || '').startsWith('agent-'));
  } catch (err) {
    console.log(`[livekit] Impossibilité de lister les participants (${err.message})`);
  }

  if (agentPresent) {
    console.log(`[livekit] Agent déjà présent dans la salle: ${roomName}`);
    return;
  }

  // Aucun agent connecté → inspecter les dispatchs. Un dispatch RÉCENT
  // (agent en cours de démarrage, ~2-4 s) est conservé ; tout le reste
  // (jobs terminés, zombies RUNNING anciens) est purgé puis recréé.
  let dispatches = [];
  try {
    dispatches = await agentClient.listDispatch(roomName);
  } catch (err) {
    console.log(`[livekit] Pas de dispatch existant (${err.message})`);
  }

  const now = Date.now();
  const toMs = (v) => {
    const n = Number(v || 0);
    if (!n) return 0;
    if (n > 1e15) return n / 1e6; // nanosecondes (LiveKit Cloud)
    if (n > 1e12) return n; // millisecondes
    return n * 1000; // secondes
  };
  const isFreshLiveJob = (j) => {
    const status = j?.state?.status;
    if (TERMINAL.has(status)) return false;
    const startedAt = toMs(j?.state?.startedAt);
    if (!startedAt) return true; // jamais démarré (en attente de worker)
    return now - startedAt < ZOMBIE_GRACE_MS;
  };

  if (dispatches.some((d) => d?.state?.jobs?.some(isFreshLiveJob))) {
    console.log(`[livekit] Dispatch récent — agent en cours de démarrage (${roomName})`);
    return;
  }

  for (const d of dispatches) {
    try {
      await agentClient.deleteDispatch(d.id);
      console.log(`[livekit] Dispatch périmé supprimé: ${d.id}`);
    } catch (err) {
      console.warn(`[livekit] Suppression dispatch ${d.id} impossible: ${err.message}`);
    }
  }
  try {
    await agentClient.createDispatch(roomName, '');
    console.log(`[livekit] Dispatch d'agent créé pour: ${roomName}`);
  } catch (err) {
    console.warn(`[livekit] Échec création dispatch: ${err.message}`);
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const roomName = body.roomName || 'luli-tech-room';
    const participantName = body.participantName || `client-${Math.random().toString(36).substring(2, 9)}`;

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret || !livekitUrl) {
      return NextResponse.json(
        { error: 'Variables d’environnement LiveKit non configurées.' },
        { status: 500 }
      );
    }

    // S'assurer que la room et le dispatch d'agent existent
    // (l'agent Python rejoindra alors automatiquement le salon)
    await ensureRoomAndAgent(roomName, livekitUrl, apiKey, apiSecret);

    // Créer un token d'accès LiveKit signé
    const token = new AccessToken(apiKey, apiSecret, {
      identity: participantName,
      name: participantName,
      ttl: '4h',
    });

    // Permissions complètes pour audio WebRTC et data stream
    token.addGrant({
      room: roomName,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    // En LiveKit Server SDK v2+, toJwt() est asynchrone (retourne une Promise)
    const jwt = await token.toJwt();

    return NextResponse.json({
      token: jwt,
      url: livekitUrl,
      roomName,
      participantName,
    });
  } catch (error) {
    console.error('Erreur de génération du token LiveKit:', error);
    return NextResponse.json(
      { error: error.message || 'Échec de génération du token' },
      { status: 500 }
    );
  }
}
