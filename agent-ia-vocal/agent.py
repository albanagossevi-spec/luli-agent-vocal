import os
import io
import re
import json
import logging
import asyncio
import time
from dotenv import load_dotenv

import edge_tts
import miniaudio

from livekit import agents, rtc
from livekit.agents import (
    Agent,
    AgentSession,
    APIConnectOptions,
    JobContext,
    llm,
    tts,
    utils,
    voice,
)
from livekit.agents.voice.agent_session import SessionConnectOptions
from livekit.agents.voice.room_io import RoomOptions
from livekit.agents._exceptions import APIStatusError, APIConnectionError
from livekit.plugins import groq, fishaudio

# Configuration du logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("luli-tech-agent")

# Charger les variables d'environnement
load_dotenv()

# Référence module-level au salon (pour les publications de secours)
_active_room = None

# TTS de secours : fenêtre courte pour basculer vite sur Edge.
EDGE_CONN_OPTIONS = APIConnectOptions(max_retry=1, retry_interval=2.0, timeout=30.0)

# Fenêtres de connexion pour le LLM (Groq) et les médias : larges mais bornées.
LLM_CONN_OPTIONS = APIConnectOptions(max_retry=1, retry_interval=2.0, timeout=90.0)
MEDIA_CONN_OPTIONS = APIConnectOptions(max_retry=2, retry_interval=2.0, timeout=30.0)


# ---------------------------------------------------------------------------
# MOTEUR LLM RÉSILIENT (anti-rate-limit)
# ---------------------------------------------------------------------------
# Le tier gratuit Groq (on_demand) plafonne à 7 000 tokens d'entrée/minute
# (ITPM). Le 429 survient PENDANT l'itération du stream (`async for`), pas à
# l'appel de chat() — d'où l'échec silencieux des tours vocaux (ni audio ni
# texte). On intercepte donc l'erreur dans l'itérateur et on relance une
# requête fraîche après avoir attendu le délai que Groq demande lui-même.
def _is_llm_rate_limit_error(exc: Exception) -> bool:
    if isinstance(exc, APIStatusError):
        return exc.status_code == 429
    return "rate limit" in str(exc).lower()


def _llm_retry_after_seconds(exc: Exception) -> float:
    text = str(getattr(exc, "message", "") or getattr(exc, "body", "") or exc)
    m = re.search(r"try again in ([\d.]+)s", text)
    return float(m.group(1)) + 0.5 if m else 2.0


class _ResilientLLMStream:
    """Flux LLM transparent qui relance la requête si Groq répond 429.

    Utilisable en itérateur (`async for`) ET en contexte asynchrone
    (`async with … as stream`) — le pipeline voix de LiveKit utilise la
    seconde forme.
    """

    def __init__(self, factory, base_stream, max_attempts=4):
        self._factory = factory
        self._stream = base_stream
        self._attempt = 0
        self._max = max_attempts
        self._entered = False

    async def _ensure_entered(self):
        """Entre dans le stream sous-jacent s'il expose un contexte async."""
        if self._entered:
            return
        self._entered = True
        enter = getattr(self._stream, "__aenter__", None)
        if enter is not None:
            self._stream = await enter()

    def __aiter__(self):
        return self

    async def __anext__(self):
        await self._ensure_entered()
        while True:
            try:
                return await self._stream.__anext__()
            except StopAsyncIteration:
                raise
            except (APIStatusError, APIConnectionError) as exc:
                if not _is_llm_rate_limit_error(exc):
                    raise
                self._attempt += 1
                if self._attempt >= self._max:
                    logger.warning(
                        f"[LLM] Abandon après {self._attempt} tentatives (rate limit Groq)."
                    )
                    raise
                wait = min(_llm_retry_after_seconds(exc) * (1.0 + 0.2 * self._attempt), 35.0)
                logger.warning(
                    f"[LLM] Rate limit Groq — nouvel essai dans {wait:.1f}s "
                    f"(tentative {self._attempt}/{self._max})."
                )
                await asyncio.sleep(wait)
                self._stream = self._factory()
                self._entered = False
                await self._ensure_entered()

    async def __aenter__(self):
        await self._ensure_entered()
        return self

    async def __aexit__(self, exc_type, exc, tb):
        exit_ = getattr(self._stream, "__aexit__", None)
        if exit_ is not None:
            await exit_(exc_type, exc, tb)
        return False


