"""The latest ten successful OCR readings, saved independently of CSV exports."""
import json
import math
import os
from pathlib import Path
import tempfile


def valid_entry(item):
    if not isinstance(item, dict) or not isinstance(item.get("timestamp"), str):
        return False
    for key in ("seconds", "gold", "kills", "offset"):
        if type(item.get(key)) is not int or item[key] < 0:
            return False
    if item["seconds"] == 0 or item["offset"] not in (0, 13):
        return False
    if not isinstance(item.get("map_name", ""), str):
        return False
    for key in ("recent_gold", "recent_kills"):
        value = item.get(key)
        if value is not None and (type(value) not in (int, float) or not math.isfinite(value) or value < 0):
            return False
    return True


class History:
    def __init__(self, path):
        self.path = Path(path)
        self.entries = []  # oldest first on disk, newest first in the viewer
        self.error = None
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if not isinstance(data, list):
                raise ValueError("기록 파일 형식 오류")
            self.entries = [item for item in data if valid_entry(item)][-10:]
        except FileNotFoundError:
            pass
        except (OSError, ValueError) as exc:
            self.error = str(exc)

    def append(self, timestamp, value, recent, map_name=""):
        rates = recent[0] if recent else (None, None)
        item = dict(timestamp=timestamp, seconds=value.seconds, gold=value.gold,
                    kills=value.kills, offset=0, recent_gold=rates[0], recent_kills=rates[1], map_name=map_name)
        if not valid_entry(item):
            raise ValueError("잘못된 인식 기록은 저장할 수 없습니다.")
        self.entries = (self.entries+[item])[-10:]
        temporary = None
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".tmp",
                                             dir=self.path.parent, delete=False) as file:
                temporary = file.name
                json.dump(self.entries, file, ensure_ascii=False, allow_nan=False)
            os.replace(temporary, self.path)
            self.error = None
        except OSError as exc:
            self.error = str(exc)
        finally:
            if temporary and os.path.exists(temporary):
                os.unlink(temporary)


def history_values(item):
    seconds = item["seconds"]
    h, rest = divmod(seconds, 3600)
    m, s = divmod(rest, 60)
    elapsed = seconds-item["offset"]
    avg = (item["gold"]*60/elapsed, item["kills"]*60/elapsed) if elapsed > 0 else (None, None)
    def number(value):
        return "—" if value is None else f"{value:,.1f}"
    return (item["timestamp"], item.get("map_name") or "미인식", f"{h:02}:{m:02}:{s:02}", *map(number, avg),
            number(item.get("recent_gold")), number(item.get("recent_kills")))
