"""Local-only Windows OCR meter. No game input, injection, or network calls."""
import asyncio
import csv
from collections import Counter
import ctypes
import json
import os
import queue
import re
import sys
import threading
import time
from dataclasses import dataclass
from pathlib import Path
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

from PIL import Image, ImageOps, ImageTk
from screens import ScreenSelector, capture_region, enable_dpi
from history import History, history_values


@dataclass(frozen=True)
class Reading:
    seconds: int
    gold: int
    kills: int

    def rates(self):
        elapsed = self.seconds
        if elapsed <= 0:
            raise ValueError("계산할 경과 시간이 0초 이하입니다. 잠시 기다려 주세요.")
        return self.gold * 60 / elapsed, self.kills * 60 / elapsed


def csv_record(timestamp, value, map_name=""):
    rates = value.rates() if value.seconds > 0 else ("", "")
    return [timestamp, value.seconds, value.gold, value.kills, *rates, map_name]


async def recognize_widget(panel):
    """Read the normal-mode measurement widget; ignore inventory and loot."""
    from winrt.windows.globalization import Language
    from winrt.windows.graphics.imaging import SoftwareBitmap, BitmapPixelFormat
    from winrt.windows.media.ocr import OcrEngine
    from winrt.windows.storage.streams import DataWriter
    engines = [OcrEngine.try_create_from_language(Language(lang)) for lang in ("en-US", "ko")]
    if not any(engines):
        raise RuntimeError("Windows 영어 또는 한국어 OCR 기능이 필요합니다.")
    rows = []
    # The selected rectangle runs from the monster-count row to the button's bottom.
    boxes = ((.22, .86, .47, .97), (.62, .14, 1, .30), (.52, 0, 1, .135))
    for index, box in enumerate(boxes):
        crop = panel.crop(tuple(round(v*(panel.width if i % 2 == 0 else panel.height)) for i, v in enumerate(box)))
        gray = ImageOps.grayscale(crop)
        candidates = []
        for scale in (3, 4):
            resized = gray.resize((gray.width*scale, gray.height*scale), Image.Resampling.LANCZOS)
            for pixels in (ImageOps.invert(resized), resized.point(lambda x: 0 if x >= 150 else 255)):
                pixels = ImageOps.expand(pixels, 18, fill=255).convert("RGBA")
                for engine in engines:
                    if engine is None:
                        continue
                    writer = DataWriter()
                    bitmap = SoftwareBitmap(BitmapPixelFormat.RGBA8, pixels.width, pixels.height)
                    try:
                        writer.write_bytes(pixels.tobytes())
                        bitmap.copy_from_buffer(writer.detach_buffer())
                        result = await engine.recognize_async(bitmap)
                        text = re.sub(r"\s+", "", " ".join(line.text for line in result.lines)).replace("：", ":")
                        pattern = r"\d{1,3}:\d{2}:\d{2}" if index == 0 else r"(?:\d+|\d{1,3}(?:[,.]\d{3})+)"
                        if index == 0:
                            match = re.search(r"(?<!\d)\d{1,3}:\d{2}:\d{2}(?!\d)", text)
                            text = match.group(0) if match else ""
                        if re.fullmatch(pattern, text):
                            candidates.append(text)
                    finally:
                        bitmap.close()
                        writer.close()
        if not candidates:
            raise ValueError(("시간", "골드", "처치 수")[index] + " 인식 실패 · 맨 위 처치 줄부터 아래 측정 종료 버튼까지 전체를 지정해 주세요.")
        rows.append(Counter(candidates).most_common(1)[0][0])
    return parse_rows(rows)


async def recognize_panel(panel):
    """Read four evenly spaced lines from a single captured rectangle."""
    split = round(panel.height / 4)
    value, _ = await recognize(panel.crop((0, split, panel.width, panel.height)))
    try:
        map_name = await recognize_map(panel.crop((0, 0, panel.width, split)))
        map_error = "" if map_name else "맵 이름 글자가 모두 들어가도록 영역을 확인해 주세요."
    except Exception as exc:
        map_name, map_error = "", str(exc)
    return value, map_name, map_error


