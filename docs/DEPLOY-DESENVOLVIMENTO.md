# Smoke após deploy

O workflow de infraestrutura constrói este Dockerfile e executa o Playwright
na rede `pastoral-dev_app` depois dos healthchecks. Usa `http://traefik` para
frontend e `http://backend:3000` para as rotas técnicas. Nenhuma rota técnica
precisa ser exposta na Internet. O container encerra ao concluir a suíte.

O commit E2E é fixado por `DEV_E2E_REF` (SHA completo) na configuração da infra;
atualize essa variável após aprovar mudanças nesta suíte.
Os relatórios são anexados à execução de deploy por 14 dias. Falhas deixam o
workflow vermelho e não promovem o estado implantado como última versão validada.

Hoje a suíte cobre página inicial e `/health/live` e `/health/ready`.
Login funcional depende da integração da tela à aplicação e da preparação de
usuários de teste; não é certificado por estes smoke tests.
