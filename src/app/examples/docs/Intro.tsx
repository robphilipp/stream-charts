import type {Theme} from "../../ui/Themes.ts";
import {type ComponentProps, type CSSProperties, type JSX, useLayoutEffect, useMemo, useRef, useState} from "react";
import {getRouteApi, useElementScrollRestoration, useNavigate} from "@tanstack/react-router";
import {Button} from "../../ui/Button.tsx"
import intro_page from "./intro.md?raw"
import some_context_page from "./some-context.md?raw"
import contents_page from "./contents.md?raw";
import anatomy_of_example_page from "./anatomy-of-example.md?raw";
import common_controls_page from "./common-controls.md?raw";
import scatter_chart_page from "./scatter-chart.md?raw";
import raster_chart_page from "./raster-chart.md?raw";
import poincare_chart_page from "./poincare-chart.md?raw";
import bar_chart_page from "./bar-chart.md?raw";
import outlier_chart_page from "./outlier-chart.md?raw";
import legends_page from "./legends.md?raw";
import tooltips_and_trackers_page from "./tooltips-and-trackers.md?raw";
import where_the_code_lives_page from "./where-the-code-lives.md?raw";
import how_the_data_flows_page from "./how-the-data-flows.md?raw";
import ReactMarkdown, {type Components, type ExtraProps} from "react-markdown";
import rehypeRaw from 'rehype-raw';
import {buttonStyle, interpolateColor} from "../../ui/utils.ts";
import {useGridCell} from "react-resizable-grid-layout";
import {FloatingBar} from "../../ui/FloatingBar.tsx";
import {
    BackIcon,
    FirstIcon,
    ForwardIcon,
    LastIcon,
    TableOfContentsCollapseIcon,
    TableOfContentsExpandIcon
} from "../../ui/Icons.tsx";
import remarkGfm from "remark-gfm";
import {useThemeStore} from "../appstate/themeStore.ts";

const pages = [
    intro_page,
    some_context_page,
    contents_page,
    anatomy_of_example_page,
    common_controls_page,
    scatter_chart_page,
    raster_chart_page,
    poincare_chart_page,
    bar_chart_page,
    outlier_chart_page,
    legends_page,
    tooltips_and_trackers_page,
    where_the_code_lives_page,
    how_the_data_flows_page,
]

/**
 * The page's title: the text of its first heading (e.g. "what is stream-charts?")
 * @param page The page's markdown
 * @param pageNum The page's index (for the fallback title, when the page has no heading)
 * @return The page's title
 */
