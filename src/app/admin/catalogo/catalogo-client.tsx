"use client";

import { useRef, useState, type FormEvent } from "react";

import { createClient } from "@/lib/supabase/client";

type Props = {
  authorized: boolean;
  currentEmail: string | null;
  invalidLink: boolean;
};

type ApiResponse = {
  error?: string;
  ok?: boolean;
  path?: string;
  token?: string;
};

async function readResponse(response: Response): Promise<ApiResponse> {
  return (await response.json().catch(() => ({}))) as ApiResponse;
}

export function CatalogoClient({ authorized, currentEmail, invalidLink }: Props) {
  const [email, setEmail] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function sendLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/catalogo/send-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await readResponse(response);
      if (!response.ok) throw new Error(payload.error || "No fue posible solicitar el enlace.");
      setMessage("Si este correo tiene acceso, recibirás un enlace para entrar sin contraseña.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo enviar el enlace.");
    } finally {
      setBusy(false);
    }
  }

  async function replaceCatalog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    setBusy(true);
    setMessage("");
    setSuccess(false);
    try {
      if (!/\.pdf$/i.test(file.name) || file.size < 12 || file.size > 25 * 1024 * 1024) {
        throw new Error("Selecciona un PDF válido de máximo 25 MB.");
      }
      const prepare = await fetch("/api/catalogo/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, size: file.size }),
      });
      const prepared = await readResponse(prepare);
      if (!prepare.ok || !prepared.path || !prepared.token) {
        throw new Error(prepared.error || "No se pudo preparar la carga.");
      }

      const { error: uploadError } = await createClient().storage
        .from("documents")
        .uploadToSignedUrl(prepared.path, prepared.token, file, {
          contentType: "application/pdf",
        });
      if (uploadError) throw new Error("No se pudo cargar el PDF: " + uploadError.message);

      const confirm = await fetch("/api/catalogo/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: prepared.path }),
      });
      const published = await readResponse(confirm);
      if (!confirm.ok || !published.ok) {
        throw new Error(published.error || "El PDF no pudo publicarse.");
      }

      setSuccess(true);
      setMessage("Catálogo reemplazado correctamente. El enlace NFC permanece igual.");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ocurrió un error al reemplazar el PDF.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f5f2] px-4 py-14 text-[#292523]">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-[#e6e1dc] bg-white p-6 shadow-sm sm:p-9">
        <div className="mb-5 flex items-center gap-2 text-sm font-semibold tracking-wide text-[#675a55]">
          <span aria-hidden="true">▣</span> VENTO GROUP · ADMINISTRACIÓN
        </div>
        <h1 className="mb-2 text-3xl font-semibold">Catálogo navideño</h1>
        <p className="mb-7 text-sm leading-relaxed text-[#6c655f]">
          El catálogo público siempre se abre desde
          {" "}<a className="underline underline-offset-4" href="https://ventogroup.co/catalogo" target="_blank" rel="noopener noreferrer">
            ventogroup.co/catalogo
          </a>.
        </p>

        {!authorized ? (
          <>
            {currentEmail && (
              <p className="mb-4 rounded-lg bg-[#f9ece7] p-3 text-sm" role="status">
                La sesión actual no tiene autorización para editar el catálogo.
              </p>
            )}
            {invalidLink && (
              <p className="mb-4 rounded-lg bg-[#f9ece7] p-3 text-sm" role="alert">
                El enlace expiró, es inválido o pertenece a otra cuenta. Solicita uno nuevo.
              </p>
            )}
            <form className="space-y-4" onSubmit={sendLink}>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="catalogo-email">
                  Correo autorizado
                </label>
                <input id="catalogo-email" type="email" autoComplete="email" required
                  value={email} onChange={(event) => setEmail(event.target.value)}
                  placeholder="correo@ejemplo.com"
                  className="w-full rounded-lg border border-[#c9c1ba] px-4 py-3 outline-offset-2" />
              </div>
              <button disabled={busy} type="submit"
                className="w-full rounded-lg bg-[#332923] px-4 py-3 font-medium text-white disabled:opacity-50">
                {busy ? "Enviando…" : "Enviar enlace de acceso"}
              </button>
              <p className="text-sm text-[#6c655f]">
                No necesitas recordar tu contraseña. Abre el enlace desde el mismo navegador.
              </p>
            </form>
          </>
        ) : (
          <form className="space-y-5" onSubmit={replaceCatalog}>
            <p className="rounded-lg bg-[#eef6ed] p-3 text-sm">
              Acceso autorizado: <strong>{currentEmail}</strong>
            </p>
            <div>
              <label htmlFor="catalogo-pdf" className="mb-2 block text-sm font-medium">
                Nuevo catálogo en PDF
              </label>
              <input ref={inputRef} id="catalogo-pdf" type="file" accept=".pdf,application/pdf"
                disabled={busy}
                onChange={(event) => { setFile(event.target.files?.[0] ?? null); setSuccess(false); setMessage(""); }}
                className="block w-full rounded-lg border border-[#c9c1ba] p-3 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[#eee6de] file:px-3 file:py-2" />
              <p className="mt-2 text-xs text-[#6c655f]">
                Hasta 25 MB. Se valida el archivo y se conserva una copia anterior.
              </p>
            </div>
            <button type="submit" disabled={!file || busy}
              className="w-full rounded-lg bg-[#332923] px-4 py-3 font-medium text-white disabled:opacity-50">
              {busy ? "Subiendo y verificando…" : "Reemplazar catálogo"}
            </button>
            <p className="text-xs text-[#6c655f]">
              El nombre original del archivo no importa: se guardará como catalogo-navidad.pdf.
              El título que muestra el navegador depende de los metadatos internos del PDF.
            </p>
          </form>
        )}
        {message && (
          <p role={success ? "status" : "alert"}
            className={"mt-5 rounded-lg p-3 text-sm " + (success ? "bg-[#eef6ed]" : "bg-[#fff3e2]")}>
            {message}
          </p>
        )}
      </div>
    </main>
  );
}
