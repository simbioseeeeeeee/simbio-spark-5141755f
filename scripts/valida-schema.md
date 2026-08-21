# Validador de schema (front × banco)

Acha o próximo `Could not find the 'X' column of 'Y' in the schema cache` **antes**
do usuário. Já pegou dois em produção: `atividades.playbook_version` e as duas
colunas de `lead_objecoes` (que faziam marcar objeção falhar sempre).

## Como rodar

```bash
# 1. extrai o que o front grava em cada tabela
python3 scripts/extrai-campos-front.py > /tmp/campos_front.json

# 2. compara com as colunas reais (roda no servidor, que tem as credenciais)
scp /tmp/campos_front.json root@45.55.199.112:/tmp/campos_front.json
ssh root@45.55.199.112 'cd /tmp && python3 /tmp/valida_schema.py'
```

## Lendo o resultado

- `❌ tabela: falta no banco: X` → erro real: ou cria a coluna (aditivo) ou tira do front.
- Chaves aninhadas em coluna `jsonb` (ex.: `ui_tipo`, `detalhe` dentro de `metadados`)
  aparecem como falso positivo — confira o insert antes de criar coluna à toa.

## Por que isso acontece

As migrations do repo **não descrevem** o banco de produção (`mdewbruvzrrxezsbyzmq`):
muita coisa foi criada direto no Supabase. O schema real é a fonte de verdade —
sempre confira contra o banco, nunca contra `supabase/migrations/`.
