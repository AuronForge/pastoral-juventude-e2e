import { expect, test } from "@playwright/test";

const enabled = process.env.E2E_AUTH_LIVE === "true";
const environment = process.env.E2E_ENVIRONMENT;
function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável obrigatória: ${name}`);
  return value;
}
if (enabled && !["local", "desenvolvimento", "homologacao"].includes(environment ?? ""))
  throw new Error("Autenticação real exige ambiente regressivo permitido.");
const normalEmail = enabled ? required("E2E_NORMAL_EMAIL") : "";
const requiredEmail = enabled ? required("E2E_REQUIRED_CHANGE_EMAIL") : "";
if (
  enabled &&
  (!normalEmail.endsWith("@regressao.invalid") ||
    !requiredEmail.endsWith("@regressao.invalid") ||
    normalEmail === requiredEmail)
)
  throw new Error("Use duas contas exclusivas e distintas em regressao.invalid.");
const normalPassword = enabled ? required("E2E_NORMAL_PASSWORD") : "";
const temporaryPassword = enabled ? required("E2E_TEMPORARY_PASSWORD") : "";
const finalPassword = enabled ? required("E2E_FINAL_PASSWORD") : "";
if (enabled && (finalPassword === temporaryPassword || !/^\S{8,128}$/u.test(finalPassword)))
  throw new Error("A senha definitiva deve ser distinta e atender aos critérios.");

test.describe("autenticação com API real", () => {
  test.skip(!enabled, "Ative E2E_AUTH_LIVE com massa exclusiva previamente preparada.");
  test("Login normal cria cookie HttpOnly e acesso somente em memória", async ({
    page,
    context,
  }) => {
    await page.goto("/login");
    await page.getByLabel(/^E-mail/).fill(normalEmail);
    await page.getByLabel(/^Senha/).fill(normalPassword);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    const cookie = (await context.cookies()).find((item) => item.name === "refresh_token");
    expect(Boolean(cookie)).toBe(true);
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie?.path).toBe("/api/v1/autenticacao");
    if (new URL(process.env.E2E_FRONTEND_BASE_URL ?? "http://localhost").protocol === "https:")
      expect(cookie?.secure).toBe(true);
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
  });
  test("senha temporária exige troca, não cria sessão e nova senha exige Login", async ({
    page,
    context,
  }) => {
    await page.goto("/login");
    await page.getByLabel(/^E-mail/).fill(requiredEmail);
    await page.getByLabel(/^Senha/).fill(temporaryPassword);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/alterar-senha$/);
    expect((await context.cookies()).some((item) => item.name === "refresh_token")).toBe(false);
    await page.getByLabel(/^Nova senha/).fill(finalPassword);
    await page.getByLabel(/^Repita a nova senha/).fill(finalPassword);
    await page.getByRole("button", { name: "Salvar senha" }).click();
    await expect(page.getByText("Senha alterada")).toBeVisible();
    expect((await context.cookies()).some((item) => item.name === "refresh_token")).toBe(false);
    await page.getByLabel(/^E-mail/).fill(requiredEmail);
    await page.getByLabel(/^Senha/).fill(finalPassword);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