def _resilient_chat_wrapper(original_chat):
    """Enveloppe llm.chat() pour rendre l'itération résistante au 429."""

    def wrapped(*args, **kwargs):
        def factory():
            return original_chat(*args, **kwargs)

        return _ResilientLLMStream(factory, factory())

    return wrapped

# Prompt système officiel LULI-TECH
LULI_SYSTEM_PROMPT = """Tu es l'assistant IA officiel LULI-TECH, avec une double compétence :
1. Tu représentes l'agence et maîtrises à 100% son identité, son équipe, ses services et ses liens.
2. Tu as une grande culture générale et technique pour toute autre question.

[IDENTITÉ]
- Agence : LULI-TECH · Calavi, Bénin.
- Slogan : « Innovons aujourd'hui avec les solutions de demain. »
- Logo : le « nœud » (trois points reliés) — convergence du coworking, du digital et de l'entrepreneuriat.
- Email : LULI-TECH@gmail.com · Site : https://LULI-TECH.netlify.app/
- Mission : accompagner les entreprises en retard numérique via la Transition Numérique, le Marketing Digital & la Communication, et l'Audit / Sécurisation des systèmes.

[RÉSEAUX SOCIAUX OFFICIELS]
- Facebook : https://facebook.com · Instagram : https://instagram.com · TikTok : https://tiktok.com · LinkedIn : https://linkedin.com

[ÉQUIPE — membres, postes, contacts]
- Jacob De Dieu AGOSSEVI : Président Directeur Général. | Filière : Finance & Comptabilité (Licence 2) | Tél : +229 01 95 62 12 20 | Compétences : leadership, stratégie, finance.
- Ismaël DJIBRIL FALILATOU : Directeur Général Adjoint. | Filière : Gestion des Entreprises (Licence 2) | Tél : +229 01 53 89 05 76 | Compétences : pilotage, opérations, réseau.
- Maysia SOSSOU : Directrice du Pôle Marketing Digital. | Filière : Marketing & Communication Digitale | Tél : +229 01 97 31 13 09 | Compétences : stratégie de marque, contenu, acquisition.
- Rachid OROU-GUIDOU : Directeur du Pôle Développement & Sécurité. | Filière : Génie Logiciel & Cybersécurité | Tél : +229 01 97 42 07 44 | Compétences : développement web, sécurité, DevOps.
- Guillaume AGBO : Directeur Technique & Intelligence Artificielle. | Filière : Génie Logiciel & IA | Tél : +229 01 68 08 08 09 | Compétences : IA & LLM, systèmes vocaux, architecture.

[SERVICES]
- Transition Numérique : applications et sites web métiers, digitalisation des processus.
- Ingénierie en IA & Agents Vocaux : agents conversationnels temps réel (voix et texte), comme celui qui vous répond ici.
- Marketing Digital & Communication : stratégie de visibilité, réseaux sociaux, création de contenu (visuel, texte, vidéo).
- Audit & Cybersécurité : audits de vulnérabilité, protection des infrastructures, support et maintenance.
- Commerce International & e-business : étude de marché export, stratégie d'internationalisation, sourcing, canaux e-business.
- Entrepreneuriat & Gestion de Projets : business plan, étude de faisabilité, plan de financement, pilotage de projet.

[ORGANISATION INTERNE]
- Réunion de coordination hebdomadaire en début de semaine (présence obligatoire), comptes-rendus validés en fin de semaine.
- Missions réparties par pôle (technique, communication, administration) ; communication interne via WhatsApp, Discord et GitHub.

[RÈGLES DE RÉPONSE]
- Pour toute question sur LULI-TECH (identité, offres, liens, membres), puise exclusivement dans les données ci-dessus.
- Pour la culture générale ou l'aide technique, utilise pleinement ta base de connaissances.
- Sois courtois, professionnel, dynamique, toujours en français.
"""


