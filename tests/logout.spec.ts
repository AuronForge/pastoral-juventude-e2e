import { expect, test, type Page } from "@playwright/test";

const logoutEndpoint = "**/api/v1/autenticacao/logout";
function problem(status: number, codigo: string, endpoint: string) {
  return {
    status,
    codigo,
    titulo: "Erro",
    mensagem: "Detalhe interno",
    endpoint,
    timestamp: new Date().toISOString(),
    correlationId: "00000000-0000-4000-8000-000000000001",
  };
}
async function signIn(page: Page) {
  let signedIn = false;
  await page.route("**/api/v1/autenticacao/renovar-token", (route) =>
    signedIn
      ? route.fulfill({
          json: { accessToken: "renewed-example", tokenType: "Bearer", expiresIn: 900 },
        })
      : route.fulfill({
          status: 400,
          json: problem(400, "TOKEN_REFRESH_AUSENTE", "/api/v1/autenticacao/renovar-token"),
        }),
  );
  await page.route("**/api/v1/autenticacao/login", (route) => {
    signedIn = true;
    return route.fulfill({
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
  return { signOut: () => (signedIn = false) };
}

test("Sair pelo App Shell encerra a sessão e o Login informa a saída", async ({ page }) => {
  const session = await signIn(page);
  let requests = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(logoutEndpoint, async (route) => {
    requests++;
    expect(route.request().method()).toBe("POST");
    expect(route.request().postData()).toBeNull();
    expect(route.request().headers().authorization).toBeUndefined();
    await pending;
    session.signOut();
    await route.fulfill({
      status: 204,
      headers: {
        "Set-Cookie":
          "refresh_token=; HttpOnly; SameSite=Lax; Path=/api/v1/autenticacao; Max-Age=0",
      },
    });
  });
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("button", { name: "Sair" })
    .click();
  await expect(page).toHaveURL(/\/sair$/);
  await expect(page.getByRole("heading", { name: "Encerrar acesso" })).toBeVisible();
  await expect(page.getByText("Você pode encerrar seu acesso quando terminar.")).toBeVisible();
  await page.getByRole("button", { name: "Sair" }).click();
  release();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Você saiu")).toBeVisible();
  await expect(page.getByText("Seu acesso foi encerrado.")).toBeVisible();
  expect(requests).toBe(1);
  expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("falha ao sair mantém a sessão e permite tentar novamente", async ({ page }) => {
  await signIn(page);
  let requests = 0;
  await page.route(logoutEndpoint, (route) => {
    requests++;
    return requests === 1
      ? route.fulfill({
          status: 503,
          json: problem(503, "SERVICO_INDISPONIVEL", "/api/v1/autenticacao/logout"),
        })
      : route.fulfill({ status: 204 });
  });
  await page.goto("/sair");
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page.getByText("Não foi possível sair")).toBeVisible();
  await expect(page).toHaveURL(/\/sair$/);
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Você saiu")).toBeVisible();
  expect(requests).toBe(2);
});

test("acesso anônimo a /sair redireciona para o Login", async ({ page }) => {
  await page.route("**/api/v1/autenticacao/renovar-token", (route) =>
    route.fulfill({
      status: 400,
      json: problem(400, "TOKEN_REFRESH_AUSENTE", "/api/v1/autenticacao/renovar-token"),
    }),
  );
  let requests = 0;
  await page.route(logoutEndpoint, (route) => {
    requests++;
    return route.fulfill({ status: 204 });
  });
  await page.goto("/sair");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  expect(requests).toBe(0);
});
