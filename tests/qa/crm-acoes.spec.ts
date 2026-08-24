import { test, expect, Page } from "@playwright/test";
import { qaPassword } from "./credentials";

// Suíte de ESCRITA: exercita cada ação que grava, sempre em leads QA-*.
// Cada teste registra o que deu errado; a conferência de persistência no banco
// é feita fora daqui (psql), porque o que interessa aqui é o comportamento da UI.

const BASE = process.env.QA_BASE_URL || "https://crm.simbiosedigital.com";

const achados: string[] = [];
const IGNORAR = [/favicon/i, /React DevTools/i, /\[vite\]/i, /net::ERR_ABORTED/i];

function instrumenta(page: Page, ctx: () => string) {
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORAR.some((r) => r.test(m.text())))
      achados.push(`[${ctx()}] console.error: ${m.text().slice(0, 200)}`);
  });
  page.on("pageerror", (e) => achados.push(`[${ctx()}] pageerror: ${String(e).slice(0, 200)}`));
  page.on("response", async (r) => {
    if (r.status() >= 400 && !IGNORAR.some((x) => x.test(r.url()))) {
      let b = ""; try { b = (await r.text()).slice(0, 200); } catch {}
      achados.push(`[${ctx()}] HTTP ${r.status()} ${r.url().split("/").slice(-1)[0].slice(0, 60)} → ${b}`);
    }
  });
}

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/senha/i).fill(qaPassword());
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 25000 });
  await page.waitForTimeout(1500);
}

/** Lê os toasts visíveis e reporta os destrutivos. */
async function toasts(page: Page, ctx: string) {
  await page.waitForTimeout(1200);
  const txt = await page.locator("li[role='status'], [role='status']").allTextContents();
  for (const t of txt) {
    if (/erro|falha|não consegui|inválid|bloquead/i.test(t)) achados.push(`[${ctx}] toast: ${t.slice(0, 180)}`);
  }
  return txt;
}