class EdgeTTS(tts.TTS):
    """TTS de secours gratuit via Microsoft Edge (aucune clé API requise).

    Utilisé automatiquement si le TTS Fish Audio est indisponible
    (ex: crédit API insuffisant). Voix française naturelle 24 kHz mono.
    """

    def __init__(self, voice: str = "fr-FR-DeniseNeural", sample_rate: int = 24000):
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=sample_rate,
            num_channels=1,
        )
        self._voice = voice
        self._label = "edge-tts"

    @property
    def model(self) -> str:
        return f"edge-tts/{self._voice}"

    def synthesize(
        self, text: str, *, conn_options: APIConnectOptions = EDGE_CONN_OPTIONS
    ) -> tts.ChunkedStream:
        return _EdgeTTSTTSSynthesizeStream(
            tts=self, input_text=text, conn_options=conn_options
        )


class _EdgeTTSTTSSynthesizeStream(tts.ChunkedStream):
    def __init__(self, *, tts: EdgeTTS, input_text: str, conn_options: APIConnectOptions):
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._tts: EdgeTTS = tts

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        text = self._input_text.strip()
        logger.info(f"[TTS] Synthèse Edge démarrée ({len(text)} car.)")
        if not text:
            output_emitter.end_input()
            return

        try:
            # 1. Synthèse via Edge TTS (Microsoft)
            mp3_buffer = io.BytesIO()
            communicate = edge_tts.Communicate(text, voice=self._tts._voice)
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    mp3_buffer.write(chunk["data"])

            mp3_bytes = mp3_buffer.getvalue()
            if not mp3_bytes:
                raise RuntimeError("Edge TTS n'a produit aucun audio")

            # 2. Décodage MP3 -> PCM mono 24 kHz
            decoded = miniaudio.decode(
                mp3_bytes,
                output_format=miniaudio.SampleFormat.SIGNED16,
                nchannels=1,
                sample_rate=self._tts.sample_rate,
            )
            pcm = bytes(decoded.samples)
            if not pcm:
                raise RuntimeError("Décodage PCM Edge TTS vide")

            # 3. Publication par trames de ~20 ms
            output_emitter.initialize(
                request_id=utils.shortuuid(),
                sample_rate=self._tts.sample_rate,
                num_channels=1,
                mime_type="audio/pcm",
            )

            frame_bytes = (self._tts.sample_rate // 50) * 2  # 20 ms mono s16
            # Zéro-padding du dernier morceau : toutes les trames font EXACTEMENT
            # 20 ms → fin d'audio propre, aucun "clic"/grattage de fin de fichier.
            n_frames = (len(pcm) + frame_bytes - 1) // frame_bytes
            padded = pcm.ljust(n_frames * frame_bytes, b"\x00")
            for i in range(0, n_frames * frame_bytes, frame_bytes):
                output_emitter.push(padded[i:i + frame_bytes])

            output_emitter.flush()
            logger.info(
                f"[TTS] Synthèse Edge OK : {len(mp3_bytes)} octets MP3, "
                f"{len(pcm)} octets PCM, {n_frames} trames."
            )
        except Exception as e:
            logger.error(f"[TTS] ÉCHEC synthèse Edge ({type(e).__name__}): {e}", exc_info=True)
            raise


class LuliTechAgent(Agent):
    def __init__(self):
        super().__init__(
            instructions=LULI_SYSTEM_PROMPT,
        )

    async def on_enter(self):
        """Salutation à l'entrée dans le salon (premier participant lié)."""
        logger.info("Agent entré dans la room LiveKit.")
        # Petit délai : on laisse RoomIO se lier au participant humain qui
        # vient d'ouvrir le chat (sinon la salutation part vers personne).
        await asyncio.sleep(1.5)
        session = getattr(self, "session", None)
        if session is None:
            return
        identity = None
        try:
            io = session.room_io
            linked = io.linked_participant if io is not None else None
            identity = linked.identity if linked is not None else None
        except Exception:
            identity = None
        await greet_client(session, identity)


def prewarm(proc: agents.JobProcess):
    """Préchargement des bibliothèques clés au démarrage"""
    import httpx  # noqa: F401
    import openai  # noqa: F401
    import groq  # noqa: F401
    logger.info("Processus de worker pré-chauffé avec succès.")


async def _publish_data(room, payload: dict) -> None:
    """Publie un message JSON fiable au client (canal de données)."""
    try:
        await room.local_participant.publish_data(json.dumps(payload), reliable=True)
    except Exception as exc:
        logger.warning(f"Publication data échouée: {exc}")


# ---------------------------------------------------------------------------
# SALUTATION ROBUSTE (une fois par participant, espacement anti-doublon)
# ---------------------------------------------------------------------------
GREETING_TEXT = (
    "Bonjour ! Je suis l'assistant IA officiel de LULI-TECH. "
    "Vous pouvez m'écrire ou me parler. Comment puis-je vous aider aujourd'hui ?"
)
GREETING_MIN_INTERVAL = 4.0  # secondes entre deux saluts (anti doublon onglets simultanés)
# État partagé par salon : { room_name: {"greeted": set(identities), "last": float} }
_greeting_state: dict[str, dict] = {}


def _greeting_tracker(room_name: str) -> dict:
    st = _greeting_state.get(room_name)
    if st is None:
        st = {"greeted": set(), "last": 0.0}
        _greeting_state[room_name] = st
    return st


async def greet_client(session, identity: str | None) -> None:
    """Adresse la salutation à l'utilisateur, une seule fois par identité.

    - session.say() peut échouer EN SILENCE (l'erreur est stockée dans
      handle.exception(), jamais levée) : on la détecte et on la journalise.
    - Un participant qui recharge la page (nouvel identity) est re-salué :
      c'est le correctif du « je n'entends pas la salutation » après F5.
    - La salutation arrive APRÈS un geste utilisateur (client_ready publié par
      le frontend) : l'autoplay du navigateur ne peut plus la bloquer.
    """
    room_name = _active_room.name if _active_room is not None else "?"
    st = _greeting_tracker(room_name)
    if identity:
        if identity in st["greeted"]:
            return
        st["greeted"].add(identity)
    now = time.monotonic()
    if now - st["last"] < GREETING_MIN_INTERVAL:
        return
    st["last"] = now

    logger.info(f"[SALUTATION] Envoi de la voix à {identity or 'participant lié'}")
    try:
        handle = session.say(GREETING_TEXT)
        await handle
        exc = handle.exception()
        if exc:
            logger.error(
                f"[SALUTATION] La voix a ÉCHOUÉ silencieusement "
                f"({type(exc).__name__}): {exc}"
            )
        else:
            logger.info("[SALUTATION] Voix envoyée avec succès.")
    except Exception as e:
        logger.error(f"[SALUTATION] Erreur lors du salut: {e}", exc_info=True)


def _rebind_input(session, identity: str) -> None:
    """Rebranche l'écoute micro RoomIO sur le participant qui s'exprime.

    La session vocale se lie au premier participant trouvé dans le salon
    (RoomIO._on_participant_connected). Avec des onglets précédents encore
    connectés, elle peut rester branchée sur un participant "fantôme" et
    ignorer le micro du vrai utilisateur. Cette fonction force le passage
    sur l'expéditeur réel des messages.
    """
    try:
        io = session.room_io
        linked = io.linked_participant if io is not None else None
        if linked is None or linked.identity != identity:
            io.set_participant(identity)
            logger.info(f"Écoute micro rebranchée sur {identity}")
    except Exception as e:
        logger.warning(f"Rebranchement micro impossible: {e}")


async def entrypoint(ctx: JobContext):
    """Point d'entrée principal pour LiveKit Agents Worker"""
    global _active_room
    logger.info(f"Connexion au salon {ctx.room.name}...")

    # Connexion à la salle LiveKit (WebRTC)
    await ctx.connect(auto_subscribe=agents.AutoSubscribe.AUDIO_ONLY)
    _active_room = ctx.room

    # Garde anti-doublon : si un autre agent est déjà présent dans le
    # salon (ex: dispatchs orphelins côté Cloud), on se retire pour éviter
    # deux réponses simultanées. On attend un court instant pour laisser
    # les participants se déclarer.
    await asyncio.sleep(2.0)
    other_agents = [
        p for p in ctx.room.remote_participants.values()
        if p.identity.startswith("agent-")
    ]
    if other_agents:
        logger.warning(
            f"Agent déjà présent dans le salon ({other_agents[0].identity}) : "
            "abandon du job pour éviter un doublon."
        )
        ctx.shutdown(reason="duplicate agent detected")
        return

    # Récupération des modèles et clés
    stt_model_name = os.getenv("STT_MODEL", "whisper-large-v3-turbo")
    llm_model_name = os.getenv("LLM_MODEL", "qwen/qwen3.8-27b")
    tts_model_name = os.getenv("TTS_MODEL", "s2.1-pro-free")

    groq_api_key = os.getenv("GROQ_API_KEY")
    fish_audio_api_key = os.getenv("FISH_AUDIO_API_KEY")

    logger.info(
        f"Modèles configurés : STT={stt_model_name} (Groq), "
        f"LLM={llm_model_name} (Groq), TTS={tts_model_name} (Fish Audio + Edge fallback)"
    )

    # 1. STT — Whisper via Groq
    stt_model = groq.STT(model=stt_model_name, api_key=groq_api_key, language="fr")
    logger.info("STT initialisé avec Groq Whisper.")

    # 2. LLM — Groq AI (même clé que le STT, modèle qwen3.8-27b — premier
    # token en ~2 s). Enveloppé pour survivre aux 429 (rate limit ITPM) :
    # on attend le délai demandé par Groq et on relance au lieu de mourir.
    llm_model = groq.LLM(
        model=llm_model_name,
        api_key=groq_api_key,
        temperature=0.7,
    )
    llm_model.chat = _resilient_chat_wrapper(llm_model.chat)
    logger.info(f"LLM initialisé avec Groq ({llm_model_name}) — mode résilient aux 429.")

    # 3. TTS — Edge TTS EN PRIORITÉ (gratuit, instantané, fiable), Fish Audio
    # en secours. Fish renvoie 402 (crédit épuisé) à chaque tour : le mettre
    # en premier faisait perdre ~2-4 s/tour + des warnings inutiles.
    fish_tts = fishaudio.TTS(
        api_key=fish_audio_api_key,
        model="s2.1-pro",
        sample_rate=24000,
    )
    edge_tts_model = EdgeTTS(voice="fr-FR-DeniseNeural", sample_rate=24000)
    tts_model = tts.FallbackAdapter(
        tts=[edge_tts_model, fish_tts],
        max_retry_per_tts=1,
        sample_rate=24000,
    )
    logger.info("TTS initialisé (Edge en priorité, Fish Audio en secours).")

    @tts_model.on("metrics_collected")
    def on_tts_metrics(ev):
        """Journalise les métriques TTS (durée d'audio synthétisée, détecte le silence)."""
        try:
            md = getattr(ev, "metrics", None)
            if md is None:
                logger.info("[TTS] metrics: (aucune donnée)")
                return
            # Les champs exacts varient selon le provider : on journalise le
            # plus d'infos possible sans casser sur les versions différentes.
            attrs = {}
            for k in ("audio_duration", "ttfb", "synthesis_duration", "stream_duration",
                      "characters_count", "segments_count", "model", "provider",
                      "request_id", "merged"):
                try:
                    v = getattr(md, k, None)
                    if v is not None:
                        attrs[k] = v
                except Exception:
                    pass
            if attrs:
                logger.info(f"[TTS] metrics: {attrs}")
            else:
                logger.info(f"[TTS] metrics: {md!r}")
        except Exception as err:
            logger.warning(f"[TTS] metrics illisibles: {err}")

    # Création de la session vocale (CAS 2 : AUDIO)
    # - Préemption désactivée : 1 seul appel LLM par tour (2 avec la
    #   préemption) — indispensable pour rester sous les 7 000 ITPM Groq.
    # - Endpointing élargi (0.7 → 3 s) : les finals STT "fragmentés"
    #   ("il me" puis " du" pour une même phrase) ne commitent plus de tours
    #   fantômes qui doublent les appels LLM et épuisent le quota.
    # - Interruptions VAD actives : l'utilisateur peut couper l'agent.
    session = AgentSession(
        stt=stt_model,
        llm=llm_model,
        tts=tts_model,
        turn_handling={
            "preemptive_generation": {"enabled": False},
            "endpointing": {"mode": "fixed", "min_delay": 0.7, "max_delay": 3.0},
            "interruption": {
                "enabled": True,
                "mode": "vad",
                "min_duration": 0.7,
                "false_interruption_timeout": 2.5,
            },
        },
        conn_options=SessionConnectOptions(
            stt_conn_options=MEDIA_CONN_OPTIONS,
            llm_conn_options=LLM_CONN_OPTIONS,
            tts_conn_options=MEDIA_CONN_OPTIONS,
        ),
    )

    @session.on("conversation_item_added")
    def on_conversation_item_added(event: voice.ConversationItemAddedEvent):
        """Envoie au client le texte au-dessus de l'audio (bulle WhatsApp)."""
        try:
            item = event.item
            if getattr(item, "role", None) == "assistant":
                content = item.content
                text_content = (
                    content if isinstance(content, str)
                    else "".join(str(c) for c in content)
                )
                logger.info(f"Réponse vocale assistant (texte) -> client : {text_content[:60]}...")
                asyncio.create_task(
                    ctx.room.local_participant.publish_data(
                        json.dumps({
                            "type": "agent_voice_response",
                            "text": text_content,
                            "timestamp": int(time.time() * 1000),
                        }),
                        reliable=True,
                    )
                )
        except Exception as err:
            logger.error(f"Erreur conversation_item_added: {err}")

    @session.on("user_input_transcribed")
    def on_user_input_transcribed(event: voice.UserInputTranscribedEvent):
        """Envoie au client la transcription de sa propre voix."""
        try:
            transcript = getattr(event, "transcript", "")
            if transcript:
                logger.info(f"Transcription voix utilisateur: {transcript}")
                asyncio.create_task(
                    ctx.room.local_participant.publish_data(
                        json.dumps({
                            "type": "user_transcript",
                            "text": transcript,
                        }),
                        reliable=True,
                    )
                )
        except Exception as err:
            logger.error(f"Erreur user_input_transcribed: {err}")

    @session.on("agent_state_changed")
    def on_agent_state_changed(ev):
        """Signale au client la PAROLE de l'agent (début/fin réelle).

        Le frontend s'appuie sur ces événements (au lieu des événements de
        track WebRTC, peu fiables) pour afficher le texte au bon moment et
        capturer proprement la note vocale par tour.
        """
        try:
            new_state = getattr(ev, "new_state", None)
            if new_state == "speaking":
                asyncio.create_task(_publish_data(ctx.room, {
                    "type": "agent_voice_start",
                    "timestamp": int(time.time() * 1000),
                }))
            elif new_state in ("listening", "idle"):
                asyncio.create_task(_publish_data(ctx.room, {
                    "type": "agent_voice_end",
                    "timestamp": int(time.time() * 1000),
                }))
        except Exception as err:
            logger.error(f"Erreur handler agent_state_changed: {err}")

    @session.on("error")
    def on_session_error(ev):
        """Secours : si le LLM/STT/TTS échoue (ex: timeout du modèle gratuit),
        envoie un message clair au client au lieu d'un silence."""
        try:
            source = getattr(ev, "source", None)
            src_name = type(source).__name__ if source is not None else "inconnu"
            err = getattr(ev, "error", None)
            logger.error(f"Erreur session ({src_name}): {err}")
            if "LLM" in src_name:
                asyncio.create_task(_publish_data(ctx.room, {
                    "type": "agent_voice_response",
                    "text": ("Désolé, le modèle IA gratuit a rencontré une limite "
                             "temporaire. Veuillez réessayer dans un instant."),
                    "timestamp": int(time.time() * 1000),
                }))
            # Toujours débloquer côté client (fin de parole forcée) pour que
            # le texte de secours s'affiche immédiatement.
            if "LLM" in src_name or "TTS" in src_name:
                asyncio.create_task(_publish_data(ctx.room, {
                    "type": "agent_voice_end",
                    "timestamp": int(time.time() * 1000),
                }))
        except Exception as e:
            logger.error(f"Erreur handler session error: {e}")

    # CAS 1 : GESTION DES PROMPTS TEXTE (STT et TTS contournés)
    async def handle_text_prompt(msg_id: str, prompt: str):
        logger.info(f"[CAS 1 - TEXTE] Prompt client reçu : {prompt}")
        full_text = ""
        try:
            chat_ctx = llm.ChatContext()
            chat_ctx.add_message(role="system", content=LULI_SYSTEM_PROMPT)
            chat_ctx.add_message(role="user", content=prompt)

            # Appel direct au LLM sans STT ni TTS — streaming activé.
            # conn_options = même timeout large que la session vocale (90 s).
            stream = llm_model.chat(chat_ctx=chat_ctx, conn_options=LLM_CONN_OPTIONS)

            async def publish_chunks(text_chunk: str):
                """Publie un lot de texte vers le client (CAS 1)."""
                if not text_chunk:
                    return
                chunk_payload = json.dumps({
                    "type": "agent_text_chunk",
                    "id": msg_id,
                    "delta": text_chunk,
                })
                await ctx.room.local_participant.publish_data(
                    chunk_payload.encode("utf-8"),
                    reliable=True,
                )

            async def consume_stream():
                nonlocal full_text
                pending: list[str] = []
                pending_len = 0
                last_flush = time.monotonic()

                async def flush():
                    nonlocal pending, pending_len, last_flush
                    if pending:
                        await publish_chunks("".join(pending))
                        pending = []
                        pending_len = 0
                        last_flush = time.monotonic()

                async for chunk in stream:
                    delta = ""
                    if isinstance(chunk, str):
                        delta = chunk
                    elif hasattr(chunk, "choices") and chunk.choices:
                        choice_delta = getattr(chunk.choices[0], "delta", None)
                        if choice_delta is not None:
                            delta = getattr(choice_delta, "content", "") or ""
                    elif hasattr(chunk, "delta"):
                        d = chunk.delta
                        if isinstance(d, str):
                            delta = d
                        elif d:
                            delta = getattr(d, "content", "") or str(d)
                    elif hasattr(chunk, "content"):
                        delta = chunk.content or ""

                    if delta:
                        full_text += delta
                        pending.append(delta)
                        pending_len += len(delta)
                        now = time.monotonic()
                        # Publication par lots (~150 ms) pour un streaming fluide
                        if pending_len >= 40 or (now - last_flush) >= 0.15:
                            await flush()

                await flush()

            # Timeout généreux pour le streaming (Groq répond en ~2 s).
            await asyncio.wait_for(consume_stream(), timeout=120.0)
            logger.info(f"[CAS 1 - TEXTE] Réponse terminée ({len(full_text)} caractères).")

        except asyncio.TimeoutError:
            logger.error(f"[CAS 1] Timeout LLM après 120s pour: {prompt[:60]}...")
            if not full_text:
                full_text = "Désolé, le modèle a mis trop de temps à répondre. Veuillez réessayer."
        except Exception as e:
            logger.error(f"Erreur lors du traitement texte CAS 1: {e}", exc_info=True)
            if not full_text:
                full_text = "Désolé, une erreur est survenue lors de la génération de la réponse."
        finally:
            # TOUJOURS envoyer agent_text_done pour débloquer le frontend
            try:
                done_payload = json.dumps({
                    "type": "agent_text_done",
                    "id": msg_id,
                    "fullText": full_text,
                })
                await ctx.room.local_participant.publish_data(
                    done_payload.encode("utf-8"),
                    reliable=True,
                )
            except Exception as pub_err:
                logger.error(f"Erreur publication agent_text_done: {pub_err}")

    # Réception des paquets de données du salon WebRTC
    @ctx.room.on("data_received")
    def on_data_received(dp: rtc.DataPacket):
        try:
            raw_text = dp.data.decode("utf-8")
            data = json.loads(raw_text)
            mtype = data.get("type")

            # IMPORTANT : RoomIO lie l'écoute micro au PREMIER participant du
            # salon. En présence de participants "fantômes" (anciens onglets
            # encore connectés), le micro du vrai utilisateur serait ignoré
            # (pas de transcription, pas de réponse). On rebranche donc
            # l'écoute sur l'expéditeur réel de chaque message.
            sender_identity = None
            try:
                sender_identity = dp.participant_identity or None
            except AttributeError:
                try:
                    sender_identity = dp.participant.identity
                except AttributeError:
                    sender_identity = None
            if sender_identity and mtype in (
                "user_text_prompt",
                "user_audio_started",
                "user_audio_completed",
                "client_ready",
            ):
                _rebind_input(session, sender_identity)

            # Salutation déclenchée au bon moment : après l'ouverture du chat
            # ET au premier geste/parole de l'utilisateur (autoplay OK).
            if mtype in ("client_ready", "user_audio_started") and sender_identity:
                asyncio.create_task(greet_client(session, sender_identity))

            # Détection du CAS 1 (prompt texte envoyé par le client)
            if mtype == "user_text_prompt":
                msg_id = data.get("id", f"msg-{int(time.time() * 1000)}")
                prompt = data.get("text", "")
                asyncio.create_task(handle_text_prompt(msg_id, prompt))

        except Exception as ex:
            logger.error(f"Erreur de lecture du data_packet: {ex}")

    # Démarrage de l'agent vocal LULI-TECH
    # close_on_disconnect=False : le rechargement de page / une coupure WebRTC
    # du client ne tue PLUS la session vocale. L'agent reste dans la salle et
    # RoomIO se relie automatiquement au (prochain) participant — sinon la
    # session meurt pendant que le worker occupe la salle, et l'audio du client
    # devenu "revenu" n'a plus aucun destinataire (aucune réponse).
    agent = LuliTechAgent()
    await session.start(
        agent,
        room=ctx.room,
        room_options=RoomOptions(close_on_disconnect=False),
    )


if __name__ == "__main__":
    # Démarrage de l'application Worker LiveKit Agents
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            ws_url=os.getenv("LIVEKIT_URL"),
            api_key=os.getenv("LIVEKIT_API_KEY"),
            api_secret=os.getenv("LIVEKIT_API_SECRET"),
            initialize_process_timeout=60.0,
            num_idle_processes=1,
        )
    )