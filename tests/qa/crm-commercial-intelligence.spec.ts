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
  await expect(page.getByText("Receita, custo e payback", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Investimento total", { exact: true })).toBeVisible();
  await expect(page.getByText("MRR em propostas", { exact: true })).toBeVisible();
  await expect(page.getByText("MRR aprovado", { exact: true })).toBeVisible();
  await expect(page.getByText("MRR contratado atual", { exact: true })).toBeVisible();
  await expect(page.getByText(/R\$\s*3\.000,00/).first()).toBeVisible();
  await expect(page.getByText("Meta sincronizada", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Custos por campanha", exact: true }).click();
  await expect(page.getByText("Campanha Meta", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Operação interna", exact: true }).click();
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

  await page.goto(`${BASE}/criativos`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("Inventário real da conta de anúncios")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /Em veiculação/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Já veiculados/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Todos no Meta/ })).toBeVisible();

  await page.goto(`${BASE}/leads`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Novo lead" }).click();
  await expect(page.getByText("Cadastrar novo lead", { exact: true })).toBeVisible();
  await page.getByLabel(/Como chegou/).click();
  await expect(page.getByRole("option", { name: "Live", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Diagnóstico", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Outbound", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Indicação", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
});
