"""Physical-pixel capture and per-monitor selection for mixed-DPI desktops."""
import ctypes
from ctypes import wintypes
from contextlib import contextmanager
from dataclasses import dataclass
import tkinter as tk
from PIL import Image, ImageGrab, ImageTk

user32 = ctypes.WinDLL("user32", use_last_error=True)
user32.SetThreadDpiAwarenessContext.argtypes = [ctypes.c_void_p]
user32.SetThreadDpiAwarenessContext.restype = ctypes.c_void_p
user32.SetProcessDpiAwarenessContext.argtypes = [ctypes.c_void_p]
user32.SetProcessDpiAwarenessContext.restype = wintypes.BOOL
user32.GetParent.argtypes = [wintypes.HWND]
user32.GetParent.restype = wintypes.HWND
user32.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int,
                              ctypes.c_int, ctypes.c_int, wintypes.UINT]
user32.SetWindowPos.restype = wintypes.BOOL
user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user32.GetWindowRect.restype = wintypes.BOOL
MONITOR_CALLBACK = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HANDLE, wintypes.HDC,
                                     ctypes.POINTER(wintypes.RECT), wintypes.LPARAM)
user32.EnumDisplayMonitors.argtypes = [wintypes.HDC, ctypes.POINTER(wintypes.RECT), MONITOR_CALLBACK, wintypes.LPARAM]
user32.EnumDisplayMonitors.restype = wintypes.BOOL


def enable_dpi():
    # A packaged manifest may have already set process awareness. The thread
    # override still establishes the same physical coordinate system for Tk.
    user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
    if not user32.SetThreadDpiAwarenessContext(ctypes.c_void_p(-4)):
        raise ctypes.WinError(ctypes.get_last_error())


@contextmanager
def physical_pixels():
    previous = user32.SetThreadDpiAwarenessContext(ctypes.c_void_p(-4))
    if not previous:
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        yield
    finally:
        user32.SetThreadDpiAwarenessContext(previous)


@dataclass(frozen=True)
class Monitor:
    left: int
    top: int
    right: int
    bottom: int

    @property
    def width(self):
        return self.right-self.left

    @property
    def height(self):
        return self.bottom-self.top

    @property
    def bounds(self):
        return (self.left, self.top, self.right, self.bottom)


def monitors():
    result = []
    @MONITOR_CALLBACK
    def callback(handle, dc, rect, data):
        r = rect.contents
        result.append(Monitor(r.left, r.top, r.right, r.bottom))
        return True
    with physical_pixels():
        if not user32.EnumDisplayMonitors(None, None, callback, 0):
            raise ctypes.WinError(ctypes.get_last_error())
    return sorted(result, key=lambda m: (m.left, m.top))


def desktop_snapshot():
    with physical_pixels():
        layout = monitors()
        left = user32.GetSystemMetrics(76)
        top = user32.GetSystemMetrics(77)
        width = user32.GetSystemMetrics(78)
        height = user32.GetSystemMetrics(79)
        shot = ImageGrab.grab(all_screens=True)
        if shot.size != (width, height):
            raise RuntimeError("모니터 배치가 변경됐습니다. 영역 지정을 다시 눌러 주세요.")
        return shot, (left, top), layout


def capture_region(region):
    # Always capture in the worker's explicitly set physical-pixel context.
    with physical_pixels():
        return ImageGrab.grab(bbox=region, all_screens=True)


def selection_bounds(monitor, display_size, start, end):
    """Map actual canvas pixels to the selected monitor's physical pixels."""
    width, height = display_size
    if width <= 0 or height <= 0:
        raise ValueError("선택 창 크기가 올바르지 않습니다.")
    def point(p):
        x = round(max(0, min(width, p[0])) * monitor.width / width)
        y = round(max(0, min(height, p[1])) * monitor.height / height)
        return monitor.left+x, monitor.top+y
    a, b = point(start), point(end)
    return (min(a[0], b[0]), min(a[1], b[1]), max(a[0], b[0]), max(a[1], b[1]))


