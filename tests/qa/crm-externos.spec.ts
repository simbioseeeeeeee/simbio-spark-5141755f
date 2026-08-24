import { test, expect, Page } from "@playwright/test";
import { qaPassword } from "./credentials";

// TESTES EXTERNOS REAIS — aprovados pelo CEO (21/08), executados UMA vez.
// Alvo: lead QA-0006-externo, cujo telefone é o do próprio Guilherme.
// Só roda com QA_EXTERNOS=1 pra não disparar de novo em execuções futuras.

const BASE = process.env.QA_BASE_URL || "https://crm.simbiosedigital.com";
const LIGADO = process.env.QA_EXTERNOS === "1";

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/senha/i).fill(qaPassword());
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 25000 });
  await page.waitForTimeout(1500);
}

async function abreFicha(page: Page, busca: string) {
  await page.goto(`${BASE}/leads`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  // a busca é dentro da aba ativa — vai pra "Todos" antes de procurar
  const todos = page.getByRole("button", { name: /^Todos/ }).first();
  if (await todos.count()) { await todos.click(); await page.waitForTimeout(2000); }
  await page.getByPlaceholder(/CNPJ, nome/i).first().fill(busca);
  await page.waitForTimeout(2500);
  await page.locator("tr", { hasText: busca }).first().click();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /editar \/ avançar/i }).click();
  await page.waitForTimeout(2000);
}

test.skip(!LIGADO, "externos desligados (rode com QA_EXTERNOS=1)");

test("botão Larissa liga e WhatsApp oficial (efeito real)", async ({ page }) => {
  test.setTimeout(180000);
  const respostas: string[] = [];
  page.on("response", async (r) => {
    if (r.url().includes("/api/crm/")) {
      let b = ""; try { b = (await r.text()).slice(0, 200); } catch {}
      respostas.push(`${r.url().split("/api/")[1]} → HTTP ${r.status()} ${b}`);
    }
  });

  await login(page, "qa-manager@simbiosedigital.com");
  await abreFicha(page, "QA Zeta");

  // ── 1. Larissa liga (dispara Vapi de verdade) ──
  const ligar = page.getByRole("button", { name: /larissa liga/i });
  await ligar.click();
  await page.waitForTimeout(6000);
  const toastLigar = await page.locator("li[role='status'], [role='status']").allTextContents();
  console.log("  toast da ligação:", toastLigar.join(" | ").slice(0, 200));

  // ── 2. WhatsApp oficial (envia mensagem de verdade) ──
  await page.getByRole("button", { name: /whatsapp oficial/i }).click();
  await page.waitForTimeout(800);
  const ta = page.getByPlaceholder(/mensagem que sai/i);
  await ta.fill("Teste de QA do CRM — mensagem enviada pelo botão da ficha. Pode ignorar 🙂");
  await page.getByRole("button", { name: /^enviar$/i }).click();
  await page.waitForTimeout(6000);
  const toastWpp = await page.locator("li[role='status'], [role='status']").allTextContents();
  console.log("  toast do WhatsApp:", toastWpp.join(" | ").slice(0, 220));

  console.log("\n===== RESPOSTAS DA API =====");
  respostas.forEach((r) => console.log("  " + r));
  expect(respostas.length).toBeGreaterThan(0);
});
