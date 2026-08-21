#!/usr/bin/env python3
"""Lista, por tabela, os campos que o front grava (insert/update/upsert).
Saída em JSON para o validador comparar com o schema real do banco."""
import json, pathlib, re

raiz = pathlib.Path(__file__).resolve().parent.parent / "src"
achados: dict[str, set] = {}

def add(tabela: str, campo: str) -> None:
    if campo and not campo.startswith("__"):
        achados.setdefault(tabela, set()).add(campo)

for arq in raiz.rglob("*.ts*"):
    txt = arq.read_text()
    # objetos montados antes do insert (insertData, patch, campos…)
    for var in re.finditer(
            r'const\s+(\w*(?:insertData|updateData|patch|payload|corpo|changes|campos)\w*)'
            r'\s*:\s*any\s*=\s*\{([\s\S]{0,900}?)\n\s*\};', txt):
        nome, bloco = var.group(1), var.group(2)
        campos = set(re.findall(r'(?:^|[\{,\n])\s*([a-z_][a-z0-9_]*)\s*:', bloco))
        campos |= set(re.findall(rf'{nome}\.([a-z_][a-z0-9_]*)\s*=', txt))
        m = re.search(rf'\.from\(\s*"([a-z_]+)"(?:\s+as\s+any)?\s*\)\s*'
                      rf'\.(?:insert|update|upsert)\(\s*{nome}', txt)
        if m:
            for c in campos:
                add(m.group(1), c)
    # objetos inline
    for m in re.finditer(r'\.from\(\s*"([a-z_]+)"(?:\s+as\s+any)?\s*\)([\s\S]{0,900}?)(?=\.from\(|\Z)', txt):
        tabela, corpo = m.group(1), m.group(2)
        for op in re.finditer(r'\.(insert|update|upsert)\(\s*(\{[\s\S]{0,700}?\})\s*[,)]', corpo):
            for k in re.finditer(r'(?:^|[\{,\n])\s*([a-z_][a-z0-9_]*)\s*:', op.group(2)):
                if k.group(1) not in ("data", "error", "count", "head", "onConflict"):
                    add(tabela, k.group(1))

print(json.dumps({t: sorted(c) for t, c in achados.items()}, ensure_ascii=False, indent=2))
