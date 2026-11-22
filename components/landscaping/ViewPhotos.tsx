import { ViewPhoto } from './ViewPhoto'

/** One "View" button per stored photo/PDF: "Slip", or "Slip 1", "2", "3"… */
export function ViewPhotos({ paths, label = 'View', empty }: { paths: Array<string | null | undefined>; label?: string; empty?: React.ReactNode }) {
  const list = paths.filter(Boolean) as string[]
  if (!list.length) return <>{empty ?? null}</>
  if (list.length === 1) return <ViewPhoto path={list[0]} label={label} />
  return (
    <span className="inline-flex flex-wrap items-center">
      {list.map((p, i) => <ViewPhoto key={p} path={p} label={i === 0 ? `${label} 1` : String(i + 1)} />)}
    </span>
  )
}
