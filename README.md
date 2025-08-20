# 🧑‍💻 n8n node — KAÜ Ügyfélportál és Tárhely integráció 

A fájl egy n8n node-ot valósít meg („KAÜ Ügyfélportál és Tárhely”), amely a magyar NAV ügyfélportállal és az állami tárhely (tárhely.gov.hu) levelezési/tárhely felületével kommunikál. Támogatott fő műveletek:

Adószámla letöltés PDF-ben

Cégprofilok listázása (company list)

TB adatok exportálása XLSX formátumban

Cég törzsadatainak letöltése PDF-ben

Tárhely (postaláda) levelek listázása

Tárhely üzenet letöltés (PDF) + opcionálisan „tartóstárba helyezés”

A belépés (hitelesítés) a KAU/Tárhely/SAML folyamatokat kezeli (KAU 2FA/TOTP, SAML átirányítások, stb.).



# 🗝️ Hitelesítés / Credentials

A node credentials-ként kauCredentials-t igényel. A kódban a következő mezőkre használja:

credentials.username

credentials.password

credentials.kauKey (KAU TOTP kulcs — Base32 formátumú)

Ez azt jelenti: a node-hoz hozzá kell adni egy credential-t, amely tartalmazza a felhasználó NAV/KAU felhasználónevét, jelszavát és a KAU kulcsot (TOTP-hoz).


# 🎛️ Műveletek (a node menüjében)

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

# INPUT jsonok 

## 1. Cégprofilok Listázása (ceglista)
json
{

  "operation": "ceglista"
  
}
## 2. Adószámla Letöltés (adoszamla)
json
{

  "operation": "adoszamla",
  
  "companyId": "12345",
  
  "startDate": "2023-01-01T00:00:00.000Z",
  
  "endDate": "2023-12-31T23:59:59.999Z"
  
}
## 3. TB Adat Letöltés (tbAdat)
json
{

  "operation": "tbAdat",
  
  "companyId": "12345",
  
  "startDate": "2023-01-01T00:00:00.000Z",
  
  "endDate": "2023-12-31T23:59:59.999Z"
  
}
## 4. Törzsadat Letöltés (torzsAdat)
json
{

  "operation": "torzsAdat",
  
  "companyId": "12345"
  
}
## 5. Tárhely Levelek Lista (targylevelek)
json
{

  "operation": "targylevelek",
  
  "days": 60
  
}
## 6. Tárhely Üzenet Letöltés (targyuzenetletoltes)
json
{
  "operation": "targyuzenetletoltes",
  "mailboxId": "mailbox123",
  "uzenet_szam": "msg456",
  "moveToPermanent": true
}
## Minta Input (JSON)
json
{

  "operation": "adoszamla",
  
  "companyId": "98765",
  
  "startDate": "2024-01-01T00:00:00.000Z",
  
  "endDate": "2024-03-31T23:59:59.999Z",
  
}
 
### Előfeltételek
- Érvényes KAÜ felhasználói fiók
- TOTP kulcs a kétfaktoros hitelesítéshez

### Konfiguráció

1. Adja meg a hitelesítési adatokat a "Credentials" részben
2. Válassza ki a kívánt műveletet
3. Töltse ki a művelethez szükséges paramétereket

### Példa munkafolyamatok

1. **Adószámla letöltése havonta**:
   - Ütemezett trigger (minden hónap 1.)
   - KAÜ Node: Adószámla Letöltés művelet
   - Google Drive: Fájl mentése

2. **Tárhely üzenetek monitorozása**:
   - Ütemezett trigger (napi)
   - KAÜ Node: Tárhely Levelek Lista
   - Email: Értesítés új üzenetekről

# 📁 A node properties-ei (a legfontosabbak):

Művelet (operation) — válaszd ki az egyik műveletet (felül).

Cég (companyId) — loadOptions: getCompanyOptions — a cégprofilok közül választható.

Postaláda (mailboxId) — loadOptions: getMailboxOptions — tárhely/postaládák.

Üzenet (uzenet_szam) — loadOptions: getMessageOptions — adott postaláda üzeneteihez.

Dátumtartomány (napok) — szám (pl. hány napra visszamenőleg listázzon leveleket) — alapértelmezett 60.

Dátumtartomány kezdete / vége — dateTime típus (használt adószámla/TB lekérésekhez).

Tartóstárba helyez (moveToPermanent) — boolean (tárhely üzenet letöltésénél).

A displayOptions-ok miatt mezők csak a releváns műveletek kiválasztásakor jelennek meg.

Kimenetek / visszaadott formátumok


# 🧾 A node a n8n szabványos módon ad vissza:

Ha fájl letöltés történik (PDF / XLSX), akkor a válasz binary mezőben adja vissza a base64 kódolt fájlt:

binary.data tartalmazza a base64-elt tartalmat, fileName, mimeType is beállítva.

JSON rész (json: {}) üres, a lényeg a binary blokk.

Ha csak lista (pl. tárhely levelek listája, céglista): JSON tömb/objektum formában tér vissza.

Hibakezelés / edge-case-ek

A kód több helyen ellenőriz HTTP státuszkódokat és hibát dob (throw new Error('...')) ha valami nem 200-as.

KAU / NAV SAML folyamathoz több átirányítás és időzítési próbálkozás is van — ha KAU TOTP hibás vagy hiányzik, a beléptetés elbukhat.

Adatvédelmi / biztonsági figyelmeztetés: a kauKey 2FA kulcs érzékeny adat — sose töltsd fel nyílt repo-ba nyers formában.

A fájlnév-képzésnél a kód megtisztítja a fileName-t tiltott karakterektől.

👤 Szerző

cityba – fejlesztő problémamegoldó

Ha tetszett vagy hasznos volt, ⭐️-zd a repót!

