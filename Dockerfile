# Multi-platform: suporta ARM (Apple Silicon, Raspberry Pi) e Intel/AMD
# Build: docker buildx build --platform linux/amd64,linux/arm64 -t streamgrab-cli:local .
FROM node:20-bookworm-slim

# Arquitetura do host (para compilação otimizada)
ARG TARGETPLATFORM
ARG TARGETARCH

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates ffmpeg python3 curl unzip git cmake build-essential \
  && ln -sf /usr/bin/python3 /usr/local/bin/python \
  && rm -rf /var/lib/apt/lists/*

# Compilar whisper.cpp a partir do código fonte (otimizado para a arquitetura)
# whisper.cpp v1.9.4+ usa whisper-cli em vez de main
RUN mkdir -p /opt/whisper.cpp/build \
  && git clone --depth 1 --recursive https://github.com/ggerganov/whisper.cpp.git /opt/whisper.cpp/source \
  && cd /opt/whisper.cpp/build \
  && cmake -DWHISPER_BUILD_TESTS=OFF -DWHISPER_BUILD_SERVER=OFF ../source \
  && cmake --build . --target whisper-cli -j$(nproc) \
  && cp whisper-cli /opt/whisper.cpp/ \
  && chmod +x /opt/whisper.cpp/whisper-cli \
  && rm -rf /opt/whisper.cpp/source /opt/whisper.cpp/build

# Baixar modelo GGML small (~244 MB)
RUN mkdir -p /opt/whisper.cpp/models \
  && curl -L -o /opt/whisper.cpp/models/ggml-small.bin \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"

WORKDIR /app

COPY package*.json ./
COPY scripts ./scripts
RUN FFMPEG_SKIP_DOWNLOAD=1 WHISPER_SKIP_DOWNLOAD=1 npm ci --omit=dev

COPY . .

RUN mkdir -p /downloads

ENV STREAMGRAB_DOWNLOAD_DIR=/downloads
ENV WHISPER_CPP_PATH=/opt/whisper.cpp/whisper-cli
ENV WHISPER_MODEL_DIR=/opt/whisper.cpp/models

ENTRYPOINT ["node", "bin/streamgrab.mjs"]
