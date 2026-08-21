import { test } from "@playwright/test";

const BASE = process.env.QA_BASE_URL || "https://crm.simbiosedigital.com";
const SENHA = process.env.QA_SENHA || "QaSimbiose2026!";

test("por que /leads redireciona", async ({ page }) => {
  test.setTimeout(180000);
  page.on("console", (m) => console.log(`  [console.${m.type()}] ${m.text().slice(0, 220)}`));
  page.on("pageerror", (e) => console.log(`  [pageerror] ${String(e).slice(0, 220)}`));
  page.on("framenavigated", (f) => {
    if (f === page.mainFrame()) console.log(`  [nav] ${f.url()}`);
  });
  page.on("response", async (r) => {
    if (r.status() >= 400) console.log(`  [HTTP ${r.status()}] ${r.url().slice(0, 140)}`);
    if (r.url().includes("get_user_role")) {
      let b = ""; try { b = (await r.text()).slice(0, 120); } catch {}
      console.log(`  [rpc get_user_role] ${r.status()} → ${b}`);
    }
  });

  console.log("\n--- login ---");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/e-?mail/i).fill("qa-sdr@simbiosedigital.com");
  await page.getByLabel(/senha/i).fill(SENHA);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForTimeout(6000);
  console.log("  url pós-login:", page.url());

  console.log("\n--- navegação POR CLIQUE no menu (como o usuário faz) ---");
  const link = page.getByRole("link", { name: /^Leads$/ }).first();
  const achou = await link.count();
  console.log("  link 'Leads' no menu:", achou);
  if (achou) {
    await link.click();
    await page.waitForTimeout(4000);
    console.log("  url após clicar em Leads:", page.url());
    console.log("  título visível:", (await page.locator("h1, h2").first().innerText().catch(() => "?")).slice(0, 60));
  }

  console.log("\n--- navegação por URL direta (F5 na rota) ---");
  await page.goto(`${BASE}/leads`, { waitUntil: "domcontentloaded" });
  for (const ms of [500, 1500, 3000, 6000]) {
    await page.waitForTimeout(ms === 500 ? 500 : 1000);
    console.log(`  t+${ms}ms → ${page.url()}`);
  }
  const txt = (await page.locator("body").innerText()).slice(0, 200).replace(/\n+/g, " | ");
  console.log("  conteúdo:", txt);

  console.log("\n--- localStorage tem sessão? ---");
  const ls = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes("auth") || k.includes("sb-")));
  console.log("  chaves:", JSON.stringify(ls));
});
