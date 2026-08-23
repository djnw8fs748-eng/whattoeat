from migrations.migrate_ingredients import parse_ingredient


def test_parses_no_space_unit():
    assert parse_ingredient("200g spaghetti or linguine") == {
        "qty": 200, "unit": "g", "item": "spaghetti or linguine"
    }


def test_parses_spaced_unit():
    assert parse_ingredient("3 tbsp butter") == {
        "qty": 3, "unit": "tbsp", "item": "butter"
    }


def test_parses_count_unit_with_comma_detail():
    assert parse_ingredient("4 cloves garlic, minced") == {
        "qty": 4, "unit": "cloves", "item": "garlic, minced"
    }


def test_parses_fraction_quantity():
    assert parse_ingredient("1/2 cup flour") == {
        "qty": 0.5, "unit": "cup", "item": "flour"
    }


def test_no_leading_quantity_falls_back():
    assert parse_ingredient("Salt and black pepper") == {
        "qty": None, "unit": None, "item": "Salt and black pepper"
    }


def test_range_quantity_falls_back():
    assert parse_ingredient("2-3 cloves garlic") == {
        "qty": None, "unit": None, "item": "2-3 cloves garlic"
    }


def test_spaced_range_quantity_falls_back():
    assert parse_ingredient("2 - 3 cloves garlic") == {
        "qty": None, "unit": None, "item": "2 - 3 cloves garlic"
    }


def test_to_taste_falls_back():
    assert parse_ingredient("Chilli flakes, to taste") == {
        "qty": None, "unit": None, "item": "Chilli flakes, to taste"
    }


def test_single_word_after_quantity_has_no_unit():
    assert parse_ingredient("2 eggs") == {
        "qty": 2, "unit": None, "item": "eggs"
    }
