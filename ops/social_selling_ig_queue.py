#!/usr/bin/env python3
"""Avança o enriquecimento de Instagram por todas as cidades, em lotes pequenos.

O pesquisador /root/enriquecer_ig.py faz a busca e classifica a confiança. Este
orquestrador só escolhe a próxima cidade e mantém um cursor recuperável, evitando
concentrar todo o orçamento nas capitais maiores.
"""

from __future__ import annotations

import json
import os
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path


STATE_PATH = Path(os.getenv("IG_QUEUE_STATE", "/var/lib/simbiose-crm/ig-city-cursor.json"))
ENRICHER = os.getenv("IG_ENRICHER", "/root/enriquecer_ig.py")
BATCH_SIZE = int(os.getenv("IG_BATCH_SIZE", "20"))


def fetch_cities() -> list[dict]:
    base = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/social_selling_mapa"
    key = os.environ["SUPABASE_SERVICE_KEY"]
    headers = {"apikey": key, "Authorization": "Bearer " + key, "User-Agent": "crm-ig-queue/1.0"}
    cities: list[dict] = []
    offset = 0
    while True:
        query = urllib.parse.urlencode({
            "select": "cidade,uf,total,com_instagram",
            "order": "total.desc,cidade.asc",
            "limit": 1000,
            "offset": offset,
        })
        request = urllib.request.Request(f"{base}?{query}", headers=headers)
        with urllib.request.urlopen(request, timeout=45) as response:
            batch = json.loads(response.read())
        cities.extend(row for row in batch if row.get("cidade") and int(row.get("total") or 0) > 0)
        if len(batch) < 1000:
            break
        offset += 1000
    return cities


def load_cursor() -> int:
    try:
        return max(0, int(json.loads(STATE_PATH.read_text()).get("cursor", 0)))
    except (FileNotFoundError, ValueError, TypeError, json.JSONDecodeError):
        return 0


def save_cursor(cursor: int, city: dict) -> None:
    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary = STATE_PATH.with_suffix(".tmp")
    temporary.write_text(json.dumps({"cursor": cursor, "last_city": city}, ensure_ascii=False))
    temporary.replace(STATE_PATH)


def main() -> int:
    cities = fetch_cities()
    if not cities:
        print("[ig-queue] nenhuma cidade disponível")
        return 0

    cursor = load_cursor() % len(cities)
    city = cities[cursor]
    print(
        f"[ig-queue] {cursor + 1}/{len(cities)}: {city['cidade']}/{city['uf']} "
        f"({city['com_instagram']}/{city['total']} com Instagram)"
    )
    completed = subprocess.run(
        ["/usr/bin/python3", ENRICHER, "--cidade", city["cidade"], "--limite", str(BATCH_SIZE)],
        check=False,
    )
    if completed.returncode != 0:
        print(f"[ig-queue] pesquisador falhou com código {completed.returncode}; cursor preservado")
        return completed.returncode

    save_cursor((cursor + 1) % len(cities), city)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
