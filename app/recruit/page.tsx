import type { Metadata } from "next"
import { RecruitPageContent } from "@/components/recruit-page"
import { SITE_PAGE_METADATA, SITE_SHORT_NAME_KO } from "@/lib/site-config"
export const metadata: Metadata = {
  title: `${SITE_PAGE_METADATA.recruit.title} | ${SITE_SHORT_NAME_KO}`,
  description: SITE_PAGE_METADATA.recruit.description,
}
export default function RecruitPage() { return <RecruitPageContent /> }
