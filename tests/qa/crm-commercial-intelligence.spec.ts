import { expect, test, type Page } from "@playwright/test";
import { qaPassword } from "./credentials";

const BASE = process.env.QA_BASE_URL || "https://crm.simbiosedigital.com";

async function login(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/e-?mail/i).fill("qa-manager@simbiosedigital.com");
  await page.getByLabel(/senha/i).fill(qaPassword());
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25_000 });
}

test("painel comercial, fila do Guilherme e MRR da pipeline", async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);

  await page.goto(`${BASE}/manager/painel`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Inteligência comercial", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Leads criados", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Interno", exact: true }).click();
  await expect(page.getByText("Pipeline aprovado", { exact: true })).toBeVisible();
  await expect(page.getByText("Aguardando nossa resposta", { exact: true })).toBeVisible();

  await page.goto(`${BASE}/conversas`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("tab", { name: "Número do Guilherme" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Conversas fora do CRM", { exact: true })).toBeVisible();
  await expect(page.getByText("Por privacidade, o CRM guarda o estado da conversa e o vínculo com o lead, não o conteúdo do WhatsApp pessoal.")).toBeVisible();

  await page.goto(`${BASE}/manager/pipeline`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Proposta realizada", { exact: true })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByText("Proposta aprovada", { exact: true })).toBeVisible();
  await expect(page.getByText("Proposta assinada / fechamento", { exact: true })).toBeVisible();
  await expect(page.getByText(/R\$.*\/mês/).first()).toBeVisible();
});

