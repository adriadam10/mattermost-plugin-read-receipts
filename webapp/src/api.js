import manifest from '../../plugin.json';

// Mattermost rejects cookie-authenticated POSTs without its CSRF header.
function csrfToken() {
    return document.cookie.match(/(?:^|;\s*)MMCSRF=([^;]+)/)?.[1] ?? '';
}

async function request(method, path, body) {
    const response = await fetch(`${window.basename || ''}/plugins/${manifest.id}/api/v1/${path}`, {
        method,
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'X-CSRF-Token': csrfToken(),
        },
        body: body && JSON.stringify(body),
    });
    if (!response.ok) {
        throw new Error(`${manifest.id}: ${method} ${path} -> ${response.status}`);
    }
    return response.status === 204 ? null : response.json();
}

export const markDelivered = (channelIds) => request('POST', 'delivered', {channel_ids: channelIds});
export const markRead = (postIds) => request('POST', 'read', {post_ids: postIds});
export const fetchStatuses = (postIds) => request('POST', 'status', {post_ids: postIds}).then((r) => r.statuses);
export const fetchInfo = (postId) => request('GET', `info/${postId}`);
