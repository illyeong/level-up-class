import unittest
from meter import Reading, Tracker, parse_rows, csv_record, clean_map_name
from screens import Monitor, selection_bounds


class ScreenCoordinateTests(unittest.TestCase):
    def test_left_monitor_with_negative_origin(self):
        monitor = Monitor(-1920, 136, 0, 1216)
        self.assertEqual(selection_bounds(monitor, (1920, 1080), (1500, 700), (1700, 820)),
                         (-420, 836, -220, 956))

    def test_right_monitor_with_vertical_offset(self):
        monitor = Monitor(2560, 230, 4480, 1310)
        self.assertEqual(selection_bounds(monitor, (1920, 1080), (1500, 700), (1700, 820)),
                         (4060, 930, 4260, 1050))

    def test_scaled_canvas_and_reverse_drag(self):
        monitor = Monitor(0, 0, 2560, 1440)
        self.assertEqual(selection_bounds(monitor, (1280, 720), (1200, 600), (1000, 500)),
                         (2000, 1000, 2400, 1200))

    def test_outside_monitor_is_clamped(self):
        monitor = Monitor(-1920, -1080, 0, 0)
        self.assertEqual(selection_bounds(monitor, (1920, 1080), (-20, -10), (2000, 1200)),
                         monitor.bounds)


class MeterTests(unittest.TestCase):
    def test_raw_time_rates_and_csv(self):
        value = Reading(60, 3600, 72)
        self.assertEqual(value.rates(), (3600, 72))
        self.assertEqual(csv_record("now", value), ["now", 60, 3600, 72, 3600, 72, ""])
        self.assertEqual(csv_record("now", value, "역병의 부화장")[-1], "역병의 부화장")

    def test_first_seconds_have_no_offset(self):
        for seconds in (1, 12, 13):
            value = Reading(seconds, 200, 3)
            self.assertEqual(value.rates(), (12000/seconds, 180/seconds))
        self.assertEqual(csv_record("now", Reading(0, 0, 0))[4:6], ["", ""])

    def test_map_name_is_text_not_a_timer_or_empty_screen(self):
        self.assertEqual(clean_map_name(" 역병의   부화장 "), "역병의 부화장")
        self.assertEqual(clean_map_name("비명 동굴 · 역병의 부화장"), "비명 동굴 · 역병의 부화장")
        for value in ("", "00:09:26", "35,836", "???", "abc\x00def"):
            self.assertEqual(clean_map_name(value), "")

    def test_user_screenshot_calculation(self):
        value = parse_rows(["00:09:26", "35,836", "693"])
        self.assertEqual(value, Reading(566, 35836, 693))
        self.assertAlmostEqual(value.rates()[0], 3798.86925795)
        self.assertAlmostEqual(value.rates()[1], 73.46289753)

    def test_ocr_thousands_separator(self):
        self.assertEqual(parse_rows(["00 : 09 : 26", "35.836", "693"]).gold, 35836)

    def test_invalid_screen_does_not_become_zero(self):
        for rows in (["", "", ""], ["00:99:10", "10", "20"],
                     ["00:00:00", "0", "0"], ["00:01:00", "35,83", "693"],
                     ["00:01:00", "130/400", "693"]):
            with self.assertRaises(ValueError):
                parse_rows(rows)

    def test_recent_window_uses_actual_game_duration(self):
        tracker = Tracker()
        tracker.add(Reading(566, 35836, 693), 0)
        tracker.add(Reading(631, 40061, 771), 65)
        rates, duration = tracker.recent()
        self.assertEqual(duration, 65)
        self.assertEqual(rates, (3900, 72))

    def test_reset_requires_two_progressing_samples(self):
        tracker = Tracker()
        tracker.add(Reading(566, 35836, 693), 0)
        with self.assertRaises(ValueError):
            tracker.add(Reading(4, 200, 5), 5)
        self.assertEqual(tracker.samples[-1].seconds, 566)
        self.assertEqual(tracker.add(Reading(9, 500, 11), 10), (True, True))
        self.assertIsNone(tracker.recent())

    def test_bad_reading_is_rejected_and_next_good_recovers(self):
        tracker = Tracker()
        tracker.add(Reading(566, 35836, 693), 0)
        with self.assertRaises(ValueError):
            tracker.add(Reading(571, 3583, 699), 5)
        with self.assertRaises(ValueError):
            tracker.add(Reading(9566, 36000, 699), 5)
        self.assertEqual(tracker.add(Reading(576, 36400, 705), 10), (True, False))

    def test_frozen_and_insufficient_data(self):
        tracker = Tracker()
        value = Reading(566, 35836, 693)
        tracker.add(value, 0)
        self.assertEqual(tracker.add(value, 5), (False, False))
        self.assertIsNone(tracker.recent())


if __name__ == "__main__":
    unittest.main()
