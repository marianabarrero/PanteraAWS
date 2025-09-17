import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L, { Icon } from 'leaflet';
import { ThreeDot } from 'react-loading-indicators';

// --- Configuración Básica (simplificada) ---
const config = {
  API_BASE_URL: import.meta.env.VITE_API_URL || 'http://localhost:2000',

  APP_NAME: 'Pantera GPS',
  APP_SUBTITLE: 'The best GPS tracker app',
  APP_NAME: 'RogerGPS',
  APP_SUBTITLE: 'THE BEST',

  POLLING_INTERVAL: import.meta.env.VITE_POLLING_INTERVAL || 5000,
  // Se eliminaron JAWG_ACCESS_TOKEN y JAWG_MAP_ID
};

// Arreglo para el ícono por defecto de Leaflet en Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});


// --- Componentes de UI ---

const LoadingSpinner = () => (
  <div className="flex items-center mx-auto justify-center p-8">
    <ThreeDot color="#FFFFFF" size="medium" text="" textColor="" />
  </div>
);

const ErrorMessage = ({ error, onRetry }) => (
  <div className="glassmorphism-strong mt-40 md:-mt-60 rounded-4xl min-w-[90%] mx-auto p-8 text-center">
    <div className="text-red-400 mb-4">
      <svg className="w-12 h-12 mx-auto mb-2" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      <h3 className="text-xl font-bold">Error de Conexión</h3>
    </div>
    <p className="text-white/70 mb-4">{error}</p>
    <button onClick={onRetry} className="px-4 py-2 bg-violet-600 text-white rounded-lg transition-colors">
      Reintentar
    </button>
  </div>
);

const LocationInfo = ({ location, formatTimestamp }) => (
  <div className='max-w-[100%] p-8'>
    <h2 className='text-2xl font-bold text-white text-center rounded-4xl mb-8'>Última Ubicación</h2>

    <div className='flex flex-row justify-between gap-4 glassmorphism group rounded-xl mb-3 pl-2 pr-6 py-2'>
      <div className='flex flex-row gap-2 justify-left transition-all duration-300'>
        <h3 className='text-l text-white rounded-xl inline-block'>Latitud:</h3>
      </div>
      <div className="flex flex-col items-end">
        <span className='text-white/80 font-mono'>{parseFloat(location.latitude).toFixed(8)}</span>
      </div>
    </div>

    <div className='flex flex-row justify-between gap-4 glassmorphism group rounded-xl mb-3 pl-2 pr-6 py-2'>
      <div className='flex flex-row gap-2 justify-left transition-all duration-300'>
        <h3 className='text-l text-white rounded-xl inline-block'>Longitud:</h3>
      </div>
      <div className="flex flex-col items-end">
        <span className='text-white/80 font-mono'>{parseFloat(location.longitude).toFixed(8)}</span>
      </div>
    </div>

    <div className='flex flex-row justify-between gap-4 glassmorphism group rounded-xl mb-3 pl-2 pr-6 py-2'>
      <div className='flex flex-row gap-2 group justify-left transition-all duration-300'>
        <h3 className='text-l text-white rounded-xl inline-block'>Timestamp:</h3>
      </div>
      <div className="flex flex-col items-end">
        <span className='text-white/80 font-mono'>{location.timestamp_value}</span>
        <span className='text-white/50 text-sm'>{formatTimestamp(location.timestamp_value)}</span>
      </div>
    </div>
  </div>
);

// --- Componente que actualiza la vista del mapa ---
const MapUpdater = ({ position }) => {
  const map = useMap();
  useEffect(() => {
    map.flyTo(position, map.getZoom(), {
      duration: 1.5,
      easeLinearity: 0.25
    });
  }, [position, map]);
  return null;
};

