# CHAOS RACE 🏁⚡

Corrida 2D lateral **multiplayer real** (2 a 8 jogadores) com física determinística, servidor autoritativo, habilidades, eventos caóticos, 5 pistas com identidade própria, progressão local e áudio procedural.

> **Resumo honesto:** o jogo está implementado de ponta a ponta e foi testado com clientes reais falando com o servidor (salas, partida, reconexão, resultado, revanche). O backend roda no plano gratuito do Render, que **suspende a instância depois de ~15 minutos sem acesso** — a primeira conexão do dia pode levar de 30 a 50 segundos. Isso é limitação do plano gratuito, não do jogo.

---

## Sumário

1. [Jogar agora](#1-jogar-agora)
2. [Rodar na sua máquina](#2-rodar-na-sua-máquina)
3. [Controles](#3-controles)
4. [Modos de jogo](#4-modos-de-jogo)
5. [Pistas](#5-pistas)
6. [Habilidades](#6-habilidades)
7. [Eventos caóticos](#7-eventos-caóticos)
8. [Personagens, skins e progressão](#8-personagens-skins-e-progressão)
9. [Áudio](#9-áudio)
10. [Arquitetura](#10-arquitetura)
11. [Servidor autoritativo e protocolo](#11-servidor-autoritativo-e-protocolo)
12. [Segurança](#12-segurança)
13. [Desempenho](#13-desempenho)
14. [Testes](#14-testes)
15. [Deploy passo a passo](#15-deploy-passo-a-passo)
16. [Adicionar uma pista nova](#16-adicionar-uma-pista-nova)
17. [Solução de problemas](#17-solução-de-problemas)
18. [Limitações conhecidas](#18-limitações-conhecidas)

---

## 1. Jogar agora

| O quê | Onde |
| --- | --- |
| Jogo (frontend) | `https://SEU-USUARIO.github.io/chaos-race/` |
| Servidor (API + Socket.IO) | `https://chaos-race-server.onrender.com` |
| Verificação do servidor | `https://chaos-race-server.onrender.com/health` |

Os dois endereços só existem depois que você faz o deploy (seção 15). Até lá, rode localmente.

**Para jogar com outra pessoa:** abra o jogo, escolha **Jogar → Criar sala**, copie o código de 5 caracteres (ex.: `K7QW2`) e mande para o amigo. Ele abre o jogo, escolhe **Jogar → Entrar com código** e cola. Ou use **Jogar → Fila rápida** para cair numa sala pública.

---

## 2. Rodar na sua máquina

**Requisitos:** Node.js **20 ou superior** e npm.

```bash
git clone https://github.com/SEU-USUARIO/chaos-race.git
cd chaos-race

npm install                 # dependências dos testes (raiz)
npm run install:all         # backend + frontend
npm run dev                 # sobe os dois servidores
```

Depois abra **http://localhost:5173**.

- O Vite (5173) faz proxy de `/socket.io`, `/api` e `/health` para o backend em `http://127.0.0.1:3001` — por isso o frontend e a rede compartilham a mesma origem, sem CORS no dia a dia.
- Para abrir duas instâncias na mesma máquina, use uma janela anônima ou outro navegador (o progresso fica no `localStorage`).

Comandos úteis:

| Comando | O que faz |
| --- | --- |
| `npm run dev` | backend (3001) + frontend (5173) |
| `npm run dev:backend` | só o servidor |
| `npm run dev:frontend` | só o frontend |
| `npm run build` | build de produção em `frontend/dist` |
| `npm run start` | servidor em modo produção |
| `npm test` | testes de regras + interface + pistas |
| `npm run test:e2e` | integração real com 3 clientes Socket.IO |
| `npm run test:tracks` | simulador de jogabilidade das pistas |

Variáveis de ambiente: copie `.env.example` para `.env` (backend) e `frontend/.env.example` para `frontend/.env.local` (frontend). Nenhuma credencial é necessária.

---

## 3. Controles

| Ação | Teclado | Toque |
| --- | --- | --- |
| Correr para a esquerda / direita | `A` `D` ou `←` `→` | zona esquerda/direita da tela |
| Pular (segure para pular mais alto) | `W`, `↑` ou `Espaço` | botão **Pular** |
| Agachar / deslizar | `S` ou `↓` | botão **Deslizar** |
| Habilidade | `E`, `Shift` ou `Enter` | botão circular |
| Emotes | `1` … `6` | menu do HUD |
| Pausa / opções | `Esc` / `P` | botão de pausa |
| Mudo | `M` | botão de alto-falante |
| Tela cheia | `F` | — |

O pulo tem *coyote time* (0,1 s) e *jump buffer* (0,13 s), então ele responde mesmo com o timing um pouco errado.

---

## 4. Modos de jogo

| Modo | Como funciona |
| --- | --- |
| **Corrida Clássica** | 1 volta pela pista; vence quem cruzar a linha primeiro. Quedas custam tempo (volta ao checkpoint). |
| **Eliminação** | A cada 22 s, o último colocado é eliminado. Sobrevive quem sobrar. |
| **Sobrevivência** | Cada jogador tem 3 vidas. Perder todas = fora. Ganha o último de pé. |
| **Contra o Tempo** | Solo (1 jogador), foco em recorde pessoal e fantasma da sua melhor volta. |

O servidor decide modo, pista, início, fim e resultado. O cliente nunca declara vitória.

---

## 5. Pistas

| Pista | Identidade | Obstáculos e rotas |
| --- | --- | --- |
| **Cidade Neon** | Telhados molhados, letreiros, chuva | Vãos entre prédios, plataformas que piscam, atalho aéreo por cima dos letreiros, serras nos becos |
| **Fundição Vulcânica** | Metal, lava, pistões | Esteiras de impulso, martelos (drills) verticais, pontes que somem, chão fervente |
| **Floresta Ancestral** | Cipós, névoa verde | Espinhos, plataformas móveis, lama escorregadia (gelo), atalho por cima das árvores |
| **Picos Congelados** | Gelo, vento, abismos | Piso de gelo, plataformas móveis longas, vãos largos, lasers de neve |
| **Estação Orbital** | Vácuo, energia | Lasers liga/desliga, plataformas temporárias, rampas de impulso e troca de gravidade |

Cada pista define também **tema visual** (gradiente de céu, cor do chão, camadas de parallax, partículas) e **tema sonoro** (escala, BPM e timbre usados pela trilha procedural).

Todas as pistas passam por um **simulador automático** (seção 14) que prova que é possível terminar a corrida com a física real do jogo.

---

## 6. Habilidades

Escolha uma antes da partida (tela de seleção de personagem no lobby):

| Habilidade | Recarga | Efeito |
| --- | --- | --- |
| **Turbo Neon** | 9 s | Impulso de velocidade por ~1,2 s. |
| **Salto Quântico** | 11 s | Teletransporte curto à frente, atravessando perigos. |
| **Escudo de Íon** | 14 s | Absorve o próximo dano e empurra obstáculos. |
| **Mina Caótica** | 8 s | Deixa uma mina atrás; quem pisar fica lento. |
| **Troca Dimensional** | 22 s | Troca de posição com o adversário à frente — **só se ele estiver à frente**, e os dois ficam invulneráveis por um instante (troca justa). |
| **Tempestade** | 16 s | Rajada de vento que empurra quem está atrás de você. |

Nenhuma habilidade garante vitória sozinha: todas têm custo de recarga, contra-jogo e alcance limitado.

---

## 7. Eventos caóticos

O servidor sorteia eventos (com semente determinística, iguais para todos) conforme o nível de caos da sala (0 a 3):

| Evento | Efeito |
| --- | --- |
| **Gravidade Lunar** | Pulos altos e queda lenta. |
| **Gravidade Pesada** | Pulos curtos, quedas rápidas. |
| **Pista Escorregadia** | Aderência baixa (estilo gelo). |
| **Vento Cruzado** | Empurra para os lados. |
| **Chuva de Meteoros** | Meteoros temporários que caem em posições avisadas antes. |
| **Overdrive** | Velocidade máxima aumentada para todos. |
| **Plataformas Temporárias** | Pontes extras aparecem por tempo limitado nos vãos grandes. |

Como os modificadores são **funções puras do tempo**, cliente e servidor chegam ao mesmo resultado sem trafegar geometria pela rede.

---

## 8. Personagens, skins e progressão

- **8 personagens** desenhados por código (SVG no menu, formas no jogo): Vulcão, Nix, Duque (livres), Mira, Bolt, Yuki, KAOS e Titã (desbloqueáveis).
- **6 skins**, **6 acessórios** e **6 rastros** — todos estéticos, nenhum dá vantagem.
- **6 emotes** com balão no jogo.
- **6 conquistas**, recordes por pista (guardando o **fantasma** da melhor volta) e estatísticas locais (corridas, vitórias, pódios, quedas, eliminações, tempo total).
- Tudo salvo em `localStorage` (`chaosrace.profile.v1`). Nada é pago e não existe loja.

---

## 9. Áudio

Áudio **100% procedural** (WebAudio, sem arquivos): nada para baixar, nada de direitos autorais.

- Trilha gerada por escala/BPM do tema da pista + tema do menu e da tela de resultado.
- Efeitos de pulo, aterrissagem, colisão, queda, checkpoint, habilidade, mina, contagem, largada, vitória, eliminação e trocas de tela.
- Volumes separados para **música** e **efeitos**, com mudo geral (`M`).
- O contexto de áudio só é criado após o primeiro clique/toque (exigência dos navegadores).

---

## 10. Arquitetura

```
Chaos-Race/
├── shared/                  # código compartilhado por cliente e servidor
│   ├── physics.js           # física determinística (mesma função dos dois lados)
│   ├── tracks.js            # TrackBuilder + 5 pistas + TrackRuntime (colisões)
│   ├── abilities.js         # definição das 6 habilidades
│   ├── chaos.js             # modificadores e meteoros
│   ├── modes.js             # regras dos 4 modos
│   ├── characters.js        # 8 personagens e desbloqueios
│   ├── cosmetics.js         # skins, acessórios, rastros, emotes
│   └── constants.js         # tick, física, flags, limites
├── backend/
│   ├── src/server.js        # Express + Socket.IO, CORS, rate limit, /health
│   ├── src/rooms/           # RoomManager (salas públicas/privadas) e Room (lobby)
│   ├── src/game/Game.js     # autoridade: simulação 60 Hz, snapshots 20 Hz, regras
│   ├── src/util/            # logger e validações de payload
│   └── test/                # testes de regras (node:test)
├── frontend/
│   ├── src/main.js          # orquestrador de telas, rede e ciclo de partida
│   ├── src/game/            # cena Phaser, trilhas, personagens, câmera, partículas
│   ├── src/net/             # NetClient, relógio do servidor, interpolação
│   ├── src/ui/              # 7 telas em DOM/CSS + HUD + avatares SVG
│   ├── src/data/progress.js # perfil, conquistas, recordes, fantasmas
│   ├── src/audio/audio.js   # síntese de música e efeitos
│   └── vite.config.js       # base relativa, alias @shared, proxy para o backend
├── tests/                   # simulador de pistas, UI (jsdom), integração real
├── .github/workflows/        # CI, deploy do Pages e keepalive
└── render.yaml               # blueprint do backend no Render
```

**Por que a física é compartilhada?** O cliente prediz o próprio movimento localmente (resposta imediata) e o servidor roda *a mesma* função a 60 Hz. Quando chega um snapshot, o cliente volta para a posição autoritativa e reaplica apenas os inputs ainda não confirmados — reconciliação sem "borracha".

---

## 11. Servidor autoritativo e protocolo

- **Tick de simulação:** 60 Hz. **Snapshots:** 20 Hz (`volatile`, descartáveis).
- **Inputs:** até 30 Hz, em lotes de até 8 registros `[seq, dir, jump, hold, slide]`, com `ackSeq`.
- **Snapshot compacto** (arrays, não objetos): `[índice, x, y, vx, vy, flags, ack, checkpoint, voltas, vidas, progresso, recarga, tempoDeChegada]` + `ev` (eventos), `tr` (minas), `zn` (zonas), `el` (aviso de eliminação), `cd` (contagem), `ph` (fase), `t` (tempo do servidor).
- **Flags:** `grounded 1, sliding 2, shield 4, boost 8, slow 16, finished 32, eliminated 64, frozen 128, disconnected 256, invuln 512, quantum 1024`.

Eventos Socket.IO:

| Direção | Evento | Uso |
| --- | --- | --- |
| C→S | `hello` | identifica o jogador (nome + perfil estético) |
| C→S | `room:create` / `room:join` / `room:quick` / `room:leave` | salas |
| C→S | `room:list` | lista de salas públicas (sem as privadas) |
| C→S | `room:ready`, `room:settings`, `room:start` | lobby |
| C→S | `room:rematch` | revanche (maioria dos conectados) |
| C→S | `room:rejoin` | volta para a sala/partida após queda |
| C→S | `match:input`, `match:ability`, `match:emote` | jogo |
| S→C | `room:state`, `room:error` | lobby e erros (com ack quando o cliente pede) |
| S→C | `match:start`, `match:snapshot`, `match:fx`, `match:resync`, `match:end` | partida |
| S→C | `server:info`, `pong` | versão/estado e latência |

---

## 12. Segurança

- Nomes normalizados (2–16 caracteres, sem HTML/emoji malicioso, bloqueio de termos ofensivos) e códigos de sala restritos a `[A-Z0-9]{5}`.
- **Rate limiting** por socket: mensagens por segundo, comandos por segundo e ações de partida (habilidade/emote) com tempo mínimo entre usos.
- Todo payload é **validado e sanitizado** antes de tocar no estado do jogo; lotes de input têm tamanho máximo e *sequence numbers* monotônicos.
- CORS restrito por `CORS_ORIGINS` (a origem do seu Pages), headers `nosniff`, `no-referrer` e `DENY` para iframe, `x-powered-by` desligado.
- Erros são capturados e logados sem derrubar o processo; SIGTERM/SIGINT encerram com limpeza.
- Nenhuma credencial no código: tudo por variáveis de ambiente (`.env` é ignorado pelo Git).

---

## 13. Desempenho

- Física em passo fixo de 1/60 s, sem alocação por quadro; snapshots em arrays.
- A pista inteira é desenhada em **poucos objetos `Graphics`** (não existe um GameObject por obstáculo), com texturas geradas uma única vez e `roundPixels`.
- Partículas são curtas, desenhadas em `Graphics` e **desligadas no modo baixa qualidade** — junto com camadas de parallax e tremores de tela.
- Modo de qualidade automático (`baixa`/`alta`) a partir de `hardwareConcurrency` e tipo de dispositivo; reduz partículas, parallax e tremores.
- HUD em DOM (fora do canvas), atualizado a 10 Hz — não recalcula layout por quadro.
- Renderização: 1 canvas, 1 câmera com deadzone, câmera suave e interpolação remota de 100 ms.
- Servidor: uma única instância Node, salas em memória, snapshots `volatile` (descartados se o cliente estiver lento).

---

## 14. Testes

```bash
npm run test:server   # 14 testes de regras do servidor
npm run test:tracks   # simulador das 5 pistas com a física real
npm run test:ui       # 30+ verificações de telas/HUD progresso (jsdom)
npm run test:e2e      # 37 verificações com 3 clientes Socket.IO reais
```

### `test:server` — regras (`backend/test/rules.test.js`)

Contagem regressiva, movimento autoritativo, pulo e gravidade, queda → checkpoint, turbo com recarga, mina consumida ao ser pisada, troca dimensional (inclusive "sem alvo não gasta recarga"), 3 quedas = eliminação na Sobrevivência, Eliminação do último colocado, Contra o Tempo terminando na linha, inputs inválidos/duplicados rejeitados, desconexão/reconexão, eventos de caos e limpeza de salas vazias.

### `test:tracks` — jogabilidade (`tests/track-sim.mjs`)

Um bot com a **mesma física do jogo** corre cada pista do início ao fim e falha se ficar preso ou não terminar. Resultado atual:

| Pista | Resultado | Tempo | Quedas |
| --- | --- | --- | --- |
| Cidade Neon | ✅ ok | 17,2 s | 2 |
| Fundição Vulcânica | ✅ ok | 15,0 s | 0 |
| Floresta Ancestral | ✅ ok | 16,0 s | 0 |
| Picos Congelados | ✅ ok | 18,4 s | 0 |
| Estação Orbital | ✅ ok | 15,5 s | 0 |

```bash
node tests/track-sim.mjs            # todas
node tests/track-sim.mjs peaks      # uma pista, modo verboso
NO_HAZARDS=1 node tests/track-sim.mjs # sem obstáculos (isola a geometria)
```

### `test:ui` — interface (`tests/ui-entry.js`)

Monta as 7 telas num DOM real (jsdom), dispara os *bindings*, valida HUD, ranking ao vivo, contagem, banner de caos, avatares SVG e o ciclo de progressão (recordes, conquistas, fantasmas).

### `test:e2e` — multiplayer real (`tests/multiplayer.test.mjs`)

Sobe o servidor de verdade numa porta aleatória e conecta **três clientes Socket.IO independentes**, verificando 37 pontos: `/health`, `/api/config`, CORS, sala privada fora da lista, código inválido, entrada por código, lobby 2→3, espera do pronto, `match:start` idêntico, snapshot compacto (≈200 bytes), contagem sincronizada, movimento autoritativo, ack de inputs, saltos simulados no servidor, habilidade transmitida, reconexão + `match:resync`, fim de partida com pódio coerente, revanche com novo `matchId`, fila rápida e sala pública (criação, listagem, reentrada e limpeza).

---

## 15. Deploy passo a passo

Você vai precisar de: conta no GitHub, conta no Render (grátis) e o repositório já enviado (`git push`).

### 15.1 Backend no Render

1. Acesse <https://dashboard.render.com> e entre com o GitHub.
2. Clique em **New +** → **Blueprint**.
3. Selecione o seu repositório do Chaos Race. O Render lê o `render.yaml` e mostra o serviço `chaos-race-server` com plano **Free**.
4. Em **CORS_ORIGINS**, cole a origem do seu Pages: `https://SEU-USUARIO.github.io` (sem barra no final).
5. Clique em **Apply**. Aguarde o status ficar **Live** (2–4 min).
6. Abra `https://chaos-race-server.onrender.com/health` — deve responder um JSON com `"status":"ok"`.

> **Plano gratuito do Render:** a instância é suspensa após ~15 minutos sem tráfego. A primeira requisição depois disso leva 30–50 s (tela de "conectando…"). O jogo avisa quando o servidor está acordando. O plano pago não é necessário para jogar.

Alternativa sem blueprint: **New +** → **Web Service** → escolha o repositório → **Runtime: Node** → **Build Command:** `cd backend && npm ci --omit=dev` → **Start Command:** `cd backend && npm start` → adicione a variável `CORS_ORIGINS`.

### 15.2 Frontend no GitHub Pages

1. No repositório, abra **Settings** → **Secrets and variables** → **Actions**.
2. Na aba **Variables**, clique em **New repository variable**.
3. Nome: `CHAOS_SERVER_URL` — Valor: `https://chaos-race-server.onrender.com` (sem barra no final). Clique em **Add variable**.
4. Vá em **Settings** → **Pages**.
5. Em **Source**, escolha **GitHub Actions** (não "Deploy from a branch").
6. Abra a aba **Actions**, selecione o workflow **Deploy do frontend no GitHub Pages** e clique em **Run workflow** → **Run workflow**.
7. Em ~2 minutos o job **Publicar no Pages** mostra a URL. O jogo fica em `https://SEU-USUARIO.github.io/chaos-race/`.

O workflow roda os testes antes de publicar: se um teste falhar, nada é publicado.

### 15.3 (Opcional) Manter o servidor acordado

O workflow **Manter o servidor acordado** faz `ping` em `/health` a cada 10 minutos, reduzindo as suspensões do Render. Ele usa a mesma variável `CHAOS_SERVER_URL`; se ela não existir, o workflow não faz nada. Desative com **Actions** → **Manter o servidor acordado** → **⋯** → **Disable workflow** se preferir economizar horas do plano gratuito.

### 15.4 Verificação final

1. Abra `https://SEU-USUARIO.github.io/chaos-race/`.
2. O rodapé do menu deve mostrar o host do servidor e o status **online**.
3. Clique em **Jogar** → **Criar sala**: aparece o código de convite.
4. Abra o mesmo link em outro navegador (ou no celular), **Jogar** → **Entrar com código**, cole o código.
5. Os dois aparecem no lobby → **Pronto** → contagem → corrida.
6. Se aparecer "conexão perdida", confira `CORS_ORIGINS` no Render: ele precisa ser exatamente a origem do Pages (`https://usuario.github.io`, sem caminho e sem barra).

---

## 16. Adicionar uma pista nova

Toda pista é declarada em `shared/tracks.js` com blocos reutilizáveis:

```js
export const oasis = defineTrack(() => {
  const b = new TrackBuilder({
    id: 'oasis',
    name: 'Oásis Perdido',
    subtitle: 'Areia movediça e ruínas suspensas',
    theme: { sky: ['#2b1d0e', '#7c5a2b'], ground: '#c9a227', accent: '#ffe08a', scale: 'phrygian', bpm: 132 },
  });
  b.ground(600);
  b.gapRun(3, { len: 150 });
  b.moverRun(2, { axis: 'x', amp: 120, period: 3.2 });
  b.spikeRun(4);
  b.iceRun(320);
  b.checkpoint();
  b.shortcut({ at: 900, height: 200, length: 500 });
  b.finishZone();
  return b.build();
});
```

Depois registre em `TRACKS`, rode `node tests/track-sim.mjs oasis` e ajuste até o simulador terminar a corrida. O servidor, o menu, os temas visuais e sonoros passam a considerar a pista automaticamente.

---

## 17. Solução de problemas

| Sintoma | Causa provável | Solução |
| --- | --- | --- |
| "Servidor offline" no menu | backend dormindo ou URL errada | abra `/health`; a primeira visita acorda o Render |
| CORS bloqueado no console | `CORS_ORIGINS` diferente da origem | ajuste para `https://usuario.github.io` (sem barra) |
| Página do Pages em branco | Pages configurado como "Deploy from a branch" | use **Source: GitHub Actions** e rode o workflow |
| Frontend conecta em `localhost` no site publicado | variável `CHAOS_SERVER_URL` ausente | crie a variável e rode o deploy de novo (o valor entra no build) |
| Personagem "tremendo" | latência alta (>250 ms) | o servidor interpola 100 ms; prefira Wi-Fi/4G estável |
| Revejo a sala após atualizar a página | reconexão depende do mesmo navegador | clique em **Reconectar** na tela de erro |
| Nada aparece no jogo | WebGL bloqueado | o Phaser cai para Canvas automaticamente; atualize o navegador |

---

## 18. Limitações conhecidas

- **Sem contas/servidor de perfis**: o progresso é local (por navegador). Limpar os dados do site zera personagens desbloqueados.
- **Render gratuito dorme**: a primeira conexão pode demorar dezenas de segundos; o jogo avisa e reconecta.
- **Uma instância por região**: sem *sharding*; salas vivem em memória, então um *restart* do servidor encerra partidas em andamento (o cliente mostra o erro e volta ao menu).
- **Reconexão** funciona enquanto a sala existir (o jogador fica reservado por 45 s após a queda).
- Latência zero não existe: a predição mascara o atraso, mas acima de ~250 ms dá para notar.
- Áudio procedural é gerado no navegador: em aparelhos muito antigos pode haver pequenos estalos.

---

Feito com Phaser 3, Vite, Node.js, Express e Socket.IO. Sem serviços pagos, sem anúncios, sem pay-to-win. Divirta-se no caos. 🌀
