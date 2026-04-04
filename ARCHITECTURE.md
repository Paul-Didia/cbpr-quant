# CBPR Quant - Architecture Technique

## Vue d'ensemble

L'application CBPR Quant est une plateforme d'analyse de marchés boursiers construite avec React, Supabase et des APIs externes (Twelve Data et Stripe).

## Architecture

```
Frontend (React + Vite)
    ↓ API Calls
Supabase Edge Function (Hono Server)
    ↓ Data Storage
Supabase Database (KV Store)
    ↓ External APIs
- Twelve Data API (market data, logos)
- Stripe API (subscriptions)
```

## Sources de données externes

### 1. **Twelve Data API** 
- **Utilisation** : Récupération des données de marché, logos et informations sur les actifs
- **Endpoints utilisés** :
  - `/quote` - Prix en temps réel
  - `/logo` - Logos des entreprises
  - `/symbol_search` - Recherche d'actifs
- **Configuration** : Clé API stockée dans `TWELVE_DATA_API_KEY` (variable d'environnement Supabase)

### 2. **Supabase**
- **Authentification** : Supabase Auth pour la gestion des utilisateurs
- **Database** : Table KV (`kv_store_819c6d9b`) pour stocker :
  - Profils utilisateurs (`user:{userId}:profile`)
  - Favoris utilisateurs (`user:{userId}:favorites`)
- **Edge Functions** : Serveur Hono pour les routes API sécurisées

### 3. **Stripe**
- **Utilisation** : Vérification des abonnements utilisateurs
- **Endpoints utilisés** :
  - `/v1/customers/{customerId}/subscriptions` - Récupération des abonnements
- **Configuration** : Clé API stockée dans `STRIPE_SECRET_KEY` (variable d'environnement Supabase)

## Structure du code

### Backend (`/supabase/functions/server/`)

#### `index.tsx` - Serveur principal
Routes disponibles :

**Auth**
- `POST /make-server-819c6d9b/auth/signup` - Créer un compte
- `GET /make-server-819c6d9b/auth/profile` - Récupérer le profil utilisateur

**Favoris**
- `GET /make-server-819c6d9b/favorites` - Récupérer les favoris
- `POST /make-server-819c6d9b/favorites` - Ajouter un favori
- `DELETE /make-server-819c6d9b/favorites/:assetId` - Retirer un favori

**Twelve Data**
- `GET /make-server-819c6d9b/assets/:symbol` - Récupérer les données d'un actif
- `GET /make-server-819c6d9b/assets/search/:query` - Rechercher des actifs

**Subscription**
- `GET /make-server-819c6d9b/subscription` - Vérifier l'abonnement Stripe
- `POST /make-server-819c6d9b/subscription` - Mettre à jour l'abonnement (demo)

### Frontend (`/src/app/`)

#### Contexts
- `AuthContext.tsx` - Gestion de l'authentification Supabase
- `FavoritesContext.tsx` - Gestion des favoris avec sync Supabase/localStorage

#### Services
- `api.ts` - Service pour communiquer avec le serveur Supabase

#### Pages
- `Home.tsx` - Liste des actifs suivis
- `Library.tsx` - Bibliothèque avec recherche d'actifs
- `Profile.tsx` - Profil utilisateur et gestion de l'abonnement
- `AssetDetail.tsx` - Détails d'un actif avec graphiques et indicateurs techniques

## Flux de données

### 1. Authentification
```
User → Login Form → Supabase Auth → Access Token → API Service → Protected Routes
```

### 2. Gestion des favoris
```
User → Toggle Favorite → FavoritesContext → API Service → Server → KV Store
```

### 3. Données de marché (à implémenter)
```
User → View Asset → Server → Twelve Data API → Asset Data → Display Chart
```

### 4. Vérification abonnement
```
User → Login → Server → Stripe API → Subscription Status → Profile Display
```

## Variables d'environnement

Variables Supabase (automatiquement configurées) :
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`

Variables à configurer manuellement :
- `TWELVE_DATA_API_KEY` - ✅ Configurée
- `STRIPE_SECRET_KEY` - ✅ Configurée

## Sécurité

1. **Authentification** : Toutes les routes API (sauf signup) nécessitent un token JWT valide
2. **Clés API** : Les clés sensibles (Twelve Data, Stripe) sont stockées côté serveur uniquement
3. **CORS** : Configuré pour accepter les requêtes depuis le frontend
4. **Service Role Key** : Utilisé uniquement côté serveur pour les opérations admin

## Prochaines étapes

### Intégration Twelve Data
- [ ] Remplacer les données mock par des appels API réels
- [ ] Implémenter un système de cache pour limiter les appels API
- [ ] Afficher les vrais logos depuis Twelve Data

### Intégration Stripe
- [ ] Configurer les webhooks Stripe pour les changements d'abonnement
- [ ] Implémenter le flow de paiement complet
- [ ] Mapper les price IDs Stripe aux tiers (free/pro/quant)

### Optimisations
- [ ] Ajouter un loading state pendant les appels API
- [ ] Implémenter un système d'erreur utilisateur-friendly
- [ ] Ajouter des retry logic pour les appels API qui échouent

## Notes importantes

- L'application utilise actuellement des données mock pour le développement
- La structure est prête pour une migration complète vers des données réelles
- Les favoris fonctionnent en mode hybride (localStorage pour non-authentifiés, Supabase pour authentifiés)
- Le système d'abonnement peut fonctionner sans Stripe (mode demo) mais vérifiera Stripe si la clé est configurée
