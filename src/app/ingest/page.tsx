import { IngestConsole } from "@/components/ingest/ingest-console";
import { WorkspaceShell } from "@/components/workspace-shell";

export const dynamic = "force-dynamic";

export default function IngestPage() {
  return (
    <WorkspaceShell active="Ingest" pageName="Ingest">
      <div className="surface ingest-surface">
        <section className="page-hero">
          <div>
            <h1>Clip a stream</h1>
            <p>
              Point Afterplay at a stream. It reads the transcript, searches this
              creator&apos;s channel memory for moments whose meaning depends on earlier
              streams, then cuts and reframes the ones worth posting.
            </p>
            <div className="hero-meta">
              <span className="status-chip status-chip--safe">Real pipeline</span>
              <span>yt-dlp · OpenAI · ffmpeg</span>
              <span>No fixtures</span>
            </div>
          </div>
        </section>

        <IngestConsole />
      </div>
    </WorkspaceShell>
  );
}
