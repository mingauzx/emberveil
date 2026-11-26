# Ember Veil

Bot de Discord e painel para organizar treinos, elenco e resultados do time de Valorant.

## Configuração

1. Instale o Node.js 24 ou superior e rode `npm install`.
2. Copie `.env.example` para `.env`.
3. No [Discord Developer Portal](https://discord.com/developers/applications), crie uma aplicação e um bot. Instale no servidor com os escopos `bot` e `applications.commands` e permissões de ver canais e enviar mensagens.
4. Preencha `DISCORD_TOKEN` e `DISCORD_GUILD_ID`. Opcionalmente, configure `STAFF_ROLE_ID` com o cargo de capitão. Membros com Gerenciar Servidor também podem editar.
5. Em **OAuth2** no Discord Developer Portal, registre a URL de retorno `http://127.0.0.1:3000/auth/discord/callback` para rodar localmente. Em produção, use o domínio HTTPS do painel com esse mesmo caminho.
6. Configure `DISCORD_CLIENT_ID` com o Application ID, `DISCORD_CLIENT_SECRET` com o Client Secret do OAuth2 e `PUBLIC_URL` com a URL do painel. Rode `npm start`. O login aceita membros do servidor configurado em `DISCORD_GUILD_ID`.

Sem token, o processo inicia só o painel. Para hospedagem com acesso externo, use HTTPS, configure `HOST=0.0.0.0` e monte um volume persistente no caminho de `DATA_DIR`. Rode uma instância do serviço.

## Comandos

| Comando | Função |
| --- | --- |
| `/treino marcar` | Publica treino ou scrim com botões de presença. Informe a data no formato ISO com fuso, como `2027-01-10T20:00-04:00`. |
| `/elenco definir`, `/elenco remover` | Gerencia jogadores, funções e vagas de titular ou reserva. |
| `/lineup` | Mostra a escalação do time. |
| `/resultado` | Registra adversário, mapa e placar. |
| `/gg` | Envia um cumprimento para o fim da partida. |

O painel consulta os mesmos dados do bot. As ações que alteram dados são feitas no Discord. O banco SQLite fica em `DATA_DIR`.
