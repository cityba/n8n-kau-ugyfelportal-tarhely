"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.kauCredentials = void 0;
class kauCredentials {
    constructor() {
        this.name = 'kauCredentials';
        this.displayName = 'KAÜ Ügyfélportál és Tárhely';
        this.icon = 'file:kauugy.png';
        this.documentationUrl = '';
        this.properties = [
            {
                displayName: 'Felhasználónév',
                name: 'username',
                type: 'string',
                default: '',
            },
            {
                displayName: 'Jelszó',
                name: 'password',
                type: 'string',
                typeOptions: {
                    password: true,
                },
                default: '',
            },
            {
                displayName: 'Hitelesítő kulcs',
                name: 'kauKey',
                type: 'string',
                default: '',
            },
        ];
    }
}
exports.kauCredentials = kauCredentials;
