import { test } from "@playwright/test";
import { qaPassword } from "./credentials";

const BASE = process.env.QA_BASE_URL || "https://crm.simbiosedigital.com";

test("executar tarefa avança a cadência (manager/cadencia)", async ({ page }) => {
  test.setTimeout(150000);
  page.on("pageerror", (e) => console.log(`  [PAGEERROR] ${String(e).slice(0, 200)}`));
  page.on("response", async (r) => {
    if (r.status() >= 400 && !/favicon/.test(r.url())) {
      let b = ""; try { b = (await r.text()).slice(0, 150); } catch {}
      console.log(`  [HTTP ${r.status()}] ${decodeURIComponent(r.url()).slice(40, 120)} → ${b}`);
    }
  });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/e-?mail/i).fill("qa-manager@simbiosedigital.com");
  await page.getByLabel(/senha/i).fill(qaPassword());
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForTimeout(4000);
  await page.goto(`${BASE}/manager/cadencia`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(7000);

  const cartao = page.locator("div").filter({ hasText: /QA CADENCIA/i }).filter({ has: page.getByRole("button", { name: /^Executar$/ }) }).last();
  console.log("  cartão com Executar:", await cartao.count());
  await cartao.getByRole("button", { name: /^Executar$/ }).click();
  await page.waitForTimeout(2000);

  const dlg = page.locator("[role='dialog']");
  console.log("  modal aberto:", await dlg.count(), "| título:", (await dlg.innerText().catch(() => "")).slice(0, 40).replace(/\n/g, " "));
  const combos = dlg.locator("button[role='combobox']");
  await combos.nth(0).click(); await page.getByRole("option", { name: /whatsapp/i }).first().click();
  await page.waitForTimeout(400);
  await combos.nth(1).click(); await page.getByRole("option", { name: /respondeu|conectado/i }).first().click();
  await dlg.getByRole("button", { name: /registrar e avançar/i }).click();
  await page.waitForTimeout(3500);
  const toasts = await page.locator("[role='status']").allTextContents();
  console.log("  toasts:", toasts.join(" | ").slice(0, 160) || "(nenhum)");
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  console.log("  ainda na fila após reload:", await page.locator("div").filter({ hasText: /QA CADENCIA/i }).filter({ has: page.getByRole("button", { name: /^Executar$/ }) }).count());
});
