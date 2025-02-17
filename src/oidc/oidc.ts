import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { OIDCError, OIDCErrorType } from './error';
import { getServerInfo, getOAuthLogoutUrl } from '../constants';
import { getConfigurations } from './config';
import Cookies from 'js-cookie';

export type OidcConfiguration = {
    issuer: string;
    redirect_uri: string;
    client_id: string;
    response_type: string;
    scope: string;
    post_logout_redirect_uri: string;
};

export type LegacyTokens = {
    acct1: string;
    acct2?: string;
    acct3?: string;
    token1: string;
    token2?: string;
    token3?: string;
    cur1: string;
    cur2?: string;
    cur3?: string;
};

type RequestOidcAuthenticationOptions = {
    redirectCallbackUri?: string;
    postLoginRedirectUri?: string;
    postLogoutRedirectUri?: string;
};

type requestOidcSilentAuthenticationOptions = {
    redirectSilentCallbackUri: string;
};

type RequestOidcTokenOptions = {
    redirectCallbackUri?: string;
    postLogoutRedirectUri?: string;
};

type CreateUserManagerOptions = {
    redirectCallbackUri?: string;
    postLogoutRedirectUri?: string;
};

type OAuth2LogoutOptions = {
    WSLogoutAndRedirect: () => void;
    redirectCallbackUri: string;
    postLogoutRedirectUri: string;
};

type ClearOIDCStorageOptions = {
    redirectCallbackUri: string;
    postLogoutRedirectUri: string;
};

/**
 * Fetches the OIDC configuration for the given serverUrl.
 * @returns {Promise<object>} - A promise resolving to the OIDC configuration.
 * @throws {Error} - If there is a failure while fetching the OIDC configuration.
 */
export const fetchOidcConfiguration = async (): Promise<OidcConfiguration> => {
    const configFromLocalStorage = localStorage.getItem('config.oidc_endpoints');
    if (configFromLocalStorage) {
        const { serverUrl } = getServerInfo();
        const config = JSON.parse(configFromLocalStorage) as OidcConfiguration;
        // we need to check this, because in case when they go to the endpoints page and switch the app ID and server URL
        // we need to invalidate our OIDC configurations cuz its still pointing to the old server URL
        if (config.issuer.includes(serverUrl || '')) return JSON.parse(configFromLocalStorage);
    }

    const { serverUrl } = getServerInfo();
    const oidc_url = `https://${serverUrl}/.well-known/openid-configuration`;

    try {
        const response = await fetch(oidc_url);
        const data = await response.json();

        localStorage.setItem('config.oidc_endpoints', JSON.stringify(data));

        return data;
    } catch (error) {
        console.error('Failed to fetch OIDC configuration:', error);
        if (error instanceof Error) throw new OIDCError(OIDCErrorType.FailedToFetchOIDCConfiguration, error.message);
        throw new OIDCError(OIDCErrorType.FailedToFetchOIDCConfiguration, 'unable to fetch OIDC configuration');
    }
};

/**
 * Initiates the OIDC authentication flow by redirecting to Deriv's authorization server.
 * This is the first step in the OIDC flow, which calls the authorization endpoint and if successful, should redirect back to the callback page.
 *
 * Your application must have a callback page with the `Callback` component from this library, or if not, some page that calls the next few endpoints using `requestOidcToken` and `requestLegacyToken`
 *
 * @param options - Configuration options for the OIDC authentication request
 * @param options.redirectCallbackUri - The callback page URI to redirect back
 * @param options.postLoginRedirectUri - The URI to redirect after the callback page. This is where you usually pass the page URL where you initiated the login flow
 * @param options.postLogoutRedirectUri - The URI where the application should redirect after processing the logout
 *
 * @returns Promise that resolves to an object containing the UserManager instance
 * @throws {OIDCError} With type AuthenticationRequestFailed if the authentication request fails
 *
 * @example
 * ```typescript
 * try {
 *   const { userManager } = await requestOidcAuthentication({
 *     redirectCallbackUri: 'https://smarttrader.deriv.com/en/callback',
 *     postLoginRedirectUri: 'https://smarttrader.deriv.com/en/trading',
 *     postLogoutRedirectUri: https://smarttrader.deriv.com/en/trading''
 *   });
 * } catch (error) {
 *   // Handle authentication request error
 * }
 * ```
 *
 * @remarks
 * - If postLoginRedirectUri is not provided, it defaults to the current window's URL origin, i.e. https://smarttrader.deriv.com instead of https://smarttrader.deriv.com/en/trading
 * - If postLogoutRedirectUri is not provided, it defaults to the current window's origin,  i.e. https://smarttrader.deriv.com instead of https://smarttrader.deriv.com/en/trading
 * - The post login/logout redirect URIs are stored in local storage as `config.post_login_redirect_uri` and `config.post_logout_redirect_uri`
 */
