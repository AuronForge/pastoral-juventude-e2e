import { expect, test } from "@playwright/test";

const endpoint = "**/api/v1/autenticacao/renovar-token";
function problem(status: number, codigo: string) {
  return {
    status,
    codigo,
    titulo: "Sessão",
    mensagem: "Entre novamente",
    endpoint: "/api/v1/autenticacao/renovar-token",
    timestamp: new Date().toISOString(),
    correlationId: "00000000-0000-4000-8000-000000000001",
  };
}
test("reload restaura com cookie HttpOnly sem storage e respeita o limite de três renovações", async ({
  page,
}) => {
  let signedIn = false;
  let renewals = 0;
  await page.route(endpoint, async (route) => {
    expect(route.request().postData()).toBeNull();
    if (!signedIn)
      return route.fulfill({ status: 400, json: problem(400, "TOKEN_REFRESH_AUSENTE") });
    renewals++;
    if (renewals > 3) return route.fulfill({ status: 401, json: problem(401, "SESSAO_EXPIRADA") });
    await route.fulfill({
      json: { accessToken: "renewed-example", tokenType: "Bearer", expiresIn: 900 },
    });
  });
  await page.route("**/api/v1/autenticacao/login", async (route) => {
    signedIn = true;
    await route.fulfill({
      headers: {
        "Set-Cookie":
          "refresh_token=fixture-cookie; HttpOnly; SameSite=Lax; Path=/api/v1/autenticacao",
      },
      json: { accessToken: "login-example", tokenType: "Bearer", expiresIn: 900 },
    });
  });
  await page.goto("/login");
  await page.getByLabel(/^E-mail/).fill("login@regressao.invalid");
  await page.getByLabel(/^Senha/).fill("SenhaExemplo123!");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  for (let i = 0; i < 3; i++) {
    await page.reload();
    await expect(page.getByRole("heading", { name: "Pastoral da Juventude" })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
    expect(await page.evaluate(() => document.cookie.includes("refresh_token"))).toBe(false);
  }
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Tempo esgotado")).toBeVisible();
  expect(renewals).toBe(4);
});
test("aguarda resposta sem exibir login e oferece nova tentativa em 503", async ({ page }) => {
  let requests = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(endpoint, async (route) => {
    requests++;
    if (requests === 1) {
      await pending;
      return route.fulfill({ status: 503, json: problem(503, "SERVICO_INDISPONIVEL") });
    }
    await route.fulfill({
      json: { accessToken: "restored-example", tokenType: "Bearer", expiresIn: 900 },
    });
  });
  await page.goto("/");
  await expect(page.getByRole("progressbar", { name: "Restaurando sua sessão" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Entrar" })).toHaveCount(0);
  expect(requests).toBe(1);
  release();
  await expect(page.getByText("Não foi possível restaurar sua sessão")).toBeVisible();
  await page.getByRole("button", { name: "Tentar novamente" }).click();
  await expect(page.getByRole("heading", { name: "Pastoral da Juventude" })).toBeVisible();
  expect(requests).toBe(2);
});
for (const [status, code, title] of [
  [409, "SESSAO_SUBSTITUIDA", "Sessão substituída"],
  [403, "USUARIO_BLOQUEADO", "Usuário bloqueado"],
  [403, "USUARIO_INATIVO", "Usuário inativo"],
] as const) {
  test(`encerra restauração com ${code}`, async ({ page }) => {
    await page.route(endpoint, (route) => route.fulfill({ status, json: problem(status, code) }));
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByText(title)).toBeVisible();
  });
}
