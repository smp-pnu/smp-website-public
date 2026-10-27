"""Reject a cached optimizer runtime if any pinned dependency is stale."""
from importlib.metadata import version
from pathlib import Path

for line in Path(__file__).with_name("pdf-requirements.txt").read_text().splitlines():
    if not line.strip() or line.startswith("#"):
        continue
    name, expected = line.split("==")
    if version(name) != expected:
        raise RuntimeError(f"PDF dependency needs updating: {name}")
