import { test, expect, Page, ConsoleMessage } from "@playwright/test";
import { qaPassword } from "./credentials";

// Varredura de QA do CRM: entra com cada papel, visita todas as rotas dele e
// registra tudo que der errado (console.error, exceção não tratada, HTTP >= 400,
// toast destrutivo). Roda contra produção — só LEITURA nesta suíte; as escritas
// ficam na suíte de ações, sempre em leads QA-*.

const BASE = process.env.QA_BASE_URL || "https://crm.simbiosedigital.com";

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
  await page.getByLabel(/senha/i).fill(qaPassword());
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
      // "404" solto dá falso positivo (telefone da lista contém 404) — exige contexto
      if (/erro 404|página não encontrada|page not found|not found/i.test(corpo)) {
        achados.push({ rota: r, tipo: "404", detalhe: corpo.slice(0, 150) });
      }
      if (corpo.trim().length < 40) {
        achados.push({ rota: r, tipo: "tela-vazia", detalhe: `body com ${corpo.trim().length} chars` });
      }

      // Contratos visuais do Sales OS v2. São checagens somente leitura.
      if (r === "/sdr") {
        const funil = page.getByRole("tab", { name: "Funil SDR" });
        await expect(funil).toBeVisible();
        await funil.click();
        await expect(page.getByText("A Contatar", { exact: true }).first()).toBeVisible();
        await expect(page.getByRole("tab", { name: "Foco de Hoje" })).toBeVisible();
      }
      if (r === "/closer") {
        await expect(page.getByLabel("Navegação horizontal da pipeline")).toBeVisible();
        await expect(page.getByRole("button", { name: "Mostrar coluna anterior" })).toBeVisible();
        await expect(page.getByRole("button", { name: "Mostrar próxima coluna" })).toBeVisible();
        await expect(page.getByLabel("Ir para uma etapa da pipeline")).toBeVisible();
      }
      if (papel === "manager" && r === "/manager/cadencia") {
        await page.getByRole("tab", { name: "Configuração versionada" }).click();
        await expect(page.getByText("Cadências versionadas")).toBeVisible();
        await expect(page.getByRole("button", { name: /nova cadência/i })).toBeVisible();
        await expect(page.getByRole("button", { name: /publicar em shadow/i })).toBeVisible();
      }
      if (papel === "manager" && r === "/leads") {
        const search = page.getByPlaceholder(/CNPJ, nome/i).first();
        await search.fill("QA Beta");
        await page.waitForTimeout(1200);
        const row = page.locator("tr", { hasText: "QA Beta" }).first();
        if (await row.count()) {
          await row.click();
          await expect(page.getByRole("button", { name: "Registrar atividade" }).first()).toBeVisible();
          await page.keyboard.press("Escape");
        } else {
          await search.fill("");
          await page.waitForTimeout(1200);
          const firstRow = page.locator("tbody tr").first();
          await expect(firstRow).toBeVisible();
          await firstRow.click();
          await expect(page.getByRole("button", { name: "Registrar atividade" }).first()).toBeVisible();
          await page.keyboard.press("Escape");
        }
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
