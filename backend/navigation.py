from db import get_connection
from psycopg2.extras import RealDictCursor


def check_start(lat, lon):
    conn = get_connection()
    cur = conn.cursor()

    query = """
    WITH ponto AS (
        SELECT ST_Transform(
            ST_SetSRID(ST_MakePoint(%s, %s), 4326),
            3857
        ) AS geom
    )
    SELECT
        ST_Covers(s.geom, ponto.geom) AS inside,
        ST_Distance(
            ST_Transform(s.geom, 4326)::geography,
            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
        ) AS distance_m,
        ST_Y(ST_Transform(ST_Centroid(s.geom), 4326)) AS lat,
        ST_X(ST_Transform(ST_Centroid(s.geom), 4326)) AS lon
    FROM isec_poligonos s, ponto
    WHERE s.name = 'start'
    LIMIT 1;
    """

    cur.execute(query, (lon, lat, lon, lat))
    row = cur.fetchone()

    cur.close()
    conn.close()

    if not row:
        return {
            "inside": False,
            "distance_m": None,
            "target_coords": None,
        }

    return {
        "inside": row[0],
        "distance_m": row[1],
        "target_coords": {
            "lat": row[2],
            "lon": row[3],
        },
    }


def check_target_poi(lat, lon, poi_name):
    conn = get_connection()
    cur = conn.cursor()

    query = """
    WITH ponto AS (
        SELECT ST_Transform(
            ST_SetSRID(ST_MakePoint(%s, %s), 4326),
            3857
        ) AS geom
    )
    SELECT
        p.name,
        (
            ST_Covers(p.geom, ponto.geom)
            OR
            ST_DWithin(
                ST_Transform(p.geom, 4326)::geography,
                ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography,
                4
            )
        ) AS inside,
        ST_Distance(
            ST_Transform(p.geom, 4326)::geography,
            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
        ) AS distance
    FROM isec_poligonos p, ponto
    WHERE p.name IN (%s, %s, %s);
    """

    frio = f"{poi_name}_frio"
    quente = f"{poi_name}_quente"
    val = f"{poi_name}_val"

    cur.execute(query, (
        lon, lat,   # ponto para ST_Covers
        lon, lat,   # ponto para ST_DWithin
        lon, lat,   # ponto para ST_Distance
        frio, quente, val
    ))

    rows = cur.fetchall()

    cur.close()
    conn.close()

    result = {
        "poi": poi_name,
        "zone": "",
        "distance_m": None,
        "polygons": []
    }

    inside_zones = []

    for name, inside, distance in rows:
        result["polygons"].append({
            "name": name,
            "inside": inside,
            "distance_m": distance
        })

        if inside:
            if name.endswith("_val"):
                inside_zones.append("val")
            elif name.endswith("_quente"):
                inside_zones.append("quente")
            elif name.endswith("_frio"):
                inside_zones.append("frio")

    if "val" in inside_zones:
        result["zone"] = "val"
    elif "quente" in inside_zones:
        result["zone"] = "quente"
    elif "frio" in inside_zones:
        result["zone"] = "frio"

    if rows:
        result["distance_m"] = min(r[2] for r in rows)

    return result


def get_poi_target(poi_name, lat, lon):
    conn = get_connection()
    cur = conn.cursor()

    query = """
    SELECT
        ST_Y(ST_Transform(ST_Centroid(geom), 4326)) AS lat,
        ST_X(ST_Transform(ST_Centroid(geom), 4326)) AS lon,
        ST_Distance(
            ST_Transform(geom, 4326)::geography,
            ST_SetSRID(ST_MakePoint(%s, %s), 4326)::geography
        ) AS distance_m
    FROM isec_poligonos
    WHERE name = %s
    LIMIT 1;
    """

    cur.execute(query, (lon, lat, f"{poi_name}_val"))
    row = cur.fetchone()

    cur.close()
    conn.close()

    if not row:
        return None

    return {
        "lat": row[0],
        "lon": row[1],
        "name": f"{poi_name}_val",
        "distance_m": row[2],
    }

def get_quiz_for_poi(poi_name):
    conn = get_connection()
    cur = conn.cursor(cursor_factory=RealDictCursor)

    query = """
    SELECT
        pergunta,
        opcao_a,
        opcao_b,
        opcao_c,
        opcao_d,
        resposta_certa
    FROM quiz
    WHERE poi = %s
    ORDER BY random()
    LIMIT 1;
    """

    cur.execute(query, (poi_name,))
    row = cur.fetchone()

    cur.close()
    conn.close()

    if not row:
        return None

    return {
        "pergunta": row["pergunta"],
        "opcoes": {
            "A": row["opcao_a"],
            "B": row["opcao_b"],
            "C": row["opcao_c"],
            "D": row["opcao_d"],
        },
        "resposta_certa": row["resposta_certa"]
    }
