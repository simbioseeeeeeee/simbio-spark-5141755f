import { expect, test } from "@playwright/test";
import { qaPassword } from "./credentials";

const BASE = process.env.QA_BASE_URL || "https://crm.simbiosedigital.com";

test("criativos cruza estado atual e historico da Meta sem expor credencial", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/e-?mail/i).fill("qa-manager@simbiosedigital.com");
  await page.getByLabel(/senha/i).fill(qaPassword());
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25_000 });

  const inventoryResponse = page.waitForResponse(
    (response) => response.url().includes("/api/crm/criativos/meta") && response.status() === 200,
  );
  await page.goto(`${BASE}/criativos`, { waitUntil: "domcontentloaded" });
  const response = await inventoryResponse;
  const inventory = await response.json();

  expect(inventory.summary.active_creatives).toBeGreaterThan(0);
  expect(inventory.summary.historical_creatives).toBeGreaterThan(0);
  expect(inventory.creatives.length).toBe(inventory.summary.total_meta_creatives);
  expect(JSON.stringify(inventory)).not.toContain("access_token");

  await expect(page.getByText("Inventário real da conta de anúncios")).toBeVisible();
  await expect(page.getByRole("button", { name: /Em veiculação/ })).toBeVisible();
  await expect(page.getByText("Ativo no Meta").first()).toBeVisible();

  await page.getByRole("button", { name: /Já veiculados/ }).click();
  await expect(page.getByText("Já veiculou").first()).toBeVisible();

  await page.getByRole("tab", { name: /Fila interna/ }).click();
  await expect(page.getByText("Fila interna de aprovação", { exact: true })).toBeVisible();
});
