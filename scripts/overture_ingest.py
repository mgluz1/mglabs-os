"""Carga do Overture Maps (places) para a região de Goiânia + Aparecida no Neon.

Roda na GitHub Action "overture-ingest" (o runner tem acesso ao S3 público do Overture).

  python scripts/overture_ingest.py profile          # mostra as categorias que existem na região
  python scripts/overture_ingest.py load             # carrega só as categorias do radar no Neon
  python scripts/overture_ingest.py export           # grava ov_places.jsonl (sem banco)

Variáveis: DATABASE_URL (conexão DIRETA do Neon), OVERTURE_RELEASE (ex.: 2026-10-21.0).
Licença dos dados: CDLA Permissive 2.0 / Apache 2.0 (pode guardar e usar comercialmente).
"""

import json
import os
import sys
import time

import duckdb

RELEASE = os.environ.get("OVERTURE_RELEASE") or "2026-10-21.0"
# Goiânia + Aparecida de Goiânia + entorno imediato (Senador Canedo, Trindade, Goianira)
BBOX = dict(xmin=-49.50, xmax=-49.05, ymin=-16.95, ymax=-16.50)

# Categorias do radar (mesmos termos de lib/config/categories.ts → overtureTerms).
# Casa por basic_category, taxonomy.primary ou qualquer nível da hierarquia. Revisto com `profile` (release 2026-10-21.0).
TERMS = {
    "barbearia": ["barber"],
    "salao": ["beauty_salon", "hair_salon", "nail_salon", "skin_care_and_makeup", "eyebrow_service", "eyelash_service"],
    "academia": ["gym", "fitness_studio", "martial_arts_club", "fitness_trainer"],
    "restaurante": ["restaurant", "fast_food_restaurant"],
    "clinica": ["outpatient_care_facility", "specialized_health_care", "behavioral_or_mental_health_clinic", "vision_or_eye_care_clinic", "pediatric_clinic", "medical_spa"],
}
ALL_TERMS = sorted({t for v in TERMS.values() for t in v})

