import csv
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import tkinter as tk
import unittest
from unittest.mock import AsyncMock, patch

from PIL import Image
import meter


class AppTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.config = Path(self.temp.name)/"settings.json"
        self.config_patch = patch.object(meter, "CONFIG", self.config)
        self.config_patch.start()
        self.root = tk.Tk()
        self.root.withdraw()

    def tearDown(self):
        self.root.destroy()
        self.config_patch.stop()
        self.temp.cleanup()

    def test_old_region_and_offset_are_not_reused(self):
        self.config.write_text(json.dumps({"coordinate_version": 2, "region": [10, 10, 100, 100],
                                          "map_region": [10, 0, 100, 10], "time_offset": 13}))
        app = meter.App(self.root)
        self.assertIsNone(app.region)
        app.display(meter.Reading(60, 3600, 72))
        self.assertEqual([v.get() for v in app.total_vars], ["3,600.0", "72.0"])
        app.region = (10, 10, 220, 170)
        app.save_settings()
        self.assertEqual(json.loads(self.config.read_text(encoding="utf-8")),
                         {"coordinate_version": 4, "regions": {"일반 측정": [10, 10, 220, 170]}, "mode": "일반 측정", "manual_map": ""})

    def test_one_capture_saves_map_and_unadjusted_rates(self):
        self.config.write_text(json.dumps({"coordinate_version": 3, "region": [10, 10, 220, 170]}))
        app = meter.App(self.root)
        self.assertIsNone(app.region)
        app.mode.set("절전 화면")
        app.change_mode()
        self.assertEqual(app.region, (10, 10, 220, 170))
        app.running = True
        app.next_capture = float("inf")
        reading = meter.Reading(60, 3600, 72)
        panel = Image.new("RGB", (210, 160))
        with patch.object(meter, "capture_region", return_value=panel) as capture, \
             patch.object(meter, "recognize_panel", new=AsyncMock(return_value=(reading, "역병의 부화장", ""))):
            app.capture(app.generation, app.region)
            capture.assert_called_once_with(app.region)
        app.tick()
        self.assertEqual(app.history.entries[-1]["offset"], 0)
        self.assertEqual(app.history.entries[-1]["map_name"], "역병의 부화장")
        # A map OCR failure must not copy the preceding map into the next record.
        app.events.put((app.generation, None, meter.Reading(65, 3900, 78), None, "", "미인식"))
        app.tick()
        self.assertEqual(app.history.entries[-1]["map_name"], "")
        path = Path(self.temp.name)/"records.csv"
        with patch.object(meter.filedialog, "asksaveasfilename", return_value=str(path)):
            app.export()
        with path.open(encoding="utf-8-sig", newline="") as stream:
            rows = list(csv.reader(stream))
        self.assertEqual(rows[1], [app.records[0][0], "60", "3600", "72", "3600.0", "72.0", "역병의 부화장"])
        self.assertEqual(len(rows[0]), 7)

    def test_normal_mode_capture_and_mode_regions_are_independent(self):
        app = meter.App(self.root)
        app.region = (0, 0, 270, 241)
        app.manual_map.set("비탄의 울림")
        app.save_settings()
        app.running = True
        app.next_capture = float("inf")
        with patch.object(meter, "capture_region", return_value=Image.new("RGB", (270, 241))), \
             patch.object(meter, "recognize_widget", new=AsyncMock(return_value=meter.Reading(11, 984, 19))):
            app.capture(app.generation, app.region, "일반 측정", app.manual_map.get())
        app.tick()
        self.assertEqual(app.history.entries[-1]["map_name"], "비탄의 울림")
        self.assertEqual(app.total_vars[1].get(), "103.6")
        old_generation = app.generation
        app.mode.set("절전 화면")
        app.change_mode()
        self.assertFalse(app.running)
        self.assertIsNone(app.region)
        self.assertGreater(app.generation, old_generation)
        app.mode.set("일반 측정")
        app.change_mode()
        self.assertEqual(app.region, (0, 0, 270, 241))
        cfg = json.loads(self.config.read_text(encoding="utf-8"))
        self.assertEqual(cfg["manual_map"], "비탄의 울림")


if __name__ == "__main__":
    unittest.main()
