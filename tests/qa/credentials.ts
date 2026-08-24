export function qaPassword(): string {
  const password = process.env.QA_SENHA;
  if (!password) {
    throw new Error("QA_SENHA não configurada. Obtenha a credencial no cofre antes de rodar Playwright.");
  }
  return password;
}