def clean_map_name(text):
    name = re.sub(r"\s+", " ", text).strip()
    if len(name) > 80 or not re.search(r"[가-힣]{2}|[A-Za-z]{3}", name):
        return ""
    if not re.fullmatch(r"[가-힣A-Za-z0-9\s·ㆍ.,()\[\]_\-:]+", name):
        return ""
    return name


async def recognize_map(panel):
    from winrt.windows.globalization import Language
    from winrt.windows.graphics.imaging import SoftwareBitmap, BitmapPixelFormat
    from winrt.windows.media.ocr import OcrEngine
    from winrt.windows.storage.streams import DataWriter
    engine = OcrEngine.try_create_from_language(Language("ko"))
    if engine is None:
        raise RuntimeError("맵 이름 인식에는 Windows 한국어 OCR 기능이 필요합니다.")
    original = ImageOps.invert(ImageOps.autocontrast(ImageOps.grayscale(panel)))
    names = []
    # Compare multiple renderings instead of trusting a single Korean glyph read.
    for requested_scale in (2, 3, 4):
        scale = min(requested_scale, 2000/max(original.size))
        gray = original.resize((max(1, round(original.width*scale)), max(1, round(original.height*scale))), Image.Resampling.LANCZOS)
        for pixels in (gray, gray.point(lambda x: 255 if x >= 95 else 0)):
            pixels = ImageOps.expand(pixels, border=18, fill=255).convert("RGBA")
            writer = DataWriter()
            bitmap = SoftwareBitmap(BitmapPixelFormat.RGBA8, pixels.width, pixels.height)
            try:
                writer.write_bytes(pixels.tobytes())
                bitmap.copy_from_buffer(writer.detach_buffer())
                result = await engine.recognize_async(bitmap)
                name = clean_map_name(" ".join(line.text for line in result.lines))
                if name:
                    names.append(name)
            finally:
                bitmap.close()
                writer.close()
    counts = Counter(name.replace(" ", "") for name in names)
    if not counts:
        return ""
    key, votes = counts.most_common(1)[0]
    if votes < 2:
        return ""
    return next(name for name in names if name.replace(" ", "") == key)



def parse_rows(rows):
    cleaned = [re.sub(r"\s+", "", s).replace("：", ":") for s in rows]
    match = re.fullmatch(r"(\d{1,3}):(\d{2}):(\d{2})", cleaned[0])
    if not match:
        raise ValueError("시간을 읽지 못했습니다. 맵·시간·골드·처치 수 4줄을 여백이 비슷하게 지정해 주세요.")
    h, m, s = map(int, match.groups())
    if m >= 60 or s >= 60:
        raise ValueError("시간 인식 오류: " + cleaned[0])
    values = []
    for label, value in zip(("골드", "처치 수"), cleaned[1:]):
        # The game uses integer counters; OCR can mistake a thousands comma for a dot.
        if re.fullmatch(r"\d{1,3}(?:\.\d{3})+", value):
            value = value.replace(".", ",")
        if not re.fullmatch(r"(?:\d+|\d{1,3}(?:,\d{3})+)", value):
            raise ValueError(f"{label} 인식 실패: {value or '(빈 화면)'}")
        values.append(int(value.replace(",", "")))
    result = Reading(h * 3600 + m * 60 + s, *values)
    result.rates()
    return result


