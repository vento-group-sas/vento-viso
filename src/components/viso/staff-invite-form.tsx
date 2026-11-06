"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type SiteOption = {
  id: string;
  name: string | null;
};

type RoleOption = {
  code: string;
  name: string;
};


type PendingInvitation = {
  id: string;
  email: string | null;
  full_name: string | null;
  status: string;
  resend_count: number | null;
  expires_at: string | null;
  last_sent_at: string | null;
  updated_at: string | null;
  role_code: string | null;
  staff_role: string | null;
  site_id: string | null;
  staff_site_id: string | null;
};

type FunctionPayload = {
  ok?: boolean;
  error?: string;
  message?: string;
  invited?: boolean;
  added_to_team?: boolean;
  status?: string;
  invitation_id?: string;
};

function localizedInvitationError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("resend already in progress") || normalized.includes("resend in progress")) {
    return "Ya se está reenviando esta invitación. Espera a que termine.";
  }
  if (normalized.includes("changed during") || normalized.includes("cannot be resent")) {
    return "La invitación cambió de estado. Actualiza la lista antes de continuar.";
  }
  if (normalized.includes("invitation cancelled") || normalized.includes("already accepted")) {
    return "La invitación ya fue aceptada o cancelada.";
  }
  if (normalized.includes("forbidden") || normalized.includes("permission denied")) {
    return "No tienes permisos para gestionar esta invitación o sede.";
  }
  if (normalized.includes("invitation not found")) {
    return "La invitación ya no está disponible.";
  }
  return message;
}

async function describeFunctionError(error: unknown, fallback: string): Promise<string> {
  const value = error as { context?: unknown; message?: string } | null;
  const context = value?.context;
  if (context && typeof (context as Response).clone === "function") {
    try {
      const payload = await (context as Response).clone().json();
      const explanation = [payload?.error, payload?.message, payload?.details]
        .find((item): item is string => typeof item === "string" && item.trim().length > 0);
      if (explanation) return localizedInvitationError(explanation);
    } catch {
      // A network failure may not contain JSON.
    }
  }
  return typeof value?.message === "string" && value.message.trim()
    ? localizedInvitationError(value.message) : fallback;
}

