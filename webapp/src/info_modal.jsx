import React from 'react';

import {fetchInfo} from './api.js';
import {formatWhen} from './i18n.js';
import {ticksMarkup} from './ticks.js';

function displayName(user) {
    if (!user) {
        return '…';
    }
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
    return user.nickname || fullName || user.username;
}

function Row({user, when, locale, t}) {
    return (
        <div className='rr-info__row'>
            <img
                className='rr-info__avatar'
                src={`${window.basename || ''}/api/v4/users/${user.id}/image?_=${user.last_picture_update || 0}`}
                alt=''
            />
            <span className='rr-info__name'>{displayName(user)}</span>
            <span className='rr-info__when'>{when ? formatWhen(when, locale, t) : t('pending')}</span>
        </div>
    );
}

function Section({state, title, rows, field, users, locale, t}) {
    if (!rows.length) {
        return null;
    }
    return (
        <>
            <div className='rr-info__section'>
                <span
                    className={`rr-ticks rr-ticks--${state}`}
                    dangerouslySetInnerHTML={{__html: ticksMarkup(state)}}
                />
                {title}
            </div>
            {rows.map((r) => (
                <Row
                    key={r.user_id}
                    user={users[r.user_id] || {id: r.user_id}}
                    when={r[field]}
                    locale={locale}
                    t={t}
                />
            ))}
        </>
    );
}

// WhatsApp's "Message info": who read the post and who only got it, with times.
export default function InfoModal({subscribe, users, locale, t}) {
    const [postId, setPostId] = React.useState(null);
    const [info, setInfo] = React.useState(null);
    const [failed, setFailed] = React.useState(false);

    React.useEffect(() => subscribe(setPostId), [subscribe]);

    React.useEffect(() => {
        if (!postId) {
            return undefined;
        }
        setInfo(null);
        setFailed(false);
        let current = true;
        fetchInfo(postId).then((data) => current && setInfo(data)).catch(() => current && setFailed(true));
        const onKey = (event) => event.key === 'Escape' && setPostId(null);
        document.addEventListener('keydown', onKey);
        return () => {
            current = false;
            document.removeEventListener('keydown', onKey);
        };
    }, [postId]);

    if (!postId) {
        return null;
    }
    const recipients = info?.recipients ?? [];
    const read = recipients.filter((r) => r.read_at);
    const notRead = recipients.filter((r) => !r.read_at);
    return (
        <div
            className='rr-info__backdrop'
            onClick={() => setPostId(null)}
        >
            <div
                className='rr-info'
                role='dialog'
                aria-label={t('info')}
                onClick={(event) => event.stopPropagation()}
            >
                <div className='rr-info__header'>
                    <h2 className='rr-info__title'>{t('info')}</h2>
                    <button
                        type='button'
                        className='rr-info__close'
                        aria-label={t('close')}
                        onClick={() => setPostId(null)}
                    >
                        {'×'}
                    </button>
                </div>
                {failed && <p className='rr-info__note'>{t('loadError')}</p>}
                <Section
                    state='read'
                    title={t('readBy')}
                    rows={read}
                    field='read_at'
                    users={users}
                    locale={locale}
                    t={t}
                />
                <Section
                    state='delivered'
                    title={t('deliveredTo')}
                    rows={notRead}
                    field='delivered_at'
                    users={users}
                    locale={locale}
                    t={t}
                />
                {info?.read_hidden && <p className='rr-info__note'>{t('readHidden')}</p>}
            </div>
        </div>
    );
}