async def recognize(panel):
    from winrt.windows.globalization import Language
    from winrt.windows.graphics.imaging import SoftwareBitmap, BitmapPixelFormat
    from winrt.windows.media.ocr import OcrEngine
    from winrt.windows.storage.streams import DataWriter
    engine = OcrEngine.try_create_from_language(Language("ko"))
    if engine is None:
        engine = OcrEngine.try_create_from_user_profile_languages()
    if engine is None:
        raise RuntimeError("Windows 설정에서 영어 또는 한국어 OCR 언어 기능을 설치해 주세요.")
    english = OcrEngine.try_create_from_language(Language("en-US"))
    rows = []
    # Three equally-spaced rows: elapsed time, earned gold, defeated monsters.
    for i in range(3):
        crop = panel.crop((0, round(panel.height*i/3), panel.width, round(panel.height*(i+1)/3)))
        gray = ImageOps.autocontrast(ImageOps.grayscale(crop))
        gray = ImageOps.invert(gray)
        scale = min(3, 2000 / max(gray.size))
        gray = gray.resize((max(1, int(gray.width*scale)), max(1, int(gray.height*scale))), Image.Resampling.LANCZOS)
        rgb = ImageOps.expand(gray, border=18, fill=255).convert("RGBA")
        binary = ImageOps.expand(gray.point(lambda x: 255 if x >= 95 else 0), border=18, fill=255).convert("RGBA")
        text = ""
        for candidate, pixels in ((engine, rgb), (english, rgb), (engine, binary), (english, binary)):
            if candidate is None:
                continue
            writer = DataWriter()
            bitmap = SoftwareBitmap(BitmapPixelFormat.RGBA8, pixels.width, pixels.height)
            try:
                writer.write_bytes(pixels.tobytes())
                bitmap.copy_from_buffer(writer.detach_buffer())
                result = await candidate.recognize_async(bitmap)
                text = "".join(line.text for line in result.lines)
                clean = re.sub(r"\s+", "", text).replace("：", ":")
                pattern = r"\d{1,3}:\d{2}:\d{2}" if i == 0 else r"(?:\d+|\d{1,3}(?:[,.]\d{3})+)"
                if re.fullmatch(pattern, clean):
                    break
            finally:
                bitmap.close()
                writer.close()
        rows.append(text)
    return parse_rows(rows), rows


class Tracker:
    def __init__(self):
        self.samples = []
        self.pending_reset = None
        self.last_wall = None

    def add(self, reading, now=None):
        now = time.monotonic() if now is None else now
        reset = False
        if self.samples:
            last = self.samples[-1]
            if reading.seconds < last.seconds:
                previous = self.pending_reset
                self.pending_reset = reading
                if not (previous and previous.seconds < reading.seconds < last.seconds
                        and reading.gold >= previous.gold and reading.kills >= previous.kills):
                    raise ValueError("시간 초기화 감지 — 다음 인식으로 새 사냥 기록을 확인합니다.")
                self.samples.clear()
                self.last_wall = None
                self.pending_reset = None
                reset = True
            else:
                self.pending_reset = None
                if reading.gold < last.gold or reading.kills < last.kills:
                    raise ValueError("누적 숫자가 감소했습니다. 잘못 읽은 값은 반영하지 않았어요.")
                dt = reading.seconds - last.seconds
                if dt == 0:
                    if reading != last:
                        raise ValueError("숫자 갱신 중 — 다음 인식을 기다립니다.")
                    return False, False
                if self.last_wall is not None and dt > (now-self.last_wall)*2+10:
                    raise ValueError("시간이 갑자기 증가했습니다. 영역을 확인하거나 새 측정을 시작하세요.")
                if reading.kills-last.kills > dt*30 or reading.gold-last.gold > dt*100000:
                    raise ValueError("급격한 숫자 변화 감지 — 영역과 인식값을 확인해 주세요.")
        self.samples.append(reading)
        self.samples = [x for x in self.samples if reading.seconds-x.seconds <= 600]
        self.last_wall = now
        return True, reset

    def recent(self):
        if not self.samples:
            return None
        current = self.samples[-1]
        candidates = [r for r in self.samples[:-1] if 60 <= current.seconds-r.seconds <= 80]
        if not candidates:
            return None
        start = candidates[-1]
        delta = Reading(current.seconds-start.seconds, current.gold-start.gold, current.kills-start.kills)
        return delta.rates(), delta.seconds


BG, CARD, FG, MUTED, ACCENT = "#10151f", "#1c2533", "#eff5ff", "#a7b6cb", "#f6b45e"
CONFIG = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "DokkaebiMeter" / "settings.json"


