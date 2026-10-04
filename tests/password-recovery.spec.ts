import { expect, test, type Page } from "@playwright/test";
const recovery = "**/api/v1/autenticacao/recuperar-senha";
test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/autenticacao/renovar-token", (route) =>
    route.fulfill({
      status: 400,
      json: {
        status: 400,
        codigo: "TOKEN_REFRESH_AUSENTE",
        titulo: "Sessão inexistente",
        mensagem: "Entre novamente",
        endpoint: "/api/v1/autenticacao/renovar-token",
      },
    }),
  );
});
async function fill(page: Page) {
  await page.goto("/recuperar-senha");
  await page.getByLabel(/^Nome completo/).fill(" Maria Silva ");
  await page.getByLabel(/^E-mail/).fill("MARIA@REGRESSAO.INVALID");
  await page.getByLabel(/^Data de nascimento/).fill("29/02/2000");
  await page.getByLabel(/^Paróquia/).fill(" São  João ");
}
const submit = (page: Page) => page.getByRole("button", { name: "Ver minha senha temporária" });
test("login oferece recuperação e valida os quatro dados sem chamar API", async ({ page }) => {
  let calls = 0;
  await page.route(recovery, (route) => {
    calls++;
    return route.abort();
  });
  await page.goto("/login");
  await page.getByRole("link", { name: "Esqueci minha senha" }).click();
  await expect(page).toHaveURL(/\/recuperar-senha$/u);
  await submit(page).click();
  await expect(page.getByLabel(/^Nome completo/)).toBeFocused();
  await fill(page);
  await page.getByLabel(/^Data de nascimento/).fill("29/02/2001");
  await submit(page).click();
  await expect(page.getByText(/data válida no formato/)).toBeVisible();
  expect(calls).toBe(0);
});
test("recuperação segue por login temporário, troca obrigatória e novo login", async ({ page }) => {
  let requests = 0;
  const temporary = "temporary-fixture-only";
  await page.route(recovery, async (route) => {
    requests++;
    expect(route.request().postDataJSON()).toEqual({
      nome: "Maria Silva",
      email: "maria@regressao.invalid",
      dataNascimento: "2000-02-29",
      nomeParoquia: "São João",
    });
    await route.fulfill({
      status: 200,
      json: {
        senhaTemporaria: temporary,
        expiraEm: new Date(Date.now() + 900000).toISOString(),
        trocaSenhaObrigatoria: true,
      },
    });
  });
  let logins = 0;
  await page.route("**/api/v1/autenticacao/login", (route) => {
    logins++;
    return route.fulfill({
      status: 200,
      json:
        logins === 1
          ? {
              tokenTrocaSenha: "restricted-fixture",
              tokenType: "TROCA_SENHA",
              expiresIn: 900,
              trocaSenhaObrigatoria: true,
            }
          : { accessToken: "normal-fixture", tokenType: "Bearer", expiresIn: 900 },
    });
  });
  await page.route("**/api/v1/autenticacao/alterar-senha", (route) =>
    route.fulfill({ status: 204 }),
  );
  await fill(page);
  await submit(page).click();
  await expect(page.getByRole("heading", { name: "Sua senha temporária" })).toBeFocused();
  await expect(page.getByText(temporary)).toBeVisible();
  await expect(page.getByRole("button", { name: /Pedir outra em/ })).toBeDisabled();
  expect(requests).toBe(1);
  expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]))).not.toContain(
    temporary,
  );
  await page.getByRole("button", { name: "Voltar para entrar" }).click();
  await expect(page.getByText(temporary)).toHaveCount(0);
  await page.getByLabel(/^E-mail/).fill("maria@regressao.invalid");
  await page.getByLabel(/^Senha/).fill(temporary);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/alterar-senha$/u);
  await page.getByLabel(/^Nova senha/).fill("DefinitivaFixture123!");
  await page.getByLabel(/^Repita a nova senha/).fill("DefinitivaFixture123!");
  await page.getByRole("button", { name: "Salvar senha" }).click();
  await expect(page).toHaveURL(/\/login$/u);
  await page.getByLabel(/^E-mail/).fill("maria@regressao.invalid");
  await page.getByLabel(/^Senha/).fill("DefinitivaFixture123!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Pastoral da Juventude" })).toBeVisible();
});
for (const [status, codigo, title] of [
  [404, "DADOS_RECUPERACAO_NAO_LOCALIZADOS", "Não foi possível confirmar seus dados"],
  [409, "RECUPERACAO_SENHA_EM_ANDAMENTO", "Já existe uma recuperação em andamento"],
  [403, "USUARIO_INATIVO", "Esta conta está inativa"],
  [429, "LIMITE_TENTATIVAS_EXCEDIDO", "Muitas tentativas"],
  [503, "SERVICO_INDISPONIVEL", "Não foi possível recuperar sua senha"],
] as const)
  test(`recuperação trata ${codigo} sem gerar nova senha`, async ({ page }) => {
    let calls = 0;
    await page.route(recovery, (route) => {
      calls++;
      return route.fulfill({
        status,
        headers: status === 429 ? { "Retry-After": "1800" } : {},
        json: {
          status,
          codigo,
          titulo: "Erro",
          mensagem: "Campo específico divergente",
          endpoint: "/api/v1/autenticacao/recuperar-senha",
        },
      });
    });
    await fill(page);
    await submit(page).click();
    await expect(page.getByRole("alert")).toContainText(title);
    await expect(page.getByText("Campo específico divergente")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Sua senha temporária" })).toHaveCount(0);
    if (status === 429) {
      await expect(submit(page)).toBeDisabled();
      expect(calls).toBe(1);
    }
  });
test("formulário mobile permite teclado e não ultrapassa a viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 935 });
  await fill(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByLabel(/^Paróquia/).focus();
  await page.keyboard.press("Tab");
  await expect(submit(page)).toBeFocused();
  expect((await submit(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
});
