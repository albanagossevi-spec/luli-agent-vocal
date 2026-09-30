FROM python:3.12-slim

# Outils Linux indispensables pour la voix et l'audio de LiveKit
RUN apt-get update && apt-get install -y \
    build-essential \
    ffmpeg \
    libmediainfo-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copier et installer vos paquets Python exacts
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copier tout le code de l'agent dans le conteneur cloud
COPY . .

# Ouvrir la porte de communication du contene
# ... (le reste du Dockerfile ne bouge pas) ...

# Dire à Docker qu'on ouvre le port par défaut de Render
EXPOSE 10000

# Lancer l'agent en lui injectant le port via la variable officielle de LiveKit
CMD ["sh", "-c", "LIVEKIT_HEALTH_CHECK_PORT=10000 python agent.py start"]


