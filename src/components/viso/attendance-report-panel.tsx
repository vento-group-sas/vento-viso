"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ReportEmployeeOption = {
  id: string;
  label: string;
  role: string | null;
  siteIds: string[];
};

type ReportSiteOption = {
  id: string;
  label: string;
};

type ReportSummarySnapshot = {
  scheduledShifts: number;
  attendedShifts: number;
  lateCount: number;
  noShowCount: number;
  openCount: number;
  missingCloseCount: number;
  autoCloseCount: number;
  departureCount: number;
  scheduledMinutes: number;
  netMinutes: number;
  attendanceRate: number;
  punctualityRate: number;
};

type ReportSummaryResponse = {
  summary: ReportSummarySnapshot;
  topEmployees: { employeeName: string; incidentCount: number; lateCount: number; noShowCount: number; openCount: number }[];
  topSites: { siteName: string; incidentCount: number; lateCount: number; noShowCount: number; openCount: number }[];
  incidents: { category: string; employeeName: string; detail: string }[];
  incidentCountTotal: number;
};

type AttendanceReportPanelProps = {
  canViewReports: boolean;
  canFilterSite: boolean;
  canFilterEmployee: boolean;
  scopeLabel: string;
  siteOptions: ReportSiteOption[];
  employeeOptions: ReportEmployeeOption[];
};

function formatPercent(value: number) {
  return `${Math.round(Math.max(0, value) * 100)}%`;
}

function formatMinutesLabel(totalMinutes: number) {
  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  return `${minutes} min`;
}

function formatHoursLabel(totalMinutes: number) {
  const safe = Math.max(0, Number(totalMinutes) || 0);
  const totalHours = safe / 60;
  if (Number.isInteger(totalHours)) return `${totalHours} h`;
  return `${totalHours.toFixed(1).replace(".", ",")} h`;
}

function toInputDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toStartIso(value: string) {
  return new Date(`${value}T00:00:00`).toISOString();
}

function toEndIso(value: string) {
  return new Date(`${value}T23:59:59.999`).toISOString();
}

