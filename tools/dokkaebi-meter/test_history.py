import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from history import History, history_values
from meter import Reading


class HistoryTests(unittest.TestCase):
    def test_retains_last_ten_and_restores_after_restart(self):
        with TemporaryDirectory() as folder:
            path = Path(folder)/"history.json"
            history = History(path)
            for i in range(12):
                history.append(f"record-{i}", Reading(73+i, 3600+i, 72+i), ((3500, 70), 60))
            restored = History(path)
            self.assertEqual(len(restored.entries), 10)
            self.assertEqual(restored.entries[0]["timestamp"], "record-2")
            self.assertEqual(restored.entries[-1]["timestamp"], "record-11")
            self.assertEqual(restored.entries, history.entries)
            self.assertEqual(list(Path(folder).glob("*.tmp")), [])

    def test_historical_offset_is_fixed_and_zero_time_is_blank(self):
        with TemporaryDirectory() as folder:
            history = History(Path(folder)/"history.json")
            history.append("before", Reading(73, 3600, 72), None)
            history.entries[0]["offset"] = 13  # Legacy record keeps its historical calculation.
            history.append("after", Reading(73, 3600, 72), ((3000, 60), 60))
            self.assertEqual(history.entries[1]["offset"], 0)
            self.assertEqual(history_values(history.entries[0])[3:], ("3,600.0", "72.0", "—", "—"))
            self.assertNotEqual(history_values(history.entries[0])[3], history_values(history.entries[1])[3])
            history.append("start", Reading(13, 0, 0), None)
            history.entries[-1]["offset"] = 13
            self.assertEqual(history_values(history.entries[-1])[3:5], ("—", "—"))

    def test_map_name_roundtrip_and_old_history_compatibility(self):
        with TemporaryDirectory() as folder:
            path = Path(folder)/"history.json"
            history = History(path)
            history.append("before", Reading(73, 3600, 72), None, "역병의 부화장")
            self.assertEqual(history_values(History(path).entries[0])[1], "역병의 부화장")
            old = dict(history.entries[0])
            del old["map_name"]
            path.write_text(json.dumps([old]), encoding="utf-8")
            self.assertEqual(history_values(History(path).entries[0])[1], "미인식")

    def test_invalid_disk_data_does_not_crash(self):
        with TemporaryDirectory() as folder:
            path = Path(folder)/"history.json"
            path.write_text("{broken", encoding="utf-8")
            self.assertEqual(History(path).entries, [])
            path.write_text(json.dumps([None, {}, {"seconds": -10}]), encoding="utf-8")
            self.assertEqual(History(path).entries, [])


if __name__ == "__main__":
    unittest.main()
