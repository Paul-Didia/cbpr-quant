# Guide de dépannage CBPR Quant

## Erreur: "Error loading user profile: Error: Profile not found"

### Causes possibles

1. **Session expirée ou invalide**
   - La session JWT a expiré
   - Le token d'authentification n'est plus valide
   
2. **Utilisateur créé manuellement dans Supabase Auth**
   - L'utilisateur existe dans Supabase Auth mais n'a pas de profil dans la KV store

### Solutions

#### Solution 1: Se déconnecter et se reconnecter
```
1. Ouvrir la console du navigateur (F12)
2. Aller dans l'onglet "Application" > "Local Storage"
3. Supprimer toutes les clés liées à Supabase
4. Rafraîchir la page (F5)
5. Se reconnecter
```

#### Solution 2: Le serveur crée automatiquement le profil
Le serveur a été mis à jour pour créer automatiquement un profil si l'utilisateur existe dans Supabase Auth mais n'a pas de profil. Cette solution s'applique automatiquement lors de la prochaine connexion.

#### Solution 3: Vérifier les logs
Ouvrez la console du navigateur et vérifiez les logs suivants:

**Logs attendus lors d'une connexion réussie:**
```
Initial session check: { hasSession: true, hasToken: true }
Loading user profile...
Profile request received
Auth header present: true
User verified: [user-id]
Profile from KV: [profile-data] ou null
Creating missing profile for user [user-id] (si null)
Profile saved successfully
Returning profile: [profile-data]
Profile loaded: [profile-data]
Subscription loaded: free
```

**Si vous voyez:**
- `Auth header present: false` → Le token n'est pas envoyé correctement
- `Auth verification failed: Unauthorized` → Le token est invalide ou expiré
- `Profile from KV: null` suivi de `Creating missing profile` → Le profil est en cours de création (normal)

### Vérification de l'état du système

Visitez l'endpoint de diagnostic pour vérifier la connexion:
```
https://[votre-projet-id].supabase.co/functions/v1/make-server-819c6d9b/diagnostic
```

Cela retournera:
```json
{
  "timestamp": "...",
  "checks": {
    "supabase": { "success": true, "message": "..." },
    "twelveData": { "success": true/false, "message": "..." },
    "stripe": { "success": true/false, "message": "..." }
  },
  "environment": {
    "hasSupabaseUrl": true,
    "hasSupabaseAnonKey": true,
    "hasSupabaseServiceRoleKey": true,
    "hasTwelveDataApiKey": true/false,
    "hasStripeSecretKey": true/false
  }
}
```

## Erreur: "Unauthorized" lors d'appels API

### Cause
Le token JWT n'est pas valide ou n'est pas envoyé.

### Solution
1. Vérifiez que vous êtes bien connecté
2. Déconnectez-vous et reconnectez-vous
3. Vérifiez que le token est bien envoyé dans les headers (console → Network)

## Les favoris ne se synchronisent pas

### Cause possible
- Non authentifié → Les favoris sont stockés dans localStorage
- Authentifié → Les favoris sont stockés dans Supabase

### Solution
1. Vérifiez que vous êtes bien connecté
2. Les favoris en localStorage seront perdus lors de la connexion (c'est normal)
3. Ajoutez à nouveau vos favoris après connexion

## Variables d'environnement manquantes

### TWELVE_DATA_API_KEY
Si vous voyez des erreurs liées à Twelve Data:
1. Allez sur https://twelvedata.com
2. Créez un compte et obtenez une clé API
3. Ajoutez-la dans les secrets Supabase

### STRIPE_SECRET_KEY
Si vous voyez des erreurs liées à Stripe (optionnel en mode demo):
1. Allez sur https://stripe.com
2. Créez un compte et obtenez une clé secrète
3. Ajoutez-la dans les secrets Supabase

## Comment activer les logs détaillés

### Frontend (Console du navigateur)
1. Ouvrez F12 → Console
2. Les logs sont déjà activés dans AuthContext et ApiService

### Backend (Supabase Edge Functions)
1. Allez dans le dashboard Supabase
2. Functions → make-server-819c6d9b → Logs
3. Tous les logs console.log apparaîtront ici

## Réinitialiser complètement l'application

Si rien ne fonctionne:

```javascript
// Dans la console du navigateur
localStorage.clear();
sessionStorage.clear();
location.reload();
```

Puis reconnectez-vous avec vos identifiants.

## Contact de support

Si le problème persiste après avoir essayé toutes ces solutions:
1. Copiez les logs de la console (F12)
2. Copiez les logs du serveur Supabase
3. Notez les étapes exactes pour reproduire le problème
