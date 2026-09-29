# LULI-TECH - Site Vitrine & Agent IA Vocal / Textuel (LiveKit & Next.js)

Bienvenue sur le projet officiel de **LULI-TECH**, entreprise technologique spécialisée en ingénierie logicielle et ingénierie en IA pour le développement de produits intelligents.

Ce projet intègre un site vitrine haut de gamme et un chatbot multimodal intelligent connecté en temps réel via **LiveKit Cloud** à un agent IA local Python.

---

## 🏛️ Identité & Équipe LULI-TECH

- **Nom** : LULI-TECH
- **Slogan** : *"Innovons aujourd'hui avec les solutions de demain."*
- **Signification du Logo** : Symbole du "nœud" (trois points reliés), représentant l'alliance entre le **Coworking**, le **Digital** et l'**Entrepreneuriat**.
- **Email** : `LULI-TECH@gmail.com`
- **Localisation** : Calavi, Bénin
- **Site Officiel** : [https://LULI-TECH.netlify.app/](https://LULI-TECH.netlify.app/)

### Équipe Dirigeante
- **ASSOUMA Mouhamed Said** : Directeur Général | Réseau, Mobilité et Sécurité (RMS) | `00229 01 62 36 73 78`
- **BATCHO Rychie Emmanuel** : Responsable Communication & Designer | CDM & RMS | `00229 01 51 59 49 33`
- **ALIDOU Moushine Famale** : Responsable Administratif & Financier & Designer | RMS | `00229 01 59 09 39 29`
- **AGOSSEVI Jacob De Dieu** : Directeur Technique & Développeur Web | Réseau et Génie Logiciel (RGL) | `00229 01 41 67 83 10`

---

## ⚙️ Architecture & Fonctionnement des 2 Cas

### 🟢 Cas 1 : Interaction Texte (Prompt écrit)
1. Le client tape son prompt et valide.
2. Le navigateur demande un token sécurisé et signé à Next.js (`/api/livekit-token`).
3. Next.js signe et renvoie le token JWT.
4. Le navigateur se connecte au salon LiveKit Cloud (`agent-vocal-xr9dldnu.livekit.cloud`) et transmet le prompt via le canal de données (DataChannel).
5. **STT et TTS sont complètement contournés** (pas de consommation vocale inutile, latence minimale).
6. L'agent Python local interroge le LLM (`nvidia/nemotron-3.5-lightning:free`) avec le prompt système officiel LULI-TECH.
7. L'agent diffuse les fragments de texte en temps réel (**streaming activé**).
8. La bulle de discussion du chatbot s'anime instantanément en streaming sous les yeux du client.

### 🎙️ Cas 2 : Interaction Vocale (Message audio)
1. Dès que le client clique sur le micro, le navigateur demande le token sécurisé et signé à Next.js (`/api/livekit-token`) et s'authentifie auprès du salon LiveKit WebRTC.
2. **Visualiseur de fréquence en temps réel** : La Web Audio API (`AnalyserNode`) capte les fréquences de la parole du client et anime un spectre dynamique garantissant au client que son audio est enregistré et transmis en direct.
3. Dès que l'enregistrement se termine, l'audio du client apparaît sous forme de **bulle audio style WhatsApp** (avec onde sonore interactive, bouton play/pause, chrono et réécoute).
4. Le flux audio transmis via WebRTC arrive à l'agent local :
   - Le modèle **STT** (`whisper-large-v3-turbo` via Groq) transcrit la parole en texte.
   - Le texte transcrit et le prompt système sont envoyés au **LLM** (`nvidia/nemotron-3.5-lightning:free` via OpenRouter).
   - Le LLM répond et une copie est envoyée au **TTS** (`s2.1-pro` via Fish Audio). Si Fish Audio est indisponible (crédit insuffisant), un **fallback gratuit Edge TTS** prend automatiquement le relais — la voix fonctionne dans tous les cas.
   - L'audio synthétisé est diffusé dans le salon WebRTC.
   - La version textuelle est envoyée via le canal de données.
5. Dans le chatbot côté client :
   - **La version texte de la réponse apparaît AU-DESSUS du lecteur audio**.
   - Le lecteur audio se présente **exactement comme dans WhatsApp**, permettant au client de réécouter la voix de l'agent ou la sienne à volonté.

---

## 🚀 Guide de Démarrage Rapide

### 1. Démarrer l'Agent IA Local (Python)

Dans un premier terminal PowerShell :

```powershell
cd "agent-ia-vocal"
.\.venv\Scripts\activate
python agent.py dev
```

> L'agent se connecte automatiquement au salon LiveKit Cloud (`wss://agent-vocal-xr9dldnu.livekit.cloud`) et s'enregistre comme worker prêt à traiter les flux WebRTC et messages data.

### 2. Démarrer le Frontend & Backend Web (Next.js)

Dans un second terminal PowerShell :

```powershell
cd "frontend-backendweb-next.js"
npm run dev
```

> Ouvrez votre navigateur sur **`http://localhost:3000`**.

---

## 📁 Structure du Projet

```
luli-agent-vocal/
├── agent-ia-vocal/                  # Agent IA Python local
│   ├── agent.py                     # Worker LiveKit (Cas 1 texte & Cas 2 voix)
│   ├── requirements.txt             # Dépendances Python testées
│   └── .env                         # Clés & Modèles configurés
│
├── frontend-backendweb-next.js/     # Application web Next.js
│   ├── .env.local                   # Clés LiveKit Next.js
│   └── src/
│       ├── app/
│       │   ├── api/livekit-token/   # Route Next.js de signature JWT
│       │   ├── page.js              # Site vitrine LULI-TECH avec logo nœud
│       │   └── layout.js            # Layout racine
│       └── components/
│           ├── Chatbot.js           # Chatbot interactif & bouton robot flottant
│           ├── AudioMessage.js      # Lecteur note vocale style WhatsApp
│           └── FrequencyVisualizer.js # Visualiseur temps réel des fréquences
└── README.md
```

---

## 🔒 Modèles & Clés Utilisés

- **STT** : `whisper-large-v3-turbo` (Groq)
- **LLM** : `nvidia/nemotron-3.5-lightning:free` (OpenRouter API)
- **TTS** : `s2.1-pro` (Fish Audio) + **fallback automatique Edge TTS** (aucune clé requise)
- **Salon WebRTC** : `wss://agent-vocal-xr9dldnu.livekit.cloud`

> 💡 La route `/api/livekit-token` crée automatiquement le salon et le dispatch d'agent à chaque connexion : l'agent Python rejoint le chat sans configuration manuelle.
