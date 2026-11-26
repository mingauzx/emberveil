# Ember Veil

Bot de Discord e painel para organizar treinos, elenco e resultados do time de Valorant.

## Configuração

1. Instale o Node.js 24 ou superior e rode `npm install`.
2. Copie `.env.example` para `.env`.
3. No [Discord Developer Portal](https://discord.com/developers/applications), crie uma aplicação e um bot. Instale no servidor com os escopos `bot` e `applications.commands` e permissões de ver canais e enviar mensagens.
4. Preencha `DISCORD_TOKEN` e `DISCORD_GUILD_ID`. Opcionalmente, configure `STAFF_ROLE_ID` com o cargo de capitão. Membros com Gerenciar Servidor também podem editar.
5. Em **OAuth2** no Discord Developer Portal, registre a URL de retorno `http://127.0.0.1:3000/auth/discord/callback` para rodar localmente. Em produção, use o domínio HTTPS do painel com esse mesmo caminho.
6. Configure `DISCORD_CLIENT_ID` com o Application ID, `DISCORD_CLIENT_SECRET` com o Client Secret do OAuth2 e `PUBLIC_URL` com a URL do painel. Rode `npm start`. O painel é público. O login aceita membros do servidor configurado em `DISCORD_GUILD_ID` e habilita as ações para a staff.

Sem token, o processo inicia só o painel. Para hospedagem com acesso externo, use HTTPS, configure `HOST=0.0.0.0` e monte um volume persistente no caminho de `DATA_DIR`. Rode uma instância do serviço.

## Comandos

| Comando | Função |
| --- | --- |
| `/treino marcar` | Publica treino ou scrim com botões de presença. Informe a data no formato ISO com fuso, como `2027-01-10T20:00-04:00`. |
| `/elenco definir`, `/elenco remover` | Gerencia jogadores, funções e vagas de titular ou reserva. |
| `/lineup` | Publica a escalação em Components V2, com titulares e reservas. |
| `/resultado` | Registra adversário, mapa e placar. |
| `/gg` | Envia um cumprimento para o fim da partida. |

O painel consulta os mesmos dados do bot. A staff também pode executar os comandos e enviar embeds clássicos e mensagens Components V2 com cargos, emojis personalizados e botões de link pelo painel. O modo largo (Components V2) é o padrão e aceita divisórias, imagens e seções, digitando o ID de um canal onde ela e o bot possam postar. O banco SQLite fica em `DATA_DIR`.

## Importação Premier

A importação fica desativada até o produto receber acesso oficial da Riot e o jogador de referência vincular sua conta com consentimento via Riot Sign On. Configure `RIOT_API_KEY` com a chave de produção, `RIOT_PREMIER_PUUID` com o identificador obtido da conta autorizada e `RIOT_VAL_REGION=br` para uma conta do Brasil. O vínculo Riot Sign On precisa ser concluído separadamente.

O bot consulta o histórico a cada 15 minutos e aceita apenas partidas concluídas da fila `premier`. A staff revisa as sugestões no painel, preenche o adversário, confere o mapa e aprova ou descarta. A aprovação grava o placar uma vez por ID da Riot. Se a API não retornar uma partida como Premier, ela não entra na fila. O painel público mostra apenas os resultados aprovados.

Na aba Staff, dê um nome à mensagem e use **Salvar rascunho** para guardar os campos do editor. Abra pelo seletor **Embeds salvos**. As opções **Salvar rascunho** e **Salvar cópia** atualizam o rascunho aberto ou criam outra versão, respectivamente. Enviar ao Discord é uma ação separada.
