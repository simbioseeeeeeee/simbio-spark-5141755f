import { test, expect, Page } from "@playwright/test";

const BASE = process.env.QA_BASE_URL || "https://crm.simbiosedigital.com";
const SENHA = process.env.QA_SENHA || "QaSimbiose2026!";

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/senha/i).fill(SENHA);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 25000 });
  await page.waitForTimeout(2000);
}

test("catálogo comercial carrega no browser autenticado", async ({ page }) => {
  test.setTimeout(120000);
  await login(page, "qa-closer@simbiosedigital.com");

  // mesma chamada que a aba Reunião faz, com o token da sessão do navegador
  const r = await page.evaluate(async () => {
    const chave = Object.keys(localStorage).find((k) => k.includes("auth-token"));
    const tok = chave ? JSON.parse(localStorage.getItem(chave)!)?.access_token : null;
    if (!tok) return { erro: "sem token na sessão" };
    const resp = await fetch("https://api.simbiosedigital.com/api/comercial/catalogo", {
      headers: { Authorization: `Bearer ${tok}` },
    });
    const body = await resp.json().catch(() => ({}));
    return {
      status: resp.status,
      playbookVersion: body.playbookVersion,
      catalogVersion: body.catalogVersion,
      ofertas: (body.offers || []).map((o: any) => `${o.label} R$${o.base_monthly_brl ?? o.price_brl}`),
      addons: (body.catalog?.addons || []).length,
      detail: body.detail,
    };
  });
  console.log("  catálogo →", JSON.stringify(r, null, 2).replace(/\n/g, "\n  "));

  // o front recusa se a versão não bater — reproduz a checagem
  const compat = r.playbookVersion === "simbiose-sales-v2@2.1.0" && r.catalogVersion === "2.1.0";
  console.log(`  versões compatíveis com o CRM: ${compat ? "✅ sim" : "❌ não"}`);
  expect(r.status).toBe(200);
  expect(compat).toBe(true);
});
