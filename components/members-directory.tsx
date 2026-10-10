"use client"
import { useState } from "react"
import Image from "next/image"
import { FilterSelect } from "./filter-select"
import { memberGenerations, type MemberResult } from "@/lib/member-model"

export function MembersDirectory({ result, initialGeneration, reservedGenerations = [] }: { result: MemberResult; initialGeneration?: number; reservedGenerations?: number[] }) {
  const generations = memberGenerations(result.items, reservedGenerations)
  const [requested, setSelected] = useState(initialGeneration)
  const selected = requested && generations.includes(requested) ? requested : generations[0]
  const profiles = result.items.filter(member => member.generation === selected)
  if (result.state !== "ready") return <p role="status" className="mt-10 text-sm leading-7 text-site-body">{result.state === "error" ? "회원 명단을 불러오지 못했습니다. 잠시 후 다시 확인해주세요." : "회원 명단을 준비하고 있습니다."}</p>
  if (!generations.length) return <p className="mt-10 text-sm text-site-body">공개된 회원 정보가 없습니다.</p>
  return <div className="mt-10">
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-site-line pb-5">
      <div className="flex items-baseline gap-3">
        <h2 id="generation-heading" className="text-base font-normal tracking-tight text-white sm:text-lg">SMP {selected}기</h2>
        <p role="status" className="text-xs tabular-nums text-site-muted">총 {profiles.length}명</p>
      </div>
      <div className="w-36 sm:w-40">
        <FilterSelect name="generation" label="기수 선택" value={String(selected)}
          options={generations.map(generation => ({ value: String(generation), label: `${generation}기` }))}
          onChange={value => setSelected(Number(value))} />
      </div>
    </div>
    <section id="generation-panel" aria-labelledby="generation-heading" className="mt-7">
      {profiles.length === 0 ? <p className="mt-6 text-sm text-site-body">회원 정보를 준비하고 있습니다.</p> :
        <div className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
          {profiles.map(member => <article key={member.id} className="border-t border-site-line pt-6 text-site-body">
            {member.image && <div className="relative mb-5 aspect-[4/5] overflow-hidden bg-black/25">
              <Image src={member.image} alt={member.name} fill sizes="(min-width: 1024px) 350px, (min-width: 640px) 50vw, 100vw" className="object-cover object-top" />
            </div>}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h3 className="text-xl font-normal text-white">{member.name}</h3>
              {!!member.roles?.length && <ul aria-label="직책" className="flex flex-wrap gap-1.5">
                {member.roles.map(role => <li key={role} className="rounded-full border border-sky-200/20 bg-sky-200/[0.07] px-2.5 py-0.5 text-xs font-medium leading-5 text-site-accent">{role}</li>)}
              </ul>}
            </div>
            {(member.department || member.year) && <p className="mt-3 text-sm leading-relaxed">{[member.department, member.year].filter(Boolean).join(" / ")}</p>}
          </article>)}
        </div>}
    </section>
  </div>
}
