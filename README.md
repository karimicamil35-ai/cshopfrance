# C-Shop France

Site de demandes de produits, connexion Google, espace client et administration.

## Avant le premier déploiement

Dans Cloudflare, crée une base **D1** nommée `cshopfrance-orders`, puis exécute le contenu de `schema.sql` dans la console D1. Copie ensuite l'identifiant de cette base à la place de `REPLACE_WITH_YOUR_D1_DATABASE_ID` dans `wrangler.toml`.

Ajoute ces variables secrètes dans les paramètres Cloudflare du projet (elles ne doivent jamais être dans GitHub) :

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `ADMIN_EMAIL` : `karimicamil35@gmail.com`
- `DISCORD_PRIVATE_WEBHOOK`
- `DISCORD_SALES_WEBHOOK`

Les deux webhooks Discord doivent être régénérés avant d'être ajoutés comme secrets.

## Publication après 24 h sans avis

Le site envoie tout de suite l'avis lorsqu'un client le laisse. Le dossier `review-worker` contient la tâche Cloudflare qui vérifie les commandes toutes les 15 minutes et publie « Client n’a pas donné d’avis après 24 h » dans `#sales`. Elle doit être déployée avec la même base D1 et le secret `DISCORD_SALES_WEBHOOK` avant l'ouverture au public.
