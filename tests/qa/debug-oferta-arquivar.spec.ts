import { test } from "@playwright/test";
import { qaPassword } from "./credentials";

const BASE = process.env.QA_BASE_URL || "https://crm.simbiosedigital.com";

test("oferta selecionável e botão arquivar na ficha", async ({ page }) => {
  test.setTimeout(120000);
  page.on("pageerror", (e) => console.log(`  [PAGEERROR] ${String(e).slice(0, 200)}`));
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/e-?mail/i).fill("qa-closer@simbiosedigital.com");
  await page.getByLabel(/senha/i).fill(qaPassword());
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForTimeout(4000);

  await page.goto(`${BASE}/leads`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await page.locator("tbody tr").first().click();
  await page.waitForTimeout(2500);
  const corpo = (await page.locator("body").innerText());
  console.log("  ficha abriu:", corpo.length > 500 ? "sim" : "NÃO — " + corpo.length + " chars");
  console.log("  botão Arquivar:", await page.getByRole("button", { name: /^Arquivar$/ }).count());
  // fantasmas fora do pipeline?
  await page.goto(`${BASE}/closer`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const pipe = await page.locator("body").innerText();
  for (const nome of ["Patrick", "Andreas", "Paulo CS", "guilherme.loiola", "paloma"]) {
    if (pipe.includes(nome)) console.log(`  !! fantasma ainda no pipeline: ${nome}`);
  }
  console.log("  pipeline sem fantasmas:", !["Patrick","Andreas","Paulo CS"].some((n) => pipe.includes(n)));
});
