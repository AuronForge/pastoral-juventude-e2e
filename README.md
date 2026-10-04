# Pastoral da Juventude — E2E

Suíte de testes End-to-End do MVP da Pastoral da Juventude, implementada exclusivamente com Playwright.

O preenchimento do nascimento na recuperação aceita o DatePicker nativo (valor
YYYY-MM-DD) e o campo textual anterior (dd/mm/aaaa) durante a transição.
O cenário continua verificando o valor ISO enviado à API. Integre esta adaptação
antes do PR frontend do DatePicker para manter o deploy compatível com ambos.

Este repositório não contém testes unitários ou de componentes do frontend/backend. Esses testes permanecem nos respectivos repositórios.

## Requisitos

- Node.js 24.8.0 ou superior
- frontend e backend em execução

## Instalação

```bash
npm ci
npm run install:browsers
cp .env.example .env
```

## Execução local

Exporte as URLs do ambiente antes da execução:

```bash
export E2E_FRONTEND_BASE_URL=http://127.0.0.1:8080
export E2E_BACKEND_BASE_URL=http://127.0.0.1:3000
npm run test:e2e
```

Também estão disponíveis os modos visual e interativo:

```bash
npm run test:e2e:headed
npm run test:e2e:ui
```

## Qualidade

```bash
npm run check
```

O comando valida formatação, ESLint e TypeScript. A cobertura mínima de 85% pertence aos testes unitários/de integração dos repositórios frontend e backend; ela não é aplicada artificialmente à suíte E2E.

## CI

Pull Requests e pushes na `main` executam somente os gates estáticos. Os testes E2E reais exigem um ambiente implantado e podem ser iniciados:

- manualmente, por `workflow_dispatch`, informando as URLs do frontend e backend;
- por outro workflow, através de `workflow_call`, após a implantação do ambiente.

Relatórios HTML, JUnit, traces, screenshots e vídeos de falhas ficam disponíveis como artefatos do workflow por 14 dias.

## Escopo inicial

O smoke test valida:

- carregamento da página inicial do frontend;
- `GET /health/live` do backend;
- `GET /health/ready` do backend.

O projeto começa com Chromium para reduzir o tempo e o consumo de recursos da V1. Outros navegadores poderão ser adicionados quando houver requisito explícito de compatibilidade.

## Deploy contínuo em desenvolvimento

Consulte [docs/DEPLOY-DESENVOLVIMENTO.md](docs/DEPLOY-DESENVOLVIMENTO.md) para a integração com a esteira da infraestrutura e seus pré-requisitos.

## Jornada de Login

`tests/login.spec.ts` cobre navegação protegida, loading, 401, 429 com e sem prazo, falha de rede, 500/503 e troca obrigatória com respostas de rede controladas. Execute `npm run test:e2e -- --project=chromium tests/login.spec.ts` contra o frontend desta jornada. Esses testes não validam persistência nem Redis.

`tests/auth-live.spec.ts` usa a API real e duas contas distintas em `@regressao.invalid`. Ative `E2E_AUTH_LIVE=true` somente em local, desenvolvimento ou homologação. Configure as sete variáveis de autenticação do `.env.example` através do ambiente ou secrets da CI. No workflow manual, selecione `auth_live`; no workflow reutilizável, forneça o input e os cinco secrets opcionais. Não imprima senhas nos comandos.

Antes de cada execução, prepare os usuários exclusivos e reinicialize a massa de primeiro acesso com `regression:reset` do backend. A suíte não cria usuários nem redefine dados. Reserve uma origem ao executor para não compartilhar contadores de tentativas com outras suítes. A senha definitiva deve ser válida e diferente da temporária. Execute `npm run test:e2e -- --project=auth-live`. A suíte mutável tem um worker, zero retries e não gera trace, vídeo nem screenshot com credenciais reais. Sem ativação, seus testes aparecem como skipped.

Após o frontend da jornada ser integrado, o smoke espera Login para acesso anônimo. Integre este PR depois do frontend, preservando os SHA de imagens usados no deploy.

## Restauração da sessão

A suíte session-restoration.spec.ts valida reload com respostas controladas,
limite de três renovações, espera inicial, retry de 503 e estados de usuário
bloqueado/inativo ou sessão substituída. A suíte auth-live.spec.ts passa a exigir
RES-106 implantado e espera permanecer autenticada após o reload, sem storage.
Os testes reais continuam opt-in, com massa exclusiva e capturas desativadas.

## Recuperação de senha

`tests/password-recovery.spec.ts` valida Journey002: link do Login, quatro dados obrigatórios, calendário, estados 404/409/403/429/503, fluxo recuperação → login temporário → troca obrigatória → login definitivo e acesso móvel por teclado sem overflow. Todas essas chamadas usam respostas HTTP controladas e valores fictícios; não alteram as contas do Ubuntu nem comprovam persistência real. A CI do backend verifica o mesmo ciclo com PostgreSQL, Redis, Argon2id e RS256 reais.

Execute `npm run test:e2e -- --project=chromium tests/password-recovery.spec.ts` contra o frontend com a funcionalidade integrada. Para integração contínua, concluir o deploy do backend primeiro, integrar este E2E e aguardar sua CI, depois publicar o frontend novo. A validação pública real de recuperação deve usar uma conta autorizada com nome, e-mail, nascimento e paróquia completos. Ela invalida suas sessões; não capturar nem compartilhar credenciais.
