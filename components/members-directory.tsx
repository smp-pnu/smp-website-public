"use client"
import { useState } from "react"
import Image from "next/image"
import { ChevronDown } from "lucide-react"
import importedMembers from "@/lib/members.json"

type Member = { generation: number; name: string; department: string; image?: string; year?: string }
const members: Member[] = [...importedMembers, { generation: 40, name: "김시영", department: "미디어커뮤니케이션학·경제학", year: "21학번", image: "/kim-siyoung.png" }]

export function MembersDirectory({ group, initialGeneration }: { group: "alumni" | "members"; initialGeneration: number }) {
  const [selected, setSelected] = useState(initialGeneration)
  const generations = group === "alumni" ? Array.from({ length: 35 }, (_, i) => i + 1) : [36, 37, 38, 39, 40]
  const profiles = members.filter(member => member.generation === selected)
  return <div className="mt-10">
    <div className="mx-auto w-full max-w-xs">
      <label htmlFor="generation-select" className="mb-3 block text-center text-xs tracking-[0.2em] text-sky-300">기수 선택</label>
      <div className="relative">
        <select id="generation-select" value={selected} onChange={event => setSelected(Number(event.target.value))} className="min-h-12 w-full appearance-none border border-white/25 bg-black/35 px-5 py-3 pr-12 text-center text-base text-white backdrop-blur-sm focus:border-sky-300 focus:outline-none">
          {generations.map(generation => <option key={generation} value={generation} className="bg-[#07111f]">{generation}기</option>)}
        </select>
        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-300" aria-hidden="true" />
      </div>
    </div>
    <section id="generation-panel" aria-live="polite" className="mt-12">
      <h2 className="text-2xl font-normal text-white">SMP {selected}기</h2>
      {profiles.length === 0 ? <p className="mt-6 text-sm text-slate-300">회원 정보를 준비하고 있습니다.</p> :
        <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map((member, index) => <article key={`${selected}-${index}`} className="border-t border-white/20 pt-6 text-slate-300">
            {member.image && <div className="relative mb-5 aspect-[4/5] overflow-hidden bg-black/25">
              <Image src={member.image} alt={member.name} fill sizes="(min-width: 1024px) 350px, (min-width: 640px) 50vw, 100vw" className="object-cover object-top" />
            </div>}
            <h3 className="text-xl font-normal text-white">{member.name}</h3>
            {(member.department || member.year) && <p className="mt-3 text-sm leading-relaxed">{[member.department, member.year].filter(Boolean).join(" / ")}</p>}
          </article>)}
        </div>}
    </section>
  </div>
}
