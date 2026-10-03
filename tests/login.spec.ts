import { expect, test, type Page, type Route } from "@playwright/test";

const endpoint = "**/api/v1/autenticacao/login";
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
        timestamp: new Date().toISOString(),
        correlationId: "00000000-0000-4000-8000-000000000001",
      },
    }),
  );
});
const credentials = { email: "login@regressao.invalid", senha: "SenhaExemplo123!" };
async function fill(page: Page) {
  await page.goto("/login");
  await page.getByLabel(/^E-mail/).fill(credentials.email);
  await page.getByLabel(/^Senha/).fill(credentials.senha);
}
async function problem(route: Route, status: number, headers: Record<string, string> = {}) {
  await route.fulfill({
    status,
    headers: {
      ...headers,
      "Access-Control-Allow-Origin": route.request().headers().origin ?? "*",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Expose-Headers": "Retry-After",
    },
    json: {
      timestamp: new Date().toISOString(),
      status,
      codigo: status === 401 ? "CREDENCIAIS_INVALIDAS" : "EXEMPLO",
      titulo: "Erro",
      mensagem: "Detalhe interno",
      endpoint: "/api/v1/autenticacao/login",
      correlationId: "00000000-0000-4000-8000-000000000001",
    },
  });
}

test("acesso anônimo redireciona para Login e mantém opções indisponíveis", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("checkbox", { name: /Continuar conectado/ })).toBeDisabled();
  await expect(page.getByRole("link", { name: /Esqueci minha senha/ })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});
test("loading bloqueia duplicação e sucesso navega para a rota protegida", async ({ page }) => {
  let requests = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(endpoint, async (route) => {
    requests++;
    await pending;
    await route.fulfill({ json: { accessToken: "example", tokenType: "Bearer", expiresIn: 900 } });
  });
  await fill(page);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("form")).toHaveAttribute("aria-busy", "true");
  await page.getByLabel(/^Senha/).press("Enter");
  expect(requests).toBe(1);
  release();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Pastoral da Juventude" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
});
test("401 preserva e-mail, limpa senha e devolve foco", async ({ page }) => {
  await page.route(endpoint, (route) => problem(route, 401));
  await fill(page);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("E-mail ou senha incorretos")).toBeVisible();
  await expect(page.getByLabel(/^E-mail/)).toHaveValue(credentials.email);
  await expect(page.getByLabel(/^Senha/)).toHaveValue("");
  await expect(page.getByLabel(/^Senha/)).toBeFocused();
  await expect(page.getByText("Detalhe interno")).toHaveCount(0);
});
test("429 respeita prazo recebido e libera nova tentativa", async ({ page }) => {
  let requests = 0;
  await page.route(endpoint, (route) => {
    requests++;
    return problem(route, 429, { "Retry-After": "2" });
  });
  await fill(page);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeDisabled();
  await expect(page.getByText(/segundos/)).toBeVisible();
  expect(requests).toBe(1);
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeEnabled({
    timeout: 5000,
  });
  await expect(page.getByLabel(/^Senha/)).toHaveValue(credentials.senha);
});
test("429 sem Retry-After não inventa contador", async ({ page }) => {
  await page.route(endpoint, (route) => problem(route, 429));
  await fill(page);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("Limite de tentativas atingido")).toBeVisible();
  await expect(page.getByText(/segundos/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeEnabled();
});
for (const failure of ["network", 500, 503] as const) {
  test(`${failure} preserva credenciais e permite repetição`, async ({ page }) => {
    await page.route(endpoint, (route) =>
      failure === "network" ? route.abort() : problem(route, failure),
    );
    await fill(page);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByText("Não foi possível entrar")).toBeVisible();
    await expect(page.getByLabel(/^Senha/)).toHaveValue(credentials.senha);
    await expect(page.getByLabel(/^E-mail/)).toHaveValue(credentials.email);
    await expect(page.getByRole("button", { name: "Entrar", exact: true })).toBeEnabled();
  });
}
test("primeiro acesso exige troca e novo Login, com token restrito no request", async ({
  page,
}) => {
  await page.route(endpoint, (route) =>
    route.fulfill({
      json: {
        tokenTrocaSenha: "restricted-example",
        tokenType: "TROCA_SENHA",
        expiresIn: 900,
        trocaSenhaObrigatoria: true,
      },
    }),
  );
  await page.route("**/api/v1/autenticacao/alterar-senha", async (route) => {
    expect(route.request().headers().authorization).toBe("Bearer restricted-example");
    expect(route.request().postDataJSON()).toEqual({
      novaSenha: "NovaSenha123!",
      confirmacaoNovaSenha: "NovaSenha123!",
    });
    await route.fulfill({ status: 204 });
  });
  await fill(page);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/alterar-senha$/);
  await page.getByLabel(/^Nova senha/).fill("NovaSenha123!");
  await page.getByLabel(/^Repita a nova senha/).fill("NovaSenha123!");
  await page.getByRole("button", { name: "Salvar senha" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Senha alterada")).toBeVisible();
  await expect(page.getByLabel(/^Senha/)).toHaveValue("");
});
