import { useEffect } from 'react';

export const SilentCallback = () => {
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const oneTimeCode = params.get('code');
        const errorType = params.get('error');

        if (errorType) {
            window.parent.postMessage({
                event: errorType,
            });
        } else if (oneTimeCode) {
            window.parent.postMessage({
                event: 'login_successful',
            });
        }
    }, []);

    return <></>;
};
