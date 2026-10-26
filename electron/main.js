/**
 * main.js — Ponto de entrada do processo principal (barrel de efeitos).
 *
 * A implementação vive em ./main/:
 *  - env.js          → paths de produção e WHISPER_MODEL_DIR
 *  - window.js       → criação/endurecimento da BrowserWindow
 *  - broadcast.js    → envio de eventos para as janelas
 *  - ipc-registry.js → registro dos handlers IPC por domínio
 *  - bootstrap.js    → inicialização de serviços, janela e notificações
 *  - index.js        → ciclo de vida da aplicação
 */

import './main/index.js';
