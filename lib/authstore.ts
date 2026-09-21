/*
  (c) 2020 Open AR Cloud
  This code is licensed under MIT license (see LICENSE.md for details)

  (c) 2024 Nokia
  Licensed under the MIT License
  SPDX-License-Identifier: MIT
*/

import { writable } from 'svelte/store';
import { createAuth0Client, Auth0Client, User } from '@auth0/auth0-spa-js';

export const authStore = createAuthStore();

export const loading = writable(false);
export const authenticated = writable(false);
export const user = writable<User | undefined>(undefined);

/** Dummy user for local/compose no-auth mode (backends use provider/tenant `noauthtest`). */
const NO_AUTH_USER: User = {
    name: 'noauthtest',
    nickname: 'noauthtest',
    sub: 'noauth|noauthtest',
};

function isAuthDisabled(auth_domain: string, auth_client_id: string, auth_audience: string, auth_scope: string): boolean {
    const values = [auth_domain, auth_client_id, auth_audience, auth_scope];
    return values.some((v) => !v || v.trim() === '' || v.trim().toLowerCase() === 'disabled');
}

function createAuthStore(): {
    auth0: Auth0Client | null;
    getToken: () => Promise<string | undefined>;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    init: (auth_domain: string, auth_client_id: string, auth_audience: string, auth_scope: string) => Promise<void>;
} {
    let auth0: Auth0Client | null = null;
    let authDisabled = false;

    // The application using this library should pass the settings as parameters here.
    // Empty or "disabled" config enables local no-auth/dev mode (no Auth0 client).
    async function init(auth_domain: string, auth_client_id: string, auth_audience: string, auth_scope: string) {
        loading.set(true);
        try {
            if (isAuthDisabled(auth_domain, auth_client_id, auth_audience, auth_scope)) {
                auth0 = null;
                authDisabled = true;
                user.set(NO_AUTH_USER);
                authenticated.set(true);
                return;
            }

            authDisabled = false;
            const client = await createAuth0Client({
                domain: auth_domain,
                clientId: auth_client_id,
                authorizationParams: {
                    audience: auth_audience,
                    scope: auth_scope,
                },
            });
            auth0 = client;

            const query = window.location.search;
            if (query.includes('code=') && query.includes('state=')) {
                await client.handleRedirectCallback();
                window.history.replaceState({}, document.title, '/scd');
            }

            user.set(await client.getUser());
            authenticated.set(await client.isAuthenticated());
        } finally {
            loading.set(false);
        }
    }

    async function login() {
        if (authDisabled) {
            return;
        }

        await auth0
            ?.loginWithRedirect({
                authorizationParams: {
                    redirect_uri: `${window.location.origin}/scd/`,
                },
            })
            ?.catch((err) => {
                console.log('Log in failed', err);
            });
    }

    async function logout() {
        if (authDisabled) {
            return;
        }

        await auth0
            ?.logout({
                logoutParams: {
                    returnTo: window.location.origin,
                },
            })
            ?.catch((err) => {
                console.log('Log out failed', err);
            });

        user.set(await auth0?.getUser());
        authenticated.set(false);
    }

    async function getToken() {
        if (authDisabled) {
            return '';
        }
        return await auth0?.getTokenSilently();
    }

    return {
        get auth0() {
            return auth0;
        },
        getToken,
        login,
        logout,
        init,
    };
}
