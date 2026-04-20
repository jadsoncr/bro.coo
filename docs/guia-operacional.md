# Guia Operacional — Santos & Bastos Advogados
**Bot de Atendimento via Telegram — Como transformar conversas em clientes**
**Data:** 16/04/2026

---

## O que foi entregue

Antes deste sistema, cada mensagem no Telegram chegava sem contexto. Não havia como saber se era uma dúvida rápida ou um caso urgente. A equipe respondia na ordem de chegada — sem priorização, sem dado estruturado, sem histórico.

Agora cada contato passa por um fluxo que:

1. Identifica automaticamente o tipo de caso (trabalhista, família, cliente existente, outros)
2. Faz as perguntas certas para qualificar o lead
3. Calcula uma pontuação em tempo real
4. Classifica e entrega o lead pronto na planilha com prioridade definida
5. Detecta quando alguém desistiu e registra onde parou

A equipe jurídica não precisa mais triagem manual. O bot faz isso.

---

## Como o sistema pontua cada contato

O bot não adivinha — ele pondera. A cada resposta, adiciona pontos com base em critérios que indicam urgência e valor do caso:

| O que o lead respondeu | Pontos |
|---|---|
| Salário acima de R$ 5.000 | +2 |
| Quer entrar na Justiça | +2 |
| Tem mais de uma irregularidade trabalhista | +2 |
| Situação familiar com urgência declarada | +5 |
| Escolheu "Falar com advogado" diretamente | +5 |

Esses critérios foram calibrados para o perfil de caso do escritório. Um lead trabalhista com salário alto que quer processar a empresa chega com score 4–6. Um caso familiar urgente chega com score 5 automaticamente.

### O que cada faixa significa na prática

**🔥 QUENTE (score ≥ 5)**
Pessoa decidida, caso de impacto real. Ela já avaliou a situação e quer agir. O janela de conversão é curta — normalmente menos de 2h. Depois disso, ela pode ter procurado outro escritório.

**🟡 MEDIO (score 3–4)**
Interesse real, mas ainda avaliando. Não está pronto para fechar, mas está aberto a uma conversa. Uma mensagem bem colocada nas próximas 24h move esse lead.

**⚪ FRIO (score 0–2)**
Curiosidade, dúvida inicial ou situação de baixo impacto financeiro. Não vale esforço imediato. Se o escritório tiver conteúdo (posts, artigos), esse é o público para nutrir.

---

## As abas da planilha — o que cada uma representa

### Leads
Os casos novos: trabalhista, família, advogado. São as pessoas que descreveram o problema, responderam as perguntas e chegaram ao final do fluxo.

**O que fazer:**

| Prioridade | Ação concreta | Prazo |
|---|---|---|
| 🔥 QUENTE | Ligar. Não mensagem — ligar. Esse lead está no momento de decisão. | Até 2h |
| 🟡 MEDIO | Mensagem personalizada mencionando o caso dele. | Até 24h |
| ⚪ FRIO | Adicionar numa lista de nutrição. Não forçar contato. | Sem urgência |

A coluna `resumo` traz o que o lead descreveu — tipo de caso, tempo de empresa, salário, intenção. Use isso na abordagem. Não ligue sem ler.

---

### Clientes
Quem já tem processo no escritório e entrou em contato pelo bot. Diferente dos leads — essa pessoa já é cliente e tem expectativa de resposta rápida.

**O que fazer:**
- Identificar pelo nome ou número de processo informado
- Encaminhar direto para a Dra. Raquel ou responsável pelo caso
- Responder em até 4h úteis — cliente sem retorno vira reclamação

---

### Outros
Consultas que não se encaixam nos fluxos principais: revisão de contrato, dúvida pontual, assunto não jurídico.

**O que fazer:**
- Ler a descrição antes de responder
- Se tiver potencial de caso: tratar como MEDIO
- Se for dúvida isolada: responder e encerrar sem investir tempo comercial

---

### Abandonos
Esta aba é ouro escondido. Registra quem entrou no bot, demonstrou interesse e parou antes de finalizar.

O sistema classifica automaticamente em três níveis:

**🔥 VALIOSO — parou quase no final (nome ou contato)**
Esse lead preencheu tudo, deu o nome, e travou na última pergunta. Provavelmente sentiu insegurança no momento do contato. Um toque humano converte muito aqui.

Mensagem recomendada:
> Oi! 👋 Aqui é do Santos & Bastos.
> Vi que você iniciou um atendimento com a gente e não finalizou.
> Se ainda tiver com essa dúvida, posso te ajudar agora 👍

**🟡 MEDIO — parou no meio do fluxo**
Perdeu o interesse ou foi interrompido. Vale uma mensagem simples. Se não responder em 48h, arquivar.

**⚪ PRECOCE — saiu logo no início**
Não qualificou. Ignorar.

---

## Rotina diária — onde focar a atenção

### 9h — Prioridade máxima
- Aba **Leads**: filtrar coluna `prioridade = QUENTE` → ligar para cada um
- Aba **Clientes**: verificar entradas novas → encaminhar

### 14h — Relacionamento
- Aba **Leads**: filtrar `prioridade = MEDIO` → enviar mensagem personalizada
- Aba **Abandonos**: filtrar `classificacao = VALIOSO` → reativar

### 17h — Fechamento do dia
- O que ficou sem retorno: agendar para o dia seguinte
- FRIO: avaliar se entra em lista de conteúdo ou arquiva

---

## O que este sistema muda na operação

**Antes:** chegava mensagem → alguém respondia → tentava entender o caso no chat → sem registro → sem prioridade.

**Agora:** lead chega classificado, com dados estruturados, na aba certa, com prioridade definida. A equipe sabe exatamente quem ligar primeiro e por quê.

A diferença não é tecnológica. É operacional. O bot não fecha contratos — ele garante que nenhum lead quente fique sem resposta por falta de visibilidade.

---

## Uma métrica para acompanhar

Após 2 semanas de operação, olhe para:

```
leads QUENTE gerados  ÷  contratos fechados  =  taxa de conversão QUENTE
```

Se estiver abaixo de 30%, o problema está na abordagem — não no lead.
Se os abandonos VALIOSO forem ignorados, o escritório está deixando dinheiro na mesa toda semana.
