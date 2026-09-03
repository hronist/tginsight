'use client'

import { useMemo, useState } from 'react'
import styles from './tg-intelligence.module.css'
import {
  Activity,
  Archive,
  Bot,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  CloudUpload,
  FileJson,
  Filter,
  Hash,
  History,
  Inbox,
  LayoutDashboard,
  Link2,
  Menu,
  MessageCircle,
  MoreHorizontal,
  PanelRight,
  Paperclip,
  Search,
  Send,
  Settings2,
  Sparkles,
  Tags,
  UserRound,
  Users,
  X,
  Zap,
} from 'lucide-react'

const messages = [
  { date: '24 ИЮНЯ 2024', name: 'Алексей Воронцов', handle: '@avorontsov', avatar: 'АВ', tone: 'blue', time: '14:32', text: 'Коллеги, собрал результаты по последнему спринту. Выкатка прошла стабильно, но есть несколько моментов по производительности, которые стоит обсудить на планировании.', tags: ['спринт', 'производительность'] },
  { name: 'Марина Соколова', handle: '@marina_s', avatar: 'МС', tone: 'teal', time: '14:38', text: 'По метрикам вижу просадку в конверсии на мобильных. Я добавила это в новый дашборд и приложила сравнение за последние две недели.', tags: ['метрики'] },
  { name: 'Илья Ким', handle: '@ilya_kim', avatar: 'ИК', tone: 'violet', time: '14:45', text: 'Похоже, причина в долгом ответе API каталога. Нашёл несколько запросов, где время ответа превышает 800ms.', tags: ['api', 'каталог'] },
  { date: '23 ИЮНЯ 2024', name: 'Ольга Петрова', handle: '@olga_pm', avatar: 'ОП', tone: 'orange', time: '18:12', text: 'Зафиксировала решения после встречи с командой. Приоритет на следующую неделю — стабилизация checkout и обновление аналитики.', tags: ['решения', 'checkout'] },
]

function Avatar({ children, tone = 'blue' }: { children: React.ReactNode; tone?: string }) {
  return <div className={`avatar avatar-${tone}`}>{children}</div>
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove?: () => void }) {
  return <span className="chip">{children}{onRemove && <button aria-label="Удалить фильтр" onClick={onRemove}><X size={12} /></button>}</span>
}

function Sidebar({ onUpload }: { onUpload: () => void }) {
  const [active, setActive] = useState(['backend', 'важное'])
  const remove = (item: string) => setActive(active.filter((value) => value !== item))
  return <aside className="sidebar-panel">
    <div className="section-heading"><div><p className="eyebrow">WORKSPACE</p><h2>Фильтры</h2></div><button className="icon-button" aria-label="Настройки фильтров"><Settings2 size={17} /></button></div>
    <button className="upload-box" onClick={onUpload}><CloudUpload size={22} /><span><b>Загрузить экспорт</b><small>JSON из Telegram</small></span><FileJson size={17} className="upload-file" /></button>
    <div className="filter-block"><label>ПРОЕКТЫ</label><button className="select-control"><span><span className="status-dot blue-dot" />Все проекты</span><ChevronDown size={15} /></button></div>
    <div className="filter-block"><label>АКТИВНЫЕ ФИЛЬТРЫ</label><div className="chips">{active.map((item) => <Chip key={item} onRemove={() => remove(item)}>{item}</Chip>)}<button className="add-filter"><span>+</span> Добавить</button></div></div>
    <div className="filter-block"><label>ПОИСК ПО СООБЩЕНИЯМ</label><div className="input-shell"><Search size={15} /><input placeholder="Ключевые слова..." defaultValue="производительность" /></div></div>
    <div className="filter-block split-fields"><div><label>ПЕРИОД</label><button className="select-control">Июнь 2024 <ChevronDown size={15} /></button></div><div><label>АВТОР</label><button className="select-control">Все авторы <ChevronDown size={15} /></button></div></div>
    <div className="filter-block"><label>ИСТОЧНИКИ</label><div className="check-row"><button className="check checked"><Check size={12} /></button><span>Группы и каналы</span><span className="count">4</span></div><div className="check-row"><button className="check checked"><Check size={12} /></button><span>Личные сообщения</span><span className="count">12</span></div></div>
    <div className="sidebar-divider" />
    <div className="filter-block ai-settings"><div className="label-row"><label><Sparkles size={13} /> AI НАСТРОЙКИ</label><span className="live-dot">ON</span></div><div className="mode-toggle"><button className="active">RAG поиск</button><button>Обычный</button></div><div className="select-control muted-select"><span>GPT-4o mini</span><ChevronDown size={15} /></div><div className="input-shell key-input"><span className="key-symbol">•••</span><input placeholder="API ключ не указан" type="password" /><Check size={14} className="success-icon" /></div></div>
  </aside>
}

