#!/usr/bin/env python3
"""Download the Airbnb iCal feeds and write assets/data/availability.json.

Feeds come from the ICAL_SUNSET, ICAL_STARGAZING, ICAL_SUNSET_NIGHTFALL and
ICAL_THREE_CABINS environment variables (GitHub Actions secrets). A feed whose
variable is empty or fails to download keeps whatever the JSON already holds.
Only the next 180 days are kept, as [start, end) date ranges (end exclusive).

Cabin availability is the union of every listing that would occupy it:
  sunset            = Sunset  ∪ Sunset+Nightfall ∪ 3 Cabins
  sunset-nightfall  = Sunset  ∪ Sunset+Nightfall ∪ 3 Cabins
  stargazing        = Stargazing ∪ 3 Cabins
  whole-property    = all four feeds
"""
import datetime as dt
import json
import os
import re
import sys
import urllib.request

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "data", "availability.json")
FEEDS = {
    "sunset": "ICAL_SUNSET",
    "stargazing": "ICAL_STARGAZING",
    "sunset-nightfall": "ICAL_SUNSET_NIGHTFALL",
    "three-cabins": "ICAL_THREE_CABINS",
}
CABINS = {
    "sunset": ["sunset", "sunset-nightfall", "three-cabins"],
    "sunset-nightfall": ["sunset", "sunset-nightfall", "three-cabins"],
    "stargazing": ["stargazing", "three-cabins"],
    "whole-property": ["sunset", "sunset-nightfall", "stargazing", "three-cabins"],
}
HORIZON_DAYS = 180


def parse_ics(text):
    """Return [(start_date, end_date)] for every VEVENT, end exclusive."""
    text = re.sub(r"\r?\n[ \t]", "", text)  # unfold continuation lines
    ranges = []
    for block in re.findall(r"BEGIN:VEVENT(.*?)END:VEVENT", text, re.S):
        s = re.search(r"^DTSTART[^:]*:(\d{8})", block, re.M)
        e = re.search(r"^DTEND[^:]*:(\d{8})", block, re.M)
        if not s:
            continue
        start = dt.datetime.strptime(s.group(1), "%Y%m%d").date()
        end = dt.datetime.strptime(e.group(1), "%Y%m%d").date() if e else start + dt.timedelta(days=1)
        if end <= start:
            end = start + dt.timedelta(days=1)
        ranges.append((start, end))
    return ranges


def merge(ranges):
    """Union of [start, end) ISO-date ranges, sorted and coalesced."""
    out = []
    for start, end in sorted(ranges):
        if out and start <= out[-1][1]:
            out[-1][1] = max(out[-1][1], end)
        else:
            out.append([start, end])
    return out


def main():
    today = dt.date.today()
    horizon = today + dt.timedelta(days=HORIZON_DAYS)
    try:
        with open(OUT) as f:
            data = json.load(f)
    except (OSError, ValueError):
        data = {"cabins": {}}
    data.setdefault("feeds", {})
    changed = 0
    for key, env in FEEDS.items():
        url = os.environ.get(env, "").strip()
        if not url:
            print(f"{key}: {env} not set, skipped")
            continue
        try:
            with urllib.request.urlopen(url, timeout=30) as r:
                text = r.read().decode("utf-8", "replace")
        except Exception as exc:  # network or HTTP error: keep old data
            print(f"{key}: fetch failed ({exc}), kept previous data", file=sys.stderr)
            continue
        busy = []
        for start, end in parse_ics(text):
            if end <= today or start >= horizon:
                continue
            busy.append([max(start, today).isoformat(), min(end, horizon).isoformat()])
        busy.sort()
        data["feeds"][key] = {"updated": dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z", "busy": busy}
        changed += 1
        print(f"{key}: {len(busy)} busy ranges")
    if not changed:
        print("No feeds configured; availability.json left untouched")
        return
    data["cabins"] = {}
    for cabin, sources in CABINS.items():
        feeds = [data["feeds"][k] for k in sources if k in data["feeds"]]
        if not feeds:
            continue
        data["cabins"][cabin] = {
            "updated": min(f["updated"] for f in feeds),
            "busy": merge([r for f in feeds for r in f["busy"]]),
        }
    data["generated"] = dt.datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
    data.pop("note", None)
    with open(OUT, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