📜 Licenc

Ez a projekt szigorúan nem kereskedelmi célokra használható. Tilos a kód eladása, módosítása, újrahasznosítása.

A kód forrása és működése kizárólag személyes, oktatási vagy demonstrációs célokra használható.

Bármilyen más felhasználás vagy terjesztés kizárt, kivéve a szerző írásos engedélyét.

------------------------------------------------

# 🧑‍💻 n8n node — KAÜ Customer Portal and Storage Integration

The file implements an n8n node (“KAÜ Customer Portal and Storage”) that communicates with the Hungarian NAV customer portal and the state storage (tárhely.gov.hu) mail/storage interface. Main supported operations:

Download tax invoice in PDF

List company profiles (company list)

Export TB data in XLSX format

Download company master data in PDF

List storage (mailbox) emails

Download storage message (PDF) + optionally “put into storage”

Login (authentication) handles KAU/Storage/SAML processes (KAU 2FA/TOTP, SAML redirects, etc.).

# 🗝️ Authentication / Credentials

The node requires kauCredentials as credentials. In the code, use the following fields:

credentials.username

credentials.password

credentials.kauKey (KAU TOTP key — Base32 format)

This means: a credential must be added to the node, which contains the user's NAV/KAU username, password, and KAU key (for TOTP).

#🎛️ Operations (in the node menu)

The Operation drop-down contains the following (value -> short description):

adosamla — Tax Invoice Download
Download a company's tax invoice in PDF format. (Parameters: companyId, startDate, endDate — the code generates/finds a tax invoice result and downloads it in PDF.)

companyList — List Company Profiles
Get available company profiles (loadOptions supported).

tbAdat — TB Data Download
Export TB data (XLSX). (Parameters: companyId, startDate, endDate — the node generates and downloads the XLSX.)

torzsAdat — Master Data Download
Download company master data (PDF).

targyleafek — List of Storage Letters
List the letters of the selected storage/mailbox (parameter: mailboxId, days in the past).

targyuzeneletoltes — Download Storage Message
Download a storage message (single letter) (parameters: mailboxId, uzenet_szam, optionally moveToPermanent).

Input fields and behavior (UI)

# INPUT jsons

## 1. List Company Profiles (ceglista)
json
{

"operation": "ceglista"

}
## 2. Download Tax Invoice (adosamla)
json
{

"operation": "adosamla",

"companyId": "12345",

"startDate": "2023-01-01T00:00:00.000Z",

"endDate": "2023-12-31T23:59:59.999Z"

}
## 3. Download TB Data (tbAdat)
json
{

"operation": "tbAdat",

"companyId": "12345",

"startDate": "2023-01-01T00:00:00.000Z",

"endDate": "2023-12-31T23:59:59.999Z"

}
## 4. Master Data Download (torzsAdat)
json
{

"operation": "torzsAdat",

"companyId": "12345"

}
## 5. Storage Mail List (subjectmails)
json
{

"operation": "subjectmails",

"days": 60

}
## 6. Storage Message Download (subjectmaildownload)
json
{

"operation": "subjectmaildownload",

"mailboxId": "mailbox123",

"message_number": "msg456",

"moveToPermanent": true

}
## Sample Input (JSON)
json
{

"operation": "adoszamla",

"companyId": "98765",

"startDate": "2024-01-01T00:00:00.000Z",

"endDate": "2024-03-31T23:59:59.999Z",

}
 
### Prerequisites
- Valid KAÜ user account
- TOTP key for two-factor authentication

### Configuration

1. Enter the authentication data in the "Credentials" section
2. Select the desired action
3. Fill in the parameters required for the action

### Example workflows

1. **Download tax invoice monthly**:
- Scheduled trigger (every month 1.)
- KAÜ Node: Tax Invoice Download Operation
- Google Drive: Save File

2. **Monitoring Storage Messages**:
- Scheduled Trigger (Daily)
- KAÜ Node: Storage Mail List
- Email: Notification of New Messages

# 📁 Node properties (the most important):

Operation (operation) — select one of the operations (top).

Company (companyId) — loadOptions: getCompanyOptions — select from the company profiles.

Mailbox (mailboxId) — loadOptions: getMailboxOptions — storage/mailboxes.

Message (message_number) — loadOptions: getMessageOptions — for messages in a given mailbox.

Date range (days) — number (e.g. how many days back to list messages) — default 60.

Date range start / end — dateTime type (used for tax invoice/TB requests).

Move to permanent storage (moveToPermanent) — boolean (storage when downloading messages).

Due to displayOptions, fields are only displayed when relevant actions are selected.

Outputs / returned formats

#🧾 Node returns in the n8n standard way:

If a file download occurs (PDF / XLSX), then the response returns the base64 encoded file in the binary field:

binary.data contains the base64-encoded content, fileName, mimeType are also set.

JSON part (json: {}) is empty, the main thing is the binary block.

If only a list (e.g. list of hosting emails, company list): JSON is returned in array/object form.

Error handling / edge-cases

The code checks HTTP status codes in several places and throws an error (throw new Error('...')) if something is not 200.

There are several redirects and timing attempts for the KAU / NAV SAML process — if KAU TOTP is incorrect or missing, the login may fail.

Privacy/Security Warning: The kauKey 2FA key is sensitive data — never upload it to an open repo in its raw form.

The code sanitizes the fileName from forbidden characters when generating the filename.

👤 Author

cityba – developer problem solver

If you liked it or found it useful, please ⭐️ the repo!

📜 License

This project is strictly for non-commercial use. Selling, modifying, or reusing the code is prohibited.

The source and functionality of the code are for personal, educational, or demonstration purposes only.

Any other use or distribution is prohibited without the written permission of the author.
