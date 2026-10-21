import {fetchStatuses, markDelivered, markRead} from './api.js';
import {postIdFromElementId} from './post_id.js';
import {renderTicks} from './ticks.js';

// Direct and group messages always have receipts; channels only up to a size the
// server knows, so it answers which ones to skip (ignoredChannels).
const MESSAGE_TYPES = new Set(['D', 'G']);
const TRACKED_TYPES = new Set(['D', 'G', 'O', 'P']);
const MAX_IDS_PER_REQUEST = 200;

// A post is on screen when 60% of it is visible, or it fills half the window
// (a long post never gets to 60%). Thresholds every 10% so tall posts are re-checked while scrolling.
const VISIBLE_RATIO = 0.6;
const THRESHOLDS = Array.from({length: 11}, (_, i) => i / 10);

// On load the client claims delivery only in conversations active lately, so a
// user with hundreds of old DMs does not write a receipt for each one.
const RECENT_CONVERSATION_MS = 14 * 24 * 60 * 60 * 1000;

function chunks(items) {
    const out = [];
    for (let i = 0; i < items.length; i += MAX_IDS_PER_REQUEST) {
        out.push(items.slice(i, i + MAX_IDS_PER_REQUEST));
    }
    return out;
}

function reportError(error) {
    // eslint-disable-next-line no-console
    console.error(error);
}

// Watches the post list: paints check marks on the user's own posts in direct and
// group messages and small channels, and reports which posts by others the user had on screen.
export default class Tracker {
    constructor(store, t, openInfo) {
        this.store = store;
        this.t = t;
        this.openInfo = openInfo;

        // postId -> 'sent' | 'delivered' | 'read', or null when the post has no recipients.
        this.statuses = new Map();
        this.staleStatuses = new Set();
        // postId -> its element, to drop it if the element leaves the page unnoticed.
        this.onScreen = new Map();
        this.reportedReadUpTo = new Map();
        this.pendingRead = new Set();
        this.pendingDelivered = new Set();
        this.ignoredChannels = new Set();
        this.observed = new Set();
        this.timers = {};

        this.intersection = new IntersectionObserver(this.onIntersection, {threshold: THRESHOLDS});
        this.mutation = new MutationObserver(this.scheduleScan);
    }

    start() {
        this.mutation.observe(document.body, {childList: true, subtree: true});
        window.addEventListener('focus', this.reportOnScreen);
        document.addEventListener('visibilitychange', this.reportOnScreen);
        this.deliverRecent();
        this.scheduleScan();
    }

    stop() {
        this.mutation.disconnect();
        this.intersection.disconnect();
        window.removeEventListener('focus', this.reportOnScreen);
        document.removeEventListener('visibilitychange', this.reportOnScreen);
        Object.values(this.timers).forEach(clearTimeout);
        cancelAnimationFrame(this.scanFrame);
        document.querySelectorAll('.rr-ticks').forEach((el) => el.remove());
    }

    get state() {
        return this.store.getState();
    }

    get currentUserId() {
        return this.state.entities.users.currentUserId;
    }

    conversationPost(postId) {
        const post = this.state.entities.posts.posts[postId];
        const channel = post && this.state.entities.channels.channels[post.channel_id];
        // Typed posts are system messages (joins, header changes...) or plugin cards.
        if (!channel || !TRACKED_TYPES.has(channel.type) || this.ignoredChannels.has(channel.id) || post.type) {
            return null;
        }
        return post;
    }

    isOwnConversationPost = (postId) => {
        const post = this.conversationPost(postId);
        return Boolean(post && post.user_id === this.currentUserId && this.statuses.get(postId));
    };

    later(name, fn, ms) {
        if (!this.timers[name]) {
            this.timers[name] = setTimeout(() => {
                this.timers[name] = null;
                fn();
            }, ms);
        }
    }

    scheduleScan = () => {
        if (!this.scanFrame) {
            this.scanFrame = requestAnimationFrame(() => {
                this.scanFrame = null;
                this.scan();
            });
        }
    };