export const requestOidcAuthentication = async (options: RequestOidcAuthenticationOptions) => {
    const { redirectCallbackUri, postLoginRedirectUri, postLogoutRedirectUri } = options;

    // If the post login redirect URI is not specified, redirect the user back to where the OIDC authentication is initiated
    // This will be used later by the Callback component to redirect back to where the OIDC flow is initiated
    localStorage.setItem('config.post_login_redirect_uri', postLoginRedirectUri || window.location.origin);
    // Same as post login redirect URI, if not specified we default to where this function is called for post logout redirect
    localStorage.setItem('config.post_logout_redirect_uri', postLogoutRedirectUri || window.location.origin);

    try {
        const userManager = await createUserManager({
            redirectCallbackUri,
            postLogoutRedirectUri,
        });

        await userManager.signinRedirect({
            extraQueryParams: {
                brand: 'deriv',
            },
        });
        return { userManager };
    } catch (error) {
        console.error('Authentication failed:', error);
        if (error instanceof Error) throw new OIDCError(OIDCErrorType.AuthenticationRequestFailed, error.message);
        throw new OIDCError(OIDCErrorType.AuthenticationRequestFailed, 'unable to request OIDC authentication');
    }
};

export const requestOidcSilentAuthentication = async (options: requestOidcSilentAuthenticationOptions) => {
    const { redirectSilentCallbackUri } = options;

    try {
        const userManager = await createUserManager({
            redirectCallbackUri: redirectSilentCallbackUri,
        });

        await userManager.signinSilent({
            extraQueryParams: {
                brand: 'deriv',
            },
            silentRequestTimeoutInSeconds: 60000,
        });
        return { userManager };
    } catch (error) {
        console.error('Authentication failed:', error);
    }
};

/**
 * Requests access tokens from the authorization server.  * The returned access tokens will be used to fetch the original tokens that can be passed to the `authorize` endpoint.
 *
 * This function should only be called when `requestOidcAuthentication` has been called. Generally this function should be placed within the callback page.
 *
 * @param options - Configuration options for the OIDC token request
 * @param options.redirectCallbackUri - The callback page URI to redirect back
 * @param options.postLogoutRedirectUri - The URI to redirect after successfully logging out
 * @returns Promise that resolves to an object containing the access token
 * @returns {Object} result
 * @returns {string} result.accessToken - The OAuth2/OIDC access token
 *
 * @throws {OIDCError} With type AccessTokenRequestFailed if the token request fails
 *
 * @example
 * ```typescript
 * try {
 *   const { accessToken } = await requestOidcToken({
 *     redirectCallbackUri: 'https://smarttrader.deriv.com/en/callback'
 *   });
 *
 *   // Use the access token for authenticated API calls
 * } catch (error) {
 *   // Handle token request error
 * }
 * ```
 *
 * @remarks
 * - This function should be called on the callback page/route of your application
 * - The function expects the OIDC callback parameters to be present in the URL
 * - The access token can be null if the authentication flow fails or is cancelled
 */