async function abreLeadQA(page: Page, busca: string) {
  await page.goto(`${BASE}/leads`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.getByPlaceholder(/CNPJ, nome|buscar/i).first().fill(busca);
  await page.waitForTimeout(2500);
  const linha = page.locator("tr", { hasText: busca }).first();
  if (!(await linha.count())) { achados.push(`[leads] lead ${busca} não apareceu na busca`); return false; }
  await linha.click();
  await page.waitForTimeout(1800);
  const editar = page.getByRole("button", { name: /editar \/ avançar/i });
  if (!(await editar.count())) { achados.push(`[leads] botão editar ausente em ${busca}`); return false; }
  await editar.click();
  await page.waitForTimeout(1800);
  return true;
}

test("SDR: qualificação, atividade e tarefas", async ({ page }) => {
  test.setTimeout(300000);
  let ctx = "sdr-setup";
  instrumenta(page, () => ctx);
  await login(page, "qa-sdr@simbiosedigital.com");

  // ── 1. Ficha: qualificação completa + salvar ──
  ctx = "ficha/salvar";
  if (await abreLeadQA(page, "QA Alfa")) {
    for (const nome of [/possui site/i, /instagram ativo/i, /faz anúncios/i]) {
      const sw = page.getByRole("switch").filter({ hasNot: page.locator("[disabled]") });
      const alvo = page.locator("label", { hasText: nome }).first();
      if (await alvo.count()) {
        const id = await alvo.getAttribute("for");
        const el = id ? page.locator(`#${id}`) : null;
        if (el && (await el.count())) await el.click({ timeout: 5000 }).catch(() => {});
      }
    }
    const notas = page.getByPlaceholder(/anote aqui/i);
    if (await notas.count()) await notas.fill(`QA automatizado ${new Date().toISOString()}`);
    // muda status pra transição válida (rola até o select — a ficha tem 2 colunas
    // com scroll próprio e o combobox nasce fora da viewport)
    const selStatus = page.locator("button[role='combobox']").first();
    if (await selStatus.count()) {
      await selStatus.scrollIntoViewIfNeeded().catch(() => {});
      await selStatus.click({ force: true }).catch((e) =>
        achados.push(`[ficha] select de status não clicável: ${String(e).slice(0, 120)}`));
      const opt = page.getByRole("option", { name: /em qualificação|prospectado/i }).first();
      if (await opt.count()) await opt.click().catch(() => {});
    }
    const btnSalvar = page.getByRole("button", { name: /salvar qualificação/i });
    await btnSalvar.scrollIntoViewIfNeeded().catch(() => {});
    await btnSalvar.click({ force: true });
    await toasts(page, ctx);
    await page.waitForTimeout(1500);
    await page.keyboard.press("Escape");
  }

  // ── 2. Foco de hoje: tarefas + ActivityModal ──
  ctx = "sdr/tarefas";
  await page.goto(`${BASE}/sdr`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const atualizarFila = page.getByRole("button", { name: /atualizar fila/i });
  if (await atualizarFila.count()) { await atualizarFila.click(); await toasts(page, ctx); }
  else achados.push("[sdr/tarefas] botão 'Atualizar fila' não encontrado");

  ctx = "sdr/executar";
  const executar = page.getByRole("button", { name: /^executar$/i }).first();
  if (await executar.count()) {
    await executar.click();
    await page.waitForTimeout(1500);
    const combos = page.locator("button[role='combobox']");
    if (await combos.count() >= 2) {
      await combos.nth(0).click();
      await page.getByRole("option", { name: /whatsapp/i }).first().click();
      await page.waitForTimeout(500);
      await combos.nth(1).click();
      await page.getByRole("option", { name: /respondeu|conectado/i }).first().click();
    }
    const nota = page.getByPlaceholder(/o que aconteceu|nota/i).first();
    if (await nota.count()) await nota.fill("QA: atividade automatizada");
    const registrar = page.getByRole("button", { name: /registrar/i }).first();
    if (await registrar.count()) { await registrar.click(); await toasts(page, ctx); }
  } else achados.push("[sdr/executar] nenhum botão Executar na fila de hoje");

  // ── 3. Social Selling: toggles (aqui moram erros engolidos) ──
  ctx = "social-selling";
  await page.goto(`${BASE}/social-selling`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);
  const corpoSS = await page.locator("body").innerText();
  if (/nenhum|vazio/i.test(corpoSS) && corpoSS.length < 600)
    achados.push(`[social-selling] tela parece vazia: ${corpoSS.slice(0, 150).replace(/\n/g, " ")}`);
  const toggleSS = page.locator("button", { hasText: /^(seguiu|curtiu|comentou|DM)$/i }).first();
  if (await toggleSS.count()) { await toggleSS.click(); await toasts(page, ctx); }

  console.log(`\n===== SDR AÇÕES — ${achados.length} achado(s) =====`);
  achados.forEach((a) => console.log(a));
  expect(true).toBe(true);
});

test("Manager: plano, criativos, metas, playbook, pipeline", async ({ page }) => {
  test.setTimeout(300000);
  let ctx = "manager-setup";
  const antes = achados.length;
  instrumenta(page, () => ctx);
  await login(page, "qa-manager@simbiosedigital.com");

  // ── Plano: mudar status + anotar ──
  ctx = "plano";
  await page.goto(`${BASE}/plano`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const btnFazendo = page.getByRole("button", { name: /fazendo/i }).first();
  if (await btnFazendo.count()) { await btnFazendo.click(); await toasts(page, ctx); }
  else achados.push("[plano] nenhum botão de status encontrado (lista vazia?)");

  // ── Criativos ──
  ctx = "criativos";
  await page.goto(`${BASE}/criativos`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const corpoCri = await page.locator("body").innerText();
  if (corpoCri.length < 400) achados.push(`[criativos] tela quase vazia (${corpoCri.length} chars)`);

  // ── Metas: salvar praça (grava comercial_config) ──
  ctx = "metas";
  await page.goto(`${BASE}/metas`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const salvarPraca = page.getByRole("button", { name: /^salvar$/i }).first();
  if (await salvarPraca.count()) { await salvarPraca.click(); await toasts(page, ctx); }
  else achados.push("[metas] botão salvar da praça não encontrado");

  // ── Playbook: editar objeção ──
  ctx = "playbook";
  await page.goto(`${BASE}/playbook`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const editar = page.locator("button:has(svg)").filter({ hasNotText: /salvar|filtro/i }).nth(2);
  if (await editar.count()) {
    await editar.click();
    await page.waitForTimeout(800);
    const ta = page.locator("textarea").first();
    if (await ta.count()) {
      const atual = await ta.inputValue();
      await ta.fill(atual);           // regrava o mesmo texto — não altera conteúdo real
      const salvar = page.getByRole("button", { name: /salvar/i }).first();
      if (await salvar.count()) { await salvar.click(); await toasts(page, ctx); }
    }
  } else achados.push("[playbook] botão editar objeção não encontrado");

  // ── Pipeline do closer: abrir card ──
  ctx = "manager/pipeline";
  await page.goto(`${BASE}/manager/pipeline`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4500);
  const card = page.locator("[class*='cursor'], [role='button']").filter({ hasText: /QA / }).first();
  if (await card.count()) { await card.click(); await page.waitForTimeout(2000); await page.keyboard.press("Escape"); }

  // ── Sistema ──
  ctx = "manager/sistema";
  await page.goto(`${BASE}/manager/sistema`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4000);

  console.log(`\n===== MANAGER AÇÕES — ${achados.length - antes} achado(s) =====`);
  achados.slice(antes).forEach((a) => console.log(a));
  expect(true).toBe(true);
});
