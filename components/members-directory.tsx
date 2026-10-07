"use client"
import { useState } from "react"
import Image from "next/image"
import { ChevronDown } from "lucide-react"
import { memberGenerations, type MemberResult } from "@/lib/member-model"

export function MembersDirectory({ result, initialGeneration }: { result: MemberResult; initialGeneration?: number }) {
  const generations = memberGenerations(result.items)
  const [requested, setSelected] = useState(initialGeneration)
  const selected = requested && generations.includes(requested) ? requested : generations[0]
  const profiles = result.items.filter(member => member.generation === selected)
  if (result.state !== "ready") return <p role="status" className="mt-10 text-sm leading-7 text-slate-300">{result.state === "error" ? "회원 명단을 불러오지 못했습니다. 잠시 후 다시 확인해주세요." : "회원 명단을 준비하고 있습니다."}</p>
  if (!generations.length) return <p className="mt-10 text-sm text-slate-300">공개된 회원 정보가 없습니다.</p>
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
      <div className="flex items-baseline justify-between gap-4"><h2 className="text-2xl font-normal text-white">SMP {selected}기</h2><p className="text-sm text-slate-400">{profiles.length}명</p></div>
      {profiles.length === 0 ? <p className="mt-6 text-sm text-slate-300">회원 정보를 준비하고 있습니다.</p> :
        <div className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map(member => <article key={member.id} className="border-t border-white/20 pt-6 text-slate-300">
            {member.image && <div className="relative mb-5 aspect-[4/5] overflow-hidden bg-black/25">
              <Image src={member.image} alt={member.name} fill sizes="(min-width: 1024px) 350px, (min-width: 640px) 50vw, 100vw" className="object-cover object-top" />
            </div>}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h3 className="text-xl font-normal text-white">{member.name}</h3>
              {!!member.roles?.length && <ul aria-label="직책" className="flex flex-wrap gap-1.5">
                {member.roles.map(role => <li key={role} className="rounded-full border border-sky-200/20 bg-sky-200/[0.07] px-2.5 py-0.5 text-xs font-medium leading-5 text-sky-200">{role}</li>)}
              </ul>}
            </div>
            {(member.department || member.year) && <p className="mt-3 text-sm leading-relaxed">{[member.department, member.year].filter(Boolean).join(" / ")}</p>}
          </article>)}
        </div>}
    </section>
  </div>
}
