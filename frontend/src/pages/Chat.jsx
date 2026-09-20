import { useEffect, useMemo, useRef, useState } from 'react'
import { animate } from 'animejs'
import Icon from '../components/Icon'
import { createDocumentChat, deleteChat, deleteChatMessage, getChatMessages, getDocumentChats, sendChatMessage } from '../services/api'

const IMPORTANT_NOTES_KEY = 'campuslens.importantNotes'

function loadImportantNotes() {
  try { return JSON.parse(localStorage.getItem(IMPORTANT_NOTES_KEY) || '{}') } catch { return {} }
}

function makeMessage(message) {
  return { id: message.id, role: message.role, text: message.content, time: message.created_at ? new Date(message.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Now' }
}

function Chat({ activeDocument, documents = [], onSelectDocument, initialPrompt = '', onPromptUsed }) {
  const [messages, setMessages] = useState([])
  const [chatId, setChatId] = useState(null)
  const [value, setValue] = useState('')
  const [query, setQuery] = useState('')
  const [importantByDocument, setImportantByDocument] = useState(loadImportantNotes)
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [menuMessageId, setMenuMessageId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const listRef = useRef(null)
  const notesRef = useRef(null)
  const documentId = activeDocument?.id
  const important = importantByDocument[documentId] || []
  const visible = useMemo(() => messages.filter(item => !query || item.text.toLowerCase().includes(query.toLowerCase())), [messages, query])

  useEffect(() => {
    if (!initialPrompt) return
    setValue(initialPrompt)
    onPromptUsed?.()
  }, [initialPrompt, onPromptUsed])

  useEffect(() => {
    let cancelled = false
    setMessages([]); setChatId(null); setError('')
    if (!documentId) return undefined
    setLoading(true)
    async function loadChat() {
      try {
        const chats = await getDocumentChats(documentId)
        if (!chats[0]) return
        const saved = await getChatMessages(chats[0].id)
        if (!cancelled) { setChatId(chats[0].id); setMessages(saved.map(makeMessage)) }
      } catch (requestError) {
        if (!cancelled) setError(requestError.message || 'CampusLens could not load this conversation.')
      } finally { if (!cancelled) setLoading(false) }
    }
    loadChat()
    return () => { cancelled = true }
  }, [documentId])

  useEffect(() => {
    localStorage.setItem(IMPORTANT_NOTES_KEY, JSON.stringify(importantByDocument))
  }, [importantByDocument])

  useEffect(() => {
    if (!notesRef.current || !important.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const newest = notesRef.current.firstElementChild
    const animation = newest && animate(newest, { opacity: [0, 1], translateY: [-10, 0], scale: [.96, 1], duration: 420, ease: 'outExpo' })
    return () => animation?.revert()
  }, [important.length])

  async function send(event) {
    event.preventDefault()
    if (!value.trim() || !documentId || sending) return
    const content = value.trim()
    setSending(true); setError(''); setValue('')
    try {
      let currentChatId = chatId
      if (!currentChatId) {
        const chat = await createDocumentChat(documentId, activeDocument.title || 'Document questions')
        currentChatId = chat.id
        setChatId(currentChatId)
      }
      const result = await sendChatMessage(currentChatId, content)
      const assistant = makeMessage(result.assistant_message)
      const source = result.sources?.[0]
      if (source?.page_number || source?.page) assistant.source = `Source · Page ${source.page_number || source.page}`
      setMessages(items => [...items, makeMessage(result.user_message), assistant])
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }))
    } catch (requestError) {
      setValue(content)
      setError(requestError.message || 'CampusLens could not answer that question.')
    } finally { setSending(false) }
  }

  async function deleteConversation() {
    if (!chatId) return
    setError('')
    try {
      await deleteChat(chatId)
      setChatId(null)
      setMessages([])
    } catch (requestError) {
      setError(requestError.message || 'CampusLens could not delete this conversation.')
    }
  }

  async function deleteMessage(messageId) {
    setError('')
    try {
      await deleteChatMessage(messageId)
      setMessages(items => items.filter(item => item.id !== messageId))
      setImportantByDocument(current => ({ ...current, [documentId]: (current[documentId] || []).filter(item => item.id !== messageId) }))
    } catch (requestError) { setError(requestError.message || 'CampusLens could not delete this message.') }
  }

  async function confirmDeletion() {
    const target = confirmDelete
    setConfirmDelete(null)
    if (target === 'conversation') await deleteConversation()
    else if (target) await deleteMessage(target)
  }

  function toggleImportant(message, target) {
    if (!documentId) return
    setImportantByDocument(current => {
      const items = current[documentId] || []
      return { ...current, [documentId]: items.some(item => item.id === message.id) ? items.filter(item => item.id !== message.id) : [{ ...message, savedAt: new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }, ...items] }
    })
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) animate(target, { scale: [1, 1.16, 1], duration: 240, ease: 'outExpo' })
  }
  function removeImportant(id, target) {
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) animate(target, { opacity: [1, 0], translateX: [0, 12], duration: 220, ease: 'inQuad' })
    window.setTimeout(() => setImportantByDocument(current => ({ ...current, [documentId]: (current[documentId] || []).filter(item => item.id !== id) })), 180)
  }

  function showText(text) {
    if (!query) return text
    const escaped = query.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
    return text.split(new RegExp(`(${escaped})`, 'ig')).map((part, index) => part.toLowerCase() === query.toLowerCase() ? <mark key={index} className="rounded bg-[#d7f46d] px-0.5 text-[#19311e]">{part}</mark> : part)
  }

  return <div className="chat-workspace min-h-screen p-4 sm:p-6 lg:h-dvh lg:min-h-0 lg:overflow-hidden lg:p-6">
    <div className="mx-auto grid max-w-[1600px] gap-4 lg:h-full lg:min-h-0 lg:grid-cols-[72px_minmax(240px,.7fr)_minmax(0,1.55fr)]">
      <aside className="chat-document-rail group relative z-10 rounded-2xl p-2 lg:overflow-visible" aria-label="Select document">
        <div className="flex h-full gap-2 lg:block">
          <div className="flex shrink-0 items-center justify-center rounded-xl bg-[#d7f46d] p-3 text-[#17301e]"><Icon name="document" className="size-5" /></div>
          <div className="min-w-0 flex-1 lg:absolute lg:left-0 lg:top-0 lg:h-full lg:w-72 lg:origin-left lg:scale-x-0 lg:overflow-hidden lg:rounded-2xl lg:bg-[#142d20] lg:p-4 lg:opacity-0 lg:shadow-2xl lg:transition-all lg:duration-200 lg:group-hover:scale-x-100 lg:group-hover:opacity-100 lg:group-focus-within:scale-x-100 lg:group-focus-within:opacity-100">
            <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#d7f46d] text-[#17301e]"><Icon name="document" className="size-5" /></span><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#b8d69d]">Your files</p><h2 className="display-font text-lg font-bold text-[#fff9e8]">Document space</h2></div></div>
            <div className="mt-4 max-h-[calc(100%-5.5rem)] space-y-2 overflow-y-auto pr-1">{documents.length ? documents.map(document => <button key={document.id} onClick={() => onSelectDocument?.(document)} title={document.title} className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${document.id === documentId ? 'border-[#d7f46d] bg-[#d7f46d] text-[#17301e]' : 'border-[#3d624c] bg-[#1d3929] text-[#eff6e8] hover:border-[#a6c988]'}`}><Icon name="file" className="size-4 shrink-0" /><span className="min-w-0"><span className="block truncate text-sm font-bold">{document.title}</span><span className={`block text-[11px] ${document.id === documentId ? 'text-[#365133]' : 'text-[#b8cdb7]'}`}>{document.status === 'Ready' ? 'Ready to chat' : document.status}</span></span></button>) : <p className="rounded-xl border border-dashed border-[#55785f] p-3 text-sm leading-5 text-[#c7d8c5]">Upload a document to start a chat.</p>}</div>
          </div>
          <p className="self-center truncate text-xs font-semibold text-[#eff6e8] lg:hidden">{activeDocument?.title || 'Select a document'}</p>
        </div>
      </aside>

      <aside className="chat-notes flex min-h-[260px] flex-col overflow-hidden rounded-[26px] p-5 lg:min-h-0">
        <div className="flex items-start justify-between gap-3 border-b border-[#47634d] pb-4"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#b9d49e]">Selected file</p><h1 className="display-font mt-1 truncate text-xl font-bold text-[#fff9e8]">{activeDocument?.title || 'No document selected'}</h1></div><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#d7f46d] text-sm font-bold text-[#17301e]">{important.length}</span></div>
        <div className="mt-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#b9d49e]">Saved from chat</p><h2 className="display-font mt-1 text-xl font-bold text-[#fff9e8]">Important notes</h2></div><Icon name="bookmark" className="size-5 text-[#f2b693]" /></div>
        <div ref={notesRef} className="chat-notes-scroll mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">{important.length ? important.map(item => <article key={item.id} className="chat-note-card rounded-2xl border border-[#3d674c] p-4"><div className="flex items-start justify-between gap-3"><div className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[#f2b693]/15 text-[#ffc4a3]"><Icon name="bookmark" className="size-4" /></span><p className="pt-0.5 text-sm leading-6 text-[#f7fbf4]">{item.text}</p></div><button onClick={event => removeImportant(item.id, event.currentTarget.closest('article'))} className="grid size-7 shrink-0 place-items-center rounded-lg text-[#b8d0b8] transition hover:bg-white/10 hover:text-[#ffc4a3]" aria-label="Remove important note"><Icon name="close" className="size-3.5" /></button></div><div className="mt-4 flex items-center justify-between border-t border-[#42674e] pt-3"><span className="text-[10px] font-bold uppercase tracking-[.13em] text-[#a9c9aa]">Saved answer</span><p className="text-[11px] font-semibold text-[#c9d9c7]">{item.savedAt}</p></div></article>) : <div className="rounded-2xl border border-dashed border-[#4f7358] bg-[#193522] p-4 text-sm leading-6 text-[#cbdac8]">Bookmark an answer in the chat to keep it here. This panel scrolls independently when your notes grow.</div>}</div>
      </aside>

      <section className="chat-conversation flex min-h-[600px] flex-col overflow-hidden rounded-[26px] lg:min-h-0">
        <header className="flex flex-col gap-4 border-b border-[#cbd7bc] px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#56723d]">Campus assistant</p><h2 className="display-font mt-1 text-2xl font-bold text-[#173d29]">Ask about this file</h2></div><div className="flex items-center gap-2"><button onClick={() => setConfirmDelete('conversation')} disabled={!chatId} className="rounded-xl border border-[#e5b6a6] px-3 py-2 text-xs font-bold text-[#9a4f3d] transition hover:bg-[#fff0e9] disabled:cursor-not-allowed disabled:opacity-45">Delete chat</button><label className="relative block"><span className="sr-only">Search conversation</span><Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#55765b]" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search chat" className="w-full rounded-xl border border-[#b5cba3] bg-white py-2.5 pl-9 pr-8 text-sm text-[#1b402c] outline-none placeholder:text-[#71866f] focus:border-[#5d8c45] sm:w-52" />{query && <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#55765b]" aria-label="Clear search"><Icon name="close" className="size-4" /></button>}</label></div></header>
        <div ref={listRef} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 sm:p-7">{loading && <p className="text-sm text-[#54715a]">Loading document conversation…</p>}{error && <p className="rounded-xl border border-[#e9af9b] bg-[#fff0e9] p-3 text-sm text-[#9b4e3b]">{error}</p>}{query && <p className="text-xs font-semibold text-[#54715a]">{visible.length} matching {visible.length === 1 ? 'message' : 'messages'}</p>}{visible.map(message => { const saved = important.some(item => item.id === message.id); return <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[86%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.role === 'user' ? 'rounded-br-sm bg-[#d7f46d] text-[#18321f]' : 'rounded-bl-sm border border-[#c5d5ba] bg-white text-[#244b32]'}`}><div className="flex items-start gap-3"><p className="flex-1">{showText(message.text)}</p><button onClick={event => toggleImportant(message, event.currentTarget)} className={`grid size-7 shrink-0 place-items-center rounded-lg transition ${saved ? 'bg-[#f3d5a9] text-[#8e4c35]' : 'text-[#55775a] hover:bg-[#e6eed9]'}`} aria-label={saved ? 'Remove from important notes' : 'Save as important note'}><Icon name="bookmark" className="size-4" /></button></div>{message.source && <p className="mt-2 border-t border-[#d7e1cf] pt-2 text-xs font-bold text-[#4d7c3e]">{message.source}</p>}<div className="relative mt-1 flex items-center justify-between"><p className="text-[10px] text-[#6b806d]">{message.time}</p><button onClick={() => setMenuMessageId(menuMessageId === message.id ? null : message.id)} className="rounded px-1.5 text-base leading-none text-[#607960] hover:bg-[#e7efdf]" aria-label="Message options">•••</button>{menuMessageId === message.id && <div className="absolute bottom-7 right-0 z-10 w-32 rounded-xl border border-[#d9b2a1] bg-white p-1 shadow-lg"><button onClick={() => { setMenuMessageId(null); setConfirmDelete(message.id) }} className="w-full rounded-lg px-3 py-2 text-left text-xs font-bold text-[#a0523c] hover:bg-[#fff0e9]">Delete message</button></div>}</div></div></div> })}{!loading && !error && !visible.length && <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-[#b8cda9] px-6 text-center text-sm text-[#57735b]">{query ? `No messages match “${query}”.` : documentId ? 'Ask a question to begin this document conversation.' : 'Choose a document from the file rail to begin.'}</div>}</div>
        <form onSubmit={send} className="border-t border-[#cbd7bc] bg-[#f1f5e9] p-4"><div className="flex items-center gap-2 rounded-2xl border border-[#b6cda5] bg-white p-2 pl-4"><input disabled={!documentId || sending} value={value} onChange={event => setValue(event.target.value)} placeholder={documentId ? 'Ask about this document...' : 'Choose a document to begin'} className="min-w-0 flex-1 bg-transparent py-2 text-sm text-[#1b402c] outline-none placeholder:text-[#71866f] disabled:cursor-not-allowed" /><button disabled={!documentId || sending || !value.trim()} className="grid size-10 place-items-center rounded-xl bg-[#24583a] text-[#fffdf1] transition hover:bg-[#1b482f] disabled:cursor-wait disabled:opacity-50" aria-label="Send message"><Icon name="send" className="size-5" /></button></div><p className="mt-2 text-center text-[10px] text-[#668066]">{sending ? 'CampusLens is preparing a source-aware answer…' : 'Answers use the selected document and its saved conversation.'}</p></form>
      </section>
    </div>
    {confirmDelete && <div className="fixed inset-0 z-50 grid place-items-center bg-[#071009]/55 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-title"><div className="w-full max-w-sm rounded-[26px] border border-[#78966d] bg-[#f9f8ed] p-6 shadow-2xl"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#a65a44]">Delete confirmation</p><h2 id="delete-title" className="display-font mt-2 text-2xl font-bold text-[#193b27]">{confirmDelete === 'conversation' ? 'Delete this chat?' : 'Delete this message?'}</h2><p className="mt-3 text-sm leading-6 text-[#55705a]">This action cannot be undone.</p><div className="mt-6 flex justify-end gap-3"><button onClick={() => setConfirmDelete(null)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-[#4f6751] hover:bg-[#e8efe3]">Cancel</button><button onClick={confirmDeletion} className="rounded-xl bg-[#a95741] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#8f4836]">Delete</button></div></div></div>}
  </div>
}

export default Chat
