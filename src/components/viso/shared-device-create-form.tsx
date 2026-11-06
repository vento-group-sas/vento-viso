"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

type SiteOption = {
  id: string;
  name: string | null;
  code: string | null;
};

type AreaOption = {
  id: string;
  site_id: string;
  name: string | null;
  code: string | null;
  kind: string | null;
};

type AppOption = {
  code: string;
  name: string;
  description: string | null;
};

type TemplatePolicy = {
  policy_type?: string | null;
  scope_strategy?: string | null;
  role_code?: string | null;
  employee_id?: string | null;
  notes?: string | null;
};

type SharedDeviceTemplateOption = {
  id: string;
  code: string;
  label: string;
  description: string | null;
  device_type: string;
  default_app_code: string;
  requires_actor_pin: boolean;
  requires_active_actor_shift: boolean;
  allow_actor_without_pin: boolean;
  allow_actions_without_actor: boolean;
  app_codes: string[] | null;
  actor_policies: TemplatePolicy[] | null;
  sort_order: number;
};

export type SharedDeviceCreateState = {
  status: "idle" | "success" | "error";
  message?: string;
  device?: {
    id: string;
    code: string;
    label: string;
    loginEmail: string;
    temporaryPassword: string;
    defaultAppCode: string;
    appCodes: string[];
    templateCode: string;
    templateLabel: string;
  };
};

type SharedDeviceCreateFormProps = {
  action: (
    prevState: SharedDeviceCreateState,
    formData: FormData,
  ) => Promise<SharedDeviceCreateState>;
  sites: SiteOption[];
  areas: AreaOption[];
  apps: AppOption[];
  templates: SharedDeviceTemplateOption[];
};

const INITIAL_STATE: SharedDeviceCreateState = {
  status: "idle",
};