export const requestOidcToken = async (options: RequestOidcTokenOptions) => {
    const { redirectCallbackUri, postLogoutRedirectUri } = options;

    try {
        const userManager = await createUserManager({
            redirectCallbackUri,
            postLogoutRedirectUri,
        });

        const user = await userManager.signinCallback();

        return {
            accessToken: user?.access_token,
        };
    } catch (error) {
        console.error('unable to request access tokens: ', error);
        if (error instanceof Error) throw new OIDCError(OIDCErrorType.AccessTokenRequestFailed, error.message);
        throw new OIDCError(OIDCErrorType.AccessTokenRequestFailed, 'unable to request access tokens');
    }
};

/**
 * Fetches the tokens that will be passed to the `authorize` endpoint.
 *
 * @param {string} accessToken The access token received after calling `requestOidcToken` successfully
 */

/**
 * Fetches the tokens that will be passed to the `authorize` endpoint.
 *
 * @param {string} accessToken - The OAuth2/OIDC access token obtained from `requestOidcToken` function
 * @returns {Promise<LegacyTokens>} A promise that resolves to an object containing the legacy tokens
 *
 * @throws {OIDCError} With type LegacyTokenRequestFailed if the request fails
 *
 * @example
 * ```typescript
 * // YourCallbackPage.tsx
 * try {
 *   const { accessToken } = await requestOidcToken(...)
 *
 *   const legacyTokens = await requestLegacyToken(accessToken);
 *
 * } catch (error) {
 *   // Handle legacy token request error
 * }
 * ```
 */
export const requestLegacyToken = async (accessToken: string): Promise<LegacyTokens> => {
    const { serverUrl } = getServerInfo();

    try {
        const response = await fetch(`https://${serverUrl}/oauth2/legacy/tokens`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });
        const data = await response.json();

        return data;
    } catch (error) {
        console.error('unable to request legacy tokens: ', error);
        if (error instanceof Error) throw new OIDCError(OIDCErrorType.LegacyTokenRequestFailed, error.message);
        throw new OIDCError(OIDCErrorType.LegacyTokenRequestFailed, 'unable to request legacy tokens');
    }
};

/**
 * Revokes legacy tokens by making a POST request to the legacy token revocation endpoint.
 * Once these tokens are revoked, they can no longer be used for authentication.
 *
 * @param {string[]} tokens - An array of legacy tokens (a1-... format) to be revoked. Maximum 20 tokens allowed.
 * All tokens must belong to the same user and app_id.
 * @returns {Promise<void>} A promise that resolves when the tokens are successfully revoked
 *
 * @throws {OIDCError} With type `RevokeTokenRequestFailed` if:
 * - The request fails due to network issues (500 Internal Server Error)
 * - The tokens array is empty or invalid format (400 Bad Request - InvalidPayload)
 * - The tokens are invalid, already revoked, or belong to different users/app_ids (400 Bad Request - InvalidToken)
 * - The number of tokens exceeds the maximum limit of 20 (400 Bad Request - InvalidTokenCount)
 * - Rate limit is exceeded - more than 5 requests per minute (429 Too Many Requests - RateLimit)
 *
 * @example
 * ```typescript
 * try {
 *   const legacyTokens = [
 *     'a1-....',
 *     'a1-....'
 *   ];
 *   await revokeLegacyTokens(legacyTokens);
 *   // Tokens successfully revoked
 * } catch (error) {
 *   if (error instanceof OIDCError) {
 *     // Handle specific revocation errors
 *     console.error(error.message);
 *   }
 * }
 * ```
 */
export const revokeLegacyTokens = async (tokens: string[]): Promise<void> => {
    const { serverUrl } = getServerInfo();

    try {
        await fetch(`https://${serverUrl}/oauth2/legacy/tokens/revoke`, {
            method: 'POST',
            body: JSON.stringify(tokens),
        });
    } catch (error) {
        console.error('unable to request legacy tokens: ', error);
        if (error instanceof Error) throw new OIDCError(OIDCErrorType.RevokeTokenRequestFailed, error.message);
        throw new OIDCError(OIDCErrorType.RevokeTokenRequestFailed, 'unable to revoke legacy tokens');
    }
};