function titleOf(page: string, pageNum: number): string {
    const heading = page.match(/^#{1,6}\s+(.+?)\s*$/m)
    return heading !== null ? heading[1] : `page ${pageNum + 1}`
}

// the table of contents: each page's entry, numbered and labelled with the page's title
const TABLE_OF_CONTENTS: Array<string> = pages.map((page, pageNum) => `${pageNum + 1}. ${titleOf(page, pageNum)}`)

// the ID of the table of contents (which the button that opens and closes it controls)
const TABLE_OF_CONTENTS_ID = "intro-table-of-contents"

// the font size of the pages' text
const INTRO_FONT_SIZE = 15

/**
 * The style of the (scrollable) page content: the theme's colors, a readable width, and at most
 * the grid cell's height
 * @param theme The theme
 * @param height The height (px) of the grid cell the content is in
 * @return The page content's style
 */
function style(theme: Theme, height: number): CSSProperties {
    return {
        backgroundColor: theme.backgroundColor,
        color: theme.color,
        width: 'auto',
        paddingRight: 140,
        paddingLeft: 40,
        maxWidth: 750,
        maxHeight: height,
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarWidth: "thin",
        // scrollbarColor: `${theme.color} ${theme.backgroundColor}`,
        scrollbarColor: `${interpolateColor(theme.color as string, theme.backgroundColor as string, 0.5)} ${theme.backgroundColor}`,
        fontSize: INTRO_FONT_SIZE,
        fontWeight: 400,
    }
}

// id used by the router's scroll-restoration watcher to save/restore the scroll position of
// the (inner) scrollable intro content div
const SCROLL_RESTORATION_ID = "intro-content"

const introRouteApi = getRouteApi("/intro")

/**
 * The intro pages (the markdown files in this directory, rendered in order), one at a time, with
 * a floating navigation bar for moving between them, and a table of contents. The current page
 * comes from the URL's `?page=N` search parameter, so the browser's back and forward buttons move
 * between pages.
 * @return The intro pages
 */
export default function Intro() {
    const {theme} = useThemeStore()
    const numPages = pages.length

    // the current intro page comes from the ?page=N search param, so browser back/forward
    // moves between intro pages; clamp to a valid page in case of a hand-edited URL
    const {page} = introRouteApi.useSearch()
    const pageNum = Math.min(Math.max(0, page), numPages - 1)
    const navigate = useNavigate()

    const {height} = useGridCell()
    const cssStyle = style(theme, height)

    // restore the scroll position within the content div when returning to this page/URL. The
    // router caches scroll per key (path + search), so each intro page keeps its own position.
    const scrollRef = useRef<HTMLDivElement>(null)
    const scrollEntry = useElementScrollRestoration({id: SCROLL_RESTORATION_ID})
    useLayoutEffect(
        () => {
            if (scrollRef.current) {
                scrollRef.current.scrollTop = scrollEntry?.scrollY ?? 0
            }
        },
        [pageNum, scrollEntry]
    )

    // whether the table of contents (which expands below the navigation bar's buttons) is open
    const [tableOfContentsOpen, setTableOfContentsOpen] = useState<boolean>(false)

    // the page, parsed from its markdown. Only re-parsed when the page changes: the markdown's
    // components follow theme changes by themselves (see `MARKDOWN_COMPONENTS`), so nothing else
    // that re-renders the intro (e.g. opening the table of contents) needs to re-parse it.
    const pageContent = useMemo(
        () => (
            <ReactMarkdown
                components={MARKDOWN_COMPONENTS}
                rehypePlugins={REHYPE_PLUGINS}
                remarkPlugins={REMARK_PLUGINS}
            >
                {pages[pageNum]}
            </ReactMarkdown>
        ),
        [pageNum]
    )

    function updatePageNum(nextPage: number): void {
        navigate({to: "/intro", search: {page: Math.min(Math.max(0, nextPage), numPages - 1)}})
    }

    return (
        <div ref={scrollRef} data-scroll-restoration-id={SCROLL_RESTORATION_ID} style={cssStyle}>
            {pageContent}

            <FloatingBar
                style={{...theme}}
                location={{offsetFrom: "top", offset: 120}}
                panel={
                    <TableOfContents
                        theme={theme}
                        pageNum={pageNum}
                        onSelectPage={page => {
                            setTableOfContentsOpen(false)
                            updatePageNum(page)
                        }}
                    />
                }
                panelExpanded={tableOfContentsOpen}
                onPanelCollapse={() => setTableOfContentsOpen(false)}
            >
                <Navigation
                    theme={theme}
                    pageNum={pageNum}
                    numPages={numPages}
                    updatePageNum={updatePageNum}
                    tableOfContentsOpen={tableOfContentsOpen}
                    onTableOfContentsToggle={() => setTableOfContentsOpen(open => !open)}
                />
            </FloatingBar>
        </div>
    )
}


type NavigationProps = {
    theme: Theme,
    pageNum: number,
    numPages: number,
    updatePageNum: (pageNum: number) => void
    tableOfContentsOpen: boolean
    onTableOfContentsToggle: () => void
}

/**
 * The intro pages' navigation: the button that opens and closes the table of contents, and the
 * buttons that move to the first, previous, next, and last page
 * @param props The theme, the current page's index, the number of pages, the handler for moving
 * to a page, whether the table of contents is open, and the handler for opening or closing it
 * @return The navigation buttons
 */
function Navigation(props: NavigationProps): JSX.Element {

    const {theme, pageNum, numPages, updatePageNum, tableOfContentsOpen, onTableOfContentsToggle} = props
    const style = {...buttonStyle(theme), marginLeft: 3, marginRight: 3, marginTop: 6, marginBottom: 6}

    return (
        <>
            {/* opens and closes the table of contents (its icon shows which a click will do) */}
            <Button
                style={style}
                onClick={onTableOfContentsToggle}
                icon={color => tableOfContentsOpen ?
                    <TableOfContentsCollapseIcon color={color}/> :
                    <TableOfContentsExpandIcon color={color}/>
                }
                ariaLabel={tableOfContentsOpen ? "Close the table of contents" : "Open the table of contents"}
                ariaExpanded={tableOfContentsOpen}
                ariaControls={TABLE_OF_CONTENTS_ID}
            >
                {""}
            </Button>
            <Button
                style={style}
                onClick={() => updatePageNum(0)} disabled={pageNum === 0 || numPages <= 1}
                icon={color => <FirstIcon color={color}/>}
            >
                First
            </Button>
            <Button
                style={style}
                onClick={() => updatePageNum(pageNum - 1)} disabled={pageNum === 0}
                icon={color => <BackIcon color={color}/>}
            >
                Previous
            </Button>
            <Button
                style={style}
                onClick={() => updatePageNum(pageNum + 1)} disabled={pageNum >= numPages - 1}
                icon={color => <ForwardIcon color={color}/>}
            >
                Next
            </Button>
            <Button
                style={style}
                onClick={() => updatePageNum(numPages - 1)} disabled={pageNum >= numPages - 1 || numPages <= 1}
                icon={color => <LastIcon color={color}/>}
            >
                Last
            </Button>
        </>
    )
}

type TableOfContentsProps = {
    theme: Theme
    pageNum: number
    onSelectPage: (pageNum: number) => void
}

/**
 * The table of contents: a list of the pages (numbered and titled), with the current page marked.
 * Selecting a page goes to it. Shown in the navigation bar's expandable panel.
 * @param props The properties
 * @return The table of contents
 */
function TableOfContents(props: TableOfContentsProps): JSX.Element {
    const {theme, pageNum, onSelectPage} = props
    const [hoveredPage, setHoveredPage] = useState<number | undefined>(undefined)

    return (
        <nav id={TABLE_OF_CONTENTS_ID} aria-label="Table of contents">
            <ol style={{
                listStyle: 'none',
                margin: 0,
                padding: '4px 0 2px',
                // (scrolls when the pages don't fit on the screen)
                maxHeight: '60vh',
                overflowY: 'auto',
                scrollbarWidth: 'thin',
            }}>
                {TABLE_OF_CONTENTS.map((title, page) => {
                    const isCurrent = page === pageNum
                    return (
                        <li key={page}>
                            <button
                                onClick={() => onSelectPage(page)}
                                onMouseEnter={() => setHoveredPage(page)}
                                onMouseLeave={() => setHoveredPage(undefined)}
                                aria-current={isCurrent ? 'page' : undefined}
                                title={title}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    width: '100%',
                                    padding: '4px 8px',
                                    border: 'none',
                                    borderRadius: 6,
                                    backgroundColor: hoveredPage === page ?
                                        interpolateColor(theme.backgroundColor, theme.color, 12) :
                                        'transparent',
                                    color: theme.color,
                                    font: 'inherit',
                                    fontSize: 13,
                                    fontWeight: isCurrent ? 600 : 'normal',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                }}
                            >
                                {/* marks the current page (keeps every title aligned) */}
                                <span aria-hidden="true" style={{width: 10, flexShrink: 0, textAlign: 'center'}}>
                                    {isCurrent ? '✓' : ''}
                                </span>
                                <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
                                    {title}
                                </span>
                            </button>
                        </li>
                    )
                })}
            </ol>
        </nav>
    )
}

