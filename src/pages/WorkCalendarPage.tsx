import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, getErrorMessage, getToken } from "../api";
import { formatDisplayDate } from "../lib/formatDate";

const WEEKDAY_LABELS = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const MONTH_NAMES = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
];

type HolidayEntry = { date: string; label: string };

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function YearCalendar({
  year,
  workWeekdays,
  holidays,
}: {
  year: number;
  workWeekdays: number[];
  holidays: Map<string, string>;
}) {
  const months = useMemo(() => Array.from({ length: 12 }, (_, m) => m), []);
  return (
    <div className="year-calendar-grid">
      {months.map((month) => {
        const dim = daysInMonth(year, month);
        const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
        const cells: (number | null)[] = [
          ...Array(firstDow).fill(null),
          ...Array.from({ length: dim }, (_, i) => i + 1),
        ];
        while (cells.length % 7 !== 0) cells.push(null);
        return (
          <div key={month} className="year-calendar-month">
            <h3>
              {MONTH_NAMES[month]} {year}
            </h3>
            <div className="year-calendar-weekdays">
              {WEEKDAY_LABELS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="year-calendar-days">
              {cells.map((day, i) => {
                if (day == null) return <span key={i} className="cal-empty" />;
                const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const wd = (new Date(year, month, day).getDay() + 6) % 7;
                const isWork = workWeekdays.includes(wd);
                const label = holidays.get(iso);
                const isHoliday = Boolean(label !== undefined || holidays.has(iso));
                const title = label || (isHoliday ? "Libur" : isWork ? "Hari kerja" : "Akhir pekan");
                return (
                  <span
                    key={i}
                    title={title}
                    className={[
                      "cal-day",
                      isHoliday ? "cal-holiday" : isWork ? "cal-work" : "cal-off",
                    ].join(" ")}
                  >
                    {day}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function WorkCalendarPage() {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [workWeekdays, setWorkWeekdays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [holidayDates, setHolidayDates] = useState<HolidayEntry[]>([]);
  const [newHoliday, setNewHoliday] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const holidayMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const h of holidayDates) m.set(h.date, h.label);
    return m;
  }, [holidayDates]);

  const load = useCallback(() => {
    api<{ work_weekdays: number[]; holiday_dates: HolidayEntry[] }>("/integrations/work-calendar")
      .then((r) => {
        setWorkWeekdays(r.work_weekdays?.length ? r.work_weekdays : [0, 1, 2, 3, 4]);
        setHolidayDates(
          (r.holiday_dates ?? []).map((x) =>
            typeof x === "string" ? { date: x, label: "" } : { date: x.date, label: x.label ?? "" },
          ),
        );
      })
      .catch((e) => setErr(getErrorMessage(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleDay = (d: number) => {
    setWorkWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b),
    );
  };

  const addHoliday = () => {
    const d = newHoliday.trim().slice(0, 10);
    if (!d) return;
    setHolidayDates((h) => {
      const rest = h.filter((x) => x.date !== d);
      return [...rest, { date: d, label: newLabel.trim() }].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
    });
    setNewHoliday("");
    setNewLabel("");
  };

  const removeHoliday = (d: string) => {
    setHolidayDates((h) => h.filter((x) => x.date !== d));
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    if (workWeekdays.length === 0) {
      setErr("Pilih minimal satu hari kerja.");
      return;
    }
    try {
      await api("/integrations/work-calendar", {
        method: "PATCH",
        body: JSON.stringify({
          work_weekdays: workWeekdays,
          holiday_dates: holidayDates,
        }),
      });
      setMsg("Kalender kerja disimpan.");
      load();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  const importExcel = async () => {
    if (!importFile) return;
    setErr("");
    setMsg("");
    const fd = new FormData();
    fd.append("file", importFile);
    const token = getToken();
    try {
      const res = await fetch(
        `/api/integrations/work-calendar/import-holidays?mode=${importMode}`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.detail === "string" ? body.detail : "Import gagal");
      }
      const r = (await res.json()) as { imported: number; total: number };
      setMsg(`Import selesai: ${r.imported} baru, total ${r.total} libur.`);
      setImportFile(null);
      load();
    } catch (e) {
      setErr(getErrorMessage(e));
    }
  };

  return (
    <>
      <p>
        <Link to="/config">← Setting</Link>
      </p>
      <h1 className="page-title">Kalender kerja & libur</h1>
      {err && <p className="error">{err}</p>}
      {msg && <p>{msg}</p>}
      <form onSubmit={save}>
        <div className="card">
          <h2 className="card-title">Hari kerja</h2>
          <div className="weekday-picker">
            {WEEKDAY_LABELS.map((label, i) => (
              <label key={i} className="weekday-chip">
                <input type="checkbox" checked={workWeekdays.includes(i)} onChange={() => toggleDay(i)} />
                {label}
              </label>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="year-calendar-toolbar">
            <button type="button" onClick={() => setYear((y) => y - 1)}>
              ← {year - 1}
            </button>
            <strong>Tahun {year}</strong>
            <button type="button" onClick={() => setYear((y) => y + 1)}>
              {year + 1} →
            </button>
          </div>
          <YearCalendar year={year} workWeekdays={workWeekdays} holidays={holidayMap} />
          <p className="text-muted cal-legend">
            <span className="cal-legend-work">■</span> hari kerja ·{" "}
            <span className="cal-legend-holiday">■</span> libur · abu = non-kerja
          </p>
        </div>
        <div className="card">
          <h2 className="card-title">Import libur (Excel .xlsx)</h2>
          <p className="text-muted">
            Kolom <strong>Tanggal</strong> + <strong>Keterangan</strong>, atau auto-detect kolom tanggal di baris
            pertama.
          </p>
          <div className="form-row inline-row">
            <input type="file" accept=".xlsx" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
            <select value={importMode} onChange={(e) => setImportMode(e.target.value as "merge" | "replace")}>
              <option value="merge">Gabung (merge)</option>
              <option value="replace">Ganti semua (replace)</option>
            </select>
            <button type="button" onClick={importExcel} disabled={!importFile}>
              Upload
            </button>
          </div>
        </div>
        <div className="card">
          <h2 className="card-title">Daftar libur</h2>
          <div className="form-row inline-row">
            <input type="date" value={newHoliday} onChange={(e) => setNewHoliday(e.target.value)} />
            <input
              placeholder="Keterangan (opsional)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
            <button type="button" onClick={addHoliday}>
              Tambah
            </button>
          </div>
          <ul className="plain holiday-list">
            {holidayDates.length === 0 && <li className="text-muted">Belum ada libur.</li>}
            {holidayDates.map((h) => (
              <li key={h.date}>
                {formatDisplayDate(h.date)}
                {h.label ? ` — ${h.label}` : ""}{" "}
                <button type="button" className="danger-link" onClick={() => removeHoliday(h.date)}>
                  Hapus
                </button>
              </li>
            ))}
          </ul>
        </div>
        <button type="submit" className="primary">
          Simpan kalender
        </button>
      </form>
    </>
  );
}
