# Guide de Configuration

## ✅ État de la configuration

Les clés API sont **déjà en place** et le projet a été testé de bout en bout :

- `agent-ia-vocal/.env` → clés de l'agent Python (LiveKit, Groq, OpenRouter, Fish Audio, modèles).
- `frontend-backendweb-next.js/.env.local` → clés LiveKit pour le serveur Next.js.

> ⚠️ Ne modifiez/ne partagez jamais ces fichiers. Ils sont ignorés par Git.

## 📌 Variables requises

### Agent Python — `agent-ia-vocal/.env`

```env
LIVEKIT_URL=wss://agent-vocal-xr9dldnu.livekit.cloud
LIVEKIT_API_KEY=*** (déjà renseigné)
LIVEKIT_API_SECRET=*** (déjà renseigné)
GROQ_API_KEY=*** (déjà renseigné)        # STT Whisper
OPENROUTER_API_KEY=*** (déjà renseigné)  # LLM
FISH_AUDIO_API_KEY=*** (déjà renseigné)  # TTS principal (crédit requis)

STT_MODEL=whisper-large-v3-turbo
LLM_MODEL=nvidia/nemotron-3.5-lightning:free
TTS_MODEL=s2.1-pro-free
```

### Frontend — `frontend-backendweb-next.js/.env.local`

```env
LIVEKIT_URL=wss://agent-vocal-xr9dldnu.livekit.cloud
LIVEKIT_API_KEY=***
LIVEKIT_API_SECRET=***
```

## 🚀 Démarrage

### Agent Python
```bash
cd agent-ia-vocal
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python agent.py dev
```

### Frontend Next.js
```bash
cd frontend-backendweb-next.js
npm install
npm run dev
```

Ouvrez `http://localhost:3000` (si occupé, `npm run dev -- -p 3001`).

## 🎙️ TTS : Fish Audio + secours automatique Edge

- **TTS principal** : Fish Audio `s2.1-pro` (via `livekit-plugins-fishaudio`), comme spécifié.
- **Secours automatique** : si l'API Fish Audio renvoie une erreur (ex : **crédit insuffisant**, HTTP 402), le worker bascule automatiquement sur **Edge TTS (Microsoft)** — une voix française naturelle qui ne nécessite **aucune clé ni crédit**.
- Le texte de la réponse est **toujours** transmis au client (bulle WhatsApp), que l'audio soit produit ou non.

➡️ Conséquence : la voix fonctionne **dès aujourd'hui**, même sans crédit Fish Audio. Pour utiliser exclusivement la voix Fish Audio, ajoutez des crédits sur [fish.audio/app/developers](https://fish.audio/app/developers).

## 🤖 Connexion automatique de l'agent

La route `/api/livekit-token` ne se contente pas de signer le JWT : elle **crée automatiquement le salon LiveKit et le dispatch d'agent** s'ils n'existent pas encore. Dès que le client ouvre le chat, l'agent Python rejoint le salon tout seul.

## 🔍 Modèles utilisés

| Rôle | Modèle | Fournisseur |
|------|--------|-------------|
| STT | `whisper-large-v3-turbo` | Groq |
| LLM | `nvidia/nemotron-3.5-lightning:free` | OpenRouter |
| TTS | `s2.1-pro` (+ fallback Edge TTS) | Fish Audio / Microsoft Edge |

## ⏱️ Latence LLM (important)

Le modèle gratuit OpenRouter peut prendre **30 à 40 secondes avant le premier token** (file d'attente du plan gratuit). L'agent applique donc un **timeout de 120 secondes** et diffuse la réponse **par lots (~150 ms)** dès que les premiers tokens arrivent — le streaming reste fluide côté interface.

## 🆘 Problèmes courants

- **"Invalid API Key"** → clé copiée avec des espaces ou mauvais service ; vérifiez `.env`.
- **"Connection refused"** → vérifiez l'URL LiveKit et l'état du compte LiveKit Cloud.
- **Pas d'audio agent** → vérifiez les logs du worker ; le fallback Edge TTS prend le relais automatiquement.
- **"Quota exceeded" / 402 (TTS)** → crédits Fish Audio épuisés : la voix Edge de secours prend le relais.