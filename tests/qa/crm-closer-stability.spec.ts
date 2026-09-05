import { expect, test } from "@playwright/test";
import { qaPassword } from "./credentials";

const BASE = process.env.QA_BASE_URL || "https://crm.simbiosedigital.com";
const EMAIL = process.env.QA_CLOSER_EMAIL || "qa-closer@simbiosedigital.com";
const LEAD_NAME = process.env.QA_CLOSER_LEAD || "QA Codex Closer";

test("Closer salva etapa, oferta e observação sem travar", async ({ page }) => {
  test.setTimeout(120_000);
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${String(error)}`));
  page.on("response", (response) => {
    if (response.status() >= 400 && !/favicon/.test(response.url())) {
      failures.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/e-?mail/i).fill(EMAIL);
  await page.getByLabel(/senha/i).fill(qaPassword());
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25_000 });

  await page.goto(`${BASE}/closer`, { waitUntil: "domcontentloaded" });
  const card = page.locator("button.flex-1", { hasText: LEAD_NAME }).first();
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByRole("heading", { name: LEAD_NAME })).toBeVisible();

  const stageBox = page.locator("div.space-y-2", {
    has: page.getByText("Estágio do Funil", { exact: true }),
  }).getByRole("combobox");
  await stageBox.click();
  await page.getByRole("option", { name: "Reunião realizada", exact: true }).click();

  const offerBox = page.locator("div.space-y-2", {
    has: page.getByText("Oferta comercial", { exact: true }),
  }).getByRole("combobox");
  await offerBox.click();
  await page.getByRole("option", { name: "Demanda", exact: true }).click();

  const note = `QA closer ${new Date().toISOString()}`;
  await page.getByPlaceholder(/Notas sobre negociação/i).fill(note);
  await page.getByRole("button", { name: "Salvar Qualificação" }).click();
  await expect(page.getByText(/Lead .* atualizado com sucesso/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: LEAD_NAME })).toBeVisible();
  expect(failures).toEqual([]);
});
