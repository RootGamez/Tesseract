# Despliegue en producción (VPS + Nginx Proxy Manager)

Este stack levanta **backend** (Django/Daphne + Celery), **frontend** (SPA
estático con Caddy) e **infraestructura** (PostgreSQL, Redis, MinIO/S3) con
Docker Compose. El reverse proxy y el TLS los gestiona **Nginx Proxy Manager
(NPM)**, que ya corre en tu VPS — este repo **no** incluye nginx ni certbot.

El backend va en el **mismo dominio** que el frontend (sin subdominio), bajo las
rutas `/api`, `/ws`, `/admin`, `/static`. MinIO se expone en `s3.<tu-dominio>`.

---

## 1. DNS

Apunta al VPS:

| Registro | Tipo | Valor    |
|----------|------|----------|
| `tu-dominio.com`     | A | IP del VPS |
| `www.tu-dominio.com` | A | IP del VPS |
| `s3.tu-dominio.com`  | A | IP del VPS |

## 2. Variables de entorno

```bash
cp .env.prod.example .env.prod
# Edita .env.prod: dominio real, SECRET_KEY, contraseñas de DB y MinIO, etc.
```

`.env.prod` está en `.gitignore`; **nunca** se comitea.

## 3. Red compartida con NPM

Para que NPM enrute a los contenedores por nombre, deben compartir una red docker:

```bash
docker network create npm_proxy        # si no existe ya
```

Si tu NPM ya usa una red, pon su nombre en `PROXY_NETWORK` dentro de `.env.prod`
y conecta el contenedor de NPM a `npm_proxy` (o viceversa).

## 4. Arranque

```bash
docker compose --env-file .env.prod up -d --build
```

Esto aplica migraciones, recolecta estáticos (WhiteNoise) y arranca todo. Los
servicios `frontend`, `web` y `minio` quedan en la red `npm_proxy`.

## 5. Configurar NPM

### Proxy Host principal — `tu-dominio.com`
- **Domain Names:** `tu-dominio.com`, `www.tu-dominio.com`
- **Forward Hostname / Port:** `frontend` / `80`
- **Websockets Support:** ON
- **SSL:** solicita el certificado Let's Encrypt + *Force SSL* + HTTP/2.
- Pestaña **Advanced** → pega estas locations (envían backend y WS al servicio `web`):

```nginx
client_max_body_size 100M;

location /api/    { proxy_pass http://web:8000; }
location /admin/  { proxy_pass http://web:8000; }
location /static/ { proxy_pass http://web:8000; }
location /health/ { proxy_pass http://web:8000; }

location /ws/ {
    proxy_pass http://web:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 86400s;
}
```

> NPM ya añade `Host`, `X-Forwarded-For` y `X-Forwarded-Proto`; Django los usa
> (vía `SECURE_PROXY_SSL_HEADER`) para saber que la petición original fue HTTPS.

### Proxy Host de almacenamiento — `s3.tu-dominio.com`
- **Domain Names:** `s3.tu-dominio.com`
- **Forward Hostname / Port:** `minio` / `9000`
- **SSL:** certificado Let's Encrypt + Force SSL.
- Pestaña **Advanced:**

```nginx
client_max_body_size 200M;
proxy_set_header Host $host;   # MinIO valida la firma S3 contra el Host
```

El navegador descarga las imágenes presignadas de la pizarra desde este host;
`MINIO_PUBLIC_URL=https://s3.tu-dominio.com` en `.env.prod` debe coincidir.

## 6. Verificación

```bash
docker compose --env-file .env.prod ps
curl -I https://tu-dominio.com/                 # SPA
curl -I https://tu-dominio.com/api/v1/          # backend
curl    https://tu-dominio.com/health/          # health check
```

## Operación

```bash
# Logs
docker compose --env-file .env.prod logs -f web

# Crear superusuario
docker compose --env-file .env.prod exec web python manage.py createsuperuser

# Redeploy tras cambios de código
git pull && docker compose --env-file .env.prod up -d --build
```

> Si cambias `VITE_API_URL` / `VITE_WS_URL` debes **reconstruir** el frontend
> (`--build`): esas URLs se hornean en el bundle en tiempo de build.
