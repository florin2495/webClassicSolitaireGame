"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { BACKS, backUrl, type BackId } from "@/lib/cards";
import { APP_VERSION, BASE_PATH, canInstall, canInstallServer, promptInstall, subscribeInstall } from "@/lib/pwa";
import type { Options } from "@/lib/solitaire";
import { actions, type Settings, type Stats } from "@/lib/store";
import { formatTime } from "@/lib/format";
import { btnPrimary, btnSecondary, Choice, Modal } from "./ui";

const subscribeNothing = () => () => {};
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches;

export function Menu({
  settings,
  stats,
  gameOptions,
  gameStarted,
  onClose,
  onNewGame,
}: {
  settings: Settings;
  stats: Stats;
  gameOptions: Options;
  gameStarted: boolean;
  onClose: () => void;
  onNewGame: () => void;
}) {
  const installable = useSyncExternalStore(subscribeInstall, canInstall, canInstallServer);
  const standalone = useSyncExternalStore(subscribeNothing, isStandalone, () => false);
  const rulesDiffer =
    gameOptions.drawCount !== settings.drawCount || gameOptions.scoring !== settings.scoring || gameOptions.timed !== settings.timed;
  const pct = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;

  return (
    <Modal title="Meniu" onClose={onClose} testId="menu">
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3">
          <Choice
            label="Din pachet se întorc"
            testId="setting-draw"
            value={settings.drawCount}
            options={[
              { value: 1, label: "Câte 1 carte" },
              { value: 3, label: "Câte 3 cărți" },
            ]}
            onChange={(v) => actions.updateSettings({ drawCount: v })}
          />
          <Choice
            label="Punctaj"
            testId="setting-scoring"
            value={settings.scoring}
            options={[
              { value: "standard", label: "Standard" },
              { value: "vegas", label: "Vegas" },
              { value: "none", label: "Fără" },
            ]}
            onChange={(v) => actions.updateSettings({ scoring: v })}
          />
          <Choice
            label="Cronometru"
            testId="setting-timed"
            value={settings.timed}
            options={[
              { value: true, label: "Da" },
              { value: false, label: "Nu" },
            ]}
            onChange={(v) => actions.updateSettings({ timed: v })}
          />
          {rulesDiffer && gameStarted && (
            <div className="flex flex-col gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <span>Regulile noi se aplică de la jocul următor.</span>
              <button type="button" className={btnPrimary} onClick={onNewGame} data-testid="menu-new-game">
                Joc nou cu regulile noi
              </button>
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold text-zinc-600">Spatele cărților</h3>
          <div className="flex gap-3">
            {(Object.keys(BACKS) as BackId[]).map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={settings.back === b}
                aria-label={BACKS[b].name}
                onClick={() => actions.updateSettings({ back: b })}
                className={`rounded-lg p-1 ${settings.back === b ? "ring-4 ring-green-700" : "ring-1 ring-zinc-300"}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={backUrl(b)} alt="" width={50} height={70} draggable={false} />
              </button>
            ))}
          </div>
        </section>

        <section data-testid="stats">
          <h3 className="mb-2 text-sm font-semibold text-zinc-600">Statistici</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt>Jocuri începute</dt>
            <dd className="text-right font-semibold" data-testid="stat-played">{stats.played}</dd>
            <dt>Câștigate</dt>
            <dd className="text-right font-semibold" data-testid="stat-won">
              {stats.won} ({pct}%)
            </dd>
            <dt>Câștiguri la rând</dt>
            <dd className="text-right font-semibold">{stats.streak}</dd>
            <dt>Cea mai lungă serie</dt>
            <dd className="text-right font-semibold">{stats.bestStreak}</dd>
            <dt>Cel mai bun scor</dt>
            <dd className="text-right font-semibold">{stats.bestScore ?? "–"}</dd>
            <dt>Cel mai bun timp</dt>
            <dd className="text-right font-semibold">{stats.bestTimeMs === null ? "–" : formatTime(stats.bestTimeMs)}</dd>
          </dl>
          <button type="button" className="mt-2 text-xs font-semibold text-zinc-500 underline" onClick={() => actions.resetStats()}>
            Șterge statisticile
          </button>
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-zinc-600">Aplicația pe telefon</h3>
          {standalone ? (
            <p className="text-sm">Jocul rulează ca aplicație instalată ✓. Merge și fără internet.</p>
          ) : installable ? (
            <button type="button" className={btnPrimary} onClick={() => void promptInstall()} data-testid="menu-install">
              📲 Instalează Classic Solitaire pe telefon
            </button>
          ) : (
            <p className="text-sm text-zinc-700">
              În Chrome: apasă meniul <b>⋮</b> (sus, dreapta), apoi <b>Instalează aplicația</b> sau <b>Adaugă pe ecranul
              de pornire</b>. Pe iPhone (Safari): butonul <b>Partajează</b>, apoi <b>Adaugă pe ecranul principal</b>.
            </p>
          )}
        </section>

        <details className="rounded-lg bg-zinc-50 p-3 text-sm">
          <summary className="cursor-pointer font-semibold">Cum se joacă</summary>
          <div className="mt-2 flex flex-col gap-2 text-zinc-700">
            <p>Scopul: toate cărțile urcă pe cele 4 locuri din dreapta sus, pe culori, de la As la Popă.</p>
            <p>
              Pe coloanele de jos pui cărțile în ordine descrescătoare, alternând roșu cu negru (de exemplu 9 negru pe 10
              roșu). Pe o coloană goală poate veni doar un Popă (K).
            </p>
            <p>Atinge pachetul din stânga sus ca să întorci cărți. Când se termină, atinge locul gol și pachetul o ia de la capăt.</p>
            <p>
              <b>Atinge o carte</b> și ea se mută singură unde se potrivește (întâi sus, pe culoare). Sau o poți trage cu degetul.
              Cărțile cu fața în jos se întorc singure.
            </p>
            <p>„Înapoi” anulează ultima mutare. „Indiciu” arată o mutare posibilă. Jocul se salvează singur.</p>
            <p>
              Punctaj Standard: +10 o carte urcată sus, +5 din pachet pe coloane, +5 o carte întoarsă, −15 o carte coborâtă de
              sus, −2 la fiecare 10 secunde și bonus de timp la final. Vegas: pornești de la −52 și primești 5 pentru fiecare
              carte urcată sus.
            </p>
          </div>
        </details>

        <FeedbackForm />

        <div className="flex items-center justify-between text-sm">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="font-semibold text-green-800 underline">
            ← Toate jocurile
          </a>
          <span className="text-zinc-500" data-testid="app-version">
            Versiunea {APP_VERSION}
          </span>
        </div>
      </div>
    </Modal>
  );
}

function FeedbackForm() {
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${BASE_PATH}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, website }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Nu am putut trimite mesajul. Încearcă din nou.");
      }
      setMessage("");
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nu am putut trimite mesajul. Încearcă din nou.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="rounded-lg bg-zinc-50 p-3 text-sm">
      <summary className="cursor-pointer font-semibold">💬 Trimite o părere</summary>
      {sent ? (
        <p role="status" className="py-4 text-center font-semibold">
          Mulțumim! Mesajul a ajuns.
        </p>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="mt-2 flex flex-col gap-2">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={1000}
            rows={4}
            required
            aria-label="Mesaj"
            placeholder="Ce problemă ai găsit sau ce am putea îmbunătăți?"
            className="rounded-lg border border-zinc-300 bg-white p-2 text-base"
          />
          <input
            type="text"
            name="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="hidden"
          />
          {error && <p className="text-sm font-semibold text-red-700">{error}</p>}
          <button type="submit" className={btnSecondary} disabled={busy || message.trim().length === 0}>
            {busy ? "Se trimite…" : "Trimite"}
          </button>
        </form>
      )}
    </details>
  );
}