function MessageCard({ item, query }: { item: typeof messages[number]; query: string }) {
  const parts = item.text.split(new RegExp(`(${query})`, 'ig'))
  return <article className="message-card"><div className="message-meta"><Avatar tone={item.tone}>{item.avatar}</Avatar><div><div className="author-line"><strong>{item.name}</strong><span>{item.handle}</span></div><div className="message-time"><Clock3 size={12} />Сегодня, {item.time}</div></div><button className="more-button" aria-label="Дополнительно"><MoreHorizontal size={17} /></button></div><p className="message-text">{parts.map((part, index) => part.toLowerCase() === query.toLowerCase() ? <mark key={index}>{part}</mark> : part)}</p><div className="message-footer"><div className="message-tags">{item.tags.map((tag) => <span key={tag}><Hash size={11} />{tag}</span>)}</div><button className="reply-link"><Link2 size={13} /> Открыть в Telegram</button></div></article>
}

function MessageStream() {
  const [query, setQuery] = useState('производительность')
  const [focused, setFocused] = useState(0)
  const found = useMemo(() => messages.filter((item) => item.text.toLowerCase().includes(query.toLowerCase()) || item.tags.some((tag) => tag.includes(query.toLowerCase()))), [query])
  return <section className="stream-panel"><div className="stream-toolbar"><div className="stream-title"><div className="stream-icon"><MessageCircle size={18} /></div><div><h1>Сообщения</h1><p><span className="online-dot" /> Найдено <b>{found.length + 126}</b> совпадений</p></div></div><div className="toolbar-actions"><button className="outline-button"><Filter size={15} /> Фильтр <span className="filter-number">3</span></button><button className="icon-button"><MoreHorizontal size={18} /></button></div></div><div className="search-bar"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Поиск сообщений" /><kbd>⌘ K</kbd></div><div className="stream-scroll">{found.map((item, index) => <div key={`${item.name}-${item.time}`}>{item.date && <div className="date-separator"><span>{item.date}</span><i /></div>}<div className={focused === index ? 'focused-message' : ''} onClick={() => setFocused(index)}><MessageCard item={item} query={query} /></div></div>)}<div className="load-more"><span /> Показать ещё сообщения <span /></div></div></section>
}

  function IntelligencePanel() {
  const [prompt, setPrompt] = useState('')
  const [sent, setSent] = useState(false)
  const [assistantMode, setAssistantMode] = useState<'client' | 'server'>('client')
  const modeLabel = assistantMode === 'client' ? 'Клиентский режим' : 'Серверный режим'
  return <aside className="intel-panel"><div className="intel-header"><div className="section-heading"><div><p className="eyebrow">AI ASSISTANT</p><h2>Инсайты</h2></div><button className="icon-button"><PanelRight size={17} /></button></div><button className="privacy-pill" type="button" aria-label="Данные обрабатываются локально" title="Данные обрабатываются локально"><span className="lock-dot" /></button></div><div className="intel-scroll"><div className="assistant-mode"><div><span className="mode-caption">РЕЖИМ АССИСТЕНТА</span><strong>{modeLabel}</strong></div><div className="mode-switch" role="group" aria-label="Режим ассистента"><button type="button" className={assistantMode === 'client' ? 'active' : ''} onClick={() => setAssistantMode('client')}>Клиентский</button><button type="button" className={assistantMode === 'server' ? 'active' : ''} onClick={() => setAssistantMode('server')}>Серверный</button></div></div><div className="stat-grid"><div className="stat-card"><span>СООБЩЕНИЙ</span><strong>12,482</strong><small><Activity size={12} /> +18% за неделю</small></div><div className="stat-card"><span>АВТОРОВ</span><strong>247</strong><small><Users size={12} /> 34 активных</small></div></div><div className="insight-card"><div className="insight-title"><div className="spark-icon"><Sparkles size={14} /></div><span>Сводка по результатам</span><span className="new-badge">NEW</span></div><p>Обсуждение сфокусировано на производительности API и стабильности checkout. <b>3 темы</b> требуют внимания команды.</p><div className="topic-list"><div><span className="topic-mark orange-mark" />API каталога <em>42%</em></div><div><span className="topic-mark blue-mark" />Мобильная конверсия <em>28%</em></div><div><span className="topic-mark teal-mark" />Планирование <em>18%</em></div></div></div><div className="assistant-card"><div className="assistant-top"><Avatar tone="blue"><Bot size={15} /></Avatar><div><b>Спросите по данным</b><small>Контекст: 12,482 сообщения</small></div><Zap size={15} className="zap" /></div>{sent && <div className="assistant-response">По найденным сообщениям команда чаще всего связывает просадку конверсии с задержкой API каталога. Стоит проверить запросы выше 800ms и мобильный checkout.</div>}<div className="prompt-box"><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Например: какие решения приняли по API?" rows={2} /><div className="prompt-actions"><button className="paperclip" aria-label="Прикрепить"><Paperclip size={15} /></button><button className="send-button" disabled={!prompt.trim()} onClick={() => { setSent(true); setPrompt('') }} aria-label="Отправить"><Send size={15} /></button></div></div><div className="suggestions"><button onClick={() => setPrompt('Какие темы обсуждались чаще всего?')}>Частые темы</button><button onClick={() => setPrompt('Кто отвечает за API каталога?')}>Ответственные</button></div></div><div className="history-heading"><span><History size={14} /> ИСТОРИЯ ЗАПРОСОВ</span><button>Очистить</button></div><div className="history-item"><span>Какие решения приняли по API?</span><Clock3 size={13} /></div><div className="history-item"><span>Сравни динамику за две недели</span><Clock3 size={13} /></div></div></aside>
}