class App:
    def __init__(self, root):
        self.root = root
        self.root.title("도깨비 사냥 측정기 v1.6 · 일반 화면 측정")
        self.root.geometry("550x900")
        self.root.minsize(530, 880)
        self.root.configure(bg=BG)
        self.region = None
        self.regions = {}
        self.mode = tk.StringVar(value="일반 측정")
        self.manual_map = tk.StringVar()
        self.last_map = ""
        self.map_text = tk.StringVar(value="맵: 영역 미지정")
        self.running = False
        self.busy = False
        self.generation = 0
        self.next_capture = 0
        self.events = queue.Queue()
        self.tracker = Tracker()
        self.records = []
        self.history = History(CONFIG.with_name("history.json"))
        self.history_window = None
        self.history_tree = None
        self.history_button_text = tk.StringVar(value=f"이전 기록 ({len(self.history.entries)}/10)")
        self.last_reading = None
        self.interval = tk.StringVar(value="5")
        self.status = tk.StringVar(value="맨 위 처치 줄부터 아래 ‘측정 종료’ 버튼까지 패널 전체를 지정해 주세요.")
        self.raw = tk.StringVar(value="경과 시간 —   ·   골드 —   ·   처치 —")
        self.region_text = tk.StringVar(value="인식 영역 미지정")
        self.total_vars = [tk.StringVar(value="—"), tk.StringVar(value="—")]
        self.recent_vars = [tk.StringVar(value="—"), tk.StringVar(value="—")]
        self.recent_caption = tk.StringVar(value="최근 약 1분 · 측정 시작 후 60초부터 표시")
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("TButton", font=("맑은 고딕", 10), padding=7)
        self.label(root, "도깨비 사냥 측정기", 20, FG).pack(anchor="w", padx=22, pady=(20, 4))
        self.label(root, "게임의 측정 화면을 읽어 사냥 효율을 계산합니다", 10, MUTED).pack(anchor="w", padx=22)
        mode_bar = tk.Frame(root, bg=BG)
        mode_bar.pack(fill="x", padx=22, pady=(10, 0))
        self.label(mode_bar, "화면 종류", 10, MUTED).pack(side="left")
        mode_picker = ttk.Combobox(mode_bar, textvariable=self.mode, values=("일반 측정", "절전 화면"), state="readonly", width=12)
        mode_picker.pack(side="left", padx=8)
        mode_picker.bind("<<ComboboxSelected>>", self.change_mode)
        map_entry_bar = tk.Frame(root, bg=BG)
        map_entry_bar.pack(fill="x", padx=22, pady=(7, 0))
        self.label(map_entry_bar, "일반 측정 맵 이름", 10, MUTED).pack(side="left")
        self.map_entry = ttk.Entry(map_entry_bar, textvariable=self.manual_map, width=25)
        self.map_entry.pack(side="left", padx=8)
        self.map_entry.bind("<FocusOut>", lambda _: self.save_settings())
        self.map_entry.bind("<Return>", lambda _: self.save_settings())
        self.label(map_entry_bar, "선택 입력", 9, MUTED).pack(side="left")
        self.card("측정 시작부터 전체 평균 / 분", self.total_vars)
        self.card(self.recent_caption, self.recent_vars)
        self.label(root, self.raw, 10, MUTED).pack(anchor="w", padx=22, pady=(9, 7))
        bar = tk.Frame(root, bg=BG)
        bar.pack(fill="x", padx=22)
        ttk.Button(bar, text="① 통합 영역 지정", command=self.select_region).pack(side="left")
        self.start_button = ttk.Button(bar, text="② 자동 인식 시작", command=self.toggle)
        self.start_button.pack(side="left", padx=8)
        ttk.Button(bar, text="새 측정", command=self.new_measurement).pack(side="left")
        map_bar = tk.Frame(root, bg=BG)
        map_bar.pack(fill="x", padx=22, pady=(8, 0))
        self.label(map_bar, self.map_text, 10, ACCENT, wraplength=470).pack(side="left")
        options = tk.Frame(root, bg=BG)
        options.pack(fill="x", padx=22, pady=10)
        self.label(options, "인식 간격", 10, MUTED).pack(side="left")
        ttk.Combobox(options, textvariable=self.interval, values=("2", "5", "10", "15"), width=4, state="readonly").pack(side="left", padx=6)
        self.label(options, "초", 10, MUTED).pack(side="left")
        top = tk.BooleanVar(value=True)
        self.root.attributes("-topmost", True)
        tk.Checkbutton(options, text="항상 위", variable=top, command=lambda: root.attributes("-topmost", top.get()), bg=BG, fg=FG, selectcolor=CARD, activebackground=BG).pack(side="right")
        self.label(root, self.region_text, 9, MUTED).pack(anchor="w", padx=22)
        self.preview = tk.Label(root, bg=CARD, text="일반 측정: 맨 위 처치 줄부터 아래 측정 종료 버튼까지\n보내주신 이미지처럼 패널 전체를 선택하세요.", fg=MUTED, height=4)
        self.preview.pack(fill="x", padx=22, pady=8)
        self.label(root, self.status, 10, ACCENT, wraplength=445).pack(fill="x", padx=22)
        footer = tk.Frame(root, bg=BG)
        footer.pack(side="bottom", fill="x", padx=22, pady=15)
        ttk.Button(footer, text="기록 CSV 저장", command=self.export).pack(side="left")
        ttk.Button(footer, textvariable=self.history_button_text, command=self.show_history).pack(side="left", padx=8)
        self.label(footer, "화면이 보여야 인식돼요", 9, MUTED).pack(side="right")
        try:
            cfg = json.loads(CONFIG.read_text(encoding="utf-8"))
            if not isinstance(cfg, dict):
                raise ValueError("설정 파일 형식 오류")
            saved = cfg.get("regions", {}) if cfg.get("coordinate_version") == 4 else {}
            if not isinstance(saved, dict):
                saved = {}
            if cfg.get("coordinate_version") == 3:
                saved = {"절전 화면": cfg.get("region")}
            for mode in ("일반 측정", "절전 화면"):
                box = saved.get(mode)
                if isinstance(box, list) and len(box) == 4 and all(type(n) is int for n in box) and box[2] > box[0] and box[3] > box[1]:
                    self.regions[mode] = tuple(box)
            if cfg.get("mode") in ("일반 측정", "절전 화면"):
                self.mode.set(cfg["mode"])
            if isinstance(cfg.get("manual_map"), str):
                self.manual_map.set(cfg["manual_map"][:80])
            self.region = self.regions.get(self.mode.get())
        except (OSError, ValueError, KeyError, TypeError):
            pass
        self.update_mode_labels()
        root.after(150, self.tick)

    def save_settings(self):
        try:
            CONFIG.parent.mkdir(parents=True, exist_ok=True)
            if self.region:
                self.regions[self.mode.get()] = self.region
            CONFIG.write_text(json.dumps({"coordinate_version": 4, "regions": self.regions,
                                          "mode": self.mode.get(), "manual_map": self.manual_map.get()[:80]}, ensure_ascii=False), encoding="utf-8")
        except OSError:
            pass

    def update_mode_labels(self):
        normal = self.mode.get() == "일반 측정"
        self.map_entry.configure(state="normal" if normal else "disabled")
        self.region_text.set(f"저장된 영역 {self.region} · 창 이동 시 다시 지정" if self.region else "인식 영역 미지정")
        self.map_text.set("맵: 일반 측정은 위에 선택 입력" if normal else "맵: 절전 화면에서 자동 인식")
        self.status.set("맨 위 처치 줄부터 아래 ‘측정 종료’ 버튼까지 패널 전체를 지정하세요." if normal
                        else "맵 이름 → 시간 → 골드 → 처치 수 4줄을 함께 지정하세요. 아이콘·가방 제외.")

    def change_mode(self, event=None):
        self.stop()
        self.region = self.regions.get(self.mode.get())
        self.tracker = Tracker()
        self.last_map = ""
        self.clear_values()
        self.preview.configure(image="", text="영역 지정 후 미리보기가 표시됩니다.", height=4)
        self.update_mode_labels()
        self.save_settings()

    def show_history(self):
        if self.history_window is not None and self.history_window.winfo_exists():
            self.history_window.deiconify()
            self.history_window.lift()
            return
        window = self.history_window = tk.Toplevel(self.root)
        window.title("최근 인식 기록 10개")
        window.geometry("1150x455")
        window.minsize(700, 410)
        window.configure(bg=BG)
        window.attributes("-topmost", bool(self.root.attributes("-topmost")))
        self.label(window, "최근 인식 기록 10개", 18, FG).pack(anchor="w", padx=18, pady=(16, 6))
        self.label(window, "성공한 자동 인식마다 추가 · 최신순 · 재실행해도 유지", 10, MUTED).pack(anchor="w", padx=18)
        frame = tk.Frame(window, bg=BG)
        frame.pack(fill="both", expand=True, padx=18, pady=12)
        columns = ("timestamp", "map", "elapsed", "gold", "kills", "recent_gold", "recent_kills")
        tree = self.history_tree = ttk.Treeview(frame, columns=columns, show="headings", height=10, selectmode="browse")
        for key, label, width in zip(columns,
                ("측정 시각", "맵 이름", "화면 시간", "평균 골드/분", "평균 마리/분", "최근 골드/분", "최근 마리/분"),
                (165, 190, 95, 120, 120, 120, 120)):
            tree.heading(key, text=label)
            tree.column(key, width=width, minwidth=width, anchor="center")
        scroll = ttk.Scrollbar(frame, orient="horizontal", command=tree.xview)
        tree.configure(xscrollcommand=scroll.set)
        tree.pack(fill="both", expand=True)
        scroll.pack(fill="x")
        self.history_detail = tk.StringVar()
        self.label(window, self.history_detail, 10, ACCENT).pack(anchor="w", padx=18, pady=(0, 5))
        self.label(window, "최근 1분 기록이 부족하면 — 로 표시합니다. 이전 버전 기록은 당시 계산값을 유지합니다.", 9, MUTED).pack(anchor="w", padx=18, pady=(0, 14))
        tree.bind("<<TreeviewSelect>>", lambda event: self.history_selection())
        self.refresh_history()

    def refresh_history(self):
        self.history_button_text.set(f"이전 기록 ({len(self.history.entries)}/10)")
        if self.history_window is None or not self.history_window.winfo_exists():
            return
        tree = self.history_tree
        children = tree.get_children()
        if children:
            tree.delete(*children)
        self.history_visible = list(reversed(self.history.entries))
        for index, item in enumerate(self.history_visible):
            tree.insert("", "end", iid=str(index), values=history_values(item))
        self.history_detail.set("행을 선택하면 누적 골드·처치 수가 표시됩니다." if self.history_visible
                                else "아직 기록이 없습니다. 자동 인식을 시작하면 여기에 쌓입니다.")

    def history_selection(self):
        selected = self.history_tree.selection()
        if selected:
            item = self.history_visible[int(selected[0])]
            self.history_detail.set(f"{item.get('map_name') or '맵 미인식'} · 누적 {item['gold']:,}골드 · {item['kills']:,}마리 · 계산 시간 {max(0, item['seconds']-item['offset']):,}초" + (" (이전 버전 보정 기록)" if item['offset'] else ""))

    def label(self, parent, text, size, color, **kwargs):
        key = "textvariable" if isinstance(text, tk.Variable) else "text"
        return tk.Label(parent, **{key: text}, bg=BG, fg=color, font=("맑은 고딕", size), anchor="w", **kwargs)

    def card(self, title, variables):
        frame = tk.Frame(self.root, bg=CARD, padx=16, pady=12)
        frame.pack(fill="x", padx=22, pady=(14, 0))
        key = "textvariable" if isinstance(title, tk.Variable) else "text"
        tk.Label(frame, **{key: title}, bg=CARD, fg=MUTED, font=("맑은 고딕", 10)).pack(anchor="w")
        row = tk.Frame(frame, bg=CARD)
        row.pack(fill="x", pady=(7, 0))
        for title, var in zip(("골드 / 분", "마리 / 분"), variables):
            col = tk.Frame(row, bg=CARD)
            col.pack(side="left", expand=True, fill="x")
            tk.Label(col, textvariable=var, font=("맑은 고딕", 23, "bold"), bg=CARD, fg=FG, anchor="w").pack(fill="x")
            tk.Label(col, text=title, font=("맑은 고딕", 9), bg=CARD, fg=ACCENT, anchor="w").pack(fill="x")

    def stop(self):
        self.running = False
        self.generation += 1
        self.start_button.configure(text="② 자동 인식 시작")

    def toggle(self):
        if self.running:
            self.stop()
            self.status.set("인식 중지 · 표시된 값은 마지막으로 읽은 값입니다.")
        elif self.region is None:
            messagebox.showinfo("영역 지정", "먼저 선택한 화면 종류에 맞춰 통합 영역을 지정해 주세요.")
        else:
            self.save_settings()
            self.tracker = Tracker()
            self.running = True
            self.next_capture = 0
            self.start_button.configure(text="인식 중지")
            self.status.set("자동 인식 중… 숫자 영역을 다른 창으로 가리지 마세요.")

    def clear_values(self):
        self.last_reading = None
        for var in self.total_vars+self.recent_vars:
            var.set("—")
        self.raw.set("경과 시간 —   ·   골드 —   ·   처치 —")

    def new_measurement(self):
        self.generation += 1
        self.tracker = Tracker()
        self.clear_values()
        self.next_capture = 0
        self.status.set("최근 1분 측정을 초기화했습니다. 전체 평균은 게임의 경과 시간 기준입니다.")

    def select_region(self):
        self.stop()
        if self.history_window is not None and self.history_window.winfo_exists():
            self.history_window.withdraw()
        self.root.withdraw()
        self.root.after(250, self.show_selector)

    def show_selector(self):
        try:
            self.selector = ScreenSelector(self.root, self.region_selected, self.root.deiconify,
                min_size=(70, 70), prompt=("일반 측정 패널 전체를 드래그하세요.\n맨 위 처치 아이콘 줄부터 아래 ‘측정 종료’ 버튼까지, 좌우 테두리에 맞추세요.\n가방·아이템도 함께 포함합니다. 바깥 여백은 최소로.  Esc: 취소" if self.mode.get() == "일반 측정" else None))
        except Exception as exc:
            self.root.deiconify()
            self.status.set(f"화면 캡처 실패: {exc}")

    def region_selected(self, region, panel):
        self.region = region
        self.last_map = ""
        self.map_text.set("맵: 인식 대기")
        self.save_settings()
        self.region_text.set(f"인식 영역 {region} · 창 이동 시 다시 지정")
        self.set_preview(panel)
        self.tracker = Tracker()
        self.clear_values()
        self.root.deiconify()
        self.status.set("영역 지정 완료. 미리보기를 확인한 뒤 자동 인식을 시작하세요.")

    def set_preview(self, panel):
        panel = panel.copy()
        panel.thumbnail((430, 130))
        self.photo = ImageTk.PhotoImage(panel)
        self.preview.configure(image=self.photo, text="", height=130)

    def tick(self):
        try:
            while True:
                generation, panel, value, error, map_name, map_error = self.events.get_nowait()
                self.busy = False
                if generation != self.generation or not self.running:
                    continue
                if panel:
                    self.set_preview(panel)
                if error:
                    self.status.set("읽기 실패 · 이전 값 유지\n" + error)
                    continue
                try:
                    added, reset = self.tracker.add(value)
                    if map_name and self.last_map and map_name.replace(" ", "") != self.last_map.replace(" ", ""):
                        self.tracker.samples = [value]
                    if map_name:
                        self.last_map = map_name
                    self.map_text.set("맵: " + (map_name or ("이름 미입력" if self.mode.get() == "일반 측정" else "미인식")))
                    self.display(value)
                    if added:
                        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
                        self.records.append((timestamp, value, map_name))
                        self.history.append(timestamp, value, self.tracker.recent(), map_name)
                        self.refresh_history()
                    prefix = "새 측정 세션 감지 · " if reset else ""
                    self.status.set(prefix+f"정상 인식 {time.strftime('%H:%M:%S')} · {self.interval.get()}초마다 갱신")
                    if map_error:
                        self.status.set("숫자 인식 정상 · 맵 미인식: " + map_error)
                    if self.history.error:
                        self.status.set("인식 정상 · 기록 파일 저장 실패 (현재 창에서는 확인 가능): " + self.history.error)
                except ValueError as exc:
                    self.status.set("이전 값 유지 · " + str(exc))
        except queue.Empty:
            pass
        if self.running and not self.busy and time.monotonic() >= self.next_capture:
            self.busy = True
            self.next_capture = time.monotonic()+int(self.interval.get())
            threading.Thread(target=self.capture, args=(self.generation, self.region, self.mode.get(), self.manual_map.get().strip()[:80]), daemon=True).start()
        self.root.after(150, self.tick)

    def capture(self, generation, region, mode="절전 화면", manual_map=""):
        panel = None
        try:
            panel = capture_region(region)
            if mode == "일반 측정":
                value = asyncio.run(recognize_widget(panel))
                map_name, map_error = manual_map, ""
            else:
                value, map_name, map_error = asyncio.run(recognize_panel(panel))
            self.events.put((generation, panel, value, None, map_name, map_error))
        except Exception as exc:
            self.events.put((generation, panel, None, str(exc), "", ""))

    def display(self, value):
        self.last_reading = value
        elapsed = value.seconds
        if elapsed > 0:
            for var, number in zip(self.total_vars, value.rates()):
                var.set(f"{number:,.1f}")
        else:
            for var in self.total_vars:
                var.set("—")
        h, rem = divmod(value.seconds, 3600)
        m, s = divmod(rem, 60)
        self.raw.set(f"{h:02}:{m:02}:{s:02}   ·   {value.gold:,}골드   ·   {value.kills:,}마리")
        recent = self.tracker.recent()
        if recent:
            rates, seconds = recent
            self.recent_caption.set(f"최근 {seconds}초 변화량을 분당으로 환산")
            for var, number in zip(self.recent_vars, rates):
                var.set(f"{number:,.1f}")
        else:
            for var in self.recent_vars:
                var.set("—")
            self.recent_caption.set("최근 약 1분 · 유효한 기록 60초 이상 필요")

    def export(self):
        if not self.records:
            messagebox.showinfo("기록 없음", "자동 인식에 성공하면 기록을 저장할 수 있습니다.")
            return
        path = filedialog.asksaveasfilename(defaultextension=".csv", initialfile="사냥기록.csv", filetypes=[("CSV", "*.csv")])
        if path:
            try:
                with open(path, "w", newline="", encoding="utf-8-sig") as file:
                    writer = csv.writer(file)
                    writer.writerow(["측정시각", "화면경과초", "누적골드", "누적처치", "평균골드/분", "평균처치/분", "맵이름"])
                    writer.writerows(csv_record(timestamp, value, map_name) for timestamp, value, map_name in self.records)
                self.status.set("CSV 저장 완료 · 화면의 경과 시간 기준")
            except OSError as exc:
                messagebox.showerror("저장 실패", str(exc))


