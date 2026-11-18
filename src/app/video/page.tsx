import { AppShell } from "@/components/AppShell";
import { VideoDesk } from "@/components/VideoDesk";
import { requireUser } from "@/server/accounts";
import { readSession } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function VideoPage() {
  const user = await requireUser();
  const session = await readSession();
  return (
    <AppShell name={user.name} active="video">
      <header className="tool-head">
        <div>
          <h1>Video Duplicate</h1>
          <p>Upload a video and create a new short clip from it.</p>
        </div>
      </header>
      <VideoDesk csrf={session.csrf} />
    </AppShell>
  );
}