/*
    The markdown's custom components. They're defined once, here, rather than inline in the
    `<ReactMarkdown>` (e.g. `img: image => CustomImage(image, theme)`): React tells components apart
    by their function, so an inline arrow -- a new function on every render -- is a *different*
    component on every render, and every re-render of the intro (e.g. opening the table of contents)
    would throw away every link, figure, and image on the page and create them again. A re-created
    image is briefly empty while it reloads, which made the text below it jump up and back. Each
    component reads the theme from the theme store itself, so it still follows theme changes.
 */

const hoverLinkStyle: CSSProperties = {textDecoration: 'underline', textDecorationStyle: 'solid'}
const linkStyle: CSSProperties = {textDecoration: 'underline', textDecorationStyle: 'dashed'}

/**
 * A link, which opens in a new tab, and whose underline goes from dashed to solid while hovered
 * @param props The link's properties (from the markdown)
 * @return The link
 */
function MarkdownLink(props: ComponentProps<'a'> & ExtraProps): JSX.Element {
    const {href, style, children} = props
    const {theme} = useThemeStore()
    const [hovered, setHovered] = useState<boolean>(false)
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onMouseOver={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{...style, color: theme.color, ...(hovered ? hoverLinkStyle : linkStyle)}}
        >
            {children}
        </a>
    )
}

