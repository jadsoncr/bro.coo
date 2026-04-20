# Mapa da Jornada do Cliente
**Santos & Bastos Advogados — Bot de Atendimento**
**Data:** 16/04/2026

---

## Visão Geral

```
Usuário envia mensagem
        ↓
   É áudio/foto?
   ├── SIM → "Recebi seu áudio 😊 Me escreve o que aconteceu?"
   └── NÃO → Abertura
        ↓
   ABERTURA
        ↓
   Classificação automática por texto livre
   ├── trabalhista  → Fluxo Trabalhista
   ├── familia      → Fluxo Família
   ├── cliente      → Fluxo Cliente Existente
   ├── advogado     → Pergunta: cliente ou caso novo?
   ├── vago (1x)   → Pede mais detalhes
   └── vago (2x)   → Menu com opções
        ↓
   Score calculado ao longo do fluxo
        ↓
   FRIO / MEDIO / QUENTE
        ↓
   QUENTE → Oferta de humano
        ↓
   Finalização → Google Sheets
```

---

## Mensagens da Jornada

### Entrada — Áudio ou Mídia

> Recebi seu áudio 😊
>
> Pra te ajudar mais rápido, pode me escrever resumido aqui o que aconteceu?

---

### Abertura (1ª mensagem)

> Olá! Aqui é do Santos & Bastos Advogados 👋
>
> Vou te ajudar a entender seu caso rapidinho.
>
> Me conta em uma frase o que aconteceu:
> (ex: fui demitido, quero me divorciar, tenho uma dívida...)

---

### Fallback 1 — Resposta Vaga

> Pode me explicar um pouco melhor o que está acontecendo?
> (ex: fui demitido, quero me divorciar, tenho uma dívida...)

---

### Fallback 2 — Menu (último recurso)

> Entendi 👍
>
> Pra te direcionar melhor, me diz qual dessas opções chega mais perto:
>
> 1 - Problema no trabalho
> 2 - Questão de família
> 3 - Já sou cliente
> 4 - Outro assunto

---

### Alta Intenção — "Quero falar com advogado"

> Claro 👍
>
> Você já é cliente do escritório ou é um caso novo?
>
> 1 - Já sou cliente
> 2 - É um caso novo

---

## Fluxo Trabalhista

**Gatilhos:** "fui demitido", "rescisão", "horas extras", "justa causa", "FGTS", "aviso prévio", "carteira assinada", "salário atrasado", "assédio no trabalho", "acidente de trabalho"

```
Descreva brevemente sua situação trabalhista
        ↓
Qual o impacto financeiro?
1 - Baixo  2 - Médio  3 - Alto
        ↓
Qual sua intenção?
1 - Buscar acordo  2 - Entrar na Justiça  3 - Ainda não sei
        ↓
Score ≥ 7? → Oferta de humano
        ↓
Qual é o seu nome completo?
        ↓
Como prefere ser contatado? (WhatsApp / Telefone / E-mail)
        ↓
Descreva mais detalhes do seu caso
        ↓
FINALIZADO → Salva em Leads (aba Leads)
```

**Mensagem de encerramento:**
- QUENTE: *"Seu caso foi identificado como prioritário. Entraremos em contato o mais breve possível."*
- MEDIO: *"Recebemos suas informações e iremos analisar seu caso."*
- FRIO: *"Recebi suas informações 👍 Vamos analisar e te orientar sobre os próximos passos."*

---

## Fluxo Família

**Gatilhos:** "divórcio", "pensão", "guarda", "alimentos", "separação", "inventário", "herança", "partilha", "filho", "casamento"

```
Descreva brevemente sua situação familiar
        ↓
Qual o impacto estimado?
1 - Baixo  2 - Médio  3 - Alto
        ↓
Qual sua intenção?
1 - Buscar acordo  2 - Processo judicial  3 - Ainda não sei
        ↓
Score ≥ 7? → Oferta de humano
        ↓
Qual é o seu nome completo?
        ↓
Como prefere ser contatado? (WhatsApp / Telefone / E-mail)
        ↓
Descreva mais detalhes do seu caso
        ↓
FINALIZADO → Salva em Leads (aba Leads)
```

---

## Fluxo Cliente Existente

**Gatilhos:** "já sou cliente", "tenho processo", "meu processo", opção 3 no menu

```
Qual é o seu nome completo?
        ↓
Como prefere ser contatado? (WhatsApp / Telefone / E-mail)
        ↓
Descreva brevemente sua solicitação
        ↓
FINALIZADO → Salva em Clientes (aba Clientes)
        Prioridade: MEDIO (padrão) ou QUENTE (se flagAtencao)
```

---

## Fluxo Outros

**Gatilhos:** opção 4 no menu, qualquer mensagem não classificada após 2 tentativas

```
Qual tipo de assunto você precisa tratar?
        ↓
Qual o nível de urgência?
1 - Baixo  2 - Médio  3 - Alto
        ↓
Qual sua intenção?
1 - Informação  2 - Contratar serviço  3 - Reclamação
        ↓
Qual é o seu nome completo?
        ↓
Como prefere ser contatado? (WhatsApp / Telefone / E-mail)
        ↓
Descreva sua solicitação
        ↓
FINALIZADO → Salva em Outros (aba Outros)
```

---

## Oferta de Humano (QUENTE)

Ativada quando score ≥ 7 nos fluxos trabalhista, família e outros.

> ⚠️ Pelo que você descreveu, seu caso pode precisar de atenção rápida.
>
> Prefere falar diretamente com um advogado agora?
>
> 1 - Sim, quero falar com alguém
> 2 - Não, continuar aqui

- Opção **1** → finaliza imediatamente e salva com `querHumano: true`
- Opção **2** → continua fluxo normalmente

---

## Cálculo de Prioridade

| Score | Prioridade | Critério |
|---|---|---|
| < 5 | FRIO | Baixo impacto e/ou intenção indefinida |
| 5 – 6 | MEDIO | Impacto ou intenção moderados |
| ≥ 7 | QUENTE | Alto impacto + intenção definida |

**Fórmula:** `score = impacto (1–3) + intenção (1–3) + 1`

**Flag de atenção:** ativada por palavras como "urgente", "advogado", "falar com alguém". Persiste mesmo se o usuário reiniciar o fluxo.

---

## Comandos Especiais

| Comando | Ação |
|---|---|
| `menu` | Reinicia a conversa |
| `reiniciar` | Reinicia a conversa |
| `voltar` | Reinicia a conversa |

---

## Destino dos Dados

| Fluxo | Aba na Planilha |
|---|---|
| trabalhista / família | Leads |
| cliente existente | Clientes |
| outros | Outros |

**Persistência:** acontece apenas ao finalizar o fluxo completo.
**Retry:** 3 tentativas automáticas em caso de falha no Google Sheets.

---

## Canais Ativos

| Canal | Status |
|---|---|
| Telegram (@santosebastoscx_bot) | Ativo em produção |
| WhatsApp Oficial | Previsto |
