# C-Shop.com

Site de demandes produits et suivi des commandes, conçu pour Cloudflare Workers avec D1.

## Configuration Cloudflare nécessaire

Le Worker utilise la base D1 `cshopfrance-commandes` avec le binding `DB` déjà déclaré dans `wrangler.toml`.

Dans **Workers et Pages → cshopfrance → Paramètres → Variables et secrets**, créer ces secrets de production :

| Nom | Valeur |
| --- | --- |
| `GOOGLE_CLIENT_ID` | ID client OAuth Google |
| `GOOGLE_CLIENT_SECRET` | Secret client OAuth Google |
| `ADMIN_EMAIL` | l’adresse Gmail de l’administrateur |
| `DISCORD_PRIVATE_WEBHOOK` | facultatif : webhook privé des nouvelles demandes |
| `DISCORD_SALES_WEBHOOK` | facultatif : webhook public des avis anonymes |

Pour OAuth Google, l’origine et l’URI de redirection doivent être exactement l’URL publique finale du Worker, suivie de `/api/auth/google/callback`.

Exemple si l’adresse provisoire est `https://cshopfrance.karimicamil35.workers.dev` :

* origine autorisée : `https://cshopfrance.karimicamil35.workers.dev`
* URI de redirection : `https://cshopfrance.karimicamil35.workers.dev/api/auth/google/callback`

Avant une ouverture au public, rattacher un domaine que vous possédez dans **Paramètres → Domaines et routes** (par exemple `c-shop.fr` ou `cshopfrance.fr`), puis remplacer les deux URLs Google par celles du domaine final.