/**
 * A figure, as wide as the page's content
 * @param props The figure's properties (from the markdown)
 * @return The figure
 */
function MarkdownFigure(props: ComponentProps<'figure'> & ExtraProps): JSX.Element {
    const {style, children} = props
    return <figure style={{...style, paddingLeft: 0, marginLeft: 0, width: "100%"}}>{children}</figure>
}

/**
 * A figure's caption, in a slightly smaller font than the page's text
 * @param props The caption's properties (from the markdown)
 * @return The caption
 */
function MarkdownFigureCaption(props: ComponentProps<'figcaption'> & ExtraProps): JSX.Element {
    const {style, children} = props
    const {theme} = useThemeStore()
    return <figcaption style={{...style, color: theme.color, fontSize: INTRO_FONT_SIZE - 2}}>{children}</figcaption>
}

/**
 * The theme's version of an image's file: e.g. "./images/navigation-bar-dark.png" for the image
 * "./images/navigation-bar.png" and the theme "dark"
 * @param src The image's file
 * @param themeName The theme's name
 * @return The theme's version of the image's file, or `undefined` when the file name has no
 * extension to put the theme's name in front of
 */
function themedSourceFor(src: string, themeName: string): string | undefined {
    // (the extension is looked for in the file's name only, so that a dot in a directory's name
    // isn't mistaken for it)
    const fileNameStart = src.lastIndexOf("/") + 1
    const extensionIndex = src.lastIndexOf(".")
    if (extensionIndex <= fileNameStart) return undefined
    return `${src.slice(0, extensionIndex)}-${themeName}${src.slice(extensionIndex)}`
}

/**
 * An image that shows the theme's version of itself when there is one. For example, for the image
 * "navigation-bar.png" and the theme "dark", shows "navigation-bar-dark.png", falling back to
 * "navigation-bar.png" when that doesn't exist (so the image itself need only exist when some
 * theme has no version of its own).
 * @param props The image's properties (from the markdown)
 * @return The image
 */
function MarkdownImage(props: ComponentProps<'img'> & ExtraProps): JSX.Element {
    const {src, alt, width, height, style} = props
    const {theme} = useThemeStore()
    const themedSrc = typeof src === 'string' ? themedSourceFor(src, theme.name) : undefined
    // the theme's version of the image that turned out not to exist. Remembering *which* file
    // failed (rather than just that one did) means a missing file isn't requested again, while
    // switching themes still tries the new theme's version.
    const [failedSrc, setFailedSrc] = useState<string | undefined>(undefined)
    const showThemed = themedSrc !== undefined && themedSrc !== failedSrc
    return (
        <img
            src={showThemed ? themedSrc : src}
            alt={alt}
            onError={showThemed ? () => setFailedSrc(themedSrc) : undefined}
            width={width}
            height={height}
            style={{...style, maxWidth: "100%", height: "auto", borderRadius: 10}}
        />
    )
}

/**
 * A video, with its controls, as wide as the page's content
 * @param props The video's properties (from the markdown)
 * @return The video
 */
function MarkdownVideo(props: ComponentProps<'video'> & ExtraProps): JSX.Element {
    const {controls, style, children} = props
    return <video controls={controls} width="100%" style={{...style, width: "100%"}}>{children}</video>
}

const MARKDOWN_COMPONENTS: Components = {
    a: MarkdownLink,
    figure: MarkdownFigure,
    figcaption: MarkdownFigureCaption,
    img: MarkdownImage,
    video: MarkdownVideo,
}
const REHYPE_PLUGINS = [rehypeRaw]
const REMARK_PLUGINS = [remarkGfm]
