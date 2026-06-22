"""Unit tests for the pure helpers in validate_pge_export.py.

These cover the rate-code classification that drives section 3's GO/NO-GO board:
the validator must (a) recognize the repo's real AG card families instead of a naive
"AG" substring, (b) treat HAGFB (AG-prefixed, no card family) as NOT priceable, and
(c) flag the H-prefixed AG codes that map to a family but are unpriceable as the repo
is wired (mapScheduleLabel does not strip the leading H). Verified against the real
Batth March/April exports: 172 AG-priceable SAs, 2 HAGFB, 33 non-AG, 131 H-prefixed AG.

stdlib unittest only (no pytest in this repo). Run:
  cd apps/dashboard && python3 -m unittest scripts.tests.test_validate_pge_export
"""
import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "validate_pge_export.py"


def _load_module():
    spec = importlib.util.spec_from_file_location("validate_pge_export", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)  # main() is __main__-guarded, so import is side-effect free
    return mod


vpe = _load_module()

# The 21 distinct rate codes present in the real Batth exports.
EXPORT_CODES = [
    "A1X", "AG4C", "AG5B", "AG5C", "AGB", "AGC", "B1", "E19P",
    "HAG5B", "HAGA1", "HAGA2", "HAGB", "HAGC", "HAGFB", "HB1", "HB6",
    "HE1", "HE1N", "HEM", "HETOUC", "HETOUCN",
]


class RateBaseTests(unittest.TestCase):
    def test_strips_hyphens_and_single_leading_h(self):
        self.assertEqual(vpe.rate_base("HAGC"), "AGC")
        self.assertEqual(vpe.rate_base("AG-A1"), "AGA1")  # the card's own spelling
        self.assertEqual(vpe.rate_base("HAG5B"), "AG5B")

    def test_strips_only_one_leading_h(self):
        # A code that is just "H..." with no AG underneath stays non-AG.
        self.assertEqual(vpe.rate_base("HE1"), "E1")

    def test_blank_is_empty(self):
        self.assertEqual(vpe.rate_base(""), "")
        self.assertEqual(vpe.rate_base(None), "")


class ClassifyRateTests(unittest.TestCase):
    def test_known_card_families_are_priceable(self):
        for code in ("AGA1", "AGB", "AGC", "AG4C", "AG5B", "AG5C", "HAGA1", "HAGC", "HAG5B"):
            self.assertEqual(vpe.classify_rate(code), "ag", code)

    def test_ag_prefixed_without_card_family_is_not_priceable(self):
        # HAGFB normalizes to AGFB, which is AG-prefixed but maps to no card family.
        self.assertEqual(vpe.classify_rate("HAGFB"), "ag_no_card")

    def test_non_ag_codes(self):
        for code in ("A1X", "B1", "E19P", "HB1", "HB6", "HE1", "HE1N", "HEM", "HETOUC", "HETOUCN"):
            self.assertEqual(vpe.classify_rate(code), "non_ag", code)

    def test_real_export_split_counts_by_code(self):
        # Mirrors section 3's three tallies for the real export's 21 codes.
        ag = [c for c in EXPORT_CODES if vpe.classify_rate(c) == "ag"]
        ag_no_card = [c for c in EXPORT_CODES if vpe.classify_rate(c) == "ag_no_card"]
        non_ag = [c for c in EXPORT_CODES if vpe.classify_rate(c) == "non_ag"]
        self.assertEqual(sorted(ag), [
            "AG4C", "AG5B", "AG5C", "AGB", "AGC",
            "HAG5B", "HAGA1", "HAGA2", "HAGB", "HAGC",
        ])
        self.assertEqual(ag_no_card, ["HAGFB"])
        self.assertEqual(sorted(non_ag), [
            "A1X", "B1", "E19P", "HB1", "HB6",
            "HE1", "HE1N", "HEM", "HETOUC", "HETOUCN",
        ])


class IsHPrefixedAgTests(unittest.TestCase):
    def test_h_prefixed_ag_codes_flagged(self):
        # These map to a card family ONLY after stripping the leading H.
        for code in ("HAG5B", "HAGA1", "HAGA2", "HAGB", "HAGC"):
            self.assertTrue(vpe.is_h_prefixed_ag(code), code)

    def test_unprefixed_ag_codes_not_flagged(self):
        for code in ("AGB", "AGC", "AG4C", "AG5B"):
            self.assertFalse(vpe.is_h_prefixed_ag(code), code)

    def test_hagfb_not_flagged(self):
        # H-prefixed but no card family underneath -> not in the H-prefix AG gap.
        self.assertFalse(vpe.is_h_prefixed_ag("HAGFB"))

    def test_non_ag_h_codes_not_flagged(self):
        for code in ("HE1", "HB1", "HEM", "HETOUC"):
            self.assertFalse(vpe.is_h_prefixed_ag(code), code)

    def test_real_export_h_prefixed_ag_set(self):
        h_ag = sorted(c for c in EXPORT_CODES if vpe.is_h_prefixed_ag(c))
        self.assertEqual(h_ag, ["HAG5B", "HAGA1", "HAGA2", "HAGB", "HAGC"])


class NormAccountTests(unittest.TestCase):
    """The master's check-digited Full Acct # must reconcile with the export's
    zero-padded Account ID (existing behavior; guarded so the alias change does not
    regress it)."""

    def test_check_digit_and_zero_pad_reconcile(self):
        self.assertEqual(vpe.norm_account("0096005793-3"), "96005793")  # master Full Acct #
        self.assertEqual(vpe.norm_account("0096005793"), "96005793")    # export Account ID
        self.assertEqual(vpe.norm_account(None), None)
        self.assertEqual(vpe.norm_account(""), None)


class MasterAliasTests(unittest.TestCase):
    """The real Batth master headers must resolve to account / rate / nem so the
    per-account/rate/NEM counters stop reading 1 / 0 / 0."""

    def test_real_master_header_tokens_are_aliased(self):
        self.assertIn("fullacct", vpe.MASTER_ALIASES["account"])
        self.assertIn("activerateschedule", vpe.MASTER_ALIASES["rate"])
        self.assertIn("nema", vpe.MASTER_ALIASES["nem"])

    def test_geo_and_solar_aliases_present(self):
        self.assertIn("premlat", vpe.MASTER_ALIASES["lat"])
        self.assertIn("premlong", vpe.MASTER_ALIASES["lon"])
        self.assertIn("solar", vpe.MASTER_ALIASES["solar"])

    def test_no_horsepower_alias_invented(self):
        # The real master has no Horsepower column; HP must legitimately read 0/183.
        self.assertEqual(vpe.MASTER_ALIASES["horsepower"], {"hp", "horsepower"})


if __name__ == "__main__":
    unittest.main()
