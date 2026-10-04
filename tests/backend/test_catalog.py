from newlora.catalog import select_models


def test_catalog_never_invents_or_includes_unrelated_models():
    raw = [
        {"id": "gpt-6.1-sol", "created": 200},
        {"id": "gpt-6-astra", "created": 100},
        {"id": "embedding-unknown", "created": 999},
        {"id": "gpt-realtime-2.1", "created": 300},
    ]
    assert [m["id"] for m in select_models("openai", raw)] == ["gpt-6.1-sol", "gpt-6-astra"]
    assert len(select_models("openai", [])) == 0
    assert len(select_models("zai", [])) == 7
    assert select_models("openai", raw, voice=True)[0]["id"] == "gpt-realtime-2.1"
