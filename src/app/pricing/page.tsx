import { Nav } from "@/components/Nav";
import { AppShell } from "@/components/AppShell";
import { Pricing } from "@/components/Pricing";
import { current } from "@/server/accounts";

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const user = await current();
  if (user) {
    return (
      <AppShell name={user.name} active="">
        <Pricing />
      </AppShell>
    );
  }
  return (
    <>
      <Nav />
      <Pricing />
    </>
  );
}