export default function TgIntelligence() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  return <main className={`app-shell ${styles.glassApp}`}><header className="topbar"><div className="brand"><div className="brand-mark"><MessageCircle size={18} /></div><span>TG<span>INSIGHT</span></span></div><nav className="main-nav"><button className="nav-item active"><LayoutDashboard size={16} /> Обзор</button><button className="nav-item"><Inbox size={16} /> Сообщения <span className="nav-count">12k</span></button><button className="nav-item"><Tags size={16} /> Темы</button></nav><div className="top-actions"><button className="icon-button"><CircleHelp size={17} /></button><button className="icon-button"><Settings2 size={17} /></button><div className="profile"><Avatar tone="orange">АК</Avatar><div><b>Алексей К.</b><small>Администратор</small></div><ChevronDown size={14} /></div><button className="mobile-menu icon-button" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={18} /></button></div></header>{uploaded && <div className="toast"><Check size={15} /> Файл экспорта готов к анализу <button onClick={() => setUploaded(false)}><X size={14} /></button></div>}<div className="workspace"><div className={`mobile-sidebar ${sidebarOpen ? 'open' : ''}`}><Sidebar onUpload={() => setUploaded(true)} /></div><div className="desktop-sidebar"><Sidebar onUpload={() => setUploaded(true)} /></div><MessageStream /><IntelligencePanel /></div></main>
}

export { Sidebar, MessageStream, IntelligencePanel }
