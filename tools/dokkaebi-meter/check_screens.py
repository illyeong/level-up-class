"""Integration check: renders a known fixture on each connected monitor.

Run with the original screenshot path. Does not change the user's saved region.
"""
import asyncio
from concurrent.futures import ThreadPoolExecutor
import json
import sys
import tkinter as tk
from types import SimpleNamespace
from PIL import Image
from screens import ScreenSelector, capture_region, desktop_snapshot, enable_dpi
from meter import Reading, recognize_panel


def main():
    enable_dpi()
    root = tk.Tk()
    root.withdraw()
    source = Image.open(sys.argv[1]).crop((1450, 489, 1654, 644))
    _, origin, layout = desktop_snapshot()
    width = max(m.right for m in layout)-origin[0]
    height = max(m.bottom for m in layout)-origin[1]
    fixture = Image.new("RGB", (width, height), "#10151f")
    for monitor in layout:
        fixture.paste(source, (monitor.left-origin[0]+200, monitor.top-origin[1]+200))
    output = []
    try:
        for index, monitor in enumerate(layout):
            selected = []
            selector = ScreenSelector(root, lambda box, panel: selected.append((box, panel)),
                                      lambda: None, (fixture, origin, layout))
            root.update()
            view = selector.views[index]
            expected = (monitor.left+200, monitor.top+200,
                        monitor.left+200+source.width, monitor.top+200+source.height)
            # Exercise the same worker-thread capture coordinate path as the app.
            with ThreadPoolExecutor(max_workers=1) as pool:
                live_panel = pool.submit(capture_region, expected).result()
            value, map_name, map_error = asyncio.run(recognize_panel(live_panel))
            assert value == Reading(566, 35836, 693), (monitor, value)
            assert map_name == "역병의 부화장" and not map_error, (monitor, map_name, map_error)
            canvas = view["canvas"]
            sx, sy = canvas.winfo_width()/monitor.width, canvas.winfo_height()/monitor.height
            selector.down(view, SimpleNamespace(x=round(200*sx), y=round(200*sy)))
            selector.up(view, SimpleNamespace(x=round((200+source.width)*sx), y=round((200+source.height)*sy)))
            assert selected[0][0] == expected, (selected[0][0], expected)
            assert selected[0][1].tobytes() == source.convert("RGB").tobytes()
            output.append({"monitor": monitor.bounds, "selection": expected,
                           "captured": value.__dict__, "map_name": map_name, "result": "PASS"})
            root.update()
        selector = ScreenSelector(root, lambda *_: None, lambda: None, (fixture, origin, layout))
        selector.cancel()
        assert all(not v["window"].winfo_exists() for v in selector.views)
        print(json.dumps({"screens": output, "cancel": "PASS"}))
    finally:
        root.destroy()


if __name__ == "__main__":
    main()
