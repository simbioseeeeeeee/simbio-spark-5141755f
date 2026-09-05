import { expect, test } from "@playwright/test";
import { qaPassword } from "./credentials";

const BASE = process.env.QA_BASE_URL || "https://crm.simbiosedigital.com";

function validCnpj(base12: string): string {
  const digit = (value: string, weights: number[]) => {
    const sum = value.split("").reduce((total, char, index) => total + Number(char) * weights[index], 0);
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  const first = digit(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = digit(`${base12}${first}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base12}${first}${second}`;
}

test("gestor cadastra, exclui e restaura lead com auditoria recuperável", async ({ page }) => {
  test.setTimeout(180_000);
  const cnpj = validCnpj(`90${Date.now().toString().slice(-10)}`);
  const company = `QA Lixeira ${cnpj.slice(-6)}`;

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel(/e-?mail/i).fill("qa-manager@simbiosedigital.com");
  await page.getByLabel(/senha/i).fill(qaPassword());
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 25_000 });

  await page.goto(`${BASE}/leads`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Novo lead" })).toBeVisible();
  await page.getByRole("button", { name: "Novo lead" }).click();
  await page.getByLabel(/CNPJ/).fill(cnpj);
  await page.getByLabel(/Razão Social/).fill(company);
  await page.getByLabel(/Pessoa de contato/).fill("Contato QA");
  await page.getByLabel(/Contexto inicial/).fill("[QA] validação do fluxo de cadastro e lixeira");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("✅ Lead cadastrado!", { exact: true })).toBeVisible();

  const search = page.getByPlaceholder(/CNPJ, nome/i).first();
  await search.fill(cnpj);
  const row = page.locator("tbody tr", { hasText: cnpj }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();
  await page.getByRole("button", { name: "Excluir lead" }).click();
  await page.getByLabel("Motivo da exclusão").fill("[QA] validação da exclusão recuperável");
  await page.getByLabel(/Digite o CNPJ/).fill(cnpj);
  await page.getByRole("button", { name: "Mover para Lixeira" }).click();
  await expect(page.getByText("Lead movido para a Lixeira", { exact: true })).toBeVisible();
  await expect(row).toHaveCount(0, { timeout: 20_000 });

  await page.getByRole("tab", { name: /Lixeira/ }).click();
  const trashRow = page.locator("tbody tr", { hasText: cnpj }).first();
  await expect(trashRow).toBeVisible({ timeout: 20_000 });
  await trashRow.click();
  await expect(page.getByText("Lead na Lixeira", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Restaurar" }).click();
  await expect(page.getByText("Lead restaurado", { exact: true })).toBeVisible();

  // Mantém o registro de QA fora das filas operacionais ao terminar o teste.
  await page.getByRole("button", { name: "Excluir lead" }).click();
  await page.getByLabel("Motivo da exclusão").fill("[QA] descarte final do registro de teste");
  await page.getByLabel(/Digite o CNPJ/).fill(cnpj);
  await page.getByRole("button", { name: "Mover para Lixeira" }).click();
  await expect(page.getByText("Lead movido para a Lixeira", { exact: true })).toBeVisible();
});
