// 从迁移保留的 TypeScript 页面控制逻辑编译。
// 此函数整体注入页面，不依赖模块作用域。每个文档维护独立的元素引用。
export async function pageControl(request) {
    const stateKey = '__hancode_mcp_dom_v2__';
    const scope = window;
    const state = scope[stateKey] ||= { document, snapshotId: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, next: 0, refs: new Map(), ids: new WeakMap() };
    if (state.document !== document) {
        delete scope[stateKey];
        throw new Error('文档已变化，请重新读取页面');
    }
    const refFor = (element) => {
        let ref = state.ids.get(element);
        if (!ref) {
            ref = 'e' + ++state.next;
            state.ids.set(element, ref);
            state.refs.set(ref, element);
        }
        return ref;
    };
    // 清除已移除的节点，防止长时间运行的单页应用持有旧 DOM。
    for (const [ref, element] of state.refs)
        if (!element.isConnected)
            state.refs.delete(ref);
    const visible = (e) => {
        const style = getComputedStyle(e);
        return style.visibility !== 'hidden' && style.display !== 'none' && e.getClientRects().length > 0 && !e.closest('[hidden],[aria-hidden="true"], [inert]');
    };
    const all = (root) => {
        const list = [];
        const visit = (node) => {
            for (const e of Array.from(node.children || [])) {
                if (list.length >= 12000)
                    return;
                list.push(e);
                if (e.shadowRoot)
                    visit(e.shadowRoot);
                visit(e);
            }
        };
        visit(root);
        return list;
    };
    const label = (e) => {
        const labels = e.getAttribute('aria-labelledby')?.split(/\s+/).map((id) => (e.getRootNode().getElementById?.(id) || document.getElementById(id))?.textContent || '').join(' ');
        return (e.getAttribute('aria-label') || labels || Array.from(e.labels || []).map((x) => x.innerText).join(' ') || e.getAttribute('alt') || e.getAttribute('title') || e.innerText || e.getAttribute('placeholder') || '').trim().slice(0, 250);
    };
    const describe = (e) => ({
        ref: refFor(e), tag: e.tagName.toLowerCase(), role: e.getAttribute('role') || undefined,
        name: label(e), id: e.id || undefined, fieldName: e.getAttribute('name') || undefined,
        type: e.getAttribute('type') || undefined,
        value: e.matches('input[type=password]') ? '[已隐藏]' : typeof e.value === 'string' ? e.value.slice(0, 1000) : undefined,
        href: e.href || undefined, disabled: !!e.disabled || e.getAttribute('aria-disabled') === 'true',
        checked: typeof e.checked === 'boolean' ? e.checked : e.getAttribute('aria-checked') || undefined,
        expanded: e.getAttribute('aria-expanded') || undefined,
        options: e.tagName === 'SELECT' ? Array.from(e.options).slice(0, 80).map((o) => ({ value: o.value, text: o.text, selected: o.selected })) : undefined,
    });
    if (request.operation === 'act') {
        const results = [];
        const deadline = Date.now() + 20000;
        for (const step of request.steps || []) {
            if (Date.now() > deadline)
                return { results, stopped: '操作序列超过 20 秒' };
            try {
                if (step.ref && request.snapshotId !== state.snapshotId)
                    throw new Error('页面引用已过期，请重新读取页面并使用新的 snapshotId');
                let element;
                const until = Math.min(deadline, Date.now() + Math.min(10000, step.timeoutMs ?? 3000));
                do {
                    if (step.ref)
                        element = state.refs.get(step.ref);
                    else if (step.selector) {
                        const matches = all(document).filter(e => e.matches(step.selector) && visible(e));
                        if (matches.length > 1)
                            throw new Error('选择器匹配多个元素，请使用读取结果中的 ref');
                        element = matches[0];
                    }
                    if (element?.isConnected && (step.action === 'read' || visible(element)))
                        break;
                    if (step.ref)
                        throw new Error('元素已移除或不可见，请重新读取页面');
                    await new Promise(resolve => setTimeout(resolve, 80));
                } while (Date.now() < until);
                if (!element?.isConnected)
                    throw new Error('未找到目标元素');
                if (step.action !== 'read' && step.action !== 'wait' && (element.disabled || element.getAttribute('aria-disabled') === 'true'))
                    throw new Error('目标元素已禁用');
                if (step.action === 'click')
                    element.click();
                else if (step.action === 'fill') {
                    if (element.readOnly)
                        throw new Error('输入框为只读');
                    element.focus();
                    const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
                    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
                    if (element.isContentEditable)
                        element.textContent = step.value ?? '';
                    else if (element.matches('input,textarea') && setter)
                        setter.call(element, step.value ?? '');
                    else
                        throw new Error('目标元素不支持文本输入');
                    element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                    element.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                }
                else if (step.action === 'select') {
                    if (element.tagName !== 'SELECT')
                        throw new Error('目标不是下拉选择框');
                    if (!Array.from(element.options).some((o) => o.value === step.value))
                        throw new Error('选项值不存在');
                    element.value = step.value;
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                    element.dispatchEvent(new Event('change', { bubbles: true }));
                }
                else if (step.action === 'check') {
                    if (!element.matches('input[type=checkbox],input[type=radio]'))
                        throw new Error('目标不是复选框或单选框');
                    if (element.checked !== (step.checked ?? true))
                        element.click();
                }
                else if (step.action === 'scroll')
                    element.scrollIntoView({ block: 'center', inline: 'nearest' });
                results.push({ action: step.action, ref: refFor(element), ok: true, element: step.action === 'read' ? describe(element) : undefined });
            }
            catch (error) {
                results.push({ action: step.action, ok: false, error: String(error.message) });
                return { results, stopped: true, snapshotId: state.snapshotId };
            }
        }
        return { results, snapshotId: state.snapshotId, url: location.href };
    }
    const mode = request.mode || 'overview';
    const limit = Math.max(1, Math.min(300, request.limit ?? 80));
    const offset = Math.max(0, request.offset ?? 0);
    const maxText = Math.max(0, Math.min(50000, request.maxText ?? 8000));
    const query = String(request.query || '').toLocaleLowerCase();
    let root = document.body || document.documentElement;
    if (request.selector) {
        root = document.querySelector(request.selector);
        if (!root)
            throw new Error('未找到读取范围');
    }
    const candidates = [root, ...all(root)];
    const elements = candidates.filter(e => visible(e));
    const rawText = String(root.innerText || root.textContent || '');
    const matchingText = query ? rawText.split('\n').filter(line => line.toLocaleLowerCase().includes(query)).join('\n') : rawText;
    const base = { snapshotId: state.snapshotId, url: location.href, title: document.title, readyState: document.readyState };
    const matches = (e) => !query || (label(e) + ' ' + e.id + ' ' + (e.getAttribute('name') || '') + ' ' + (e.href || '')).toLocaleLowerCase().includes(query);
    if (mode === 'text' || mode === 'overview') {
        const start = mode === 'text' ? offset : 0;
        base.text = matchingText.slice(start, start + maxText);
        base.textLength = matchingText.length;
        base.nextTextOffset = start + maxText < matchingText.length ? start + maxText : null;
    }
    if (mode === 'overview')
        base.headings = elements.filter(e => e.matches('h1,h2,h3,[role=heading]')).slice(0, 30).map(e => ({ level: e.getAttribute('aria-level') || e.tagName, text: label(e) }));
    if (mode !== 'text') {
        let selected = elements.filter(matches);
        if (mode === 'links')
            selected = selected.filter(e => e.matches('a[href]'));
        else if (mode === 'forms')
            selected = selected.filter(e => e.matches('input,textarea,select,[contenteditable=true]'));
        else if (mode === 'tables')
            selected = selected.filter(e => e.matches('table,[role=table],[role=grid]'));
        else
            selected = selected.filter(e => e.matches('a[href],button,input,textarea,select,[contenteditable=true],[role=button],[role=link],[role=checkbox],[role=tab],[role=menuitem],summary'));
        base.total = selected.length;
        base.offset = offset;
        base.nextOffset = offset + limit < selected.length ? offset + limit : null;
        base.elements = selected.slice(offset, offset + limit).map(e => {
            if (mode !== 'tables')
                return describe(e);
            const rows = Array.from(e.querySelectorAll('tr,[role=row]'));
            return { ...describe(e), totalRows: rows.length, rows: rows.slice(0, Math.min(100, request.maxRows ?? 30)).map(r => Array.from(r.querySelectorAll('th,td,[role=cell],[role=columnheader],[role=gridcell]')).slice(0, 40).map(c => c.innerText?.slice(0, 500))) };
        });
    }
    base.domLimitReached = candidates.length >= 12000;
    return base;
}
