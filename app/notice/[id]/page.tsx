import { ContentDetail } from "@/components/content-detail"
import { getContentItem } from "@/lib/notion"
export const dynamic = "force-dynamic"
type Props = { params: Promise<{ id: string }> }
export async function generateMetadata({ params }: Props) {
  const item = await getContentItem("notice", (await params).id)
  return { title: item ? `${item.title} | SMP 공지` : "공지를 찾을 수 없습니다 | SMP" }
}
export default async function Page({ params }: Props) {
  return <ContentDetail kind="notice" id={(await params).id} />
}
