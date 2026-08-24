import { test } from "@playwright/test";
import { qaPassword } from "./credentials";

const BASE = process.env.QA_BASE_URL || "https://crm.simbiosedigital.com";

test("leads como manager + interações", async ({ page }) => {
  test.setTimeout(180000);
  let abortadas = 0, lentas = 0;
  const inicio = new Map<string, number>();
  page.on("request", (r) => { if (r.url().includes("/rest/v1/")) inicio.set(r.url() + "#" + r.frame(), Date.now()); });
  page.on("requestfailed", (r) => { if (r.url().includes("/rest/v1/")) abortadas++; });
  page.on("requestfinished", async (r) => {
    if (!r.url().includes("/rest/v1/")) return;
    const t = inicio.get(r.url() + "#" + r.frame());
    if (t && Date.now() - t > 2000) { lentas++; console.log(`  [lenta ${Date.now() - t}ms] ${decodeURIComponent(r.url()).slice(40, 160)}`); }
  });
  page.on("pageerror", (e) => console.log(`  [pageerror] ${String(e).slice(0, 200)}`));

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/e-?mail/i).fill("qa-manager@simbiosedigital.com");
  await page.getByLabel(/senha/i).fill(qaPassword());
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForTimeout(5000);

  console.log("--- /leads como manager ---");
  let t0 = Date.now();
  await page.goto(`${BASE}/leads`, { waitUntil: "domcontentloaded" });
  await page.locator("tr").nth(3).waitFor({ timeout: 60000 }).catch(() => console.log("  !! tabela não apareceu em 60s"));
  console.log(`  tabela em ${(Date.now() - t0) / 1000}s · abortadas até aqui: ${abortadas}`);

  console.log("--- clica na aba Todos (60k) ---");
  t0 = Date.now(); abortadas = 0;
  const todos = page.getByRole("button", { name: /^Todos/ }).first();
  if (await todos.count()) {
    await todos.click();
    await page.waitForTimeout(8000);
    console.log(`  8s após Todos · abortadas: ${abortadas} · tr=${await page.locator("tr").count()}`);
  } else console.log("  (sem botão Todos)");

  console.log("--- digita na busca (caractere a caractere) ---");
  abortadas = 0;
  const busca = page.getByPlaceholder(/CNPJ, nome|buscar/i).first();
  t0 = Date.now();
  await busca.pressSequentially("imobiliaria santos", { delay: 120 });
  await page.waitForTimeout(6000);
  console.log(`  busca digitada+6s: ${(Date.now() - t0) / 1000}s · abortadas: ${abortadas} · tr=${await page.locator("tr").count()}`);

  console.log("--- responsividade do main thread (5 medições) ---");
  for (let i = 0; i < 5; i++) {
    const t = Date.now();
    await page.evaluate(() => new Promise((r) => setTimeout(r, 0)));
    console.log(`  roundtrip JS: ${Date.now() - t}ms`);
    await page.waitForTimeout(700);
  }
});
