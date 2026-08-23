import { test } from "@playwright/test";

const BASE = process.env.QA_BASE_URL || "https://crm.simbiosedigital.com";
const SENHA = process.env.QA_SENHA || "QaSimbiose2026!";

test("card branco ao clicar no lead", async ({ page }) => {
  test.setTimeout(180000);
  page.on("pageerror", (e) => console.log(`  [PAGEERROR] ${String(e).slice(0, 400)}`));
  page.on("console", (m) => { if (m.type() === "error") console.log(`  [console.error] ${m.text().slice(0, 300)}`); });
  page.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) console.log(`  [HTTP ${r.status()}] ${decodeURIComponent(r.url()).slice(30, 160)}`); });

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/e-?mail/i).fill("qa-closer@simbiosedigital.com");
  await page.getByLabel(/senha/i).fill(SENHA);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForTimeout(4000);

  console.log("--- /leads: clica na primeira linha ---");
  await page.goto(`${BASE}/leads`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const linha = page.locator("tbody tr").first();
  console.log("  linhas:", await page.locator("tbody tr").count());
  await linha.click().catch((e) => console.log("  clique falhou:", String(e).slice(0, 100)));
  await page.waitForTimeout(3000);
  let corpo = (await page.locator("body").innerText()).trim();
  console.log(`  corpo após clique: ${corpo.length} chars ${corpo.length < 50 ? "← TELA BRANCA" : "(ok)"}`);
  if (corpo.length >= 50) console.log("  trecho:", corpo.slice(0, 150).replace(/\n+/g, " | "));

  console.log("--- /closer pipeline: clica num card ---");
  await page.goto(`${BASE}/closer`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  corpo = (await page.locator("body").innerText()).trim();
  console.log(`  /closer carregou: ${corpo.length} chars`);
  const card = page.locator("[class*='card' i], [draggable]").first();
  if (await card.count()) {
    await card.click({ force: true });
    await page.waitForTimeout(3000);
    corpo = (await page.locator("body").innerText()).trim();
    console.log(`  corpo após card: ${corpo.length} chars ${corpo.length < 50 ? "← TELA BRANCA" : "(ok)"}`);
  } else console.log("  (nenhum card no pipeline)");
});
