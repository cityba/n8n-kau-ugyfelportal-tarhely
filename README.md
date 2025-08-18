# n8n node — KAÜ Ügyfélportál és Tárhely integráció 

A fájl egy n8n node-ot valósít meg („KAÜ Ügyfélportál és Tárhely”), amely a magyar NAV ügyfélportállal és az állami tárhely (tárhely.gov.hu) levelezési/tárhely felületével kommunikál. Támogatott fő műveletek:

Adószámla letöltés PDF-ben

Cégprofilok listázása (company list)

TB adatok exportálása XLSX formátumban

Cég törzsadatainak letöltése PDF-ben

Tárhely (postaláda) levelek listázása

Tárhely üzenet letöltés (PDF) + opcionálisan „tartóstárba helyezés”

A belépés (hitelesítés) a KAU/Tárhely/SAML folyamatokat kezeli (KAU 2FA/TOTP, SAML átirányítások, stb.).



# Hitelesítés / Credentials

A node credentials-ként kauCredentials-t igényel. A kódban a következő mezőkre használja:

credentials.username

credentials.password

credentials.kauKey (KAU TOTP kulcs — Base32 formátumú)

Ez azt jelenti: a node-hoz hozzá kell adni egy credential-t, amely tartalmazza a felhasználó NAV/KAU felhasználónevét, jelszavát és a KAU kulcsot (TOTP-hoz).


# Főbb segédfüggvények (a kódban)

A fájlban definiált fontosabb függvények (maga a node execute() belső és a fájl teteji helper-ek):

base32Decode(input: string): Buffer
Base32 dekódoló (KAU kulcs feldolgozásához).

generateTOTP(secret: string, timeSlice?: number): string
HMAC/TOTP generálás KAU 2FA-hoz.

parseHtmlForm(html: string)
HTML form mezők kinyerése (cheerio-val), a SAML/SRP átirányításokhoz.

async function navLogin(client, link, username, password, kauKey?)
Komplex beléptető folyamat a NAV ügyfélportálra (SAML, KAU login step). Kezeli a SAML átirányításokat, x/y mezőket, CSRF tokeneket, stb. Ha szükséges, KAU TOTP-t is generál.

async function targhelyLogin(client)
Belépés a Tárhely (tarhely.gov.hu) levelezés/tárhely felületre (SAML-átirányítás + KAU).

const getCompanyOptions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]>
n8n „loadOptions” — listázza a használható cégprofilokat a felhasználó fiókjából (a UI-ban Cég választóhoz).

const getMailboxOptions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]>
Load options a tárhely/postaláda kiválasztásához.

const getMessageOptions(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]>
Load options egy adott postaláda üzeneteihez.

const getCompanyNameById, getCompanyDetailsById
Kisméretű helper-ek a cég metaadatok visszanyeréséhez.

const changeCompany
Váltás a NAV profilok/cégprofilok között (ha több profilhoz van hozzáférés).

const generateTb(client, companyId, startDate, endDate): Promise<string>
Elindítja a TB (biztosítottak / TB adatok) lekérést, visszaad egy lekérdezés-azonosítót.

const generateTbXlsx(client, lekerdezesId, companyName)
Letölti XLSX-ként a TB adatsort, visszaadja binárisan (base64).

const generateOrFindAdoszamla(client, companyId, startDate, endDate): Promise<string>
Lekéri/előállítja az adószámla-eredményt (lekerdezesEredmenyId).

const downloadPdf(...)
PDF letöltés + base64 kódolás, visszaadás n8n binary mezőben.


# Műveletek (a node menüjében)

A Művelet (operation) legördülőben a következők találhatók (value -> rövid leírás):

adoszamla — Adószámla Letöltés
Cég adószámlájának letöltése PDF formátumban. (Paraméterek: companyId, startDate, endDate — a code generál/keres adószámla eredményt és letölti PDF-ben.)

companyList — Cégprofilok Listázása
Elérhető cégprofilok lekérése (loadOptions támogatott).

