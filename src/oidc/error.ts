export enum OIDCErrorType {
    FailedToFetchOIDCConfiguration = 'FailedToFetchOIDCConfiguration',
    AuthenticationRequestFailed = 'AuthenticationRequestFailed',
    AccessTokenRequestFailed = 'AccessTokenRequestFailed',
    LegacyTokenRequestFailed = 'LegacyTokenRequestFailed',
    UserManagerCreationFailed = 'UserManagerCreationFailed',
    OneTimeCodeMissing = 'OneTimeCodeMissing',
}

export class OIDCError extends Error {
    type: OIDCErrorType;

    constructor(type: OIDCErrorType, message: string) {
        super(message);
        this.name = type;
        this.type = type;
    }
}
