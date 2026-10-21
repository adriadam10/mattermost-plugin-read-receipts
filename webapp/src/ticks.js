const CHECK = '<path d="M11.1.6 4.5 7.2 1.9 4.6.9 5.7l3.6 3.6L12.1 1.7z"/>';
const SECOND_CHECK = '<path d="M15.1.6 8.5 7.2l-.9-.9-1.1 1.1 2 2L16.1 1.7z"/>';

function svg(paths) {
    return `<svg viewBox="0 0 17 10" width="17" height="10" fill="currentColor" aria-hidden="true">${paths}</svg>`;
}

const ICONS = {
    sent: svg(CHECK),
    delivered: svg(CHECK + SECOND_CHECK),
    read: svg(CHECK + SECOND_CHECK),
};

export const STYLES = `
.rr-ticks {
    display: flex;
    justify-content: flex-end;
    margin-top: -4px;
    color: rgba(var(--center-channel-color-rgb), 0.48);
    line-height: 0;
}
.rr-ticks button {
    padding: 2px 0 2px 4px;
    border: none;
    background: none;
    color: inherit;
    cursor: pointer;
}
.rr-ticks--read { color: #53bdeb; }
.rr-info__backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
}
.rr-info {
    width: min(400px, calc(100vw - 32px));
    max-height: 80vh;
    overflow-y: auto;
    padding: 20px 24px;
    border-radius: 8px;
    background: var(--center-channel-bg);
    color: var(--center-channel-color);
    box-shadow: 0 20px 32px rgba(0, 0, 0, 0.12);
}
.rr-info__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.rr-info__title { margin: 0; font-size: 18px; font-weight: 600; }
.rr-info__close { border: none; background: none; color: inherit; font-size: 24px; line-height: 1; cursor: pointer; }
.rr-info__section { margin: 16px 0 6px; font-size: 12px; font-weight: 600; text-transform: uppercase; opacity: 0.64; }
.rr-info__section .rr-ticks { display: inline-flex; margin: 0 6px 0 0; vertical-align: middle; }
.rr-info__row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
.rr-info__avatar { width: 32px; height: 32px; border-radius: 50%; }
.rr-info__name { flex: 1; font-weight: 600; }
.rr-info__when { font-size: 12px; opacity: 0.64; }
.rr-info__note { font-size: 13px; opacity: 0.72; }
`;

export function ticksMarkup(state) {
    return ICONS[state];
}

// Places or updates the check marks at the end of one of the user's own posts.
export function renderTicks(postElement, postId, state, t, onClick) {
    const body = postElement.querySelector('[data-testid="post-body"]');
    if (!body) {
        return;
    }
    let ticks = body.querySelector(':scope > .rr-ticks');
    if (!state) {
        ticks?.remove();
        return;
    }
    if (!ticks) {
        ticks = document.createElement('div');
        body.appendChild(ticks);
    }
    if (ticks.dataset.state === state && ticks.dataset.postId === postId) {
        return;
    }
    ticks.dataset.state = state;
    ticks.dataset.postId = postId;
    ticks.className = `rr-ticks rr-ticks--${state}`;
    ticks.innerHTML = `<button type="button" title="${t(state)}" aria-label="${t(state)}">${ICONS[state]}</button>`;
    ticks.firstChild.addEventListener('click', (event) => {
        event.stopPropagation();
        onClick(postId);
    });
}
