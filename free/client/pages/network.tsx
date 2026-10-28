import { useMemo } from "react";
import { Navigate, useLocation } from "react-router";
import { useApi } from "../api";
import { useSearch, Status } from "./state";
import { sortMembers, type MemberResult } from "@/lib/member-model";
import { isNotionFileUrl } from "@/lib/pdf-source";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { AlumniOverview } from "@/components/alumni-overview";
import { MembersOverview } from "@/components/members-overview";
import { NetworkLayout } from "@/components/network-layout";
export function NetworkPage() {
  const members = useLocation().pathname === "/members";
  const { value, error, retry } = useApi<MemberResult>("/api/catalog/members");
  const params = useSearch();
  const generation = Number(params.generation);
  const result = useMemo(
    () =>
      value && {
        ...value,
        items: sortMembers(
          value.items
            .filter(
              (member) => member.group === (members ? "members" : "alumni"),
            )
            .map((member) => ({
              ...member,
              image:
                member.image && isNotionFileUrl(member.image)
                  ? `/api/member-photo/${member.id}`
                  : member.image,
            })),
        ),
      },
    [value, members],
  );
  const reserved = [38, 39].filter(
    (g) =>
      !value?.items.some(
        (member) => member.generation === g && member.group === "alumni",
      ),
  );
  if (!members && params.group === "members")
    return (
      <Navigate
        to={`/members?${new URLSearchParams({ ...(params.generation ? { generation: params.generation } : {}) })}`}
        replace
      />
    );
  return (
    <>
      <SiteHeader />
      {!result ? (
        <NetworkLayout active={members ? "members" : "alumni"}>
          <Status error={error} retry={retry} />
        </NetworkLayout>
      ) : members ? (
        <MembersOverview
          generation={generation}
          members={result}
          reservedGenerations={reserved}
        />
      ) : (
        <AlumniOverview generation={generation} members={result} />
      )}
      <SiteFooter />
    </>
  );
}
