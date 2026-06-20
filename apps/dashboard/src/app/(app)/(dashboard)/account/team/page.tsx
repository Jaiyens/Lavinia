import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { sessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { farmRole, roleAtLeast } from "@/lib/auth/access";
import { activeFarmId } from "@/lib/auth/active-farm";
import { en } from "@/copy/en";
import { AddPeople } from "./_components/add-people";
import { TeamList, type InviteRow, type MemberRow } from "./_components/team-list";

// The Team settings page for the ACTIVE farm. Team is a property of the farm (not the personal
// profile), so it lives under the farm's account area and resolves the active farm. Controls are
// gated by the caller's role both here (what is shown) and in the actions (the real gate).
export const dynamic = "force-dynamic";

function displayName(user: { name: string | null; email: string | null } | null): string {
  return user?.name?.trim() || user?.email || "Someone";
}

export default async function TeamPage() {
  const userId = await sessionUserId();
  if (!userId) redirect("/login");
  const farmId = await activeFarmId(userId);
  if (!farmId) redirect("/onboarding");
  const role = await farmRole(prisma, farmId, userId);
  if (!role) redirect("/"); // not a member of the active farm

  const t = en.team;
  const farm = await prisma.farm.findUnique({ where: { id: farmId }, select: { name: true } });
  const farmName = farm?.name?.trim() || "your farm";
  const canManage = roleAtLeast(role, "manager");

  const memberships = await prisma.farmMembership.findMany({
    where: { farmId, status: "active" },
    select: {
      id: true,
      role: true,
      userId: true,
      user: { select: { name: true, email: true } },
      invitedBy: { select: { name: true, email: true } },
    },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
  const invites = canManage
    ? await prisma.farmInvite.findMany({
        where: { farmId, status: "pending" },
        select: { id: true, invitedEmail: true, role: true, invitedBy: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const members: MemberRow[] = memberships.map((m) => ({
    membershipId: m.id,
    name: displayName(m.user),
    email: m.user?.email ?? "",
    role: m.role,
    isYou: m.userId === userId,
    addedBy: m.invitedBy ? displayName(m.invitedBy) : null,
  }));
  const inviteRows: InviteRow[] = invites.map((i) => ({
    id: i.id,
    email: i.invitedEmail,
    role: i.role,
    addedBy: i.invitedBy ? displayName(i.invitedBy) : null,
  }));

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 lg:px-12 lg:py-12">
      <Link
        href="/account"
        className="mb-6 inline-flex min-h-[44px] items-center gap-2 type-body-sm text-on-surface-variant transition-colors hover:text-on-surface"
      >
        <ArrowLeft size={16} aria-hidden />
        {en.account.navLabel}
      </Link>

      <header className="mb-8">
        <p className="type-label-caps text-primary">{t.eyebrow}</p>
        <h1 className="type-display-lg mt-1 text-on-surface">{t.title}</h1>
        <p className="type-body-md mt-2 text-on-surface-variant">{t.lede(farmName)}</p>
      </header>

      {canManage ? (
        <AddPeople farmId={farmId} canGrantOwner={role === "owner"} />
      ) : (
        <p className="mb-8 rounded-2xl border border-outline-variant bg-surface-container-lowest p-4 type-body-sm text-on-surface-variant">
          {t.managerLimited}
        </p>
      )}

      <TeamList
        farmId={farmId}
        members={members}
        invites={inviteRows}
        viewerRole={role}
        canManage={canManage}
      />
    </div>
  );
}
