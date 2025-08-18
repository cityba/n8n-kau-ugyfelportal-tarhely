"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.kauUgyfelkapualap = void 0;
const axios_1 = __importDefault(require("axios"));
const tough = __importStar(require("tough-cookie"));
const axios_cookiejar_support_1 = require("axios-cookiejar-support");
const cheerio = __importStar(require("cheerio"));
const crypto = __importStar(require("crypto"));
function base32Decode(input) {
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    const output = [];
    input = input.toUpperCase().replace(/=+$/, '');
    for (const char of input) {
        const val = base32Chars.indexOf(char);
        if (val === -1)
            throw new Error('Invalid character in base32 string');
        bits += val.toString(2).padStart(5, '0');
    }
    for (let i = 0; i < bits.length; i += 8) {
        const chunk = bits.substring(i, i + 8);
        if (!chunk)
            continue;
        output.push(parseInt(chunk, 2));
    }
    return Buffer.from(output);
}
function generateTOTP(secret, timeSlice) {
    if (!timeSlice)
        timeSlice = Math.floor(Date.now() / 1000 / 30);
    const secretKey = base32Decode(secret);
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigInt64BE(BigInt(timeSlice), 0);
    const hmac = crypto.createHmac('sha1', secretKey);
    hmac.update(timeBuffer);
    const digest = hmac.digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const codeBytes = digest.slice(offset, offset + 4);
    const code = codeBytes.readUInt32BE() & 0x7fffffff;
    return (code % 1000000).toString().padStart(6, '0');
}
function parseHtmlForm(html) {
    const $ = cheerio.load(html);
    const form = $('form').first();
    if (!form.length)
        return { action: null, method: 'get', fields: {} };
    const action = form.attr('action') || null;
    const method = (form.attr('method') || 'get').toLowerCase();
    const fields = {};
    $('input', form).each((_, el) => {
        const name = $(el).attr('name');
        const value = $(el).attr('value') || '';
        if (name)
            fields[name] = value;
    });
    return { action, method, fields };
}
async function navLogin(client, link, username, password, kauKey) {
    let response = await client.get(link);
    let formData = parseHtmlForm(response.data);
    // Check if already logged in
    if (!formData.action || !formData.fields || Object.keys(formData.fields).length === 0) {
        return response.data;
    }
    response = await client.post(formData.action || link, new URLSearchParams(formData.fields).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const $ = cheerio.load(response.data);
    const xValue = $('input[name="x"]').val();
    const yValue = $('input[name="y"]').val();
    if (!xValue || !yValue)
        throw new Error('x or y values not found');
    let samlRequest = null;
    let relayState = null;
    let csrf = null;
    for (let attempt = 1; attempt <= 10; attempt++) {
        const postData = new URLSearchParams({
            authServiceUri: 'urn:eksz.gov.hu:1.0:azonositas:kau:2:uk:totp',
            x: Array.isArray(xValue) ? xValue[0] : xValue,
            y: Array.isArray(yValue) ? yValue[0] : yValue
        });
        response = await client.post('https://kau.gov.hu/proxy/saml/authservice', postData.toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': `https://kau.gov.hu/proxy/saml/authservice?x=${xValue}&y=${yValue}`
            }
        });
        const samlReqMatch = response.data.match(/name="SAMLRequest"\s+value="([^"]+)"/);
        const relayMatch = response.data.match(/name="RelayState"\s+value="([^"]+)"/);
        const csrfM = response.data.match(/name="_csrf"\s+value="([^"]+)"/);
        if (samlReqMatch && relayMatch) {
            samlRequest = samlReqMatch[1];
            relayState = relayMatch[1];
            csrf = csrfM ? csrfM[1] : null;
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (!samlRequest || !relayState)
        throw new Error('SAMLRequest or RelayState not found');
    // URL paraméterek összeállítása
    const params = new URLSearchParams({
        RelayState: relayState,
        SAMLRequest: samlRequest
    });
    if (csrf)
        params.append('_csrf', csrf);
    response = await client.post('https://idp.gov.hu/idp/saml/authnrequest/start', params.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const form = parseHtmlForm(response.data);
    const newX = form.fields['x'];
    const newY = form.fields['y'];
    if (!newX || !newY)
        throw new Error('New x or y values not found');
    const loginData = {
        x: newX,
        y: newY,
        felhasznaloNev: username,
        jelszo: password,
        submit: ''
    };
    response = await client.post(`https://idp.gov.hu/idp/saml/authnrequest?x=${newX}`, new URLSearchParams(loginData).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    if (response.data.includes('Hitelesítő kód')) {
        if (!kauKey)
            throw new Error('TOTP required but no KAU key provided');
        const totpForm = parseHtmlForm(response.data);
        const yTotp = totpForm.fields['y'];
        if (!yTotp)
            throw new Error('y value for TOTP not found');
        const otp = generateTOTP(kauKey);
        const totpData = {
            x: newX,
            y: yTotp,
            token: otp,
            submit: ''
        };
        response = await client.post(`https://idp.gov.hu/idp/saml/authnrequest?x=${newX}`, new URLSearchParams(totpData).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    }
    const samlRespMatch = response.data.match(/name="SAMLResponse"\s+value="([^"]+)"/);
    const relayMatch2 = response.data.match(/name="RelayState"\s+value="([^"]+)"/);
    if (!samlRespMatch || !relayMatch2)
        throw new Error('SAMLResponse or RelayState not found');
    response = await client.post('https://kau.gov.hu/proxy/saml/response', new URLSearchParams({
        RelayState: relayMatch2[1],
        SAMLResponse: samlRespMatch[1]
    }).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    const finalForm = parseHtmlForm(response.data);
    if (!finalForm.action)
        throw new Error('Final form action not found');
    response = await client.post(finalForm.action, new URLSearchParams(finalForm.fields).toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
    return response.data;
}
async function targhelyLogin(client) {
    // Step 1: Get Tárhely login page
    let response = await client.get('https://tarhely.gov.hu/levelezes/login');
    const form1 = parseHtmlForm(response.data);
    if (!form1.action || !form1.fields) {
        throw new Error('Initial login form not found');
    }
    // Step 2: Send to KAU authentication service
    const formData = new URLSearchParams({
        '_csrf': form1.fields['_csrf'],
        'SAMLRequest': form1.fields['SAMLRequest'],
        'RelayState': form1.fields['RelayState']
    });
    response = await client.post('https://kau.gov.hu/proxy/saml/authnrequest', formData.toString(), {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': 'https://tarhely.gov.hu/levelezes/login'
        }
    });
    // Step 3: Extract IDP login form
    const idpForm = parseHtmlForm(response.data);
    if (!idpForm.action || !idpForm.fields) {
        const $ = cheerio.load(response.data);
        const errorMessage = $('.error-message, .alert-danger').text().trim() ||
            $('title').text().trim() ||
            'Unknown error during IDP form extraction';
        throw new Error(`IDP login form not found: ${errorMessage}`);
    }
    // Step 4: Submit to IDP
    response = await client.post(idpForm.action, new URLSearchParams(idpForm.fields).toString(), {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Referer': response.config.url
        }
    });
    return response.data;
}
class kauUgyfelkapualap {
    constructor() {
        this.description = {
            displayName: 'KAÜ Ügyfélportál és Tárhely',
            name: 'kauUgyfelPortal',
            icon: 'file:kauugy.png',
            group: ['transform'],
            version: 1,
            subtitle: '={{$parameter["operation"]}}',
            description: 'Interakció a KAÜ Ügyfélportállal és Tárhely szolgáltatással',
            defaults: {
                name: 'KAÜ Ügyfélportál és Tárhely',
            },
            inputs: ["main" /* NodeConnectionType.Main */],
            outputs: ["main" /* NodeConnectionType.Main */],
            credentials: [
                {
                    name: 'kauCredentials',
                    required: true,
                },
            ],
            properties: [
                {
                    displayName: 'Művelet',
                    name: 'operation',
                    type: 'options',
                    noDataExpression: true,
                    options: [
                        {
                            name: 'Adószámla Letöltés',
                            value: 'adoszamla',
                            description: 'Cég adószámlájának letöltése PDF formátumban',
                            action: 'Adószámla letöltése',
                        },
                        {
                            name: 'Cégprofilok Listázása',
                            value: 'companyList',
                            description: 'Elérhető cégprofilok listájának lekérése',
                            action: 'Cégprofilok listázása',
                        },
                        {
                            name: 'TB Adat Letöltés',
                            value: 'tbAdat',
                            description: 'TB adatok exportálása',
                            action: 'TB adatok letöltése',
                        },
                        {
                            name: 'Törzsadat Letöltés',
                            value: 'torzsAdat',
                            description: 'Cég törzsadatainak letöltése',
                            action: 'Törzsadatok letöltése',
                        },
                        {
                            name: 'Tárhely Levelek Lista',
                            value: 'targylevelek',
                            description: 'Tárhely postaládában lévő levelek listázása',
                            action: 'Levelek listázása',
                        },
                        {
                            name: 'Tárhely Üzenet Letöltés',
                            value: 'targyuzenetletoltes',
                            description: 'Tárhely üzenet letöltése',
                            action: 'Üzenet letöltése',
                        },
                    ],
                    default: 'adoszamla',
                },
                {
                    displayName: 'Cég',
                    name: 'companyId',
                    type: 'options',
                    typeOptions: {
                        loadOptionsMethod: 'getCompanyOptions',
                    },
                    displayOptions: {
                        show: {
                            operation: ['adoszamla', 'tbAdat', 'torzsAdat'],
                        },
                    },
                    default: '',
                    description: 'Válassza ki a céget',
                },
                {
                    displayName: 'Postaláda',
                    name: 'mailboxId',
                    type: 'options',
                    typeOptions: {
                        loadOptionsMethod: 'getMailboxOptions',
                    },
                    displayOptions: {
                        show: {
                            operation: ['targyuzenetletoltes'],
                        },
                    },
                    default: '',
                    description: 'Válassza ki a postaládát',
                },
                {
                    displayName: 'Üzenet',
                    name: 'uzenet_szam',
                    type: 'options',
                    typeOptions: {
                        loadOptionsDependsOn: ['mailboxId'],
                        loadOptionsMethod: 'getMessageOptions',
                    },
                    displayOptions: {
                        show: {
                            operation: ['targyuzenetletoltes'],
                        },
                    },
                    default: '',
                    description: 'Válassza ki a letölteni kívánt üzenetet',
                },
                {
                    displayName: 'Dátumtartomány (napok)',
                    name: 'days',
                    type: 'number',
                    displayOptions: {
                        show: {
                            operation: ['targylevelek'],
                        },
                    },
                    default: 60,
                    description: 'Hány napra visszamenőleg listázzuk az üzeneteket',
                },
                {
                    displayName: 'Dátumtartomány kezdete',
                    name: 'startDate',
                    type: 'dateTime',
                    displayOptions: {
                        show: {
                            operation: ['adoszamla', 'tbAdat'],
                        },
                    },
                    default: '',
                    description: 'A jelentés kezdő dátuma',
                },
                {
                    displayName: 'Dátumtartomány vége',
                    name: 'endDate',
                    type: 'dateTime',
                    displayOptions: {
                        show: {
                            operation: ['adoszamla', 'tbAdat'],
                        },
                    },
                    default: '',
                    description: 'A jelentés záró dátuma',
                },
                {
                    displayName: 'Tartóstárba helyez',
                    name: 'moveToPermanent',
                    type: 'boolean',
                    displayOptions: {
                        show: {
                            operation: ['targyuzenetletoltes'],
                        },
                    },
                    default: false,
                    description: 'Az üzenet áthelyezése a tartóstárba letöltés után',
                },
            ],
        };
        this.methods = {
            loadOptions: {
                async getCompanyOptions() {
                    const credentials = await this.getCredentials('kauCredentials');
                    const cookieJar = new tough.CookieJar();
                    const client = (0, axios_cookiejar_support_1.wrapper)(axios_1.default.create({
                        jar: cookieJar,
                        validateStatus: () => true,
                        withCredentials: true
                    }));
                    await navLogin(client, 'https://ugyfelportal.nav.gov.hu/api/v1/user/login/start-kaulogin', credentials.username, credentials.password, credentials.kauKey);
                    const response = await client.get('https://ugyfelportal.nav.gov.hu/api/v1/user/profil/adozoi-profil-page?page=0&size=5000&megnevezes=', { headers: { 'Content-Type': 'application/json' } });
                    if (response.status !== 200) {
                        throw new Error('Cégprofilok lekérése sikertelen');
                    }
                    return response.data.content.map((company) => ({
                        name: company.megnevezes,
                        value: company.id,
                        adoszam: company.torzsszam,
                    }));
                },
                async getMailboxOptions() {
                    const credentials = await this.getCredentials('kauCredentials');
                    const cookieJar = new tough.CookieJar();
                    const client = (0, axios_cookiejar_support_1.wrapper)(axios_1.default.create({
                        jar: cookieJar,
                        validateStatus: () => true,
                        withCredentials: true
                    }));
                    await navLogin(client, 'https://tarhely.gov.hu/levelezes/login', credentials.username, credentials.password, credentials.kauKey);
                    // Tárhely bejelentkezés
                    // Postaládák lekérése
                    const response = await client.get('https://tarhely.gov.hu/levelezes/api/mailbox/reload', { headers: { 'Content-Type': 'application/json' } });
                    if (response.status !== 200) {
                        throw new Error('Postaládák lekérése sikertelen');
                    }
                    return response.data.map((mailbox) => ({
                        name: mailbox.name, // JAVÍTVA: name helyett mailbox.name
                        value: mailbox.azonosito,
                        description: `Adószám: ${mailbox.mailboxName}`,
                    }));
                },
                async getMessageOptions() {
                    const credentials = await this.getCredentials('kauCredentials');
                    const mailboxId = this.getNodeParameter('mailboxId');
                    const days = 60;
                    const cookieJar = new tough.CookieJar();
                    const client = (0, axios_cookiejar_support_1.wrapper)(axios_1.default.create({
                        jar: cookieJar,
                        validateStatus: () => true,
                        withCredentials: true
                    }));
                    await navLogin(client, 'https://tarhely.gov.hu/levelezes/login', credentials.username, credentials.password, credentials.kauKey);
                    // Tárhely bejelentkezés
                    // XSRF token lekérése - JAVÍTOTT DOMAIN
                    const cookies = cookieJar.getCookiesSync('https://tarhely.gov.hu/levelezes');
                    const xsrfCookie = cookies.find((c) => c.key === 'XSRF-TOKEN');
                    const xsrfToken = xsrfCookie ? decodeURIComponent(xsrfCookie.value) : '';
                    // Üzenetek lekérése
                    const sinceDate = new Date();
                    sinceDate.setDate(sinceDate.getDate() - days);
                    const sinceISO = sinceDate.toISOString();
                    const payload = {
                        pageNumber: 0,
                        countPerPage: 100,
                        filter: {
                            searchTerm: null,
                            labelIds: null,
                            unreadOnly: null,
                            exludeSystemMessages: true,
                            messageTypes: [],
                            verificationTypes: [],
                            incomingFromDate: sinceISO,
                            incomingToDate: null
                        }
                    };
                    const messagesResponse = await client.post(`https://tarhely.gov.hu/levelezes/api/uzenetek/BEERKEZETT/kereses`, payload, {
                        headers: {
                            'Content-Type': 'application/json',
                            'Address-Id': mailboxId,
                            'X-Xsrf-Token': xsrfToken
                        }
                    });
                    if (messagesResponse.status !== 200) {
                        throw new Error('Üzenetek lekérése sikertelen');
                    }
                    const messages = messagesResponse.data?.uzenetek || [];
                    return messages.map((msg) => {
                        // Az üzenet nevének összeállítása
                        const subject = msg.targy || 'Nincs tárgy';
                        const sender = msg.feladoNev || 'Ismeretlen feladó';
                        const date = msg.erkezesDatuma || 'Ismeretlen dátum';
                        // JAVÍTVA: erkeztetesiSzam használata azonosítóként
                        return {
                            name: `${subject} (${sender})`,
                            value: msg.erkeztetesiSzam,
                            description: `Küldve: ${date}`,
                        };
                    });
                }
            }
        };
    }
    async execute() {
        const credentials = await this.getCredentials('kauCredentials');
        const operation = this.getNodeParameter('operation', 0);
        const cookieJar = new tough.CookieJar();
        const client = (0, axios_cookiejar_support_1.wrapper)(axios_1.default.create({
            jar: cookieJar,
            validateStatus: () => true,
            withCredentials: true
        }));
        // Helper functions
        const getCompanyDetailsById = async (client, companyId) => {
            const response = await client.get('https://ugyfelportal.nav.gov.hu/api/v1/user/profil/adozoi-profil-page?page=0&size=5000&megnevezes=', { headers: { 'Content-Type': 'application/json' } });
            if (response.status !== 200) {
                throw new Error('Cégprofilok lekérése sikertelen');
            }
            const company = response.data.content.find((c) => c.id === companyId);
            if (!company) {
                throw new Error(`Cég nem található ezzel az azonosítóval: ${companyId}`);
            }
            return {
                id: company.id,
                adoszam: company.torzsszam,
                megnevezes: company.megnevezes
            };
        };
        const getCompanyNameById = async (client, companyId) => {
            const details = await getCompanyDetailsById(client, companyId);
            return details.megnevezes;
        };
        const handleCompanyList = async (client) => {
            try {
                const response = await client.get('https://ugyfelportal.nav.gov.hu/api/v1/user/profil/adozoi-profil-page?page=0&size=5000&megnevezes=', { headers: { 'Content-Type': 'application/json' } });
                if (response.status !== 200) {
                    throw new Error('Cégprofilok lekérése sikertelen');
                }
                const companies = response.data.content.map((item) => ({
                    id: item.id,
                    adoszam: item.torzsszam,
                    megnevezes: item.megnevezes,
                }));
                return [companies.map((item) => ({ json: item }))];
            }
            catch (error) {
                const err = error;
                throw new Error(`Hiba a cégprofilok lekérdezésekor: ${err.message}`);
            }
        };
        const changeCompany = async (client, companyId) => {
            const response = await client.put('https://ugyfelportal.nav.gov.hu/api/v1/user/login/change-kepviselet', { adozoiProfilId: companyId }, { headers: { 'Content-Type': 'application/json' } });
            if (response.status !== 200) {
                throw new Error(`Cégváltás sikertelen: ${response.status}`);
            }
        };
        const generateTb = async (client, companyId, startDate, endDate) => {
            const startd = new Date(startDate);
            const endd = new Date(endDate);
            const firstDayLastMonth = new Date(startd.getFullYear(), startd.getMonth() - 1, 1);
            const lastDayLastMonth = new Date(endd.getFullYear(), endd.getMonth(), 0);
            const listUrl = `https://ugyfelportal.nav.gov.hu/api/foglalkoztato-lekerdezesek/biztositotti-fajlba/adozoi-profilok/${companyId}/eredmenyek?page=0&size=10`;
            const listResponse = await client.post(listUrl, {
                params: {
                    adozoiProfilId: companyId,
                    rendezes: "LEKERDEZESIIDOCSOKKENO"
                },
                headers: { Accept: 'application/json' }
            });
            if (listResponse.status !== 200) {
                throw new Error(`Biztosítottak lista lekérdezése sikertelen: ${listResponse.status}`);
            }
            const existingResults = listResponse.data?.content ?? [];
            let foundResult = null;
            for (const item of existingResults) {
                try {
                    const startStr = item?.idoszakKezdeteDat?.naptolDtoNapKezdete?.slice(0, 10);
                    const endStr = item?.idoszakVegeDat?.napigDtoKovNapKezdete?.slice(0, 10);
                    if (!startStr || !endStr)
                        continue;
                    const startD = new Date(startStr);
                    const endD = new Date(endStr);
                    if (startD <= firstDayLastMonth &&
                        endD >= lastDayLastMonth &&
                        (item?.lekerdezesEredmenyId ?? 0) > 1) {
                        foundResult = item;
                        break;
                    }
                }
                catch (e) {
                    console.error(`Hiba a dátum feldolgozásban: ${e}`);
                }
            }
            let lekerdezesId = null;
            if (foundResult) {
                lekerdezesId = foundResult.lekerdezesId;
            }
            else {
                const payload = {
                    adozoiProfilId: companyId,
                    lang: "hu",
                    bejelentesNapja: null,
                    nev: null,
                    nevAdoszam: null,
                    adatlapStatusz: null,
                    adoazonosito: null,
                    lekerdezesiIdoszakKezdete: {
                        naptolDtoNapKezdete: `${firstDayLastMonth.toISOString().split('T')[0]}T00:00:00.000000`
                    },
                    lekerdezesiIdoszakVege: {
                        napigDtoKovNapKezdete: `${lastDayLastMonth.toISOString().split('T')[0]}T23:59:59.999999`
                    }
                };
                const createResponse = await client.post('https://ugyfelportal.nav.gov.hu/api/foglalkoztato-lekerdezesek/biztositotti-fajlba', payload, { headers: { 'Content-Type': 'application/json' } });
                if (createResponse.status !== 200) {
                    throw new Error(`Biztosítottak lista kérése sikertelen: ${createResponse.status}`);
                }
                lekerdezesId = createResponse.data?.id ?? null;
                if (!lekerdezesId) {
                    throw new Error("Lekérdezés azonosító nem található");
                }
                await new Promise(res => setTimeout(res, 5000));
            }
            if (!lekerdezesId) {
                throw new Error("Nincs érvényes lekérdezés azonosító");
            }
            return lekerdezesId;
        };
        const generateOrFindAdoszamla = async (client, companyId, startDate, endDate) => {
            const today = new Date().toISOString().split('T')[0];
            const utResponse = await client.get(`https://ugyfelportal.nav.gov.hu/api/adoszamlak/utolso`, {
                params: { adozoiProfilId: companyId },
                headers: { Accept: 'application/json' },
            });
            if (utResponse.status === 200) {
                const utData = utResponse.data;
                if (utData.adoszamlaTipus === 'TETELES' &&
                    utData.allapot === 'FELDOLGOZOTT' &&
                    utData.lekerdezesIdo?.startsWith(today)) {
                    return utData.lekerdezesEredmenyId;
                }
            }
            const existingResponse = await client.get(`https://ugyfelportal.nav.gov.hu/api/adoszamlak/${companyId}/eredmenyek?page=0&size=10`, { headers: { 'Content-Type': 'application/json' } });
            if (existingResponse.status === 200) {
                for (const item of existingResponse.data.content) {
                    if (item.adoszamlaTipus === 'TETELES' &&
                        item.allapot === 'FELDOLGOZOTT' &&
                        item.lekerdezesIdo.startsWith(today)) {
                        return item.lekerdezesEredmenyId;
                    }
                }
            }
            const payload = {
                adozoiProfilId: companyId,
                lang: 'hu',
                adoszamlaTipus: 'TETELES',
                adonemAzonositok: null,
                konyvelesreVar: true,
                lekerdezesiIdoszakKezdete: {
                    naptolDtoNapKezdete: `${startDate.split('T')[0]}T00:00:00.000000`,
                },
                lekerdezesiIdoszakVege: {
                    napigDtoKovNapKezdete: `${endDate.split('T')[0]}T23:59:59.999999`,
                },
            };
            const generateResponse = await client.post('https://ugyfelportal.nav.gov.hu/api/adoszamlak', payload, { headers: { 'Content-Type': 'application/json' } });
            if (generateResponse.status !== 200) {
                throw new Error('Adószámla generálás sikertelen');
            }
            await new Promise(resolve => setTimeout(resolve, 8000));
            const newResponse = await client.get(`https://ugyfelportal.nav.gov.hu/api/adoszamlak/${companyId}/eredmenyek?page=0&size=10`, {
                params: {
                    page: 0,
                    size: 10,
                    adozoiProfilId: companyId,
                    allapot: 'FELDOLGOZOTT',
                    rendezes: 'LEKERDEZESIIDOCSOKKENO',
                },
                headers: { 'Content-Type': 'application/json' },
            });
            if (newResponse.status === 200) {
                for (const item of newResponse.data.content) {
                    if (item.adoszamlaTipus === 'TETELES' && item.allapot === 'FELDOLGOZOTT') {
                        return item.lekerdezesEredmenyId;
                    }
                }
            }
            throw new Error('Generált adószámla nem található');
        };
        const generateTbXlsx = async (client, lekerdezesId, companyName) => {
            const exportUrl = `https://ugyfelportal.nav.gov.hu/api/foglalkoztato-lekerdezesek/biztositotti-fajlba/export?eredmenyId=${lekerdezesId}&lekerdezesEredmenyId=${lekerdezesId}&riportTipus=XLSX&hitelesitett=false&tipus=XLSX&lang=hu`;
            const response = await client.get(exportUrl, {
                headers: {
                    "Accept": "application/json, application/octet-stream, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/pdf, application/xml"
                },
                responseType: 'arraybuffer'
            });
            if (response.status !== 200) {
                throw new Error(`XLSX letöltés sikertelen: ${response.status}`);
            }
            const cleanCompanyName = companyName.replace(/[\\/*?:"<>|]/g, '');
            const fileName = `${cleanCompanyName}_biztositottak_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`;
            const binaryData = {
                data: Buffer.from(response.data).toString('base64'),
                fileName,
                mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            };
            return [[
                    {
                        json: {},
                        binary: {
                            data: binaryData,
                        },
                    }
                ]];
        };
        const downloadPdf = async (client, lekerId, companyName, type) => {
            const urlMap = {
                adoszamla: `https://ugyfelportal.nav.gov.hu/api/adoszamlak/export?lekerdezesEredmenyId=${lekerId}&riportTipus=PDF&hitelesitett=false&lang=hu`,
                torzs: `https://ugyfelportal.nav.gov.hu/api/sajat-adatok/export?riportTipus=PDF&adozoTipus=CEG&kepviseltAdozoiProfilId=${lekerId}&lang=hu&hitelesitett=false`,
            };
            const url = urlMap[type] || urlMap.adoszamla;
            const response = await client.get(url, {
                responseType: 'arraybuffer',
                headers: { 'Accept': 'application/pdf' }
            });
            if (response.status !== 200) {
                throw new Error('PDF letöltés sikertelen');
            }
            const cleanName = companyName.replace(/[\\/*?:"<>|]/g, '');
            const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
            const fileName = `${cleanName}_${type}_${dateStr}.pdf`;
            const binaryData = {
                data: Buffer.from(response.data).toString('base64'),
                fileName,
                mimeType: 'application/pdf',
            };
            return [[
                    {
                        json: {},
                        binary: {
                            data: binaryData,
                        },
                    }
                ]];
        };
        // Perform login to Ügyfélportál
        await navLogin(client, 'https://ugyfelportal.nav.gov.hu/api/v1/user/login/start-kaulogin', credentials.username, credentials.password, credentials.kauKey);
        // Operation handler
        switch (operation) {
            case 'companyList': {
                return handleCompanyList(client);
            }
            case 'adoszamla': {
                const companyId = this.getNodeParameter('companyId', 0);
                const companyName = await getCompanyNameById(client, companyId);
                let startDate = this.getNodeParameter('startDate', 0);
                let endDate = this.getNodeParameter('endDate', 0);
                const now = new Date();
                if (!startDate) {
                    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    startDate = start.toISOString();
                }
                if (!endDate) {
                    const end = new Date(now.getFullYear(), now.getMonth(), 0);
                    endDate = end.toISOString();
                }
                await changeCompany(client, companyId);
                const lekerId = await generateOrFindAdoszamla(client, companyId, startDate, endDate);
                return downloadPdf(client, lekerId, companyName, 'adoszamla');
            }
            case 'tbAdat': {
                const companyId = this.getNodeParameter('companyId', 0);
                const companyName = await getCompanyNameById(client, companyId);
                let startDate = this.getNodeParameter('startDate', 0);
                let endDate = this.getNodeParameter('endDate', 0);
                const now = new Date();
                if (!startDate) {
                    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    startDate = start.toISOString();
                }
                if (!endDate) {
                    const end = new Date(now.getFullYear(), now.getMonth(), 0);
                    endDate = end.toISOString();
                }
                await changeCompany(client, companyId);
                const lekerId = await generateTb(client, companyId, startDate, endDate);
                return generateTbXlsx(client, lekerId, companyName);
            }
            case 'torzsAdat': {
                const companyId = this.getNodeParameter('companyId', 0);
                const companyName = await getCompanyNameById(client, companyId);
                await changeCompany(client, companyId);
                return downloadPdf(client, companyId, companyName, 'torzs');
            }
            case 'targylevelek': {
                const days = this.getNodeParameter('days', 0, 60);
                // Tárhely bejelentkezés
                await targhelyLogin(client);
                // Postaládák lekérése
                const response = await client.get('https://tarhely.gov.hu/levelezes/api/mailbox/reload', { headers: { 'Content-Type': 'application/json' } });
                if (response.status !== 200) {
                    throw new Error('Postaládák lekérése sikertelen');
                }
                const mailboxes = response.data;
                // XSRF token lekérése - JAVÍTOTT DOMAIN
                const cookies = cookieJar.getCookiesSync('https://tarhely.gov.hu/levelezes');
                const xsrfCookie = cookies.find(c => c.key === 'XSRF-TOKEN');
                const xsrfToken = xsrfCookie ? decodeURIComponent(xsrfCookie.value) : '';
                // Üzenetek összegyűjtése
                const executionData = [];
                for (const mailbox of mailboxes) {
                    // Üzenetek lekérése
                    const sinceDate = new Date();
                    sinceDate.setDate(sinceDate.getDate() - days);
                    const sinceISO = sinceDate.toISOString();
                    const payload = {
                        pageNumber: 0,
                        countPerPage: 100,
                        filter: {
                            searchTerm: null,
                            labelIds: null,
                            unreadOnly: null,
                            exludeSystemMessages: true,
                            messageTypes: [],
                            verificationTypes: [],
                            incomingFromDate: sinceISO,
                            incomingToDate: null
                        }
                    };
                    try {
                        const messagesResponse = await client.post(`https://tarhely.gov.hu/levelezes/api/uzenetek/BEERKEZETT/kereses`, payload, {
                            headers: {
                                'Content-Type': 'application/json',
                                'Address-Id': mailbox.azonosito,
                                'X-Xsrf-Token': xsrfToken
                            }
                        });
                        if (messagesResponse.status !== 200) {
                            executionData.push({
                                json: {
                                    mailboxId: mailbox.azonosito,
                                    mailboxName: mailbox.name,
                                    error: `Üzenetek lekérése sikertelen (${messagesResponse.status})`
                                }
                            });
                            continue;
                        }
                        const messages = messagesResponse.data?.uzenetek || [];
                        const formattedMessages = messages.map((msg) => {
                            // Az API változásai miatt ellenőrizzük az elérhető mezőket
                            return {
                                id: msg.azonosito,
                                targy: msg.targy || 'Nincs tárgy',
                                feladoNev: msg.feladoNev || 'Ismeretlen feladó',
                                erkezesDatuma: msg.erkezesDatuma || 'Ismeretlen dátum',
                                olvasott: msg.olvasott || false,
                                erkeztetesiSzam: msg.erkeztetesiSzam || msg.azonosito
                            };
                        });
                        executionData.push({
                            json: {
                                azonosito: mailbox.azonosito,
                                name: mailbox.name,
                                mailboxName: mailbox.mailboxName,
                                olvasatlanUzenetekSzama: mailbox.olvasatlanUzenetekSzama,
                                messages: formattedMessages
                            }
                        });
                    }
                    catch (error) {
                        executionData.push({
                            json: {
                                azonosito: mailbox.azonosito,
                                name: mailbox.name,
                                error: `Hiba: ${error.message}`
                            }
                        });
                    }
                }
                return [executionData];
            }
            case 'targyuzenetletoltes': {
                const erkeztetesiSzam = this.getNodeParameter('uzenet_szam', 0);
                const mailboxId = this.getNodeParameter('mailboxId', 0);
                const moveToPermanent = this.getNodeParameter('moveToPermanent', 0, false);
                // Tárhely bejelentkezés
                await targhelyLogin(client);
                // XSRF token lekérése - JAVÍTOTT DOMAIN
                const cookies = cookieJar.getCookiesSync('https://tarhely.gov.hu/levelezes');
                const xsrfCookie = cookies.find(c => c.key === 'XSRF-TOKEN');
                const xsrfToken = xsrfCookie ? decodeURIComponent(xsrfCookie.value) : '';
                // Üzenet letöltése
                const downloadResponse = await client.get(`https://tarhely.gov.hu/levelezes/api/uzenet/letoltes/beerkezett/${erkeztetesiSzam}`, {
                    headers: {
                        'Address-Id': mailboxId,
                        'X-Xsrf-Token': xsrfToken // Hozzáadva XSRF token
                    },
                    responseType: 'arraybuffer'
                });
                if (downloadResponse.status !== 200) {
                    throw new Error('Üzenet letöltése sikertelen');
                }
                // Fájltípus meghatározása
                const content = downloadResponse.data;
                let fileExtension = 'pdf';
                const hexStart = content.subarray(0, 4).toString('hex').toUpperCase();
                if (hexStart === '504B0304' || hexStart.startsWith('504B')) {
                    fileExtension = 'zip';
                }
                const fileName = `uzenet_${erkeztetesiSzam}.${fileExtension}`;
                const binaryData = {
                    data: content.toString('base64'),
                    fileName,
                    mimeType: fileExtension === 'pdf' ? 'application/pdf' : 'application/zip',
                };
                // Tartóstárba helyezés
                if (moveToPermanent) {
                    const movePayload = {
                        erkeztetesiSzamok: [erkeztetesiSzam]
                    };
                    const moveResponse = await client.post('https://tarhely.gov.hu/levelezes/api/uzenetek/tartos-tarba-helyezes', movePayload, {
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Xsrf-Token': xsrfToken,
                            'Address-Id': mailboxId
                        }
                    });
                    if (moveResponse.status !== 200) {
                        throw new Error('Tartóstárba helyezés sikertelen');
                    }
                }
                return [[
                        {
                            json: {
                                erkeztetesiSzam,
                                fileName,
                                size: content.length,
                                movedToPermanent: moveToPermanent
                            },
                            binary: {
                                data: binaryData,
                            },
                        }
                    ]];
            }
            default: {
                throw new Error(`Nem támogatott művelet: ${operation}`);
            }
        }
    }
}
exports.kauUgyfelkapualap = kauUgyfelkapualap;
module.exports = { main: kauUgyfelkapualap };