SRC = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/*"


def connect_duck():
    con = duckdb.connect()
    for ext in ("httpfs", "spatial"):
        con.execute(f"INSTALL {ext}; LOAD {ext};")
    con.execute("SET s3_region='us-west-2'; SET s3_access_key_id=''; SET s3_secret_access_key='';")
    return con


def region_sql(cols: str, extra_where: str = "") -> str:
    b = BBOX
    return f"""
      SELECT {cols}
      FROM read_parquet('{SRC}', hive_partitioning=1)
      WHERE bbox.xmin BETWEEN {b['xmin']} AND {b['xmax']}
        AND bbox.ymin BETWEEN {b['ymin']} AND {b['ymax']}
        {extra_where}
    """


def profile():
    con = connect_duck()
    t = time.time()
    con.execute(f"CREATE TEMP TABLE reg AS {region_sql('basic_category, taxonomy.primary AS prim, taxonomy.hierarchy AS hier, confidence')}")
    total = con.execute("SELECT count(*) FROM reg").fetchone()[0]
    print(f"release={RELEASE} lugares na região={total} ({time.time() - t:.0f}s)")
    print("\n== basic_category (top 120) ==")
    for name, n in con.execute("SELECT basic_category, count(*) n FROM reg GROUP BY 1 ORDER BY n DESC LIMIT 120").fetchall():
        print(f"{n:7d}  {name}")
    print("\n== taxonomy.primary que casa com os termos do radar ==")
    terms = ",".join(f"'{x}'" for x in ALL_TERMS)
    q = f"""
      SELECT prim, basic_category, hier, count(*) n FROM reg
      WHERE basic_category IN ({terms}) OR prim IN ({terms}) OR len(list_intersect(hier, [{terms}])) > 0
      GROUP BY ALL ORDER BY n DESC LIMIT 200"""
    for prim, basic, hier, n in con.execute(q).fetchall():
        print(f"{n:6d}  primary={prim}  basic={basic}  hier={'>'.join(hier or [])}")
    print("\n== palavras-chave no taxonomy.primary (barb|hair|beaut|nail|gym|fit|dent|clinic|restaur|pizz) ==")
    q = """SELECT prim, count(*) n FROM reg
           WHERE regexp_matches(prim, 'barb|hair|beaut|nail|salon|gym|fit|pilates|dent|clinic|medic|physio|restaur|pizz|steak|burger|sushi')
           GROUP BY 1 ORDER BY n DESC LIMIT 120"""
    for prim, n in con.execute(q).fetchall():
        print(f"{n:6d}  {prim}")


def select_rows():
    con = connect_duck()
    terms = ",".join(f"'{x}'" for x in ALL_TERMS)
    where = f"""AND (basic_category IN ({terms}) OR taxonomy.primary IN ({terms})
                     OR len(list_intersect(taxonomy.hierarchy, [{terms}])) > 0)
                AND coalesce(operating_status, 'open') = 'open'
                AND coalesce(confidence, 0) >= 0.5"""
    cols = """
      id,
      names.primary AS name,
      basic_category,
      taxonomy.primary AS taxonomy_primary,
      taxonomy.hierarchy AS hierarchy,
      taxonomy.alternates AS alternates,
      brand.names.primary AS brand,
      confidence,
      operating_status,
      websites, socials, emails, phones,
      addresses[1].freeform AS address,
      addresses[1].locality AS locality,
      addresses[1].postcode AS postcode,
      len(sources) AS source_count,
      ST_X(geometry) AS lng, ST_Y(geometry) AS lat
    """
    t = time.time()
    rows = con.execute(region_sql(cols, where)).fetchall()
    names = [d[0] for d in con.description]
    print(f"release={RELEASE} selecionados={len(rows)} ({time.time() - t:.0f}s)")
    return names, rows


def export(path="ov_places.jsonl"):
    """Grava os lugares selecionados num arquivo (artefato da Action), sem tocar no banco."""
    names, rows = select_rows()
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            d = dict(zip(names, r))
            d["confidence"] = None if d["confidence"] is None else round(float(d["confidence"]), 4)
            d["release"] = RELEASE
            f.write(json.dumps(d, ensure_ascii=False) + "\n")
    print(f"exportados={len(rows)} -> {path}")


def load():
    import psycopg

    dsn = os.environ["DATABASE_URL"]
    names, rows = select_rows()

    with psycopg.connect(dsn) as pg, pg.cursor() as cur:
        cur.execute("CREATE TEMP TABLE ov_stage (LIKE ov_places INCLUDING DEFAULTS) ON COMMIT DROP")
        cur.execute("ALTER TABLE ov_stage DROP COLUMN geom, ADD COLUMN lng float8, ADD COLUMN lat float8")
        copy_cols = [c for c in names]
        with cur.copy(f"COPY ov_stage ({', '.join(copy_cols)}, release) FROM STDIN") as cp:
            types = {
                "hierarchy": "text[]", "alternates": "text[]", "websites": "text[]", "socials": "text[]",
                "emails": "text[]", "phones": "text[]", "confidence": "float8", "source_count": "int4",
                "lng": "float8", "lat": "float8",
            }
            cp.set_types([types.get(c, "text") for c in copy_cols] + ["text"])
            for r in rows:
                cp.write_row([*r, RELEASE])
        cur.execute(
            """
            INSERT INTO ov_places (id, name, basic_category, taxonomy_primary, hierarchy, alternates, brand, confidence,
                                   operating_status, websites, socials, emails, phones, address, locality, postcode,
                                   source_count, geom, release, loaded_at)
            SELECT id, name, basic_category, taxonomy_primary, hierarchy, alternates, brand, confidence,
                   operating_status, websites, socials, emails, phones, address, locality, postcode,
                   source_count, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, release, now()
            FROM ov_stage
            ON CONFLICT (id) DO UPDATE SET
              name = excluded.name, basic_category = excluded.basic_category, taxonomy_primary = excluded.taxonomy_primary,
              hierarchy = excluded.hierarchy, alternates = excluded.alternates, brand = excluded.brand,
              confidence = excluded.confidence, operating_status = excluded.operating_status, websites = excluded.websites,
              socials = excluded.socials, emails = excluded.emails, phones = excluded.phones, address = excluded.address,
              locality = excluded.locality, postcode = excluded.postcode, source_count = excluded.source_count,
              geom = excluded.geom, release = excluded.release, loaded_at = now()
            """
        )
        print(f"gravados/atualizados={cur.rowcount}")
        # lugares que sumiram do Overture nesta região (fechados/removidos)
        cur.execute("DELETE FROM ov_places WHERE release <> %s", (RELEASE,))
        print(f"removidos (não estão mais no release)={cur.rowcount}")
        cur.execute("SELECT basic_category, count(*) FROM ov_places GROUP BY 1 ORDER BY 2 DESC LIMIT 40")
        print(json.dumps(cur.fetchall(), ensure_ascii=False))


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "profile"
    {"profile": profile, "load": load, "export": export}[mode]()