// --- Componente del Mapa ---
const LocationMap = ({ location, formatTimestamp, path }) => {
  const position = [parseFloat(location.latitude), parseFloat(location.longitude)];

  const customIcon = new Icon({
    iconUrl: "/icon.png",
    iconSize: [70, 70]
  });

  // Estilo para la línea de la trayectoria
  const polylineOptions = { color: '#8B5CF6', weight: 4 };

  return (
    <div className='glassmorphism-strong rounded-4xl backdrop-blur-lg shadow-lg p-4 max-w-4xl w-full mx-4'>
      <MapContainer
        center={position}
        zoom={18}
        style={{ height: '35rem', width: '100%', borderRadius: '1rem' }}
      >
        {/* === CAMBIO CLAVE AQUÍ === */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <Marker position={position} icon={customIcon}>
          <Popup>
            <div className="text-center">
              <strong>Ubicación actual</strong><br />
              <small>Recibida: {formatTimestamp(location.timestamp_value)}</small><br />
              <small>Lat: {parseFloat(location.latitude).toFixed(6)}</small><br />
              <small>Lng: {parseFloat(location.longitude).toFixed(6)}</small>
            </div>
          </Popup>
        </Marker>

        {/* Componente que dibuja la trayectoria */}
        <Polyline pathOptions={polylineOptions} positions={path} />

        <MapUpdater position={position} />
      </MapContainer>
    </div>
  );
};

// --- Componente Principal ---
function App() {
  const [locationData, setLocationData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [path, setPath] = useState([]);

  const fetchLatestLocation = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/api/location/latest`);

      if (!response.ok) {
        if (response.status === 404) {
          setError('No hay datos de ubicación disponibles');
          setLocationData(null);
        } else {
          throw new Error('Error al obtener datos');
        }
      } else {
        const data = await response.json();
        setLocationData(data);

        const newPosition = [parseFloat(data.latitude), parseFloat(data.longitude)];
        setPath(prevPath => {
          const lastPoint = prevPath[prevPath.length - 1];
          if (!lastPoint || lastPoint[0] !== newPosition[0] || lastPoint[1] !== newPosition[1]) {
            return [...prevPath, newPosition];
          }
          return prevPath;
        });

        setError(null);
        setLastUpdate(new Date());
      }
    } catch (err) {
      setError('Error de conexión con el servidor');
      console.error('Error fetching location:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLatestLocation();
    const interval = setInterval(fetchLatestLocation, config.POLLING_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const formatTimestamp = (timestamp) => {
    const date = new Date(parseInt(timestamp));
    return date.toLocaleString('es-ES', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      timeZoneName: 'short'
    });
  };

  const formatCoordinate = (coord, type) => {
    const absolute = Math.abs(parseFloat(coord));
    const degrees = Math.floor(absolute);
    const minutes = (absolute - degrees) * 60;
    const direction = type === 'latitude' ? (coord >= 0 ? 'N' : 'S') : (coord >= 0 ? 'E' : 'O');
    return `${degrees}° ${minutes.toFixed(4)}' ${direction}`;
  };

  return (
    <div className="min-h-screen transition-all duration-500 dark">
      <div className="fixed inset-0 -z-10 transition-all duration-500">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800"></div>
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-10 w-72 h-72 md:w-96 md:h-96 bg-gray-500 rounded-full filter blur-3xl opacity-40 animate-float"></div>
          <div className="absolute bottom-20 right-10 w-64 h-64 md:w-80 md:h-80 bg-gray-400 rounded-full filter blur-3xl opacity-30 animate-float"></div>
          <div className="absolute top-1/2 left-1/2 w-48 h-48 md:w-64 md:h-64 bg-gray-500 rounded-full filter blur-3xl opacity-20 animate-float"></div>
        </div>
      </div>

      <header className="fixed top-4 left-1/2 -translate-x-1/2 z-50 min-w-[80%] md:min-w-[90%] py-3 px-4 rounded-4xl">
        <div className="flex flex-col items-center gap-2">
          <h1 className="py-1 px-3 text-center font-bold text-white/80 text-4xl">
            {config.APP_NAME}
          </h1>
          <p className="text-white/60 text-sm">{config.APP_SUBTITLE}</p>
        </div>
      </header>

      <main className='flex flex-row md:flex-row items-center mt-32 md:mt-12 justify-between gap-2 max-w-[90%] mx-auto min-h-screen'>
        {loading ? (
          <LoadingSpinner />
        ) : error ? (
          <ErrorMessage error={error} onRetry={fetchLatestLocation} />
        ) : locationData ? (
          <>
            <LocationMap location={locationData} formatTimestamp={formatTimestamp} path={path} />
            <LocationInfo location={locationData} formatCoordinate={formatCoordinate} formatTimestamp={formatTimestamp} />

          </>
        ) : (
          <div className="glassmorphism-strong min-w-[90%] mx-auto rounded-4xl p-8 text-center">
            <p className="text-white/70 mb-4">Esperando datos de ubicación...</p>
            <p className="text-white/50 text-sm mb-4">Conectando via Polling...</p>
            <button
              onClick={fetchLatestLocation}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg transition-colors"
            >
              Refrescar
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;