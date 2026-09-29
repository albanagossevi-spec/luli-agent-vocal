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

# Ouvrir la porte de communication du conteneur
EXPOSE 7860

# Lancer le client WebRTC ET forcer le mini-serveur de santé sur le port 7860
CMD ["python", "agent.py", "start", "--port", "7860"]
