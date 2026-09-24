"""Obtiene un refresh_token de Google para subir videos a YouTube via API.

Corre UNA SOLA VEZ, de forma local: abre el navegador para iniciar sesion con
la cuenta/canal de YouTube de AiPetFriendly y autorizar el scope de subida de
videos. Al terminar, imprime los 3 valores que hay que cargar como secrets en
Supabase (YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN).

Requisitos previos:
  1. pip install google-auth-oauthlib
  2. Descargar el "client_secret.json" desde Google Cloud Console
     (APIs y servicios > Credenciales > tu OAuth 2.0 Client ID de tipo
     "Desktop app" > Descargar JSON) y ponerlo en esta misma carpeta
     (o pasar la ruta como argumento).

Uso:
  python get_token.py [ruta_al_client_secret.json]

IMPORTANTE: client_secret.json y el refresh_token son credenciales sensibles.
No los subas al repo (ya estan en .gitignore) ni los pegues en chats/tickets.
"""

import glob
import sys
from pathlib import Path

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]


def find_client_secret_path() -> str:
    if len(sys.argv) > 1:
        return sys.argv[1]

    script_dir = Path(__file__).resolve().parent
    candidates = sorted(glob.glob(str(script_dir / "client_secret*.json")))
    if not candidates:
        raise SystemExit(
            "No encontre ningun client_secret*.json en la carpeta del proyecto. "
            "Pasa la ruta como argumento: python get_token.py ruta\\al\\archivo.json"
        )
    return candidates[0]


def main() -> None:
    client_secret_path = find_client_secret_path()

    flow = InstalledAppFlow.from_client_secrets_file(client_secret_path, SCOPES)
    # access_type=offline + prompt=consent aseguran que Google devuelva un
    # refresh_token (si ya autorizaste antes sin esto, puede venir vacio).
    credentials = flow.run_local_server(port=0, access_type="offline", prompt="consent")

    print("\n--- Cargar estos valores como secrets en Supabase ---")
    print(f"YOUTUBE_CLIENT_ID={credentials.client_id}")
    print(f"YOUTUBE_CLIENT_SECRET={credentials.client_secret}")
    print(f"YOUTUBE_REFRESH_TOKEN={credentials.refresh_token}")


if __name__ == "__main__":
    main()