tbAdat — TB Adat Letöltés
TB adatok exportálása (XLSX). (Paraméterek: companyId, startDate, endDate — a node előállítja és letölti az XLSX-et.)

torzsAdat — Törzsadat Letöltés
Cég törzsadatainak letöltése (PDF).

targylevelek — Tárhely Levelek Lista
A kiválasztott tárhely/postaláda leveleinek listázása (paraméter: mailboxId, days visszamenőleg).

targyuzenetletoltes — Tárhely Üzenet Letöltés
Tárhely üzenet (egyetlen levél) letöltése (paraméterek: mailboxId, uzenet_szam, opcionálisan moveToPermanent).

Beviteli mezők és viselkedés (UI)


# A node properties-ei (a legfontosabbak):

Művelet (operation) — válaszd ki az egyik műveletet (felül).

Cég (companyId) — loadOptions: getCompanyOptions — a cégprofilok közül választható.

Postaláda (mailboxId) — loadOptions: getMailboxOptions — tárhely/postaládák.

Üzenet (uzenet_szam) — loadOptions: getMessageOptions — adott postaláda üzeneteihez.

Dátumtartomány (napok) — szám (pl. hány napra visszamenőleg listázzon leveleket) — alapértelmezett 60.

Dátumtartomány kezdete / vége — dateTime típus (használt adószámla/TB lekérésekhez).

Tartóstárba helyez (moveToPermanent) — boolean (tárhely üzenet letöltésénél).

A displayOptions-ok miatt mezők csak a releváns műveletek kiválasztásakor jelennek meg.

Kimenetek / visszaadott formátumok


# A node a n8n szabványos módon ad vissza:

Ha fájl letöltés történik (PDF / XLSX), akkor a válasz binary mezőben adja vissza a base64 kódolt fájlt:

binary.data tartalmazza a base64-elt tartalmat, fileName, mimeType is beállítva.

JSON rész (json: {}) üres, a lényeg a binary blokk.

Ha csak lista (pl. tárhely levelek listája, céglista): JSON tömb/objektum formában tér vissza.

Hibakezelés / edge-case-ek

A kód több helyen ellenőriz HTTP státuszkódokat és hibát dob (throw new Error('...')) ha valami nem 200-as.

KAU / NAV SAML folyamathoz több átirányítás és időzítési próbálkozás is van — ha KAU TOTP hibás vagy hiányzik, a beléptetés elbukhat.

Adatvédelmi / biztonsági figyelmeztetés: a kauKey 2FA kulcs érzékeny adat — sose töltsd fel nyílt repo-ba nyers formában.

A fájlnév-képzésnél a kód megtisztítja a fileName-t tiltott karakterektől.

 
# A node n8n környezetbe történő telepítéséhez: a projektet a JS kimenetet kell elhelyezni az n8n custom node mappájában / csomagként publikálni.

Használati példák (mik a tipikus beállítások)

Adószámla letöltés (PDF)

Operation: Adószámla Letöltés (adoszamla)

Válaszd ki a Cég-et (companyId), állítsd be Dátumtartomány kezdete / vége-t.

Output: binary PDF (fileName: {cég}_{type}_{YYYYMMDD}.pdf).

TB adatok export (XLSX)

Operation: TB Adat Letöltés (tbAdat)

Add meg companyId, startDate, endDate (a kód intern módon az előző hónapot kezeli is).

Output: binary XLSX (fileName pl. {Company}_biztositottak_{YYYYMMDD}.xlsx).

Tárhely üzenet letöltés

Operation: Tárhely Üzenet Letöltés (targyuzenetletoltes)

Válassz Postaláda-t, majd Üzenet-et. Opcionálisan Tartóstárba helyez = true.

Output: PDF binárisan.

 
getCompanyOptions, getMailboxOptions, getMessageOptions — n8n loadOptions-k.

generateTb, generateTbXlsx — TB lekérés + XLSX letöltés.

generateOrFindAdoszamla, downloadPdf — adószámla generálás / letöltés.