def main():
    enable_dpi()
    if len(sys.argv) > 1 and sys.argv[1] in ("--check-image", "--check-map-image", "--check-panel-image", "--check-widget-image"):
        path, left, top, right, bottom, output = sys.argv[2:]
        try:
            with Image.open(path) as source:
                panel = source.crop(tuple(map(int, (left, top, right, bottom))))
            if sys.argv[1] == "--check-widget-image":
                value = asyncio.run(recognize_widget(panel))
                result = {"seconds": value.seconds, "gold": value.gold, "kills": value.kills, "per_minute": value.rates()}
            elif sys.argv[1] == "--check-panel-image":
                value, map_name, map_error = asyncio.run(recognize_panel(panel))
                result = {"seconds": value.seconds, "gold": value.gold, "kills": value.kills,
                          "per_minute": value.rates(), "map_name": map_name, "map_error": map_error}
            elif sys.argv[1] == "--check-map-image":
                result = {"map_name": asyncio.run(recognize_map(panel))}
            else:
                value, raw = asyncio.run(recognize(panel))
                result = {"seconds": value.seconds, "gold": value.gold, "kills": value.kills,
                          "per_minute": value.rates(), "raw": raw}
        except Exception as exc:
            result = {"error": str(exc)}
        Path(output).write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
        return
    root = tk.Tk()
    App(root)
    root.mainloop()


if __name__ == "__main__":
    main()
