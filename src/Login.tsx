import { useState } from "react";
import { adminCall, logEvent, signIn } from "./session";

/**
 * Anmeldung mit Benutzername + Passwort. Accounts legt ausschließlich der
 * Admin an; hier gibt es bewusst keine Selbstregistrierung.
 *
 * Die Ersteinrichtung (allererster Admin) läuft einmalig über den Setup-Code.
 */
export default function LoginScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupCode, setSetupCode] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (setupOpen) {
        await adminCall("bootstrap", {
          setup_code: setupCode,
          username,
          password,
        });
      }
      await signIn(username, password);
      logEvent("login");
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-6">
      <form onSubmit={submit} className="panel w-full max-w-sm p-6">
        <div className="mb-5 flex items-center gap-3">
          <div className="logo-mark">✂</div>
          <div>
            <h1 className="brand-text text-lg">CutG Studio</h1>
            <p className="text-xs text-ink-muted">
              {setupOpen ? "Ersteinrichtung" : "Anmeldung für Clipper"}
            </p>
          </div>
        </div>

        {setupOpen && (
          <label className="mb-3 block">
            <span className="text-xs text-ink-faint">Setup-Code</span>
            <input
              className="input-field mt-1"
              value={setupCode}
              onChange={(e) => setSetupCode(e.target.value)}
              placeholder="vom Admin erhalten"
              autoCapitalize="characters"
            />
          </label>
        )}

        <label className="block">
          <span className="text-xs text-ink-faint">Benutzername</span>
          <input
            className="input-field mt-1"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="z.B. marco"
          />
        </label>

        <label className="mt-3 block">
          <span className="text-xs text-ink-faint">Passwort</span>
          <input
            className="input-field mt-1"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        <button
          type="submit"
          className="btn-primary mt-5 w-full py-3"
          disabled={busy || !username || !password}
        >
          {busy ? "Moment…" : setupOpen ? "Admin anlegen & anmelden" : "Anmelden"}
        </button>

        <button
          type="button"
          className="mt-4 block w-full text-center text-xs text-ink-faint hover:text-ink"
          onClick={() => {
            setSetupOpen((v) => !v);
            setError(null);
          }}
        >
          {setupOpen ? "← zurück zur Anmeldung" : "Ersteinrichtung mit Setup-Code"}
        </button>

        <p className="mt-4 text-center text-xs text-ink-faint">
          Kein Zugang? Der Admin legt die Accounts an.
        </p>
      </form>
    </div>
  );
}
