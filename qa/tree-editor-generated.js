import {treeMarkup,readEditorTree,normalizeTrees,treePlainText,TREE_ATTRIBUTES} from '/app/editor-trees.tsx';
import {tableMarkup,readEditorTable,normalizeTables,tablePlainText} from '/app/editor-tables.tsx';
import DOMPurify from '/node_modules/dompurify/dist/purify.es.mjs';
import {editorMediaUrl,mediaMarkup} from '/app/editor-inserts.tsx';
import {layoutFrames,normalizeLayoutDom,layoutContentBlocks} from '/app/editor-layouts.tsx';
import {todoState,setTodoState} from '/app/editor-todos.ts';
const MAX_LIST_INDENT = 12;
const DETAIL_ALLOWED_TAGS = ['p', 'div', 'br', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'code', 'mark', 'sub', 'sup', 'a', 'span', 'details', 'summary', 'hr', 'figure', 'img', 'video', 'iframe', 'table', 'tbody', 'thead', 'tr', 'td', 'th'];
const DETAIL_ALLOWED_ATTR = ['data-editor-autolink', 'href', 'start', 'value', 'class', 'style', 'data-list', 'data-list-extra-indent', 'data-list-number', 'data-editor-compact', 'data-editor-todo', 'data-editor-media', 'data-editor-width', 'data-photo-controls', 'data-editor-toggle', 'data-editor-callout', 'data-editor-columns', 'data-editor-column', 'data-layout-id', 'data-editor-table', 'data-table-header', 'src', 'alt', 'title', ...TREE_ATTRIBUTES];
const SAFE_QUILL_CLASS = /^ql-(?:align-(?:center|right|justify)|direction-rtl|font-(?:serif|monospace)|size-(?:small|large|huge)|indent-(?:[1-9]|1[0-2]))$/;
const LIST_SPACING_CLASS = /^editor-indent-(?:start|end)$/;
function safeLegacyStyle(element) { const styles = []; const validColor = (value) => /^(?:#[\da-f]{3,8}|rgba?\([\d\s.,%+-]+\)|hsla?\([\d\s.,%+-]+\)|[a-z]+)$/i.test(value) && !/^(?:inherit|initial|unset|revert)$/i.test(value); const color = element.style.color.trim(); if (color && validColor(color))
    styles.push(`color:${color}`); const background = element.style.backgroundColor.trim(); if (background && validColor(background))
    styles.push(`background-color:${background}`); const size = element.style.fontSize.trim(); if (size && /^(?:\d+(?:\.\d+)?(?:px|em|rem|%)|small|large|smaller|larger)$/i.test(size)) {
    const numeric = Number.parseFloat(size);
    if (!Number.isFinite(numeric) || numeric <= 300)
        styles.push(`font-size:${size}`);
} const family = element.style.fontFamily.trim().replace(/["']/g, '').toLowerCase(); if (['serif', 'monospace', 'sans-serif'].includes(family))
    styles.push(`font-family:${family}`); const align = element.style.textAlign.trim().toLowerCase(); if (['left', 'center', 'right', 'justify'].includes(align))
    styles.push(`text-align:${align}`); const direction = element.style.direction.trim().toLowerCase(); if (['ltr', 'rtl'].includes(direction))
    styles.push(`direction:${direction}`); const margin = element.style.marginInlineStart.trim(); if (/^\d+(?:\.\d+)?em$/i.test(margin) && Number.parseFloat(margin) <= 25)
    styles.push(`margin-inline-start:${margin}`); return styles.join(';'); }
const safeHtmlCache = new Map();
let safeHtmlCacheBytes = 0;
function safeHtml(html) {
    if (typeof window === 'undefined' || !DOMPurify.isSupported)
        return '';
    const cached = safeHtmlCache.get(html);
    if (cached !== undefined) {
        safeHtmlCache.delete(html);
        safeHtmlCache.set(html, cached);
        return cached;
    }
    const sanitized = String(DOMPurify.sanitize(html, { ALLOWED_TAGS: DETAIL_ALLOWED_TAGS, ALLOWED_ATTR: DETAIL_ALLOWED_ATTR, ALLOW_ARIA_ATTR: false, ALLOW_DATA_ATTR: false, ALLOW_UNKNOWN_PROTOCOLS: false, RETURN_TRUSTED_TYPE: false }));
    const doc = new DOMParser().parseFromString(sanitized, 'text/html');
    normalizeLayoutDom(doc);
    doc.body.querySelectorAll('[data-photo-controls]').forEach(element => element.remove());
    doc.body.querySelectorAll('.ql-ui').forEach(element => element.remove());
    doc.body.querySelectorAll('*').forEach(element => { const tag = element.tagName; if (tag !== 'P')
        element.removeAttribute('data-editor-todo');
    else if (element.hasAttribute('data-editor-todo'))
        setTodoState(element, todoState(element)); if (tag !== 'A')
        element.removeAttribute('href'); if (tag !== 'A' || element.getAttribute('data-editor-autolink') !== 'true')
        element.removeAttribute('data-editor-autolink'); if (tag !== 'OL')
        element.removeAttribute('start'); if (tag !== 'LI') {
        element.removeAttribute('value');
        element.removeAttribute('data-list');
        if (todoState(element) === undefined)
            element.removeAttribute('data-list-extra-indent');
        element.removeAttribute('data-list-number');
    } if (!['P', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'SUMMARY'].includes(tag))
        element.removeAttribute('data-editor-compact'); if (tag !== 'FIGURE')
        element.removeAttribute('data-editor-media'); if (tag !== 'DETAILS')
        element.removeAttribute('data-editor-toggle'); if (!['IMG', 'VIDEO', 'IFRAME'].includes(tag))
        element.removeAttribute('src'); if (tag !== 'IMG')
        element.removeAttribute('alt'); if (tag !== 'IFRAME')
        element.removeAttribute('title'); const style = safeLegacyStyle(element); if (style)
        element.setAttribute('style', style);
    else
        element.removeAttribute('style'); });
    doc.body.querySelectorAll('figure').forEach(figure => { const media = readEditorMedia(figure); if (!media) {
        figure.remove();
        return;
    } const canonical = new DOMParser().parseFromString(mediaMarkup(media), 'text/html').body.firstElementChild; if (canonical)
        figure.replaceWith(doc.importNode(canonical, true)); });
    doc.body.querySelectorAll('img,video,iframe').forEach(node => { if (!node.closest('figure[data-editor-media]'))
        node.remove(); });
    doc.body.querySelectorAll('hr').forEach(node => { Array.from(node.attributes).forEach(attr => node.removeAttribute(attr.name)); node.setAttribute('contenteditable', 'false'); });
    const toggleIds = new Set();
    doc.body.querySelectorAll('details').forEach((node, index) => { const id = node.getAttribute('data-editor-toggle') || ''; let unique = /^[a-zA-Z0-9_-]{1,80}$/.test(id) ? id : `toggle-${index + 1}`; while (toggleIds.has(unique))
        unique += 'x'; toggleIds.add(unique); node.setAttribute('data-editor-toggle', unique); node.setAttribute('open', ''); });
    doc.body.querySelectorAll('a').forEach(anchor => { const href = normalizeEditorLink(anchor.getAttribute('href') || ''); if (!href) {
        unwrapDomNode(anchor);
        return;
    } anchor.setAttribute('href', href); anchor.setAttribute('target', '_blank'); anchor.setAttribute('rel', 'noopener noreferrer'); });
    doc.body.querySelectorAll('ol').forEach(list => { const start = Number.parseInt(list.getAttribute('start') || '', 10); if (Number.isFinite(start) && start > 0 && start <= 100_000)
        list.setAttribute('start', String(start));
    else
        list.removeAttribute('start'); });
    doc.body.querySelectorAll('[class]').forEach(element => { const classes = Array.from(element.classList).filter(name => SAFE_QUILL_CLASS.test(name) || (element.tagName === 'LI' && LIST_SPACING_CLASS.test(name))); if (classes.length)
        element.setAttribute('class', Array.from(new Set(classes)).join(' '));
    else
        element.removeAttribute('class'); });
    doc.body.querySelectorAll('li').forEach(item => { const value = Number.parseInt(item.getAttribute('value') || '', 10); if (Number.isFinite(value) && value > 0 && value <= 100_000)
        item.setAttribute('value', String(value));
    else
        item.removeAttribute('value'); const kind = (item.getAttribute('data-list') || '').toLowerCase(); if (kind === 'bullet' || kind === 'ordered')
        item.setAttribute('data-list', kind);
    else
        item.removeAttribute('data-list'); const indent = Number.parseInt(item.getAttribute('data-list-extra-indent') || '', 10); if (Number.isFinite(indent) && indent > 0)
        item.setAttribute('data-list-extra-indent', String(Math.min(MAX_LIST_INDENT, Math.floor(indent))));
    else
        item.removeAttribute('data-list-extra-indent'); const label = item.getAttribute('data-list-number') || ''; if (!/^[1-9]\d{0,5}(?:\.[1-9]\d{0,5}){0,12}$/.test(label))
        item.removeAttribute('data-list-number'); });
    doc.body.querySelectorAll('p').forEach(paragraph => { if (paragraph.getAttribute('data-editor-compact') !== 'true')
        paragraph.removeAttribute('data-editor-compact'); });
    doc.body.querySelectorAll('span').forEach(span => { if (!span.attributes.length)
        unwrapDomNode(span); });
    normalizeTables(doc.body);
    normalizeTrees(doc.body);
    const result = doc.body.innerHTML;
    if (html.length < 20_000) {
        safeHtmlCache.set(html, result);
        safeHtmlCacheBytes += html.length + result.length;
        while (safeHtmlCache.size > 1024 || safeHtmlCacheBytes > 2_000_000) {
            const key = safeHtmlCache.keys().next().value;
            if (key === undefined)
                break;
            safeHtmlCacheBytes -= key.length + (safeHtmlCache.get(key)?.length || 0);
            safeHtmlCache.delete(key);
        }
    }
    return result;
}
function appendDomNode(parent, child) { parent.appendChild(child); }
function replaceDomNode(target, replacement) { const parent = target.parentNode; if (!parent)
    return; const next = typeof replacement === 'string' ? (target.ownerDocument ?? document).createTextNode(replacement) : replacement; parent.replaceChild(next, target); }
function unwrapDomNode(target) { const parent = target.parentNode; if (!parent)
    return; while (target.firstChild)
    parent.insertBefore(target.firstChild, target); parent.removeChild(target); }
const EDITOR_MARK_TAGS = new Set(['strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del', 'code', 'mark', 'sub', 'sup']);
const UNORDERED_PREFIX = '• ';
function escapeHtml(value) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function listExtraIndent(item, structuralDepth = 0) { const stored = Number.parseInt(item.getAttribute('data-list-extra-indent') || '', 10); if (Number.isFinite(stored))
    return Math.min(MAX_LIST_INDENT, Math.max(0, stored)); const legacy = Array.from(item.classList).map(name => /^ql-indent-(\d+)$/.exec(name)?.[1]).find(Boolean); return legacy ? Math.min(MAX_LIST_INDENT, Math.max(0, Number.parseInt(legacy, 10) - structuralDepth)) : 0; }
function listIndentEm(depth) { return Number((Math.max(0, depth) * 1.7).toFixed(2)); }
function normalizeEditorLink(value) { const link = value.trim(); if (!link)
    return ''; if (/^(https?:|mailto:|tel:)/i.test(link) || link.startsWith('#'))
    return link; if (/^[a-z][a-z\d+.-]*:/i.test(link))
    return ''; return `https://${link}`; }
function normalizedEditorMarkTag(value) { const tag = value.trim(); const semantic = tag.toLowerCase(); if (EDITOR_MARK_TAGS.has(semantic))
    return semantic; if (tag.startsWith('span-class:')) {
    const classes = tag.slice(11).split(/\s+/).filter(name => SAFE_QUILL_CLASS.test(name));
    return classes.length ? `span-class:${Array.from(new Set(classes)).join(' ')}` : '';
} if (tag.startsWith('span-style:')) {
    const probe = document.createElement('span');
    probe.setAttribute('style', tag.slice(11));
    const style = safeLegacyStyle(probe);
    return style ? `span-style:${style}` : '';
} return ''; }
function editorMarkTags(element) { const tag = element.tagName.toLowerCase(); const tags = []; if (EDITOR_MARK_TAGS.has(tag))
    tags.push(tag); if (tag === 'span') {
    const className = Array.from(element.classList).filter(name => SAFE_QUILL_CLASS.test(name)).join(' ');
    if (className)
        tags.push(`span-class:${className}`);
    const style = element.getAttribute('style') || '';
    if (style)
        tags.push(`span-style:${style}`);
} return tags; }
function wrapEditorMark(tag, content) { if (EDITOR_MARK_TAGS.has(tag))
    return `<${tag}>${content}</${tag}>`; if (tag.startsWith('span-class:'))
    return `<span class="${escapeHtml(tag.slice(11))}">${content}</span>`; if (tag.startsWith('span-style:'))
    return `<span style="${escapeHtml(tag.slice(11))}">${content}</span>`; return content; }
function normalizeEditorLinks(links, length) { const output = []; links.map(link => ({ start: Math.max(0, Math.min(length, link.start)), end: Math.max(0, Math.min(length, link.end)), href: normalizeEditorLink(link.href), ...(link.auto ? { auto: true } : {}) })).filter(link => link.href && link.end > link.start).sort((first, second) => first.start - second.start || first.end - second.end).forEach(link => { const previous = output.at(-1); if (previous && link.start < previous.end) {
    if (previous.href === link.href && !!previous.auto === !!link.auto)
        previous.end = Math.max(previous.end, link.end);
    else if (link.end > previous.end)
        output.push({ ...link, start: previous.end });
    return;
} if (previous && link.start === previous.end && previous.href === link.href && !!previous.auto === !!link.auto)
    previous.end = link.end;
else
    output.push(link); }); return output; }
function normalizeEditorMarks(marks, length) { const output = []; marks.map(mark => ({ start: Math.max(0, Math.min(length, mark.start)), end: Math.max(0, Math.min(length, mark.end)), tag: normalizedEditorMarkTag(mark.tag) })).filter(mark => !!mark.tag && mark.end > mark.start).sort((first, second) => first.tag.localeCompare(second.tag) || first.start - second.start || first.end - second.end).forEach(mark => { const previous = output.at(-1); if (previous && previous.tag === mark.tag && mark.start <= previous.end)
    previous.end = Math.max(previous.end, mark.end);
else
    output.push(mark); }); return output.sort((first, second) => first.start - second.start || second.end - first.end || first.tag.localeCompare(second.tag)); }
function detailBlockFormatting(node) { return { blockClass: node.getAttribute('class') || undefined, blockStyle: node.getAttribute('style') || undefined }; }
function orderedListLabels(blocks) {
    const counters = [];
    let previousContext = '';
    return blocks.map(block => {
        const context = JSON.stringify([block.togglePath || [], block.layoutPath || []]);
        if (context !== previousContext)
            counters.length = 0;
        previousContext = context;
        if (block.groupStart || !block.listKind)
            counters.length = 0;
        if (!block.listKind)
            return '';
        const depth = Math.min(12, Math.max(0, Math.floor(block.listDepth || 0) + Math.floor(block.extraIndent || 0)));
        if (block.listKind !== 'ol') {
            counters.length = Math.min(counters.length, depth);
            return '';
        }
        counters.length = Math.min(counters.length, depth + 1);
        for (let level = 0; level < depth; level += 1)
            if (!counters[level])
                counters[level] = 1;
        const explicit = block.listStart;
        counters[depth] = explicit !== undefined ? Math.max(1, Math.min(100_000, Math.floor(explicit))) : counters[depth] ? counters[depth] + 1 : depth === 0 ? Math.max(1, Math.floor(block.listIndex || 1)) : 1;
        return counters.join('.');
    });
}
function withOrderedListLabels(blocks) { const labels = orderedListLabels(blocks); return blocks.map((block, index) => ({ ...block, listLabel: labels[index] || undefined })); }
function flattenDetailBlocks(blocks) {
    let previousKind = '';
    let nextIndex = 1;
    const flat = blocks.map(block => {
        if (!block.listKind) {
            previousKind = '';
            return block;
        }
        if (block.groupStart || previousKind !== block.listKind)
            nextIndex = block.listIndex;
        const listStart = block.listKind === 'ol' ? (block.listStart ?? (block.listIndex !== nextIndex ? block.listIndex : undefined)) : undefined;
        previousKind = block.listKind;
        nextIndex = block.listIndex + 1;
        const extraIndent = Math.min(MAX_LIST_INDENT, Math.max(0, Math.floor(block.listDepth || 0) + Math.floor(block.extraIndent || 0)));
        const classes = (block.blockClass || '').split(/\s+/).filter(name => name && !/^ql-indent-\d+$/.test(name) && !LIST_SPACING_CLASS.test(name));
        const styles = (block.blockStyle || '').split(';').map(rule => rule.trim()).filter(rule => rule && !/^margin-inline-start\s*:/i.test(rule));
        if (extraIndent)
            styles.push(`margin-inline-start:${listIndentEm(extraIndent)}em`);
        return { ...block, listDepth: 0, extraIndent, listStart, blockClass: classes.join(' ') || undefined, blockStyle: styles.join(';') || undefined };
    });
    return withOrderedListLabels(flat.map((block, index) => {
        if (!block.listKind)
            return block;
        const previous = flat[index - 1];
        const next = flat[index + 1];
        const before = previous?.listKind && !block.groupStart ? previous.extraIndent : 0;
        const after = next?.listKind && !next.groupStart ? next.extraIndent : 0;
        const classes = [block.blockClass, block.extraIndent > before ? 'editor-indent-start' : '', block.extraIndent > after ? 'editor-indent-end' : ''].filter(Boolean);
        return { ...block, blockClass: classes.join(' ') || undefined };
    }));
}
function detailBlockAttributes(block) { const attributes = []; if (block.blockClass)
    attributes.push(`class="${escapeHtml(block.blockClass)}"`); if (block.blockStyle)
    attributes.push(`style="${escapeHtml(block.blockStyle)}"`); return attributes.length ? ` ${attributes.join(' ')}` : ''; }
function readDetailBlocks(value) {
    const doc = new DOMParser().parseFromString(safeHtml(value || ''), 'text/html');
    const containers = layoutContentBlocks(doc.body);
    // Explicit empty rows are document content, including leading/trailing rows.
    const blocks = [];
    let lineIndex = 0;
    let previousKind = '';
    let previousCompact = false;
    let togglePath = [];
    let layoutPath = [];
    const append = (node, tag, listKind, listIndex, kind, startsContainer, listDepth = 0, extraIndent = 0, keepEmpty = false, listStart) => { const text = detailNodeText(node); const todoChecked = todoState(node); const compact = todoChecked !== undefined || node.getAttribute('data-editor-compact') === 'true' || (!text.trim() && !keepEmpty); const structuralGap = blocks.length > 0 && !compact && !previousCompact && startsContainer && !(previousKind === 'list' && kind === 'list') && (previousKind === 'list' || kind === 'list' || kind === 'heading'); const groupStart = structuralGap; if (groupStart)
        lineIndex += 1; blocks.push({ todoChecked, html: node.innerHTML, text, tag, inList: !!listKind, listKind, listIndex, listStart, listDepth: listKind ? Math.max(0, Math.floor(listDepth)) : 0, extraIndent: listKind ? Math.max(0, Math.floor(extraIndent)) : todoChecked !== undefined ? listExtraIndent(node) : 0, groupStart, lineIndex: lineIndex++, compact, togglePath: togglePath.length ? [...togglePath] : undefined, layoutPath: layoutPath.length ? layoutPath.map(region => ({ ...region })) : undefined, ...detailBlockFormatting(node) }); previousKind = kind; previousCompact = compact; return true; };
    const addList = (list, listDepth = 0, startsContainer = true) => { const tag = list.tagName.toLowerCase(); const items = Array.from(list.children).filter(child => child.tagName === 'LI'); const defaultKind = tag === 'ul' ? 'ul' : 'ol'; const configuredStart = Number.parseInt(list.getAttribute('start') || '1', 10); let firstContent = true; let orderedIndex = tag === 'ol' && Number.isFinite(configuredStart) ? Math.max(1, configuredStart) - 1 : 0; items.forEach(item => { const hint = (item.getAttribute('data-list') || '').toLowerCase(); const listKind = hint === 'bullet' ? 'ul' : hint === 'ordered' ? 'ol' : defaultKind; const explicitIndex = Number.parseInt(item.getAttribute('value') || '', 10); const candidateIndex = listKind === 'ol' ? (Number.isFinite(explicitIndex) ? explicitIndex : orderedIndex + 1) : 0; const nestedLists = Array.from(item.children).filter(child => child.tagName === 'UL' || child.tagName === 'OL'); const content = item.cloneNode(true); Array.from(content.children).filter(child => child.tagName === 'UL' || child.tagName === 'OL').forEach(child => child.remove()); const added = append(content, 'li', listKind, candidateIndex, 'list', startsContainer && firstContent, listDepth, listExtraIndent(item, listDepth), true, listKind === 'ol' && Number.isFinite(explicitIndex) ? explicitIndex : undefined); if (added) {
        firstContent = false;
        if (listKind === 'ol')
            orderedIndex = candidateIndex;
    } nestedLists.forEach(child => addList(child, added ? listDepth + 1 : listDepth, false)); }); };
    const visit = (container, depth = 0) => {
        const tag = container.tagName.toLowerCase();
        if (container.hasAttribute('data-editor-tree')) {
            const tree = readEditorTree(container);
            append(container, 'tree', '', 0, 'block', true, 0, 0, true);
            const block = blocks.at(-1);
            block.tree = tree;
            block.text = treePlainText(tree);
            block.html = treeMarkup(tree);
            return;
        }
        if (container.hasAttribute('data-editor-table')) {
            const table = readEditorTable(container);
            if (table) {
                append(container, 'table', '', 0, 'block', true, 0, 0, true);
                const block = blocks.at(-1);
                block.table = table;
                block.text = tablePlainText(table);
                block.html = tableMarkup(table);
            }
            return;
        }
        if (tag === 'div' && (container.hasAttribute('data-editor-callout') || container.hasAttribute('data-editor-columns'))) {
            const parentPath = layoutPath;
            const enter = (region, node) => { layoutPath = [...parentPath, region]; previousKind = ''; previousCompact = true; layoutContentBlocks(node).forEach(child => visit(child, depth)); };
            if (container.hasAttribute('data-editor-callout'))
                enter({ kind: 'callout', id: container.getAttribute('data-editor-callout'), withinToggle: togglePath.at(-1) }, container);
            else {
                const count = Number(container.getAttribute('data-editor-columns'));
                Array.from(container.children).forEach((column, index) => enter({ kind: 'column', id: container.getAttribute('data-layout-id'), column: index + 1, count, withinToggle: togglePath.at(-1) }, column));
            }
            layoutPath = parentPath;
            previousKind = '';
            previousCompact = true;
            return;
        }
        if (tag === 'details' && depth < 8) {
            const id = container.getAttribute('data-editor-toggle') || `toggle-${blocks.length}`;
            const summary = Array.from(container.children).find(child => child.tagName === 'SUMMARY') || doc.createElement('summary');
            append(summary, 'summary', '', 0, 'block', true, 0, 0, true);
            blocks[blocks.length - 1].toggleId = id;
            blocks[blocks.length - 1].compact = true;
            const parentPath = togglePath;
            togglePath = [...parentPath, id];
            const body = doc.createElement('div');
            Array.from(container.childNodes).filter(child => child !== summary).forEach(child => body.appendChild(child.cloneNode(true)));
            layoutContentBlocks(body).forEach(child => visit(child, depth + 1));
            togglePath = parentPath;
            return;
        }
        if (tag === 'hr' || tag === 'figure') {
            append(container, tag, '', 0, 'block', true, 0, 0, true);
            const block = blocks.at(-1);
            if (tag === 'figure') {
                block.media = readEditorMedia(container) || undefined;
                if (!block.media)
                    blocks.pop();
            }
            return;
        }
        if (tag === 'ul' || tag === 'ol') {
            addList(container);
            return;
        }
        if (tag === 'div' && Array.from(container.children).some(child => ['P', 'UL', 'OL', 'DETAILS', 'FIGURE', 'HR', 'DIV', 'H1', 'H2', 'H3', 'BLOCKQUOTE'].includes(child.tagName))) {
            layoutContentBlocks(container).forEach(child => visit(child, depth));
            return;
        }
        if (!['p', 'div', 'h1', 'h2', 'h3', 'blockquote'].includes(tag)) {
            if (container.textContent?.trim())
                append(container, 'p', '', 0, 'block', true);
            return;
        }
        append(container, tag === 'div' ? 'p' : tag, '', 0, /^h[1-3]$/.test(tag) ? 'heading' : 'block', true);
    };
    containers.forEach(container => visit(container));
    return flattenDetailBlocks(blocks);
}
function detailBlockPromptText(block) {
    if (block.tree)
        return treePlainText(block.tree);
    if (block.table)
        return tablePlainText(block.table);
    if (block.tag === 'hr')
        return '---';
    if (block.media)
        return `${block.media.kind === 'image' ? 'Photo' : 'Video'}: ${block.media.url}`;
    const doc = new DOMParser().parseFromString(`<div>${safeHtml(block.html)}</div>`, 'text/html');
    const root = doc.body.firstElementChild;
    if (!root)
        return block.text;
    const render = (node) => { if (node.nodeType === Node.TEXT_NODE)
        return node.data; if (!(node instanceof Element))
        return ''; const tag = node.tagName.toLowerCase(); if (tag === 'br')
        return '\n'; if (tag === 'a') {
        const label = (node.textContent || '').trim();
        const href = normalizeEditorLink(node.getAttribute('href') || '');
        return href && label && label !== href ? `${label} (${href})` : label || href;
    } const content = Array.from(node.childNodes).map(render).join(''); if (!content)
        return ''; if (tag === 'strong' || tag === 'b')
        return `**${content}**`; if (tag === 'em' || tag === 'i')
        return `*${content}*`; if (tag === 'code')
        return `\`${content}\``; return content; };
    return Array.from(root.childNodes).map(render).join('').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/[\u200b\ufeff]/g, '');
}
function detailHtmlToPromptText(value) { const output = []; readDetailBlocks(value).forEach(block => { if (block.groupStart && output.length && output.at(-1) !== '')
    output.push(''); const depth = block.listKind || block.todoChecked !== undefined ? Math.min(12, block.listDepth + block.extraIndent) : 0; const indent = '  '.repeat(depth); const marker = block.todoChecked !== undefined ? `- [${block.todoChecked ? 'x' : ' '}] ` : block.listKind === 'ul' ? '- ' : block.listKind === 'ol' ? `${block.listLabel || Math.max(1, block.listIndex)}. ` : block.tag === 'blockquote' ? '> ' : ''; const lines = detailBlockPromptText(block).split('\n'); const continuation = ' '.repeat(marker.length); lines.forEach((line, index) => output.push(`${indent}${index ? continuation : marker}${line.replace(/[ \t]+$/, '')}`)); }); return output.join('\n').replace(/\n{3,}/g, '\n\n').trim(); }
function detailNodeText(node) { const textNode = node.cloneNode(true); textNode.querySelectorAll('br').forEach(br => replaceDomNode(br, '\n')); const value = (textNode.textContent || '').replace(/\u200b/g, ''); return value.trim() ? value : ''; }
function exposeInlineBreaks(root, doc) { root.querySelectorAll('br').forEach(br => replaceDomNode(br, doc.createTextNode('\n'))); }
function restoreInlineBreaks(root, doc) { const walker = doc.createTreeWalker(root, 4); const nodes = []; let current = walker.nextNode(); while (current) {
    nodes.push(current);
    current = walker.nextNode();
} nodes.forEach(node => { if (!node.data.includes('\n'))
    return; const parts = node.data.split('\n'); const fragment = doc.createDocumentFragment(); parts.forEach((part, index) => { if (index)
    appendDomNode(fragment, doc.createElement('br')); if (part)
    appendDomNode(fragment, doc.createTextNode(part)); }); replaceDomNode(node, fragment); }); }
function detailBlockPrefix(block) { if (block.listKind === 'ul')
    return UNORDERED_PREFIX; if (block.listKind === 'ol')
    return `${block.listLabel || Math.max(1, block.listIndex)}. `; return ''; }
function editorLinksFromBlocks(blocks, value) { const lineStarts = []; let position = 0; value.split('\n').forEach(line => { lineStarts.push(position); position += line.length + 1; }); const links = []; blocks.forEach(block => { const doc = new DOMParser().parseFromString(`<div>${safeHtml(block.html)}</div>`, 'text/html'); const root = doc.body.firstElementChild; if (!root)
    return; exposeInlineBreaks(root, doc); const ranges = new Map(); const walker = doc.createTreeWalker(root, 4); let localOffset = 0; let current = walker.nextNode(); while (current) {
    const node = current;
    const anchor = node.parentElement?.closest('a[href]');
    if (anchor) {
        const href = normalizeEditorLink(anchor.getAttribute('href') || '');
        if (href) {
            const existing = ranges.get(anchor);
            if (existing)
                existing.end = localOffset + node.data.length;
            else
                ranges.set(anchor, { start: localOffset, end: localOffset + node.data.length, href, ...(anchor.getAttribute('data-editor-autolink') === 'true' ? { auto: true } : {}) });
        }
    }
    localOffset += node.data.length;
    current = walker.nextNode();
} const lineStart = (lineStarts[block.lineIndex] || 0) + detailBlockPrefix(block).length; ranges.forEach(range => { if (range.end > range.start)
    links.push({ ...range, start: lineStart + range.start, end: lineStart + range.end }); }); }); return normalizeEditorLinks(links, value.length); }
function editorMarksFromBlocks(blocks, value) { const lineStarts = []; let position = 0; value.split('\n').forEach(line => { lineStarts.push(position); position += line.length + 1; }); const marks = []; blocks.forEach(block => { const doc = new DOMParser().parseFromString(`<div>${safeHtml(block.html)}</div>`, 'text/html'); const root = doc.body.firstElementChild; if (!root)
    return; exposeInlineBreaks(root, doc); const ranges = []; const walker = doc.createTreeWalker(root, 4); let localOffset = 0; let current = walker.nextNode(); while (current) {
    const node = current;
    let element = node.parentElement;
    while (element && element !== root) {
        const markedElement = element;
        editorMarkTags(markedElement).forEach(tag => { const existing = ranges.find(range => range.element === markedElement && range.tag === tag); if (existing)
            existing.end = localOffset + node.data.length;
        else
            ranges.push({ element: markedElement, tag, start: localOffset, end: localOffset + node.data.length }); });
        element = element.parentElement;
    }
    localOffset += node.data.length;
    current = walker.nextNode();
} const lineStart = (lineStarts[block.lineIndex] || 0) + detailBlockPrefix(block).length; ranges.forEach(range => { if (range.end > range.start)
    marks.push({ start: lineStart + range.start, end: lineStart + range.end, tag: range.tag }); }); }); return normalizeEditorMarks(marks, value.length); }
function rangedInlineHtml(text, marks, links) { if (!text)
    return '<br>'; const normalizedMarks = normalizeEditorMarks(marks, text.length); const normalizedLinks = normalizeEditorLinks(links, text.length); const boundaries = Array.from(new Set([0, text.length, ...normalizedMarks.flatMap(mark => [mark.start, mark.end]), ...normalizedLinks.flatMap(link => [link.start, link.end])])).sort((first, second) => first - second); const output = []; for (let index = 0; index < boundaries.length - 1; index += 1) {
    const start = boundaries[index];
    const end = boundaries[index + 1];
    if (end <= start)
        continue;
    let segment = escapeHtml(text.slice(start, end)).replace(/\n/g, '<br>');
    const activeMarks = normalizedMarks.filter(mark => mark.start <= start && mark.end >= end).sort((first, second) => first.start - second.start || second.end - first.end || first.tag.localeCompare(second.tag));
    for (let markIndex = activeMarks.length - 1; markIndex >= 0; markIndex -= 1)
        segment = wrapEditorMark(activeMarks[markIndex].tag, segment);
    const link = normalizedLinks.find(item => item.start <= start && item.end >= end);
    if (link)
        segment = `<a href="${escapeHtml(link.href)}"${link.auto ? ' data-editor-autolink="true"' : ''} target="_blank" rel="noopener noreferrer">${segment}</a>`;
    output.push(segment);
} return output.join('') || '<br>'; }
function linkifyInlineHtml(html, text, links) {
    const normalized = normalizeEditorLinks(links, text.length);
    if (!normalized.length)
        return html;
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const root = doc.body.firstElementChild;
    if (!root)
        return html;
    exposeInlineBreaks(root, doc);
    Array.from(root.querySelectorAll('a')).forEach(unwrapDomNode);
    if ((root.textContent || '') !== text)
        root.textContent = text;
    const walker = doc.createTreeWalker(root, 4);
    const nodes = [];
    let current = walker.nextNode();
    while (current) {
        nodes.push(current);
        current = walker.nextNode();
    }
    let offset = 0;
    nodes.forEach(node => { const value = node.data; const start = offset; const end = start + value.length; offset = end; const relevant = normalized.filter(link => link.end > start && link.start < end); if (!relevant.length)
        return; const fragment = doc.createDocumentFragment(); let cursor = 0; relevant.forEach(link => { const localStart = Math.max(cursor, link.start - start); const localEnd = Math.min(value.length, link.end - start); if (localStart > cursor)
        appendDomNode(fragment, doc.createTextNode(value.slice(cursor, localStart))); if (localEnd > localStart) {
        const anchor = doc.createElement('a');
        anchor.setAttribute('href', link.href);
        if (link.auto)
            anchor.setAttribute('data-editor-autolink', 'true');
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener noreferrer');
        anchor.textContent = value.slice(localStart, localEnd);
        appendDomNode(fragment, anchor);
    } cursor = Math.max(cursor, localEnd); }); if (cursor < value.length)
        appendDomNode(fragment, doc.createTextNode(value.slice(cursor))); replaceDomNode(node, fragment); });
    restoreInlineBreaks(root, doc);
    return root.innerHTML;
}
function inlineHtml(text, source, marks, links) { if (source && source.text === text)
    return linkifyInlineHtml(safeHtml(source.html) || '<br>', text, links); return rangedInlineHtml(text, marks, links); }
function detailHtmlFromBlocks(blocks) {
    blocks = flattenDetailBlocks(blocks);
    const output = [];
    let listBlocks = [];
    const openFrames = [];
    const serializeList = (items) => { const roots = []; const stack = []; let previousDepth = 0; items.forEach((block, index) => { const requested = Math.max(0, Math.floor(block.listDepth || 0)); const depth = Math.min(requested, index ? previousDepth + 1 : 0); const item = { kind: (block.listKind || 'ul'), inner: safeHtml(block.html) || '<br>', extraIndent: Math.max(0, Math.floor(block.extraIndent || 0)), listIndex: Math.max(1, Math.floor(block.listIndex || 1)), listStart: block.listStart, listLabel: block.listLabel, blockClass: block.blockClass, blockStyle: block.blockStyle, children: [] }; if (depth > 0 && stack[depth - 1])
        stack[depth - 1].children.push(item);
    else
        roots.push(item); stack[depth] = item; stack.length = depth + 1; previousDepth = depth; }); const render = (siblings) => { let html = ''; let openKind = ''; let orderedNext = 1; siblings.forEach(item => { if (openKind !== item.kind) {
        if (openKind)
            html += `</${openKind}>`;
        openKind = item.kind;
        orderedNext = item.listIndex;
        const start = openKind === 'ol' && item.listIndex > 1 ? ` start="${item.listIndex}"` : '';
        html += `<${openKind}${start}>`;
    } const dataIndent = item.extraIndent ? ` data-list-extra-indent="${item.extraIndent}"` : ''; const hasIndentStyle = /\bmargin-inline-start\s*:/i.test(item.blockStyle || ''); const style = [item.blockStyle, item.extraIndent && !hasIndentStyle ? `margin-inline-start:${listIndentEm(item.extraIndent)}em` : ''].filter(Boolean).join(';'); const formatting = detailBlockAttributes({ blockClass: item.blockClass, blockStyle: style || undefined }); const value = openKind === 'ol' && (item.listStart !== undefined || item.listIndex !== orderedNext) ? ` value="${item.listIndex}"` : ''; const numberLabel = openKind === 'ol' && item.listLabel ? ` data-list-number="${item.listLabel}"` : ''; html += `<li${dataIndent}${numberLabel}${formatting}${value}>${item.inner}${item.children.length ? render(item.children) : ''}</li>`; if (openKind === 'ol')
        orderedNext = item.listIndex + 1; }); if (openKind)
        html += `</${openKind}>`; return html; }; return render(roots); };
    const flushList = () => { if (!listBlocks.length)
        return; output.push(serializeList(listBlocks)); listBlocks = []; };
    blocks.forEach(block => { const frames = layoutFrames(block); let common = 0; while (common < openFrames.length && common < frames.length && openFrames[common].key === frames[common].key)
        common++; while (openFrames.length > common) {
        flushList();
        output.push(`</${openFrames.pop().tag}>`);
    } for (const frame of frames.slice(common)) {
        flushList();
        if (frame.open)
            output.push(frame.open);
        openFrames.push(frame);
    } if (block.toggleId) {
        flushList();
        output.push(`<details data-editor-toggle="${escapeHtml(block.toggleId)}" open><summary data-editor-compact="true">${safeHtml(block.html) || '<br>'}</summary>`);
        openFrames.push({ key: 'toggle:' + block.toggleId, tag: 'details', open: '' });
        return;
    } if (isAtomicDetailBlock(block)) {
        flushList();
        output.push(block.tree ? treeMarkup(block.tree) : block.table ? tableMarkup(block.table) : block.media ? mediaMarkup(block.media) : '<hr contenteditable="false">');
        return;
    } if (block.groupStart) {
        flushList();
        if (output.length && output.at(-1) !== '<p><br></p>')
            output.push('<p><br></p>');
    } if (block.listKind) {
        listBlocks.push(block);
        return;
    } flushList(); const inner = safeHtml(block.html) || '<br>'; const tag = block.todoChecked !== undefined ? 'p' : ['p', 'h1', 'h2', 'h3', 'blockquote'].includes(block.tag) ? block.tag : 'p'; const compact = block.compact || block.todoChecked !== undefined ? ' data-editor-compact="true"' : ''; const todo = block.todoChecked !== undefined ? ` data-editor-todo="${block.todoChecked}"${block.extraIndent ? ` data-list-extra-indent="${block.extraIndent}"` : ''}` : ''; const formatting = block.todoChecked !== undefined ? { ...block, blockStyle: [(block.blockStyle || '').replace(/margin-inline-start\s*:[^;]+;?/gi, ''), block.extraIndent ? `margin-inline-start:${listIndentEm(block.extraIndent)}em` : ''].filter(Boolean).join(';') } : block; output.push(`<${tag}${compact}${todo}${detailBlockAttributes(formatting)}>${inner}</${tag}>`); });
    flushList();
    while (openFrames.length)
        output.push(`</${openFrames.pop().tag}>`);
    return output.join('');
}
function normalizedDetailHtml(value) { return detailHtmlFromBlocks(readDetailBlocks(value)) || '<p data-editor-compact="true"><br></p>'; }
let mobileDetailBlockId = 0;
const mobileDetailBlockPrefix = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
function isAtomicDetailBlock(block) { return !!block.tree || !!block.table || !!block.media || block.tag === 'hr'; }
function localRangesForBlock(block) { if (isAtomicDetailBlock(block))
    return { links: [], marks: [] }; const local = { ...block, lineIndex: 0 }; const prefix = detailBlockPrefix(local); const value = `${prefix}${block.text}`; return { links: editorLinksFromBlocks([local], value).map(link => ({ ...link, start: link.start - prefix.length, end: link.end - prefix.length })), marks: editorMarksFromBlocks([local], value).map(mark => ({ ...mark, start: mark.start - prefix.length, end: mark.end - prefix.length })) }; }
function mobileBlocksFromDetail(blocks) { return blocks.map(block => { const ranges = localRangesForBlock(block); return { ...block, editorKey: `mobile-detail-${mobileDetailBlockPrefix}-${++mobileDetailBlockId}`, links: ranges.links, marks: ranges.marks }; }); }
function normalizeMobileListIndexes(blocks) { const orderedIndexes = []; const kinds = []; let previousDepth = 0; let previousWasList = false; let previousContext = ''; return withOrderedListLabels(blocks.map(block => { const context = JSON.stringify([block.togglePath || [], block.layoutPath || []]); if (context !== previousContext) {
    orderedIndexes.length = 0;
    kinds.length = 0;
    previousWasList = false;
} previousContext = context; if (!block.listKind) {
    orderedIndexes.length = 0;
    kinds.length = 0;
    previousDepth = 0;
    previousWasList = false;
    return { ...block, listDepth: 0, extraIndent: block.todoChecked !== undefined ? Math.min(MAX_LIST_INDENT, Math.max(0, Math.floor(block.extraIndent || 0))) : 0, listIndex: 0, listStart: undefined };
} if (block.groupStart) {
    orderedIndexes.length = 0;
    kinds.length = 0;
    previousWasList = false;
} const requested = Math.max(0, Math.floor(block.listDepth || 0)); const listDepth = Math.min(requested, previousWasList ? previousDepth + 1 : 0); orderedIndexes.length = listDepth + 1; kinds.length = listDepth + 1; const continues = kinds[listDepth] === block.listKind && (orderedIndexes[listDepth] || 0) > 0; kinds[listDepth] = block.listKind; if (block.listKind === 'ol')
    orderedIndexes[listDepth] = block.listStart !== undefined ? Math.max(1, Math.min(100_000, Math.floor(block.listStart))) : continues ? (orderedIndexes[listDepth] || 0) + 1 : Math.max(1, Math.floor(block.listIndex || 1));
else
    orderedIndexes[listDepth] = 0; previousDepth = listDepth; previousWasList = true; return { ...block, listDepth, extraIndent: Math.max(0, Math.floor(block.extraIndent || 0)), listIndex: block.listKind === 'ol' ? orderedIndexes[listDepth] : 0, listStart: block.listKind === 'ol' ? block.listStart : undefined }; })); }
function materializeMobileBlock(block, value, links, marks) { return { ...block, text: value, html: inlineHtml(value, block, marks, links), links: normalizeEditorLinks(links, value.length), marks: normalizeEditorMarks(marks, value.length) }; }

export {normalizedDetailHtml,readDetailBlocks,detailHtmlFromBlocks,mobileBlocksFromDetail,materializeMobileBlock,safeHtml,normalizeMobileListIndexes,detailHtmlToPromptText};
