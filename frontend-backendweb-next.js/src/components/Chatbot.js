'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import AudioMessage from './AudioMessage';
import FrequencyVisualizer from './FrequencyVisualizer';

// État partagé au niveau module : UNE SEULE connexion LiveKit par page.
// Sans cela, le double montage React en mode dev (StrictMode) / la
// réexécution des effets créent plusieurs salles connectées en parallèle :
// bulles dupliquées, participants "fantômes" dans le salon, et micro de
// l'utilisateur ignoré par l'agent (RoomIO se lie au 1er participant).
let sharedRoomInstance = null;
let sharedRoomPromise = null;

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isAgentReady, setIsAgentReady] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState(null);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);

  const messagesEndRef = useRef(null);
  // Timer de sécurité de l'animation "audio en cours de traitement"
  const processingTimerRef = useRef(null);
  // Audio de l'agent arrivé AVANT la bulle texte : mis en attente pour
  // garantir que le texte s'affiche TOUJOURS au-dessus de l'audio.
  const pendingAudioRef = useRef(null);
  const roomRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);
  const publishedTrackRef = useRef(null);
  const pendingAgentMsgRef = useRef(null);
  // NOUVEAU FLUX : le texte reste caché pendant l'audio de l'agent. Ce timer
  // révèle le texte si l'audio ne démarre jamais (TTS en échec).
  const voiceRevealTimerRef = useRef(null);
  // Timer du "streaming" du texte (révélation progressive de la réponse)
  const voiceStreamTimerRef = useRef(null);

  // ID du dernier message vocal révélé (permet d'y attacher la note audio
  // enregistrée quand l'audio se termine).
  const lastVoiceMsgIdRef = useRef(null);

  // Buffer pour l'audio entrant de l'agent (réécoute style WhatsApp)
  const agentAudioChunksRef = useRef([]);
  const agentMediaRecorderRef = useRef(null);
  const agentTrackRef = useRef(null);
  // Élément <audio> UNIQUE réutilisé pour toute la session (évite
  // l'empilement d'éléments qui provoque une lecture dédoublée/grattage).
  const agentAudioElementRef = useRef(null);
  // Suivi du texte en cours de "streaming" pour pouvoir le compléter
  // instantanément dès que l'agent arrête de parler.
  const activeStreamIdRef = useRef(null);
  const activeStreamTextRef = useRef(null);
  // Miroir ref de l'état "l'agent est en train de parler".
  const agentSpeakingRef = useRef(false);
  // Écouteurs de déblocage autoplay déjà attachés (un seul attachement).
  const resumeAttachedRef = useRef(false);
  // Timers de relance auto de la lecture audio agent (nettoyés au démontage).
  const retryTimersRef = useRef([]);
  // Salutation : `client_ready` envoyé à l'agent APRÈS la connexion (1 seule
  // fois par session). L'agent ne salue QUE sur ce signal — qui suit le clic
  // d'ouverture du chat (= geste utilisateur) → l'autoplay Chrome ne peut
  // plus couper la voix. C'est LE correctif « je n'entends pas la salutation ».
  const clientReadySentRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Termine la phase "réponse vocale en cours" : bulle d'animation retirée.
  const endVoiceProcessing = useCallback(() => {
    if (processingTimerRef.current) {
      clearTimeout(processingTimerRef.current);
      processingTimerRef.current = null;
    }
    if (voiceRevealTimerRef.current) {
      clearTimeout(voiceRevealTimerRef.current);
      voiceRevealTimerRef.current = null;
    }
    setIsProcessingVoice(false);
  }, []);

  // Affiche la version TEXTE de la réponse vocale (avec ou sans audio).
  // Le texte "streame" dans la bulle : apparition immédiate DÈS LE DÉBUT
  // de l'audio (en parallèle de la voix), puis défilement rapide des
  // caractères — zéro latence ressentie.
  const revealVoiceText = useCallback(
    (id, text, audioUrl) => {
      endVoiceProcessing();

      if (!text) {
        lastVoiceMsgIdRef.current = id;
        setMessages((prev) => [
          ...prev,
          {
            id,
            sender: 'agent',
            text: '',
            audioUrl: audioUrl || null,
            timestamp: new Date(),
            mode: 'audio',
            isComplete: true,
          },
        ]);
        return;
      }

      // Bulle créée instantanément, texte révélé progressivement
      lastVoiceMsgIdRef.current = id;
      setMessages((prev) => {
        if (prev.some((m) => m.id === id)) return prev; // évite le doublon
        return [
          ...prev,
          {
            id,
            sender: 'agent',
            text: '',
            audioUrl: audioUrl || null,
            timestamp: new Date(),
            mode: 'audio',
            isStreaming: true,
          },
        ];
      });

      setStreamingMessageId(id);
      activeStreamIdRef.current = id;
      activeStreamTextRef.current = text;
      let pos = 0;
      const step = 3; // caractères par tick (~110 caractères/seconde)
      if (voiceStreamTimerRef.current) clearInterval(voiceStreamTimerRef.current);
      const durationMs = Math.max(120, (text.length / step) * 27);
      const timer = setInterval(() => {
        const next = Math.min(text.length, pos + step);
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, text: text.slice(0, next) } : m))
        );
        pos = next;
        if (pos >= text.length || next >= text.length) {
          clearInterval(timer);
          if (voiceStreamTimerRef.current === timer) voiceStreamTimerRef.current = null;
          if (activeStreamIdRef.current === id) {
            activeStreamIdRef.current = null;
            activeStreamTextRef.current = null;
          }
          setStreamingMessageId((curr) => (curr === id ? null : curr));
          setMessages((prev) =>
            prev.map((m) =>
              m.id === id ? { ...m, isStreaming: false, isComplete: true } : m
            )
          );
          scrollToBottom();
        }
      }, 27);
      voiceStreamTimerRef.current = timer;
      return durationMs;
    },
    [endVoiceProcessing, scrollToBottom]
  );

  useEffect(() => {
    scrollToBottom();
  }, [messages, isRecording, isProcessingVoice, scrollToBottom]);

  // Nettoie le timer de streaming si le composant est démonté
  useEffect(() => {
    return () => {
      if (voiceStreamTimerRef.current) clearInterval(voiceStreamTimerRef.current);
      retryTimersRef.current.forEach((t) => clearInterval(t));
      retryTimersRef.current = [];
      if (agentAudioElementRef.current) {
        try {
          agentAudioElementRef.current.srcObject = null;
          agentAudioElementRef.current.remove();
        } catch (e) {}
        agentAudioElementRef.current = null;
      }
    };
  }, []);

  // Connexion à LiveKit Cloud (une seule Room partagée pour toute la page)
  const ensureConnected = async () => {
    if (sharedRoomInstance && sharedRoomInstance.state === 'connected') {
      roomRef.current = sharedRoomInstance;
      setIsAgentReady(sharedRoomInstance.remoteParticipants.size > 0);
      return sharedRoomInstance;
    }

    if (sharedRoomPromise) {
      return sharedRoomPromise;
    }

    setIsConnecting(true);

    // Création UNIQUE partagée : tous les appelants reçoivent LA MÊME promesse
    // (une seule Room, une seule connexion, des écouteurs enregistrés une fois).
    sharedRoomPromise = (async () => {
      try {
      // 1. Demande de token sécurisé signé à Next.js
      const res = await fetch('/api/livekit-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: 'luli-tech-room',
          participantName: `client-${Date.now()}`,
        }),
      });

      if (!res.ok) {
        throw new Error(`Erreur HTTP: ${res.status}`);
      }

      const { token, url } = await res.json();

      // 2. Création et connexion de la Room LiveKit
      // adaptiveStream/dynacast désactivés (salon audio-only) : moins de
      // renégociations WebRTC → lecture plus stable, aucun "grattage" lié
      // aux sauts de qualité de flux.
      const room = new Room({
        adaptiveStream: false,
        dynacast: false,
      });

      const checkParticipants = () => {
        setIsAgentReady(room.remoteParticipants.size > 0);
      };

      room.on(RoomEvent.ParticipantConnected, (p) => {
        console.log('Participant connecté:', p.identity);
        checkParticipants();
      });

      room.on(RoomEvent.ParticipantDisconnected, (p) => {
        console.log('Participant déconnecté:', p.identity);
        checkParticipants();
      });

      // ------------------------------------------------------------------
      // PIPELINE AUDIO AGENT — piloté par les événements du backend
      // ------------------------------------------------------------------
      // Le backend signale via le canal de données : "agent_voice_start"
      // (la parole de l'agent commence) et "agent_voice_end" (elle se
      // termine). Bien plus fiable que les événements de track WebRTC
      // (la piste audio persiste entre les tours, aucun "ended" fiable).
      let captureGeneration = 0;

      // Force l'affichage COMPLET du texte en cours de "streaming" :
      // le texte doit être intégralement affiché dès que l'agent
      // s'arrête de parler.
      const completeStreamingNow = () => {
        if (voiceStreamTimerRef.current) {
          clearInterval(voiceStreamTimerRef.current);
          voiceStreamTimerRef.current = null;
        }
        const id = activeStreamIdRef.current;
        if (!id) return;
        const fullText = activeStreamTextRef.current || '';
        activeStreamIdRef.current = null;
        activeStreamTextRef.current = null;
        setStreamingMessageId((curr) => (curr === id ? null : curr));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, text: fullText, isStreaming: false, isComplete: true }
              : m
          )
        );
        scrollToBottom();
      };

      // Finalise la capture audio du tour courant : attache la note vocale
      // au message déjà révélé, ou révèle le texte s'il était en attente.
      const finalizeAgentAudio = () => {
        const audioBlob = new Blob(agentAudioChunksRef.current, { type: 'audio/webm' });
        const pending = pendingAgentMsgRef.current;

        if (audioBlob.size > 0) {
          const audioUrl = URL.createObjectURL(audioBlob);

          if (pending) {
            // Texte pas encore affiché (rare) : on révèle avec la note.
            pendingAgentMsgRef.current = null;
            if (voiceRevealTimerRef.current) {
              clearTimeout(voiceRevealTimerRef.current);
              voiceRevealTimerRef.current = null;
            }
            revealVoiceText(pending.id, pending.text, audioUrl);
            return;
          }

          const revealedId = lastVoiceMsgIdRef.current;
          if (revealedId) {
            // Le texte est déjà affiché → on rattache la note (réécoute).
            lastVoiceMsgIdRef.current = null;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === revealedId && !m.audioUrl ? { ...m, audioUrl } : m
              )
            );
            return;
          }

          // Ni texte révélé ni en attente (ex: salutation) : pas de note.
          URL.revokeObjectURL(audioUrl);
          return;
        }

        // Aucune donnée audio capturée : on révèle quand même le texte
        // en attente, pour ne jamais perdre une réponse.
        if (pending) {
          pendingAgentMsgRef.current = null;
          if (voiceRevealTimerRef.current) {
            clearTimeout(voiceRevealTimerRef.current);
            voiceRevealTimerRef.current = null;
          }
          revealVoiceText(pending.id, pending.text, null);
        }
      };

      // Déblocage autoplay : Chrome refuse la lecture audio avec du son si
      // l'utilisateur n'a encore RIEN cliqué sur la page (politique autoplay).
      // La salutation démarre dès l'ouverture du chat, donc avant le premier
      // geste → elle est coupée silencieusement. On réessaie donc de jouer le
      // flux de l'agent à chaque interaction (clic, touche, toucher, molette).
      // Dès le premier geste, le son se débloque pour toute la session.
      const tryResumeAgentAudio = () => {
        const el = agentAudioElementRef.current;
        if (!el || !el.srcObject) return;
        if (el.paused) {
          el.muted = false;
          el.volume = 1;
          el.play().catch(() => {
            // Toujours bloqué (pas encore de geste utilisateur) : on
            // retentera au prochain clic/touche.
          });
        }
      };

      // Démarrage d'un tour de parole de l'agent : capture propre + texte
      // révélé immédiatement (streaming en parallèle de la voix).
      const startAgentAudio = () => {
        const track = agentTrackRef.current;
        if (!track) return;
        agentSpeakingRef.current = true;
        setAgentSpeaking(true);

        // Relance la lecture du flux audio si elle avait été bloquée par
        // l'autoplay (l'utilisateur a déjà interagi → le son passe).
        tryResumeAgentAudio();

        // Capture précédente encore active ? (double start sans end) : on
        // l'arrête SANS finaliser (gen mismatch) — seule la note du tour
        // précédent est abandonnée, le texte affiché reste intact.
        const previousRec = agentMediaRecorderRef.current;
        if (previousRec && previousRec.state !== 'inactive') {
          captureGeneration += 1;
          previousRec.stop();
        }

        const gen = ++captureGeneration;
        agentAudioChunksRef.current = [];
        try {
          const mediaStream = new MediaStream([track.mediaStreamTrack]);
          const agentRec = new MediaRecorder(mediaStream);
          if (gen !== captureGeneration) return;
          agentMediaRecorderRef.current = agentRec;
          agentRec.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              agentAudioChunksRef.current.push(e.data);
            }
          };
          agentRec.onstop = () => {
            if (gen === captureGeneration) finalizeAgentAudio();
          };
          agentRec.start();
        } catch (e) {
          console.warn('Capture audio agent non disponible:', e);
        }

        // Révélation immédiate du texte déjà reçu (bulle qui apparaît dès
        // que la voix commence, streaming pendant la lecture).
        const pending = pendingAgentMsgRef.current;
        if (pending) {
          pendingAgentMsgRef.current = null;
          if (voiceRevealTimerRef.current) {
            clearTimeout(voiceRevealTimerRef.current);
            voiceRevealTimerRef.current = null;
          }
          revealVoiceText(pending.id, pending.text, null);
        }
      };

      // Fin de parole de l'agent : texte complet instantané + note vocale.
      const endAgentAudio = () => {
        agentSpeakingRef.current = false;
        setAgentSpeaking(false);

        // Le texte doit être COMPLET dès que l'agent s'arrête de parler.
        completeStreamingNow();

        const rec = agentMediaRecorderRef.current;
        if (rec && rec.state !== 'inactive') {
          rec.stop(); // -> onstop -> finalizeAgentAudio()
        } else {
          finalizeAgentAudio();
        }
      };

      // Écoute de l'audio de l'agent (Cas 2 - Voix)
      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind !== Track.Kind.Audio) return;

        // Élément <audio> UNIQUE réutilisé pour toute la session : évite
        // l'empilement d'éléments (cause de lecture dédoublée/grattage).
        let audioElement = agentAudioElementRef.current;
        if (!audioElement) {
          audioElement = document.createElement('audio');
          audioElement.autoplay = true;
          audioElement.style.display = 'none';
          document.body.appendChild(audioElement);
          agentAudioElementRef.current = audioElement;
        }
        try {
          audioElement.srcObject = new MediaStream([track.mediaStreamTrack]);
          audioElement.muted = false;
          audioElement.volume = 1;
          const playAttempt = audioElement.play();
          if (playAttempt) {
            playAttempt.catch((err) => {
              // Autoplay bloqué ? (Chrome refuse le son sans geste récent).
              // On garde le flux branché : dès le prochain clic/touche, la
              // relecture se fera via resumeOnGesture / tryResumeAgentAudio.
              if (err && err.name === 'NotAllowedError') {
                console.warn("[agent audio] autoplay bloqué (NotAllowedError) — relecture au prochain geste");
              }
            });
          }
        } catch (e) {
          console.warn('Lecture audio agent impossible:', e);
        }

        // Filet de sécurité : relances automatiques bornées (le flux audio
        // peut arriver une fraction de seconde avant que le lecteur soit
        // prêt, ou l'autorisation ne passer que légèrement plus tard).
        let retries = 0;
        const retryTimer = setInterval(() => {
          retries += 1;
          const el = agentAudioElementRef.current;
          if (retries > 20) {
            clearInterval(retryTimer);
            return;
          }
          if (!el || !el.srcObject || !el.paused) {
            clearInterval(retryTimer);
            return;
          }
          el.muted = false;
          el.volume = 1;
          el.play().catch(() => {});
        }, 400);
        retryTimersRef.current.push(retryTimer);

        // Déblocage autoplay : écouteurs PERSISTANTS — à CHAQUE geste
        // utilisateur (clic, touche, toucher, molette), on relance la lecture
        // du flux de l'agent s'il est en pause. Couvre tous les tours, y
        // compris la salutation si l'utilisateur interagit pendant la parole.
        const attachResumeListeners = () => {
          if (agentAudioElementRef.current !== audioElement) return;
          const resume = () => {
            try {
              const el = agentAudioElementRef.current;
              if (el && el.srcObject && el.paused) {
                el.muted = false;
                el.volume = 1;
                el.play().catch(() => {});
              }
            } catch (e) {}
          };
          const ensureAttached = () => {
            if (!resumeAttachedRef.current) {
              resumeAttachedRef.current = true;
              window.addEventListener('pointerdown', resume);
              window.addEventListener('keydown', resume);
              window.addEventListener('touchstart', resume);
              window.addEventListener('wheel', resume);
            }
          };
          ensureAttached();
        };
        attachResumeListeners();

        agentTrackRef.current = track;
        startAgentAudio();
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        try {
          track.detach();
        } catch (e) {}
        agentTrackRef.current = null;
        endAgentAudio();
      });

      // Écoute des données transmises par l'agent Python
      room.on(RoomEvent.DataReceived, (payload, participant) => {
        try {
          const str = new TextDecoder().decode(payload);
          const data = JSON.parse(str);

          // Cas 1 : Streaming texte LLM
          if (data.type === 'agent_text_chunk') {
            setMessages((prev) => {
              const existingIndex = prev.findIndex((m) => m.id === data.id);
              if (existingIndex !== -1) {
                const updated = [...prev];
                updated[existingIndex] = {
                  ...updated[existingIndex],
                  text: updated[existingIndex].text + (data.delta || ''),
                  isWaiting: false,
                };
                return updated;
              } else {
                return [
                  ...prev,
                  {
                    id: data.id,
                    sender: 'agent',
                    text: data.delta || '',
                    timestamp: new Date(),
                    mode: 'text',
                    isWaiting: false,
                  },
                ];
              }
            });
          } else if (data.type === 'agent_text_done') {
            setStreamingMessageId(null);
            setMessages((prev) => {
              const existingIndex = prev.findIndex((m) => m.id === data.id);
              if (existingIndex !== -1) {
                const updated = [...prev];
                updated[existingIndex] = {
                  ...updated[existingIndex],
                  text: data.fullText || updated[existingIndex].text,
                  isWaiting: false,
                  isComplete: true,
                };
                return updated;
              }
              // Cas extrême : aucun chunk reçu, le done crée la bulle
              return [
                ...prev,
                {
                  id: data.id,
                  sender: 'agent',
                  text: data.fullText || '',
                  timestamp: new Date(),
                  mode: 'text',
                  isWaiting: false,
                  isComplete: true,
                },
              ];
            });
          }
          // Cas 2 : Réponse vocale de l'agent. NOUVEAU FLUX — dès que l'audio
          // COMMENCE à être joué, la version TEXTE s'affiche immédiatement en
          // streaming, en parallèle de la voix. Plus besoin d'attendre la fin.
          else if (data.type === 'agent_voice_response') {
            const id = data.id || `agent-voice-${Date.now()}`;

            // Cas rare : l'audio était déjà terminé avant l'arrivée du texte
            // → on révèle immédiatement le texte avec l'audio en attente.
            if (pendingAudioRef.current) {
              const bufferedUrl = pendingAudioRef.current;
              pendingAudioRef.current = null;
              revealVoiceText(id, data.text, bufferedUrl);
              return;
            }

            // Si l'agent est EN TRAIN DE PARLER → on révèle le texte
            // immédiatement (la note audio sera attachée à la fin de la parole).
            if (agentSpeakingRef.current) {
              revealVoiceText(id, data.text || '', null);
              return;
            }

            // Sinon : mémoriser le texte, il sera révélé dès que l'audio
            // démarrera (ou via le délai de sécurité ci-dessous).
            pendingAgentMsgRef.current = { id, text: data.text || '' };

            // Sécurité : si l'audio ne démarre jamais (TTS en échec), on
            // affiche quand même la réponse texte après un délai borné.
            if (voiceRevealTimerRef.current) {
              clearTimeout(voiceRevealTimerRef.current);
            }
            voiceRevealTimerRef.current = setTimeout(() => {
              voiceRevealTimerRef.current = null;
              if (pendingAgentMsgRef.current && pendingAgentMsgRef.current.id === id) {
                const pending = pendingAgentMsgRef.current;
                pendingAgentMsgRef.current = null;
                revealVoiceText(pending.id, pending.text, null);
              }
            }, 30000);
          }
          // Début / fin RÉELLE de la parole de l'agent (annoncée par le
          // backend, fiable même quand la piste WebRTC persiste entre tours).
          else if (data.type === 'agent_voice_start') {
            startAgentAudio();
          } else if (data.type === 'agent_voice_end') {
            endAgentAudio();
          }
          // Transcription temps réel de la voix utilisateur
          else if (data.type === 'user_transcript') {
            // Choix utilisateur : la transcription de SA voix n'est PAS affichée.
            // L'agent l'utilise en interne ; rien n'est rendu dans l'interface.
            console.debug('[user_transcript]', data.text);
          }
        } catch (err) {
          console.error('Erreur de décodage des données LiveKit:', err);
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        setIsConnected(false);
        setIsAgentReady(false);
        if (sharedRoomInstance === room) {
          sharedRoomInstance = null;
          sharedRoomPromise = null;
        }
      });

      await room.connect(url, token);

      sharedRoomInstance = room;
      setIsConnected(true);
      setIsConnecting(false);
      setIsAgentReady(room.remoteParticipants.size > 0);

      // SALUTATION DÉBLOQUÉE : on annonce à l'agent que ce client est prêt.
      // L'agent ne salue qu'à la réception de `client_ready` — or cette
      // connexion suit le clic d'ouverture du chat (un geste utilisateur),
      // donc l'autoplay Chrome autorise la lecture → l'utilisateur ENTEND
      // enfin la salutation. L'agent ignore les doublons (dédup par identité).
      const sendClientReady = () => {
        if (clientReadySentRef.current) return;
        clientReadySentRef.current = true;
        room.localParticipant
          .publishData(
            new TextEncoder().encode(
              JSON.stringify({ type: 'client_ready', timestamp: Date.now() })
            ),
            { reliable: true }
          )
          .then(() => console.log('[client_ready] envoyé — salutation autorisée'))
          .catch((e) => {
            console.warn('[client_ready] publication impossible, nouvel essai au prochain geste:', e);
            clientReadySentRef.current = false;
          });
      };
      sendClientReady();

      // Filet de sécurité : si le `client_ready` de connexion a échoué ou si
      // la salutation est passée trop vite, on le renvoie au PREMIER geste
      // utilisateur suivant (clic/touche/toucher) — l'agent re-salue alors
      // (dédup par identité : un seul salut par participant).
      const gestureReady = () => {
        if (clientReadySentRef.current) return;
        sendClientReady();
      };
      window.addEventListener('pointerdown', gestureReady, { once: true });
      window.addEventListener('keydown', gestureReady, { once: true });
      window.addEventListener('touchstart', gestureReady, { once: true });
      window.addEventListener('wheel', gestureReady, { once: true });
      return room;
    } catch (error) {
      console.error('Erreur lors de la connexion LiveKit:', error);
      sharedRoomPromise = null;
      setIsConnecting(false);
      setIsConnected(false);
      setIsAgentReady(false);
      throw error;
    }
      })();

    // Tous les appelants partagent la même promesse de connexion
    try {
      const room = await sharedRoomPromise;
      roomRef.current = sharedRoomInstance;
      return room;
    } catch (e) {
      throw e;
    }
  };

  // Connexion proactive dès l'ouverture du chatbot
  useEffect(() => {
    if (isOpen) {
      ensureConnected().catch((err) => console.warn('Connexion initiale en arrière-plan:', err));
    }
  }, [isOpen]);

  // CAS 1 : Envoi de message texte pur
  const handleSendText = async (textToSend = null) => {
    const text = (textToSend || inputText).trim();
    if (!text) return;

    setInputText('');

    const messageId = `msg-${Date.now()}`;
    const agentMsgId = `agent-${messageId}`;

    setMessages((prev) => [
      ...prev,
      {
        id: messageId,
        sender: 'user',
        text: text,
        timestamp: new Date(),
        mode: 'text',
      },
    ]);

    setStreamingMessageId(agentMsgId);
    setMessages((prev) => [
      ...prev,
      {
        id: agentMsgId,
        sender: 'agent',
        text: '',
        timestamp: new Date(),
        mode: 'text',
        isWaiting: true,
      },
    ]);

    try {
      const room = await ensureConnected();

      let waitSeconds = 0;
      while (room.remoteParticipants.size === 0 && waitSeconds < 16) {
        await new Promise((res) => setTimeout(res, 500));
        waitSeconds++;
      }

      setIsAgentReady(room.remoteParticipants.size > 0);

      const payload = JSON.stringify({
        type: 'user_text_prompt',
        id: agentMsgId,
        text: text,
        timestamp: Date.now(),
      });

      await room.localParticipant.publishData(
        new TextEncoder().encode(payload),
        { reliable: true }
      );

      setTimeout(() => {
        setMessages((prev) => {
          const msg = prev.find((m) => m.id === agentMsgId);
          if (msg && msg.isWaiting && !msg.text) {
            return prev.map((m) =>
              m.id === agentMsgId
                ? {
                    ...m,
                    text: "Le modèle n'a pas répondu à temps. Veuillez réessayer.",
                    isWaiting: false,
                    isError: true,
                  }
                : m
            );
          }
          return prev;
        });
        setStreamingMessageId((curr) => (curr === agentMsgId ? null : curr));
      }, 35000);
    } catch (err) {
      console.error("Échec de l'envoi du message texte:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === agentMsgId
            ? {
                ...m,
                text: "Désolé, l'agent prend plus de temps que prévu. Vérifiez que l'agent tourne dans le terminal et réessayez.",
                isWaiting: false,
                isError: true,
              }
            : m
        )
      );
      setStreamingMessageId(null);
    }
  };

  // CAS 2 : Début de l'enregistrement audio
  const handleStartRecording = async () => {
    try {
      setIsConnecting(true);

      const room = await ensureConnected();

      // Signale à l'agent qui s'exprime pour rebrancher son écoute micro
      // (empêche de rester lié à un participant "fantôme" du salon)
      room.localParticipant
        .publishData(
          new TextEncoder().encode(
            JSON.stringify({ type: 'user_audio_started', timestamp: Date.now() })
          ),
          { reliable: true }
        )
        .catch(() => {});

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtx();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      recordedChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.start(100);

      const audioTrack = stream.getAudioTracks()[0];
      // source Microphone OBLIGATOIRE : l'agent rejette les tracks sans source
      // (SOURCE_UNKNOWN) et n'écoute que les flux SOURCE_MICROPHONE.
      const published = await room.localParticipant.publishTrack(audioTrack, {
        name: 'user-microphone',
        source: Track.Source.Microphone,
      });
      publishedTrackRef.current = published;

      setIsRecording(true);
      setIsConnecting(false);
      setRecordingDuration(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error("Erreur lors de l'activation du microphone:", error);
      setIsConnecting(false);
      setIsRecording(false);
      // Message différencié : refus utilisateur (NotAllowedError) vs autre échec (périphérique absent, contexte non sécurisé...)
      const name = error && error.name;
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        // SOLUTION INFAILLIBLE : Chrome a MÉMORISÉ le refus pour cet
        // origin (http://localhost:3000) — la demande ne réapparaîtra pas.
        // L'ouvrir sur http://127.0.0.1:3000 = UN AUTRE origin → Chrome
        // redemande la permission → on clique sur Autoriser. Ça marche
        // sans toucher aux réglages de Chrome. Autre option : réinitialiser
        // dans les réglages (🔒 / Micro barré → Autorisations du site).
        alert(
          "🎤 Micro bloqué par Chrome (refus mémorisé pour localhost).\n\n" +
          "MÉTHODE 1 (rapide, sans réglages) :\n" +
          "→ remplacez \"localhost\" par \"127.0.0.1\" dans la barre d'adresse — " +
          "Chrome considère que c'est un autre site, il redemandera la permission.\n" +
          "   url : http://127.0.0.1:3000\n" +
          "→ cliquez sur « Autoriser » quand le navigateur demande l'accès au micro.\n\n" +
          "MÉTHODE 2 (réinitialiser) :\n" +
          "→ cliquez sur l'icône 🔒 (ou le micro barré) à gauche de l'adresse → " +
          "« Autorisations du site » → Micro → « Autoriser » → rechargez la page (F5)."
        );
      } else {
        alert(
          "Impossible d'accéder au microphone. Vérifiez qu'un microphone est branché et que la page est ouverte sur http://localhost:3000 (HTTPS ou localhost requis par le navigateur)."
        );
      }
    }
  };

  // CAS 2 : Fin de l'enregistrement audio
  const handleStopRecording = () => {
    if (!isRecording) return;

    setIsRecording(false);

    // Animation "audio en cours de traitement" : visible dès le relâchement
    // du micro jusqu'à l'arrivée de la réponse de l'agent.
    setIsProcessingVoice(true);
    if (processingTimerRef.current) {
      clearTimeout(processingTimerRef.current);
    }
    // Sécurité : retire l'animation au bout de 8 min même sans réponse
    // (le modèle gratuit OpenRouter peut mettre 2 à 7 min avant le 1er token).
    processingTimerRef.current = setTimeout(() => {
      setIsProcessingVoice(false);
      processingTimerRef.current = null;
    }, 480000);

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }

    const duration = recordingDuration;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(recordedChunksRef.current, { type: 'audio/webm' });
        if (audioBlob.size === 0) return;
        const userAudioUrl = URL.createObjectURL(audioBlob);

        setMessages((prev) => [
          ...prev,
          {
            id: `user-audio-${Date.now()}`,
            sender: 'user',
            audioUrl: userAudioUrl,
            duration: duration,
            timestamp: new Date(),
            mode: 'audio',
          },
        ]);
      };
      mediaRecorderRef.current.stop();
    }

    if (publishedTrackRef.current && roomRef.current) {
      roomRef.current.localParticipant.unpublishTrack(publishedTrackRef.current.track);
      publishedTrackRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (roomRef.current && roomRef.current.state === 'connected') {
      const payload = JSON.stringify({
        type: 'user_audio_completed',
        duration: duration,
        timestamp: Date.now(),
      });
      roomRef.current.localParticipant.publishData(
        new TextEncoder().encode(payload),
        { reliable: true }
      );
    }
  };

  const quickQuestions = [
    "Quels sont vos 5 services officiels ?",
    "Qui est Jacob De Dieu AGOSSEVI ?",
    "Que signifie le logo du nœud ?",
    "Comment contacter la direction ?",
  ];

  return (
    <>
      {/* BOUTON FLOTTANT DU ROBOT */}
      {!isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 bg-slate-900/90 text-white text-xs font-medium py-2 px-3.5 rounded-full border border-blue-500/30 shadow-2xl backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span>Assistant IA Vocal & Texte LULI-TECH</span>
          </div>

          <button
            onClick={() => {
              setIsOpen(true);
              ensureConnected().catch(() => {});
            }}
            aria-label="Ouvrir le chatbot LULI-TECH"
            className="group relative w-16 h-16 rounded-full bg-gradient-to-tr from-blue-600 via-indigo-600 to-purple-600 p-[2px] shadow-[0_0_35px_rgba(79,70,229,0.5)] hover:shadow-[0_0_45px_rgba(79,70,229,0.8)] transition-all duration-300 hover:scale-110 active:scale-95"
          >
            <div className="w-full h-full bg-slate-950 rounded-full flex items-center justify-center transition-colors group-hover:bg-slate-900">
              {/* Icône Robot */}
              <svg className="w-8 h-8 text-cyan-400 group-hover:text-cyan-300 transition-transform group-hover:rotate-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="10" rx="3" />
                <circle cx="12" cy="5" r="2" />
                <path d="M12 7v4" />
                <line x1="8" y1="15" x2="8.01" y2="15" strokeWidth="3" strokeLinecap="round" />
                <line x1="16" y1="15" x2="16.01" y2="15" strokeWidth="3" strokeLinecap="round" />
                <path d="M9 18h6" strokeLinecap="round" />
                <path d="M2 14h1M21 14h1" strokeLinecap="round" />
              </svg>
            </div>
            <span className={`absolute top-0 right-0 w-4 h-4 border-2 border-slate-900 rounded-full ${
              isConnected ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
            }`}></span>
          </button>
        </div>
      )}

      {/* FENÊTRE DU CHATBOT */}
      {isOpen && (
        <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 w-[calc(100vw-2rem)] sm:w-[420px] h-[640px] max-h-[90vh] bg-slate-950/95 border border-slate-800/80 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] flex flex-col z-50 overflow-hidden backdrop-blur-2xl">
          
          {/* HEADER */}
          <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 text-white p-4 flex items-center justify-between shadow-lg relative">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-11 h-11 bg-slate-900/80 border border-white/20 rounded-2xl flex items-center justify-center shadow-inner">
                  <svg className="w-6 h-6 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="10" rx="3" />
                    <circle cx="12" cy="5" r="2" />
                    <path d="M12 7v4" />
                    <line x1="8" y1="15" x2="8.01" y2="15" strokeWidth="3" strokeLinecap="round" />
                    <line x1="16" y1="15" x2="16.01" y2="15" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${
                  isAgentReady 
                    ? 'bg-emerald-400' 
                    : isConnected 
                    ? 'bg-blue-400 animate-pulse' 
                    : isConnecting 
                    ? 'bg-amber-400 animate-ping' 
                    : 'bg-slate-500'
                }`}></span>
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm tracking-wide text-white">LULI-TECH Assistant</h3>
                  <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-mono">
                    LIVEKIT
                  </span>
                </div>
                <p className="text-xs text-blue-200">
                  {agentSpeaking 
                    ? "L'agent vous parle..." 
                    : isAgentReady 
                    ? "Agent en ligne (Vocal & Texte)" 
                    : isConnected 
                    ? "Synchronisation de l'agent..." 
                    : isConnecting 
                    ? "Connexion au salon..." 
                    : "Prêt"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setIsOpen(false)}
                aria-label="Fermer le chatbot"
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* BANDEAU STATUT */}
          <div className="bg-slate-900/90 border-b border-slate-800/80 px-4 py-1.5 flex items-center justify-between text-[11px] text-slate-400">
            <span className="flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isAgentReady ? 'bg-emerald-400' : isConnected ? 'bg-blue-400 animate-ping' : 'bg-amber-400'}`}></span>
              Salon : <span className="text-slate-300 font-mono">luli-tech-room</span>
            </span>
            <span className="text-slate-400">
              Modèle : <span className="text-cyan-400 font-mono">Groq qwen3.8-27b</span>
            </span>
          </div>

          {/* ZONE DE MESSAGES */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/70">
            {messages.length === 0 && (
              <div className="text-center py-6 px-3">
                <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-tr from-blue-600/30 to-purple-600/30 rounded-3xl border border-blue-500/20 flex items-center justify-center text-cyan-400 shadow-xl">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h4 className="text-white font-semibold text-base mb-1">Bienvenue chez LULI-TECH</h4>
                <p className="text-slate-400 text-xs leading-relaxed max-w-xs mx-auto mb-5">
                  Posez vos questions par écrit ou parlez-moi directement avec le micro. Je réponds en texte ou en audio.
                </p>

                <div className="flex flex-col gap-2 max-w-xs mx-auto text-left">
                  <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold">
                    Suggestions rapides :
                  </span>
                  {quickQuestions.map((q, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSendText(q)}
                      className="text-xs text-left bg-slate-900/80 hover:bg-slate-850 hover:border-cyan-500/40 text-slate-300 p-2.5 rounded-xl border border-slate-800 transition-all hover:translate-x-1"
                    >
                      💬 {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, index) => (
              <div
                key={msg.id || index}
                className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl p-3.5 space-y-2 shadow-md ${
                    msg.sender === 'user'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-br-sm'
                      : 'bg-slate-900/95 text-slate-100 border border-slate-800/90 rounded-bl-sm'
                  }`}
                >
                  {msg.isWaiting && !msg.text && (
                    <div className="flex items-center gap-2 py-1 text-slate-400 text-xs">
                      <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
                      <span>L'assistant LULI-TECH réfléchit...</span>
                    </div>
                  )}

                  {/* Texte AU-DESSUS de l'audio (Cas 2) */}
                  {msg.text && (
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">
                      {msg.text}
                      {streamingMessageId === msg.id && msg.sender === 'agent' && (
                        <span className="inline-block w-2 h-4 ml-1 bg-cyan-400 animate-pulse"></span>
                      )}
                    </div>
                  )}

                  {msg.audioUrl && (
                    <div className="mt-1">
                      <AudioMessage
                        audioUrl={msg.audioUrl}
                        isAgent={msg.sender === 'agent'}
                        duration={msg.duration}
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-1 text-[10px] text-white/50 pt-0.5">
                    <span>
                      {new Date(msg.timestamp).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {msg.sender === 'user' && (
                      <span className="text-cyan-300">✓✓</span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isProcessingVoice && (
              <div className="flex flex-col items-start">
                <div className="max-w-[88%] rounded-2xl p-3.5 shadow-md bg-slate-900/95 text-slate-100 border border-slate-800/90 rounded-bl-sm">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce"></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </span>
                    {/* Pendant l'audio de l'agent, la bulle annonce qu'il parle ;
                        à la fin de l'audio, la bulle disparaît pour laisser place
                        à la version texte de la réponse. */}
                    <span>{agentSpeaking ? "L'agent IA parle..." : "Traitement de votre audio..."}</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* VISUALISEUR DE FRÉQUENCE EN TEMPS RÉEL */}
          {isRecording && (
            <div className="p-3 bg-slate-950 border-t border-slate-800">
              <FrequencyVisualizer
                analyserNode={analyserRef.current}
                isRecording={isRecording}
                duration={recordingDuration}
              />
            </div>
          )}

          {/* ZONE DE SAISIE */}
          <div className="p-3 bg-slate-900/95 border-t border-slate-800/90 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendText();
                  }
                }}
                disabled={isRecording || isConnecting}
                placeholder={isRecording ? "Enregistrement vocal en direct..." : "Écrivez votre question..."}
                className="flex-1 bg-slate-950/90 border border-slate-800 text-white placeholder-slate-500 text-sm px-4 py-3 rounded-2xl focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/40 transition-all disabled:opacity-50"
              />

              <button
                onClick={isRecording ? handleStopRecording : handleStartRecording}
                disabled={isConnecting}
                title={isRecording ? "Arrêter et envoyer l'audio" : "Enregistrer un message vocal"}
                className={`relative w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-200 active:scale-95 ${
                  isRecording
                    ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.6)] animate-pulse'
                    : 'bg-slate-800 hover:bg-slate-750 text-cyan-400 border border-slate-700/80 hover:border-cyan-500/50 shadow-md'
                }`}
              >
                {isRecording ? (
                  <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                )}
              </button>

              <button
                onClick={() => handleSendText()}
                disabled={!inputText.trim() || isRecording || isConnecting}
                aria-label="Envoyer le message texte"
                className="w-12 h-12 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white flex items-center justify-center shrink-0 transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
              >
                <svg className="w-5 h-5 translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
              <span>Texte : LLM Groq qwen3.8-27b</span>
              <span>Voix : STT Groq Whisper + TTS Edge</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}