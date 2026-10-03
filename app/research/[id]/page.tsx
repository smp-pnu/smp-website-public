import { ContentDetail } from "@/components/content-detail"
import { getContentItem } from "@/lib/notion"
export const dynamic = "force-dynamic"
type Props = { params: Promise<{ id: string }> }
export async function generateMetadata({ params }: Props) {
  const item = await getContentItem("research", (await params).id)
  return { title: item ? `${item.title} | SMP 리서치` : "리포트를 찾을 수 없습니다 | SMP" }
}
export default async function Page({ params }: Props) {
  return <ContentDetail kind="research" id={(await params).id} />
}
