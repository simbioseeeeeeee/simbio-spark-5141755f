import { test, expect, Page, ConsoleMessage } from "@playwright/test";

// Varredura de QA do CRM: entra com cada papel, visita todas as rotas dele e
// registra tudo que der errado (console.error, exceção não tratada, HTTP >= 400,
// toast destrutivo). Roda contra produção — só LEITURA nesta suíte; as escritas
// ficam na suíte de ações, sempre em leads QA-*.

const BASE = process.env.QA_BASE_URL || "https://crm.simbiosedigital.com";
const SENHA = process.env.QA_SENHA || "QaSimbiose2026!";

type Achado = { rota: string; tipo: string; detalhe: string };

const ROTAS_COMUNS = ["/plano", "/criativos", "/campanhas", "/metas", "/conversas", "/leads", "/playbook"];
const POR_PAPEL: Record<string, { email: string; rotas: string[] }> = {
  sdr: {
    email: "qa-sdr@simbiosedigital.com",
    rotas: [...ROTAS_COMUNS, "/social-selling", "/sdr", "/sdr/anuncios"],
  },
  closer: {
    email: "qa-closer@simbiosedigital.com",
    rotas: [...ROTAS_COMUNS, "/closer"],
  },
  manager: {
    email: "qa-manager@simbiosedigital.com",
    rotas: [...ROTAS_COMUNS, "/social-selling", "/sdr", "/closer",
            "/manager/painel", "/manager/cadencia", "/manager/pipeline", "/manager/sistema"],
  },
};

// Ruído conhecido de terceiros que não é bug nosso.
const IGNORAR = [
  /favicon/i,
  /Download the React DevTools/i,
  /\[vite\]/i,
  /net::ERR_ABORTED/i,
];
const ruido = (t: string) => IGNORAR.some((r) => r.test(t));

function instrumenta(page: Page, achados: Achado[], rotaAtual: () => string) {
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const t = msg.text();
    if (ruido(t)) return;
    achados.push({ rota: rotaAtual(), tipo: "console.error", detalhe: t.slice(0, 300) });
  });
  page.on("pageerror", (err) => {
    achados.push({ rota: rotaAtual(), tipo: "pageerror", detalhe: String(err).slice(0, 300) });
  });
  page.on("response", async (resp) => {
    if (resp.status() < 400) return;
    const url = resp.url();
    if (ruido(url)) return;
    let corpo = "";
    try { corpo = (await resp.text()).slice(0, 220); } catch { /* corpo já consumido */ }
    achados.push({
      rota: rotaAtual(),
      tipo: `HTTP ${resp.status()}`,
      detalhe: `${url.replace(/https:\/\/[a-z0-9]+\.supabase\.co/, "supabase")} → ${corpo}`,
    });
  });
}

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/senha/i).fill(SENHA);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 25000 });
}

for (const [papel, cfg] of Object.entries(POR_PAPEL)) {
  test(`varredura ${papel}`, async ({ page }, testInfo) => {
    test.setTimeout(240000);
    const achados: Achado[] = [];
    let rota = "/login";
    instrumenta(page, achados, () => rota);

    await login(page, cfg.email);

    for (const r of cfg.rotas) {
      rota = r;
      await page.goto(`${BASE}${r}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(3500); // deixa as queries/realtime assentarem

      // toast destrutivo visível?
      const toasts = await page.locator("[data-state='open'][role='status'], li[role='status']").allTextContents();
      for (const t of toasts) {
        if (/erro|falha|não consegui|inválid/i.test(t)) {
          achados.push({ rota: r, tipo: "toast", detalhe: t.slice(0, 200) });
        }
      }

      // a rota entregou conteúdo ou caiu em NotFound/redirect?
      const url = new URL(page.url());
      if (url.pathname !== r) {
        achados.push({ rota: r, tipo: "redirect", detalhe: `foi para ${url.pathname}` });
      }
      const corpo = (await page.locator("body").innerText()).slice(0, 400);
      if (/404|página não encontrada|not found/i.test(corpo)) {
        achados.push({ rota: r, tipo: "404", detalhe: corpo.slice(0, 150) });
      }
      if (corpo.trim().length < 40) {
        achados.push({ rota: r, tipo: "tela-vazia", detalhe: `body com ${corpo.trim().length} chars` });
      }
    }

    await testInfo.attach(`achados-${papel}.json`, {
      body: JSON.stringify(achados, null, 2),
      contentType: "application/json",
    });
    console.log(`\n===== ${papel.toUpperCase()} — ${achados.length} achado(s) =====`);
    for (const a of achados) console.log(`[${a.rota}] ${a.tipo}: ${a.detalhe}`);
    expect(true).toBe(true); // suíte é diagnóstico: não falha, reporta
  });
}