class ScreenSelector:
    def __init__(self, root, on_select, on_cancel, snapshot=None, prompt=None, min_size=(50, 45)):
        self.root = root
        self.on_select = on_select
        self.on_cancel = on_cancel
        self.views = []
        self.closed = False
        self.prompt = prompt or "맵 이름 → 시간 → 골드 → 처치 수, 4줄을 한 번에 드래그하세요.\n글자·숫자 전체를 포함하고 왼쪽 아이콘·아래 가방은 제외하세요.\n위아래 여백을 비슷하게 맞추세요.  Esc: 취소"
        self.min_size = min_size
        shot, origin, layout = snapshot or desktop_snapshot()
        try:
            for number, monitor in enumerate(layout, 1):
                crop = shot.crop((monitor.left-origin[0], monitor.top-origin[1],
                                  monitor.right-origin[0], monitor.bottom-origin[1]))
                self.add_view(number, monitor, crop)
            # SetWindowPos runs after initial Tk layout, with pointer-sized HWNDs.
            # Never create a single window spanning different monitor DPIs.
            root.update_idletasks()
            for view in self.views:
                self.position(view)
            root.update_idletasks()
            for view in self.views:
                self.position(view)
                self.redraw(view)
            if self.views:
                self.views[len(self.views)//2]["window"].focus_force()
        except Exception:
            self.destroy()
            raise

    def add_view(self, number, monitor, crop):
        window = tk.Toplevel(self.root)
        window.withdraw()
        window.overrideredirect(True)
        window.attributes("-topmost", True)
        window.geometry(f"{monitor.width}x{monitor.height}+0+0")
        canvas = tk.Canvas(window, highlightthickness=0, borderwidth=0, cursor="crosshair", bg="black")
        canvas.pack(fill="both", expand=True)
        view = dict(window=window, canvas=canvas, monitor=monitor, crop=crop,
                    number=number, start=None, end=None, photo=None, render_size=None)
        self.views.append(view)
        canvas.bind("<Configure>", lambda event: self.redraw(view))
        canvas.bind("<ButtonPress-1>", lambda event: self.down(view, event))
        canvas.bind("<B1-Motion>", lambda event: self.drag(view, event))
        canvas.bind("<ButtonRelease-1>", lambda event: self.up(view, event))
        window.bind("<Escape>", lambda event: self.cancel())
        window.protocol("WM_DELETE_WINDOW", self.cancel)
        window.deiconify()

    def position(self, view):
        window, monitor = view["window"], view["monitor"]
        hwnd = user32.GetParent(window.winfo_id()) or window.winfo_id()
        with physical_pixels():
            if not user32.SetWindowPos(hwnd, ctypes.c_void_p(-1), monitor.left, monitor.top,
                                      monitor.width, monitor.height, 0x0050):
                raise ctypes.WinError(ctypes.get_last_error())
            rect = wintypes.RECT()
            if not user32.GetWindowRect(hwnd, ctypes.byref(rect)):
                raise ctypes.WinError(ctypes.get_last_error())
            if (rect.left, rect.top, rect.right, rect.bottom) != monitor.bounds:
                raise RuntimeError("선택 창을 해당 모니터에 배치하지 못했습니다. 다시 시도해 주세요.")

    def redraw(self, view):
        if self.closed:
            return
        canvas = view["canvas"]
        size = (canvas.winfo_width(), canvas.winfo_height())
        if min(size) < 2:
            return
        if view["render_size"] != size:
            view["render_size"] = size
            crop = view["crop"]
            if crop.size != size:
                crop = crop.resize(size, Image.Resampling.LANCZOS)
            view["photo"] = ImageTk.PhotoImage(crop)
        canvas.delete("all")
        canvas.create_image(0, 0, image=view["photo"], anchor="nw")
        canvas.create_rectangle(12, 12, min(size[0]-12, 940), 98, fill="#10151f", outline="#f6b45e")
        canvas.create_text(28, 24, anchor="nw", fill="white", font=("맑은 고딕", 13),
                           text=f"모니터 {view['number']} · {self.prompt}")
        if view["start"] and view["end"]:
            canvas.create_rectangle(*view["start"], *view["end"], outline="#f6b45e", width=3)

    def down(self, view, event):
        view["start"] = (event.x, event.y)
        view["end"] = view["start"]
        self.redraw(view)

    def drag(self, view, event):
        if view["start"]:
            view["end"] = (event.x, event.y)
            self.redraw(view)

    def up(self, view, event):
        if not view["start"]:
            return
        canvas, monitor = view["canvas"], view["monitor"]
        region = selection_bounds(monitor, (canvas.winfo_width(), canvas.winfo_height()),
                                  view["start"], (event.x, event.y))
        left, top, right, bottom = region
        if right-left < self.min_size[0] or bottom-top < self.min_size[1]:
            return
        panel = view["crop"].crop((left-monitor.left, top-monitor.top,
                                    right-monitor.left, bottom-monitor.top))
        self.destroy()
        self.on_select(region, panel)

    def destroy(self):
        self.closed = True
        for view in self.views:
            if view["window"].winfo_exists():
                view["window"].destroy()

    def cancel(self):
        self.destroy()
        self.on_cancel()
