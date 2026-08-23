import json
import re
from pathlib import Path

QTY_PATTERN = re.compile(
    r"^(?P<qty>\d+/\d+|\d+(?:\.\d+)?)\s*(?:(?P<unit>[a-zA-Z]+)\s+)?(?P<item>.+)$"
)

RECIPES_DIR = Path(__file__).resolve().parent.parent / "recipes"
DEFAULT_SERVINGS = 2


def _to_number(qty_str: str) -> float:
    if "/" in qty_str:
        numerator, denominator = qty_str.split("/")
        return int(numerator) / int(denominator)
    if "." in qty_str:
        return float(qty_str)
    return int(qty_str)


def parse_ingredient(line: str) -> dict:
    match = QTY_PATTERN.match(line.strip())
    if not match:
        return {"qty": None, "unit": None, "item": line.strip()}

    item = match.group("item").strip()
    # Check if we've partially matched a range quantity (e.g., "2-3 cloves garlic"
    # or "2 - 3 cloves garlic", parsed as qty="2", item="-3 ..." / "- 3 ...").
    # Fall back to unparsed.
    if re.match(r"^-\s*\d", item):
        return {"qty": None, "unit": None, "item": line.strip()}

    qty = _to_number(match.group("qty"))
    unit = match.group("unit")
    return {"qty": qty, "unit": unit, "item": item}


def migrate_file(path: Path) -> int:
    recipes = json.loads(path.read_text())
    for recipe in recipes:
        recipe.setdefault("servings", DEFAULT_SERVINGS)
        recipe["ingredients"] = [parse_ingredient(line) for line in recipe["ingredients"]]
    path.write_text(json.dumps(recipes, indent=2, ensure_ascii=False) + "\n")
    return len(recipes)


def main() -> None:
    total = 0
    for path in sorted(RECIPES_DIR.glob("*.json")):
        if path.name == "_index.json":
            continue
        count = migrate_file(path)
        total += count
        print(f"Migrated {count} recipes in {path.name}")
    print(f"Done: {total} recipes migrated")


if __name__ == "__main__":
    main()
