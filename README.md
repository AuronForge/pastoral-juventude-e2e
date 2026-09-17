# Pastoral da Juventude — E2E

Suíte de testes End-to-End do MVP da Pastoral da Juventude, implementada exclusivamente com Playwright.

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