function slugCode(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function optionLabel(name: string | null, code?: string | null) {
  if (name && code) return `${name} (${code})`;
  return name ?? code ?? "Sin nombre";
}

function appName(apps: AppOption[], code: string) {
  return apps.find((app) => app.code === code)?.name ?? code.toUpperCase();
}

function policyLabel(policy: TemplatePolicy) {
  const type = policy.policy_type ?? "";
  const role = policy.role_code ? ` · rol ${policy.role_code}` : "";

  switch (type) {
    case "same_site_active_worker":
      return `Cualquier trabajador con jornada activa en la sede del dispositivo${role}`;
    case "same_area_active_worker":
      return `Cualquier trabajador con jornada activa en el área del dispositivo${role}`;
    case "role_in_site":
      return `Rol específico con jornada activa en la sede del dispositivo${role}`;
    case "role_in_area":
      return `Rol específico con jornada activa en el área del dispositivo${role}`;
    case "specific_employee":
      return "Trabajador específico";
    case "any_active_worker":
      return "Cualquier trabajador activo con jornada abierta";
    default:
      return type || "Política sin nombre";
  }
}

function normalizeCodes(values: string[] | null | undefined) {
  return Array.from(
    new Set(
      (values ?? [])
        .map((value) => String(value ?? "").trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

export function SharedDeviceCreateForm({
  action,
  sites,
  areas,
  apps,
  templates,
}: SharedDeviceCreateFormProps) {
  const [state, formAction, pending] = useActionState(action, INITIAL_STATE);

  const firstTemplate = templates[0] ?? null;
  const [templateId, setTemplateId] = useState(firstTemplate?.id ?? "");
  const selectedTemplate =
    templates.find((template) => template.id === templateId) ?? firstTemplate;

  const [siteId, setSiteId] = useState("");
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [customEmail, setCustomEmail] = useState("");

  const initialAppCodes = normalizeCodes(selectedTemplate?.app_codes);
  const [selectedAppCodes, setSelectedAppCodes] = useState<string[]>(initialAppCodes);
  const [defaultAppCode, setDefaultAppCode] = useState(
    selectedTemplate?.default_app_code ?? initialAppCodes[0] ?? "",
  );

  const visibleAreas = useMemo(
    () => areas.filter((area) => !siteId || area.site_id === siteId),
    [areas, siteId],
  );

  const appOptions = useMemo(() => {
    const byCode = new Map(apps.map((app) => [app.code, app]));

    for (const template of templates) {
      for (const appCode of normalizeCodes(template.app_codes)) {
        if (!byCode.has(appCode)) {
          byCode.set(appCode, {
            code: appCode,
            name: appCode.toUpperCase(),
            description: null,
          });
        }
      }
    }

    return Array.from(byCode.values()).sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [apps, templates]);

  const applyTemplate = (nextTemplateId: string) => {
    const nextTemplate =
      templates.find((template) => template.id === nextTemplateId) ?? templates[0];

    setTemplateId(nextTemplate?.id ?? "");

    const nextAppCodes = normalizeCodes(nextTemplate?.app_codes);
    setSelectedAppCodes(nextAppCodes);
    setDefaultAppCode(nextTemplate?.default_app_code ?? nextAppCodes[0] ?? "");
  };

  const updateLabel = (value: string) => {
    setLabel(value);
  };

  const toggleApp = (appCode: string) => {
    setSelectedAppCodes((current) => {
      if (current.includes(appCode)) {
        const next = current.filter((item) => item !== appCode);
        if (defaultAppCode === appCode) {
          setDefaultAppCode(next[0] ?? "");
        }
        return next;
      }

      return [...current, appCode];
    });
  };

  if (templates.length === 0) {
    return (
      <div className="ui-empty py-10 text-center text-[var(--ui-muted)]">
        No hay plantillas activas para crear dispositivos compartidos.
      </div>
    );
  }

  const selectedPolicies = selectedTemplate?.actor_policies ?? [];
  const automaticCode = slugCode(label || "DISPOSITIVO_COMPARTIDO");
  const previewCode = code.trim() ? code : automaticCode;
  const previewEmail = customEmail.trim()
    ? customEmail.trim()
    : `${previewCode.toLowerCase()}@devices.ventogroup.co`;

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="template_id" value={templateId} />

      <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
        <label className="space-y-2">
          <span className="ui-label">Plantilla configurable</span>
          <select
            className="ui-input"
            value={templateId}
            onChange={(event) => applyTemplate(event.target.value)}
            required
          >
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
        </label>

        {selectedTemplate ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-[var(--ui-border)] bg-white/70 p-3">
              <div className="ui-caption">Tipo</div>
              <div className="text-sm font-semibold">{selectedTemplate.device_type}</div>
            </div>

            <div className="rounded-xl border border-[var(--ui-border)] bg-white/70 p-3">
              <div className="ui-caption">App principal</div>
              <div className="text-sm font-semibold">{selectedTemplate.default_app_code.toUpperCase()}</div>
            </div>

            <div className="rounded-xl border border-[var(--ui-border)] bg-white/70 p-3">
              <div className="ui-caption">Código plantilla</div>
              <div className="text-sm font-semibold">{selectedTemplate.code}</div>
            </div>

            <div className="lg:col-span-3">
              <div className="ui-caption">Descripción</div>
              <p className="mt-1 text-sm text-[var(--ui-muted)]">
                {selectedTemplate.description ?? "Sin descripción."}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="space-y-2">
          <span className="ui-label">Nombre visible</span>
          <input
            name="label"
            className="ui-input"
            value={label}
            onChange={(event) => updateLabel(event.target.value)}
            placeholder="Caja Vento Café 01"
            required
          />
          <span className="ui-caption block">
            Con este nombre se generan automáticamente el código interno y el correo técnico.
          </span>
        </label>

        <label className="space-y-2">
          <span className="ui-label">Sede</span>
          <select
            name="site_id"
            className="ui-input"
            value={siteId}
            onChange={(event) => setSiteId(event.target.value)}
            required
          >
            <option value="">Selecciona una sede</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {optionLabel(site.name, site.code)}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="ui-label">Área</span>
          <select name="area_id" className="ui-input">
            <option value="">Sin área específica</option>
            {visibleAreas.map((area) => (
              <option key={area.id} value={area.id}>
                {optionLabel(area.name, area.code)}
              </option>
            ))}
          </select>
        </label>

        <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
          <div className="ui-label">Identidad automática</div>
          <div className="mt-2 space-y-2 text-sm">
            <div>
              <span className="ui-caption block">Código interno</span>
              <code className="break-all rounded bg-white/70 px-2 py-1">{previewCode}</code>
            </div>
            <div>
              <span className="ui-caption block">Correo técnico</span>
              <code className="break-all rounded bg-white/70 px-2 py-1">{previewEmail}</code>
            </div>
          </div>
          <p className="mt-3 text-xs text-[var(--ui-muted)]">
            Si el código ya existe, no se creará otro dispositivo. Para registrar un equipo diferente, usa otro código en Configuración avanzada de identidad.
          </p>
        </div>

        <label className="space-y-2 lg:col-span-2">
          <span className="ui-label">Descripción opcional</span>
          <textarea
            name="description"
            className="ui-input min-h-24"
            placeholder="Equipo fijo de caja. Cada venta debe identificar al trabajador actor."
          />
        </label>
      </div>

      <details className="rounded-2xl border border-[var(--ui-border)] bg-white/80 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--ui-text)]">
          Configuración avanzada de identidad
        </summary>
        <p className="mt-2 text-sm text-[var(--ui-muted)]">
          Normalmente no se toca. Úsalo solo si necesitas forzar un código o correo técnico específico.
        </p>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <label className="space-y-2">
            <span className="ui-label">Código personalizado</span>
            <input
              name="code"
              className="ui-input"
              value={code}
              onChange={(event) => setCode(slugCode(event.target.value))}
              placeholder={automaticCode}
            />
          </label>

          <label className="space-y-2">
            <span className="ui-label">Correo técnico personalizado</span>
            <input
              name="login_email"
              className="ui-input"
              type="email"
              value={customEmail}
              onChange={(event) => setCustomEmail(event.target.value.trim().toLowerCase())}
              placeholder={`${previewCode.toLowerCase()}@devices.ventogroup.co`}
            />
          </label>
        </div>
      </details>

      <div className="rounded-2xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[var(--ui-text)]">Apps permitidas</h2>
            <p className="mt-1 text-sm text-[var(--ui-muted)]">
              Se cargan desde la plantilla, pero puedes modificarlas para este dispositivo puntual.
            </p>
          </div>

          <label className="min-w-48 space-y-2">
            <span className="ui-label">App principal</span>
            <select
              name="default_app_code"
              className="ui-input"
              value={defaultAppCode}
              onChange={(event) => setDefaultAppCode(event.target.value)}
              required
            >
              {selectedAppCodes.map((appCode) => (
                <option key={appCode} value={appCode}>
                  {appName(appOptions, appCode)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {appOptions.map((app) => {
            const checked = selectedAppCodes.includes(app.code);

            return (
              <label
                key={app.code}
                className={`rounded-2xl border px-4 py-3 text-sm ${checked
                    ? "border-[color-mix(in_srgb,var(--ui-accent)_44%,var(--ui-border))] bg-[color-mix(in_srgb,var(--ui-accent)_8%,var(--ui-surface))]"
                    : "border-[var(--ui-border)] bg-white/70"
                  }`}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    name="app_codes"
                    value={app.code}
                    checked={checked}
                    onChange={() => toggleApp(app.code)}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-semibold text-[var(--ui-text)]">{app.name}</div>
                    <div className="ui-caption">{app.description ?? app.code}</div>
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--ui-border)] bg-white/80 p-4">
        <h2 className="text-sm font-semibold text-[var(--ui-text)]">Política de operación</h2>
        <p className="mt-1 text-sm text-[var(--ui-muted)]">
          Se copia desde la plantilla al crear el dispositivo. Luego se podrá editar en el dispositivo sin modificar la plantilla.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 text-sm">
            <input
              type="checkbox"
              name="requires_actor_pin"
              defaultChecked={selectedTemplate?.requires_actor_pin ?? true}
              className="mt-1"
            />
            <span>
              <span className="block font-semibold">Requiere PIN del trabajador</span>
              <span className="ui-caption">Cada acción sensible debe firmarla una persona real.</span>
            </span>
          </label>

          <label className="flex gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 text-sm">
            <input
              type="checkbox"
              name="requires_active_actor_shift"
              defaultChecked={selectedTemplate?.requires_active_actor_shift ?? true}
              className="mt-1"
            />
            <span>
              <span className="block font-semibold">Requiere jornada activa</span>
              <span className="ui-caption">El actor debe tener jornada abierta en ANIMA.</span>
            </span>
          </label>

          <label className="flex gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 text-sm">
            <input
              type="checkbox"
              name="allow_actor_without_pin"
              defaultChecked={selectedTemplate?.allow_actor_without_pin ?? false}
              className="mt-1"
            />
            <span>
              <span className="block font-semibold">Permitir actor sin PIN</span>
              <span className="ui-caption">Útil solo para pruebas controladas.</span>
            </span>
          </label>

          <label className="flex gap-3 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3 text-sm">
            <input
              type="checkbox"
              name="allow_actions_without_actor"
              defaultChecked={selectedTemplate?.allow_actions_without_actor ?? false}
              className="mt-1"
            />
            <span>
              <span className="block font-semibold">Permitir acciones sin actor</span>
              <span className="ui-caption">No recomendado. Solo para pantallas informativas.</span>
            </span>
          </label>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)] p-3">
          <div className="ui-label">Políticas que se copiarán desde la plantilla</div>
          {selectedPolicies.length > 0 ? (
            <div className="mt-2 space-y-2">
              {selectedPolicies.map((policy, index) => (
                <div key={`${policy.policy_type}-${policy.role_code}-${index}`} className="rounded-lg bg-white/70 px-3 py-2 text-sm">
                  <div className="font-semibold">{policyLabel(policy)}</div>
                  {policy.notes ? <div className="ui-caption">{policy.notes}</div> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-2 text-sm text-[var(--ui-muted)]">
              Esta plantilla no tiene políticas de actor configuradas.
            </div>
          )}
        </div>
      </div>

      {state.status === "error" ? (
        <div className="ui-alert ui-alert--error">{state.message}</div>
      ) : null}

      {state.status === "success" && state.device ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <div className="font-semibold">{state.message}</div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Dispositivo</div>
              <div>{state.device.label}</div>
              <div className="ui-caption">{state.device.code}</div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Plantilla</div>
              <div>{state.device.templateLabel}</div>
              <div className="ui-caption">{state.device.templateCode}</div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Apps</div>
              <div>{state.device.appCodes.map((app) => app.toUpperCase()).join(", ")}</div>
              <div className="ui-caption">Principal: {state.device.defaultAppCode.toUpperCase()}</div>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Email técnico</div>
              <code className="break-all rounded bg-white/70 px-2 py-1">{state.device.loginEmail}</code>
            </div>

            <div className="sm:col-span-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Contraseña temporal</div>
              <code className="break-all rounded bg-white/70 px-2 py-1">{state.device.temporaryPassword}</code>
            </div>
          </div>

          <p className="mt-3 text-xs text-emerald-900">
            Guarda esta contraseña ahora. No se podrá volver a ver desde Supabase Auth.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          className="ui-btn ui-btn--brand"
          disabled={pending || !label.trim() || !siteId || selectedAppCodes.length === 0 || !defaultAppCode}
        >
          {pending ? "Creando..." : "Crear dispositivo compartido"}
        </button>

        <Link href="/staff?tab=devices" className="ui-btn ui-btn--ghost">
          Cancelar
        </Link>
      </div>
    </form>
  );
}