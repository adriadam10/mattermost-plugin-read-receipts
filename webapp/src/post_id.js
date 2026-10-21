// Post elements are `post_<id>` in the center channel and `rhsPost_<id>` in threads.
const POST_ELEMENT_ID = /^(?:post|rhsPost)_([a-z0-9]{26})$/;

export function postIdFromElementId(id) {
    return id.match(POST_ELEMENT_ID)?.[1] ?? null;
}
