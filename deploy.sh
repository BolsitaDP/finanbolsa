#!/usr/bin/env bash
# Despliegue en la Raspberry Pi.
#
#   ./deploy.sh              # despliega master
#   ./deploy.sh --wait 120   # espera hasta 120 s a que esté saludable
#
# Deliberadamente manual: nada en la Pi vigila GitHub ni redespliega solo, así
# que nada llega a producción hasta que lo ejecutas tú.
#
# Lo que este script hace y la versión anterior no:
#
#   1. **Espera a que la app esté Sana, no a que el contenedor exista.**
#      `docker compose up -d` devuelve en cuanto el contenedor se *crea*. Antes de
#      esto había que esperar un número arbitrario de segundos y rezar, y un
#      contenedor en bucle de reinicio se reportaba como despliegue exitoso.
#   2. **Falla con código de salida distinto de cero** si la app no levanta. Un
#      script de despliegue que dice "listo" y miente es peor que uno que no
#      existe, sobre todo si algo lo encadena.
#   3. **Dice qué hacer cuando falla**: los logs, y el comando de rollback.
#   4. **Imprime la URL** al terminar, que es lo único que falta para abrirla.
set -euo pipefail

cd "$(dirname "$0")"

WAIT_SECONDS=90
if [ "${1:-}" = "--wait" ]; then
  WAIT_SECONDS="${2:-90}"
fi

# --- Preflight --------------------------------------------------------------
# Todo lo que se puede comprobar antes de reemplazar un contenedor que funciona.
# Fallar aquí es barato; fallar después deja la app caída en la Pi.

if [ ! -f .env ]; then
  echo "✗ No existe .env" >&2
  echo "  Genera uno con:  npm run env:init" >&2
  exit 1
fi

# `docker compose config` es la única forma de saber si las variables obligatorias
# están puestas sin arrancar nada: devuelve error de interpolación si no lo están.
if ! docker compose config --quiet 2>/tmp/deploy-config.err; then
  echo "✗ .env incompleto:" >&2
  cat /tmp/deploy-config.err >&2
  echo "  Regenera con:  npm run env:init -- --force" >&2
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "✗ El árbol de trabajo tiene cambios sin commitear." >&2
  echo "  En la Pi se despliega master, no tu copia local. Commitea o haz stash." >&2
  exit 1
fi

CURRENT="$(git rev-parse --short HEAD)"

# --- Despliegue -------------------------------------------------------------

git checkout master
git pull --ff-only origin master

# La etiqueta es lo que hace posible el rollback: `docker compose up --build`
# reutiliza la caché de capas y el nombre de la imagen es siempre
# `finanbolsa-web`, así que sin esto no habría a qué volver. Se etiqueta ANTES
# de reconstruir, mientras la imagen anterior todavía existe.
docker compose images >/dev/null 2>&1 || true
if docker image inspect finanbolsa-web >/dev/null 2>&1; then
  docker tag finanbolsa-web "finanbolsa-web:prev" 2>/dev/null || true
fi

echo "▸ Construyendo y arrancando…"
docker compose up -d --build

# --- Espera de salud -------------------------------------------------------

echo "▸ Esperando a que esté saludable (máx ${WAIT_SECONDS}s)…"
for i in $(seq 1 "$WAIT_SECONDS"); do
  STATUS="$(docker inspect --format '{{.State.Health.Status}}' finanbolsa-web-1 2>/dev/null || echo starting)"
  case "$STATUS" in
    healthy)
      PORT="$(docker compose port web 3000 2>/dev/null | sed 's/.*://' || echo 3000)"
      IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
      echo ""
      echo "✓ Desplegado y saludable — $(git rev-parse --short HEAD)"
      echo "  http://${IP:-<ip-de-la-pi>}:${PORT:-3000}"
      [ "${FINANBOLSA_HTTPS:-false}" = "true" ] && echo "  (con HTTPS: usa el dominio, no la IP)"
      echo "  Backups diarios: data/backups/ (retención 14 días)"
      exit 0
      ;;
    unhealthy)
      echo ""
      echo "✗ El contenedor está UNHEALTHY. Últimas líneas del log:" >&2
      docker compose logs --tail=30 web >&2
      echo "" >&2
      echo "  Rollback:  docker compose down && git checkout -" >&2
      echo "             (esto es exactamente lo que se reverses, que aún no se ha perdido)" >&2
      exit 1
      ;;
  esac
  sleep 1
done

echo ""
echo "✗ La app norespondió saludable en ${WAIT_SECONDS}s. Últimas líneas del log:" >&2
docker compose logs --tail=30 web >&2
echo "" >&2
echo "  Sigue vivo?  curl -I http://localhost:3000/login" >&2
echo "  Rollback:    docker compose down && git checkout -" >&2
exit 1
