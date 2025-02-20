# Auth Client Project

[![Coverage Status](https://coveralls.io/repos/github/deriv-com/auth-client/badge.svg?branch=master)](https://coveralls.io/github/deriv-com/auth-client?branch=master)
[![Coveralls](https://github.com/deriv-com/auth-client/actions/workflows/coveralls.yml/badge.svg)](https://github.com/deriv-com/auth-client/actions/workflows/coveralls.yml)
[![Build and Test](https://github.com/deriv-com/auth-client/actions/workflows/build.yml/badge.svg)](https://github.com/deriv-com/auth-client/actions/workflows/build.yml)
[![Release](https://github.com/deriv-com/auth-client/actions/workflows/publish_npm.yml/badge.svg)](https://github.com/deriv-com/auth-client/actions/workflows/publish_npm.yml)

This project is designed to handle authentication using OAuth2 with Hydra and OIDC. The project is divided into two phases:

1. **Phase 1**: OAuth2 with Hydra
2. **Phase 2**: OIDC Public Client (coming soon)

## Table of Contents

-   [Getting Started](#getting-started)
-   [Project Structure](#project-structure)
-   [Phase 1: OAuth2 with Hydra](#phase-1-oauth2-with-hydra)
-   [Phase 2: OIDC Public Client](#phase-2-oidc-public-client)

## Getting Started

### Prerequisites

-   Node.js (>= 14.x)
-   npm (>= 6.x)

### Installation

1. Clone the repository:

    ```sh
    git clone https://github.com/your-username/auth-client.git
    cd auth-client
    ```

2. Install dependencies:

    ```sh
    npm install
    ```

3. Start the development server:
    ```sh
    npm run dev
    ```

## Phase 1: OAuth2 with Hydra

In this phase, we use OAuth2 with Hydra for authentication.

### Setting Up Hydra

1. Follow the [Hydra documentation](https://service-auth.deriv.team/resources/hydra-qa-setup/) to set up Hydra in QA box environment.
2. Configure your OAuth2 settings in the project.

### Using the OAuth2 Hook

Use the `useOAuth2` hook within your components.

```typescript
import React from 'react';
import { useOAuth2, TOAuth2EnabledAppList } from '@deriv-com/auth-client';

const YourComponent = () => {
     const [OAuth2EnabledApps, OAuth2EnabledAppsInitialised] = useGrowthbookGetFeatureValue<TOAuth2EnabledAppList>({
        featureFlag: 'hydra_be',
    });

    const { logout } = useAuthData(); // Your custom hook or function to handle logout

    const OAuth2GrowthBookConfig = {
       OAuth2EnabledApps,
       OAuth2EnabledAppsInitialised
    };

    const WSLogoutAndRedirect = async () => {
        await logout();
        // Redirect or perform any additional actions here
    };

    const { OAuth2Logout } = useOAuth2(OAuth2GrowthBookConfig, WSLogoutAndRedirect);

    return (
        <div>
            <button onClick={OAuth2Logout}>Logout</button>
        </div>
    );
};

export default YourComponent;

```

## Phase 2: OIDC Public Client

At Deriv, we are implementing Hydra and OpenID Connect (OIDC) to modernize and enhance our authentication and authorization mechanisms. This transition is crucial for ensuring secure, scalable, and standards-compliant access management for our applications and users.

### Implementation Details

Most of the setup and implementation is already done in this library in the background. Just need to import a few things are you're good to go.

### Login Flow

-   Login button component

```typescript
import {requestOidcAuthentication } from '@deriv-com/auth-client';

 const handleLogin = async () => {
      await requestOidcAuthentication({
        redirectCallbackUri: `${window.location.origin}/callback`,
      });
  };

<button onClick={handleLogin}>Login</button>
```

### Callback Page

You would need to create a new route and page for this section in your app. This page will handle the legacy token issuance to the consumer apps.

```typescript
import React from 'react';
import { Callback } from '@deriv-com/auth-client';
import { transformAccountsFromResponseBody } from '@site/src/utils';
import useAuthContext from '@site/src/hooks/useAuthContext';

const CallbackPage = () => {
  const { updateLoginAccounts } = useAuthContext();

  return (
    <Callback
      onSignInSuccess={(tokens) => {
        const accounts = transformAccountsFromResponseBody(tokens);

        updateLoginAccounts(accounts);

        window.location.href = '/';
      }}
    />
  );
};

export default CallbackPage;
```

The tokens returned from the onSignInSuccess will be of this format:

```typescript
{
  acct1: 'CR123123',
  curr1: 'USD',
  token1: 'a1-zxcnzxchzxc1'
  acct2: 'CR998989',
  curr2: 'EUR',
  token2: 'a1-fidifdf0991',
  ...
}
```

You need to convert the tokens into a format that your app understands and works with. Once that’s done, save them securely in localStorage or sessionStorage.

Most of the apps are already set up to look for things like client-accounts or accountsList in storage. If it finds them, it will automatically authorize the user in. Therefore after transforming the tokens and storing them its very crucial to redirect to the main page of your app, so the app can authorize successfully.

Once the legacy tokens are sent to the consumer apps, the library assumes that the user is logged in therefore it sets a cookie called logged_state to true. This will be helpful for the silent login and single logout feature.

Note : The callback page does NOT handle authorize calls. Its sole purpose is to do the access token exchange and return back the legacy tokens to the consumer apps.

## Logout Flow

This logout process combines two parts: clearing OAuth session cookies through the OAuth2Logout function and running custom cleanup logic specific to your app (like clearing user accounts or tokens). Let’s break it down step-by-step:

1. This function is provided by the @deriv-com/auth-client library. It uses an iframe to redirect the user to the end session endpoint of the OAuth provider. The main job of OAuth2Logout is to clear any cookies set by the OAuth system during the login session. Your App's Custom Logout Logic.

2. In addition to clearing OAuth cookies, your app needs to handle its own logout tasks, such as: Logging the user out from the backend (via API or WebSocket calls). Clearing stored user data (like tokens or account information) from localStorage or sessionStorage.

3. Combining Both The OAuth2Logout function allows you to pass your custom logout logic (called the consumer logout function) as a parameter. Once the OAuth session cookies are cleared, the consumer logout function runs to ensure the user is fully logged out from both the backend (BE) and frontend (FE).

4. Once the logout is completed, the cookie logged_state will be set to false.

5. Once the user has succesfully logged out of Hydra, we should revoke their legacy tokens (e.g. a1-...). We can do this by calling the function `revokeLegacyTokens` and passing in the list of legacy tokens to revoke. Typically you should do this inside your logout handler, which this is invoked after Hydra has successfully logged the user's session out.

```typescript
import { OAuth2Logout, revokeLegacyTokens } from '@deriv-com/auth-client';

// we clean up everything related to the user here, for now it's just user's account
// later on we should clear user tokens as well
const logout = useCallback(async () => {
    const clientAccounts = localStorage.getItem('client.accounts') || []
    const tokens = Object.values(clientAccounts).map(account => account.token);
    // revoke the legacy tokens,
    await revokeLegacyTokens(tokens);
    // then call your application's post-logout cleanup functions
    await apiManager.logout();
    updateLoginAccounts([]);
    updateCurrentLoginAccount({
      name: '',
      token: '',
      currency: '',
    });
}, [updateCurrentLoginAccount, updateLoginAccounts]);

const handleLogout = () => {
    OAuth2Logout(logout);
};

// In your button
<button onClick={handleLogout}>Logout</button>
```

## Logout Front Channels

Front channels are pages in your application which sole responsibility is to clear local/session storage of your authentication data like `client.accounts` or `loginid` when its rendered. This will be used and invoked by OIDC in an iframe during the logout process to log your application out and clear its local/session storage, so that when we land in the application, it will already be in a logged out state. Typically we register front channels under the route `/front-channel`.

For instance, assume that you are already logged in on Deriv App, SmartTrader and Traders Hub Outsystems, and that these applications have front channels implemented on routes like:

-   `https://app.deriv.com/front-channel`
-   `https://smarttrader.deriv.com/front-channel` and
-   `https://hub.deriv.com/tradershub/front-channel`

Then assume that you are logging out from Deriv.app. When you click the Logout button, in the background Hydra checks any of its registered applications that has the front channels logout route and has a session, and automatically invokes the route using an iframe like:

```
<iframe src="https://app.deriv.com/front-channel?iss=https://oauth.deriv.com&sid=..."></iframe>
<iframe src="https://smarttrader.deriv.com/front-channel?iss=https://oauth.deriv.com&sid=..."></iframe>
<iframe src="https://hub.deriv.com/tradershub/front-channel?iss=https://oauth.deriv.com&sid=..."></iframe>
```

Which will automatically clear the local/session storage for authentication data within SmartTrader and Traders Hub Outsystems, so that when the user navigates to SmartTrader or Traders Hub Outsystems, they are already in a logged out state since their `client.accounts` is already cleared off the local storage.

Once the route and page is implemented, you will need to notify the authentication squad or DevOps to register the front channel logout URI in order for Hydra to invoke it during the logout flow.
