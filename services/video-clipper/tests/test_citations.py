from __future__ import annotations

from afterplay.citations import verify_citation
from afterplay.understand import Sentence


def test_exact_quote_derives_timestamp_from_transcript():
    match = verify_citation(
        "the cursed sniper is back",
        99.0,
        [Sentence(12.0, 18.0, "the cursed sniper is back")],
    )

    assert match.verified is True
    assert match.t == 12.0
    assert match.t_reported == 99.0
    assert match.quote == "the cursed sniper is back"
    assert match.repair == "timestamp"


def test_caption_split_and_punctuation_are_repaired_to_verbatim_span():
    match = verify_citation(
        "okay I might shapeshift into Ethan and then kill Harry",
        2488.1,
        [Sentence(2493.7, 2500.0,
                  "okay I might shap shift into Ethan, and then kill Harry I")],
    )

    assert match.verified is True
    assert match.t == 2493.7
    assert "shap shift" in match.quote
    assert "quote_fuzzy" in (match.repair or "")


def test_wrong_quote_is_rejected():
    match = verify_citation(
        "this never happened in the stream",
        10.0,
        [Sentence(10.0, 15.0, "the bridge sniper returned again")],
    )

    assert match.verified is False
    assert match.t is None
    assert match.quote == ""


def test_reported_time_breaks_tie_between_repeated_quotes():
    match = verify_citation(
        "we go again",
        102.0,
        [Sentence(5.0, 8.0, "we go again"),
         Sentence(100.0, 103.0, "we go again")],
    )

    assert match.verified is True
    assert match.t == 100.0


def test_unicode_quote_is_not_transliterated():
    quote = "भाई यह फिर से हुआ"
    match = verify_citation(
        quote,
        18.0,
        [Sentence(20.0, 24.0, quote + "।")],
    )

    assert match.verified is True
    assert match.t == 20.0
    assert match.quote.startswith("भाई")
