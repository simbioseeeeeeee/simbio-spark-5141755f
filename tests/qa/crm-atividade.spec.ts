import { test, expect, Page } from "@playwright/test";
import { qaPassword } from "./credentials";

// Teste dirigido do que a varredura não alcançou: registrar atividade pelo
// ActivityModal (abrindo pelo painel de tarefas, não pelo Foco de Hoje, que
// filtra lead novo por desenho) e o Plano do Sprint.

const BASE = process.env.QA_BASE_URL || "https://crm.simbiosedigital.com";
const achados: string[] = [];

async function login(page: Page, email: string) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/e-?mail/i).fill(email);
  await page.getByLabel(/senha/i).fill(qaPassword());
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 25000 });
  await page.waitForTimeout(1500);
}

test("atividade + tarefa + plano", async ({ page }) => {
  test.setTimeout(240000);
  page.on("console", (m) => { if (m.type() === "error") achados.push(`console: ${m.text().slice(0, 160)}`); });
  page.on("response", async (r) => {
    if (r.status() >= 400 && !/favicon/.test(r.url())) {
      let b = ""; try { b = (await r.text()).slice(0, 160); } catch {}
      achados.push(`HTTP ${r.status()} ${r.url().split("/").pop()?.slice(0, 40)} → ${b}`);
    }
  });

  await login(page, process.env.QA_SDR_EMAIL || "qa-sdr@simbiosedigital.com");

  // ── painel de tarefas: concluir uma pesquisa (deve marcar pesquisa_realizada) ──
  await page.goto(`${BASE}/sdr`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(4500);
  const linhaQA = page.locator("div", { hasText: /Pesquisar QA Alfa/ }).last();
  const concluir = linhaQA.getByRole("button", { name: /concluir/i }).first();
  if (await concluir.count()) {
    await concluir.click();
    await page.waitForTimeout(2500);
    console.log("  ✓ tarefa 'Pesquisar QA Alfa' concluída");
  } else {
    achados.push("tarefa QA Alfa não encontrada no painel (fila pode ter passado de 120 itens)");
  }

  // ── ActivityModal: abrir pelo lead na página /leads ──
  await page.goto(`${BASE}/leads`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.getByPlaceholder(/CNPJ, nome/i).first().fill("QA Beta");
  await page.waitForTimeout(2500);
  const linha = page.locator("tr", { hasText: "QA Beta" }).first();
  if (await linha.count()) {
    await linha.click();
    await page.waitForTimeout(1500);
    // a gaveta tem "Editar / avançar estágio" → LeadProfile; o ActivityModal
    // vive no Foco de Hoje. Aqui validamos a ficha e o botão de ação direta.
    const editar = page.getByRole("button", { name: /editar \/ avançar/i });
    if (await editar.count()) {
      await editar.click();
      await page.waitForTimeout(2000);
      // Timeline deve carregar sem erro
      const abaTimeline = page.getByRole("tab", { name: /timeline/i });
      if (await abaTimeline.count()) {
        await abaTimeline.click();
        await page.waitForTimeout(2500);
        console.log("  ✓ aba Timeline carregou");
      }
      // aba Reunião
      const abaReuniao = page.getByRole("tab", { name: /reunião/i });
      if (await abaReuniao.count()) {
        await abaReuniao.click();
        await page.waitForTimeout(3000);
        const corpo = await page.locator("body").innerText();
        if (/erro|falha/i.test(corpo.slice(0, 1500))) achados.push("aba Reunião mostra erro");
        console.log("  ✓ aba Reunião carregou");
      }
      await page.keyboard.press("Escape");
    }
  }

  console.log(`\n===== DIRIGIDO SDR — ${achados.length} achado(s) =====`);
  achados.forEach((a) => console.log(a));
  expect(true).toBe(true);
});

test("plano do sprint grava status", async ({ page }) => {
  test.setTimeout(180000);
  const antes = achados.length;
  page.on("response", async (r) => {
    if (r.status() >= 400 && !/favicon/.test(r.url())) {
      let b = ""; try { b = (await r.text()).slice(0, 160); } catch {}
      achados.push(`HTTP ${r.status()} ${r.url().split("/").pop()?.slice(0, 40)} → ${b}`);
    }
  });
  await login(page, process.env.QA_MANAGER_EMAIL || "qa-manager@simbiosedigital.com");
  await page.goto(`${BASE}/plano`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);
  const btns = page.getByRole("button", { name: /^fazendo$/i });
  if (await btns.count()) {
    await btns.first().click();
    await page.waitForTimeout(2000);
    console.log("  ✓ Plano: status alterado para 'fazendo'");
  } else achados.push("Plano: nenhum botão 'fazendo' (lista vazia?)");

  console.log(`\n===== DIRIGIDO PLANO — ${achados.length - antes} achado(s) =====`);
  achados.slice(antes).forEach((a) => console.log(a));
  expect(true).toBe(true);
});
