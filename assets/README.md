# Assets

Pasta para imagens e GIFs usados no README.

## Como adicionar seus GIFs

### 1. Grave a tela

| Sistema | Ferramenta recomendada |
|---------|----------------------|
| macOS | [Kap](https://getkap.co) (gratuito) |
| Windows | [ScreenToGif](https://screentogif.com) (gratuito) |
| Linux | [Peek](https://github.com/phw/peek) (gratuito) |

### 2. Configurações ideais para GIF

- **Frame rate:** 10 FPS
- **Largura máxima:** 800px
- **Duração:** 10-15 segundos por GIF
- **Tamanho:** < 2MB por arquivo

### 3. Converter vídeo para GIF (usando ffmpeg)

```bash
ffmpeg -i gravacao.mp4 -vf "fps=10,scale=800:-1:flags=lanczos" -c:v gif saida.gif
```

### 4. Coloque os arquivos aqui

Nomeie seguindo o padrão usado no README:
- `analise-url.gif` — demonstração da análise de URL
- `download-video.gif` — demonstração do download
- `electron-app.gif` — interface gráfica do Electron

## Arquivos atuais

| Arquivo | Descrição |
|---------|-----------|
| (adicione seus GIFs aqui) | |
