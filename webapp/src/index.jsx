import React from 'react';
import {useSelector} from 'react-redux';

import manifest from '../../plugin.json';

import {translator} from './i18n.js';
import InfoModal from './info_modal.jsx';
import {STYLES} from './ticks.js';
import Tracker from './tracker.js';

function currentLocale(state) {
    const {currentUserId, profiles} = state.entities.users;
    return profiles[currentUserId]?.locale || document.documentElement.lang || 'en';
}

class Plugin {
    initialize(registry, store) {
        const locale = currentLocale(store.getState());
        const t = translator(locale);

        this.style = document.createElement('style');
        this.style.textContent = STYLES;
        document.head.appendChild(this.style);

        // The tracker and the post menu open the modal through this one listener.
        let showInfo = () => {};
        const subscribe = (listener) => {
            showInfo = listener;
            return () => {
                showInfo = () => {};
            };
        };
        const openInfo = (postId) => showInfo(postId);

        this.tracker = new Tracker(store, t, openInfo);

        registry.registerRootComponent(() => (
            <InfoModal
                subscribe={subscribe}
                users={useSelector((state) => state.entities.users.profiles)}
                locale={locale}
                t={t}
            />
        ));
        registry.registerPostDropdownMenuAction(t('info'), openInfo, this.tracker.isOwnConversationPost);
        registry.registerWebSocketEventHandler('posted', this.tracker.onPosted);
        registry.registerWebSocketEventHandler(`custom_${manifest.id}_receipt`, this.tracker.onReceipt);
        registry.registerReconnectHandler(this.tracker.onReconnect);
        registry.registerUserSettings({
            id: manifest.id,
            uiName: t('settingsSection'),
            sections: [{
                title: t('settingsSection'),
                settings: [{
                    name: 'read_receipts',
                    type: 'radio',
                    title: t('settingTitle'),
                    helpText: t('settingHelp'),
                    default: 'on',
                    options: [{value: 'on', text: t('on')}, {value: 'off', text: t('off')}],
                }],
                // The server reads the preference on every request; only our cached ticks are stale.
                onSubmit: this.tracker.onStatusSettingChanged,
            }],
        });

        this.tracker.start();
    }

    uninitialize() {
        this.tracker?.stop();
        this.style?.remove();
    }
}

window.registerPlugin(manifest.id, new Plugin());