export function AttendanceReportPanel({
  canViewReports,
  canFilterSite,
  canFilterEmployee,
  scopeLabel,
  siteOptions,
  employeeOptions,
}: AttendanceReportPanelProps) {
  const [startDate, setStartDate] = useState(() => {
    const base = new Date();
    base.setDate(base.getDate() - 30);
    return toInputDate(base);
  });
  const [endDate, setEndDate] = useState(() => toInputDate(new Date()));
  const [siteId, setSiteId] = useState<string>("");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [summary, setSummary] = useState<ReportSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredEmployees = useMemo(() => {
    if (!siteId) return employeeOptions;
    return employeeOptions.filter((employee) => employee.siteIds.includes(siteId));
  }, [employeeOptions, siteId]);

  useEffect(() => {
    if (!employeeId || filteredEmployees.some((employee) => employee.id === employeeId)) return;
    const frame = window.requestAnimationFrame(() => setEmployeeId(""));
    return () => window.cancelAnimationFrame(frame);
  }, [employeeId, filteredEmployees]);

  const buildReportUrl = useCallback(
    (format: "json" | "xlsx") => {
      const params = new URLSearchParams();
      params.set("start", toStartIso(startDate));
      params.set("end", toEndIso(endDate));
      params.set("format", format);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz) params.set("tz", tz);
      if (canFilterSite && siteId) params.set("site_id", siteId);
      if (canFilterEmployee && employeeId) params.set("employee_id", employeeId);
      return `/api/viso/attendance-report?${params.toString()}`;
    },
    [canFilterEmployee, canFilterSite, employeeId, endDate, siteId, startDate],
  );

  const loadSummary = useCallback(async () => {
    if (!canViewReports) return;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(buildReportUrl("json"), {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = await response.text();
        throw new Error(payload || "No se pudo cargar el reporte.");
      }
      const payload = (await response.json()) as ReportSummaryResponse;
      setSummary(payload);
    } catch (fetchError) {
      console.error("[VISO] error al cargar resumen del reporte de asistencia:", fetchError);
      setSummary(null);
      setError("No se pudo cargar el resumen de asistencia.");
    } finally {
      setIsLoading(false);
    }
  }, [buildReportUrl, canViewReports]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      void loadSummary();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [loadSummary]);

  const handleDownload = useCallback(() => {
    window.location.href = buildReportUrl("xlsx");
  }, [buildReportUrl]);

  if (!canViewReports) {
    return (
      <div className="ui-panel">
        <p className="font-medium">No tienes acceso a este reporte.</p>
        <p className="mt-2 text-sm text-[var(--ui-muted)]">
          El reporte de asistencia respeta el mismo alcance operativo definido para ANIMA.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="ui-panel space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Reporte de asistencia</h2>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Descarga el consolidado operativo y revisa incidencias del periodo.
            </p>
          </div>
          <button type="button" onClick={handleDownload} className="ui-btn ui-btn--brand">
            Descargar Excel
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Fecha inicial</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="ui-input w-full"
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Fecha final</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="ui-input w-full"
            />
          </label>
          {canFilterSite ? (
            <label className="space-y-1 text-sm">
              <span className="font-medium">Sede</span>
              <select value={siteId} onChange={(event) => setSiteId(event.target.value)} className="ui-input w-full">
                <option value="">Todas las sedes</option>
                {siteOptions.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.label}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="space-y-1 text-sm">
              <span className="font-medium">Alcance</span>
              <div className="ui-input flex min-h-11 items-center">{scopeLabel}</div>
            </div>
          )}
          {canFilterEmployee ? (
            <label className="space-y-1 text-sm">
              <span className="font-medium">Trabajador</span>
              <select
                value={employeeId}
                onChange={(event) => setEmployeeId(event.target.value)}
                className="ui-input w-full"
              >
                <option value="">Todos los trabajadores</option>
                {filteredEmployees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="ui-panel border-[var(--ui-danger)] bg-[var(--ui-danger-soft)]">
          <p className="font-medium text-[var(--ui-danger)]">{error}</p>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <div className="ui-panel">
          <div className="text-sm text-[var(--ui-muted)]">Turnos programados</div>
          <div className="mt-2 text-2xl font-semibold">{summary?.summary.scheduledShifts ?? (isLoading ? "..." : 0)}</div>
        </div>
        <div className="ui-panel">
          <div className="text-sm text-[var(--ui-muted)]">Asistencia</div>
          <div className="mt-2 text-2xl font-semibold">
            {summary ? formatPercent(summary.summary.attendanceRate) : isLoading ? "..." : "0%"}
          </div>
        </div>
        <div className="ui-panel">
          <div className="text-sm text-[var(--ui-muted)]">Puntualidad</div>
          <div className="mt-2 text-2xl font-semibold">
            {summary ? formatPercent(summary.summary.punctualityRate) : isLoading ? "..." : "0%"}
          </div>
        </div>
        <div className="ui-panel">
          <div className="text-sm text-[var(--ui-muted)]">Minutos netos</div>
          <div className="mt-2 text-2xl font-semibold">
            {summary ? formatMinutesLabel(summary.summary.netMinutes) : isLoading ? "..." : "0 min"}
          </div>
        </div>
        <div className="ui-panel">
          <div className="text-sm text-[var(--ui-muted)]">Horas netas</div>
          <div className="mt-2 text-2xl font-semibold">
            {summary ? formatHoursLabel(summary.summary.netMinutes) : isLoading ? "..." : "0 h"}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="ui-panel space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">Incidencias clave</h3>
            <span className="ui-chip">{summary?.incidentCountTotal ?? 0} casos</span>
          </div>
          {summary?.incidents?.length ? (
            <div className="space-y-3">
              {summary.incidents.slice(0, 8).map((incident, index) => (
                <div key={`${incident.category}-${incident.employeeName}-${index}`} className="rounded-2xl border border-[var(--ui-border)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="ui-chip ui-chip--brand">{incident.category}</span>
                    <span className="text-sm text-[var(--ui-muted)]">{incident.employeeName}</span>
                  </div>
                  <p className="mt-2 text-sm text-[var(--ui-text)]">{incident.detail}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--ui-muted)]">
              {isLoading ? "Cargando incidencias..." : "No hay incidencias registradas en el periodo."}
            </p>
          )}
        </div>

        <div className="space-y-6">
          <div className="ui-panel space-y-4">
            <h3 className="text-base font-semibold">Trabajadores con más incidencias</h3>
            {summary?.topEmployees?.length ? (
              <div className="space-y-3">
                {summary.topEmployees.slice(0, 6).map((employee) => (
                  <div key={employee.employeeName} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--ui-border)] p-4">
                    <div>
                      <div className="font-medium">{employee.employeeName}</div>
                      <div className="text-sm text-[var(--ui-muted)]">
                        Tardanzas: {employee.lateCount} · Inasistencias: {employee.noShowCount} · Abiertos: {employee.openCount}
                      </div>
                    </div>
                    <span className="ui-chip">{employee.incidentCount}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--ui-muted)]">
                {isLoading ? "Cargando trabajadores..." : "Sin incidencias destacadas en trabajadores."}
              </p>
            )}
          </div>

          <div className="ui-panel space-y-4">
            <h3 className="text-base font-semibold">Sedes con más incidencias</h3>
            {summary?.topSites?.length ? (
              <div className="space-y-3">
                {summary.topSites.slice(0, 6).map((site) => (
                  <div key={site.siteName} className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--ui-border)] p-4">
                    <div>
                      <div className="font-medium">{site.siteName}</div>
                      <div className="text-sm text-[var(--ui-muted)]">
                        Tardanzas: {site.lateCount} · Inasistencias: {site.noShowCount} · Abiertos: {site.openCount}
                      </div>
                    </div>
                    <span className="ui-chip">{site.incidentCount}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--ui-muted)]">
                {isLoading ? "Cargando sedes..." : "Sin incidencias destacadas por sede."}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
