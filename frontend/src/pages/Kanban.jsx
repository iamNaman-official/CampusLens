import { useEffect, useMemo, useRef, useState } from 'react'
import { animate, stagger } from 'animejs'
import Icon from '../components/Icon'
import { getDocumentInsights } from '../services/api'

const STORE_KEY = 'campuslens-kanban-preferences'
const lanes = [
  ['priority', 'Priority now', 'Finish these first'],
  ['upcoming', 'Upcoming dates', 'Deadlines and important dates'],
  ['actions', 'Required actions', 'Things to complete'],
  ['saved', 'Saved for later', 'Starred items'],
]

function loadPreferences() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') } catch { return {} }
}

function Kanban({ documents, onAskAi }) {
  const [items, setItems] = useState([])
  const [preferences, setPreferences] = useState(loadPreferences)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('document')
  const [openMenu, setOpenMenu] = useState(null)
  const boardRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => { localStorage.setItem(STORE_KEY, JSON.stringify(preferences)) }, [preferences])
  useEffect(() => {
    if (!openMenu || !menuRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const animation = animate(menuRef.current, { opacity: [0, 1], translateY: [-7, 0], scale: [.96, 1], duration: 240, ease: 'outExpo' })
    return () => animation.revert()
  }, [openMenu])
  useEffect(() => {
    if (!boardRef.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined
    const cards = boardRef.current.querySelectorAll('.kanban-card')
    if (!cards.length) return undefined
    const animation = animate(cards, { opacity: [0, 1], translateY: [12, 0], delay: stagger(55), duration: 420, ease: 'outExpo' })
    return () => animation.revert()
  }, [items])
  useEffect(() => {
    let cancelled = false
    const ready = documents.filter((document) => document.status === 'Ready')
    setItems([]); setError('')
    if (!ready.length) return undefined
    setLoading(true)
    Promise.all(ready.map(async (document) => ({ document, insights: await getDocumentInsights(document.id) })))
      .then((groups) => {
        if (cancelled) return
        const next = groups.flatMap(({ document, insights }) => [
          ...(insights.deadlines || []).map((entry) => ({ id: 'deadline-' + document.id + '-' + entry.id, kind: 'Deadline', title: entry.description, date: entry.date, page: entry.page_number, document })),
          ...(insights.important_dates || []).map((entry) => ({ id: 'date-' + document.id + '-' + entry.id, kind: 'Important date', title: entry.description, date: entry.date, page: entry.page_number, document })),
          ...(insights.actions || []).map((entry) => ({ id: 'action-' + document.id + '-' + entry.id, kind: 'Action', title: entry.action, page: entry.page_number, document })),
        ])
        setItems(next.filter((item) => !preferences[item.id]?.deleted))
      })
      .catch((requestError) => { if (!cancelled) setError(requestError.message || 'Could not load document tasks.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [documents, preferences])

  const displayedItems = useMemo(() => items.filter(item => filter === 'all' || item.kind === filter).sort((left, right) => sort === 'type' ? left.kind.localeCompare(right.kind) : sort === 'title' ? left.title.localeCompare(right.title) : left.document.title.localeCompare(right.document.title)), [items, filter, sort])
  const grouped = useMemo(() => lanes.reduce((all, [key]) => {
    all[key] = displayedItems.filter((item) => {
      const state = preferences[item.id] || {}
      if (state.priority) return key === 'priority'
      if (state.starred) return key === 'saved'
      return key === (item.kind === 'Action' ? 'actions' : 'upcoming')
    })
    return all
  }, {}), [displayedItems, preferences])

  function update(item, patch) {
    setPreferences((current) => ({ ...current, [item.id]: { ...current[item.id], ...patch } }))
  }
  function ask(item) {
    const prompt = 'Help me with this ' + item.kind.toLowerCase() + ': ' + item.title + (item.date ? ' (date: ' + item.date + ').' : '.')
    onAskAi(item.document, prompt)
  }
  function choose(kind, value) {
    if (kind === 'filter') setFilter(value)
    else setSort(value)
    setOpenMenu(null)
  }
  const filterOptions = [['all', 'All items'], ['Deadline', 'Deadlines'], ['Important date', 'Important dates'], ['Action', 'Actions']]
  const sortOptions = [['document', 'Document'], ['title', 'Title'], ['type', 'Type']]
  const selectedLabel = (options, value) => options.find(([id]) => id === value)?.[1] || value

  return <div className="dashboard-light kanban-page min-h-screen px-5 py-8 sm:px-8 lg:px-10 lg:py-10"><div className="mx-auto max-w-7xl">
    <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-[.17em] text-[#5c7c45]">From your processed documents</p><h1 className="editorial-font mt-2 text-4xl tracking-[-.055em] text-[#1b3a25] sm:text-5xl">Kanban board</h1><p className="mt-3 max-w-xl text-sm leading-6 text-[#5d7160]">Keep deadlines, important dates, and actions in one focused study plan.</p></div><p className="rounded-full border border-[#b8cba7] bg-[#f8f7eb] px-3 py-2 text-xs font-bold text-[#587156]">{items.length} extracted item{items.length === 1 ? '' : 's'}</p></header>
    <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-[#b8cba7] bg-[#f7f7ed] p-3"><div className="relative"><span className="mr-2 text-xs font-bold text-[#466c36]">Show</span><button onClick={() => setOpenMenu(openMenu === 'filter' ? null : 'filter')} className="inline-flex min-w-36 items-center justify-between gap-4 rounded-xl border border-[#a7c48c] bg-white px-3 py-2 text-sm font-bold text-[#29442f] shadow-sm transition hover:border-[#6f9d54] hover:shadow"><span>{selectedLabel(filterOptions, filter)}</span><span className={`text-[#557b42] transition ${openMenu === 'filter' ? 'rotate-180' : ''}`}>⌄</span></button>{openMenu === 'filter' && <div ref={menuRef} className="absolute left-0 top-11 z-20 min-w-48 overflow-hidden rounded-xl border border-[#a7c48c] bg-[#fffdf4] p-1.5 shadow-xl">{filterOptions.map(([value, label]) => <button key={value} onClick={() => choose('filter', value)} className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${filter === value ? 'bg-[#d7f46d] text-[#19311e]' : 'text-[#36533b] hover:bg-[#edf3e4]'}`}>{label}</button>)}</div>}</div><div className="relative"><span className="mr-2 text-xs font-bold text-[#466c36]">Sort</span><button onClick={() => setOpenMenu(openMenu === 'sort' ? null : 'sort')} className="inline-flex min-w-32 items-center justify-between gap-4 rounded-xl border border-[#a7c48c] bg-white px-3 py-2 text-sm font-bold text-[#29442f] shadow-sm transition hover:border-[#6f9d54] hover:shadow"><span>{selectedLabel(sortOptions, sort)}</span><span className={`text-[#557b42] transition ${openMenu === 'sort' ? 'rotate-180' : ''}`}>⌄</span></button>{openMenu === 'sort' && <div ref={menuRef} className="absolute left-0 top-11 z-20 min-w-40 overflow-hidden rounded-xl border border-[#a7c48c] bg-[#fffdf4] p-1.5 shadow-xl">{sortOptions.map(([value, label]) => <button key={value} onClick={() => choose('sort', value)} className={`block w-full rounded-lg px-3 py-2 text-left text-sm font-semibold transition ${sort === value ? 'bg-[#d7f46d] text-[#19311e]' : 'text-[#36533b] hover:bg-[#edf3e4]'}`}>{label}</button>)}</div>}</div><button onClick={() => setPreferences({})} disabled={!Object.keys(preferences).length} className="ml-auto rounded-xl border border-[#d7b19e] px-3 py-2 text-xs font-bold text-[#92503b] transition hover:bg-[#fff0e9] disabled:opacity-45">Reset board changes</button></div>
    {loading && <p className="mt-7 text-sm font-semibold text-[#587156]">Collecting insights from your documents…</p>}
    {error && <p className="mt-7 rounded-xl border border-[#e9b09c] bg-[#fff0e9] p-4 text-sm text-[#9b4e3b]">{error}</p>}
    {!loading && !error && !items.length && <div className="mt-7 rounded-[26px] border border-dashed border-[#b9cda4] bg-[#f7f7ed] p-8 text-center text-sm leading-6 text-[#607560]">Upload and process a campus document to automatically add its deadlines, important dates, and actions here.</div>}
    <section ref={boardRef} className="mt-7 grid gap-4 xl:grid-cols-4">{lanes.map(([key, title, note]) => <div key={key} className="rounded-[25px] border border-[#b8cba7] bg-[#e9efdd]/80 p-4"><div className="flex items-start justify-between"><div><h2 className="display-font text-xl font-bold text-[#1d422a]">{title}</h2><p className="mt-1 text-xs text-[#637762]">{note}</p></div><span className="rounded-full bg-[#dce8c4] px-2 py-1 text-[10px] font-bold text-[#315235]">{grouped[key]?.length || 0}</span></div><div className="mt-4 space-y-3">{grouped[key]?.map((item) => <article key={item.id} className="kanban-card rounded-2xl border border-[#c6d4b4] bg-[#fffdf4] p-4 shadow-[0_7px_16px_rgba(38,70,42,.08)]"><div className="flex items-start justify-between gap-3"><span className={['rounded-full px-2 py-1 text-[10px] font-bold', item.kind === 'Action' ? 'bg-[#f3d5a9] text-[#70442d]' : 'bg-[#dce8c4] text-[#315235]'].join(' ')}>{item.kind}</span><button onClick={() => update(item, { starred: !preferences[item.id]?.starred, priority: false })} className={preferences[item.id]?.starred ? 'text-sm text-[#b36547]' : 'text-sm text-[#829482]'} aria-label="Star item">★</button></div><h3 className="mt-3 text-sm font-bold leading-5 text-[#29442f]">{item.title}</h3>{item.date && <p className="mt-2 text-xs font-bold text-[#567b42]">{item.date}</p>}<p className="mt-2 text-[11px] text-[#71806b]">{item.document.title} · page {item.page || '—'}</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => update(item, { priority: !preferences[item.id]?.priority, starred: false })} className="rounded-lg border border-[#91ae6f] px-2 py-1 text-[11px] font-bold text-[#466c36]">Prioritize</button><button onClick={() => ask(item)} className="rounded-lg bg-[#285137] px-2 py-1 text-[11px] font-bold text-white">Ask AI</button><button onClick={() => update(item, { deleted: true })} className="rounded-lg px-2 py-1 text-[11px] font-bold text-[#a55b45]">Delete</button></div></article>)}</div></div>)}</section>
  </div></div>
}
export default Kanban
