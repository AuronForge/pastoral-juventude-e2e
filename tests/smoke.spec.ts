import { expect, test } from "@playwright/test";

const backendBaseUrl = process.env.E2E_BACKEND_BASE_URL ?? "http://127.0.0.1:3000";

test.describe("smoke da aplicação", () => {
  test("carrega a página inicial do frontend", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Pastoral da Juventude" })).toBeVisible();
  });

  test("confirma que o backend está vivo", async ({ request }) => {
    const response = await request.get(`${backendBaseUrl}/health/live`);

    expect(response.status()).toBe(200);
  });

  test("confirma que o backend está pronto", async ({ request }) => {
    const response = await request.get(`${backendBaseUrl}/health/ready`);

    expect(response.status()).toBe(200);
  });
});
