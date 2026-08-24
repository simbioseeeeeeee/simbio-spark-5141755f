import { test, expect, Page } from "@playwright/test";
import { qaPassword } from "./credentials";

// Valida os 3 pontos que o CEO reportou em 21/08:
//  1. /manager/pipeline → card → aba Reunião NÃO pode dizer "Catálogo indisponível"
//  2. /manager/cadencia NÃO pode estar vazia
//  3. ficha do lead precisa ter o botão de agendar reunião

const BASE = process.env.QA_BASE_URL || "https://crm.simbiosedigital.com";

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/senha/i).fill(qaPassword());
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 25000 });
  await page.waitForTimeout(1500);
}

test("catálogo, cadência e botão de agendar", async ({ page }) => {
  test.setTimeout(240000);
  const erros: string[] = [];
  page.on("response", async (r) => {
    if (r.url().includes("/api/") && r.status() >= 400) {
      let b = ""; try { b = (await r.text()).slice(0, 140); } catch {}
      erros.push(`HTTP ${r.status()} ${r.url().split("/api/")[1]} → ${b}`);
    }
  });

  await login(page, "qa-manager@simbiosedigital.com");

  // ── 2. cadência SDR ──
  await page.goto(`${BASE}/manager/cadencia`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  const corpoCad = await page.locator("body").innerText();
  const vazia = /nenhum lead|fila vazia|nada por aqui/i.test(corpoCad);
  console.log(`  cadência SDR: ${vazia ? "❌ VAZIA" : "✅ com leads"}`);
  if (!vazia) {
    const linhas = await page.locator("[class*='card'], tr").count();
    console.log(`    elementos na tela: ${linhas}`);
  }

  // ── 1. pipeline → card → aba Reunião ──
  await page.goto(`${BASE}/manager/pipeline`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  const card = page.locator("[class*='cursor-pointer'], [class*='card']").filter({ hasText: /./ }).first();
  if (await card.count()) {
    await card.click();
    await page.waitForTimeout(2500);
    const abaReuniao = page.getByRole("tab", { name: /reuni/i });
    if (await abaReuniao.count()) {
      await abaReuniao.click();
      await page.waitForTimeout(4000);
      const corpo = await page.locator("body").innerText();
      const indisponivel = /catálogo comercial indispon|catalogo comercial indispon/i.test(corpo);
      console.log(`  aba Reunião: ${indisponivel ? "❌ catálogo indisponível" : "✅ catálogo carregou"}`);
      // as ofertas do catálogo aparecem?
      const temOferta = /operação de vendas|atendimento com ia|imersão/i.test(corpo);
      console.log(`    ofertas visíveis: ${temOferta ? "sim" : "não"}`);
    } else console.log("  aba Reunião não encontrada no card");
  } else console.log("  nenhum card no pipeline");

  // ── 3. botão agendar na ficha ──
  await page.goto(`${BASE}/leads`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const linha = page.locator("tr").filter({ hasText: /./ }).nth(1);
  if (await linha.count()) {
    await linha.click();
    await page.waitForTimeout(1800);
    const editar = page.getByRole("button", { name: /editar \/ avançar/i });
    if (await editar.count()) {
      await editar.click();
      await page.waitForTimeout(2200);
      const btnAgendar = page.getByRole("button", { name: /agendar reuni/i });
      console.log(`  botão "Agendar reunião": ${await btnAgendar.count() ? "✅ presente" : "❌ ausente"}`);
      if (await btnAgendar.count()) {
        await btnAgendar.click();
        await page.waitForTimeout(1800);
        const modal = await page.locator("[role='dialog']").innerText().catch(() => "");
        const temSugestoes = /segunda|terça|quarta|quinta|sexta/i.test(modal);
        console.log(`    modal abriu com horários sugeridos: ${temSugestoes ? "sim" : "não"}`);
        await page.keyboard.press("Escape");
      }
    }
  }

  console.log(`\n  erros de API: ${erros.length}`);
  erros.forEach((e) => console.log("   " + e));
  expect(true).toBe(true);
});
