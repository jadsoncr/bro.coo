# Santos & Bastos — Motor de Atendimento Jurídico

Sistema que recebe mensagens de clientes via Telegram, classifica automaticamente o tipo de caso jurídico, prioriza o lead (FRIO / MEDIO / QUENTE) e registra no Google Sheets quando o atendimento é concluído.

---

## Problema que resolve

- Evita perda de leads por demora ou falta de triagem
- Padroniza o atendimento inicial sem depender de pessoa humana
- Prioriza automaticamente os casos com maior urgência e valor
- Entrega ao time de advogados apenas leads qualificados e organizados

---

## Como funciona (visão rápida)

```
Entrada       →   Telegram
Processamento →   Motor conversacional (estado + decisão + score)
Saída         →   Registro estruturado no Google Sheets
```

---

## Fluxo técnico

```
Usuário (Telegram)
        ↓
  Telegram Bot API
        ↓
  POST /webhook  ←── Railway (Node.js + Express)
        ↓
  normalizer.js       padroniza entrada: sessao, mensagem, canal
        ↓
  sessionManager.js   cria/carrega estado da conversa (memória)
        ↓
  stateMachine.js     decide fluxo, avança estado, classifica intenção
        ↓
  scorer.js           calcula score = impacto + intenção + 1
        ↓
  googleSheets.js     persiste lead na planilha ao finalizar
```

---

## Fluxos disponíveis

| Gatilho | Fluxo | Aba na planilha |
|---|---|---|
| "fui demitido", "rescisão", "horas extras"... | trabalhista | Leads |
| "divórcio", "pensão", "guarda", "inventário"... | familia | Leads |
| "já sou cliente", "meu processo"... | cliente | Clientes |
| qualquer outra coisa | outros | Outros |

---

## Regras de negócio

- **Sessão** → em memória, por conversa. Reinicia com "menu" ou "reiniciar"
- **Score** = impacto (1–3) + intenção (1–3) + 1
- **FRIO** < 5 | **MEDIO** 5–6 | **QUENTE** ≥ 7
- **QUENTE** → oferece transferência para advogado antes de encerrar
- **Persistência** → só acontece ao finalizar o fluxo
- **Retry** → 3 tentativas automáticas se o Google Sheets falhar
- **flagAtencao** → ativado por palavras de urgência, persiste entre resets

---

## Canais suportados

| Canal | Status |
|---|---|
| Telegram | Ativo |
| WhatsApp Oficial (API Cloud) | Previsto |

---

## Variáveis de ambiente

| Variável | Descrição |
|---|---|
| `PORT` | Porta do servidor (padrão: 3000) |
| `STORAGE_ADAPTER` | `memory` (dev) ou `sheets` (produção) |
| `TELEGRAM_TOKEN` | Token do bot (BotFather) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON da service account (inline) |
| `GOOGLE_SHEETS_ID` | ID da planilha Google Sheets |

---

## Endpoints

```
POST /webhook   recebe mensagens (Telegram ou WhatsApp)
GET  /health    healthcheck Railway
```

---

## Testes

```bash
npm test        # 66 testes (Jest)
```

3 suites: `stateMachine`, `scorer`, `storage`

---

## Stack

- Node.js 22 + Express 5 + CommonJS
- Jest 29
- Google Sheets API v4 (googleapis)
- Railway (deploy via push em `main`)

---

## Como testar em 2 minutos

1. Abra o bot no Telegram e envie: `fui demitido`
2. Responda as perguntas sobre impacto e intenção
3. Informe nome e canal de contato
4. Descreva o caso brevemente
5. Verifique a nova linha criada na aba **Leads** do Google Sheets

Para testar fluxo de família: envie `quero me divorciar`
Para testar cliente existente: envie `já sou cliente`

---

## Riscos conhecidos

| Risco | Impacto | Situação |
|---|---|---|
| Sessão em memória | restart perde contexto ativo | aceitável no MVP |
| Google Sheets como persistência | não é banco, pode ter gargalo em escala | aceitável no MVP |
| Sem WhatsApp oficial | canal limitado a Telegram | previsto para próxima fase |
