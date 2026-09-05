import { test } from "@playwright/test";
import { qaPassword } from "./credentials";

const BASE = process.env.QA_BASE_URL || "https://crm.simbiosedigital.com";

test("o que trava no /leads", async ({ page }) => {
  test.setTimeout(120000);
  const pendentes = new Map<string, number>();
  page.on("request", (r) => {
    if (r.url().includes("supabase")) pendentes.set(r.url().slice(0, 160) + "#" + Date.now(), Date.now());
  });
  page.on("requestfinished", (r) => {
    const chave = [...pendentes.keys()].find((k) => k.startsWith(r.url().slice(0, 160)));
    if (chave) {
      const ms = Date.now() - pendentes.get(chave)!;
      if (ms > 1500) console.log(`  [lenta ${ms}ms] ${r.url().slice(30, 150)}`);
      pendentes.delete(chave);
    }
  });
  page.on("requestfailed", (r) => console.log(`  [FALHOU] ${r.url().slice(0, 140)} → ${r.failure()?.errorText}`));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log(`  [${m.type()}] ${m.text().slice(0, 180)}`); });
  page.on("pageerror", (e) => console.log(`  [pageerror] ${String(e).slice(0, 200)}`));

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/e-?mail/i).fill("qa-sdr@simbiosedigital.com");
  await page.getByLabel(/senha/i).fill(qaPassword());
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForTimeout(5000);

  console.log("--- indo pro /leads ---");
  const t0 = Date.now();
  await page.goto(`${BASE}/leads`, { waitUntil: "domcontentloaded" });
  for (let s = 5; s <= 30; s += 5) {
    await page.waitForTimeout(5000);
    const linhas = await page.locator("tr").count();
    const busca = await page.getByPlaceholder(/CNPJ, nome|buscar/i).count();
    const spinner = await page.locator("[class*='animate-spin'],[class*='skeleton'],[class*='loading' i]").count();
    console.log(`  t+${s}s: tr=${linhas} busca=${busca} spinners=${spinner} pendentes=${pendentes.size}`);
    if (linhas > 3) break;
  }
  for (const k of pendentes.keys()) console.log(`  [PENDENTE >fim] ${k.slice(30, 170)}`);
  const corpo = (await page.locator("body").innerText()).slice(0, 300).replace(/\n+/g, " | ");
  console.log("  corpo:", corpo);
  console.log("  tempo total:", ((Date.now() - t0) / 1000).toFixed(1), "s");
});