/**
 * Creates a UserManager instance that will be used to manage and call the OIDC flow
 * @param options - Configuration options for the OIDC token request
 * @param options.redirectCallbackUri - The callback page URI to redirect back
 * @param options.postLogoutRedirectUri - The URI to redirect after logging out
 */
export const createUserManager = async (options: CreateUserManagerOptions) => {
    const { redirectCallbackUri, postLogoutRedirectUri } = options;
    const { appId } = getServerInfo();

    const { postLogoutRedirectUri: postLogoutRedirectUriFromStorage } = getConfigurations();

    // if the user does not provide a redirectUri, default to /callback route as the redirect URI
    const _redirectUri = redirectCallbackUri || `${window.location.origin}/callback`;
    const _postLogoutRedirectUri = postLogoutRedirectUri || postLogoutRedirectUriFromStorage || window.location.origin;

    try {
        const oidc_config = await fetchOidcConfiguration();
        const userManager = new UserManager({
            authority: oidc_config.issuer,
            client_id: appId,
            redirect_uri: _redirectUri,
            response_type: 'code',
            scope: 'openid',
            stateStore: new WebStorageStateStore({ store: window.localStorage }),
            post_logout_redirect_uri: _postLogoutRedirectUri,
            // this is enabled by default, it runs a silent renew service in the background which triggers the prompt=none auth calls
            // Source: https://github.com/authts/oidc-client-ts/blob/9ccae8f87b3e9e2df349aaf6f007964ced287b02/src/UserManagerSettings.ts#L140
            // Notable issue: https://github.com/authts/oidc-client-ts/issues/1174
            automaticSilentRenew: false,
        });
        return userManager;
    } catch (error) {
        console.error('unable to create user manager for OIDC: ', error);
        if (error instanceof Error) throw new OIDCError(OIDCErrorType.UserManagerCreationFailed, error.message);
        throw new OIDCError(OIDCErrorType.UserManagerCreationFailed, 'unable to create user manager for OIDC');
    }
};

/**
 * Logs out the user from the auth server and calls the callback function when the logout is complete.
 * @param WSLogoutAndRedirect - The callback function to call after the logout is complete
 */
export const OAuth2Logout = async (options: OAuth2LogoutOptions) => {
    const oidcEndpoints = localStorage.getItem('config.oidc_endpoints') || '{}';

    let logoutUrl = getOAuthLogoutUrl() || JSON.parse(oidcEndpoints).end_session_endpoint;
    // NOTE: Comment this out once front channel is implemented
    // const userManager = await createUserManager({
    //     redirectCallbackUri: options.redirectCallbackUri,
    //     postLogoutRedirectUri: options.postLogoutRedirectUri,
    // });
    // const userState = await userManager.getUser();
    // if (userState?.id_token) {
    //     logoutUrl += `?id_token_hint=${userState.id_token}&post_logout_redirect_uri=${options.postLogoutRedirectUri}`;
    // }

    const cleanup = () => {
        const iframe = document.getElementById('logout-iframe') as HTMLIFrameElement;
        if (iframe) iframe.remove();
        // NOTE: this will resolve issues where once you are logged out, OIDC may reuse the previous user's OIDC ID token / session data
        clearOIDCStorage({
            redirectCallbackUri: options.redirectCallbackUri,
            postLogoutRedirectUri: options.postLogoutRedirectUri,
        });
    };
    const onMessage = (event: MessageEvent) => {
        if (event.data === 'logout_complete') {
            const domains = ['deriv.com', 'binary.sx', 'pages.dev', 'localhost'];
            const currentDomain = window.location.hostname.split('.').slice(-2).join('.');
            if (domains.includes(currentDomain)) {
                Cookies.set('logged_state', 'false', {
                    expires: 30,
                    path: '/',
                    domain: currentDomain,
                    secure: true,
                });
            }
            options.WSLogoutAndRedirect();
            cleanup();
            window.removeEventListener('message', onMessage);
        }
    };

    window.addEventListener('message', onMessage);

    let iframe: HTMLIFrameElement | null = document.getElementById('logout-iframe') as HTMLIFrameElement;
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'logout-iframe';
        iframe.style.display = 'none';
        document.body.appendChild(iframe);
    }

    iframe.src = logoutUrl;

    iframe.onerror = error => {
        console.error('There has been a problem with the logout: ', error);
        cleanup();
    };
};

