import { AppShell } from "@/components/AppShell";
import { VideoDesk } from "@/components/VideoDesk";
import { requireUser } from "@/server/accounts";
import { readSession } from "@/server/session";

export const dynamic = "force-dynamic";

export default async function VideoPage() {
  const user = await requireUser();
  const session = await readSession();
  return (
    <AppShell name={user.name} active="video" admin={user.admin}>
      <VideoDesk csrf={session.csrf} />
    </AppShell>
  );
}