    scan() {
        for (const element of this.observed) {
            if (!element.isConnected) {
                this.intersection.unobserve(element);
                this.observed.delete(element);
            }
        }
        for (const element of document.querySelectorAll('.post[id]')) {
            const postId = postIdFromElementId(element.id);
            const post = postId && this.conversationPost(postId);
            if (!post) {
                continue;
            }
            if (post.user_id === this.currentUserId) {
                if (!this.statuses.has(postId)) {
                    // A channel may turn out to have no receipts: show nothing there until the server says.
                    const channel = this.state.entities.channels.channels[post.channel_id];
                    this.statuses.set(postId, MESSAGE_TYPES.has(channel.type) ? 'sent' : null);
                    this.staleStatuses.add(postId);
                }
                renderTicks(element, postId, this.statuses.get(postId), this.t, this.openInfo);
            } else if (!this.observed.has(element)) {
                this.observed.add(element);
                this.intersection.observe(element);
            }
        }
        if (this.staleStatuses.size) {
            this.later('status', this.refreshStatuses, 300);
        }
    }

    refreshStatuses = () => {
        const postIds = [...this.staleStatuses];
        this.staleStatuses.clear();
        for (const batch of chunks(postIds)) {
            fetchStatuses(batch).then((statuses) => {
                batch.forEach((id) => this.statuses.set(id, statuses[id] ?? null));
                this.scheduleScan();
            }).catch(reportError);
        }
    };

    // Someone moved their watermark in a conversation: re-check our posts there.
    onReceipt = (msg) => {
        const channelId = msg.data.channel_id;
        for (const [postId, status] of this.statuses) {
            if (status && status !== 'read' && this.state.entities.posts.posts[postId]?.channel_id === channelId) {
                this.staleStatuses.add(postId);
            }
        }
        this.later('status', this.refreshStatuses, 300);
    };

    onStatusSettingChanged = () => {
        this.statuses.forEach((status, postId) => this.staleStatuses.add(postId));
        this.later('status', this.refreshStatuses, 0);
    };

    // A message reached this client over the websocket: it is delivered.
    onPosted = (msg) => {
        if (!TRACKED_TYPES.has(msg.data.channel_type)) {
            return;
        }
        const post = JSON.parse(msg.data.post);
        if (post.user_id === this.currentUserId || this.ignoredChannels.has(post.channel_id)) {
            return;
        }
        this.pendingDelivered.add(post.channel_id);
        this.later('delivered', this.sendDelivered, 500);
    };

    onReconnect = () => {
        this.deliverRecent();
        this.onStatusSettingChanged();
    };

    deliverRecent() {
        const {channels, myMembers} = this.state.entities.channels;
        const since = Date.now() - RECENT_CONVERSATION_MS;
        Object.values(channels).
            filter((c) => TRACKED_TYPES.has(c.type) && !this.ignoredChannels.has(c.id) && myMembers[c.id] && c.last_post_at > since).
            forEach((c) => this.pendingDelivered.add(c.id));
        this.later('delivered', this.sendDelivered, 0);
    }

    sendDelivered = () => {
        const channelIds = [...this.pendingDelivered];
        this.pendingDelivered.clear();
        chunks(channelIds).forEach((batch) => markDelivered(batch).then(this.ignore).catch(reportError));
    };

    onIntersection = (entries) => {
        for (const entry of entries) {
            const postId = postIdFromElementId(entry.target.id);
            if (!postId) {
                continue;
            }
            const visible = entry.intersectionRatio >= VISIBLE_RATIO ||
                entry.intersectionRect.height >= window.innerHeight / 2;
            if (entry.isIntersecting && visible) {
                this.onScreen.set(postId, entry.target);
            } else {
                this.onScreen.delete(postId);
            }
        }
        this.reportOnScreen();
    };

    // Only what is on screen while the window has focus counts as read.
    reportOnScreen = () => {
        if (document.visibilityState !== 'visible' || !document.hasFocus()) {
            return;
        }
        for (const [postId, element] of this.onScreen) {
            if (!element.isConnected) {
                this.onScreen.delete(postId);
                continue;
            }
            const post = this.state.entities.posts.posts[postId];
            if (!post || post.create_at <= (this.reportedReadUpTo.get(post.channel_id) ?? 0)) {
                continue;
            }
            this.reportedReadUpTo.set(post.channel_id, post.create_at);
            this.pendingRead.add(postId);
        }
        if (this.pendingRead.size) {
            this.later('read', this.sendRead, 500);
        }
    };

    sendRead = () => {
        const postIds = [...this.pendingRead];
        this.pendingRead.clear();
        chunks(postIds).forEach((batch) => markRead(batch).then(this.ignore).catch(reportError));
    };

    ignore = (response) => {
        response.ignored_channel_ids.forEach((id) => this.ignoredChannels.add(id));
    };
}
