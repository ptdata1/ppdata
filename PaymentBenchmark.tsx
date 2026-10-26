// Paytau — UK Payment Benchmark (Framer code component)
// Search a company, see its payment practices against sector peers, share or download a PDF.
// Data: a static JSON file (see setup guide). No backend.

import * as React from "react"
import { addPropertyControls, ControlType, useTracking } from "framer"

const { useEffect, useMemo, useRef, useState, useCallback } = React

/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 * @framerIntrinsicWidth 1080
 */
export default function PaymentBenchmark(props: Props) {
    const {
        dataUrl,
        contactLink,
        methodologyLink,
        correctionEmail,
        font,
        headingFont,
        ink,
        accent,
    } = props
    const C = useMemo(() => palette(ink, accent), [ink, accent])
    const bodyFamily = font?.fontFamily || DEFAULT_FONT
    const headFamily = headingFont?.fontFamily || bodyFamily
    const track = useSafeTracking()

    const [data, setData] = useState<Data | null>(null)
    const [error, setError] = useState(false)
    const [query, setQuery] = useState("")
    const [open, setOpen] = useState(false)
    const [active, setActive] = useState(0)
    const [selected, setSelected] = useState<Company | null>(null)
    const [expanded, setExpanded] = useState<number | null | undefined>(undefined) // undefined = default (Manufacturing open)
    const [toast, setToast] = useState("")
    const rootRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const searchedRef = useRef(false)
    const width = useWidth(rootRef)
    const compact = width > 0 && width < 680

    // ---- data -------------------------------------------------------------
    useEffect(() => {
        if (!dataUrl) return
        let cancelled = false
        fetch(dataUrl)
            .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
            .then((raw) => !cancelled && setData(prepare(raw)))
            .catch(() => !cancelled && setError(true))
        return () => {
            cancelled = true
        }
    }, [dataUrl])

    // Deep link: ?company=01234567
    useEffect(() => {
        if (!data || typeof window === "undefined") return
        const num = new URLSearchParams(window.location.search).get("company")
        if (num && data.byNum[num.toUpperCase()]) setSelected(data.byNum[num.toUpperCase()])
    }, [data])

    const results = useMemo(() => (data ? search(data, query) : []), [data, query])

    const choose = useCallback(
        (c: Company) => {
            setSelected(c)
            setQuery("")
            setOpen(false)
            track("benchmark-result-view")
            if (typeof window !== "undefined") {
                const url = new URL(window.location.href)
                url.searchParams.set("company", c.num)
                window.history.replaceState(null, "", url.toString())
                rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
        },
        [track]
    )

    const flash = (msg: string) => {
        setToast(msg)
        setTimeout(() => setToast(""), 2200)
    }

    const copyLink = async () => {
        track("benchmark-share")
        try {
            const url = new URL(window.location.href)
            if (selected) url.searchParams.set("company", selected.num)
            await navigator.clipboard.writeText(url.toString())
            flash("Link copied")
        } catch {
            flash("Copy the link from your address bar")
        }
    }

    const download = () => {
        track("benchmark-pdf-click")
        if (!selected || !data) return
        track("benchmark-pdf-download")
        printReport(selected, data)
    }

    const onKey = (e: React.KeyboardEvent) => {
        if (!results.length) return
        if (e.key === "ArrowDown") {
            e.preventDefault()
            setActive((a) => Math.min(a + 1, results.length - 1))
        } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
        } else if (e.key === "Enter") {
            e.preventDefault()
            choose(results[active])
        } else if (e.key === "Escape") {
            setOpen(false)
        }
    }

    // ---- render -----------------------------------------------------------
    const s = styles(C, compact)
    return (
        <div ref={rootRef} style={{ ...s.root, fontFamily: bodyFamily }}>
            {/* Search */}
            <div style={s.searchWrap}>
                <div style={s.searchBox}>
                    <SearchIcon color={C.muted} />
                    <input
                        ref={inputRef}
                        value={query}
                        placeholder={!data ? "Loading companies…" : compact ? "Company name or number" : `Search ${fmtInt(data.companies.length)} UK companies by name or number`}
                        disabled={!data}
                        aria-label="Search for a company"
                        role="combobox"
                        aria-expanded={open && query.length > 1}
                        aria-controls="pb-results"
                        onChange={(e) => {
                            setQuery(e.target.value)
                            setOpen(true)
                            setActive(0)
                            if (!searchedRef.current && e.target.value.length > 1) {
                                searchedRef.current = true
                                track("benchmark-search")
                            }
                        }}
                        onFocus={() => setOpen(true)}
                        onBlur={() => setTimeout(() => setOpen(false), 150)}
                        onKeyDown={onKey}
                        style={{ ...s.input, fontFamily: bodyFamily }}
                    />
                    {query && (
                        <button aria-label="Clear search" style={s.clear} onClick={() => setQuery("")}>
                            ×
                        </button>
                    )}
                </div>
                {open && query.trim().length > 1 && data && (
                    <div id="pb-results" role="listbox" style={s.dropdown}>
                        {results.length === 0 ? (
                            <div style={s.noResult}>
                                No match. Only large companies and LLPs have to publish payment practices reports, so
                                smaller businesses won't appear.
                            </div>
                        ) : (
                            results.map((c, i) => (
                                <div
                                    key={c.num}
                                    role="option"
                                    aria-selected={i === active}
                                    onMouseDown={(e) => {
                                        e.preventDefault()
                                        choose(c)
                                    }}
                                    onMouseEnter={() => setActive(i)}
                                    style={{ ...s.option, background: i === active ? C.soft : "transparent" }}
                                >
                                    <div style={s.optName}>{c.name}</div>
                                    <div style={s.optMeta}>
                                        {c.num}
                                        {c.sub >= 0 ? ` · ${subLabel(data.groups[c.sub])}` : ""}
                                        {c.end ? ` · Report to ${fmtMonth(c.end)}` : ""}
                                        {!c.current && <span style={s.optTag}>Older report</span>}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {error && <div style={s.notice}>The benchmark data couldn't be loaded. Please refresh the page.</div>}
            {!error && !data && <Skeleton C={C} />}

            {data && selected && (
                <CompanyCard
                    key={selected.num}
                    c={selected}
                    onSelect={choose}
                    onPeersOpen={() => track("benchmark-peers-view")}
                    data={data}
                    C={C}
                    s={s}
                    compact={compact}
                    headFamily={headFamily}
                    contactLink={
                        contactLink ||
                        (correctionEmail ? `mailto:${correctionEmail}?subject=${encodeURIComponent("Supplier early payment")}` : "https://paytau.app")
                    }
                    onContact={() => track("benchmark-contact-click")}
                    methodologyLink={methodologyLink}
                    onCopy={copyLink}
                    onDownload={download}
                    onBack={() => {
                        setSelected(null)
                        const url = new URL(window.location.href)
                        url.searchParams.delete("company")
                        window.history.replaceState(null, "", url.toString())
                        inputRef.current?.focus()
                    }}
                />
            )}

            {data && !selected && (
                <Overview
                    data={data}
                    C={C}
                    s={s}
                    compact={compact}
                    headFamily={headFamily}
                    expanded={expanded}
                    setExpanded={setExpanded}
                />
            )}

            {data && (
                <div style={s.footer}>
                    Source: UK Government payment practices reports (Open Government Licence v3.0) and Companies House. Snapshot{" "}
                    {fmtDate(data.meta.snapshot)}. Figures are as reported by each company and have not been audited. Paytau is not
                    affiliated with the UK Government.
                    {methodologyLink && (
                        <>
                            {" "}
                            <a href={methodologyLink} style={s.footLink}>
                                Methodology
                            </a>
                        </>
                    )}
                    {correctionEmail && (
                        <>
                            {" · "}
                            <a
                                href={`mailto:${correctionEmail}?subject=${encodeURIComponent(
                                    "Payment benchmark correction" + (selected ? ` – ${selected.name} (${selected.num})` : "")
                                )}`}
                                style={s.footLink}
                            >
                                Request a correction
                            </a>
                        </>
                    )}
                </div>
            )}

            {toast && <div style={s.toast}>{toast}</div>}
        </div>
    )
}

// ---------------------------------------------------------------------------
// Company card
// ---------------------------------------------------------------------------

function CompanyCard({ c, data, C, s, compact, headFamily, contactLink, onContact, methodologyLink, onCopy, onDownload, onBack, onSelect, onPeersOpen }) {
    const [peersOpen, setPeersOpen] = useState(false)
    const [scfOnly, setScfOnly] = useState(false)
    const [methOpen, setMethOpen] = useState(false)
    const peersRef = useRef<HTMLDivElement>(null)
    const sub = c.sub >= 0 ? data.groups[c.sub] : null
    const peerGroup = c.metrics.d.group >= 0 ? data.groups[c.metrics.d.group] : null
    const scfGroup = sub && sub.stats.scf[1] != null ? sub : peerGroup || data.groups[0]
    const scf = scfFigures(scfGroup)
    const statusNote = STATUS_NOTE[c.status]
    const summary = c.current ? buildSummary(c, data, peerGroup) : null
    const questions = c.current ? investigate(c, data) : []
    const cpb = c.current ? cpbInfo(c, data) : null
    const [cpbMethOpen, setCpbMethOpen] = useState(false)
    const basisInfo = sectorBasisText(c)
    const canListPeers = c.current && peerGroup && peerGroup.level !== "UK"
    const openPeers = (onlyScf: boolean) => {
        setScfOnly(onlyScf)
        if (!peersOpen) onPeersOpen()
        setPeersOpen(true)
        setTimeout(() => peersRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50)
    }

    return (
        <div style={s.card}>
            <div style={s.cardHead}>
                <div style={{ minWidth: 0 }}>
                    <h2 style={{ ...s.h2, fontFamily: headFamily }}>{c.name}</h2>
                    <div style={s.metaRow}>
                        <span>Company no. {c.num}</span>
                        {sub && <span style={s.chip}>{subLabel(sub)}</span>}
                    </div>
                    <div style={s.metaRow}>
                        <span>
                            Reporting period {fmtDate(c.start)} – {fmtDate(c.end)}
                        </span>
                        {c.report && (
                            <a href={reportUrl(c.report)} target="_blank" rel="noopener" style={s.link}>
                                View official report ↗
                            </a>
                        )}
                    </div>
                </div>
                <button style={s.ghostBtn} onClick={onBack}>
                    ← All sectors
                </button>
            </div>

            {!c.current && (
                <div style={s.notice}>
                    This is the latest report in our snapshot, but its period ended more than 12 months ago, so it isn't compared
                    with peers.
                </div>
            )}
            {statusNote && <div style={s.notice}>{statusNote}</div>}
            {summary && <div style={s.summary}>{summary}</div>}

            {c.current && (
                <div style={{ ...s.legend, marginTop: 20, marginBottom: 0 }}>
                    <span style={s.legendItem}>
                        <span style={{ width: 10, height: 10, borderRadius: 5, background: C.ink, display: "inline-block" }} /> This company
                    </span>
                    <span style={s.legendItem}>
                        <span style={{ width: 2, height: 12, background: C.muted, display: "inline-block" }} /> Peer median
                    </span>
                    <span style={s.legendItem}>
                        <span style={{ ...s.legendSwatch, background: C.bandFill }} /> Typical range (middle 50% of peers)
                    </span>
                </div>
            )}
            <div style={{ ...s.grid, marginTop: c.current ? 12 : 24 }}>
                {METRICS.map((m) => (
                    <MetricTile key={m.key} m={m} v={c.metrics[m.key]} data={data} C={C} s={s} headFamily={headFamily} />
                ))}
            </div>

            <TermsRow c={c} data={data} C={C} s={s} headFamily={headFamily} />

            {questions.length > 0 && (
                <div style={s.investigate}>
                    <div style={{ ...s.label, color: C.ink, fontWeight: 600, fontSize: 15 }}>What to investigate</div>
                    {questions.map((q, i) => (
                        <div key={i} style={s.qItem}>
                            <div style={{ ...s.qQuestion, fontFamily: headFamily }}>{q.question}</div>
                        </div>
                    ))}
                    <div style={{ ...s.caption, marginTop: 10 }}>
                        Based on simple rules applied to the reported figures. The data can point to questions worth asking; it can't
                        diagnose a company's processes.
                    </div>
                </div>
            )}

            {cpb && (
                <div style={s.cpbCard}>
                    <div style={s.cpbHead}>
                        <div style={{ ...s.label, color: C.ink, fontWeight: 600, fontSize: 15 }}>{CPB_HEADING}</div>
                        <span style={s.pill}>Illustrative</span>
                    </div>
                    {cpb.state === "estimate" ? (
                        <>
                            <div style={{ ...s.caption, marginTop: 14 }}>{CPB_LEAD}</div>
                            <div style={{ ...s.cpbFigure, fontFamily: headFamily }}>
                                {cpbFigure(cpb)}
                                {cpb.high >= 1000 && <span style={s.cpbPer}> a year</span>}
                            </div>
                            <div style={s.cpbStats}>
                                {cpbStats(cpb).map((t) => (
                                    <div key={t.label} style={s.cpbStat}>
                                        <div style={{ ...s.cpbStatValue, fontFamily: headFamily }}>{t.value}</div>
                                        <div style={s.cpbStatLabel}>{t.label}</div>
                                    </div>
                                ))}
                            </div>
                            <div style={{ ...s.caption, marginTop: 10 }}>{CPB_SHORT_CAVEAT}</div>
                            {cpb.capNote && <div style={s.cpbNote}>{cpb.capNote}</div>}
                        </>
                    ) : cpb.state === "none" ? (
                        <div style={{ ...s.cpbFigure, fontSize: compact ? 20 : 24, fontFamily: headFamily }}>No late payments reported in this period.</div>
                    ) : (
                        <div style={{ ...s.caption, marginTop: 12 }}>Estimate not available: this company's supplier spend isn't reported in a form we can use.</div>
                    )}
                    <div style={s.cpbStatus}>
                        <span style={s.pillWarm}>{CPB_PILL}</span>
                        <span style={{ ...s.caption, marginTop: 0 }}>{cpbStatus(data)}</span>
                    </div>
                    <button style={s.linkBtn} aria-expanded={cpbMethOpen} onClick={() => setCpbMethOpen(!cpbMethOpen)}>
                        How this estimate works {cpbMethOpen ? "▴" : "▾"}
                    </button>
                    {cpbMethOpen && (
                        <div style={{ ...s.caption, marginTop: 8 }}>
                            {cpbMethod(data)}
                            {methodologyLink && (
                                <>
                                    {" "}
                                    <a href={methodologyLink} style={{ color: "inherit" }}>
                                        Methodology
                                    </a>
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}

            <div style={s.scfCard}>
                <div style={{ ...s.label, color: C.ink, fontWeight: 600, fontSize: 15 }}>Supply chain finance</div>
                <div style={{ ...s.caption, marginTop: 4 }}>{SCF_DEF}</div>
                <div style={s.scfLine}>
                    <div style={s.scfKey}>Company</div>
                    <div style={{ ...s.scfValue, fontFamily: headFamily }}>
                        {c.scf === 1 ? "Reports offering SCF" : c.scf === 0 ? "No SCF reported" : "Not stated"}
                    </div>
                </div>
                <div style={s.scfLine}>
                    <div style={s.scfKey}>Sector</div>
                    {scf ? (
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <span style={{ ...s.scfValue, fontFamily: headFamily }}>{scf.pct} report offering SCF</span>
                            <span style={s.scfMeta}>
                                {" "}· {fmtInt(scf.x)} of {fmtInt(scf.y)} companies with a known disclosure
                            </span>
                        </div>
                    ) : (
                        <div style={s.scfMeta}>Too few companies with a known disclosure to compare.</div>
                    )}
                </div>
                {scf && canListPeers && scf.x > 0 && (
                    <button style={s.linkBtn} onClick={() => openPeers(true)}>
                        View peers reporting SCF →
                    </button>
                )}
                <div style={{ ...s.caption, fontSize: 12, marginTop: 10 }}>
                    Disclosures are self-reported and unverified{scf ? ` · Sector: ${peerLabel(scfGroup)}` : ""}.
                </div>
                <div style={s.scfDivider} />
                <div style={s.pitch}>
                    <div style={{ ...s.label, marginBottom: 4 }}>About Paytau</div>
                    <div style={s.pitchText}>{PITCH}</div>
                    <a href={contactLink} style={s.pitchLink} onClick={onContact}>
                        Discuss supplier early payment →
                    </a>
                </div>
            </div>

            {canListPeers && (
                <div ref={peersRef} style={{ marginTop: 20 }}>
                    <button
                        style={s.secondaryBtn}
                        aria-expanded={peersOpen}
                        onClick={() => (peersOpen ? setPeersOpen(false) : openPeers(false))}
                    >
                        {peersOpen ? "Hide sector peers" : `View the ${fmtInt(peerGroup.stats.d[0])} sector peers`}
                    </button>
                    {peersOpen && (
                        <PeerList c={c} data={data} group={peerGroup} scfOnly={scfOnly} setScfOnly={setScfOnly} onSelect={onSelect} C={C} s={s} compact={compact} />
                    )}
                </div>
            )}

            {c.current && peerGroup && (
                <div style={s.peerNote}>
                    <div>
                        Compared with {fmtInt(peerGroup.stats.d[0])}{" "}
                        {peerGroup.level === "UK" ? "eligible reporting companies" : `sector peers (${peerLabel(peerGroup)})`} with reports ending
                        in the 12 months to {fmtDate(data.meta.snapshot)}.
                    </div>
                    <button style={{ ...s.linkBtn, marginTop: 6 }} aria-expanded={methOpen} onClick={() => setMethOpen(!methOpen)}>
                        How this comparison works {methOpen ? "▴" : "▾"}
                    </button>
                    {methOpen && (
                        <div style={{ marginTop: 8 }}>
                            {peerGroup.level !== "Sub-sector" && sub
                                ? `${subLabel(sub)} has fewer than ${data.meta.minPeers} reporting companies, so the wider group is used. `
                                : ""}
                            {basisInfo.text}{" "}
                            {basisInfo.url && (
                                <>
                                    <a href={basisInfo.url} target="_blank" rel="noopener" style={{ color: "inherit" }}>
                                        Source ↗
                                    </a>{" "}
                                </>
                            )}
                            Peers share an industry but may differ in size and business model.
                            <br />
                            <br />
                            Typical range is the middle half of peers (25th to 75th percentile). It shows where this company sits, not whether
                            its practices are good or bad. "Payments not made within agreed terms" is the share of payments due in the reporting
                            period that were not made within the company's agreed terms, as reported.
                        </div>
                    )}
                </div>
            )}

            <div style={s.actions}>
                <button style={s.primaryBtn} onClick={onDownload}>
                    <DownloadIcon /> Download benchmark (PDF)
                </button>
                <button style={s.secondaryBtn} onClick={onCopy}>
                    Copy link
                </button>
            </div>
        </div>
    )
}

// ---- payment terms vs actual ----
const TERMS_SLACK = 2 // matches the export: beyond = average > longest standard term + 2 days

function termsInfo(c: Company, data: Data) {
    const { shortest, longest } = c.terms
    if (shortest == null) return null
    const top = longest ?? shortest
    const label = longest != null && longest !== shortest ? `${fmtNum(shortest)}–${fmtNum(longest)} days` : `${fmtNum(shortest)} days`
    const d = c.metrics.d.value
    const comparable = c.terms.state === 1 && d != null
    const mixed = c.terms.state === 2 && d != null
    const beyond = comparable ? Math.round(d - top) : null
    const isBeyond = beyond != null && beyond > TERMS_SLACK
    // peer share paying beyond their own longest terms: company's peer group, falling back up the tree
    let g = c.metrics.d.group >= 0 ? data.groups[c.metrics.d.group] : null
    while (g && (!g.stats.t || g.stats.t[1] == null)) g = g.parent >= 0 ? data.groups[g.parent] : g.level === "UK" ? null : data.groups[0]
    return { label, top, comparable, mixed, beyond, isBeyond, peer: g && g.stats.t ? { group: g, share: g.stats.t[1] as number } : null }
}

function buildSummary(c: Company, data: Data, peerGroup: Group | null): string | null {
    const d = c.metrics.d
    if (d.value == null || !peerGroup || peerGroup.stats.d[2] == null) return null
    const days = `${fmtNum(d.value)} ${d.value === 1 ? "day" : "days"}`
    const rd = rangeInfo(METRICS[0], d.value, peerGroup.stats.d)
    let out = `Average payment time is ${days} versus a peer median of ${Math.round(peerGroup.stats.d[2])}.`
    const l = c.metrics.l
    const lg = l.group >= 0 ? data.groups[l.group] : null
    const pos = (r: ReturnType<typeof rangeInfo>) => (r.range === "within" ? "within" : r.range)
    if (l.value != null && lg && lg.stats.l[2] != null) {
        const rl = rangeInfo(METRICS[1], l.value, lg.stats.l)
        out += ` ${fmtNum(l.value)}% of payments missed agreed terms.`
        out +=
            rd.range === rl.range
                ? ` Both measures sit ${pos(rd)} the typical peer range.`
                : ` Payment time sits ${pos(rd)} the typical peer range; the share missing terms sits ${pos(rl)} it.`
    } else {
        out += ` Payment time sits ${pos(rd)} the typical peer range.`
    }
    return out
}

const PITCH =
    "Traditional supply chain finance is built for large corporates: slow to set up and hard work to run. We're building Paytau to change that, making supply chain finance quick to launch and simple to manage for buyers and suppliers alike."
const SCF_DEF =
    "Supply chain finance gives eligible suppliers the option to be paid early through third-party funding, while the buyer keeps its cash until the agreed payment date."

// ---- Commercial Payments Bill estimate (illustrative, never ranked) ----
// annual spend x share paid late x days late / 365 x (base rate + 8%). Shown as a range; days late is an assumption.
const CPB_HEADING = "Illustrative effect of the Commercial Payments Bill"
const CPB_DAYS_LOW = 10
const CPB_DAYS_HIGH = 30
const CPB_MARGIN = 8 // statutory interest: 8 percentage points over base rate
const CPB_DEFAULT_BASE = 3.75

type CpbInfo = { state: "estimate" | "none" | "unavailable"; low: number; high: number; rate: number; capNote: string; late: number; spend: number }

const rateText = (n: number) => String(Number(n.toFixed(2)))

function cpbRate(data: Data) {
    return (data.meta.cpb?.baseRate ?? CPB_DEFAULT_BASE) + CPB_MARGIN
}

function cpbInfo(c: Company, data: Data): CpbInfo | null {
    if (!c.current) return null
    const rate = cpbRate(data)
    const late = c.metrics.l.value
    if (late == null) return null
    if (late === 0) return { state: "none", low: 0, high: 0, rate, capNote: "", late: 0, spend: 0 }
    if (c.spend == null || c.spend <= 0) return { state: "unavailable", low: 0, high: 0, rate, capNote: "", late, spend: 0 }
    const at = (days: number) => c.spend! * 1000 * (late / 100) * (days / 365) * (rate / 100)
    const longest = c.terms.longest
    return {
        state: "estimate",
        late,
        spend: c.spend * 1000,
        low: at(CPB_DAYS_LOW),
        high: at(CPB_DAYS_HIGH),
        rate,
        capNote:
            longest != null && longest > 60
                ? `The Bill would cap payment periods at 60 days for most small suppliers. This company reports longest standard terms of ${fmtNum(longest)} days.`
                : "",
    }
}

// Two significant figures: £29k, £1.2m. Keeps the range honest about its precision.
function gbpShort(n: number) {
    const r = Number(n.toPrecision(2))
    if (r >= 1e6) return `£${Number((r / 1e6).toPrecision(2))}m`
    if (r >= 1e3) return `£${Math.round(r / 1e3)}k`
    return `£${Math.max(10, Math.round(r))}`
}

const CPB_LEAD = "If the Bill were in force today, statutory interest on payments made late could be roughly"

// The headline figure, e.g. "£49k – £150k".
function cpbFigure(q: CpbInfo) {
    if (q.high < 1000) return "under £1k"
    const lo = gbpShort(q.low)
    const hi = gbpShort(q.high)
    return lo === hi ? lo : `${lo} – ${hi}`
}

function cpbMainLine(q: CpbInfo) {
    return `${CPB_LEAD} ${cpbFigure(q)} a year.`
}

// The three inputs behind the figure, shown as small stat tiles.
function cpbStats(q: CpbInfo): { value: string; label: string }[] {
    return [
        { value: `${CPB_DAYS_LOW}–${CPB_DAYS_HIGH} days`, label: "assumed average days late" },
        { value: `${fmtNum(q.late)}%`, label: "of payments not made within agreed terms" },
        { value: `${rateText(q.rate)}%`, label: "statutory interest rate" },
    ]
}

const CPB_SHORT_CAVEAT = "Illustrative only. Assumes every supplier claims interest. The reports do not say how overdue payments are."

function cpbAssumption(q: CpbInfo | null) {
    return `Illustrative only. Assumes payments are ${CPB_DAYS_LOW} to ${CPB_DAYS_HIGH} days late on average, that the share paid late applies equally to value, and that every supplier claims interest. The reports do not say how overdue payments are.`
}

const CPB_PILL = "Not yet passed"
function cpbStatus(data: Data) {
    return "Expected to apply from mid-to-late 2027 and not retrospective. Large companies will also have to report the interest they paid."
}

function monthYear(s: string) {
    const [y, m] = s.split("-").map(Number)
    return m ? `${MONTHS_LONG[m - 1]} ${y}` : s
}

function cpbMethod(data: Data) {
    const base = data.meta.cpb?.baseRate ?? CPB_DEFAULT_BASE
    const when = data.meta.cpb?.baseRateDate ? `, ${monthYear(data.meta.cpb.baseRateDate)}` : ""
    return `${cpbAssumption(null)} Estimate = annual supplier spend × share of payments not made within agreed terms × days late ÷ 365 × statutory interest rate. Annual spend is twice the reported six-month spend. Statutory interest is the Bank of England base rate (${rateText(base)}%${when}) plus ${CPB_MARGIN}%. Invoice counts stand in for value, and the ${CPB_DAYS_LOW} and ${CPB_DAYS_HIGH} day figures are assumptions. Companies that report no late payments, or no usable spend figure, are not estimated.`
}

// ---- "What to investigate": transparent rules over the reported figures (max two items) ----
function investigate(c: Company, data: Data): { pattern: string; question: string }[] {
    const d = c.metrics.d
    const gd = d.group >= 0 ? data.groups[d.group] : null
    if (d.value == null || !gd || gd.stats.d[2] == null) return []
    const rd = rangeInfo(METRICS[0], d.value, gd.stats.d)
    const l = c.metrics.l
    const gl = l.group >= 0 ? data.groups[l.group] : null
    const rl = l.value != null && gl && gl.stats.l[2] != null ? rangeInfo(METRICS[1], l.value, gl.stats.l) : null
    const t = termsInfo(c, data)
    const out: { pattern: string; question: string }[] = []
    if (t && t.isBeyond)
        out.push({
            pattern: `Average payment time (${fmtNum(d.value)} days) is longer than the company's own longest published standard terms (${fmtNum(t.top)} days).`,
            question: "Are standard terms being applied consistently, and which invoices fall outside them?",
        })
    if (rl && rl.range === "above")
        out.push({
            pattern: `The share of payments not made within agreed terms (${fmtNum(l.value)}%) is above the typical range for sector peers (${rl.middle}).`,
            question: "Where do payments miss their due dates: approval, dispute resolution or payment scheduling?",
        })
    if (rd.range === "above" && !(rl && rl.range === "above") && t && t.comparable && !t.isBeyond)
        out.push({
            pattern: `Payment time is above the typical range for sector peers (${rd.middle}), but within the company's own published standard terms (${t.label}).`,
            question: "If the longer terms are deliberate, do suppliers ask to be paid sooner, and do the terms affect supplier pricing or relationships?",
        })
    else if (rd.range === "above" && !(rl && rl.range === "above"))
        out.push({
            pattern: rl
                ? `Payment time is above the typical range for sector peers (${rd.middle}), but the share of payments made late is not.`
                : `Payment time is above the typical range for sector peers (${rd.middle}).`,
            question: "Do longer payment times reflect agreed terms, and do suppliers ask to be paid sooner?",
        })
    if (rd.range === "below" && !(rl && rl.range === "above"))
        out.push({
            pattern: `Payment time is below the typical range for sector peers (${rd.middle}).`,
            question: "Is faster payment a deliberate supplier policy, or worth reviewing as part of working-capital management?",
        })
    if (t && t.mixed)
        out.push({
            pattern: "Average payment time is longer than the published standard terms, but few payments are reported as late, so many invoices are likely on other agreed terms.",
            question: "Are non-standard terms documented consistently and clear to suppliers?",
        })
    if (!out.length)
        out.push({
            pattern: "Payment time and late payments are both within the typical range for sector peers.",
            question: "Both measures are within the typical range, so the benchmark alone doesn't point to a clear outlier. Is there an internal reason to change?",
        })
    return out.slice(0, 2)
}

// ---- Sector peer list: alphabetical (never ranked), click a row to open that company ----
function PeerList({ c, data, group, scfOnly, setScfOnly, onSelect, C, s, compact }) {
    const [filter, setFilter] = useState("")
    const gi = data.groups.indexOf(group)
    const all = useMemo(
        () =>
            data.companies
                .filter((p) => {
                    if (p.metrics.d.group < 0 || p.sub < 0) return false
                    return group.level === "Sub-sector" ? p.sub === gi : data.groups[p.sub].parent === gi
                })
                .sort((a, b) => a.name.localeCompare(b.name)),
        [data, gi]
    )
    const scfCount = all.filter((p) => p.scf === 1).length
    const f = normalise(filter)
    const rows = all.filter((p) => (!scfOnly || p.scf === 1) && (!f || p.key.includes(f)))
    const cell = (extra = {}) => ({ padding: compact ? "8px 4px" : "9px 8px", borderBottom: `1px solid ${C.track}`, fontSize: compact ? 12 : 13, ...extra })
    const num = (extra = {}) => cell({ textAlign: "right", whiteSpace: "nowrap", ...extra })
    return (
        <div style={s.peerWrap}>
            <div style={s.peerTools}>
                <label style={s.check}>
                    <input type="checkbox" checked={scfOnly} onChange={(e) => setScfOnly(e.target.checked)} /> Only peers reporting SCF (
                    {scfCount})
                </label>
                {all.length > 30 && (
                    <input
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Filter by name"
                        aria-label="Filter peers by name"
                        style={s.peerFilter}
                    />
                )}
            </div>
            <div style={s.peerScroll}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr>
                            <th style={cell({ textAlign: "left", color: C.muted, fontWeight: 500 })}>Company</th>
                            {!compact && <th style={num({ color: C.muted, fontWeight: 500 })}>Period end</th>}
                            <th style={num({ color: C.muted, fontWeight: 500, whiteSpace: "normal" })}>Avg days</th>
                            <th style={num({ color: C.muted, fontWeight: 500, whiteSpace: "normal" })}>{compact ? "Not in terms" : "Not within terms"}</th>
                            <th style={num({ color: C.muted, fontWeight: 500, whiteSpace: "normal" })}>SCF</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((p) => {
                            const me = p.num === c.num
                            return (
                                <tr
                                    key={p.num}
                                    onClick={me ? undefined : () => onSelect(p)}
                                    style={{ cursor: me ? "default" : "pointer", background: me ? C.soft : "transparent" }}
                                >
                                    <td style={cell({ fontWeight: me ? 600 : 400 })}>
                                        {niceName(p.name)}
                                        {me && <span style={{ color: C.muted, fontWeight: 400 }}> (this company)</span>}
                                    </td>
                                    {!compact && <td style={num({ color: C.muted })}>{fmtMonth(p.end)}</td>}
                                    <td style={num()}>{fmtNum(p.metrics.d.value)}</td>
                                    <td style={num()}>{p.metrics.l.value != null ? `${fmtNum(p.metrics.l.value)}%` : "–"}</td>
                                    <td style={num({ color: p.scf === 1 ? C.accent : C.muted })}>
                                        {p.scf === 1 ? "Yes" : p.scf === 0 ? "No" : "–"}
                                    </td>
                                </tr>
                            )
                        })}
                        {!rows.length && (
                            <tr>
                                <td colSpan={5} style={cell({ color: C.muted })}>
                                    No peers match.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            <div style={{ ...s.caption, marginTop: 8 }}>
                Sorted alphabetically. Each legal entity reports separately, so a group can appear more than once. Select a company to
                see its benchmark.
            </div>
        </div>
    )
}

// How the sector was assigned, so readers can judge whether the peer group fits.
function sectorBasisText(c: Company): { text: string; url: string } {
    const b = c.sectorBasis
    const sic = (t: string) => t.replace(" - ", " – ")
    if (b.kind === 2) {
        const [, url, registered] = b.text.split("|")
        return {
            text: `Sector is based on the company's activities rather than its registered SIC code${registered ? ` (${sic(registered)})` : ""}.`,
            url: url || "",
        }
    }
    if (b.kind === 1) return { text: "There is no SIC code on the Companies House register, so the sector is based on the company's activities.", url: "" }
    return {
        text: b.text ? `Sector is based on the registered SIC code (${sic(b.text)}); SIC codes can be broad or out of date.` : "Sector is assigned from Companies House SIC codes.",
        url: "",
    }
}

function TermsRow({ c, data, C, s, headFamily }) {
    const t = termsInfo(c, data)
    if (!t) return null
    return (
        <div style={s.scfRow}>
            <div>
                <div style={s.label}>Standard payment terms (as reported)</div>
                <div style={{ ...s.termsValue, fontFamily: headFamily }}>{t.label}</div>
                <div style={s.caption}>Average time to pay: {c.metrics.d.value != null ? `${fmtNum(c.metrics.d.value)} days` : "not available"}</div>
            </div>
            <div>
                {t.comparable ? (
                    <>
                        <div style={{ ...s.band, color: t.isBeyond ? C.ink : C.accent }}>
                            {t.isBeyond
                                ? `Pays ${t.beyond} days beyond its longest standard terms on average`
                                : "Average time to pay is within its standard terms"}
                        </div>
                        {t.peer && (
                            <div style={s.caption}>
                                {pct(t.peer.share * 100)} of {peerLabel(t.peer.group)} pay beyond their longest standard terms on average.
                            </div>
                        )}
                    </>
                ) : t.mixed ? (
                    <div style={s.caption}>
                        The average is longer than these standard terms, but only {fmtNum(c.metrics.l.value ?? 0)}% of invoices are
                        reported as paid late, so most invoices are likely on other agreed terms. Not compared.
                    </div>
                ) : (
                    <div style={s.caption}>
                        {c.current ? "Not compared: the reported terms are incomplete or unusual." : "Not compared, as this report is more than 12 months old."}
                    </div>
                )}
            </div>
        </div>
    )
}

function MetricTile({ m, v, data, C, s, headFamily }) {
    const g = v.group >= 0 ? data.groups[v.group] : null
    const st = g ? g.stats[m.key] : null
    const has = v.value != null
    return (
        <div style={s.tile}>
            <div style={s.label}>{m.label}</div>
            <div style={{ ...s.value, fontFamily: headFamily }}>
                {has ? (
                    <>
                        {fmtNum(v.value)}
                        <span style={{ ...s.unit, marginLeft: m.unit === "%" ? 2 : 6 }}>{m.unit}</span>
                    </>
                ) : (
                    <span style={{ ...s.unit, marginLeft: 0 }}>Not available</span>
                )}
            </div>
            {has && st && st[2] != null ? (
                <>
                    <Strip value={v.value} p25={st[1]} median={st[2]} p75={st[3]} max={m.max(st)} C={C} />
                    {(() => {
                        const r = rangeInfo(m, v.value, st)
                        return (
                            <>
                                <div style={{ ...s.band, color: r.range === "within" ? C.muted : C.ink }}>{r.label}</div>
                                <div style={s.caption}>{r.gap}</div>
                                <div style={s.caption}>
                                    Typical range {r.middle} · based on {fmtInt(st[0])} companies
                                </div>
                            </>
                        )
                    })()}
                </>
            ) : (
                <div style={s.caption}>{has ? "Not compared with peers" : "Not reported or withheld pending review"}</div>
            )}
        </div>
    )
}

function Strip({ value, p25, median, p75, max, C }) {
    const x = (n: number) => `${Math.max(0, Math.min(100, (n / max) * 100))}%`
    const beyond = value > max
    return (
        <div style={{ position: "relative", height: 22, margin: "14px 0 8px" }} aria-hidden>
            <div style={{ position: "absolute", top: 8, left: 0, right: 0, height: 6, borderRadius: 3, background: C.track }} />
            <div
                style={{
                    position: "absolute",
                    top: 8,
                    height: 6,
                    borderRadius: 3,
                    left: x(p25),
                    width: `calc(${x(p75)} - ${x(p25)})`,
                    background: C.bandFill,
                }}
            />
            <div
                style={{
                    position: "absolute",
                    top: 4,
                    left: x(value),
                    width: 14,
                    height: 14,
                    marginLeft: -7,
                    borderRadius: 7,
                    background: C.ink,
                    border: "2px solid #fff",
                    boxShadow: "0 1px 3px rgba(0,0,0,.25)",
                }}
            />
            <div style={{ position: "absolute", top: 0, left: x(median), width: 2, height: 22, marginLeft: -1, background: C.muted, borderRadius: 1 }} />
            {beyond && <div style={{ position: "absolute", right: -2, top: -1, fontSize: 12, color: C.muted }}>›</div>}
        </div>
    )
}

// ---------------------------------------------------------------------------
// Sector overview (default view)
// ---------------------------------------------------------------------------

function Overview({ data, C, s, compact, headFamily, expanded, setExpanded }) {
    const uk = data.groups[0]
    const [showAll, setShowAll] = useState(false)
    const sorted = [...data.sectors].sort((a, b) => (data.groups[b[0]].stats.d[2] ?? 0) - (data.groups[a[0]].stats.d[2] ?? 0))
    const featured = sorted.filter(([gi]) => FEATURED_SECTORS.includes(data.groups[gi].name))
    const rows = showAll ? sorted : featured
    const hidden = sorted.length - featured.length
    const mfg = data.sectors.find(([gi]) => data.groups[gi].name === "Manufacturing")
    const openIdx = expanded === undefined ? (mfg ? mfg[0] : null) : expanded
    const mfgMedian = mfg ? data.groups[mfg[0]].stats.d[2] : null
    const gap = mfgMedian != null && uk.stats.d[2] != null ? Math.round(mfgMedian - uk.stats.d[2]) : 0
    const max = 80
    const Row = ({ g, indent = false, onClick = null, open = false, emphasis = false }) => {
        const st = g.stats.d
        return (
            <div
                onClick={onClick || undefined}
                role={onClick ? "button" : undefined}
                aria-expanded={onClick ? open : undefined}
                tabIndex={onClick ? 0 : undefined}
                onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && onClick() : undefined}
                style={{ ...s.ovRow, cursor: onClick ? "pointer" : "default" }}
            >
                <div style={{ ...s.ovName, paddingLeft: indent ? 16 : 0, fontWeight: emphasis ? 600 : indent ? 400 : 500, color: indent ? C.muted : C.ink }}>
                    {onClick && <span style={{ ...s.chev, transform: open ? "rotate(90deg)" : "none" }}>›</span>}
                    {g.name}
                </div>
                {st[2] != null ? (
                    <>
                        <div style={s.ovStrip}>
                            <OverviewStrip st={st} max={max} C={C} ukMedian={uk.stats.d[2]} />
                        </div>
                        <div style={s.ovVal}>{fmtStat(st[2])} days</div>
                    </>
                ) : (
                    <div style={{ ...s.ovThin }}>Fewer than {data.meta.minPeers} companies</div>
                )}
            </div>
        )
    }
    return (
        <div style={s.card}>
            <h2 style={{ ...s.h2, fontFamily: headFamily }}>How long large UK companies take to pay their suppliers</h2>
            <p style={s.lead}>
                Median average days to pay, by sector, for {fmtInt(uk.stats.d[0])} reporting companies whose latest report ended in the 12
                months to {fmtDate(data.meta.snapshot)}. Only large UK companies and LLPs must report, so this doesn't cover every UK
                business. Search above to see how a specific company compares.
            </p>
            {gap > 0 && (
                <div style={s.insight}>
                    The typical manufacturer among reporting companies takes {fmtStat(mfgMedian)} days to pay its suppliers, {gap} days
                    longer than the median across all eligible reporting companies ({fmtStat(uk.stats.d[2])}).
                </div>
            )}
            <div style={s.legend}>
                <span style={s.legendItem}>
                    <span style={{ ...s.legendSwatch, background: C.bandFill }} /> Middle half of companies
                </span>
                <span style={s.legendItem}>
                    <span style={{ width: 2, height: 12, background: C.muted, display: "inline-block" }} /> Median
                </span>
                <span style={s.legendItem}>
                    <span style={{ width: 0, height: 12, borderLeft: `1px dashed ${C.accent}`, display: "inline-block" }} /> Median of all eligible reporting companies
                </span>
            </div>
            <div style={s.ovRow} aria-hidden>
                {!compact && <div />}
                <div style={{ ...s.ovStrip, position: "relative", height: 14, fontSize: 11, color: C.muted }}>
                    {[0, 20, 40, 60, 80].map((t) => (
                        <span key={t} style={{ position: "absolute", left: `${(t / max) * 100}%`, whiteSpace: "nowrap", transform: t ? (t === max ? "translateX(-100%)" : "translateX(-50%)") : "none" }}>
                            {t === max ? `${t}+ days` : t}
                        </span>
                    ))}
                </div>
                {!compact && <div />}
            </div>
            <Row g={uk} emphasis />
            <div style={{ height: 1, background: C.line, margin: "6px 0" }} />
            {rows.map(([gi, subs]) => {
                const g = data.groups[gi]
                const realSubs = subs.filter((j) => data.groups[j].name !== g.name)
                const isOpen = openIdx === gi
                return (
                    <div key={gi}>
                        <Row
                            g={g}
                            open={isOpen}
                            onClick={realSubs.length ? () => setExpanded(isOpen ? null : gi) : null}
                        />
                        {isOpen &&
                            realSubs
                                .sort((a, b) => (data.groups[b].stats.d[2] ?? -1) - (data.groups[a].stats.d[2] ?? -1))
                                .map((j) => <Row key={j} g={data.groups[j]} indent />)}
                    </div>
                )
            })}
            {hidden > 0 && (
                <button style={s.showAll} onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>
                    {showAll ? "Show fewer sectors" : `Show all sectors (${hidden} more)`}
                </button>
            )}
        </div>
    )
}

function OverviewStrip({ st, max, C, ukMedian }) {
    const x = (n: number) => `${Math.max(0, Math.min(100, (n / max) * 100))}%`
    return (
        <div style={{ position: "relative", height: 16 }} aria-hidden>
            <div style={{ position: "absolute", top: 5, left: 0, right: 0, height: 6, borderRadius: 3, background: C.track }} />
            <div style={{ position: "absolute", top: 5, height: 6, borderRadius: 3, left: x(st[1]), width: `calc(${x(st[3])} - ${x(st[1])})`, background: C.bandFill }} />
            <div style={{ position: "absolute", top: 0, bottom: 0, left: x(ukMedian), borderLeft: `1px dashed ${C.accent}` }} />
            <div style={{ position: "absolute", top: 1, left: x(st[2]), width: 2, height: 14, marginLeft: -1, background: C.ink, borderRadius: 1 }} />
        </div>
    )
}

function Skeleton({ C }) {
    return (
        <div style={{ background: "#fff", borderRadius: 20, border: `1px solid ${C.line}`, padding: 28, marginTop: 20 }}>
            {[70, 90, 60, 80].map((w, i) => (
                <div key={i} style={{ height: 12, width: `${w}%`, background: C.track, borderRadius: 6, margin: "14px 0" }} />
            ))}
        </div>
    )
}

// ---------------------------------------------------------------------------
// PDF (print-to-PDF one-pager in a new window)
// ---------------------------------------------------------------------------

function printReport(c: Company, data: Data) {
    const w = window.open("", "_blank")
    if (!w) return
    const sub = c.sub >= 0 ? data.groups[c.sub] : null
    const pg = c.metrics.d.group >= 0 ? data.groups[c.metrics.d.group] : null
    const scfG = sub && sub.stats.scf[1] != null ? sub : pg || data.groups[0]
    const scf = scfFigures(scfG)
    const summaryText = c.current ? buildSummary(c, data, pg) : null
    const questions = c.current ? investigate(c, data) : []
    const P = palette()

    const basisInfo = sectorBasisText(c)
    const basis = esc(basisInfo.text) + (basisInfo.url ? ` Source: ${esc(basisInfo.url)}` : "")

    const strip = (v: number, st: number[], max: number) => {
        const x = (n: number) => Math.max(0, Math.min(100, (n / max) * 100))
        return `<div class="strip"><div class="track"></div><div class="band" style="left:${x(st[1])}%;width:${x(st[3]) - x(st[1])}%"></div><div class="dot" style="left:${x(v)}%"></div><div class="med" style="left:${x(st[2])}%"></div></div>`
    }
    const tiles = METRICS.map((m) => {
        const v = c.metrics[m.key]
        const g = v.group >= 0 ? data.groups[v.group] : null
        const st = g ? g.stats[m.key] : null
        const has = v.value != null
        let body: string
        if (has && st && st[2] != null) {
            const r = rangeInfo(m, v.value as number, st)
            body = `${strip(v.value as number, st, m.max(st))}<div class="band-label" style="color:${r.range === "within" ? P.muted : P.ink}">${esc(r.label)}</div><div class="cap">${esc(r.gap)}</div><div class="cap">Typical range ${esc(r.middle)} · based on ${fmtInt(st[0])} companies</div>`
        } else body = `<div class="cap">${has ? "Not compared with peers" : "Not reported or withheld pending review"}</div>`
        return `<div class="tile"><div class="lab">${m.label}</div><div class="val">${has ? fmtNum(v.value as number) + `<span class="unit">${m.unit}</span>` : `<span class="unit">Not available</span>`}</div>${body}</div>`
    }).join("")

    const cpbPdf = (() => {
        const q = c.current ? cpbInfo(c, data) : null
        if (!q) return ""
        const body =
            q.state === "estimate"
                ? `<div class="cap" style="margin-top:10px">${esc(CPB_LEAD)}</div><div class="fig">${esc(cpbFigure(q))}${q.high >= 1000 ? `<span class="per"> a year</span>` : ""}</div><div class="stats">${cpbStats(q).map((t) => `<div class="stat"><div class="sv">${esc(t.value)}</div><div class="sl">${esc(t.label)}</div></div>`).join("")}</div><div class="cap" style="margin-top:8px">${esc(CPB_SHORT_CAVEAT)}</div>${q.capNote ? `<div class="cnote">${esc(q.capNote)}</div>` : ""}`
                : q.state === "none"
                ? `<div class="val2" style="margin-top:8px">No late payments reported in this period.</div>`
                : `<div class="cap" style="margin-top:8px">Estimate not available: this company's supplier spend isn't reported in a form we can use.</div>`
        return `<div class="box" style="margin-top:10px"><div style="display:flex;justify-content:space-between;align-items:center"><strong>${esc(CPB_HEADING)}</strong><span class="pill">Illustrative</span></div>${body}<div class="status"><span class="pillw">${esc(CPB_PILL)}</span><span class="cap">${esc(cpbStatus(data))}</span></div><div class="cap" style="margin-top:8px">${esc(cpbMethod(data))}</div></div>`
    })()

    const terms = (() => {
        const t = termsInfo(c, data)
        if (!t) return ""
        const dv = c.metrics.d.value
        const right = t.comparable
            ? `<div class="band-label" style="color:${t.isBeyond ? P.ink : P.accent}">${t.isBeyond ? `Pays ${t.beyond} days beyond its longest standard terms on average` : "Average time to pay is within its standard terms"}</div>${t.peer ? `<div class="cap">${pct(t.peer.share * 100)} of ${esc(peerLabel(t.peer.group))} pay beyond their longest standard terms on average.</div>` : ""}`
            : t.mixed
            ? `<div class="cap">The average is longer than these standard terms, but only ${fmtNum(c.metrics.l.value ?? 0)}% of invoices are reported as paid late, so most invoices are likely on other agreed terms. Not compared.</div>`
            : `<div class="cap">${c.current ? "Not compared: the reported terms are incomplete or unusual." : "Not compared, as this report is more than 12 months old."}</div>`
        return `<div class="card two"><div><div class="lab">Standard payment terms (as reported)</div><div class="val2">${esc(t.label)}</div><div class="cap">Average time to pay: ${dv != null ? fmtNum(dv) + " days" : "not available"}</div></div><div>${right}</div></div>`
    })()

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Payment benchmark – ${esc(c.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
@page{size:A4;margin:14mm}
@media screen{body{max-width:820px;margin:32px auto!important;padding:0 24px}}
*{box-sizing:border-box}body{font-family:Inter,system-ui,sans-serif;color:${P.ink};margin:0;font-size:10pt;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.top{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid ${P.line};padding-bottom:10px}
.brand{font-weight:700;font-size:16pt;letter-spacing:-.02em}
.kicker{font-size:8.5pt;color:${P.muted};text-transform:uppercase;letter-spacing:.08em}
h1{font-size:20pt;letter-spacing:-.02em;margin:18px 0 6px;line-height:1.15}
.meta{color:${P.muted};font-size:9.5pt;margin-top:4px}
.chip{display:inline-block;background:${P.soft};color:${P.accent};border-radius:999px;padding:1px 9px;font-weight:500;margin-left:6px}
.basis{color:${P.muted};font-size:8.5pt;margin-top:4px;max-width:150mm}
.notice{background:#F6F4EC;border-radius:10px;padding:10px 14px;margin-top:12px;font-size:9.5pt}
.summary{background:${P.soft};border-radius:10px;padding:12px 16px;margin-top:14px;font-size:11pt;line-height:1.5}
.legend{display:flex;gap:16px;margin:16px 0 8px;font-size:8.5pt;color:${P.muted};align-items:center}
.legend i{display:inline-block;vertical-align:middle;margin-right:5px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.tile,.card,.box{border:1px solid ${P.line};border-radius:12px;padding:12px 14px;break-inside:avoid}
.card{margin-top:10px}.two{display:grid;grid-template-columns:1fr 1fr;gap:14px;align-items:center}
.lab{font-size:9pt;color:${P.muted}}
.val{font-size:22pt;font-weight:600;letter-spacing:-.02em;margin-top:2px;line-height:1.1}.unit{font-size:10pt;font-weight:400;color:${P.muted};margin-left:4px}
.val2{font-size:14pt;font-weight:600;margin-top:2px}
.strip{position:relative;height:20px;margin:8px 0 4px}
.strip .track{position:absolute;top:7px;left:0;right:0;height:6px;border-radius:3px;background:${P.track}}
.strip .band{position:absolute;top:7px;height:6px;border-radius:3px;background:${P.bandFill}}
.strip .dot{position:absolute;top:3px;width:14px;height:14px;margin-left:-7px;border-radius:7px;background:${P.ink};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.25)}
.strip .med{position:absolute;top:0;width:2px;height:20px;margin-left:-1px;background:${P.muted};border-radius:1px}
.band-label{font-weight:600;font-size:9.5pt;margin-top:2px}
.cap{font-size:8.5pt;color:${P.muted};margin-top:2px}
.investigate{margin-top:10px;break-inside:avoid}
.q{font-weight:600;font-size:10.5pt;border-left:3px solid ${P.bandFill};padding-left:10px;margin-top:8px}
.divider{height:1px;background:${P.line};margin:12px 0}
.about{background:${P.soft};border-radius:10px;padding:12px 14px}
.about .lab{margin-bottom:3px}
.fig{font-size:26pt;font-weight:600;letter-spacing:-.02em;line-height:1.1;margin-top:4px}.per{font-size:11pt;font-weight:500;color:${P.muted};margin-left:4px}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.stat{background:${P.soft};border-radius:8px;padding:8px 10px}.sv{font-size:12pt;font-weight:600}.sl{font-size:8pt;color:${P.muted};margin-top:1px}
.pill{background:${P.track};color:${P.muted};border-radius:999px;padding:1px 9px;font-size:8pt;font-weight:500}
.pillw{background:#F6F4EC;color:#5A5236;border:1px solid #ECE6D3;border-radius:999px;padding:1px 9px;font-size:8pt;font-weight:600;white-space:nowrap}
.status{display:flex;gap:8px;align-items:center;margin-top:10px}.status .cap{margin-top:0}
.cnote{font-size:8.5pt;margin-top:8px;padding-left:9px;border-left:3px solid ${P.bandFill}}
.method{font-size:8.5pt;color:${P.muted};margin-top:14px}
.note{font-size:8pt;color:${P.muted};margin-top:12px;border-top:1px solid ${P.line};padding-top:8px}
</style></head><body>
<div class="top"><div class="brand">Paytau</div><div class="kicker">UK Payment Benchmark · ${fmtDate(data.meta.snapshot)}</div></div>
<h1>${esc(c.name)}</h1>
<div class="meta">Company no. ${c.num}${sub ? `<span class="chip">${esc(subLabel(sub))}</span>` : ""}</div>
<div class="meta">Reporting period ${fmtDate(c.start)} – ${fmtDate(c.end)}${c.report ? ` · Official report: ${esc(reportUrl(c.report))}` : ""}</div>
${!c.current ? `<div class="notice">This is the latest report in our snapshot, but its period ended more than 12 months ago, so it isn't compared with peers.</div>` : ""}
${STATUS_NOTE[c.status] ? `<div class="notice">${esc(STATUS_NOTE[c.status])}</div>` : ""}
${summaryText ? `<div class="summary">${esc(summaryText)}</div>` : ""}
${c.current ? `<div class="legend"><span><i style="width:10px;height:10px;border-radius:5px;background:${P.ink}"></i>This company</span><span><i style="width:2px;height:12px;background:${P.muted}"></i>Peer median</span><span><i style="width:18px;height:6px;border-radius:3px;background:${P.bandFill}"></i>Typical range (middle 50% of peers)</span></div>` : ""}
<div class="grid"${c.current ? "" : ` style="margin-top:16px"`}>${tiles}</div>
${terms}
${questions.length ? `<div class="box investigate"><strong>What to investigate</strong>${questions.map((q) => `<div class="q">${esc(q.question)}</div>`).join("")}<div class="cap" style="margin-top:10px">Based on simple rules applied to the reported figures. The data can point to questions worth asking; it can't diagnose a company's processes.</div></div>` : ""}
${cpbPdf}
<div class="box" style="margin-top:10px">
<strong>Supply chain finance</strong>
<div class="cap" style="margin-top:3px">${esc(SCF_DEF)}</div>
<div style="margin-top:8px"><span class="lab" style="display:inline-block;width:64px">Company</span><strong>${c.scf === 1 ? "Reports offering SCF" : c.scf === 0 ? "No SCF reported" : "Not stated"}</strong></div>
<div style="margin-top:4px"><span class="lab" style="display:inline-block;width:64px;vertical-align:top">Sector</span>${scf ? `<span style="display:inline-block;max-width:140mm"><strong>${scf.pct} report offering SCF</strong> <span class="lab">· ${fmtInt(scf.x)} of ${fmtInt(scf.y)} companies with a known disclosure</span></span>` : `<span class="lab">Too few companies with a known disclosure to compare.</span>`}</div>
<div class="cap" style="margin-top:8px">Disclosures are self-reported and unverified${scf ? ` · Sector: ${esc(peerLabel(scfG))}` : ""}.</div>
<div class="divider"></div>
<div class="about"><div class="lab">About Paytau</div>${esc(PITCH)}<div style="margin-top:6px;font-weight:600;color:${P.accent}">Discuss supplier early payment → paytau.app</div></div>
</div>
${c.current && pg ? `<div class="method">Compared with ${fmtInt(pg.stats.d[0])} ${pg.level === "UK" ? "eligible reporting companies" : `sector peers (${esc(peerLabel(pg))})`} with reports ending in the 12 months to ${fmtDate(data.meta.snapshot)}.<br><br>${pg.level !== "Sub-sector" && sub ? `${esc(subLabel(sub))} has fewer than ${data.meta.minPeers} reporting companies, so the wider group is used. ` : ""}${basis} Peers share an industry but may differ in size and business model.<br><br>Typical range is the middle half of peers (25th to 75th percentile). It shows where this company sits, not whether its practices are good or bad. "Payments not made within agreed terms" is the share of payments due in the reporting period that were not made within the company's agreed terms, as reported.</div>` : ""}
<div class="note">Source: UK Government payment practices reports (Open Government Licence v3.0) and Companies House. Snapshot ${fmtDate(data.meta.snapshot)}. Figures are as reported by each company and have not been audited. Peer statistics use reports ending in the 12 months to the snapshot date; groups with fewer than ${data.meta.minPeers} companies fall back to the wider sector. Paytau is not affiliated with the UK Government.</div>
<script>window.onload=function(){(document.fonts?document.fonts.ready:Promise.resolve()).then(function(){setTimeout(function(){window.print()},250)})}</script>
</body></html>`
    w.document.open()
    w.document.write(html)
    w.document.close()
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

type Stats = { d: number[]; l: number[]; w: number[]; a: number[]; scf: [number, number | null]; t?: [number, number | null] }
type Group = { name: string; level: string; parent: number; stats: Stats }
type MetricVal = { value: number | null; group: number; pos: number | null }
type Company = {
    num: string
    name: string
    key: string
    sub: number
    start: string
    end: string
    current: boolean
    status: number
    report: string
    scf: number | null
    sectorBasis: { kind: number; text: string } // 0 registered SIC, 1 Paytau review (no SIC on register), 2 evidence-backed override
    terms: { shortest: number | null; longest: number | null; state: number } // state: 0 not comparable, 1 comparable, 2 mixed terms
    spend: number | null // annual supplier spend, GBP thousands (2 x reported six-month spend); null = not usable
    metrics: Record<string, MetricVal>
}
type Data = {
    meta: { snapshot: string; minPeers: number; cpb?: { baseRate: number; baseRateDate: string } }
    groups: Group[]
    sectors: [number, number[]][]
    companies: Company[]
    byNum: Record<string, Company>
}

function prepare(raw: any): Data {
    const f: string[] = raw.fields
    const ix = (k: string) => f.indexOf(k)
    const groups = raw.groups.map(([name, level, parent, stats]) => ({ name, level, parent, stats }))
    const companies: Company[] = raw.companies.map((r: any[]) => {
        const metrics: Record<string, MetricVal> = {}
        for (const k of ["d", "l", "w", "a"]) metrics[k] = { value: r[ix(k)], group: r[ix(k + "g")], pos: r[ix(k + "p")] }
        return {
            num: r[ix("num")],
            name: r[ix("name")],
            key: normalise(r[ix("name")]),
            sub: r[ix("sub")],
            start: r[ix("start")],
            end: r[ix("end")],
            current: r[ix("current")] === 1,
            status: r[ix("status")],
            report: r[ix("report")],
            scf: r[ix("scf")],
            terms: { shortest: r[ix("ts")], longest: r[ix("tl")], state: r[ix("tok")] || 0 },
            sectorBasis: { kind: r[ix("sb")] ?? 0, text: r[ix("sic")] || "" },
            spend: r[ix("sp")] ?? null,
            metrics,
        }
    })
    const byNum: Record<string, Company> = {}
    for (const c of companies) byNum[c.num] = c
    return { meta: raw.meta, groups, sectors: raw.sectors, companies, byNum }
}

const STOP = /\b(LIMITED|LTD|PLC|LLP|THE|COMPANY|CO|GROUP|HOLDINGS|UK|U K)\b/g
function normalise(s: string) {
    return s.toUpperCase().replace(/&/g, " AND ").replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim()
}

function search(data: Data, q: string): Company[] {
    const raw = q.trim()
    if (raw.length < 2) return []
    const up = raw.toUpperCase().replace(/\s/g, "")
    if (/^(\d|SC|NI|OC|SO|BR|FC|NC|SE)\w*\d/.test(up)) {
        const hits = data.companies.filter((c) => c.num.startsWith(up) || c.num.replace(/^0+/, "").startsWith(up.replace(/^0+/, "")))
        if (hits.length) return hits.slice(0, 8)
    }
    const nq = normalise(raw)
    const tokens = nq.replace(STOP, " ").split(" ").filter(Boolean)
    if (!tokens.length) return []
    const scored: [number, Company][] = []
    for (const c of data.companies) {
        if (!tokens.every((t) => c.key.includes(t))) continue
        let score = 0
        if (c.key.startsWith(nq)) score += 100
        else if (c.key.startsWith(tokens[0])) score += 60
        else if (new RegExp(`\\b${tokens[0]}`).test(c.key)) score += 30
        if (c.current) score += 15
        score -= c.key.length / 10
        scored.push([score, c])
    }
    scored.sort((a, b) => b[0] - a[0])
    return scored.slice(0, 8).map((x) => x[1])
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const METRICS = [
    { key: "d", label: "Average time to pay", unit: "days", short: " days", max: (st) => Math.max(90, (st[3] || 0) * 1.6) },
    { key: "l", label: "Payments not made within agreed terms", unit: "%", short: "%", max: () => 100 },
    { key: "w", label: "Invoices paid within 30 days", unit: "%", short: "%", max: () => 100 },
    { key: "a", label: "Invoices paid after 60 days", unit: "%", short: "%", max: () => 100 },
]

// Sectors shown first in the overview; the rest sit behind "Show all sectors".
const FEATURED_SECTORS = ["Manufacturing", "Wholesale & distribution", "Construction"]

const STATUS_NOTE = {
    1: "This company no longer appears on the Companies House register.",
    2: "Companies House lists this company as in liquidation.",
    3: "Companies House lists this company as in administration.",
    4: "Companies House lists a proposal to strike off this company.",
    5: "Companies House lists this company as in a voluntary arrangement.",
}

// Where a company sits against its peers. "Typical range" = the middle half of peers (25th to 75th percentile).
// It is descriptive only: it says nothing about whether a result is good or bad.
const RANGE_LABEL = { below: "Below typical range", within: "Within typical range", above: "Above typical range" }

function rangeInfo(m: { key: string; short: string }, value: number, st: number[]) {
    const range: "below" | "within" | "above" = value < st[1] ? "below" : value > st[3] ? "above" : "within"
    const diff = Math.round(value) - Math.round(st[2])
    const n = Math.abs(diff)
    const unit = m.key === "d" ? (n === 1 ? "day" : "days") : n === 1 ? "percentage point" : "percentage points"
    const gap = n <= (m.key === "d" ? 1 : 2) ? "In line with the peer median" : `${n} ${unit} ${diff > 0 ? "above" : "below"} the peer median`
    return { range, label: RANGE_LABEL[range], gap: `${gap} (${fmtStat(st[2])}${m.short})`, middle: `${fmtStat(st[1])}–${fmtStat(st[3])}${m.short}` }
}

function rangePhrase(r: ReturnType<typeof rangeInfo>) {
    return r.range === "within" ? "within the typical range of its peers" : `${r.range} the typical range of its peers (${r.middle})`
}

function scfFigures(g: Group) {
    const [n, share] = g.stats.scf
    return share == null ? null : { pct: pct(share * 100), x: Math.round(share * n), y: n }
}

// "WILKIN & SONS LIMITED" -> "Wilkin & Sons Limited". Short or vowel-less words (UK, DS, KPMG) stay capitalised.
function niceName(name: string) {
    return name.replace(/[A-Za-z]+/g, (w) => (w.length <= 3 || !/[AEIOU]/i.test(w) ? w : w[0] + w.slice(1).toLowerCase()))
}

const MANUF_SUFFIX = new Set(["Food & drink", "Packaging", "Textiles & clothing", "Wood, paper & print", "Chemicals, fuels & pharma", "Plastics, rubber & building materials", "Metals & metal products", "Electronics & electrical equipment", "Machinery & industrial equipment", "Vehicles & transport equipment"])
function subLabel(g: Group) {
    return g.level === "Sub-sector" && MANUF_SUFFIX.has(g.name) ? `${g.name} manufacturing` : g.name
}

function peerLabel(g: Group) {
    if (g.level === "UK") return "eligible reporting companies"
    if (g.name === "Holding companies & head offices") return "holding companies and head offices"
    return `companies in ${subLabel(g).toLowerCase()}`
}

const reportUrl = (id: string) => (id.startsWith("http") ? id : `https://check-payment-practices.service.gov.uk/report/${id}`)
const fmtInt = (n: number) => n.toLocaleString("en-GB")
const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
const pct = (n: number) => `${Math.round(n)}%`
const fmtStat = (n: number) => String(Math.round(n))
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
function fmtDate(iso: string) {
    if (!iso) return ""
    const [y, m, d] = iso.split("-").map(Number)
    return `${d} ${MONTHS[m - 1]} ${y}`
}
function fmtMonth(iso: string) {
    const [y, m] = iso.split("-").map(Number)
    return `${MONTHS[m - 1]} ${y}`
}
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch])

function useSafeTracking() {
    let track: any = null
    try {
        track = useTracking()
    } catch {}
    return useCallback((id: string) => {
        try {
            track && track(id)
        } catch {}
    }, [track])
}

function useWidth(ref: React.RefObject<HTMLElement>) {
    const [w, setW] = useState(0)
    useEffect(() => {
        if (!ref.current || typeof ResizeObserver === "undefined") return
        const ro = new ResizeObserver(([e]) => setW(e.contentRect.width))
        ro.observe(ref.current)
        return () => ro.disconnect()
    }, [])
    return w
}

const DEFAULT_FONT = `"Inter", "Inter Placeholder", system-ui, -apple-system, sans-serif`

function palette(ink = "#13222B", accent = "#1F6A3F") {
    return {
        ink,
        accent,
        muted: "#5E6B73",
        line: "#E4E8E2",
        track: "#EEF1EC",
        bandFill: "#BFE5CD",
        soft: "#EEF7F1",
        bg: "#FFFFFF",
    }
}

function styles(C, compact: boolean): Record<string, React.CSSProperties> {
    const pad = compact ? 20 : 32
    return {
        root: { width: "100%", color: C.ink, position: "relative", WebkitFontSmoothing: "antialiased" },
        searchWrap: { position: "relative", zIndex: 5 },
        searchBox: {
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: C.bg,
            border: `1px solid ${C.line}`,
            borderRadius: 999,
            padding: compact ? "14px 18px" : "18px 24px",
            boxShadow: "0 1px 2px rgba(19,34,43,.04), 0 8px 24px rgba(19,34,43,.06)",
        },
        input: { flex: 1, border: "none", outline: "none", fontSize: compact ? 16 : 18, background: "transparent", color: C.ink, minWidth: 0 },
        clear: { border: "none", background: "transparent", fontSize: 22, color: C.muted, cursor: "pointer", lineHeight: 1 },
        dropdown: {
            position: "absolute",
            left: 0,
            right: 0,
            top: "calc(100% + 8px)",
            background: C.bg,
            border: `1px solid ${C.line}`,
            borderRadius: 16,
            boxShadow: "0 16px 40px rgba(19,34,43,.12)",
            padding: 6,
            maxHeight: 420,
            overflowY: "auto",
        },
        option: { padding: "10px 14px", borderRadius: 10, cursor: "pointer" },
        optName: { fontWeight: 500, fontSize: 15 },
        optMeta: { fontSize: 13, color: C.muted, marginTop: 2, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" },
        optTag: { fontSize: 11, padding: "1px 8px", borderRadius: 999, background: C.track, color: C.muted },
        noResult: { padding: 16, fontSize: 14, color: C.muted },
        card: {
            background: C.bg,
            border: `1px solid ${C.line}`,
            borderRadius: 20,
            padding: pad,
            marginTop: 20,
            boxShadow: "0 1px 2px rgba(19,34,43,.04)",
        },
        cardHead: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexDirection: compact ? "column" : "row" },
        h2: { fontSize: compact ? 22 : 28, lineHeight: 1.15, letterSpacing: "-0.02em", fontWeight: 600, margin: 0 },
        lead: { color: C.muted, fontSize: 15, lineHeight: 1.55, margin: "10px 0 18px", maxWidth: 720 },
        metaRow: { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", color: C.muted, fontSize: 14, marginTop: 8 },
        chip: { background: C.soft, color: C.accent, borderRadius: 999, padding: "3px 10px", fontSize: 13, fontWeight: 500 },
        link: { color: C.accent, textDecoration: "none", fontWeight: 500 },
        ghostBtn: {
            border: `1px solid ${C.line}`,
            background: C.bg,
            borderRadius: 999,
            padding: "8px 14px",
            fontSize: 14,
            color: C.ink,
            cursor: "pointer",
            whiteSpace: "nowrap",
            fontFamily: "inherit",
        },
        notice: { background: "#F6F4EC", border: "1px solid #ECE6D3", color: "#5A5236", borderRadius: 12, padding: "12px 14px", fontSize: 14, marginTop: 16 },
        grid: { display: "grid", gridTemplateColumns: compact ? "1fr" : "1fr 1fr", gap: compact ? 12 : 16, marginTop: 24 },
        tile: { border: `1px solid ${C.line}`, borderRadius: 16, padding: compact ? 18 : 22 },
        label: { fontSize: 14, color: C.muted },
        value: { fontSize: compact ? 30 : 36, fontWeight: 600, letterSpacing: "-0.02em", marginTop: 6, lineHeight: 1.1 },
        unit: { fontSize: 16, fontWeight: 500, color: C.muted, marginLeft: 6, letterSpacing: 0 },
        band: { fontSize: 14, fontWeight: 600 },
        caption: { fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 1.45 },
        scfRow: {
            display: "grid",
            gridTemplateColumns: compact ? "1fr" : "1fr 1fr",
            gap: compact ? 12 : 16,
            marginTop: compact ? 12 : 16,
            border: `1px solid ${C.line}`,
            borderRadius: 16,
            padding: compact ? 18 : 22,
            alignItems: "center",
        },
        termsValue: { fontSize: 20, fontWeight: 600, marginTop: 6, letterSpacing: "-0.01em" },
        scfCard: { border: `1px solid ${C.line}`, borderRadius: 16, padding: compact ? 18 : 22, marginTop: compact ? 12 : 16 },
        scfLine: { display: "flex", gap: 12, alignItems: "baseline", marginTop: 10 },
        scfKey: { fontSize: 14, color: C.muted, width: compact ? 64 : 72, flexShrink: 0 },
        scfMeta: { fontSize: 14, color: C.muted },
        scfDivider: { height: 1, background: C.line, margin: compact ? "16px 0" : "18px 0" },
        scfValue: { fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" },
        pitch: { background: C.soft, borderRadius: 12, padding: 16 },
        pitchText: { fontSize: 14, lineHeight: 1.5 },
        pitchLink: { display: "inline-block", marginTop: 8, color: C.accent, fontWeight: 600, fontSize: 14, textDecoration: "none" },
        peerNote: { fontSize: 13, color: C.muted, marginTop: 16, lineHeight: 1.5 },
        actions: { display: "flex", flexWrap: "wrap", gap: 10, marginTop: 22 },
        primaryBtn: {
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            background: C.ink,
            color: "#fff",
            border: "none",
            borderRadius: 999,
            padding: "13px 22px",
            fontSize: 15,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "inherit",
        },
        secondaryBtn: {
            background: C.bg,
            color: C.ink,
            border: `1px solid ${C.line}`,
            borderRadius: 999,
            padding: "12px 20px",
            fontSize: 15,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "inherit",
        },
        insight: { background: C.soft, borderRadius: 12, padding: "12px 16px", fontSize: 15, lineHeight: 1.5, margin: "0 0 18px", color: C.ink },
        summary: { background: C.soft, borderRadius: 12, padding: "14px 18px", fontSize: compact ? 15 : 16, lineHeight: 1.55, margin: "20px 0 0", color: C.ink },
        showAll: {
            marginTop: 12,
            border: `1px solid ${C.line}`,
            background: C.bg,
            borderRadius: 999,
            padding: "10px 18px",
            fontSize: 14,
            fontWeight: 500,
            color: C.ink,
            cursor: "pointer",
            fontFamily: "inherit",
        },
        investigate: { border: `1px solid ${C.line}`, borderRadius: 16, padding: compact ? 18 : 22, marginTop: compact ? 12 : 16 },
        cpbCard: { border: `1px solid ${C.line}`, borderRadius: 16, padding: compact ? 18 : 22, marginTop: compact ? 12 : 16 },
        cpbHead: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 },
        pill: { background: C.track, color: C.muted, borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" },
        pillWarm: { background: "#F6F4EC", color: "#5A5236", border: "1px solid #ECE6D3", borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" },
        cpbFigure: { fontSize: compact ? 34 : 44, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.1, marginTop: 6 },
        cpbPer: { fontSize: compact ? 16 : 18, fontWeight: 500, color: C.muted, letterSpacing: 0 },
        cpbStats: { display: "grid", gridTemplateColumns: compact ? "1fr" : "repeat(3, 1fr)", gap: 10, marginTop: 16 },
        cpbStat: { background: C.soft, borderRadius: 12, padding: "12px 14px" },
        cpbStatValue: { fontSize: 20, fontWeight: 600, letterSpacing: "-0.01em", lineHeight: 1.2 },
        cpbStatLabel: { fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 1.35 },
        cpbNote: { fontSize: 13, color: C.ink, lineHeight: 1.5, marginTop: 12, paddingLeft: 12, borderLeft: `3px solid ${C.bandFill}` },
        cpbStatus: { display: "flex", gap: 10, alignItems: compact ? "flex-start" : "center", flexDirection: compact ? "column" : "row", marginTop: 14 },
        qItem: { marginTop: 12, paddingLeft: 14, borderLeft: `2px solid ${C.bandFill}` },
        qPattern: { fontSize: 14, color: C.muted, lineHeight: 1.5 },
        qQuestion: { fontSize: 16, fontWeight: 600, lineHeight: 1.45, marginTop: 4, color: C.ink },
        linkBtn: { background: "transparent", border: "none", padding: 0, marginTop: 8, color: C.accent, fontWeight: 600, fontSize: 14, cursor: "pointer", fontFamily: "inherit" },
        peerWrap: { border: `1px solid ${C.line}`, borderRadius: 16, padding: compact ? 12 : 16, marginTop: 12 },
        peerTools: { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
        check: { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 14, cursor: "pointer" },
        peerFilter: { border: `1px solid ${C.line}`, borderRadius: 999, padding: "8px 14px", fontSize: 14, minWidth: 180, outline: "none", fontFamily: "inherit" },
        peerScroll: { maxHeight: 420, overflowY: "auto", overflowX: "hidden" },
        basis: { fontSize: 12, color: C.muted, marginTop: 6, lineHeight: 1.5, maxWidth: 720 },
        textBtn: { background: "transparent", color: C.muted, border: "none", padding: "12px 10px", fontSize: 14, cursor: "pointer", textDecoration: "underline", fontFamily: "inherit" },
        legend: { display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13, color: C.muted, marginBottom: 14 },
        legendItem: { display: "inline-flex", alignItems: "center", gap: 6 },
        legendSwatch: { width: 18, height: 6, borderRadius: 3, display: "inline-block" },
        ovRow: {
            display: "grid",
            gridTemplateColumns: compact ? "1fr 64px" : "minmax(180px, 280px) 1fr 72px",
            gridTemplateAreas: compact ? '"name val" "strip strip"' : undefined,
            columnGap: 16,
            rowGap: 6,
            alignItems: "center",
            padding: "10px 0",
            borderRadius: 8,
        },
        ovName: { fontSize: 15, display: "flex", alignItems: "center", gap: 6, gridArea: compact ? "name" : undefined },
        ovStrip: { gridArea: compact ? "strip" : undefined },
        ovVal: { fontSize: 14, fontWeight: 600, textAlign: "right", whiteSpace: "nowrap", gridArea: compact ? "val" : undefined },
        ovThin: { fontSize: 13, color: C.muted, gridColumn: compact ? "1 / -1" : "2 / 4" },
        chev: { display: "inline-block", width: 10, color: C.muted, transition: "transform .15s" },
        footer: { fontSize: 12, color: C.muted, lineHeight: 1.6, marginTop: 20, maxWidth: 820 },
        footLink: { color: C.ink, textDecoration: "underline" },
        toast: {
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            background: C.ink,
            color: "#fff",
            padding: "10px 18px",
            borderRadius: 999,
            fontSize: 14,
            zIndex: 50,
        },
    }
}

function SearchIcon({ color }) {
    return (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
        </svg>
    )
}

function DownloadIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        </svg>
    )
}

// ---------------------------------------------------------------------------
// Framer property controls
// ---------------------------------------------------------------------------

type Props = {
    dataUrl: string
    contactLink: string
    methodologyLink: string
    correctionEmail: string
    font: any
    headingFont: any
    ink: string
    accent: string
}

PaymentBenchmark.defaultProps = {
    dataUrl: "",
    contactLink: "",
    methodologyLink: "",
    correctionEmail: "",
    ink: "#13222B",
    accent: "#1F6A3F",
}

addPropertyControls(PaymentBenchmark, {
    dataUrl: { type: ControlType.String, title: "Data URL", placeholder: "https://…/paytau-benchmark.json" },
    contactLink: { type: ControlType.Link, title: "Contact link" },
    methodologyLink: { type: ControlType.Link, title: "Methodology" },
    correctionEmail: { type: ControlType.String, title: "Correction email", placeholder: "hello@paytau.app" },
    font: { type: ControlType.Font, title: "Body font", controls: "basic" },
    headingFont: { type: ControlType.Font, title: "Heading font", controls: "basic" },
    ink: { type: ControlType.Color, title: "Ink", defaultValue: "#13222B" },
    accent: { type: ControlType.Color, title: "Accent", defaultValue: "#1F6A3F" },
})