function formatInvitationDate(value: string | null): string {
  if (!value) return "Sin fecha";
  try {
    return new Intl.DateTimeFormat("es-CO", {
      timeZone: "America/Bogota", dateStyle: "medium", timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "Sin fecha";
  }
}

function parseInvitationExpirationDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 23, 59, 59, 999);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

type StaffInviteFormProps = {
  sites: SiteOption[];
  roles: RoleOption[];
};

export function StaffInviteForm({ sites, roles }: StaffInviteFormProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [siteId, setSiteId] = useState("");
  const [role, setRole] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const inFlightRef = useRef(false);

  const [pending, setPending] = useState<PendingInvitation[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState<{ error: boolean; message: string } | null>(null);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const actionInFlightRef = useRef(false);
  const loadSequenceRef = useRef(0);

  const loadPendingInvitations = useCallback(async () => {
    const sequence = ++loadSequenceRef.current;
    setPendingLoading(true);
    try {
      const { data, error } = await createClient()
        .from("staff_invitations")
        .select("id,email,full_name,status,resend_count,expires_at,last_sent_at,updated_at,role_code,staff_role,site_id,staff_site_id")
        .in("status", ["sent", "expired"])
        .order("updated_at", { ascending: false });
      if (error) throw error;
      if (sequence !== loadSequenceRef.current) return;
      setPending((data ?? []) as PendingInvitation[]);
      setPendingError(null);
    } catch (error) {
      const errorMessage = await describeFunctionError(error, "No se pudieron cargar las invitaciones.");
      if (sequence === loadSequenceRef.current) setPendingError(errorMessage);
    } finally {
      if (sequence === loadSequenceRef.current) setPendingLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPendingInvitations();
  }, [loadPendingInvitations]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlightRef.current || actionInFlightRef.current) return;
    const expirationDate = expiresAt ? parseInvitationExpirationDay(expiresAt) : null;
    if (expiresAt && (!expirationDate || expirationDate.getTime() <= Date.now())) {
      setStatus("error");
      setMessage("Fecha de vencimiento inválida. Selecciona hoy o una fecha posterior.");
      return;
    }

    inFlightRef.current = true;
    setStatus("saving");
    setMessage("");
    try {
      const { data, error } = await createClient().functions.invoke("staff-invitations-create", {
        body: {
          email: email.trim(),
          full_name: fullName.trim() || null,
          site_id: siteId,
          role,
          expires_at: expirationDate?.toISOString(),
        },
      });
      if (error) throw error;
      const response = data as FunctionPayload | null;
      if (response?.error || (!response?.invited && !response?.added_to_team)) {
        throw new Error(response?.error || "No se pudo completar la invitación.");
      }
      setStatus("done");
      setMessage(response.message || "Invitación procesada correctamente.");
      await loadPendingInvitations();
    } catch (error) {
      setStatus("error");
      setMessage(await describeFunctionError(error, "No se pudo crear la invitación."));
    } finally {
      inFlightRef.current = false;
    }
  };

  const handleInvitationAction = async (invitation: PendingInvitation, action: "resend" | "cancel") => {
    if (actionInFlightRef.current || inFlightRef.current) return;
    actionInFlightRef.current = true;
    setActiveAction(`${action}:${invitation.id}`);
    setPendingNotice(null);
    try {
      const { data, error } = await createClient().functions.invoke(
        `staff-invitations-${action}`,
        { body: { staff_invitation_id: invitation.id } },
      );
      if (error) throw error;
      const response = data as FunctionPayload | null;
      const expectedStatus = action === "resend" ? "sent" : "cancelled";
      if (response?.error || response?.ok !== true ||
          response?.status !== expectedStatus || response?.invitation_id !== invitation.id) {
        throw new Error(response?.error || "El servidor no confirmó la operación.");
      }
      setPendingNotice({
        error: false,
        message: response.message || (action === "resend"
          ? "Invitación reenviada correctamente." : "Invitación cancelada correctamente."),
      });
      await loadPendingInvitations();
    } catch (error) {
      setPendingNotice({
        error: true,
        message: await describeFunctionError(error,
          action === "resend" ? "No se pudo reenviar la invitación." : "No se pudo cancelar la invitación."),
      });
    } finally {
      actionInFlightRef.current = false;
      setActiveAction(null);
      if (action === "cancel") setConfirmCancelId(null);
    }
  };

  const canSubmit = Boolean(email.trim() && siteId && role);
  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-2">
          <span className="ui-label">Email</span>
          <input
            className="ui-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="correo@dominio.com"
            required
          />
        </label>
        <label className="space-y-2">
          <span className="ui-label">Nombre completo</span>
          <input
            className="ui-input"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Nombre y apellido"
          />
        </label>
        <label className="space-y-2">
          <span className="ui-label">Sede</span>
          <select
            className="ui-input"
            value={siteId}
            onChange={(event) => setSiteId(event.target.value)}
            required
          >
            <option value="">Selecciona una sede</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name ?? site.id}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="ui-label">Rol</span>
          <select
            className="ui-input"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            required
          >
            <option value="">Selecciona un rol</option>
            {roles.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-2">
          <span className="ui-label">Expira (fin del día)</span>
          <input
            className="ui-input"
            type="date"
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
          />
        </label>
      </div>

      {status === "error" ? <div className="ui-alert ui-alert--error">{message}</div> : null}
      {status === "done" ? <div className="ui-alert ui-alert--success">{message}</div> : null}

      <div className="flex gap-3">
        <button
          type="submit"
          className="ui-btn ui-btn--brand"
          disabled={!canSubmit || status === "saving" || activeAction !== null}
        >
          {status === "saving" ? "Guardando..." : "Crear invitacion"}
        </button>
        <button
          type="button"
          className="ui-btn ui-btn--ghost"
          disabled={status === "saving"}
          onClick={() => {
            setEmail("");
            setFullName("");
            setSiteId("");
            setRole("");
            setExpiresAt("");
            setStatus("idle");
            setMessage("");
          }}
        >
          Limpiar
        </button>
      </div>
      </form>

      <section className="mt-8 space-y-4 border-t border-[var(--ui-border)] pt-6" aria-labelledby="pending-invitations-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="pending-invitations-title" className="text-lg font-semibold">
              Invitaciones pendientes ({pending.length})
            </h2>
            <p className="text-sm text-[var(--ui-muted)]">
              Reenvía o cancela las invitaciones de las sedes que administras.
            </p>
          </div>
          <button type="button" className="ui-btn ui-btn--ghost"
            disabled={pendingLoading} onClick={() => void loadPendingInvitations()}>
            {pendingLoading ? "Actualizando..." : "Actualizar"}
          </button>
        </div>

        {pendingNotice ? (
          <div role={pendingNotice.error ? "alert" : "status"}
            className={pendingNotice.error ? "ui-alert ui-alert--error" : "ui-alert ui-alert--success"}>
            {pendingNotice.message}
          </div>
        ) : null}
        {pendingError ? (
          <div role="alert" className="ui-alert ui-alert--error">{pendingError}</div>
        ) : null}
        {pendingLoading && pending.length === 0 ? (
          <p className="text-sm text-[var(--ui-muted)]" role="status">Cargando invitaciones...</p>
        ) : null}
        {!pendingLoading && !pendingError && pending.length === 0 ? (
          <p className="rounded-xl border border-[var(--ui-border)] p-4 text-sm text-[var(--ui-muted)]">
            No hay invitaciones pendientes.
          </p>
        ) : null}

        {pending.map((invitation) => {
          const roleCode = invitation.role_code || invitation.staff_role || "";
          const siteCode = invitation.site_id || invitation.staff_site_id;
          const siteName = sites.find((site) => site.id === siteCode)?.name || "Sin sede";
          const roleName = roles.find((item) => item.code === roleCode)?.name || roleCode || "Sin rol";
          const expired = invitation.status === "expired" ||
            (invitation.expires_at != null && new Date(invitation.expires_at).getTime() < Date.now());
          const isResending = activeAction === `resend:${invitation.id}`;
          const isCancelling = activeAction === `cancel:${invitation.id}`;
          const canResend = invitation.status === "sent";

          return (
            <article key={invitation.id} className="rounded-xl border border-[var(--ui-border)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{invitation.full_name?.trim() || invitation.email || "Invitación"}</p>
                  <p className="break-all text-sm text-[var(--ui-muted)]">{invitation.email || "Sin correo"}</p>
                </div>
                <span className="ui-chip">{expired ? "Vencida" : "Pendiente"}</span>
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div><dt className="text-[var(--ui-muted)]">Sede</dt><dd>{siteName}</dd></div>
                <div><dt className="text-[var(--ui-muted)]">Rol</dt><dd>{roleName}</dd></div>
                <div><dt className="text-[var(--ui-muted)]">Último envío</dt>
                  <dd>{formatInvitationDate(invitation.last_sent_at ?? invitation.updated_at)}</dd></div>
                <div><dt className="text-[var(--ui-muted)]">Reenvíos</dt>
                  <dd>{invitation.resend_count ?? 0}</dd></div>
              </dl>
              {confirmCancelId === invitation.id ? (
                <div className="mt-4 space-y-3 rounded-xl border border-[var(--ui-border)] p-3">
                  <p className="text-sm">¿Confirmas que deseas cancelar esta invitación?</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="ui-btn ui-btn--danger"
                      disabled={activeAction !== null || status === "saving"}
                      onClick={() => void handleInvitationAction(invitation, "cancel")}>
                      {isCancelling ? "Cancelando..." : "Confirmar cancelación"}
                    </button>
                    <button type="button" className="ui-btn ui-btn--ghost"
                      disabled={activeAction !== null || status === "saving"} onClick={() => setConfirmCancelId(null)}>
                      Volver
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" className="ui-btn ui-btn--brand"
                    disabled={!canResend || activeAction !== null || status === "saving"}
                    onClick={() => void handleInvitationAction(invitation, "resend")}>
                    {isResending ? "Reenviando..." : "Reenviar"}
                  </button>
                  <button type="button" className="ui-btn ui-btn--ghost"
                    disabled={activeAction !== null || status === "saving"}
                    onClick={() => setConfirmCancelId(invitation.id)}>
                    Cancelar
                  </button>
                </div>
              )}
              {!canResend ? (
                <p className="mt-2 text-xs text-[var(--ui-muted)]">
                  Esta invitación ya venció. Crea una nueva invitación para dar acceso.
                </p>
              ) : null}
              {canResend && expired ? (
                <p className="mt-2 text-xs text-[var(--ui-muted)]">
                  El enlace venció. Reenviar generará uno nuevo.
                </p>
              ) : null}
            </article>
          );
        })}
      </section>
    </>
  );
}
