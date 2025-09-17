import asyncio
import json
import os
from contextlib import asynccontextmanager

import asyncpg
import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Cargar variables de entorno
load_dotenv()


# --- Configuración de la Base de Datos y Ciclo de Vida de la App ---

# Variable global para el pool de conexiones
db_pool = None


async def create_db_pool():
    """Crea y retorna un pool de conexiones a PostgreSQL."""
    try:
        pool = await asyncpg.create_pool(
            host=os.getenv("DB_HOST"),
            port=os.getenv("DB_PORT", 5432),
            database=os.getenv("DB_NAME"),
            user=os.getenv("DB_USER"),
            password=os.getenv("DB_PASSWORD"),
            ssl="require" if os.getenv("DB_SSL", "true").lower() == "true" else None,
        )
        print("✅ Pool de conexiones a PostgreSQL creado exitosamente.")
        return pool
    except Exception as e:
        print(f"❌ Error al conectar con PostgreSQL: {e}")
        return None


async def create_location_table(pool):
    """Asegura que la tabla 'location_data' exista en la base de datos."""
    async with pool.acquire() as connection:
        await connection.execute(
            """
            CREATE TABLE IF NOT EXISTS location_data (
                id SERIAL PRIMARY KEY,
                latitude DECIMAL(10, 8) NOT NULL,
                longitude DECIMAL(11, 8) NOT NULL,
                timestamp_value BIGINT NOT NULL,
                accuracy DECIMAL(8, 2),
                altitude DECIMAL(8, 2),
                speed DECIMAL(8, 2),
                provider VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """
        )
        print("🔍 Tabla 'location_data' verificada/creada.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Gestiona el ciclo de vida de la aplicación.
    Se ejecuta al iniciar para crear el pool y la tabla,
    y al cerrar para terminar las conexiones.
    """
    global db_pool
    db_pool = await create_db_pool()
    if db_pool:
        await create_location_table(db_pool)
    # Inicia el servidor UDP en segundo plano
    loop = asyncio.get_event_loop()
    udp_server_task = loop.create_task(run_udp_server())
    yield
    # Limpieza al cerrar la app
    udp_server_task.cancel()
    if db_pool:
        await db_pool.close()
        print("🔌 Pool de conexiones cerrado.")


# --- Servidor UDP ---


class UDPServerProtocol(asyncio.DatagramProtocol):
    """Protocolo para manejar los mensajes UDP recibidos."""

    def connection_made(self, transport):
        self.transport = transport

    def datagram_received(self, data, addr):
        """Procesa un datagrama UDP entrante."""
        message = data.decode()
        print(f"UDP mensaje recibido de {addr}: {message}")
        # Lanza la tarea de inserción en BD sin bloquear el loop de eventos
        asyncio.create_task(self.insert_location_data(message))

    async def insert_location_data(self, message: str):
        """Parsea e inserta los datos de ubicación en la base de datos."""
        global db_pool
        if not db_pool:
            print("❌ Error: Pool de base de datos no disponible.")
            return

        try:
            data = json.loads(message)
            # MODIFICACIÓN CLAVE: Se insertan valores nulos para los campos que ya no llegan.
            query = """
                INSERT INTO location_data
                (latitude, longitude, timestamp_value, accuracy, altitude, speed, provider)
                VALUES ($1, $2, $3, NULL, NULL, NULL, NULL)
                RETURNING id;
            """
            values = (
                data.get("lat"),
                data.get("lon"),
                data.get("time"),
            )
            async with db_pool.acquire() as connection:
                result = await connection.fetchrow(query, *values)
                print(f"📍 Datos insertados con ID: {result['id']}")
        except json.JSONDecodeError:
            print(f"❌ Error: Mensaje UDP no es un JSON válido: {message}")
        except Exception as e:
            print(f"❌ Error procesando mensaje UDP: {e}")


async def run_udp_server():
    """Inicia y mantiene el servidor UDP."""
    loop = asyncio.get_event_loop()
    udp_port = int(os.getenv("UDP_PORT", 5001))
    print(f"🚀 Iniciando servidor UDP en el puerto {udp_port}...")
    transport, protocol = await loop.create_datagram_endpoint(
        UDPServerProtocol, local_addr=("0.0.0.0", udp_port)
    )
    print(f"✅ Servidor UDP escuchando en {transport.get_extra_info('sockname')}")
    try:
        # Mantiene el servidor corriendo indefinidamente
        await asyncio.Event().wait()
    finally:
        transport.close()


# --- API HTTP con FastAPI ---

app = FastAPI(lifespan=lifespan)

# Configuración de CORS para permitir peticiones del frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # O especifica los dominios de tu frontend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/location/latest")
async def get_latest_location():
    """Endpoint para obtener la última ubicación registrada."""
    global db_pool
    if not db_pool:
        raise HTTPException(
            status_code=503, detail="Servicio no disponible (sin conexión a BD)"
        )

    query = """
        SELECT latitude, longitude, timestamp_value, created_at
        FROM location_data
        ORDER BY id DESC
        LIMIT 1;
    """
    async with db_pool.acquire() as connection:
        result = await connection.fetchrow(query)

    if not result:
        raise HTTPException(status_code=404, detail="No hay datos disponibles")

    return dict(result)


@app.get("/api/location/all")
async def get_all_locations(limit: int = 100):
    """Endpoint para obtener todos los registros (con paginación)."""
    global db_pool
    if not db_pool:
        raise HTTPException(
            status_code=503, detail="Servicio no disponible (sin conexión a BD)"
        )
    query = "SELECT * FROM location_data ORDER BY id DESC LIMIT $1;"
    async with db_pool.acquire() as connection:
        results = await connection.fetch(query, limit)
    return [dict(row) for row in results]


@app.get("/api/health")
def health_check():
    """Endpoint de health check."""
    return {"status": "OK", "timestamp": asyncio.get_event_loop().time()}


# --- Punto de Entrada ---

if __name__ == "__main__":
    http_port = int(os.getenv("HTTP_PORT", 2000))
    uvicorn.run(app, host="0.0.0.0", port=http_port)