/**
 * Logs out the user from the OIDC provider using the SignOutRedirect function of the UserManager.
 * @param {RequestOidcAuthenticationOptions} options - Configuration options for the OIDC logout request
 * @param {string} options.redirectCallbackUri - The callback page URI to redirect back
 * @param {string} options.postLogoutRedirectUri - The URI to redirect after successfully logging out
 * @throws {Error} If the ID token is missing in session storage
 */
export const oidcLogout = async (options: RequestOidcAuthenticationOptions): Promise<void> => {
    try {
        const { redirectCallbackUri, postLogoutRedirectUri } = options;

        const { appId } = getServerInfo();

        const oidcConfig = JSON.parse(localStorage.getItem('config.oidc_endpoints') || '{}');
        const serverUrl = oidcConfig.issuer;

        const sessionStorageKey = `oidc.user:${serverUrl}:${appId}`;
        const getSessionStorageOIDCUser = JSON.parse(window.sessionStorage.getItem(sessionStorageKey) || '{}');

        if (!getSessionStorageOIDCUser.id_token) {
            throw new Error('ID token is missing in session storage.');
        }

        const userManager = await createUserManager({
            redirectCallbackUri,
            postLogoutRedirectUri,
        });

        await userManager.signoutRedirect({
            id_token_hint: getSessionStorageOIDCUser.id_token,
            post_logout_redirect_uri: postLogoutRedirectUri,
        });
    } catch (error) {
        console.error('Error during logout:', error);
        throw new Error(`Logout failed. ${error}`);
    }
};

/**
 * Clears any OIDC-related storage (localStorage, sessionStorage, etc) about the current user.
 * There's 2 types of storage `oidc-client-ts` uses: state store, and user store
 * User store is used for storing the access token and ID token
 * Use this function when your application has logged out successfully but the session data is still there, otherwise use `OAuth2Logout` function which already handles this scenario
 *
 */
export const clearOIDCStorage = async (options: ClearOIDCStorageOptions) => {
    try {
        const userManager = await createUserManager(options);

        await userManager.removeUser();
        await userManager.clearStaleState();
    } catch (error) {
        if (error instanceof Error) throw new OIDCError(OIDCErrorType.FailedToRemoveSession, error.message);
        throw new OIDCError(OIDCErrorType.FailedToRemoveSession, 'unable to remove OIDC session');
    }
};

/**
 * Checks if the user has completed the logout flow and calls the callback function from the consumer.
 * At this point the user is already logged out from the auth server. This function is just to clear the FE session. 
 * @description This is because the logout flow oidcLogout is redirecting the user to the post logout redirect uri,
 * so this function needs to be called in your post logout redirect uri to clear the FE session.
 * @param {() => void} callbackFunction - The callback function to call after the logout is complete
 * @example
 * ```typescript
 * React.useEffect(() => {
 *   handlePostLogout(() => {
 *     // localStorage/sessionStorage cleanup
 *   });
 * }, []);
 })
 */
export const handlePostLogout = (callbackFunction: () => void) => {
    const { appId } = getServerInfo();

    const oidcConfig = JSON.parse(localStorage.getItem('config.oidc_endpoints') || '{}');

    const serverUrl = oidcConfig.issuer;

    const sessionStorageKey = `oidc.user:${serverUrl}:${appId}`;

    if (!window.sessionStorage.getItem(sessionStorageKey)) {
        const domains = ['deriv.com', 'binary.sx', 'pages.dev', 'localhost'];
        const currentDomain = window.location.hostname.split('.').slice(-2).join('.');
        if (domains.includes(currentDomain)) {
            Cookies.set('logged_state', 'false', {
                expires: 30,
                path: '/',
                domain: currentDomain,
                secure: true,
            });
        }
        callbackFunction();
    }
};
