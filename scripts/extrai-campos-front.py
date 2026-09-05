#!/usr/bin/env python3
"""Lista, por tabela, os campos que o front grava (insert/update/upsert).

Saída em JSON para o validador comparar com o schema real do banco. Existe
porque as migrations do repo NÃO descrevem o banco de produção — o front já foi
pro ar quatro vezes gravando coluna que o Supabase não tinha.

Usa parser de chaves balanceadas em vez de regex sobre o arquivo inteiro: com
regex, um objeto declarado antes engolia o texto até depois do próximo, e campos
inteiros sumiam do relatório (foi assim que leads.oferta_comercial passou).
"""
import json
import pathlib
import re

RAIZ = pathlib.Path(__file__).resolve().parent.parent / "src"
IGNORAR_CHAVES = {"data", "error", "count", "head", "onConflict"}


def bloco_balanceado(txt: str, abre: int) -> tuple[str, int]:
    """Conteúdo entre { } a partir do índice do '{'. Devolve (corpo, fim)."""
    nivel, i = 0, abre
    while i < len(txt):
        c = txt[i]
        if c == "{":
            nivel += 1
        elif c == "}":
            nivel -= 1
            if nivel == 0:
                return txt[abre + 1:i], i
        i += 1
    return "", abre


def chaves_nivel1(bloco: str) -> set[str]:
    """Só as chaves do primeiro nível. Chave dentro de sub-objeto (ex.:
    metadados: { ui_tipo }) é conteúdo de coluna jsonb, não coluna — reportá-la
    como 'falta no banco' fazia a ferramenta gritar lobo."""
    out, nivel, i = set(), 0, 0
    while i < len(bloco):
        ch = bloco[i]
        # pula o conteúdo de strings: "Tempo anunciando: x" virava a coluna
        # fantasma `anunciando` no relatório
        if ch in "\"'`":
            fim, aspas = i + 1, ch
            while fim < len(bloco):
                if bloco[fim] == "\\":
                    fim += 2
                    continue
                if bloco[fim] == aspas:
                    break
                fim += 1
            i = fim + 1
            continue
        if ch in "{[(":
            nivel += 1
        elif ch in "}])":
            nivel -= 1
        elif nivel == 0:
            m = re.match(r"([a-z_][a-z0-9_]*)\s*:", bloco[i:])
            if m and (i == 0 or bloco[i - 1] in "{,\n \t"):
                out.add(m.group(1))
                i += m.end() - 1
        i += 1
    return out


def main() -> None:
    achados: dict[str, set[str]] = {}

    def add(tabela: str, campo: str) -> None:
        if campo and campo not in IGNORAR_CHAVES:
            achados.setdefault(tabela, set()).add(campo)

    for arq in RAIZ.rglob("*.ts*"):
        txt = arq.read_text()

        # 1) objetos nomeados: const X = { ... }  →  .from("t").insert(X)
        for m in re.finditer(r"const\s+(\w+)\s*(?::\s*[^=]{0,80})?=\s*\{", txt):
            nome = m.group(1)
            corpo, _ = bloco_balanceado(txt, m.end() - 1)
            if not corpo:
                continue
            campos = chaves_nivel1(corpo)
            # atribuições posteriores: X.campo = ...
            campos |= set(re.findall(rf"{nome}\.([a-z_][a-z0-9_]*)\s*=[^=]", txt))
            destino = re.search(
                rf'\.from\(\s*"([a-z_]+)"[^)]*\)[^;]{{0,120}}?'
                rf"\.(?:insert|update|upsert)\(\s*{nome}\b",
                txt,
            )
            if destino:
                for c in campos:
                    add(destino.group(1), c)

        # 2) objetos inline: .from("t").insert({ ... })
        for m in re.finditer(
            r'\.from\(\s*"([a-z_]+)"[^)]*\)[^;]{0,160}?\.(?:insert|update|upsert)\(\s*\{',
            txt,
        ):
            tabela = m.group(1)
            corpo, _ = bloco_balanceado(txt, m.end() - 1)
            for c in chaves_nivel1(corpo):
                add(tabela, c)

    print(json.dumps({t: sorted(c) for t, c in achados.items()},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
