import { useCallback, useEffect } from 'react';
import { requestLegacyToken, requestOidcToken } from '../../oidc';

type SilentCallbackProps = {
    /** URI to redirect to the silent callback page. **/
    redirectSilentCallbackUri?: string;
};

export const SilentCallback = ({ redirectSilentCallbackUri }: SilentCallbackProps) => {
    const fetchTokens = useCallback(async () => {
        try {
            const { accessToken } = await requestOidcToken({
                redirectCallbackUri: redirectSilentCallbackUri,
            });

            if (accessToken) {
                const legacyTokens = await requestLegacyToken(accessToken);

                window.parent.postMessage({
                    event: 'login_successful',
                    value: legacyTokens,
                });
            }
        } catch (err) {
            console.error('unable to exchange tokens during silent login', err);
            window.parent.postMessage({
                event: 'login_error',
                value: err,
            });
        }
    }, [redirectSilentCallbackUri]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const oneTimeCode = params.get('code');
        const errorType = params.get('error');

        if (errorType === 'login_required') {
            window.parent.postMessage({
                event: 'login_required',
            });
        } else {
            if (oneTimeCode) {
                fetchTokens();
            }
        }
    }, []);

    return <></>;
};
