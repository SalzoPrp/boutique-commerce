"""Génère les données publiques du catalogue depuis le CSV AW filtré."""
import argparse
import csv
import json
from decimal import Decimal, ROUND_HALF_UP, ROUND_CEILING
from pathlib import Path
from urllib.parse import urlsplit

def export(source, destination):
    products = []
    with source.open(encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file, strict=True):
            price = Decimal(row["Price"])
            images = [url.strip() for url in row["Images"].split(",") if url.strip()]
            products.append({
                "sku": row["Product code"],
                "name": row["Unit Name"],
                "category": row["Department"],
                "description": row["Webpage description (plain text)"],
                "photos": list(dict.fromkeys(url for url in images if urlsplit(url).scheme == "https" and urlsplit(url).netloc)),
                "units": int(row["Units per outer"]),
                "grams": int((Decimal(row["Package weight (shipping)"]) * 1000).to_integral_value(rounding=ROUND_CEILING)),
                "stock": int(row["Available Quantity"]),
                "active": row["Status"] == "Active" and row["For sale"] == "Yes",
                "cents": int((price * Decimal("1.30") * Decimal("1.21") * 100).quantize(
                    Decimal("1"), rounding=ROUND_HALF_UP
                )),
            })
    destination.write_text(json.dumps(products, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(products)} références exportées")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("csv", type=Path)
    args = parser.parse_args()
    export(args.csv, Path(__file__).with_name("produits.json"))
