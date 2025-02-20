export enum OIDCErrorType {
    FailedToFetchOIDCConfiguration = 'FailedToFetchOIDCConfiguration',
    AuthenticationRequestFailed = 'AuthenticationRequestFailed',
    AccessTokenRequestFailed = 'AccessTokenRequestFailed',
    LegacyTokenRequestFailed = 'LegacyTokenRequestFailed',
    RevokeTokenRequestFailed = 'RevokeTokenRequestFailed',
    UserManagerCreationFailed = 'UserManagerCreationFailed',
    OneTimeCodeMissing = 'OneTimeCodeMissing',
    FailedToRemoveSession = 'FailedToRemoveSession',
}

export class OIDCError extends Error {
    type?: OIDCErrorType;

    constructor(type: OIDCErrorType, message: string) {
        super(message);
        this.name = type;
        this.type = type;
    }
}
